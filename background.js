/**
 * background.js — Service Worker
 *
 * Two ways to read your notifications:
 *
 *   1. API mode    — a Personal Access Token is saved. Calls the GitHub REST
 *                    API (fast, structured, supports the participating filter).
 *   2. Session mode — no token saved. Fetches https://github.com/notifications
 *                    using your existing logged-in cookies, then parses the HTML
 *                    in an offscreen document. No token required.
 *
 * Responsibilities:
 *  - Poll for notifications every 60 seconds (whichever mode applies)
 *  - Cache results in chrome.storage.local
 *  - Update the extension action badge count
 *  - Handle message requests from content scripts (mark read, unsubscribe, …)
 */

const API_BASE = 'https://api.github.com';
const PAGE_URL = 'https://github.com/notifications?query=is%3Aunread';
const POLL_ALARM = 'ghn-poll';

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function getSettings() {
  return chrome.storage.sync.get({
    token: '',
    participatingOnly: false,
    desktopNotifications: false,
  });
}

async function getCachedNotifications() {
  const { notifications = [] } = await chrome.storage.local.get('notifications');
  return notifications;
}

function findCached(notifications, id) {
  return notifications.find((n) => n.id === id || n._html_url === id);
}

// ─── Offscreen document (HTML parsing) ─────────────────────────────────────────

async function ensureOffscreen() {
  try {
    if (chrome.offscreen.hasDocument && (await chrome.offscreen.hasDocument())) return;
  } catch {
    /* hasDocument unsupported on this Chrome — fall through to create */
  }
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Parse the GitHub notifications page HTML to list notifications without a token.',
    });
  } catch (e) {
    // Racing creates throw "Only a single offscreen document may be created" — harmless.
    if (!String(e?.message || e).includes('single offscreen')) {
      console.error('[GHN] offscreen create failed', e);
    }
  }
}

async function parseHtmlInOffscreen(html) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: 'offscreen', type: 'PARSE_NOTIFICATIONS', html });
}

// ─── API mode (token) ───────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const { token } = await getSettings();
  if (!token) return null;

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok && response.status !== 204 && response.status !== 205) {
    console.error(`[GHN] API error ${response.status} for ${path}`);
    return null;
  }

  if (response.status === 204 || response.status === 205) return { ok: true };

  const text = await response.text();
  return text ? JSON.parse(text) : { ok: true };
}

// ─── Session mode (no token, scrape the page) ───────────────────────────────────

async function fetchNotificationsFromPage() {
  let html;
  try {
    const res = await fetch(PAGE_URL, {
      credentials: 'include',
      headers: { Accept: 'text/html' },
    });
    if (!res.ok) {
      console.error(`[GHN] notifications page returned ${res.status}`);
      return null;
    }
    html = await res.text();
  } catch (e) {
    console.error('[GHN] failed to fetch notifications page', e);
    return null;
  }

  const parsed = await parseHtmlInOffscreen(html);
  if (!parsed) return null;
  if (!parsed.loggedIn) {
    console.warn('[GHN] Not signed in to github.com — open github.com and log in, or set a token in Options.');
    return null;
  }
  return parsed.notifications;
}

/**
 * Replay one of the page's own forms (with its real authenticity_token) to
 * perform an action in session mode. Returns truthy on success.
 */
async function replayForm(form) {
  if (!form || !form.action) return null;
  const action = form.action.startsWith('http') ? form.action : 'https://github.com' + form.action;
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(form.inputs || {})) body.append(k, v);

  try {
    const res = await fetch(action, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'manual', // GitHub answers form posts with a 302 we don't need to follow
    });
    // opaqueredirect (manual 302) reports status 0 with type 'opaqueredirect' — treat as success.
    return res.ok || res.status === 0 || res.status === 302;
  } catch (e) {
    console.error('[GHN] form replay failed', e);
    return null;
  }
}

// ─── Unified data layer (auto-selects mode) ─────────────────────────────────────

async function fetchNotifications() {
  const { token, participatingOnly } = await getSettings();
  if (token) {
    return apiFetch(`/notifications?participating=${participatingOnly}&per_page=50`);
  }
  // Session mode: the page query already filters to unread.
  return fetchNotificationsFromPage();
}

async function markThreadRead(threadId, cached) {
  const { token } = await getSettings();
  if (token) return apiFetch(`/notifications/threads/${threadId}`, { method: 'PATCH' });

  const n = findCached(cached, threadId);
  const form = n?._forms?.find((f) => f.purpose === 'read');
  if (!form) {
    console.warn('[GHN] No "mark as read" form found for this notification (session mode).');
    return null;
  }
  return replayForm(form);
}

async function unsubscribeThread(threadId, cached) {
  const { token } = await getSettings();
  if (token) {
    const result = await apiFetch(`/notifications/threads/${threadId}/subscription`, {
      method: 'DELETE',
    });
    if (result) await markThreadRead(threadId, cached);
    return result;
  }

  const n = findCached(cached, threadId);
  const form = n?._forms?.find((f) => f.purpose === 'unsubscribe');
  if (!form) {
    console.warn('[GHN] No "unsubscribe" form found for this notification (session mode).');
    return null;
  }
  return replayForm(form);
}

