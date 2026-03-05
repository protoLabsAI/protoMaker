# PRD: Ava Chat Context Window Management

## Situation
The Ava chat in protoLabs Studio uses Vercel AI SDK v6 streamText() with Claude models. Every chat request sends the full conversation history. Tool results (board summaries, feature lists, agent outputs, metrics) are included verbatim, bloating the payload. At 82 messages the payload hits ~150K+ tokens and crashes with EPIPE errors.

## Problem
Tool results dominate context consumption — a single list_features call returns 68 features at ~500 tokens each (34K tokens). Board summaries, agent outputs, and metrics compound this. The chat becomes unusable after 15-20 tool-heavy exchanges. There is no compaction, summarization, or context editing in place.

## Approach
Three defensive layers: (1) Tool Result Compaction — a compactToolResult() utility that truncates/summarizes tool results before they enter the conversation history, with per-tool policies for what to keep vs discard. (2) Claude API Context Editing — wire providerOptions.anthropic.context_management with clear_tool_uses_20250919 to let Claude automatically clear old tool results. (3) Server-Side Compaction — use compact_20260112 beta as a safety net when estimated tokens exceed a threshold.

## Results
Chat sessions survive 100+ messages without crashing. Tool-heavy workflows (board triage, agent monitoring, PR management) remain responsive throughout long sessions. Token usage stays under 120K even in extended sessions.

## Constraints
Must work with Vercel AI SDK v6 streamText(),Must not break existing tool functionality,Must preserve recent tool results for conversation coherence,Must be backwards compatible with existing chat sessions,Keep implementation simple — no external services or databases
