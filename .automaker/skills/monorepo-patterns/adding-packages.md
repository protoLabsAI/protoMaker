---
name: monorepo-adding-packages
description: Step-by-step guide for adding a new shared package to the Automaker monorepo. Missing any step causes workspace link failures or build order issues.
tags: [monorepo, packages, typescript, build]
---

# Adding a New Shared Package

Follow these steps exactly. Missing any step causes workspace link failures or build order issues.

## Step 1 — Create the Package Directory

```bash
mkdir -p libs/my-package/src
```

## Step 2 — Create package.json

```json
{
  "name": "@protolabsai/my-package",
  "version": "0.1.0",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc --build",
    "clean": "rm -rf dist tsconfig.tsbuildinfo"
  },
  "dependencies": {
    "@protolabsai/types": "*"
  }
}
```

## Step 3 — Create tsconfig.json

Extend `../../tsconfig.base.json` with `composite: true`, `declarationMap: true`, `outDir: ./dist`, and reference any packages this one depends on.

## Step 4 — Register in Root

In root `package.json`:
1. Add `"libs/my-package"` to the `workspaces` array
2. Add `npm run build -w @protolabsai/my-package` to `build:packages` **after** its dependencies

## Step 5 — Install and Verify

```bash
npm install          # links workspace symlinks
npm run build:packages   # verify it builds
```

## Anti-Patterns

| Anti-Pattern | Why It Fails | Fix |
|---|---|---|
| Adding `@protolabsai/server` dep to a lib | Circular dependency | Only depend on packages higher in the chain |
| Forgetting `composite: true` in tsconfig | Project references break | Always add it to lib tsconfigs |
| Not running `npm install` after adding package | Workspace symlink missing | Run `npm install` from root after adding a package |
| `process.env` at module level in shared packages | Crashes browser (no `process` in browser) | Guard with `typeof process !== 'undefined'` |
