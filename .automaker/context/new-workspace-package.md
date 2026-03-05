# Creating New Workspace Packages (libs/*)

When a feature requires creating a new package under `libs/`, follow these rules exactly. Skipping any step will cause CI failures that require manual intervention.

## Required Checklist

### 1. Version ranges for internal workspace deps

ALL `@protolabsai/*` deps in your new `package.json` MUST use the current monorepo version range: `"^0.19.0"`. Do NOT use older ranges like `^0.15.x` or `^0.6.x` — even if that was the version at the time of writing.

```json
{
  "dependencies": {
    "@protolabsai/types": "^0.19.0",
    "@protolabsai/utils": "^0.19.0"
  }
}
```

Check the current range by looking at any other lib: `cat libs/flows/package.json | grep protolabs-ai`

Using the wrong version causes `npm install` to try fetching `@protolabsai/types@^0.6.0` from the public npm registry → 404 → CI failure.

### 2. Add to Dockerfile

Every new `libs/<name>` MUST have a `COPY` entry added to `Dockerfile` in the base stage (around line 24-37). Find the block that starts with `# Copy all libs package.json files` and add your lib alphabetically:

```dockerfile
COPY libs/flows/package*.json ./libs/flows/
COPY libs/<your-new-lib>/package*.json ./libs/<your-new-lib>/   # ADD THIS
COPY libs/observability/package*.json ./libs/observability/
```

Omitting this causes the `Validate Dockerfile dependencies` CI step to fail with: `WARNING: libs not in Dockerfile base COPY: <your-lib>`

### 3. Update package-lock.json

After creating the new package, the lock file will be stale. Run `npm install --ignore-scripts` from the repo root to regenerate it — but only if you have network access. If the lock file cannot be regenerated (no network, registry issues), you MUST manually update two entries in `package-lock.json`:

**Entry 1** — the package metadata (under `packages.libs/<name>`):
```json
"libs/<name>": {
  "name": "@protolabsai/<name>",
  "version": "0.19.0",
  "license": "SEE LICENSE IN LICENSE",
  "dependencies": { ... },
  "devDependencies": { ... }
}
```

**Entry 2** — the workspace symlink (under `packages.node_modules/@protolabsai/<name>`):
```json
"node_modules/@protolabsai/<name>": {
  "resolved": "libs/<name>",
  "link": true
}
```

### 4. Format all new files before committing

New files in a worktree are NOT covered by the auto-format hook because `.worktrees/` is excluded by `.prettierignore`. Manually format before staging:

```bash
npx prettier --write --ignore-path /dev/null libs/<name>/src/**/*.ts libs/<name>/tests/**/*.ts
```

### 5. Version the new package consistently

Set `"version": "0.19.0"` in the new `package.json` to match the current monorepo version. Agents sometimes write `0.6.0` or other stale versions from training data — always check and correct.

## Verification Before Committing

```bash
# 1. Build succeeds
npm run build:packages

# 2. Tests pass
npm run test --workspace=libs/<name>

# 3. No ChatAnthropic/ChatOpenAI hardcoded instantiations (if a flow lib)
grep -r "new ChatAnthropic\|new ChatOpenAI" libs/<name>/src/

# 4. Dockerfile has COPY entry
grep "libs/<name>" Dockerfile

# 5. Lock file has the new package
grep -A2 '"libs/<name>"' package-lock.json | head -5
```
