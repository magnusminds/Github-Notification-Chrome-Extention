/**
 * content.js — Injected into github.com pages
 *
 * - Finds the bell icon in GitHub's header
 * - Injects a red unread-count badge
 * - Shows a GitHub-styled popover on hover with full notification list
 * - Supports: mark as read, unsubscribe, mark-all-read, participating filter
 * - Handles GitHub's Turbo/PJAX SPA navigation via MutationObserver
 */

(function () {
  'use strict';

  // ─── Shared UI helpers (icons + markup) — see ghn-ui.js ──────────────────────

  const {
    ICON_CHECK_CIRCLE,
    ICON_REFRESH,
    ICON_SPINNER,
    itemMarkup,
    emptyMarkup,
    loadingMarkup,
  } = globalThis.GHN_UI;

  // ─── State ──────────────────────────────────────────────────────────────────

  let popoverEl = null;
  let isVisible = false;
  let hoverTimer = null;
  let cachedNotifications = [];
  let initialized = false;

  // ─── DOM helpers ────────────────────────────────────────────────────────────

  /** Returns the bell <a> element in GitHub's header */
  function getBellAnchor() {
    return (
      document.querySelector('a[href="/notifications"].notification-indicator') ||
      document.querySelector('.AppHeader-notifications a[href="/notifications"]') ||
      document.querySelector('[data-hotkey="g n"] a[href="/notifications"]') ||
      document.querySelector('a[href="/notifications"]')
    );
  }

  /** Returns the direct container (li or span) wrapping the bell */
  function getBellContainer() {
    const a = getBellAnchor();
    if (!a) return null;
    return a.closest('li') || a.closest('.AppHeader-notifications') || a.parentElement;
  }

  // ─── Badge ───────────────────────────────────────────────────────────────────

  function injectBadge() {
    const bell = getBellAnchor();
    if (!bell || bell.querySelector('#ghn-badge')) return;

    const badge = document.createElement('span');
    badge.id = 'ghn-badge';
    badge.setAttribute('aria-label', 'unread notifications');
    badge.style.display = 'none';
    bell.appendChild(badge);
  }

  function updateBadge(count) {
    const badge = document.getElementById('ghn-badge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.style.display = 'flex';
    } else {
      badge.textContent = '';
      badge.style.display = 'none';
    }
  }

  // ─── Popover lifecycle ───────────────────────────────────────────────────────

  function buildPopover() {
    if (document.getElementById('ghn-popover')) return;

    popoverEl = document.createElement('div');
    popoverEl.id = 'ghn-popover';
    popoverEl.setAttribute('role', 'dialog');
    popoverEl.setAttribute('aria-label', 'GitHub Notifications');
    popoverEl.innerHTML = `
      <div class="ghn-header">
        <span class="ghn-title">Notifications</span>
        <div class="ghn-header-actions">
          <label class="ghn-participating-label" title="Show only notifications you are participating in">
            <input type="checkbox" id="ghn-participating" />
            <span>Participating only</span>
          </label>
          <button class="ghn-icon-btn" id="ghn-refresh-btn" aria-label="Refresh notifications">
            ${ICON_REFRESH}
          </button>
          <button class="ghn-icon-btn" id="ghn-mark-all-btn" aria-label="Mark all as read">
            ${ICON_CHECK_CIRCLE}
          </button>
        </div>
      </div>
      <div class="ghn-body" id="ghn-body">
        <div class="ghn-loading">${ICON_SPINNER}<span>Loading…</span></div>
      </div>
      <div class="ghn-footer">
        <a href="/notifications" class="ghn-footer-link">View all notifications →</a>
      </div>
    `;

    document.body.appendChild(popoverEl);

    // Restore participating setting
    chrome.storage.sync.get({ participatingOnly: false }, ({ participatingOnly }) => {
      document.getElementById('ghn-participating').checked = participatingOnly;
    });

    // Participating toggle
    document.getElementById('ghn-participating').addEventListener('change', (e) => {
      chrome.storage.sync.set({ participatingOnly: e.target.checked }, () => {
        setBodyLoading('Refreshing…');
        chrome.runtime.sendMessage({ type: 'REFRESH' }, () => loadAndRender());
      });
    });

    // Refresh button
    document.getElementById('ghn-refresh-btn').addEventListener('click', () => {
      setBodyLoading('Refreshing…');
      chrome.runtime.sendMessage({ type: 'REFRESH' }, () => loadAndRender());
    });

    // Mark all read
    document.getElementById('ghn-mark-all-btn').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'MARK_ALL_READ' }, (result) => {
        if (result?.success) {
          cachedNotifications = [];
          updateBadge(0);
          renderNotifications([]);
        }
      });
    });

    // Hover keep-alive
    popoverEl.addEventListener('mouseenter', () => clearTimeout(hoverTimer));
    popoverEl.addEventListener('mouseleave', () => scheduleHide());

    // Click outside → close
    document.addEventListener('mousedown', onOutsideClick, true);
  }

  function positionPopover() {
    const bell = getBellAnchor();
    if (!bell || !popoverEl) return;

    const rect = bell.getBoundingClientRect();
    const scrollY = window.scrollY;
    const popW = 420;

    let top = rect.bottom + scrollY + 8;
    let left = rect.left + rect.width / 2 - popW / 2;

    // Clamp to viewport
    const margin = 12;
    if (left + popW > window.innerWidth - margin) left = window.innerWidth - popW - margin;
    if (left < margin) left = margin;

    popoverEl.style.top = `${top}px`;
    popoverEl.style.left = `${left}px`;
    popoverEl.style.width = `${popW}px`;
  }

  function showPopover() {
    if (!popoverEl) buildPopover();
    positionPopover();
    popoverEl.classList.add('ghn-visible');
    isVisible = true;
    loadAndRender();
  }

  function hidePopover() {
    if (popoverEl) popoverEl.classList.remove('ghn-visible');
    isVisible = false;
  }

  function scheduleHide() {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      if (!popoverEl?.matches(':hover')) hidePopover();
    }, 250);
  }

  function onOutsideClick(e) {
    if (!isVisible) return;
    const bell = getBellContainer();
    const inBell = bell?.contains(e.target);
    const inPop = popoverEl?.contains(e.target);
    if (!inBell && !inPop) hidePopover();
  }

  // ─── Data loading ────────────────────────────────────────────────────────────

  function loadAndRender() {
    chrome.runtime.sendMessage({ type: 'GET_NOTIFICATIONS' }, (result) => {
      if (chrome.runtime.lastError) return;
      cachedNotifications = result?.notifications ?? [];
      updateBadge(cachedNotifications.length);
      renderNotifications(cachedNotifications);
    });
  }

  // ─── Rendering ───────────────────────────────────────────────────────────────

  function setBodyLoading(msg = 'Loading…') {
    const body = document.getElementById('ghn-body');
    if (body) body.innerHTML = loadingMarkup(msg);
  }

  function renderNotifications(notifications) {
    const body = document.getElementById('ghn-body');
    if (!body) return;

    if (!notifications.length) {
      body.innerHTML = emptyMarkup();
      return;
    }

    body.innerHTML = '';

    notifications.forEach((n) => {
      const item = buildNotificationItem(n);
      body.appendChild(item);
    });
  }

  function buildNotificationItem(n) {
    const item = document.createElement('div');
    item.className = 'ghn-item';
    item.dataset.threadId = n.id;
    item.innerHTML = itemMarkup(n);

    // Mark as read on link click
    item.querySelector('.ghn-item-main').addEventListener('click', (e) => {
      const tid = e.currentTarget.dataset.threadId;
      chrome.runtime.sendMessage({ type: 'MARK_READ', threadId: tid });
      removeItem(tid);
    });

    // Mark as read button
    item.querySelector('.ghn-read-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const tid = e.currentTarget.dataset.threadId;
      chrome.runtime.sendMessage({ type: 'MARK_READ', threadId: tid }, (res) => {
        if (res?.success) removeItem(tid);
      });
    });

    // Unsubscribe button
    item.querySelector('.ghn-unsub-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const tid = e.currentTarget.dataset.threadId;
      const btn = e.currentTarget;
      btn.disabled = true;
      chrome.runtime.sendMessage({ type: 'UNSUBSCRIBE', threadId: tid }, (res) => {
        if (res?.success) removeItem(tid);
        else btn.disabled = false;
      });
    });

    return item;
  }

  function removeItem(threadId) {
    cachedNotifications = cachedNotifications.filter((n) => n.id !== threadId);
    updateBadge(cachedNotifications.length);

    const el = document.querySelector(`.ghn-item[data-thread-id="${threadId}"]`);
    if (el) {
      el.style.opacity = '0';
      el.style.transform = 'translateX(8px)';
      setTimeout(() => {
        el.remove();
        if (!cachedNotifications.length) renderNotifications([]);
      }, 180);
    }
  }

  // ─── Hover setup ─────────────────────────────────────────────────────────────

  function setupHover() {
    const container = getBellContainer();
    if (!container || container.dataset.ghnHover) return;
    container.dataset.ghnHover = '1';

    container.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(showPopover, 180);
    });

    container.addEventListener('mouseleave', () => scheduleHide());
  }

  // ─── Listener from background ─────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'NOTIFICATIONS_UPDATED') {
      updateBadge(message.count);
      if (isVisible) loadAndRender();
    }
  });

  // ─── Init + SPA support ───────────────────────────────────────────────────

  function tryInit() {
    const bell = getBellAnchor();
    if (!bell) return false;

    injectBadge();
    setupHover();

    if (!initialized) {
      initialized = true;
      // Load initial count from cache (no refresh)
      chrome.runtime.sendMessage({ type: 'GET_NOTIFICATIONS' }, (result) => {
        if (chrome.runtime.lastError) return;
        cachedNotifications = result?.notifications ?? [];
        updateBadge(cachedNotifications.length);
      });
    }

    return true;
  }

  // Observe DOM for GitHub's Turbo navigation swapping the header
  const observer = new MutationObserver(() => {
    const bell = getBellAnchor();
    if (bell && !bell.querySelector('#ghn-badge')) {
      // Header was replaced (Turbo navigation) — re-inject
      initialized = false;
      tryInit();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();
