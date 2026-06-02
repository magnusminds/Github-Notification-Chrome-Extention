# GitHub Notifier

A Chrome (Manifest V3) browser extension that shows your GitHub notifications in a **hover popover** directly on the bell icon — matching GitHub's native popover style.

---

## Features

| Feature | Details |
|---|---|
| **Unread badge** | Red count badge on the bell icon updates every 60 s |
| **Hover popover** | Mouse over the bell → instant notification list |
| **Toolbar popup** | Click the extension icon → the same notification list in a popup |
| **Notification types** | Issues, Pull Requests, Discussions, Releases, Commits — each with the correct icon |
| **Reason badges** | Shows why you were notified (Mentioned, Assigned, Review requested, …) |
| **Mark as read** | Per-item ✓ button or "mark all" in the header |
| **Unsubscribe** | Per-item × button — unsubscribes and marks as read in one click |
| **Participating only** | Toggle in both the popover header and the options page |
| **Dark mode** | Uses GitHub's own CSS custom properties — adapts automatically |
| **SPA-safe** | MutationObserver survives GitHub's Turbo navigation |

---

## Installation

### 1. Generate icons

```bash
npm install sharp
node generate-icons.js
```

### 2. Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `Github-Notifier` folder

### 3. Pick how it reads your notifications

The extension works in **two modes**:

| Mode | Setup | How it reads notifications |
|---|---|---|
| **Session mode** (default, no token) | Just be logged in to github.com | Fetches `github.com/notifications` with your session cookies and parses the page |
| **API mode** (optional) | Save a Personal Access Token | Calls the GitHub REST API — faster, structured, supports the participating filter |

**Session mode** needs no configuration — if you're signed in to GitHub in this browser, it just works.

To use **API mode** instead:

1. Click the extension icon → **Options** (or right-click → *Options*)
2. Create a GitHub PAT at [github.com/settings/tokens](https://github.com/settings/tokens/new?scopes=notifications&description=GitHub+Notifier) with the **`notifications`** scope
3. Paste it into the token field and click **Save Token** (remove it any time to fall back to session mode)

---

## File structure

```
Github-Notifier/
├── manifest.json          # MV3 manifest
├── background.js          # Service worker — polling (API or page), badge, message bus
├── offscreen.html         # Invisible doc that hosts the HTML parser
├── offscreen.js           # Parses github.com/notifications HTML (session mode)
├── ghn-ui.js              # Shared render helpers (icons + markup) for popover & popup
├── content.js             # Injected into github.com — badge + popover UI
├── content.css            # Popover/popup styles (uses GitHub CSS variables)
├── popup.html             # Toolbar-icon popup (reuses content.css)
├── popup.js               # Popup logic
├── popup.css              # Popup sizing + dark-theme variables
├── options.html           # Settings page
├── options.js             # Settings page logic
├── options.css            # Settings page styles
├── generate-icons.js      # Node script to build icons/icon{16,32,48,128}.png
└── icons/                 # Generated PNG icons (run generate-icons.js first)
```

---

## API & Permissions

| Permission | Reason |
|---|---|
| `storage` | Sync token/settings; cache notifications locally |
| `alarms` | 60-second poll interval |
| `tabs` | Push badge updates to open GitHub tabs |
| `notifications` | (reserved for future desktop alerts) |
| `offscreen` | Parse the notifications page HTML off the service worker (session mode) |
| `https://api.github.com/*` | GitHub REST API calls (API mode) |
| `https://github.com/*` | Content script host + reading the notifications page (session mode) |

In **API mode**, the token is stored in `chrome.storage.sync` (encrypted by Chrome, synced across your signed-in devices) and is never sent anywhere other than `api.github.com`. In **session mode** no token exists — the extension only ever talks to `github.com` using cookies the browser already has.

---

## Development notes

- **Polling interval**: 60 s via `chrome.alarms`. GitHub recommends ≥ 60 s.
- **GitHub's dark/dimmed themes**: The popover uses `var(--color-canvas-overlay)` and friends — no extra theme detection needed.
- **Turbo navigation**: The `MutationObserver` in `content.js` re-injects the badge when GitHub swaps the header during client-side navigation.
- **Session-mode parsing**: `offscreen.js` extracts notifications from the page HTML in an href-driven way — repo, type and URL come from each notification's own link, so it tolerates GitHub's CSS/class renames. Mark-as-read / unsubscribe in session mode work by *replaying the page's own forms* (with their real `authenticity_token`) rather than calling private endpoints. If GitHub changes that markup, those actions degrade gracefully (the item simply isn't removed) and log a `[GHN]` warning to the service-worker console.
