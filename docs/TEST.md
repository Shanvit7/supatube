# Extension — Local Testing Guide

How to load the extension locally, verify it's working, and inspect the exact
7-field payload it sends to the backend.

---

## 1. Prerequisites

- Chrome 138+ (required for Gemini Nano; heuristic fallback works on any version)
- Backend running at `http://localhost:3001` (or skip — payloads queue locally)
- `.env` already exists at `apps/extension/.env`:

```env
PLASMO_PUBLIC_API_URL=http://localhost:3001
```

---

## 2. Start the Dev Bundle

```bash
cd apps/extension
pnpm dev
```

Plasmo compiles and watches. The output lands at:

```
apps/extension/build/chrome-mv3-dev/
```

The server stays running and hot-reloads on every file save. Leave this
terminal open.

---

## 3. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load Unpacked**
4. Select `apps/extension/build/chrome-mv3-dev`

The extension appears as **"DEV | SupaTube"** with a grayscale icon — that's
Plasmo's dev marker. Pin it to the toolbar for easy access.

---

## 4. Verify the Content Script is Running

1. Open any YouTube video: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
2. Open DevTools on the YouTube tab (`F12` or `Cmd+Option+I`)
3. Go to **Console**
4. Filter by `supatube` — you should see no errors

Nothing logs from the content script until the capture trigger fires (60s
real playback + 8% completion). That's expected.

---

## 5. Open the Service Worker Inspector

This is where all gate decisions and payload logs appear.

1. Go to `chrome://extensions`
2. Find **DEV | SupaTube**
3. Click the **"service worker"** blue link under the extension name

A separate DevTools window opens for the background service worker. Keep
this open — everything from `background.ts`, `ai-memory-gate.ts`, and
`heuristic-gate.ts` logs here.

> In Plasmo dev mode the service worker stays permanently alive — you won't
> lose logs to the 5-minute idle kill that happens in production.

---

## 6. Check Gemini Nano Availability

In the **Service Worker inspector Console**, run:

```js
LanguageModel.availability().then(v => console.log("Nano:", v))
```

| Result | Meaning |
|---|---|
| `"available"` | Gemini Nano ready — AI gate will run |
| `"downloading"` | Model downloading — heuristic gate runs until done |
| `"unavailable"` | Hardware doesn't meet requirements — heuristic gate runs |
| `ReferenceError: LanguageModel is not defined` | Chrome < 138 — heuristic gate only |

---

## 7. Trigger a Capture

1. Go to a YouTube video (something educational works best for the gate)
2. Play it — **don't seek, let it play genuinely**
3. Wait until **60 seconds of real playback** AND **8% of the video** have
   passed

The capture trigger fires once those two conditions are met. Watch the
**Service Worker inspector Console** for:

```
[supatube:background] gate check: "Your Video Title"
```

Followed by one of:

```
[supatube:ai-memory-gate] ...
[supatube:background] AI gate: store   ← Nano approved it
[supatube:background] AI gate: drop    ← Nano rejected it

# or if Nano unavailable:
[supatube:background] Gemini Nano unavailable — heuristic gate active
[supatube:background] heuristic gate: store  (score: 47)
[supatube:background] heuristic gate: drop   (score: 12)
```

---

## 8. Inspect the 7-Field Payload

### Option A — Network tab (when backend is running)

1. In the **Service Worker inspector**, go to the **Network** tab
2. Filter by `memories`
3. Trigger a capture (§7)
4. Click the `POST /api/memories` request → **Payload** tab

You'll see exactly the 7 fields sent:

```json
{
  "videoId": "dQw4w9WgXcQ",
  "playedSeconds": 63,
  "watchPercent": 0.11,
  "capturedAt": "2026-07-09T10:32:00.000Z",
  "gate": "ai",
  "confidence": 0.91
}
```

(`gateScore` appears instead of `confidence` when gate is `"heuristic"`)

### Option B — Local queue (when backend is NOT running)

When there's no API token or the backend is down, the payload is queued in
`chrome.storage.local`. Read it from the **Service Worker inspector Console**:

```js
chrome.storage.local.get("queue", console.log)
```

Output:

```js
{
  queue: [
    {
      videoId: "dQw4w9WgXcQ",
      playedSeconds: 63,
      watchPercent: 0.11,
      capturedAt: "2026-07-09T10:32:00.000Z",
      gate: "heuristic",
      gateScore: 47
    }
  ]
}
```

Clear the queue after inspecting:

```js
chrome.storage.local.remove("queue")
```

---

## 9. Verify Gate Signals (Heuristic Fallback)

To confirm the heuristic scorer is reading title + description + watch data
correctly, test these known cases:

| Video type | Expected | Why |
|---|---|---|
| Tutorial, 70% watched | `store` | Title keyword + completion |
| Music video, 100% watched | `drop` | Negative title keyword wipes score |
| 2hr lecture, 20% watched (24min) | `store` | Long duration + 24min absolute watch |
| YouTube Short (< 2min), 100% | `drop` | Duration penalty + watch < 90s |

Watch the `heuristic gate: store/drop (score: N)` log to confirm.

---

## 10. What's NOT sent to the backend

These are scraped locally for the gate only and discarded after:

- `title` — from `document.title`
- `channel` — from `ytd-channel-name` DOM
- `description` — from `#description-inline-expander` (first 1000 chars)
- `durationSeconds` — from `<video>.duration`

None of these appear in the POST body. Backend fetches them via yt-dlp
using `videoId`.

---

## 11. Common Issues

| Symptom | Fix |
|---|---|
| Extension not appearing | Make sure `build/chrome-mv3-dev/` exists and `pnpm dev` is running |
| No logs in SW inspector | Click the "service worker" link on `chrome://extensions`, not F12 on the popup |
| Gate never fires | Wait for 60s of genuine playback + 8% — seeking doesn't count |
| `no token — skipping network call` | Expected — auth not wired yet. Check the queue via Option B above |
| `LanguageModel is not defined` | Chrome version < 138. Heuristic gate will handle it |
| `Nano: "unavailable"` | Hardware doesn't meet requirements (see §6). Heuristic gate active |
