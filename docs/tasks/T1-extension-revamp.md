# T1 — Extension Revamp: Align to PLAN.md Use Case

**Prerequisite:** Read `docs/PLAN.md` in full before touching any file.  
**Source of truth:** `docs/PLAN.md` §2, §4–§10.  
**Skills to load:** `chrome-extension-development`, `chrome-extensions` (in `.agents/skills/`).  
**When in doubt:** use `agent-browser` to read Plasmo docs at https://docs.plasmo.com and Supermemory SDK docs at https://docs.supermemory.ai — never guess API shapes.

---

## Context — What Exists vs. What PLAN.md Requires

The extension was originally built around a hosted backend (`localhost:3001`). PLAN.md locks the stack to **Supermemory Local** (`localhost:6767`) accessed exclusively through the **`supermemory` npm SDK**. There is no backend. The extension is the entire product.

### Current state (what exists today)

| File | State | Problem |
|---|---|---|
| `lib/ai-memory-gate.ts` | ✅ working | Wrong name; user-facing logs say "Gemini Nano" |
| `lib/heuristic-gate.ts` | ✅ working | Gate signature incompatible with PLAN.md contract |
| `lib/types.ts` | ⚠️ partial | `CapturePayload` is the lean backend shape — must become the full SDK write shape |
| `lib/logger.ts` | ✅ ok | No changes needed |
| `services/memory.service.ts` | ❌ wrong | Wraps `HttpService` to `localhost:3001`; must be rewritten to wrap Supermemory SDK |
| `services/http.ts` | ⚠️ bloated | Health probe only in new model; strip auth logic |
| `background.ts` | ⚠️ partial | Gate logic fine; `persist()` shape wrong; badge missing; message type wrong |
| `contents/youtube.tsx` | ⚠️ partial | Missing `channelId`, `channelUrl`, `publishedAt`; trigger thresholds differ from spec |
| `popup.tsx` | ❌ stub | `<div>SupaTube Extension</div>` — needs real UI |
| `lib/supermemory.ts` | ❌ missing | SDK singleton |
| `services/tags.ts` | ❌ missing | TanStack Query cache key registry |
| `hooks/` | ❌ missing | All four hooks |
| `schemas/` | ❌ missing | `capture.schema.ts`, `settings.schema.ts` |
| `options.tsx` | ❌ missing | Real settings page |
| `sidepanel.tsx` | ❌ missing | 4-tab workspace |
| `package.json` deps | ❌ missing | `supermemory`, `@tanstack/react-query`, Tailwind |

---

## Ordered Sub-tasks

Execute top-to-bottom. Each sub-task is independently verifiable.

---

### ST-1 · Dependencies — `package.json`

**File:** `apps/extension/package.json`

Add to `dependencies`:

```jsonc
"supermemory": "latest",
"@tanstack/react-query": "^5",
"@tanstack/react-query-devtools": "^5"
```

Add Tailwind (check root `package.json` / `pnpm-workspace.yaml` first — it may already be hoisted):

```jsonc
// devDependencies
"tailwindcss": "^3",
"@tailwindcss/forms": "^0.5"
```

Add to manifest block — **required for Side Panel and badge**:

```jsonc
"manifest": {
  "host_permissions": ["https://www.youtube.com/*"],
  "permissions": [
    "storage",
    "tabs",
    "activeTab",
    "sidePanel",
    "action"
  ]
}
```

> ℹ️ **`windows` permission is NOT needed.** `chrome.windows.getCurrent()` works in a popup context without it — the `windows` permission is only required when accessing *other* windows. `chrome.sidePanel.open({ windowId })` is called with the result of `chrome.windows.getCurrent(callback)`, available for free in a popup.

**Verify:** `pnpm install` exits cleanly. `import Supermemory from 'supermemory'` resolves in TS.  
**Docs:** https://docs.supermemory.ai (use `agent-browser` if needed)

---

### ST-2 · SDK Singleton — `lib/supermemory.ts`

**Create:** `apps/extension/lib/supermemory.ts`

