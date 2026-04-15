---
title: Publishing @protolabsai/mcp-server to GitHub Packages
summary: Design for distributing the studio MCP server to agents that consume it (protoContent, future fleet additions) without the current copy-the-dist bundling approach.
status: design
owner: platform
---

# Publishing @protolabsai/mcp-server to GitHub Packages

## Context

Today, agents that need the studio MCP server (currently just protoContent, eventually any agent needing board read/write) consume it by **copying a pre-built `dist/` directory** into their own repo under `mcp-server/`. Example:

```
protoContent/
├── mcp-server/
│   ├── index.js          # hand-copied from ava/packages/mcp-server/dist/
│   ├── index.d.ts
│   ├── tools/
│   ├── node_modules/     # committed? cached? ad-hoc.
│   └── package.json      # { "name": "protocontent-mcp-bridge", ... }
```

This "bundle-by-copy" is the current Option A. It works but has real costs:

- **No automatic updates** — when Ava ships new MCP tools, every consumer is stale until someone manually re-copies the dist.
- **Commit-weight churn** — every MCP update lands in every consumer repo as a large, noisy commit.
- **No version pinning** — consumers can't say "I want 0.98.x but not 0.99.x"; they just have "whatever was current the last time we copied."
- **Dependency drift** — each consumer's `mcp-server/node_modules/` is resolved independently and can diverge from Ava's lock.

