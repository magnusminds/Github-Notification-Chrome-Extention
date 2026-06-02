/**
 * offscreen.js — HTML parser (runs in an offscreen document)
 *
 * MV3 service workers have no DOM / DOMParser. This document receives the raw
 * HTML of https://github.com/notifications from background.js, parses it, and
 * returns a structured notification list shaped to match the GitHub REST API
 * objects the rest of the extension already understands:
 *
 *   { id, repository: { full_name }, subject: { title, type, url }, reason,
 *     updated_at, _html_url, _forms }
 *
 * The parser is intentionally href-driven: repo, type and URL are derived from
 * each notification's own link, so it survives GitHub's frequent CSS/class
 * renames. Class-name selectors are only used as best-effort extras (time,
 * thread id, action forms).
 */

// Notification subject links look like /owner/repo/<kind>/<number-or-sha>
const SUBJECT_RE = /^\/([^/]+)\/([^/]+)\/(issues|pull|discussions|commit|releases|security)\//;

const TYPE_MAP = {
  issues: 'Issue',
  pull: 'PullRequest',
  discussions: 'Discussion',
  commit: 'Commit',
  releases: 'Release',
  security: 'Issue',
};

function isLoggedIn(doc) {
  // When signed out, GitHub serves a marketing/login page with a /session form
  // and no user-login meta tag.
  if (doc.querySelector('meta[name="user-login"][content]')) {
    const login = doc.querySelector('meta[name="user-login"]').getAttribute('content');
    if (login) return true;
  }
  if (doc.querySelector('form[action="/session"]')) return false;
  // Fall back to: do we see anything that looks like the notifications inbox?
  return !!doc.querySelector('a[href^="/notifications"]');
}

/** Best-effort reason extraction (the small "why" label on each row). */
function extractReason(container) {
  if (!container) return '';
  const el = container.querySelector('[data-reason], .reason, [aria-label*="eason"]');
  const raw =
    el?.getAttribute('data-reason') ||
    el?.getAttribute('aria-label') ||
    el?.textContent ||
    '';
  return raw.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 40);
}

/** Best-effort thread id (used so the existing UI keys stay stable). */
function extractThreadId(container) {
  if (!container) return null;
  const byData =
    container.getAttribute('data-notification-id') ||
    container.querySelector('[data-notification-id]')?.getAttribute('data-notification-id');
  if (byData) return byData;

  // Or pull it out of a thread form action: /notifications/threads/<id>...
  const form = container.querySelector('form[action*="/notifications/threads/"]');
  const m = form?.getAttribute('action')?.match(/\/notifications\/threads\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * Collect the row's own action forms so background.js can replay them with the
 * page's real authenticity_token instead of guessing GitHub's private API.
 */
function extractForms(container) {
  if (!container) return [];
  const forms = [];
  container.querySelectorAll('form[action]').forEach((f) => {
    const action = f.getAttribute('action') || '';
    const inputs = {};
    f.querySelectorAll('input[name]').forEach((i) => {
      inputs[i.getAttribute('name')] = i.getAttribute('value') ?? '';
    });
    const method = (inputs._method || f.getAttribute('method') || 'POST').toUpperCase();

    const btn = f.querySelector('button, input[type="submit"]');
    const label = (
      (btn?.getAttribute('aria-label') || btn?.textContent || '') +
      ' ' +
      action
    ).toLowerCase();

    let purpose = null;
    if (/unsubscribe|unwatch|subscription|mute/.test(label)) purpose = 'unsubscribe';
    else if (/read|done|archive|mark/.test(label)) purpose = 'read';

    forms.push({ action, method, inputs, purpose });
  });
  return forms;
}

function parseNotifications(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const loggedIn = isLoggedIn(doc);

  const seen = new Map();

  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = (a.getAttribute('href') || '').split('#')[0];
    const m = href.match(SUBJECT_RE);
    if (!m) return;

    const title = (a.textContent || '').trim().replace(/\s+/g, ' ');
    if (!title) return; // skip icon-only / empty anchors
    if (seen.has(href)) return; // dedupe rows that link the subject more than once

    const [, owner, repo, kind] = m;
    const container =
      a.closest('li, .notifications-list-item, .Box-row, [role="listitem"]') ||
      a.parentElement;

    const relTime = container?.querySelector('relative-time, time-ago, time');
    const updatedAt = relTime?.getAttribute('datetime') || null;

    const threadId = extractThreadId(container);
    const htmlUrl = 'https://github.com' + href;

    seen.set(href, {
      id: threadId || href, // synthetic id when GitHub doesn't expose one
      repository: { full_name: `${owner}/${repo}` },
      subject: {
        title,
        type: TYPE_MAP[kind] || 'Issue',
        url: htmlUrl, // already an html URL; content.js handles it fine
      },
      reason: extractReason(container),
      updated_at: updatedAt,
      _html_url: htmlUrl,
      _forms: extractForms(container),
    });
  });

  return { loggedIn, notifications: Array.from(seen.values()) };
}

// ─── Message bridge ────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return; // not for us — let other listeners handle it
  if (msg.type === 'PARSE_NOTIFICATIONS') {
    try {
      sendResponse(parseNotifications(msg.html || ''));
    } catch (e) {
      console.error('[GHN] parse error', e);
      sendResponse({ loggedIn: false, notifications: [], error: String(e) });
    }
    return; // response sent synchronously
  }
});
