# @poiesis/pi-extension

A pi extension that turns a YouTube coding tutorial into a **guided lab session**.

Pi reads the video deeply, then acts as your **tutor**: asks questions, recommends patterns, corrects bad tech choices, and guides you through building each chapter yourself.

---

## What it does

```
/poiesis <youtube-url>   →  ingest the video, pi becomes your tutor
/poiesis build           →  scaffold a local repo, generate chapter lab docs, start the lab
```

**Five phases:**

| Phase | What happens |
|-------|-------------|
| **1. Ingest** | Gemini reads the YouTube URL natively — transcripts, chapters, stack detection, key concepts |
| **2. Grill** | One deterministic question: *where should the project be created?* (defaults to `<cwd>/<slug>`). Then pi injects a tutor persona — non-deterministic conversation from there: questions, recommendations, pushback on wrong tech choices. |
| **3. Scaffold** | Local git repo created at the chosen path |
| **4. Build chapters** | For each chapter, Gemini writes a `docs/chapter-N-title.md` lab guide (exercises, key concepts, common mistakes, tutor recommendations). Pi kicks off each chapter in chat. |
| **5. Finalize** | `POIESIS.md` manifest with video timestamp links. Everything committed locally. |

The code in the chapters? **You write it**, with pi guiding you. That's the whole point.

---

## Prerequisites

- [`pi`](https://pi.earendil.works) installed and running
- `GEMINI_API_KEY` set in your environment (free at https://aistudio.google.com/app/apikey)
- `git` configured (`git config --global user.email ...`)
- `bun` (runtime for this extension)
- `cursor` or another editor (configurable)

---

## Setup

```bash
# 1. Install deps
cd apps/pi-extension
bun install

# 2. Set your Gemini key (if not already in ~/.zshrc)
export GEMINI_API_KEY=<your-key>

# 3. .pi/settings.json already wires the extension — nothing else to do
cat .pi/settings.json
# {"extensions": ["./apps/pi-extension"]}
```

Open pi in the `poiesis/` project root. The extension loads automatically.

---

## Usage

```
# Start a tutor session
/poiesis https://www.youtube.com/watch?v=...

# pi analyses the video and starts the tutoring conversation.
# Talk to pi — it knows the video deeply. It will:
#   - Ask what you want to get out of this
#   - Recommend or push back on stack choices
#   - Flag if the video teaches outdated patterns
#   - Tell you what chapters are worth doing vs skipping

# When you're aligned, start the lab:
/poiesis build

# pi will ask 3 quick questions (stack, depth, skip which chapters?),
# then scaffold a local repo and generate chapter lab docs.
# You work through each chapter in your editor while pi tutors you in chat.
```

---

## Project output structure

Project is created wherever you chose during the grill (defaults to `<cwd>/<slug>` — i.e. relative to where pi is running).

```
<chosen-path>/
  docs/
    chapter-01-getting-started.md   ← lab guide (exercises, key concepts, tutor notes)
    chapter-02-auth.md
    ...
  POIESIS.md                        ← manifest with video timestamp links
  <your code as you write it>
```

Each `docs/chapter-N.md` has:
- **What you'll build** — concrete outcome
- **Key concepts** — patterns, not just topic names
- **Lab exercises** — numbered, specific enough to know when you're done
- **Watch out for** — common mistakes for this chapter
- **Tutor recommendations** — opinionated guidance, including where the video does it wrong

---

## Local dev workflow

### Test ingest alone

```bash
cd apps/pi-extension
GEMINI_API_KEY=<key> bun -e "
import { ingest } from './src/ingest.ts';
const r = await ingest('https://www.youtube.com/watch?v=<video-id>', {
  work_dir: '~/Desktop/poiesis-work',
  state_dir: '~/.poiesis',
  llm_model: 'gemini-3.5-flash',
  editor_cmd: 'cursor',
});
console.log(JSON.stringify(r, null, 2));
"
```

### Hot-reload after edits

Open pi, then:
```
/reload
```

### Re-run ingest (force fresh)

```bash
rm ~/.poiesis/builds/<slug>/ingest.json
```

### Re-grill / rebuild plan

```bash
rm ~/.poiesis/builds/<slug>/plan.json
```

Then run `/poiesis build` again.

### Debug extension loading

```bash
pi -e ./apps/pi-extension/index.ts
```

---

## Config

Stored at `~/.poiesis/config.json`. Created on first run.

```json
{
  "state_dir": "~/.poiesis",
  "llm_model": "gemini-3.5-flash",
  "editor_cmd": "cursor",
  "gemini_api_key": "..."
}
```

Project location is chosen per-session during the grill (defaults to `<cwd>/<slug>`, stored in `~/.poiesis/builds/<slug>/project-dir.txt`).

`GEMINI_API_KEY` env var takes priority over `gemini_api_key` in the config.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `GEMINI_API_KEY not set` | `export GEMINI_API_KEY=<key>` or add to `~/.zshrc` |
| Gemini returns non-JSON | It's a fluke — re-run ingest (delete `ingest.json`) |
| `/poiesis build` says no video found | Run `/poiesis <url>` first — ingest writes `~/.poiesis/last-ingest.txt` |
| Project created in wrong place | Delete `~/.poiesis/builds/<slug>/project-dir.txt` and run `/poiesis <url>` again to re-pick the location |
| Extension doesn't load | Check `.pi/settings.json` path matches `./apps/pi-extension`; run `pi -e ./apps/pi-extension/index.ts` for errors |
| Scaffold fails | Check `~/Desktop/poiesis-work/` exists and is writable |
| Chapter doc is vague | Gemini 2.5 Pro has the most detailed output; check `~/.poiesis/builds/<slug>/logs/chapter-N.json` |

---

## Post-v0 (not yet)

- GitHub push (`gh repo create`)
- `--continue` / `--redo-chapter` flags
- TDD mode (tests-before-impl per chapter)
- Non-YouTube sources
- Multi-user / packaging
