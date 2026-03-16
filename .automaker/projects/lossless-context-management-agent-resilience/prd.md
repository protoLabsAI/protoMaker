# PRD: Lossless Context Management & Agent Resilience

## Situation
protoLabs Studio agents run long feature implementation sessions (30-120 min) powered by Claude Agent SDK. Conversations are stored in flat JSON files in data/agent-sessions/. The Lead Engineer service manages feature lifecycle through a state machine (INTAKE > PLAN > EXECUTE > REVIEW > MERGE > DEPLOY) but state is held in memory. When context windows fill, Claude's built-in /compact performs lossy one-way compression. When the dev server crashes (P1 known issue), all in-flight feature state is lost.

## Problem
1) Context loss: Agents on long sessions hit token limits, /compact destroys details irreversibly, agents hallucinate from compressed memory. No way to recover original messages or search compressed history. 2) State loss: Server crashes lose all in-flight feature state. LeadEngineerService state machine is in-memory only. Stale agent-output.md files from crashed sessions trigger the stale context trap. 3) No checkpoint/resume: Interrupted feature executions restart from scratch.

## Approach
Three workstreams: (1) @protolabsai/context-engine package with DAG-based context compression, SQLite persistence, hierarchical summarization, budget-constrained context assembly, and agent retrieval tools. (2) Durable workflow engine in LeadEngineerService with SQLite-backed state checkpointing and suspend/resume. (3) Graceful shutdown handler with agent checkpointing and restart recovery.

## Results
Agents maintain full conversation history with no information loss. Context windows stay within budget via intelligent DAG compression with drill-down recovery. Server crashes no longer lose feature state. Agent retrieval tools let models search their own compressed history. Measurable: zero context-loss hallucinations, zero lost-state restarts, 50%+ reduction in wasted compute from re-runs.

## Constraints
Must integrate with existing Claude Agent SDK (not replacing it). Must work with git worktree isolation. SQLite for all persistence. New @protolabsai/context-engine package in libs/. Agent retrieval tools exposed via MCP. Config via WorkflowSettings. Summarization uses Haiku for cost. Fresh tail (32 messages) always protected. Must not break existing pipeline during rollout.
