# Versioning & Releases

## Overview

Automaker uses [Changesets](https://github.com/changesets/changesets) for version management across the monorepo. All publishable library packages share a single version number (**fixed versioning**). The project follows [Semantic Versioning](https://semver.org/) and enforces [Conventional Commits](https://www.conventionalcommits.org/) via commitlint.

## Version Scheme

All `@protolabs-ai/*` and `@protolabs/*` packages in `libs/` share a single version (currently `0.x.y`). The `0.x` range signals pre-stable — breaking changes bump the minor version, features/fixes bump the patch.

| Package Group              | Versioning                     | Published    |
| -------------------------- | ------------------------------ | ------------ |
| `libs/*` (13 packages)     | Fixed (all share same version) | Yes (npm)    |
| `packages/mcp-server`      | Fixed (same version as libs)   | Yes (npm)    |
| `apps/server`, `apps/ui`   | Mirrors root version           | No (private) |
| `packages/create-protolab` | Independent                    | Yes (npm)    |

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

The full release flow is automated via `changeset-release.yml`:

```
PR merged → changesets/action creates "Version Packages" PR
  → Merge Version PR → npm publish + GitHub Release + site changelog refresh
```

1. **Prepare a changeset** — run `npm run release:prepare` to auto-generate a changeset from conventional commits since the last tag, or use `npx changeset` for interactive mode
2. **Commit the changeset file** with your PR (or as a standalone PR)
3. **CI opens a "Version Packages" PR** showing pending version bumps and changelog entries
4. **Merge the Version Packages PR** — CI automatically:
   - Publishes all packages to npm (`changeset publish`)
   - Creates a GitHub Release with `--generate-notes` (triggers Electron builds via `release.yml`)
   - Regenerates site data (`npm run stats:generate`) and commits to main

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

- `NPM_TOKEN` secret must be set in GitHub repo settings (Settings → Secrets → Actions)
- A baseline git tag (e.g., `v0.2.0`) must exist for `release:prepare` to analyze commits

## Roadmap

| Version | Milestone                                    |
| ------- | -------------------------------------------- |
| `0.2.0` | Version reset, Changesets + commitlint setup |
| `0.3.0` | Engine E2E, idea-to-production pipeline      |
| `1.0.0` | First stable release                         |
