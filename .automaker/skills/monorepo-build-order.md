---
name: monorepo-build-order
emoji: 🏗️
description: Correct build order for the Automaker monorepo. Prevents stale dist, type errors, and agent failures.
metadata:
  author: agent
  created: 2026-02-11T23:24:17.774Z
  usageCount: 0
  successRate: 0
  tags: [build, monorepo, typescript, packages]
  source: learned
---

# Monorepo Build Order

The Automaker monorepo has a strict dependency chain. Building out of order causes stale types, missing exports, and agent failures.

## Package Dependency Chain

```
@protolabs-ai/types (no dependencies)
    ↓
@protolabs-ai/utils, @protolabs-ai/prompts, @protolabs-ai/platform,
@protolabs-ai/model-resolver, @protolabs-ai/dependency-resolver,
@protolabs-ai/spec-parser
    ↓
@protolabs-ai/git-utils
    ↓
@protolabs-ai/server, @protolabs-ai/ui
```

## Build Commands

```bash
# Build all shared packages (libs/* + MCP server)
npm run build:packages

# Build server only (after packages are built)
npm run build:server

# Build everything
npm run build
```

## When to Rebuild

| Event | Action |
|-------|--------|
| Types PR merged | `npm run build:packages` immediately |
| Any libs/* PR merged | `npm run build:packages` |
| Before starting agents | `npm run build:packages` (if any package changed recently) |
| MCP tools added/changed | `npm run build:packages` (MCP server included in build:packages) |
| Agent using wrong type names | Stale dist — rebuild packages |

## Common Pitfall

`@protolabs-ai/mcp-server` lives in `packages/` not `libs/`. It IS included in `build:packages` (fixed 2026-02-11). New MCP tools exist in source but not in `dist/index.js` until packages are rebuilt.

## Agent Prompt Gap

Agent prompts have zero guidance on monorepo build order. When sending context to agents via `send_message_to_agent`, always include:
- Run `npm run build:packages` before `npm run build:server`
- When modifying libs/*, rebuild packages first
- Import from `@protolabs-ai/*` packages, never from relative paths to other packages