Responsibilities:
- Import `Supermemory` (default export) from `'supermemory'`.
- Read `apiKey` and `baseURL` from `chrome.storage.local` at call time (not at module import — service worker may start before storage is populated).
- Expose a `getSupermemoryClient()` async function that returns a configured `Supermemory` instance.
- Default `baseURL` to `'http://localhost:6767'`.
- Cache the client per service-worker lifetime (recreate only if `apiKey` changes).

```ts
// shape only — implement fully
export const getSupermemoryClient = async (): Promise<Supermemory> => { ... }
```

> ⚠️ `chrome.storage.local.get` is async. Never call it synchronously. Do not store the client at module level.

**Docs:** https://docs.supermemory.ai/sdk — use `agent-browser` to confirm exact constructor signature and named vs default export.

---

### ST-3 · Types — `lib/types.ts` (full rewrite)

Replace the file contents with the types mandated by PLAN.md §5.

**Keep:**
- `VideoPayload` — gate evaluation context (no changes needed, this is local-only)
- `MemoryGateResult` — `{ store: boolean; confidence?: number }` (no changes needed)

**`CapturePayload` lives in `schemas/capture.schema.ts` only (see ST-5).** Do NOT define it as an interface here — that would duplicate it. `lib/types.ts` imports the Zod-inferred type:

```ts
// lib/types.ts — import, do not redefine
export type { CapturePayload } from '~schemas/capture.schema';
```

**Replace `ExtensionMessage`:**

```ts
export type ExtensionMessage =
  | { type: 'CAPTURE'; payload: CapturePayload }
```

Note: the old `VIDEO_CAPTURED` type is gone. New type is `CAPTURE`.

**Add gate metadata types** (used internally in background.ts only, not stored in SDK):

```ts
export interface GateResult {
  score: number;    // always 0–1 (see ST-4 normalization)
  reason: string;
  source: 'memory-gate' | 'heuristic-fallback';
}
```

**Keep `VideoPayload`** — still used internally by the gate functions for the fields they need (title, channel, description, duration, playedSeconds, watchPercent). Gates receive `CapturePayload` and read from it directly (see ST-4).

---

### ST-4 · Rename Gate + Purge "Gemini Nano" — `lib/memory-gate.ts`

**Rename:** `lib/ai-memory-gate.ts` → `lib/memory-gate.ts`

**Update exports to match the unified gate signature from PLAN.md §11 T2:**

```ts
// Both files export this exact shape:
export const runGate = async (payload: CapturePayload): Promise<GateResult> => { ... }
export const isMemoryGateAvailable = async (): Promise<boolean> => { ... } // memory-gate.ts only
```

**Memory Gate (`lib/memory-gate.ts`) — two changes:**

1. Update `responseConstraint` JSON schema to require `reason`:
```ts
responseConstraint: {
  type: 'object',
  properties: {
    store: { type: 'boolean' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reason: { type: 'string' },      // ← add this
  },
  required: ['store', 'reason'],     // ← require reason
}
```

2. Normalize output to `GateResult`:
```ts
return {
  score: parsed.confidence ?? 0.5,  // 0–1 direct
  reason: parsed.reason,
  source: 'memory-gate',
};
```

**Heuristic Gate (`lib/heuristic-gate.ts`) — three changes:**

1. Remove `export const STORE_THRESHOLD = 30` — threshold is now 0.6 from settings (applied in background.ts).
2. Normalize raw score to 0–1:
```ts
const raw = scorePayload(payload);       // existing scorer unchanged
const score = Math.max(0, Math.min(1, raw / 80));  // 80 = practical max
```
3. Synthesize a `reason` string from dominant signals:
```ts
// Pseudo-logic — adapt from scorePayload internals:
const reason = posMatches > 0
  ? `title keywords: ${topPosMatches.join(', ')}`
  : hasTimestamps
  ? 'structured content (timestamps in description)'
  : `engagement: ${Math.round(payload.playedSeconds)}s played`;
```
4. Map `CapturePayload` fields to heuristic inputs:
- `payload.playedSeconds` → `playedSeconds` (now a first-class field)
- `payload.watchPercent / 100` → normalized watchPercent (0–1) for internal scoring
- `payload.duration` → `durationSeconds`
- `payload.title`, `payload.channel`, `payload.description` → unchanged

