---
name: shared-package-gotchas
emoji: 📦
description: "Common pitfalls when working with @automaker/* shared packages — browser crashes, import rules, and dependency chain."
metadata:
  author: agent
  created: 2026-02-12T16:57:07.759Z
  usageCount: 0
  successRate: 0
  tags: [packages, types, imports, browser, monorepo]
  source: learned
---

# Shared Package Gotchas

Common pitfalls when working with `@automaker/*` packages in the monorepo.

## process.env Crashes Browser

`@automaker/types` is imported by both server and UI. Any `process.env` access at module import time crashes in the browser where `process` is undefined.

**Wrong:**
```typescript
export const API_URL = process.env.API_URL || 'http://localhost:3008';
```

**Right:**
```typescript
export const API_URL = typeof process !== 'undefined' && process.env?.API_URL
  ? process.env.API_URL
  : 'http://localhost:3008';
```

Vite doesn't polyfill `process.env` by default. Only `import.meta.env.VITE_*` works in the browser.

## Dependency Chain

Packages can ONLY depend on packages above them:

```
@automaker/types (no dependencies)
    ↓
@automaker/utils, @automaker/prompts, @automaker/platform,
@automaker/model-resolver, @automaker/dependency-resolver,
@automaker/spec-parser
    ↓
@automaker/git-utils
    ↓
apps/server, apps/ui
```

**Violating this causes circular dependencies** that break the build.

## Import Rules

Always import from workspace packages, never from old paths:

```typescript
// ✅ Correct
import type { Feature } from '@automaker/types';
import { createLogger } from '@automaker/utils';

// ❌ Wrong
import { Feature } from '../services/feature-loader';
import { createLogger } from '../lib/logger';
```

## Stale dist/ After Changes

After modifying any `libs/*` package:
```bash
npm run build:packages
```

This builds ALL shared packages in dependency order. Without this:
- Other packages see stale types
- Agents import wrong method signatures
- Build errors in downstream consumers

## Worktree Symlink Issue

npm workspace hoisting resolves `@automaker/types` to the main repo in worktrees, not the worktree's copy. Agents may see main's types instead of the worktree's modified types.

**Workaround:** Rebuild packages from within the worktree if modifying shared types:
```bash
cd <worktree> && npm run build:packages
```

## Adding New Packages

1. Create in `libs/<package-name>/`
2. Add to root `package.json` workspaces array
3. Add `tsconfig.json` with composite: true
4. Add to `build:packages` script in correct dependency order
5. Run `npm install` to link workspace