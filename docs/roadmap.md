# Poiesis Roadmap

Ideas deferred from v0. Revisit when the core loop is solid.

---

## User Intelligence Scan (pre-grill)

**Problem:** The grill currently asks the user about their experience, background, and what projects they've built. This is redundant interrogation — the answer is already on their machine and GitHub.

**Idea:** Before the tutor session starts, run a silent scan:

- **Local scan** — list projects on `~/Desktop`, `~/projects`, `~/dev`, etc. Look at `package.json`, `Cargo.toml`, `go.mod`, `requirements.txt` to infer the stacks they actually use, not what they claim.
- **GitHub scan** — `gh repo list --limit 50 --json name,languages,updatedAt` to see what they've shipped, how recently, what languages dominate.
- **Infer level** — from repo count, languages, recency, and project complexity (lines of code, deps, presence of tests), build a rough profile: `{ primaryStack, experienceLevel, recentActivity, relevantProjects }`.
- **Persist as memory** — save to `~/.poiesis/user-profile.json`. Refresh only if older than 7 days or user explicitly asks to rescan.

**Result:** The tutor already knows who the user is before asking a single question. The grill becomes a calibration conversation, not an intake form. Questions become targeted ("I see you've built X — does this feel similar?") rather than blank-slate ("what's your experience with Y?").

**Tool to add:** `poiesis_scan_user` — runs at session start if profile is missing or stale. Silent unless it finds something worth surfacing.

**Trigger:** Either automatic on `/poiesis <url>`, or explicit `/poiesis scan`.

---

## Other Deferred Ideas

- GitHub push / remote repo creation (post local-only v0)
- `--continue` flag to resume a mid-build session
- Non-YouTube sources (docs pages, GitHub repos, blog posts as tutorial source)
- TDD mode per chapter (two commits: failing tests → passing implementation)
- `/poiesis status` command — show all active sessions, their phase, project path
