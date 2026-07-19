# @shanvit7/poiesis

A [pi](https://pi.earendil.works) extension that turns any YouTube coding tutorial into a **guided, hands-on build session**.

Pi reads the video deeply, grills you on what you want out of it, then codes through it chapter by chapter — explaining every decision, flagging outdated patterns, and making sure you actually understand what's being built.

---

## Install

```bash
pi install npm:@shanvit7/poiesis
```

You'll also need a free Gemini API key — get one at https://aistudio.google.com/app/apikey — then add it to your shell:

```bash
export GEMINI_API_KEY=your-key-here
```

---

## Usage

```
/poiesis <youtube-url>   →  ingest the video, pi becomes your tutor
/poiesis build           →  scaffold a local repo, generate chapter lab guides, start the lab
/poiesis whoami          →  rescan your local projects + GitHub to refresh your profile
```

### Workflow

```bash
# 1. Feed pi a coding tutorial
/poiesis https://www.youtube.com/watch?v=...

# pi reads the video deeply (transcripts, chapters, stack, key concepts).
# Then the tutor session begins — pi will:
#   - Ask where to create the project
#   - Recommend or push back on stack choices
#   - Flag chapters that teach outdated patterns
#   - Tell you which chapters are worth doing vs. skipping

# 2. When you're aligned, kick off the lab
/poiesis build

# pi asks 3 quick questions (stack, depth, skip which chapters?),
# scaffolds a local repo, and generates a chapter-by-chapter lab guide.
# Pi codes through each chapter in chat. You follow along and understand.
```

---

## What gets created

Project is placed wherever you chose during the tutor session (defaults to `<cwd>/<slug>`).

```
<chosen-path>/
  docs/
    chapter-01-getting-started.md   ← lab guide: concepts, exercises, tutor notes
    chapter-02-auth.md
    ...
  POIESIS.md                        ← manifest with video timestamp links
  <your code as you build it>
```

Each chapter guide includes:
- **What you'll build** — concrete outcome
- **Key concepts** — patterns, not just topic names
- **Lab exercises** — specific enough to know when you're done
- **Watch out for** — common mistakes
- **Tutor recommendations** — opinionated guidance, including where the video gets it wrong

---

## Five phases

| Phase | What happens |
|-------|-------------|
| **Ingest** | Gemini reads the YouTube URL — transcripts, chapters, stack detection, key concepts |
| **Grill** | Pi injects a tutor persona and starts a conversation: goals, stack, recommendations |
| **Scaffold** | Local git repo created at the chosen path |
| **Build chapters** | Pi generates a `docs/chapter-N.md` lab guide per chapter, narrating decisions in chat |
| **Finalize** | `POIESIS.md` written with video timestamp links |

---

## Prerequisites

- [`pi`](https://pi.earendil.works) — the coding agent
- `GEMINI_API_KEY` — free at https://aistudio.google.com/app/apikey
- `git` configured (`git config --global user.email ...`)
- `agent-browser` (optional, enables live doc lookups during the session) — `npm i -g agent-browser && agent-browser install`

---

## Config

Stored at `~/.poiesis/config.json` — created on first run, no manual setup needed.

```json
{
  "state_dir": "~/.poiesis",
  "llm_model": "gemini-3.5-flash",
  "editor_cmd": "cursor",
  "gemini_api_key": "..."
}
```

`GEMINI_API_KEY` env var takes priority over the config value.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `GEMINI_API_KEY not set` | `export GEMINI_API_KEY=<key>` or add to `~/.zshrc` |
| Gemini returns non-JSON | Transient — re-run ingest: `rm ~/.poiesis/builds/<slug>/ingest.json` |
| `/poiesis build` says no video found | Run `/poiesis <url>` first |
| Project created in wrong place | `rm ~/.poiesis/builds/<slug>/project-dir.txt` then re-run `/poiesis <url>` |
| Chapter doc is vague | Switch to `gemini-2.5-pro` in `~/.poiesis/config.json` |

---

## Local development

```bash
# Test without publishing — installs from local path globally
pi install /path/to/poiesis/apps/pi-extension

# One-off test without installing
pi -e /path/to/poiesis/apps/pi-extension

# Hot-reload after edits (while pi is running)
/reload

# Force fresh ingest for a video
rm ~/.poiesis/builds/<slug>/ingest.json

# Force re-plan (re-run the 3 build questions)
rm ~/.poiesis/builds/<slug>/plan.json
```
