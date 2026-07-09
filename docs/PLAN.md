# SupaTube — PLAN (agent spec)

Locked scope for the Localhost:6767 hackathon build. This file is the source of truth. Do not implement anything not listed here without updating this file first.

Audience: implementing agents. Follow the contracts exactly.

---

## 1. Product contract

- **Surface:** Chrome extension (Plasmo).
- **Purpose:** capture YouTube watch sessions worth remembering into Supermemory Local, expose recall + a taste profile via a Chrome Side Panel.
- **Backend:** none. Supermemory Local (`http://localhost:6767`) is the backend.
- **Landing:** single Next.js page for download + install instructions. No API routes.

---

## 2. Locked stack

| Layer | Choice | Constraint |
|---|---|---|
| Extension framework | Plasmo (`apps/extension`) | Already scaffolded. Do not swap. |
| Memory store | Supermemory Local `http://localhost:6767` | Run by the user, not by us. |
| Memory client | `supermemory` pnpm SDK | Only entrypoint to Supermemory. No raw `fetch` to `:6767` except health probe. |
| Memory Gate (on-device AI) | Gemini Nano via `window.ai` / Chrome AI | **Refer to this as `Memory Gate` in code, docs, UI, and logs.** `Gemini Nano` is an implementation detail — do not surface it to the user or use it as an identifier. |
| Landing page | Next.js `apps/web` — single page | No API routes, no server actions, no DB. Static export preferred. |
| Data-fetching in extension UI | TanStack Query wrapping SDK calls | Service → Hook → Component per `AGENTS.md`. |
| Styling | Tailwind | Add if missing. |

Escape hatch: if a real proxy is unavoidable, add it as a Plasmo background service worker endpoint. Never a hosted server. Update this file before doing so.

---

## 3. Non-goals (do not build)

- Hosted API of any kind.
- Auth / accounts / user DB. `containerTag` is the user identity.
- Standalone dashboard web app. Side Panel + optional New Tab page are the UI.
- Multi-page marketing site.
- Cloud sync.
- Firefox / Safari builds.

---

## 4. Repo layout (target)

```
supatube/
├── apps/
│   ├── extension/                     Plasmo Chrome extension
│   │   ├── popup.tsx                  toolbar popup: status + open-side-panel button
│   │   ├── sidepanel.tsx              workspace shell (4 tabs)
│   │   ├── options.tsx                api key, container tag, gate threshold
│   │   ├── newtab.tsx                 optional full-screen dashboard override
│   │   ├── background.ts              service worker: gate + SDK writes
│   │   ├── contents/
│   │   │   └── youtube.tsx            content script: capture video signals
│   │   ├── lib/
│   │   │   ├── supermemory.ts         SDK singleton
│   │   │   ├── memory-gate.ts         Memory Gate (Gemini Nano) scorer — RENAME from ai-memory-gate.ts
│   │   │   ├── heuristic-gate.ts      pre-gate cheap filter
│   │   │   ├── logger.ts
│   │   │   └── types.ts
│   │   ├── services/
│   │   │   ├── memory.service.ts      SDK wrapper: add / search / profile / list / delete
│   │   │   └── http.ts                fetch wrapper (health probe only)
│   │   ├── hooks/                     use-memory-*.ts (TanStack Query)
│   │   └── schemas/                   zod schemas for capture payloads + settings
│   └── web/                           single landing page
│       └── src/app/page.tsx           hero, install steps, download button
└── docs/
    ├── PIVOT.md
    └── PLAN.md
```

Delete from `apps/web/src/`: `hooks/`, `services/`, `schemas/` — landing page does not need them.

---

## 5. Data model

### Container tags
- `user_default` (single-tenant now; multi-profile later via alternate tags).
- Source tag: `youtube` (future sources: `x`, `reddit`).

### Capture payload (content script → service worker)

