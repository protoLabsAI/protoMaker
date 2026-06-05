# Release Command

Cut a new release by bumping the fixed `@protolabsai/*` package group via **changesets**, then merging the release PR — `auto-release.yml` tags the version and posts release notes to Discord on merge to `main`.

> The release version is read from **`libs/types/package.json`** by `auto-release.yml`. The whole `@protolabsai/*` group is versioned together (changesets `fixed` group). There is no Electron build and no manual tagging — do **not** hand-edit `apps/ui`/`apps/server` `package.json` versions.

## Usage

Optionally accepts a bump type (`patch` | `minor` | `major`). If omitted, `release:prepare` derives it from conventional commits since the last tag (`feat:` → minor, `fix:`/`perf:`/`refactor:` → patch, `BREAKING CHANGE` → major).

## Instructions

1. **Branch off main**

   ```bash
   git checkout main && git pull
   git checkout -b chore/release-vX.Y.Z   # fill in after step 2 prints the version
   ```

2. **Prepare the changeset** — auto-generates `.changeset/<id>.md` from conventional commits since the last tag:

   ```bash
   npm run release:prepare
   ```

   It prints the computed bump type, the commit summary, and the resulting version. (To force a bump type, write a changeset by hand with `npm run changeset` instead.)

3. **Apply the version bump** — bumps the fixed `@protolabsai/*` group and writes CHANGELOGs:

   ```bash
   npm run changeset:version
   npm install --package-lock-only   # sync package-lock.json with the new internal versions
   ```

   Verify: `node -p "require('./libs/types/package.json').version"` shows the new version, and `git status` shows the package.json/CHANGELOG group + lockfile changed (and the `.changeset/<id>.md` consumed).

4. **Commit the release**

   ```bash
   git add -A
   git commit -m "chore: release vX.Y.Z"
   ```

   Keep the subject lowercase after `chore:` (commitlint `subject-case`). The body can list the bundled `feat`/`fix` commits since the last tag.

5. **Open the PR and merge to main**

   ```bash
   git push -u origin chore/release-vX.Y.Z
   gh pr create --base main --title "chore: release vX.Y.Z" --body "..."
   ```

   Merge once CI is green. The release PR changes `package.json` + lockfile (not just `**.md`), so the merge is **not** ignored by `auto-release.yml`'s `paths-ignore`.

6. **Verify the release fired**
   - `auto-release.yml` runs on the merge commit: reads the version from `libs/types/package.json`, creates the `vX.Y.Z` tag, and posts gateway-themed release notes to the Discord release channel.
   - It **no-ops** if `vX.Y.Z` is already tagged (so always bump in the PR before merging).
   - Confirm with `git ls-remote --tags origin vX.Y.Z` and check the Discord release channel.

## Manual re-post

To re-post notes for an already-tagged release (e.g. after a transient Discord failure), run `auto-release.yml` via `workflow_dispatch` with `version` (e.g. `v0.110.0`) and `previous_version` set — it regenerates + re-posts notes and never tags.

## Key files

- `scripts/prepare-release-changeset.mjs` — `release:prepare` (conventional-commit → changeset)
- `.changeset/config.json` — the fixed `@protolabsai/*` package group
- `.github/workflows/auto-release.yml` — tags from `libs/types/package.json` + posts Discord notes on merge to `main`
