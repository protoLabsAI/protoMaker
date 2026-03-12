---
name: monorepo-patterns
emoji: 🏗️
description: Comprehensive monorepo patterns for the Automaker project — build order, import conventions, package dependency chain, and adding new packages.
metadata:
  author: agent
  created: 2026-02-25T00:00:00.000Z
  usageCount: 0
  successRate: 0
  tags: [build, monorepo, typescript, packages, imports]
  source: learned
---

# Monorepo Patterns

Complete reference for working in the Automaker monorepo. Covers build order, dependency chain, import conventions, TypeScript workspace resolution, and adding new packages.

---

## Package Dependency Chain

Packages MUST only depend on packages above them in the chain. Violating this creates circular imports that break the build.

```
@protolabsai/types            ← no dependencies, foundation for everything
         ↓
@protolabsai/utils
@protolabsai/prompts
@protolabsai/platform
@protolabsai/model-resolver
@protolabsai/dependency-resolver
@protolabsai/spec-parser
         ↓
@protolabsai/git-utils        ← depends on types + utils
         ↓
@protolabsai/mcp-server       ← depends on all above (lives in packages/)
         ↓
apps/server                    ← depends on all above
apps/ui                        ← depends on @protolabsai/types only (browser-safe)
```

> **Note:** `@protolabsai/mcp-server` lives in `packages/` not `libs/`. It IS included in `build:packages`.

---

## Build Order

**Always build packages before server.** Building out of order causes stale types, missing exports, and agent failures.

```bash
# Step 1 — build all shared packages (libs/* + packages/mcp-server)
npm run build:packages

# Step 2 — build server (requires packages to be built first)
npm run build:server

# Or build everything in one command (runs in correct order)
npm run build
```

### When to Rebuild

| Trigger                               | Required Action                                         |
| ------------------------------------- | ------------------------------------------------------- |
| Modified any file in `libs/*`         | `npm run build:packages`                                |
| Modified `packages/mcp-server`        | `npm run build:packages`                                |
| Added/changed MCP tools               | `npm run build:packages`                                |
| Types PR merged                       | `npm run build:packages` immediately                    |
| Agent reports wrong method signatures | Rebuild packages (stale dist)                           |
| Before starting an agent              | `npm run build:packages` (if packages changed recently) |

---

## Import Conventions

**Always import from `@protolabsai/*` workspace packages. Never use relative paths that cross package boundaries.**

### ✅ Correct Imports

```typescript
// Types from the shared types package
import type { Feature, AgentStatus, BoardColumn } from '@protolabsai/types';

// Utilities from shared utils
import { createLogger, sleep, formatDate } from '@protolabsai/utils';

// Git operations
import { getChangedFiles, createWorktree } from '@protolabsai/git-utils';

// Model resolution
import { resolveModel } from '@protolabsai/model-resolver';

// Prompts
import { buildSystemPrompt } from '@protolabsai/prompts';
```

### ❌ Incorrect Imports (Anti-Patterns)

```typescript
// WRONG: relative path crossing package boundary
import { Feature } from '../../libs/types/src/feature';
import { createLogger } from '../../../libs/utils/src/logger';

// WRONG: importing from another app's source
import { featureLoader } from '../../server/src/services/feature-loader';

// WRONG: importing from dist/ directly
import { Feature } from '../../../libs/types/dist/index';

// WRONG: bypassing workspace resolution
import type { Feature } from '/Users/kj/dev/automaker/libs/types/src/types';
```

---

## TypeScript Workspace Resolution

The monorepo uses TypeScript project references (`tsconfig.json` with `composite: true`). This enables:

- Incremental builds
- Cross-package type checking
- Go-to-definition across packages

### How Resolution Works

```
apps/server/tsconfig.json
  └── references: [{ path: "../../libs/types" }, { path: "../../libs/utils" }, ...]

libs/types/tsconfig.json
  └── compilerOptions.composite: true
  └── compilerOptions.declarationMap: true   ← enables go-to-source (not dist)
```

Each shared package sets `"main": "./dist/index.js"` and `"exports"` in its `package.json`. When you `import from '@protolabsai/types'`, Node resolves to `dist/index.js`. **If dist is stale, you get old types.**

---

## Adding a New Shared Package

Follow these steps exactly. Missing any step causes workspace link failures or build order issues.

### Step 1 — Create the Package Directory: `mkdir -p libs/my-package/src`

### Step 2 — Create package.json

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

### Step 3 — Create tsconfig.json

Extend `../../tsconfig.base.json` with `composite: true`, `declarationMap: true`, `outDir: ./dist`, and reference any packages this one depends on.

### Step 4 — Register in Root

In root `package.json`:

1. Add `"libs/my-package"` to the `workspaces` array
2. Add `npm run build -w @protolabsai/my-package` to `build:packages` **after** its dependencies

### Step 5 — Install and Verify

```bash
npm install          # links workspace symlinks
npm run build:packages   # verify it builds
```

---

## Anti-Patterns Summary

| Anti-Pattern                                            | Why It Fails                                                                                     | Fix                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `build:server` without `build:packages` first           | Stale types from old dist                                                                        | Always run `build:packages` first                                                 |
| Relative imports across package boundaries              | Breaks when packages move; no workspace resolution                                               | Use `@protolabsai/*` imports                                                      |
| Adding `@protolabsai/server` dep to a lib               | Circular dependency                                                                              | Only depend on packages higher in the chain                                       |
| Forgetting `composite: true` in tsconfig                | Project references break                                                                         | Always add it to lib tsconfigs                                                    |
| Not running `npm install` after adding package          | Workspace symlink missing                                                                        | Run `npm install` from root after adding a package                                |
| `process.env` at module level in shared packages        | Crashes browser (no `process` in browser)                                                        | Guard with `typeof process !== 'undefined'`                                       |
| Modifying shared types in a worktree without rebuilding | npm workspace hoisting resolves `@protolabsai/types` to the main repo's copy, not the worktree's | Run `npm run build:packages` from within the worktree after changing shared types |
