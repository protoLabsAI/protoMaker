# PRD: MCP Zod Schema Unification

## Situation

The MCP server has two parallel tool definition systems that never converge. System A (production) uses 22 hand-written JSON Schema files and a 1600-line switch statement. System B (dormant) in libs/tools uses defineSharedTool with Zod and has adapters for MCP and LangGraph.

## Problem

Three copies of every tool schema exist causing schema drift. Adding a new tool requires updating 3+ files. The 1600-line switch statement is unmaintainable. No input validation beyond JSON Schema.

## Approach

Incrementally migrate: extend libs/tools definitions to cover all 153 tools, build handler registry to replace switch statement, wire MCP server to shared system, share schemas with server routes.

## Results

Single source of truth. Auto-generated MCP tool list. Shared validation. One defineSharedTool call per new tool. Handler registry replaces switch.

## Constraints

Must be backwards-compatible. Migration must be incremental. libs/tools must remain usable by LangGraph. No new dependencies.