> The scoring signal logic (keyword lists, duration buckets, signal weights) does **not** change — only the I/O contract.

**Purge "Gemini Nano" from any string that is NOT a code comment:**
- `rg -w "Gemini Nano" apps/extension/lib/memory-gate.ts` must return zero hits outside comments.

---

### ST-5 · Schemas — `schemas/capture.schema.ts` + `schemas/settings.schema.ts`

**Create dir:** `apps/extension/schemas/`

**`schemas/capture.schema.ts`:** This is the **single source of truth** for `CapturePayload`. `lib/types.ts` re-exports from here — it does NOT duplicate the interface.

```ts
import { z } from 'zod';

export const captureSchema = z.object({
  videoId: z.string().min(1),
  url: z.string().url(),
  title: z.string(),
  channel: z.string(),
  channelId: z.string(),
  channelUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional(),     // from oEmbed; fallback = YouTube CDN
  duration: z.number().nonnegative(),
  watchPercent: z.number().min(0).max(100),      // 0–100 scale
  currentTime: z.number().nonnegative(),         // video position at capture
  playedSeconds: z.number().nonnegative(),       // genuine watch time, excludes seeks
  publishedAt: z.string().optional(),
  description: z.string().max(500).optional(),   // Memory Gate only, from JSON-LD
});

export type CapturePayload = z.infer<typeof captureSchema>;
```

**`schemas/settings.schema.ts`:**

```ts
import { z } from 'zod';

export const settingsSchema = z.object({
  apiKey: z.string().min(1, 'API key is required'),
  baseURL: z.string().url().default('http://localhost:6767'),  // used by SDK singleton + health probe
  containerTag: z.string().min(1).default('user_default'),
  gateThreshold: z.number().min(0).max(1).default(0.6),
});

export type Settings = z.infer<typeof settingsSchema>;
```

> `zod` is a peer dep of the `supermemory` SDK — it should already be in the tree. Verify before adding separately.

---

### ST-6 · Memory Service — `services/memory.service.ts` (full rewrite)

This is the biggest change. The service now wraps the Supermemory SDK, not an HTTP client.

**Delete:** all existing content.  
**Reference:** PLAN.md §5 (Read table), §8 (data flow), §11 T1.  
**Docs:** https://docs.supermemory.ai/sdk — use `agent-browser` to verify exact method signatures.

The service must implement (using SDK client from `lib/supermemory.ts`):

```ts
export class MemoryService {
  // Write a captured video URL to Supermemory
  async add(payload: CapturePayload, meta: {
    valueScore: number;
    gateReason: string;
    gateSource: 'memory-gate' | 'heuristic-fallback';
    watchedAt: string; // ISO
    containerTag: string;
  }): Promise<void>

  // Full-text search
  async search(q: string, containerTag: string): Promise<SearchResult[]>

  // Taste profile — PLAN.md §8 "For You" tab
  async profile(containerTag: string): Promise<{ static: unknown; dynamic: unknown }>

  // Timeline list — reverse chron
  async list(containerTag: string, limit?: number): Promise<Document[]>

  // Delete one memory
  async delete(docId: string): Promise<void>
}
```

The `add` call must match PLAN.md §5 data model exactly:

```ts
await client.add({
  content: payload.url,                        // URL is the content; SDK fetches + transcribes
  customId: `youtube:${payload.videoId}`,      // dedup on re-watch
  containerTag: meta.containerTag,
  metadata: {
    source: 'youtube',
    videoId: payload.videoId,
    url: payload.url,
    title: payload.title,
    channel: payload.channel,
    channelId: payload.channelId,
    channelUrl: payload.channelUrl,
    thumbnailUrl: payload.thumbnailUrl,        // for For You card rows
    duration: payload.duration,
    watchPercent: payload.watchPercent,
    playedSeconds: payload.playedSeconds,      // for timeline display
    watchedAt: meta.watchedAt,
    valueScore: meta.valueScore,               // 0–1, normalized
    gateReason: meta.gateReason,
    gateSource: meta.gateSource,
  },
});
```