Supermemory ingests YouTube URLs natively — it fetches, transcribes, and extracts entities server-side (or in the local engine using the user's configured provider). **We do not scrape the transcript.** The content script only needs cheap signals for the Memory Gate.

```ts
type CapturePayload = {
  videoId: string;
  url: string;                          // canonical https://www.youtube.com/watch?v=<id>
  title: string;                        // from YouTube oEmbed API
  channel: string;                      // author_name from oEmbed
  channelId: string;                    // extracted from oEmbed author_url or JSON-LD
  channelUrl: string;                   // author_url from oEmbed
  thumbnailUrl?: string;                // thumbnail_url from oEmbed (https://img.youtube.com/vi/<id>/hqdefault.jpg fallback)
  duration: number;                     // seconds, from <video>.duration
  watchPercent: number;                 // 0-100 at capture time
  currentTime: number;                  // seconds at capture time (video position)
  playedSeconds: number;                // genuine watch seconds (excludes seeks) — tracked by content script
  publishedAt?: string;                 // ISO, from JSON-LD uploadDate if available
  description?: string;                 // first ~500 chars from JSON-LD, used ONLY for Memory Gate scoring
};
```

**Metadata extraction strategy (not DOM CSS selectors):**
- `videoId` — `new URLSearchParams(location.search).get('v')` — stable
- `url` — `window.location.href` — stable
- `title`, `channel`, `channelUrl`, `thumbnailUrl` — **YouTube oEmbed API** (`GET https://www.youtube.com/oembed?url=<url>&format=json`). No API key. Already within `host_permissions`. Fetched at capture time (latency acceptable since trigger fires at ≥60% or ≥180s).
- `channelId` — extracted from oEmbed `author_url` if it contains `/channel/UC...`; else from page JSON-LD `<script type="application/ld+json">` `author.identifier` field.
- `duration` — `video.duration` (HTML5 API) — stable
- `currentTime`, `playedSeconds` — tracked by content script via `timeupdate` events
- `publishedAt`, `description` — from JSON-LD `VideoObject` (`uploadDate`, `description`). Both optional; skip gracefully if not present.

### Memory write payload (canonical shape written via SDK)

**`content` is the YouTube URL.** Supermemory does the rest.

```ts
await supermemory.add({
  content: url,                         // e.g. 'https://www.youtube.com/watch?v=<id>'
  customId: `youtube:${videoId}`,       // dedup + re-watch updates same doc
  containerTag: userTag,
  metadata: {
    source: 'youtube',
    videoId,
    url,
    title,
    channel,
    channelId,
    channelUrl,
    thumbnailUrl,                         // from oEmbed; used by For You card rows
    duration,
    watchPercent,
    playedSeconds,                        // genuine watch time; useful for timeline display
    watchedAt,                            // ISO
    valueScore,                           // 0-1 (normalized — see §6 score normalization)
    gateReason,
    gateSource,                           // 'memory-gate' | 'heuristic-fallback'
  },
});
```

- Use `customId: youtube:<videoId>` so re-watches update the same document instead of duplicating it. On update we can bump `watchPercent` / `watchedAt` in metadata.
- Container tag is a single string (`containerTag`) per the Add API. Multi-source filtering is done via `metadata.source`, not extra tags.
- We never send transcript, chapters, or description as content — Supermemory extracts richer versions itself.

### Reads (SDK calls)
| Purpose | Call |
|---|---|
| Full-text recall | `supermemory.search.documents({ q, containerTags })` |
| Taste profile | `supermemory.profile({ containerTag })` → `{ static, dynamic }` |
| Timeline list | `supermemory.documents.list({ containerTags, limit })` |
| Delete one | `supermemory.documents.delete({ docId })` |
| Filter by channel | `search.documents({ filters: { AND: [{ key: 'channel', value }] } })` |

---

## 6. Capture pipeline (contract)

### Content script (`contents/youtube.tsx`)

The service worker is stateless w.r.t. YouTube — it never fetches YouTube pages. Content script uses a two-source strategy: the **YouTube oEmbed API** for stable video metadata, and **HTML5 video element events** for playback tracking. CSS selector DOM scraping is used only for JSON-LD (more stable than class-based selectors).

**SPA navigation:**
- Detect video changes via `yt-navigate-finish` event + URL polling fallback.
- On nav: reset `playedSeconds`, `reported` flag; re-attach to new `<video>` element.

**Metadata extraction (at capture time, not on mount):**
1. `videoId` from `new URLSearchParams(location.search).get('v')` — always first; abort if null.
2. oEmbed fetch: `GET https://www.youtube.com/oembed?url=<url>&format=json` → `title`, `channel` (author_name), `channelUrl` (author_url), `thumbnailUrl` (thumbnail_url).
3. `channelId`: extract from `channelUrl` if it matches `/channel/UC[\w-]+`; else parse page's `<script type="application/ld+json">` for `author.identifier`; else send empty string.
4. `publishedAt`, `description`: from JSON-LD `VideoObject.uploadDate` / `VideoObject.description` (first 500 chars). Send `undefined` if not found — both are optional.
5. `duration`: `video.duration` (HTML5).

**Playback tracking:**
- Attach `timeupdate` listener to `<video>` on SPA nav finish (MutationObserver if element not yet in DOM).
- `playedSeconds`: accumulate `delta` only when `0 < delta < 2` (genuine forward playback; delta > 2 = seek, excluded).
- `currentTime`: `video.currentTime` at capture moment.
- `watchPercent`: `Math.round((video.currentTime / video.duration) * 100)` — 0–100 scale.

**Trigger:** fire `CAPTURE` when `watchPercent ≥ 60 OR playedSeconds ≥ 180`. Debounce: one capture per `videoId` per tab session (`reported` flag).
- `chrome.runtime.sendMessage({ type: 'CAPTURE', payload })`.
- **Do not scrape the transcript panel.** Supermemory transcribes the video itself.

### Service worker (`background.ts`)

```
receive CAPTURE
  → validate payload with schemas/capture.schema.ts
  → memory-gate.ts (Memory Gate, Gemini Nano on-device, scores title+channel+description+watchPercent)
       returns {score, reason, source: 'memory-gate'}
     if Memory Gate unavailable (window.ai missing, model not downloaded,
     session create fails, scoring throws)
       → heuristic-gate.ts (duration bounds, watchPercent, keyword signals)
         returns {score, reason, source: 'heuristic-fallback'}
  → score < threshold → badge '–' → done
  → score ≥ threshold
       → memoryService.add({ content: url, customId: `youtube:${videoId}`, containerTag, metadata })
       → badge '✓'
```

**Why this is enough:** Supermemory's ingestion pipeline (Add API, `contentType: video` / URL auto-detection) fetches the video, transcribes it, extracts entities, and updates the user profile. Our extension supplies the *decision* (is this worth remembering?) and the *link*. Supermemory supplies the *understanding*.

- **Memory Gate is always the primary scorer.** Heuristic gate is a fallback, not a pre-filter. Never run the heuristic gate when the Memory Gate is available.
- Availability check must be cached per service-worker lifetime and re-probed on `chrome.runtime.onStartup`.
- Log the chosen scorer (`source`) on every capture; persist it in the memory metadata as `gateSource: 'memory-gate' | 'heuristic-fallback'`.
- **Score normalization:** both gates return `score` in **0–1 range**. Memory Gate: `score = confidence ?? 0.5` (if AI omits confidence, default to 0.5). Heuristic gate: `score = Math.max(0, Math.min(1, rawScore / 80))` (80 is the practical max achievable by the heuristic scorer). The existing internal `STORE_THRESHOLD = 30` in `heuristic-gate.ts` is **replaced** by this normalization — gate comparison is always `score < gateThreshold` (0–1).
- Threshold default: `0.6`. Configurable in options page. Same threshold applies to both scorers.
- **`GateResult` contract:** `{ score: number; reason: string; source: 'memory-gate' | 'heuristic-fallback' }`. Memory Gate must include `reason` in its Gemini Nano prompt response (update `responseConstraint` JSON schema to add `reason: string` field). Heuristic gate synthesizes `reason` from the dominant signal (e.g. `"title match: tutorial + walkthrough"`).
- Badge state must reflect the outcome of the most recent capture attempt on the active tab.

---

## 7. Where synthesis happens

We do not run a separate synthesis step. Supermemory's Add API handles it.

- **Content type**: URLs and YouTube URLs are first-class content types in Supermemory. `contentType` is auto-detected from the URL. Supermemory fetches, transcribes (for videos), extracts entities, updates the user profile.
- **Where the models run**: Supermemory Local uses the user's own configured provider (BYOK) — set up once when they run `supermemory-server`. That key lives in `~/.supermemory/env` and is Supermemory's concern, not ours. Supermemory Enterprise uses proprietary models. Same SDK code in both cases.
- **Timestamps and citations**: Supermemory's video pipeline preserves timestamps in the memory graph. Recall results include them; we surface them in the side panel.
- **Re-watch behavior**: `customId: youtube:<videoId>` deduplicates. On a re-watch we call `add` again with fresh metadata (higher `watchPercent`, newer `watchedAt`). Supermemory updates the existing document; no re-transcription is triggered for identical URL content.
- **No BYOK LLM keys in our extension.** The extension never talks to Google AI, OpenAI, or Anthropic directly. Everything model-related is delegated to Supermemory.

If, post-hackathon, we want extra pre-processing (e.g. "only save chapters the user actually watched"), we add it as a separate optional step — not part of the v1 spec.

---

## 8. Side Panel spec (`sidepanel.tsx`)

Four tabs, in this order:

1. **Recall** — search input → `useMemorySearch(query)` → results grouped by channel and date. Clicking a result opens the video URL in a new tab.
2. **For You** — `useMemoryProfile()` returns `profile.dynamic`; parse into interest clusters; for each cluster run a `search.documents` query and render a card row.
3. **Timeline** — `useMemoryList()`, reverse-chron, filter by channel/date, per-item delete button calls `documents.delete`.
4. **Settings** — mirrors options page. Includes "Wipe all memory" (list + delete all in container tag).

Data flow: all reads/writes go through `services/memory.service.ts` → `hooks/use-memory-*.ts` → components. No SDK usage in components. No `fetch` in components (`AGENTS.md`).

---

## 9. Landing page spec (`apps/web/src/app/page.tsx`)

Single page, in order:

1. Hero — headline: `"Remember what you actually learn on YouTube."` + primary CTA `Download for Chrome`.
2. Demo GIF (≤ 30s loop).
3. **How it works** — 3 icons: `Watch → Memory Gate decides → Recall anytime`.
4. **Setup in 2 minutes** — 3 numbered steps with copy buttons:
   1. `curl -fsSL https://supermemory.ai/install | bash`
   2. `supermemory-server`
   3. Install extension from Chrome Web Store.
5. Privacy strip — `"Runs entirely on your machine. Zero cloud."`
6. Footer — GitHub link, hackathon badge.

Config: `next.config.ts` uses `output: 'export'` if compatible with the components used. No API routes. No server actions.

---

## 10. Onboarding contract

```
1. User installs extension (Chrome Web Store or unpacked).
2. User runs Supermemory Local from landing page instructions.
3. Extension probes http://localhost:6767 on install and on side panel open.
   - If reachable and returns API key via handshake endpoint → auto-store in chrome.storage.local.
   - Else → open options.tsx and prompt user to paste the key from ~/.supermemory/env.
4. Extension writes memories automatically as user watches YouTube.
5. Side panel is the recall + profile UI.
```

Target friction: zero terminal steps beyond one copy-paste. No manual key entry when handshake works.

---

## 11. Task list (ordered, no time estimates)

Execute in order. Each item is a checkpoint; the next item assumes the previous is merged and green.

### T1 — SDK plumbing
- Add `supermemory` to `apps/extension/package.json`.
- Implement `apps/extension/lib/supermemory.ts` — SDK singleton, reads `apiKey` + `baseURL` from `chrome.storage.local`, defaults `baseURL` to `http://localhost:6767`.
- Implement `apps/extension/services/memory.service.ts` — `MemoryService` class with `add`, `search`, `profile`, `list`, `delete`. Typed `MemoryError`. Export `mutationOptions` / `queryOptions` helpers per `AGENTS.md`.
- Implement `apps/extension/schemas/settings.schema.ts` and `schemas/capture.schema.ts` (Zod).
- Implement `apps/extension/options.tsx` — form for `apiKey`, `containerTag`, `gateThreshold`. Persist to `chrome.storage.local`. Validate with settings schema.

### T2 — Fallback wiring
- Both `memory-gate.ts` and `heuristic-gate.ts` must export the same signature: `(payload: CapturePayload) => Promise<GateResult>` where `GateResult = { score: number; reason: string; source: 'memory-gate' | 'heuristic-fallback' }`. `score` is always 0–1.
- Memory Gate: update Gemini Nano `responseConstraint` JSON schema to require `{ store: boolean, confidence: number, reason: string }`. Synthesize `score = confidence ?? 0.5`.
- Heuristic gate: normalize raw score to 0–1 via `Math.max(0, Math.min(1, rawScore / 80))`. Remove the `STORE_THRESHOLD = 30` constant (replaced by the shared 0.6 threshold from settings). Synthesize `reason` string from dominant scoring signal.
- Add `isMemoryGateAvailable()` in `memory-gate.ts` (checks `window.ai` / model availability; result cached per SW lifetime).
- Update every user-facing string and log line: `"Gemini Nano"` → `"Memory Gate"` (or `"local AI"` where product-facing). Keep `"Gemini Nano"` only in internal code comments that explain the underlying model.
- Grep guard: `rg -w "Gemini Nano"` must return zero hits outside code comments and this PLAN.md.

### T3 — Capture pipeline
- Complete `apps/extension/contents/youtube.tsx`: robust extraction of title, channel, channelId, videoId, transcript panel, duration, live watchPercent tracker. Emit `CAPTURE` message on threshold.
- Complete `apps/extension/background.ts`: message handler calls `isMemoryGateAvailable()`; if true → `runMemoryGate(payload)`, else → `runHeuristicGate(payload)`; then compare to threshold and call `memoryService.add`. Sets badge (`✓` / `–` / cleared on nav). Log `gateSource` on every capture.
- Verify against a live Supermemory Local instance by watching three test videos and confirming records via `supermemory.documents.list`. Also verify fallback path by force-disabling `window.ai` in a test build.

### T4 — Side panel workspace
- `sidepanel.tsx` shell with tab router (Recall / For You / Timeline / Settings).
- Hooks: `use-memory-search.ts`, `use-memory-profile.ts`, `use-memory-list.ts`, `use-memory-delete.ts` (all kebab-case, per `AGENTS.md`).
- Recall: search input, debounced, results grouped by channel + date.
- Timeline: reverse-chron list, delete button per item, `invalidateQueries` on delete.
- Settings tab: mirror of options page + "Wipe all memory" (list all in tag → delete each).
- Wire `chrome.sidePanel.open` from `popup.tsx`.

### T5 — For You
- Parse `profile.dynamic` into interest clusters (heuristic: split on newline / bullet / sentence, keep top N).
- For each cluster, issue a `search.documents` query and render a horizontal card row.
- Refresh button re-fetches profile + all cluster searches.

### T6 — Landing page
- Delete `apps/web/src/{hooks,services,schemas}/`.
- Implement `apps/web/src/app/page.tsx` per §8.
- Configure Tailwind if not present.
- Set `output: 'export'` in `next.config.ts` if all components are static.
- Build succeeds with no runtime dependencies on a Node server.

### T7 — Package + submit
- Build `.crx` via `plasmo build --zip`.
- Draft Chrome Web Store listing (name, short desc, long desc, screenshots, privacy statement pointing to §11).
- Deploy landing to Vercel (or GitHub Pages).
- Write hackathon README: links to landing, GitHub, PIVOT.md, PLAN.md, demo video.
- Record demo video ≤ 90s.

---

## 12. Privacy contract

- No data leaves the user's machine unless the user explicitly configures a non-local `baseURL`.
- The extension makes network requests only to: `https://www.youtube.com/*` (content script host), `http://localhost:6767/*` (Supermemory), and Chrome AI on-device APIs.
- No analytics, no telemetry, no crash reporting to any third party.
- All settings are stored in `chrome.storage.local`, never `chrome.storage.sync`.

---

## 13. Conventions

- Follow every rule in `AGENTS.md` — arrow functions, `const`, kebab-case filenames, `@/` alias, Zod schemas in `src/schemas/`, Service → Hook → Component, no direct `fetch` in components, no direct commits.
- Supermemory SDK is the only channel to `:6767` (health probe excepted).
- All user-visible references to the on-device AI say `"Memory Gate"`.

---

## 14. Definition of Done

- Fresh Chrome + `supermemory-server` running + extension installed → user can save a memory by watching a YouTube video, then recall it via Side Panel search, without touching a terminal after the one install command.
- Side Panel `For You` tab renders at least one non-empty cluster after ≥ 5 saved videos.
- Landing page live at a single public URL; download CTA works.
- `rg -w "Gemini Nano"` returns zero hits outside internal code comments and this PLAN.md.
- Demo video ≤ 90s recorded.
- README links: landing, GitHub, PIVOT.md, PLAN.md.

---

## 15. Post-hackathon (out of scope, tracked)

- Optional cloud sync via `baseURL` swap to hosted Supermemory.
- Additional sources: `x`, `reddit`, `hn` (new container tag values).
- Firefox port.
- Team / shared memory (per-workspace `containerTag`).
