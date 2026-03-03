# Versioning & Releases

## Overview

protoLabs Studio uses [Changesets](https://github.com/changesets/changesets) for version management across the monorepo. All publishable library packages share a single version number (**fixed versioning**). The project follows [Semantic Versioning](https://semver.org/) and enforces [Conventional Commits](https://www.conventionalcommits.org/) via commitlint.

## Version Scheme

All `@protolabs-ai/*` and `@protolabs/*` packages in `libs/` share a single version (currently `0.x.y`). The `0.x` range signals pre-stable — breaking changes bump the minor version, features/fixes bump the patch.

| Package Group              | Versioning                     | Published                    |
| -------------------------- | ------------------------------ | ---------------------------- |
| `libs/*` (13 packages)     | Fixed (all share same version) | No (via GitHub Release only) |
| `packages/mcp-server`      | Fixed (same version as libs)   | No (via GitHub Release only) |
| `apps/server`, `apps/ui`   | Mirrors root version           | No (private)                 |
| `packages/create-protolab` | Independent                    | No (private)                 |

## Commit Message Format

All commits must follow Conventional Commits. The `commit-msg` hook enforces this via commitlint.

```
type(scope): description

[optional body]

[optional footer]
```

### Types

| Type       | Description                  | Version Bump |
| ---------- | ---------------------------- | ------------ |
| `feat`     | New feature                  | Minor (0.x)  |
| `fix`      | Bug fix                      | Patch        |
| `chore`    | Maintenance, deps, config    | None         |
| `docs`     | Documentation only           | None         |
| `refactor` | Code change (no feature/fix) | None         |
| `perf`     | Performance improvement      | Patch        |
| `test`     | Adding/fixing tests          | None         |
| `build`    | Build system changes         | None         |
| `ci`       | CI config changes            | None         |
| `style`    | Formatting, whitespace       | None         |
| `revert`   | Revert a previous commit     | Patch        |
| `epic`     | Epic-scoped commit           | Minor (0.x)  |

### Examples

```bash
feat(types): add IntegrationDescriptor schema
fix(server): prevent duplicate health check calls
chore: update dependencies
refactor(flows): simplify content pipeline state
docs: add versioning guide
```

### Bypassing (agents only)

Autonomous agents may use `--no-verify` when commit message formatting is impractical. This is acceptable because version bumps are driven by changeset files, not commit messages.

## Creating a Changeset

When you make a change that should be included in the next release:

```bash
npx changeset
```

This prompts you to:

1. Select which packages changed
2. Choose bump type (patch/minor/major)
3. Write a summary of the change

It creates a markdown file in `.changeset/` — commit this with your PR.

### Quick changeset (non-interactive)

```bash
npx changeset add --empty  # Creates an empty changeset (for chore/docs changes)
```

### When to create a changeset

- **Yes**: New features, bug fixes, breaking changes, performance improvements
- **No**: Documentation-only changes, test-only changes, CI config, internal refactors with no API change

## Release Process

### Automated Pipeline (CI)

The full release flow is automated via `auto-release.yml`, triggered automatically when a `staging→main` PR merges:

```
staging → main PR merged
    ↓
auto-release.yml
    ├── verify GH_PAT is set (warning if absent — Electron build chain won't fire)
    ├── clean stale changesets
    ├── npm run release:prepare  (analyze commits since last tag → minor/patch/major)
    ├── npm run changeset:version  (bump all @protolabs-ai/* in lockstep, write CHANGELOG)
    ├── git commit "chore: release vX.Y.Z" → pushed to main
    ├── git tag vX.Y.Z → pushed via GH_PAT (triggers build-electron.yml)
    │               ↓
    │       build-electron.yml (macOS + Linux + Windows Electron builds)
    │       → artifacts uploaded to GitHub Release
    └── sync version bump back: main → staging (auto-merge PR) + main → dev (auto-merge PR)
```

No manual changeset creation or "Version Packages" PR is required for normal releases — `release:prepare` analyzes conventional commits automatically. The sync-back step ensures `staging` and `dev` always reflect the version bump commit that lands on `main`, preventing version drift across branches.

### Release Notes Rewriting

Raw GitHub-generated release notes (which list PR titles) can be rewritten into polished, user-facing notes via an LLM-powered script:

```bash
# Auto-detect tags and generate notes
node scripts/rewrite-release-notes.mjs

# Specify versions + post to Discord
node scripts/rewrite-release-notes.mjs v0.30.1 v0.29.0 --post-discord
```

The rewriter filters out merge/chore/promote commits, sends the rest to Claude (Haiku 4.5), and returns themed sections grouped by user impact. The prompt template is also available programmatically via `@protolabs-ai/prompts`:

```typescript
import { RELEASE_NOTES_SYSTEM_PROMPT, buildReleaseNotesPrompt } from '@protolabs-ai/prompts';
```

See [release.md](./release.md) for full documentation including voice guidelines, CI integration, and enable/disable instructions.

### Manual

```bash
# Check pending changesets
npm run changeset:status

# Apply version bumps + generate changelogs
npm run changeset:version

# Publish to npm (when ready)
npm run changeset:publish
```

### Prerequisites

- `GH_PAT` secret must be set in GitHub repo settings — required for `auto-release.yml` to push tags that trigger `build-electron.yml` (falls back to `GITHUB_TOKEN` but won't fire Electron builds). `auto-release.yml` validates this at startup and emits a warning if absent so the gap is visible in the Actions log.
- A baseline git tag (e.g., `v0.2.0`) must exist for `release:prepare` to analyze commits

## Roadmap

| Version | Milestone                                    |
| ------- | -------------------------------------------- |
| `0.2.0` | Version reset, Changesets + commitlint setup |
| `0.3.0` | Engine E2E, idea-to-production pipeline      |
| `1.0.0` | First stable release                         |
