# PRD: Native Claude Code Experience in Ava Chat

## Situation
The Ava chat interface already has streaming SSE via Vercel AI SDK, tool execution with 14 tool groups, extended thinking, server-side context management with compaction, subagent trust (full/gated) with approval cards, session persistence via Zustand, model selection, citation extraction, and plan block extraction.

## Problem
1. No slash commands — users must remember and type full instructions. The ~18 MCP plugin commands and 27+ learned skills are invisible in the chat UI. No /compact, /clear, or way to invoke a skill by name. 2. Subagent calls are opaque — when Ava delegates via the Agent tool, users see a tool call/result pair but not what the subagent did. No progress, no nested visibility. 3. No file checkpointing — Ava can modify files via tools but there is no undo/rewind capability. 4. Effort level not exposed — model selection exists but effort (low/medium/high/max) is not surfaced. 5. Session context is client-only — session resume is just replaying stored messages, no server-side continuity.

## Approach
Three phases: Phase 1 (Slash Commands) — CommandRegistry service discovers commands from built-ins, MCP plugin commands, .automaker/skills, .claude/skills. ChatInput detects / prefix and shows filterable autocomplete dropdown. Server expands $ARGUMENTS/$1, @file refs, !bash snippets, injects as system context. Phase 2 (Subagent Visibility) — Detect Agent tool_use blocks in message stream, render as collapsible nested blocks with status and result summary. Phase 3 (File Checkpointing) — Use Agent SDK native enableFileCheckpointing + rewindFiles() API, capture UserMessage.uuid as checkpoint markers, add rewind UI and /rewind command.

## Results
Users can type / and discover + invoke all MCP commands and skills without leaving chat. Ava chat feels like native Claude Code. File changes are reversible. Subagent work is transparent and inspectable.

## Constraints
No dev server management — all changes must be hot-reloadable,Phase 1 must not break existing chat (backward compatible input path),Commands loaded from filesystem — no code changes to add new commands,allowed-tools frontmatter must be respected per-command,ChatInput is a textarea not TipTap — slash command UI must be built for textarea context
