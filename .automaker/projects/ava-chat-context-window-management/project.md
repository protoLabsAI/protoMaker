# Project: Ava Chat Context Window Management

## Goal
Implement a 3-layer context management strategy for the Ava chat to prevent context window exhaustion. Layer 1: Tool result compaction (truncate/summarize large tool results before they enter conversation). Layer 2: Claude API native context_management with tool result clearing. Layer 3: Server-side compaction as safety net.

## Milestones
1. Tool Result Compaction - Build the compaction layer that processes tool results before they enter conversation history. This is the highest-impact change — most token bloat comes from verbose tool results.
2. Claude API Context Editing - Wire Claude's native context management features as a second defense layer. This lets Claude itself manage context when our compaction isn't enough.
