---
name: monorepo-typescript-workspace
description: TypeScript project references and workspace resolution in the Automaker monorepo. Explains how incremental builds, cross-package type checking, and go-to-definition work.
tags: [typescript, monorepo, workspace, build]
---

# TypeScript Workspace Resolution

The monorepo uses TypeScript project references (`tsconfig.json` with `composite: true`). This enables:
- Incremental builds
- Cross-package type checking
- Go-to-definition across packages

## How Resolution Works

```
apps/server/tsconfig.json
  |-- references: [{ path: "../../libs/types" }, { path: "../../libs/utils" }, ...]

libs/types/tsconfig.json
  |-- compilerOptions.composite: true
  |-- compilerOptions.declarationMap: true   <- enables go-to-source (not dist)
```

Each shared package sets `"main": "./dist/index.js"` and `"exports"` in its `package.json`. When you `import from '@protolabsai/types'`, Node resolves to `dist/index.js`. **If dist is stale, you get old types.**

## Common Pitfalls

| Anti-Pattern | Why It Fails | Fix |
|---|---|---|
| `build:server` without `build:packages` first | Stale types from old dist | Always run `build:packages` first |
| Modifying shared types in a worktree without rebuilding | npm workspace hoisting resolves `@protolabsai/types` to the main repo's copy, not the worktree's | Run `npm run build:packages` from within the worktree after changing shared types |
| Relative imports across package boundaries | Breaks when packages move; no workspace resolution | Use `@protolabsai/*` imports |
| Forgetting `composite: true` in tsconfig | Project references break | Always add it to lib tsconfigs |