Export `mutationOptions` and `queryOptions` helpers for each operation (per AGENTS.md).  
Export `memoryService` singleton.  
Export `MemoryError` typed error class.

---

### ST-7 · HTTP Service — `services/http.ts` (strip to health probe)

Replace with a minimal health probe only. Remove auth logic entirely.

```ts
// services/http.ts — health probe only
// Reads baseURL from chrome.storage.local (falls back to localhost:6767)
// so the probe always targets wherever the user configured the server.
export const probeSupermemory = async (): Promise<boolean> => {
  const { baseURL = 'http://localhost:6767' } = await chrome.storage.local.get({ baseURL: 'http://localhost:6767' });
  try {
    const res = await fetch(`${baseURL as string}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
};
```

No `HttpService` class. No `getStoredToken`. No auth headers. `baseURL` always comes from `chrome.storage.local` — callers pass no arguments.

---

### ST-8 · TanStack Query Tags — `services/tags.ts`

**Create:** `apps/extension/services/tags.ts`

```ts
export const TAGS = {
  memory: {
    all: ['memory'] as const,
    search: (q: string) => [...TAGS.memory.all, 'search', q] as const,
    list: (tag: string) => [...TAGS.memory.all, 'list', tag] as const,
    profile: (tag: string) => [...TAGS.memory.all, 'profile', tag] as const,
  },
} as const;
```

---

### ST-9 · Hooks — `hooks/`

**Create dir:** `apps/extension/hooks/`

All hooks follow AGENTS.md: kebab-case filenames, `useMutation` / `useQuery` wrapping service options, `queryClient.invalidateQueries` on mutations.

**Create four files:**

1. **`hooks/use-memory-search.ts`** — `useQuery` wrapping `memoryService.search(q, containerTag)`
2. **`hooks/use-memory-profile.ts`** — `useQuery` wrapping `memoryService.profile(containerTag)`
3. **`hooks/use-memory-list.ts`** — `useQuery` wrapping `memoryService.list(containerTag)`
4. **`hooks/use-memory-delete.ts`** — `useMutation` wrapping `memoryService.delete(docId)`, invalidates `TAGS.memory.all` on success

Each hook reads `containerTag` from `chrome.storage.local` (or a shared settings hook) rather than hard-coding `'user_default'`.

---

### ST-10 · Background Service Worker — `background.ts` (update)

**Reference:** PLAN.md §6 (capture pipeline), §11 T3.

Key changes from current implementation:

1. **Message type:** listen for `type === 'CAPTURE'` (was `'VIDEO_CAPTURED'`).
2. **Gate availability cache:** cache `isMemoryGateAvailable()` result per SW lifetime; re-probe on `chrome.runtime.onStartup` and `chrome.runtime.onInstalled`.
3. **Gate call:** call `runGate(payload)` from `memory-gate.ts` or `heuristic-gate.ts`; both return `GateResult { score, reason, source }`. The `score` maps to `valueScore` in the SDK write.
4. **Threshold:** read `gateThreshold` from `chrome.storage.local` (default 0.6). Score < threshold → drop.
5. **SDK persist:** call `memoryService.add(payload, { valueScore, gateReason: result.reason, gateSource: result.source, watchedAt: new Date().toISOString(), containerTag })`.
6. **Badge management** (PLAN.md §6):
   - `chrome.action.setBadgeText({ text: '✓' })` on successful write
   - `chrome.action.setBadgeText({ text: '–' })` on gate reject
   - `chrome.action.setBadgeText({ text: '' })` on SPA nav (clear on next `CAPTURE` attempt before gating)
   - `chrome.action.setBadgeBackgroundColor({ color: '#22c55e' })` for ✓, `'#ef4444'` for –
7. **Log `gateSource`** on every capture attempt.

Remove the local queue logic (`queueLocally`) — if the SDK write fails, log the error. Queuing is post-hackathon scope.

---

### ST-11 · Content Script — `contents/youtube.tsx` (update)

**Reference:** PLAN.md §6, §5 (CapturePayload fields).

This sub-task replaces the DOM CSS-selector scraping approach with a more resilient two-source strategy: **YouTube oEmbed API** for video metadata, **HTML5 video element + JSON-LD** for playback data and supplementary fields.

**Why:** YouTube's DOM class names change frequently. oEmbed is a public, stable API (no key, same `host_permissions` domain). JSON-LD `<script type="application/ld+json">` is more stable than class-based selectors.

**Changes from current implementation:**

1. **Message type:** `{ type: 'CAPTURE', payload: CapturePayload }` (was `VIDEO_CAPTURED`). Payload is now `CapturePayload` (not `VideoPayload`).

2. **Trigger thresholds:** `watchPercent ≥ 60 OR playedSeconds ≥ 180`. Current code uses 60s + 8% — update both.

3. **`playedSeconds` tracking:** Keep the existing `timeupdate` delta accumulator (already correctly excludes seeks). Now surface it as `playedSeconds` in the payload (was internal only).

4. **Remove CSS selector extractions** — delete all references to `ytd-channel-name`, `ytd-watch-metadata`, `#description-inline-expander`, `#info-strings`, `#channel-name a`, `#owner-name a`.

