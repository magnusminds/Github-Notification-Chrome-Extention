/**
 * ghn-ui.js — shared notification UI helpers
 *
 * Stateless rendering pieces used by BOTH:
 *   - content.js (the hover popover injected into github.com), and
 *   - popup.js   (the toolbar-icon popup).
 *
 * Loaded as a plain script (no modules) and exposed on globalThis.GHN_UI so it
 * works in a content script's isolated world and in an extension page alike.
 * Keeping the markup + icons here means the two surfaces never drift apart.
 */
(function () {
  'use strict';

  // ─── SVG icons ────────────────────────────────────────────────────────────

  const ICON_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>`;

  const ICON_MUTE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="14" height="14"><path d="M8 1.5A6.5 6.5 0 1 0 14.5 8 6.508 6.508 0 0 0 8 1.5ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm9.03-3.53 3 3a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 0 1-1.06-1.06l1.72-1.72H4.5a.75.75 0 0 1 0-1.5h5.19L7.97 5.53a.75.75 0 0 1 1.06-1.06Z"/></svg>`;

  const ICON_CHECK_CIRCLE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="15" height="15"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm10.28-1.72-4.5 4.5a.75.75 0 0 1-1.06 0l-2-2a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018l1.47 1.47 3.97-3.97a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"/></svg>`;

  const ICON_REFRESH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="15" height="15"><path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z"/></svg>`;

  const ICON_BELL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path d="M12 1a7 7 0 0 1 7 7v1.709c0 .216.065.427.187.606l2.562 3.844A1.75 1.75 0 0 1 20.28 17H3.72a1.75 1.75 0 0 1-1.469-2.841l2.563-3.844A1.75 1.75 0 0 0 5 9.709V8a7 7 0 0 1 7-7Zm0 19a3 3 0 0 0 2.83-2H9.17A3 3 0 0 0 12 20Z"/></svg>`;

  const ICON_SPINNER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" class="ghn-spin"><path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5.75.75 0 0 1 1.5 0 8 8 0 1 1-8-8 .75.75 0 0 1 0 1.5Z"/></svg>`;

  function getSubjectIcon(type) {
    switch (type) {
      case 'PullRequest':
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" class="ghn-type-icon ghn-icon-pr">
          <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/>
        </svg>`;
      case 'Release':
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" class="ghn-type-icon ghn-icon-release">
          <path d="M2.5 7.775V2.75a.25.25 0 0 1 .25-.25h5.025a.25.25 0 0 1 .177.073l6.25 6.25a.25.25 0 0 1 0 .354l-5.025 5.025a.25.25 0 0 1-.354 0l-6.25-6.25a.25.25 0 0 1-.073-.177ZM6 5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/>
        </svg>`;
      case 'Discussion':
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" class="ghn-type-icon ghn-icon-discussion">
          <path d="M1.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 10.25 10H7.061l-2.574 2.573A1.458 1.458 0 0 1 2 11.543V10h-.25A1.75 1.75 0 0 1 0 8.25v-5.5C0 1.784.784 1 1.75 1Z"/>
        </svg>`;
      case 'Commit':
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" class="ghn-type-icon ghn-icon-commit">
          <path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5ZM10.5 8a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>
        </svg>`;
      default: // Issue
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" class="ghn-type-icon ghn-icon-issue">
          <path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>
          <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/>
        </svg>`;
    }
  }

  // ─── Text helpers ───────────────────────────────────────────────────────────

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
  }

  function formatTime(iso) {
    if (!iso) return '';
    const then = new Date(iso);
    const diffMs = Date.now() - then;
    const m = Math.floor(diffMs / 60_000);
    const h = Math.floor(diffMs / 3_600_000);
    const d = Math.floor(diffMs / 86_400_000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (d < 30) return `${d}d ago`;
    return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function getReasonLabel(reason) {
    const map = {
      assign: 'Assigned',
      author: 'Author',
      comment: 'Commented',
      invitation: 'Invited',
      manual: 'Subscribed',
      mention: 'Mentioned',
      review_requested: 'Review requested',
      security_alert: 'Security alert',
      state_change: 'State changed',
      subscribed: 'Watching',
      team_mention: 'Team mentioned',
      ci_activity: 'CI activity',
    };
    return map[reason] || reason || '';
  }

  function resolveSubjectUrl(n) {
    const apiUrl = n.subject.url || '';
    if (!apiUrl) return `https://github.com/${n.repository.full_name}`;

    return apiUrl
      .replace('https://api.github.com/repos/', 'https://github.com/')
      .replace(/\/pulls\/(\d+)$/, '/pull/$1')
      .replace(/\/issues\/(\d+)$/, '/issues/$1')
      .replace(/\/commits\/([a-f0-9]+)$/, '/commit/$1')
      .replace(/\/releases\/(\d+)$/, '/releases/tag/');
  }

  // ─── Markup ───────────────────────────────────────────────────────────────

  /** Inner HTML for one notification row (no event listeners attached). */
  function itemMarkup(n) {
    const url = resolveSubjectUrl(n);
    return `
      <a href="${url}" class="ghn-item-main" target="_blank" rel="noopener noreferrer"
         data-thread-id="${escHtml(n.id)}">
        <span class="ghn-item-icon" aria-hidden="true">${getSubjectIcon(n.subject.type)}</span>
        <span class="ghn-item-content">
          <span class="ghn-item-repo">${escHtml(n.repository.full_name)}</span>
          <span class="ghn-item-title">${escHtml(n.subject.title)}</span>
          <span class="ghn-item-meta">
            <span class="ghn-reason">${escHtml(getReasonLabel(n.reason))}</span>
            <span class="ghn-time">${formatTime(n.updated_at)}</span>
          </span>
        </span>
      </a>
      <span class="ghn-item-actions">
        <button class="ghn-icon-btn ghn-read-btn" data-thread-id="${escHtml(n.id)}"
                aria-label="Mark as read" title="Mark as read">${ICON_CHECK}</button>
        <button class="ghn-icon-btn ghn-unsub-btn" data-thread-id="${escHtml(n.id)}"
                aria-label="Unsubscribe" title="Unsubscribe">${ICON_MUTE}</button>
      </span>
    `;
  }

  function emptyMarkup() {
    return `
      <div class="ghn-empty">
        ${ICON_BELL}
        <p class="ghn-empty-title">You're all caught up!</p>
        <p class="ghn-empty-sub">No unread notifications</p>
      </div>`;
  }

  function loadingMarkup(msg = 'Loading…') {
    return `<div class="ghn-loading">${ICON_SPINNER}<span>${escHtml(msg)}</span></div>`;
  }

  globalThis.GHN_UI = {
    ICON_CHECK,
    ICON_MUTE,
    ICON_CHECK_CIRCLE,
    ICON_REFRESH,
    ICON_BELL,
    ICON_SPINNER,
    getSubjectIcon,
    escHtml,
    formatTime,
    getReasonLabel,
    resolveSubjectUrl,
    itemMarkup,
    emptyMarkup,
    loadingMarkup,
  };
})();
