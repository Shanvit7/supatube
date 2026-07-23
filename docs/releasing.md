# Releasing

Releases of `@shanvit7/poiesis` use
[release-please](https://github.com/googleapis/release-please) — the same
tool used by Google, Stripe, and Firebase. **No local commands are needed to
cut a release.** Publishing is fully automated and gated behind an explicit
human decision.

---

## How it works

```
merge PR to main
      │
      ▼
release-please inspects conventional commits
      │
      ├─ opens / updates a "Release PR"
      │   (bumped package.json + CHANGELOG.md preview)
      │
      └─ nothing publishes yet ← the gate
              │
              ▼ (maintainer merges the Release PR when ready)
         publish job runs
              │
              ├─ npm publish --provenance
              └─ GitHub Release created with changelog
```

Two phases, one explicit decision point.

---

## Phase 1 — Merging feature work

Merge PRs to `main` as normal. After each merge, `release-please` reads
the new commits and updates its open Release PR (or creates one if it doesn't
exist yet). Multiple PRs can land before any release — they all accumulate in
the same Release PR.

The Release PR shows exactly what the next version will be and what the
changelog entry will contain. No publish happens.

---

## Phase 2 — Cutting a release

When the maintainer is happy with what's accumulated, they **merge the Release
PR**. That's the only required action. CI then:

1. Tags the commit (`vX.Y.Z`)
2. Publishes to npm with provenance attestation
3. Creates a GitHub Release with the generated changelog

---

## Versioning

`release-please` determines the version bump from commit types:

| Commit | Bump |
|--------|------|
| `fix:`, `perf:`, `chore:` etc. | patch (`0.1.0` → `0.1.1`) |
| `feat:` | minor (`0.1.0` → `0.2.0`) |
| `feat!:` or `BREAKING CHANGE:` footer | major (`0.1.0` → `1.0.0`) |

> **Pre-1.0 note:** `bump-patch-for-minor-pre-major` is enabled, so `feat:`
> commits bump the patch while the major version is `0`. This prevents
> jumping to `0.2.0` for every small feature during early development.
> Remove this setting in `release-please-config.json` once the package
> reaches `1.0.0`.

---

## Commit message conventions

Use [Conventional Commits](https://www.conventionalcommits.org):

```
<type>(<optional scope>): <short description>
```

| Type | Changelog section |
|------|-------------------|
| `feat` | Features |
| `fix` | Bug Fixes |
| `perf` | Performance Improvements |
| `revert` | Reverts |
| `docs` | Documentation |
| `refactor` | Code Refactoring |
| `test` | Tests |
| `build` / `chore` | — (hidden from changelog) |

Commits that don't follow the format are ignored by release-please.

**Breaking changes:**
```
feat!: drop Node 18 support

BREAKING CHANGE: minimum Node version is now 20.
```

---

## Configuration files

| File | Purpose |
|------|---------|
| [`release-please-config.json`](../release-please-config.json) | Package path, release type, changelog settings |
| [`.release-please-manifest.json`](../.release-please-manifest.json) | Tracks current released version — do not edit by hand |

---

## Required secrets

| Secret | What it is |
|--------|-----------|
| `NPM_TOKEN` | npm Automation token — [npmjs.com/settings/~/tokens](https://www.npmjs.com/settings/~/tokens) |

Set it in **GitHub → Settings → Secrets and variables → Actions**.
`GITHUB_TOKEN` is provided automatically.

---

## Workflow file

[`.github/workflows/publish-extension.yml`](../.github/workflows/publish-extension.yml)
