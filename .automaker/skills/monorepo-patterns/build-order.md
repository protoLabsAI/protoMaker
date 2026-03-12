---
name: monorepo-build-order
description: Correct build order for the Automaker monorepo. Prevents stale dist, type errors, and agent failures.
tags: [build, monorepo, typescript, packages]
---

# Build Order

**Always build packages before server.** Building out of order causes stale types, missing exports, and agent failures.

```bash
# Step 1 — build all shared packages (libs/* + packages/mcp-server)
npm run build:packages

# Step 2 — build server (requires packages to be built first)
npm run build:server

# Or build everything in one command (runs in correct order)
npm run build
```

## When to Rebuild

| Trigger | Required Action |
|---------|----------------|
| Modified any file in `libs/*` | `npm run build:packages` |
| Modified `packages/mcp-server` | `npm run build:packages` |
| Added/changed MCP tools | `npm run build:packages` |
| Types PR merged | `npm run build:packages` immediately |
| Agent reports wrong method signatures | Rebuild packages (stale dist) |
| Before starting an agent | `npm run build:packages` (if packages changed recently) |

## Notes

- `@protolabsai/mcp-server` lives in `packages/` not `libs/`. It IS included in `build:packages`.
- When sending context to agents, always remind: run `npm run build:packages` before `npm run build:server`.