5. **Add oEmbed fetch** (called once at capture time, not on mount):
```ts
const fetchOEmbed = async (url: string) => {
  const res = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
  );
  if (!res.ok) return null;
  return res.json() as Promise<{
    title: string;
    author_name: string;
    author_url: string;
    thumbnail_url: string;
  }>;
};
```

6. **`channelId` extraction** from oEmbed `author_url`:
```ts
const extractChannelId = (authorUrl: string): string => {
  const match = authorUrl.match(/\/channel\/(UC[\w-]+)/);
  if (match) return match[1];
  // Fallback: parse JSON-LD
  const ld = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]')?.textContent;
  if (ld) {
    try {
      const parsed = JSON.parse(ld);
      return parsed?.author?.identifier ?? '';
    } catch { return ''; }
  }
  return '';
};
```

7. **`publishedAt` and `description`** from JSON-LD (both optional):
```ts
const getJsonLd = () => {
  const raw = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]')?.textContent;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};
const ld = getJsonLd();
const publishedAt = ld?.uploadDate ?? undefined;
const description = ld?.description?.slice(0, 500) ?? undefined;
```

8. **`thumbnailUrl` fallback:** If oEmbed call fails, use YouTube CDN pattern:
```ts
const thumbnailUrl = oembed?.thumbnail_url ?? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
```

9. **`watchPercent` scale:** `Math.round((video.currentTime / video.duration) * 100)` — 0–100.

10. Keep `yt-navigate-finish` SPA detection + MutationObserver — unchanged.

> **If oEmbed response shape is unclear** — use `agent-browser` to fetch `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ&format=json` and inspect the live response.

---

### ST-12 · Options Page — `options.tsx` (create)

**Reference:** PLAN.md §8 (settings tab spec), §10 (onboarding contract).

Full form with three fields:

| Field | Type | Default | Storage key |
|---|---|---|---|
| API Key | `string` (password input) | `''` | `apiKey` |
| Container Tag | `string` | `'user_default'` | `containerTag` |
| Gate Threshold | `number` (0.0–1.0 slider) | `0.6` | `gateThreshold` |

Behaviour:
- On mount: load current values from `chrome.storage.local`.
- On save: validate with `settingsSchema` (Zod), persist to `chrome.storage.local`, show success toast.
- Include a "Test connection" button that calls `probeSupermemory()` and shows `✓ Connected` / `✗ Not reachable`.
- Onboarding hint: link to the handshake endpoint note from PLAN.md §10 (auto-store key if handshake succeeds on side panel open — options is the fallback manual entry path).

Use Tailwind for layout. Follow AGENTS.md (arrow functions, const, template literals, no direct `fetch` in component).

---

### ST-13 · Popup — `popup.tsx` (implement)

**Reference:** PLAN.md §8, §10.

Replace the stub with a real popup (≤ 320px wide):

```
┌──────────────────────────────┐
│ 🧠 SupaTube                  │
│                              │
│  ● Connected   localhost:6767│  ← probe result (green/red dot)
│                              │
│  [Open Memory Panel]         │  ← primary CTA
│                              │
│  Last saved: 3 min ago       │  ← from chrome.storage.local
│  Today: 4 videos             │
│                              │
│  [Settings]                  │  ← opens options page
└──────────────────────────────┘
```

