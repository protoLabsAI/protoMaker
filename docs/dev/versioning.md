# Versioning & Releases

## Overview

Automaker uses [Changesets](https://github.com/changesets/changesets) for version management across the monorepo. All publishable library packages share a single version number (**fixed versioning**). The project follows [Semantic Versioning](https://semver.org/) and enforces [Conventional Commits](https://www.conventionalcommits.org/) via commitlint.

## Version Scheme

All `@automaker/*` and `@protolabs/*` packages in `libs/` share a single version (currently `0.x.y`). The `0.x` range signals pre-stable — breaking changes bump the minor version, features/fixes bump the patch.

| Package Group              | Versioning                     | Published    |
| -------------------------- | ------------------------------ | ------------ |
| `libs/*` (13 packages)     | Fixed (all share same version) | Yes (npm)    |
| `apps/server`, `apps/ui`   | Mirrors root version           | No (private) |
| `packages/mcp-server`      | Independent                    | Yes (npm)    |
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

### Automatic (CI)

1. PRs with `.changeset/*.md` files accumulate on `main`
2. The `changeset-release.yml` workflow creates/updates a "Version Packages" PR
3. This PR shows all pending changes and the computed version bump
4. Merging the PR bumps all package versions and generates `CHANGELOG.md`

### Manual

```bash
# Check pending changesets
npm run changeset:status

# Apply version bumps + generate changelogs
npm run changeset:version

# Publish to npm (when ready)
npm run changeset:publish
```

### Creating a GitHub Release (triggers Electron builds)

After `changeset:version` is merged:

```bash
git tag v0.X.Y
git push origin v0.X.Y
gh release create v0.X.Y --generate-notes
```

This triggers `release.yml` which builds Electron binaries for macOS, Windows, and Linux.

## Roadmap

| Version | Milestone                                    |
| ------- | -------------------------------------------- |
| `0.2.0` | Version reset, Changesets + commitlint setup |
| `0.3.0` | Engine E2E, idea-to-production pipeline      |
| `1.0.0` | First stable release                         |
