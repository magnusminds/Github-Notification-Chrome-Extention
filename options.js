/**
 * options.js — Settings page logic
 */

// ─── DOM refs ───────────────────────────────────────────────────────────────

const tokenInput      = document.getElementById('token');
const toggleVisBtn    = document.getElementById('toggle-visibility');
const eyeIcon         = document.getElementById('eye-icon');
const saveTokenBtn    = document.getElementById('save-token-btn');
const removeTokenBtn  = document.getElementById('remove-token-btn');
const participatingCb = document.getElementById('participating-only');
const desktopCb       = document.getElementById('desktop-notifications');
const refreshBtn      = document.getElementById('refresh-btn');
const statusBar       = document.getElementById('status-bar');

// Status fields
const sToken = document.getElementById('s-token');
const sCount = document.getElementById('s-count');
const sLast  = document.getElementById('s-last');

// ─── Flash messages ─────────────────────────────────────────────────────────

let flashTimer = null;

function flash(msg, type = 'success') {
  statusBar.textContent = msg;
  statusBar.className = `status-bar ${type}`;
  statusBar.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { statusBar.hidden = true; }, 3500);
}

// ─── Token visibility toggle ─────────────────────────────────────────────────

const EYE_OPEN = `<path d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 0 1 0-1.798c.45-.677 1.367-1.931 2.637-3.022C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.825 4.242 9.473 3.5 8 3.5c-1.473 0-2.824.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z"/>`;

const EYE_CLOSED = `<path d="M.143 2.31a.75.75 0 0 1 1.047-.167l14.5 10.5a.75.75 0 1 1-.88 1.214l-2.248-1.628C11.346 13.19 9.792 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.619 1.619 0 0 1 0-1.797c.353-.533.995-1.42 1.868-2.305L.31 3.357A.75.75 0 0 1 .143 2.31Zm3.386 3.785c-.712.699-1.246 1.437-1.574 1.906a.12.12 0 0 0 0 .135c.277.419.882 1.143 1.807 1.86C4.85 10.76 6.218 11.5 8 11.5c1.012 0 1.930-.285 2.748-.7l-1.17-.848a2 2 0 0 1-2.545-2.81L3.53 6.095ZM8 5.5c-.346 0-.682.035-1.006.1L5.58 4.496A6.336 6.336 0 0 1 8 4c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798 12.8 12.8 0 0 1-.44.617l-1.092-.792a10.61 10.61 0 0 0 .323-.42.12.12 0 0 0 0-.136C13.996 9.242 13.391 8.518 12.467 7.8 11.324 6.742 9.973 5.5 8 5.5Z"/>`;

toggleVisBtn.addEventListener('click', () => {
  const isPassword = tokenInput.type === 'password';
  tokenInput.type = isPassword ? 'text' : 'password';
  eyeIcon.innerHTML = isPassword ? EYE_CLOSED : EYE_OPEN;
  toggleVisBtn.setAttribute('aria-label', isPassword ? 'Hide token' : 'Show token');
});

// ─── Save token ──────────────────────────────────────────────────────────────

saveTokenBtn.addEventListener('click', () => {
  const raw = tokenInput.value.trim();

  if (!raw) {
    flash('Please enter a token.', 'error');
    return;
  }

  // Basic sanity check — PATs start with ghp_, gho_, github_pat_, etc.
  if (!/^gh[pousr]_[A-Za-z0-9_]{36,}$/.test(raw) && !raw.startsWith('github_pat_')) {
    flash('That doesn\'t look like a valid GitHub token. Please check and try again.', 'error');
    return;
  }

  chrome.storage.sync.set({ token: raw }, () => {
    flash('Token saved! Refreshing notifications…');
    updateStatus();
    chrome.runtime.sendMessage({ type: 'REFRESH' }, () => loadStatusCounts());
  });
});

// ─── Remove token ────────────────────────────────────────────────────────────

removeTokenBtn.addEventListener('click', () => {
  chrome.storage.sync.remove('token', () => {
    tokenInput.value = '';
    flash('Token removed — now using session mode.', 'success');
    sToken.textContent = 'Session mode (github.com login)';
    sToken.className = 'status-value ok';
    chrome.runtime.sendMessage({ type: 'REFRESH' }, () => loadStatusCounts());
  });
});

// ─── Participating toggle ─────────────────────────────────────────────────────

participatingCb.addEventListener('change', () => {
  chrome.storage.sync.set({ participatingOnly: participatingCb.checked }, () => {
    flash(
      participatingCb.checked
        ? 'Now showing participating notifications only.'
        : 'Now showing all notifications.',
    );
    chrome.runtime.sendMessage({ type: 'REFRESH' }, () => loadStatusCounts());
  });
});

// ─── Desktop notifications toggle ───────────────────────────────────────────

desktopCb.addEventListener('change', () => {
  chrome.storage.sync.set({ desktopNotifications: desktopCb.checked }, () => {
    flash(
      desktopCb.checked
        ? 'Desktop notifications enabled.'
        : 'Desktop notifications disabled.',
    );
  });
});

// ─── Refresh button ───────────────────────────────────────────────────────────

refreshBtn.addEventListener('click', () => {
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Refreshing…';
  chrome.runtime.sendMessage({ type: 'REFRESH' }, () => {
    loadStatusCounts();
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh now';
    flash('Notifications refreshed.');
  });
});

// ─── Status panel ─────────────────────────────────────────────────────────────

function updateStatus() {
  chrome.storage.sync.get(
    { token: '', participatingOnly: false, desktopNotifications: false },
    (settings) => {
    if (settings.token) {
      // Mask token: show first 8 chars + ...
      const masked = settings.token.slice(0, 8) + '••••••••••••••••';
      tokenInput.value = settings.token;
      sToken.textContent = `Configured (${masked})`;
      sToken.className = 'status-value ok';
    } else {
      sToken.textContent = 'Session mode (github.com login)';
      sToken.className = 'status-value ok';
    }

      participatingCb.checked = settings.participatingOnly;
      desktopCb.checked = settings.desktopNotifications;
    },
  );
}

function loadStatusCounts() {
  chrome.storage.local.get({ notifications: [], lastUpdated: null }, (data) => {
    const count = data.notifications.length;
    sCount.textContent = count === 0 ? 'None' : String(count);
    sCount.className = `status-value ${count > 0 ? 'warn' : 'ok'}`;

    if (data.lastUpdated) {
      const d = new Date(data.lastUpdated);
      sLast.textContent = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } else {
      sLast.textContent = 'Never';
    }
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

updateStatus();
loadStatusCounts();
