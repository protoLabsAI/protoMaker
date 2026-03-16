# MCP Zod Schema Unification

Replace the 22 hand-written JSON Schema tool files and 1600-line switch statement in the MCP server with the dormant libs/tools shared tool system (defineSharedTool + Zod). One source of truth for tool schemas consumed by MCP, LangGraph, and Express routes.

**Status:** active
**Created:** 2026-03-14T19:29:21.295Z
**Updated:** 2026-03-16T18:46:44.226Z

## PRD

### Situation

The MCP server has two parallel tool definition systems that never converge. System A (production) uses 22 hand-written JSON Schema files and a 1600-line switch statement. System B (dormant) in libs/tools uses defineSharedTool with Zod and has adapters for MCP and LangGraph.

### Problem

Three copies of every tool schema exist causing schema drift. Adding a new tool requires updating 3+ files. The 1600-line switch statement is unmaintainable. No input validation beyond JSON Schema.

### Approach

Incrementally migrate: extend libs/tools definitions to cover all 153 tools, build handler registry to replace switch statement, wire MCP server to shared system, share schemas with server routes.

### Results

Single source of truth. Auto-generated MCP tool list. Shared validation. One defineSharedTool call per new tool. Handler registry replaces switch.

### Constraints

Must be backwards-compatible. Migration must be incremental. libs/tools must remain usable by LangGraph. No new dependencies.

## Milestones

### 1. Extend libs/tools shared definitions

Add Zod-based defineSharedTool definitions for all 153 MCP tools

**Status:** pending

#### Phases

1. **Audit existing libs/tools definitions and gap analysis** (small)
2. **Add Zod definitions for feature and agent tools** (medium)
3. **Add Zod definitions for project, settings, and utility tools** (medium)
4. **Add Zod definitions for remaining tools (git, worktree, discord, integration)** (large)

### 2. Build handler registry and migrate switch statement

Replace the 1600-line switch statement with a handler registry

**Status:** pending

#### Phases

1. **Create ToolHandlerRegistry with apiCall dispatch** (medium)
2. **Register all handlers and delete switch statement** (large)

### 3. Wire shared tools and eliminate duplicates

Connect MCP server to toMCPTools, share schemas with server routes, add parity tests

**Status:** pending

#### Phases

1. **Replace hand-written tool arrays with toMCPTools and delete old files** (medium)
2. **Share schemas with server routes and add parity tests** (medium)
