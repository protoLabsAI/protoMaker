# Lossless Context Management & Agent Resilience

Integrate DAG-based context compression (from lossless-claw) and workflow suspend/resume with graceful shutdown (from VoltAgent) into the protoLabs agent pipeline. Solves two critical pain points: agents losing context on long sessions, and server crashes losing in-flight feature state.

**Status:** active
**Created:** 2026-03-16T19:24:53.941Z
**Updated:** 2026-03-16T20:31:35.929Z

## Research Summary

This report synthesizes research across five parallel investigations into integrating DAG-based context compression and workflow suspend/resume into the protoLabs agent pipeline. The project addresses two critical pain points: **agents losing context on long sessions** (current compaction discards information destructively at 100K tokens [3]) and **server crashes losing in-flight feature state** (P1 known issue, partially mitigated by file-based recovery [14][15]).

The core finding is that the existing architecture—file-based persistence, session-keyed execution, heuristic compaction, and crash-recovery via `pendingTools` injection—provides solid scaffolding for both capabilities. **lossless-claw** [45] offers a production-grade DAG summarization engine with SQLite-backed storage, depth-keyed compression prompts, and an expansion system that can replace the current lossy `message-compaction.ts`. **VoltAgent** [48] provides a suspend controller pattern, checkpoint-per-step persistence, and a `shutdown()` orchestration sequence that maps cleanly onto the existing `shutdown.ts` + `resumeInterruptedFeatures()` flow.

Key integration risk: the codebase uses no external database [23]—all state is JSON/markdown in `.automaker/`. Introducing SQLite for the summary DAG requires careful consideration of worktree isolation, atomic writes, and the existing backup-recovery pattern [18].

---

## PRD

### Situation

protoLabs Studio agents run long feature implementation sessions (30-120 min) powered by Claude Agent SDK. Conversations are stored in flat JSON files in data/agent-sessions/. The Lead Engineer service manages feature lifecycle through a state machine (INTAKE > PLAN > EXECUTE > REVIEW > MERGE > DEPLOY) but state is held in memory. When context windows fill, Claude's built-in /compact performs lossy one-way compression. When the dev server crashes (P1 known issue), all in-flight feature state is lost.

### Problem

1. Context loss: Agents on long sessions hit token limits, /compact destroys details irreversibly, agents hallucinate from compressed memory. No way to recover original messages or search compressed history. 2) State loss: Server crashes lose all in-flight feature state. LeadEngineerService state machine is in-memory only. Stale agent-output.md files from crashed sessions trigger the stale context trap. 3) No checkpoint/resume: Interrupted feature executions restart from scratch.

### Approach

Three workstreams: (1) @protolabsai/context-engine package with DAG-based context compression, SQLite persistence, hierarchical summarization, budget-constrained context assembly, and agent retrieval tools. (2) Durable workflow engine in LeadEngineerService with SQLite-backed state checkpointing and suspend/resume. (3) Graceful shutdown handler with agent checkpointing and restart recovery.

### Results

Agents maintain full conversation history with no information loss. Context windows stay within budget via intelligent DAG compression with drill-down recovery. Server crashes no longer lose feature state. Agent retrieval tools let models search their own compressed history. Measurable: zero context-loss hallucinations, zero lost-state restarts, 50%+ reduction in wasted compute from re-runs.

### Constraints

Must integrate with existing Claude Agent SDK (not replacing it). Must work with git worktree isolation. SQLite for all persistence. New @protolabsai/context-engine package in libs/. Agent retrieval tools exposed via MCP. Config via WorkflowSettings. Summarization uses Haiku for cost. Fresh tail (32 messages) always protected. Must not break existing pipeline during rollout.

## Milestones

### 1. Foundation - Context Engine Package

Create the @protolabsai/context-engine package with SQLite persistence layer, core types, and message store.

**Status:** pending

#### Phases

1. **Context Engine Types & Package Scaffold** (small)
2. **SQLite Message Store** (medium)
3. **SQLite Summary Store & DAG Model** (medium)

### 2. Compaction Engine

Implement hierarchical summarization: leaf compaction, cascading condensation, depth-aware prompts, and Expand footer system.

**Status:** pending

#### Phases

1. **Leaf Summarization** (medium)
2. **Cascading Condensation** (medium)
3. **Context Assembler** (medium)

### 3. Retrieval Tools & Large File Handling

Agent-facing tools for searching and expanding compressed history, plus large file interception.

**Status:** pending

#### Phases

1. **Retrieval Tools (grep, describe, expand)** (large)
2. **Large File Interception** (medium)

### 4. Agent Pipeline Integration

Wire context engine into the agent execution pipeline.

**Status:** pending

#### Phases

1. **Agent Service Integration** (large)
2. **Configuration & Settings Wiring** (small)

### 5. Durable Workflow Engine

Replace in-memory Lead Engineer state machine with durable SQLite-backed workflow engine with suspend/resume.

**Status:** completed

#### Phases

1. **Workflow Checkpoint Store** (medium)
2. **Lead Engineer Durable State Machine** (large)

### 6. Graceful Shutdown & Resume

Handle server shutdown gracefully and resume interrupted work on restart.

**Status:** pending

#### Phases

1. **Graceful Shutdown Handler** (medium)
2. **Restart Detection & Resume** (medium)
