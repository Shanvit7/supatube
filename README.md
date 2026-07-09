# SupaTube

> **Remember what you actually learn on YouTube.**

A Chrome extension that uses on-device AI (**Memory Gate**) to decide what's worth keeping — then makes it instantly searchable through Supermemory Local. Zero cloud. No accounts. 100% private.

Built for the [localhost:6767 Hackathon](https://instinctive-chance-ed9.notion.site/Localhost-6767-392222a60c568030ab86e7729d765bbe) — the Supermemory Local build challenge.

---

## Links

| | |
|---|---|
| 🌐 Landing page | _deploy URL — coming soon_ |
| 🎥 Demo video | _≤ 90s — coming soon_ |
| 📋 Full spec | [`docs/PLAN.md`](docs/PLAN.md) |
| 🔄 Pivot log | [`docs/PIVOT.md`](docs/PIVOT.md) |

---

## What it does

Most YouTube watching produces nothing searchable. SupaTube runs silently in the background:

1. **Watches** what you actually engage with — no manual tagging.
2. **Memory Gate** (on-device AI via Chrome's built-in model) scores every video for depth and relevance. Shallow content — music, background video, shorts — is ignored.
3. **Writes** the YouTube URL to [Supermemory Local](https://supermemory.ai) (running at `localhost:6767`). Supermemory transcribes the video, extracts concepts, and updates your profile automatically.
4. **Recall anytime** via the Side Panel: search, browse your timeline, or see a personalised _For You_ feed built from your taste profile.

---

## Privacy

- **No data leaves your machine** unless you explicitly set a non-local `baseURL`.
- Network requests: `youtube.com` (content script) + `localhost:6767` (Supermemory) + Chrome on-device AI APIs only.
- No analytics, no telemetry, no third-party services.
- All settings stored in `chrome.storage.local` — never `chrome.storage.sync`.

---

## Repo layout

```
supatube/
├── apps/
│   ├── extension/          Plasmo Chrome extension (the product)
│   │   ├── popup.tsx       Toolbar popup — status + open Side Panel
│   │   ├── sidepanel.tsx   Workspace shell — Recall / For You / Timeline / Settings
│   │   ├── options.tsx     API key, container tag, gate threshold
│   │   ├── background.ts   Service worker — Memory Gate + SDK writes
│   │   ├── contents/
│   │   │   └── youtube.tsx Content script — YouTube signal capture
│   │   ├── lib/
│   │   │   ├── supermemory.ts      SDK singleton
│   │   │   ├── memory-gate.ts      On-device AI scorer (Memory Gate)
│   │   │   └── heuristic-gate.ts   Fallback scorer
│   │   ├── services/
│   │   │   └── memory.service.ts   SDK wrapper (add / search / profile / list / delete)
│   │   ├── hooks/                  use-memory-*.ts (TanStack Query)
│   │   └── schemas/                Zod schemas — capture payload + settings
│   └── web/                Single static landing page (Next.js → export)
│       └── src/app/page.tsx Hero, How it works, Setup, Privacy strip, Footer
└── docs/
    ├── PIVOT.md
    └── PLAN.md
```

---

## Quick start

### 1 — Install Supermemory Local

```bash
curl -fsSL https://supermemory.ai/install | bash
```

### 2 — Start the memory server

```bash
supermemory-server
# → running at http://localhost:6767
# → prints your API key on first boot
```

### 3 — Load the extension

```bash
# from the repo root:
pnpm install
pnpm --filter @supatube/extension dev
```

Then in Chrome:
- Open `chrome://extensions`
- Enable **Developer mode**
- **Load unpacked** → select `apps/extension/build/chrome-mv3-dev`

> The extension auto-detects the running Supermemory server and stores the API key — no manual copy-paste needed if the handshake succeeds.

---

## Commands

### Root workspace

| Command | What it does |
|---|---|
| `pnpm install` | Install all dependencies |
| `pnpm build` | Build all apps |
| `pnpm lint` | Lint everything (Biome) |
| `pnpm check` | Lint + auto-fix |
| `pnpm format` | Format with Biome |

### Extension (`apps/extension`)

| Command | What it does |
|---|---|
| `pnpm --filter @supatube/extension dev` | Build extension + watch for changes |
| `pnpm --filter @supatube/extension build` | Production build (`.crx` zip) |

### Landing page (`apps/web`)

| Command | What it does |
|---|---|
| `pnpm --filter @supatube/web dev` | Local dev server (`localhost:3000`) |
| `pnpm --filter @supatube/web build` | Static export → `apps/web/out/` |

---

## Stack

| Layer | Choice |
|---|---|
| Extension framework | [Plasmo](https://plasmo.com) |
| Memory store | [Supermemory Local](https://supermemory.ai) `localhost:6767` |
| Memory client | `supermemory` SDK (sole entrypoint to `:6767`) |
| On-device AI gate | Chrome built-in model via `window.ai` (**Memory Gate**) |
| Landing page | Next.js 15 — static export |
| Styling | Tailwind CSS v4 |
| Data-fetching (extension) | TanStack Query — Service → Hook → Component |
| Schema validation | Zod |
| Linter / formatter | Biome |

---

## License

MIT