async function markAllRead() {
  const { token } = await getSettings();
  if (token) {
    return apiFetch('/notifications', {
      method: 'PUT',
      body: JSON.stringify({ read: true }),
    });
  }
  // Session mode: there is no single reliable "mark all" form to replay, so mark
  // each cached thread individually using its own form.
  const cached = await getCachedNotifications();
  const results = await Promise.all(cached.map((n) => markThreadRead(n.id, cached)));
  return results.some(Boolean) ? { ok: true } : null;
}

// ─── Desktop notifications ──────────────────────────────────────────────────

/** Resolve a notification to its github.com web URL (used as the click target). */
function htmlUrlFor(n) {
  if (n._html_url) return n._html_url;
  const apiUrl = n.subject?.url || '';
  if (!apiUrl) return `https://github.com/${n.repository.full_name}`;
  return apiUrl
    .replace('https://api.github.com/repos/', 'https://github.com/')
    .replace(/\/pulls\/(\d+)$/, '/pull/$1')
    .replace(/\/issues\/(\d+)$/, '/issues/$1')
    .replace(/\/commits\/([a-f0-9]+)$/, '/commit/$1');
}

function showDesktopNotification(id, title, message) {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title,
    message: message || 'New notification',
    priority: 0,
  });
}

/**
 * Fire a desktop notification for genuinely new threads (ones whose id we hadn't
 * seen on the previous poll). The very first poll only establishes the baseline
 * so we never spam the whole inbox. The notification id is the click-through URL.
 */
async function maybeNotify(current) {
  const { desktopNotifications } = await getSettings();
  const { seenIds } = await chrome.storage.local.get('seenIds');
  const currentIds = current.map((n) => n.id);

  // No baseline yet (fresh install / cleared storage) → record and stay quiet.
  if (!Array.isArray(seenIds)) {
    await chrome.storage.local.set({ seenIds: currentIds });
    return;
  }

  if (desktopNotifications) {
    const seen = new Set(seenIds);
    const fresh = current.filter((n) => !seen.has(n.id));

    if (fresh.length === 1) {
      const n = fresh[0];
      showDesktopNotification(htmlUrlFor(n), n.repository.full_name, n.subject.title);
    } else if (fresh.length > 1) {
      // Collapse a burst into one summary so we don't flood the OS tray.
      showDesktopNotification(
        'https://github.com/notifications',
        'GitHub Notifier',
        `${fresh.length} new notifications`,
      );
    }
  }

  // Always advance the baseline so toggling the setting on doesn't replay a backlog.
  await chrome.storage.local.set({ seenIds: currentIds });
}

// ─── Badge management ─────────────────────────────────────────────────────────

async function updateBadge(count) {
  const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: '#e11d48' });
}

// ─── Polling ──────────────────────────────────────────────────────────────────

async function poll() {
  const notifications = await fetchNotifications();
  if (notifications === null) return; // not authenticated / fetch error

  await maybeNotify(notifications);
  await chrome.storage.local.set({ notifications, lastUpdated: Date.now() });
  await updateBadge(notifications.length);

  // Push count update to all open GitHub tabs
  const tabs = await chrome.tabs.query({ url: 'https://github.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'NOTIFICATIONS_UPDATED',
      count: notifications.length,
    }).catch(() => {/* tab may not have content script yet */});
  }
}

// ─── Message handler ──────────────────────────────────────────────────────────

async function removeFromCacheAndRespond(threadId, sendResponse) {
  const all = await getCachedNotifications();
  const updated = all.filter((n) => n.id !== threadId);
  await chrome.storage.local.set({ notifications: updated });
  await updateBadge(updated.length);
  sendResponse({ success: true, notifications: updated });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'GET_NOTIFICATIONS':
      chrome.storage.local
        .get({ notifications: [], lastUpdated: null })
        .then(sendResponse);
      return true;

    case 'REFRESH':
      poll().then(() => sendResponse({ success: true }));
      return true;

    case 'MARK_READ':
      (async () => {
        const cached = await getCachedNotifications();
        const result = await markThreadRead(message.threadId, cached);
        if (!result) return sendResponse({ success: false });
        await removeFromCacheAndRespond(message.threadId, sendResponse);
      })();
      return true;

    case 'UNSUBSCRIBE':
      (async () => {
        const cached = await getCachedNotifications();
        const result = await unsubscribeThread(message.threadId, cached);
        if (!result) return sendResponse({ success: false });
        await removeFromCacheAndRespond(message.threadId, sendResponse);
      })();
      return true;

    case 'MARK_ALL_READ':
      markAllRead().then(async (result) => {
        if (!result) return sendResponse({ success: false });
        await chrome.storage.local.set({ notifications: [] });
        await updateBadge(0);
        sendResponse({ success: true, notifications: [] });
      });
      return true;
  }
});

// ─── Desktop notification clicks ────────────────────────────────────────────

// The notification id IS the click-through URL (see showDesktopNotification).
chrome.notifications.onClicked.addListener((notificationId) => {
  if (/^https?:\/\//.test(notificationId)) {
    chrome.tabs.create({ url: notificationId });
  }
  chrome.notifications.clear(notificationId);
});

// ─── Alarms ───────────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) poll();
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 1 });
  poll();
});

chrome.runtime.onStartup.addListener(() => {
  poll();
});
