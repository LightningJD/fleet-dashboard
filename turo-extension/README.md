# Lightning Fleet Tracker — Chrome Extension

## Install (Developer Mode)

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `turo-extension/` folder
5. Pin the extension for easy access

## Setup

1. Click the extension icon
2. Enter a **GitHub Personal Access Token** (needs `repo` scope)
3. Click **Save Token**

## How It Works

### `content.js`
- Monkey-patches `fetch()` and `XMLHttpRequest` at `document_start`
- Intercepts ALL network traffic on `turo.com`
- Classifies URLs: `listing`, `availability`, `search`
- Extracts structured data (price, year, rating, photos, delivery, turoGo)
- Sends captures to `background.js` via `chrome.runtime.sendMessage`
- Logs every URL to console with `[Lightning Fleet]` prefix

### `background.js`
- Stores captures in `chrome.storage.local` keyed by date
- Auto-pushes to GitHub every 5 minutes (via `chrome.alarms`)
- Merges with existing `data.json` in the repo (dedupes by capture ID)
- Shows badge with capture count

### `popup.html` / `popup.js`
- Dark UI with green accents
- Shows live status, capture count, last URL
- GitHub token input (password field)
- Manual "Push Now" button

## Files

```
turo-extension/
├── manifest.json    — MV3 manifest
├── config.js        — Configuration constants
├── content.js       — fetch/XHR interceptor (CORE)
├── background.js    — Service worker (storage + GitHub API)
├── popup.html       — Extension popup UI
├── popup.js         — Popup logic
├── icons/           — Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md        — This file
```

## Debugging

- Open Turo in Chrome
- Open DevTools Console → look for `[Lightning Fleet]` messages
- Every intercepted URL is logged: `[Lightning Fleet] fetch → <url>`
- Captures are logged: `[Lightning Fleet] Capture [listing] <url>`
- Background logs: `[Lightning Fleet BG]`

## GitHub Data Format

Data is pushed to `LightningJD/fleet-dashboard/data.json`:

```json
{
  "lastUpdated": "2026-06-16T20:13:00.000Z",
  "2026-06-16": [
    {
      "id": "1718554380-a3b4c2",
      "timestamp": 1718554380000,
      "url": "https://api.turo.com/api/listing/12345",
      "type": "listing",
      "data": { ... }
    }
  ]
}
```

## Safety

- The monkey-patch **never modifies** requests or responses
- `fetch`: clones the response before reading
- `XHR`: reads `responseText` after load (doesn't intercept the stream)
- All interception code wrapped in `try/catch`
- Original `fetch`/`XHR` always called normally first