Behaviour:
- On mount: call `probeSupermemory()` (no args — reads baseURL from storage internally) and show connection status.
- "Open Memory Panel": `chrome.windows.getCurrent(({ id }) => chrome.sidePanel.open({ windowId: id }))`. No extra `windows` permission needed — `getCurrent()` is free in popup context.
- "Settings": `chrome.runtime.openOptionsPage()`.
- "Last saved" / "Today count": read from `chrome.storage.local` (background.ts must write these on each successful capture).

---

### ST-14 · Side Panel — `sidepanel.tsx` (create)

**Reference:** PLAN.md §8 (full spec).

Shell with four tabs in order: **Recall · For You · Timeline · Settings**.

#### Recall tab
- Debounced search input (300ms).
- `useMemorySearch(query, containerTag)` → results.
- Group results by channel (section header) then by date within channel.
- Clicking a result: `chrome.tabs.create({ url: result.metadata.url })`.

#### For You tab
- `useMemoryProfile(containerTag)` → `profile.dynamic`.
- Parse dynamic profile string into interest clusters (split on newline / bullet / `•` / numbered list item; keep top 5).
- For each cluster: `useMemorySearch(cluster, containerTag)` → render horizontal card row (channel, title, thumbnail if available from metadata).
- Refresh button: refetch profile + all cluster queries.

#### Timeline tab
- `useMemoryList(containerTag)` → reverse-chronological list.
- Each item shows: title, channel, date, watch % badge, gate source badge (`AI` / `Heuristic`).
- Filter bar: by channel (text), by date range.
- Delete button per item: `useMemoryDelete()` → `invalidateQueries(TAGS.memory.all)`.

#### Settings tab
- Embed the same form as `options.tsx` (extract to a shared `SettingsForm` component in `components/`).
- Add "Wipe all memory" section: list all docs in container tag → delete each → invalidate. Requires a confirmation dialog.
  - Use `memoryService.list(containerTag, 9999)` to fetch all at once. **Risk logged:** if a user has > ~500 videos the SDK may time out or paginate silently. Acceptable for hackathon v1. Post-hackathon: paginated deletion loop. See `docs/tasks/RISKS.md` (create if missing).

**TanStack Query setup:** Wrap the side panel root in `QueryClientProvider`. In extension context, create the `QueryClient` inside the component (not at module level) to survive SW restarts.

---

### ST-15 · Onboarding Handshake — `background.ts` addition

On `chrome.runtime.onInstalled` and on each `chrome.sidePanel` open event:

1. Call `probeSupermemory()` (from `services/http.ts`).
2. If reachable, `GET http://localhost:6767/handshake` (if this endpoint exists — **verify via `agent-browser` at Supermemory docs before implementing**).
3. If handshake returns an API key, store it in `chrome.storage.local` as `apiKey`.
4. If probe fails or handshake endpoint doesn't exist, do nothing — user must paste key in options.

> **Use `agent-browser`** to check https://docs.supermemory.ai for the `/handshake` endpoint before writing this code. If the endpoint doesn't exist, skip step 2–3 and document the finding in this task file.

---

## Acceptance Criteria (T1 is done when ALL pass)

- [ ] `pnpm build` from `apps/extension/` exits 0 with no TypeScript errors.
- [ ] `pnpm biome check .` from repo root exits 0 (zero lint violations).
- [ ] `rg -w "Gemini Nano" apps/extension/` returns zero hits outside comments.
- [ ] `rg "localhost:3001" apps/extension/` returns zero hits.
- [ ] `rg "VIDEO_CAPTURED" apps/extension/` returns zero hits.
- [ ] Fresh Chrome + `supermemory-server` running: watching a YouTube tutorial until `playedSeconds ≥ 180s OR watchPercent ≥ 60%` writes a document verifiable via `supermemory.documents.list` with correct `thumbnailUrl`, `playedSeconds`, `valueScore` in metadata.
- [ ] Side panel opens from popup button and all four tabs render without console errors.
- [ ] Gate fallback path works: disabling `window.ai` in a test build causes heuristic gate to fire (verify via `gateSource: 'heuristic-fallback'` in stored metadata).
- [ ] Options page saves and retrieves `apiKey`, `containerTag`, `gateThreshold` from `chrome.storage.local`.
- [ ] Badge shows `✓` after a passing capture and `–` after a gate rejection.