Task [protoLabsAI/protoWorkstacean#71](https://github.com/protoLabsAI/protoWorkstacean/issues/71) captures the work to move to **Option C: publish to an internal npm registry** so consumers can `npm install @protolabsai/mcp-server` and pin a version like any other package.

## Goals

1. Consumers (protoContent, any future agent in the fleet) install the studio MCP server via `npm install @protolabsai/mcp-server`.
2. CI publishes a new version on every tagged release of the `protoMaker` monorepo (v0.100.0, v0.101.0, …).
3. Consumer install is self-contained — no need to also resolve `@protolabsai/tools` or any other workspace sibling.
4. Install requires only a GitHub PAT with `read:packages` scope, which most dev environments already have for GHCR pulls.

## Non-goals

- Publishing the entire monorepo's package graph. Only `@protolabsai/mcp-server`.
- Auto-update on consumers. That's a separate concern handled by watchtower / renovate / manual bumps.
- Supporting public `npmjs.com` publishing. GitHub Packages (private to the org) is the chosen backend.

## The workspace-dependency problem

`@protolabsai/mcp-server` currently depends on `@protolabsai/tools`:

```json
// packages/mcp-server/package.json
"dependencies": {
  "@protolabsai/tools": "^0.100.0",
  "@modelcontextprotocol/sdk": "^1.0.0"
}
```

Inside the monorepo, `@protolabsai/tools` resolves via npm workspaces (symlinked). Outside the monorepo, that symlink doesn't exist — a consumer doing `npm install @protolabsai/mcp-server` would fail to resolve `@protolabsai/tools` because that package has never been published anywhere.

We have three plausible answers, in increasing order of scope:

### Option B1: Publish `@protolabsai/tools` too

- Add a publish workflow for `@protolabsai/tools`.
- Consumers pull both from GitHub Packages.
- **Pros:** clean, conventional, version both.
- **Cons:** opens the door to publishing every workspace package the fleet might need. Each new publish target is another version axis to keep coherent across the monorepo. Tools has its own transitive deps that would need the same treatment.

### Option B2: Bundle `@protolabsai/tools` INTO `mcp-server` at publish time (RECOMMENDED)

- Add a publish-time build step (tsup / esbuild) that bundles `@protolabsai/mcp-server` with `@protolabsai/tools` inlined.
- Strip the `@protolabsai/tools` entry from the published `package.json`.
- Consumers install a single self-contained package — they never know `tools` exists as a separate unit.
- **Pros:** minimum publish surface (one package), consumer install is the simplest possible, workspace refactors don't break the published contract.
- **Cons:** bundled output is larger; debugging stack traces may need sourcemaps to be readable.
- **Cons:** `@protolabsai/tools` has peerDeps (or runtime-dynamic imports) of its own — those need to be preserved in the bundle, not pre-bundled, or they won't resolve against the consumer's environment.

### Option B3: Inline `@protolabsai/tools` source files at publish time

- Publish-time script copies `libs/tools/src/` into `packages/mcp-server/src/vendor/tools/` and rewrites imports from `@protolabsai/tools` to relative paths.
- Then `tsc` runs as normal against the combined source.
- **Pros:** no new bundler, stays with the existing tsc build.
- **Cons:** hand-rolled import rewriter = fragile. Subtle type imports (`import type`) can miss. Two sources of truth at publish time. Noisy to debug when it breaks.

**Recommendation: Option B2.** tsup is already a familiar dependency (used elsewhere in the monorepo). Bundling is a one-time build-system concern, and the payoff is a truly self-contained consumer install. B1 bleeds into "publish half the monorepo" over time; B3 is clever but fragile.

## Proposed implementation

### 1. Build tooling

Add `tsup` as a devDependency of `packages/mcp-server` (if not already there via the workspace). Introduce `packages/mcp-server/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist-publish',
  // Bundle @protolabsai/* workspace siblings so the published package
  // is self-contained. Mark the MCP SDK as external — it's a real
  // npm dep the consumer will resolve.
  noExternal: [/^@protolabsai\//],
  external: ['@modelcontextprotocol/sdk'],
  platform: 'node',
  target: 'node22',
});
```

Add an npm script: `"build:publish": "tsup"`.

Verify locally that `npm run build:publish` produces a `dist-publish/index.js` that can be executed standalone (no `@protolabsai/tools` resolution errors).

### 2. Publish workflow

Add `.github/workflows/publish-mcp-server.yml`:

```yaml
name: Publish @protolabsai/mcp-server

on:
  push:
    tags: ['v*']
  workflow_dispatch:
    inputs:
      dry-run:
        description: 'npm pack without publishing'
        type: boolean
        default: false

permissions:
  contents: read
  packages: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://npm.pkg.github.com
          scope: '@protolabsai'

      - name: Install workspace deps
        run: npm ci

      - name: Build bundled mcp-server
        run: npm run build:publish -w @protolabsai/mcp-server

      - name: Stage publish directory
        run: |
          mkdir -p publish-staging
          cp -r packages/mcp-server/dist-publish publish-staging/dist
          cp packages/mcp-server/README.md publish-staging/ || true
          # Rewrite package.json: strip workspace deps, point main at bundled dist.
          node scripts/stage-mcp-server-publish.mjs \
            --source packages/mcp-server/package.json \
            --target publish-staging/package.json

      - name: Publish (or pack) to GitHub Packages
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          cd publish-staging
          if [[ "${{ inputs.dry-run }}" == "true" ]]; then
            npm pack
            ls -la *.tgz
          else
            npm publish
          fi
```

### 3. Publish-stage script

`scripts/stage-mcp-server-publish.mjs` reads `packages/mcp-server/package.json`, deletes every `@protolabsai/*` workspace dep (they're now inlined), sets `main` to `dist/index.js`, and writes the result to `publish-staging/package.json`. Small, self-contained, unit-testable.

### 4. Consumer setup

Add `docs/guides/install-mcp-server.md` explaining the consumer path:

```bash
# 1. Create a PAT with read:packages scope
# 2. Add ~/.npmrc:
@protolabsai:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=ghp_xxxxx

# 3. Install
npm install @protolabsai/mcp-server
```

And update protoContent's config to point at the installed package instead of the bundled `./mcp-server/index.js`:

```json
// config/nanobot-config.json (after migration)
"args": ["--loader", "node", "node_modules/@protolabsai/mcp-server/dist/index.js"]
```

### 5. Migration of protoContent

Separate PR in the protoContent repo:

- `npm install @protolabsai/mcp-server`
- Delete the copied `mcp-server/` directory.
- Update `nanobot-config.json` to point at the node_modules path.
- Smoke test: protoContent starts, discovers studio tools via MCP, round-trips a tool call.

## Open questions

1. **Does `@protolabsai/tools` have runtime dynamic imports or peerDeps?** If yes, those need to be marked external in the tsup config too. Requires an audit before the first publish.
2. **Bundle size budget?** The current hand-copied dist is ~X MB; we should measure the tsup bundle and confirm it's not dramatically worse.
3. **Tag cadence.** Is `v*` every tag in the monorepo too aggressive? Should we gate on a label or path filter so only mcp-server changes trigger republish?
4. **Consumer auth UX.** Is a PAT+`.npmrc` acceptable for all consumers, or do we need a token-mint flow? Probably fine for now — protoContent runs in a sandboxed container that already has a PAT mounted.
5. **Downgrade path.** If a publish ships broken, how do consumers pin a previous version? Standard npm semver handles this, but we should confirm GitHub Packages supports deletion / re-publish workflows.

## Next steps

1. Decision on open questions 1, 3, 5 — needs a short design review (one slot).
2. Implementation PR: tsup config + publish workflow + stage script (this doc's proposal).
3. Consumer migration PR in protoContent after the first successful publish.

## Rejected alternatives

- **Verdaccio self-hosted registry.** Adds an infra maintenance burden (storage, backups, auth). GitHub Packages is free for org repos and already tied to our GitHub identity.
- **Publish to public npmjs.com under a scope.** Privacy concerns — the studio MCP server leaks the internal tool surface and is not audience-ready.
- **Git submodule or subtree.** Subtrees work but the UX on the consumer side is significantly worse than `npm install`, and version pinning is awkward.
- **Continue bundling (Option A).** Status quo. The non-trivial costs (no auto-update, no pinning, drift) are accepted here specifically because the task asked us to move off it.
