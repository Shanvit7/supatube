# Releasing

Releases of `@shanvit7/poiesis` are **fully automated**. Merging to `main`
with changes inside `apps/pi-extension/` triggers the pipeline — no manual
`npm publish`, no hand-edited changelogs.

---

## What triggers a release

The workflow watches one path:

```
apps/pi-extension/**
```

A push (or merged PR) to `main` that touches **any file inside that path**
kicks off the release job. Changes outside it (e.g. `apps/web/`) are ignored.

---

## What the pipeline does

1. **Bump patch version** — `package.json` version is incremented automatically
   (`0.0.1` → `0.0.2`). No human touches the version field.

2. **Generate changelog** — [`git-cliff`](https://git-cliff.org) reads all
   unreleased commits scoped to `apps/pi-extension/**` and produces a
   formatted entry grouped by type.

3. **Commit & tag** — The version bump and updated `CHANGELOG.md` are committed
   with `[skip ci]` (so the commit doesn't re-trigger the workflow) and tagged
   `vX.Y.Z`.

4. **Publish to npm** — Package is published to the npm registry with
   provenance attestation (links the package to the exact commit + workflow run).

5. **Create GitHub Release** — A release is created on GitHub with the
   generated changelog as the body.

---

## Versioning

This package follows [Semantic Versioning](https://semver.org).

| Change | Version bump | Who does it |
|--------|-------------|-------------|
| Patch (bug fix, chore, docs) | `0.0.1` → `0.0.2` | Automated on every merge |
| Minor (new feature, non-breaking) | `0.0.2` → `0.1.0` | Run `npm version minor` locally, push |
| Major (breaking change) | `0.1.0` → `1.0.0` | Run `npm version major` locally, push |

> For minor/major bumps: edit `package.json` version manually or run
> `npm version minor/major --no-git-tag-version` in `apps/pi-extension/`,
> commit it, and push. The CI pipeline will pick it up as-is and skip the
> patch bump (it only bumps patch when no version change is already present).

---

## Commit message conventions

The changelog is generated from commit messages. Use the
[Conventional Commits](https://www.conventionalcommits.org) format:

```
<type>(<optional scope>): <short description>
```

| Type | Shows up in changelog as |
|------|--------------------------|
| `feat` | Features |
| `fix` | Bug Fixes |
| `perf` | Performance |
| `refactor` | Refactoring |
| `docs` | Documentation |
| `test` | Testing |
| `chore` | Chores |

Commits that don't match any type are filtered out of the changelog.

**Breaking changes** — append `!` after the type or add a
`BREAKING CHANGE:` footer:

```
feat!: drop support for Node 18
```

This renders a ⚠️ BREAKING marker next to the entry.

---

## Changelog

[`CHANGELOG.md`](../apps/pi-extension/CHANGELOG.md) lives inside the
package directory and is auto-prepended on every release. Do not edit it by
hand — it will be overwritten.

---

## Required secrets

One secret must be set in the GitHub repository
(**Settings → Secrets and variables → Actions**):

| Secret | What it is |
|--------|-----------|
| `NPM_TOKEN` | npm Automation token from [npmjs.com/settings/~/tokens](https://www.npmjs.com/settings/~/tokens) |

`GITHUB_TOKEN` is provided automatically by GitHub Actions — nothing to
configure.

---

## Running a release manually

The workflow supports manual dispatch. Go to
**GitHub → Actions → Publish pi-extension → Run workflow**.

---

## Workflow file

[`.github/workflows/publish-extension.yml`](../.github/workflows/publish-extension.yml)