---

## File Change Summary

| Action | Path |
|---|---|
| Action | Path | Notes |
|---|---|---|
| ADD | `apps/extension/lib/supermemory.ts` | SDK singleton |
| RENAME | `apps/extension/lib/ai-memory-gate.ts` → `lib/memory-gate.ts` | + reason field + score normalization |
| UPDATE | `apps/extension/lib/types.ts` | Re-export CapturePayload from schema; add GateResult, ExtensionMessage |
| REWRITE | `apps/extension/services/memory.service.ts` | SDK-based; add thumbnailUrl + playedSeconds to metadata write |
| REPLACE | `apps/extension/services/http.ts` | Health probe only; reads baseURL from storage |
| ADD | `apps/extension/services/tags.ts` | TanStack cache keys |
| ADD | `apps/extension/schemas/capture.schema.ts` | Includes thumbnailUrl, playedSeconds |
| ADD | `apps/extension/schemas/settings.schema.ts` | Includes baseURL field |
| ADD | `apps/extension/hooks/use-memory-search.ts` | |
| ADD | `apps/extension/hooks/use-memory-profile.ts` | |
| ADD | `apps/extension/hooks/use-memory-list.ts` | |
| ADD | `apps/extension/hooks/use-memory-delete.ts` | |
| UPDATE | `apps/extension/background.ts` | Gate dispatch, badge, score normalization |
| REWRITE | `apps/extension/contents/youtube.tsx` | oEmbed + JSON-LD extraction; playedSeconds |
| IMPLEMENT | `apps/extension/popup.tsx` | Connection status + side panel CTA |
| CREATE | `apps/extension/options.tsx` | Includes baseURL field |
| CREATE | `apps/extension/sidepanel.tsx` | 4-tab workspace |
| UPDATE | `apps/extension/package.json` | + supermemory, TanStack Query, Tailwind |
| UPDATE | `apps/extension/lib/heuristic-gate.ts` | Normalize score; synthesize reason; remove STORE_THRESHOLD |

---

## Notes for the Implementing Agent

1. **Never commit directly.** Stage all changes and present the diff for review (AGENTS.md golden rule).
2. **Read PLAN.md §13 Conventions** before writing any code — arrow functions, `const`, kebab-case, `@/` alias, Zod in schemas only.
3. **SDK method signatures** — use `agent-browser` to read https://docs.supermemory.ai/sdk rather than guessing. The SDK may have changed since the plan was written.
4. **Plasmo side panel** — use `agent-browser` to read https://docs.plasmo.com/framework/sandbox/sidepanel if the Plasmo side panel file convention is unclear.
5. **Import aliases:** extension code uses Plasmo's `~` prefix (e.g. `~lib/types`, `~schemas/capture.schema`), NOT `@/`. AGENTS.md `@/` alias applies to `apps/web` only. Do not mix them.
5. **Do not remove `apps/web/`** — that is addressed in a separate task (T6 in PLAN.md). This task is extension-only.
6. **TanStack Query in extension context** — the side panel runs in a separate renderer process; do not share a `QueryClient` across popup, options, and side panel.
7. **`watchPercent` scale** — content script sends 0–100; SDK metadata stores 0–100; heuristic gate converts internally (`payload.watchPercent / 100`) before scoring.
8. **Score normalization** — `score` in `GateResult` is ALWAYS 0–1. Memory Gate: `confidence ?? 0.5`. Heuristic: `Math.max(0, Math.min(1, rawScore / 80))`. Background.ts compares `result.score < gateThreshold` (0–1).
9. **oEmbed is fetched at capture time** (not on mount). One fetch per `videoId` per tab session — acceptable since capture triggers once at ≥60% / ≥180s.
