---
name: monorepo-patterns
description: Comprehensive monorepo patterns for the Automaker project. Use when adding new packages, debugging build order issues, or following import conventions. Trigger on "new package", "build order", "import path", "workspace package", "monorepo", or "package dependency".
tags: [build, monorepo, typescript, packages, imports]
---

# Monorepo Patterns

Complete reference for working in the Automaker monorepo. Each rule is documented in its own file below.

## Rules

| Rule | File | Description |
|------|------|-------------|
| Build Order | [build-order.md](./build-order.md) | Correct build order to avoid stale types and agent failures |
| Import Conventions | [imports.md](./imports.md) | Always import from `@protolabsai/*`, never relative cross-package paths |
| Adding Packages | [adding-packages.md](./adding-packages.md) | Step-by-step guide for adding a new shared package |
| TypeScript Workspace | [typescript-workspace.md](./typescript-workspace.md) | Project references, incremental builds, and workspace resolution |

## Quick Reference

### Build Commands

```bash
npm run build:packages   # always first
npm run build:server     # after packages
npm run build            # both in order
```

### Import Pattern

```typescript
import type { Feature } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';
```

### Package Dependency Chain

```
@protolabsai/types (foundation)
    |
@protolabsai/utils, prompts, platform, model-resolver, dependency-resolver, spec-parser
    |
@protolabsai/git-utils
    |
@protolabsai/mcp-server (packages/)
    |
apps/server, apps/ui
```
