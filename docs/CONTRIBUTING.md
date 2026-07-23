# Contributing

Thanks for taking the time to contribute. This is a monorepo — two packages, one shared toolchain.

---

## Repo structure

```
poiesis/
  apps/
    pi-extension/   ← the pi package (@shanvit7/poiesis) — prompts, skills, tools
    web/            ← landing page (Next.js)
  docs/             ← you are here
```

Most contributions will touch `apps/pi-extension`.

---

## Getting started

```bash
git clone https://github.com/Shanvit7/poiesis
cd poiesis
pnpm install

# pi-extension uses bun separately
cd apps/pi-extension
bun install
```

---

## Dev loop

```bash
# Install from local path into pi
pi install /path/to/poiesis/apps/pi-extension

# Test without installing
pi -e /path/to/poiesis/apps/pi-extension

# Hot-reload after edits (inside a pi session)
/reload
```

---

## What to contribute

| Area | Where | Notes |
|------|-------|-------|
| Bug fixes | `src/` or `prompts/` | Open an issue first if non-obvious |
| New features | `src/` | Open a discussion before a large change |
| Prompt improvements | `prompts/` | Highest leverage — small wording changes have big effects |
| Eval cases | `promptfooconfig.yaml` | Covers tricky scenarios Pi gets wrong |
| Docs | `docs/` or `README.md` | Always welcome |
| Skills | `skills/` | New skill = new directory with `SKILL.md` |

---

## Running evals

Before opening a PR that touches `prompts/`:

```bash
cd apps/pi-extension
bun run eval        # runs promptfoo against all cases
bun run eval:view   # open the results UI
```

CI runs `eval:ci` automatically on PRs that touch `prompts/` or `promptfooconfig.yaml`.

---

## Commit style

This repo uses [Conventional Commits](https://www.conventionalcommits.org). The release changelog is generated from them — a clear message = a clear changelog entry.

```
feat: add prereq gate for TypeScript chapters
fix: chapter state lost after context compaction
docs: clarify install steps in README
chore: update promptfoo to v0.122
```

Breaking changes:

```
feat!: change profile schema — existing profiles need migration
```

---

## Pull request checklist

- [ ] Branch off `main`, not off another feature branch
- [ ] Commits follow Conventional Commits format
- [ ] Prompt changes have a corresponding eval case or updated existing one
- [ ] `pnpm biome check .` passes with no errors
- [ ] PR description explains *what* changed and *why*

---

## Code style

Enforced by [Biome](https://biomejs.dev) — see [`AGENTS.md`](../AGENTS.md) for the full spec. Auto-fix before pushing:

```bash
pnpm biome check --write .
```

The pre-commit hook runs this automatically on staged files.

---

## Releasing

Releases are automated via release-please. Contributors don't need to touch versions or changelogs — just merge to `main` with conventional commits. See [`docs/releasing.md`](./releasing.md) for the full flow.

---

## Ground rules

- The command-review gate must not be bypassable during an active session
- Prompts live in `prompts/`, logic in `src/` — keep them separate
- Open an issue before a large refactor so we can align first
- All contributors are credited in the changelog

---

## Questions

Open a [GitHub Discussion](https://github.com/Shanvit7/poiesis/discussions) — issues are for bugs and concrete feature requests.
