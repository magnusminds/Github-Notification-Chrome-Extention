/**
 * popup.js — toolbar-icon popup
 *
 * Renders the same notification list as the in-page hover popover (shared markup
 * from ghn-ui.js, shared styling from content.css). Talks to background.js with
 * the same message protocol the content script uses, so it works in both API
 * mode and session mode without caring which is active.
 */

const U = globalThis.GHN_UI;

const bodyEl = document.getElementById('ghn-body');
const participatingEl = document.getElementById('ghn-participating');
const refreshBtn = document.getElementById('ghn-refresh-btn');
const markAllBtn = document.getElementById('ghn-mark-all-btn');

let cached = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (res) => {
      if (chrome.runtime.lastError) return resolve(null);
      resolve(res);
    });
  });
}

function setLoading(msg) {
  bodyEl.innerHTML = U.loadingMarkup(msg);
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function render(notifications) {
  cached = notifications;

  if (!notifications.length) {
    bodyEl.innerHTML = U.emptyMarkup();
    return;
  }

  bodyEl.innerHTML = '';
  notifications.forEach((n) => {
    const item = document.createElement('div');
    item.className = 'ghn-item';
    item.dataset.threadId = n.id;
    item.innerHTML = U.itemMarkup(n);
    wireItem(item, n.id);
    bodyEl.appendChild(item);
  });
}

function dropItem(itemEl, id) {
  cached = cached.filter((n) => n.id !== id);
  itemEl.style.opacity = '0';
  itemEl.style.transform = 'translateX(8px)';
  setTimeout(() => {
    itemEl.remove();
    if (!cached.length) render([]);
  }, 180);
}

function wireItem(itemEl, id) {
  // Clicking the row opens the thread (target=_blank) and marks it read.
  itemEl.querySelector('.ghn-item-main').addEventListener('click', () => {
    send({ type: 'MARK_READ', threadId: id });
    dropItem(itemEl, id);
  });

  itemEl.querySelector('.ghn-read-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const res = await send({ type: 'MARK_READ', threadId: id });
    if (res?.success) dropItem(itemEl, id);
  });

  itemEl.querySelector('.ghn-unsub-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const btn = e.currentTarget;
    btn.disabled = true;
    const res = await send({ type: 'UNSUBSCRIBE', threadId: id });
    if (res?.success) dropItem(itemEl, id);
    else btn.disabled = false;
  });
}

// ─── Data flow ──────────────────────────────────────────────────────────────

async function load() {
  const result = await send({ type: 'GET_NOTIFICATIONS' });
  render(result?.notifications ?? []);
}

async function refresh() {
  setLoading('Refreshing…');
  await send({ type: 'REFRESH' });
  await load();
}

// ─── Header actions ───────────────────────────────────────────────────────────

refreshBtn.innerHTML = U.ICON_REFRESH;
markAllBtn.innerHTML = U.ICON_CHECK_CIRCLE;

refreshBtn.addEventListener('click', refresh);

markAllBtn.addEventListener('click', async () => {
  const res = await send({ type: 'MARK_ALL_READ' });
  if (res?.success) render([]);
});

participatingEl.addEventListener('change', () => {
  chrome.storage.sync.set({ participatingOnly: participatingEl.checked }, refresh);
});

// ─── Init ─────────────────────────────────────────────────────────────────────

chrome.storage.sync.get({ participatingOnly: false }, ({ participatingOnly }) => {
  participatingEl.checked = participatingOnly;
});

// Show cached data instantly, then pull a fresh copy in the background.
load().then(refresh);
