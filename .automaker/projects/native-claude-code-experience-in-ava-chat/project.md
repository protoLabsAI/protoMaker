# Project: Native Claude Code Experience in Ava Chat

## Goal
Bring slash commands, subagent visibility, and file checkpointing from the Claude Code CLI experience into the Ava chat UI, making all 18 MCP commands and 27+ skills discoverable and invocable directly from the chat input.

## Milestones
1. Command Registry and Discovery - Server-side command registry that discovers, parses, and serves slash commands from multiple sources. This is the foundation — no UI yet, just the data pipeline.
2. Slash Command UI - ChatInput enhancement with slash command detection, autocomplete dropdown, and command execution feedback.
3. Subagent Visibility - Surface Agent tool invocations as rich, collapsible UI blocks instead of opaque tool results.
4. File Checkpointing - Track file modifications made through Ava chat and enable rewind to previous states.
