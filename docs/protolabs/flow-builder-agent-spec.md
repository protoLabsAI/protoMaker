# Flow Builder Agent Specification

## Overview

The Flow Builder is a specialized agent template that scaffolds LangGraph workflows using test-driven flow development. Given a flow specification, it generates all 5 layers of the pipeline pattern with tests at each layer.

## Agent Template

```yaml
name: flow-builder
displayName: Flow Builder
description: Scaffolds LangGraph workflows using the 5-layer test-driven pipeline pattern
role: backend-engineer
tier: 1 # Project-level, not protected
model: sonnet
tags: [flows, langgraph, scaffolding, test-driven]
```

## Trigger

Invoked via `execute_dynamic_agent` when:

- A feature description mentions "flow", "pipeline", "graph", or "LangGraph"
- A Beads item is categorized as a flow-building task
- Manually via MCP: `execute_dynamic_agent({ templateName: 'flow-builder', prompt: '...' })`

## What It Does

Given a natural language flow specification, the agent generates:

### 1. State Schema (`libs/flows/src/{flow-name}/state.ts`)

- Zod schemas for inputs, outputs, and intermediate state
- LangGraph `Annotation.Root()` with appropriate reducers
- Type exports for consumers

### 2. Node Implementations (`libs/flows/src/{flow-name}/nodes/`)

- One file per node function
- Each node: `(state) => Partial<state>` pattern
- Model fallback via `executeWithFallback()`
- Zod validation of LLM responses
- Graceful error handling (return errors, never crash)

### 3. Graph Composition (`libs/flows/src/{flow-name}/graph.ts`)

- `GraphBuilder` or manual `StateGraph` construction
- Entry/finish points
- Conditional edges for routing
- Subgraph isolation where needed
- HITL interrupts if human review is required

### 4. Test Suite (`libs/flows/src/{flow-name}/__tests__/`)

- Unit tests for each node with `TestChatModel`
- Integration test for full graph with mock data
- Edge case tests (model failure, invalid JSON, timeout)
- No real API calls in any test

### 5. Barrel Export (`libs/flows/src/{flow-name}/index.ts`)

- Re-export graph, state types, and node functions
- Add to `libs/flows/src/index.ts` barrel

## System Prompt Additions

```
You are the Flow Builder agent. You scaffold LangGraph workflows following
the 5-layer test-driven pipeline pattern.

CRITICAL RULES:
1. Every node is a pure function: state in, partial state out
2. Always use Zod schemas for LLM response validation
3. Always include TestChatModel-based tests — no real API calls in tests
4. Use appendReducer for arrays, replaceReducer for scalars
5. Use executeWithFallback() for model fallback chains
6. Use wrapSubgraph() for subgraph isolation
7. Follow existing patterns in libs/flows/src/content/ as reference
8. Run npm run build:packages after creating files to verify compilation
9. Run npm run test:packages to verify tests pass

PACKAGE IMPORTS:
- State primitives: import from '@automaker/flows'
- LLM models: import { BaseChatModel } from '@langchain/core/language_models/chat_models'
- Testing: import { createTestModels } from research-workers or create local TestChatModel
- Observability: import from '@automaker/observability' (production layer only)
```

## Tools Required

- `Read`, `Write`, `Edit` — File operations
- `Bash` — Running build:packages and test:packages
- `Glob`, `Grep` — Finding existing patterns

## Example Invocation

```typescript
execute_dynamic_agent({
  templateName: 'flow-builder',
  projectPath: '/Users/kj/dev/automaker',
  prompt: `Build a "code-review" flow that:
    - Takes a diff string and file paths as input
    - Research node: analyzes the diff for patterns and potential issues
    - Review node: generates review comments with severity levels
    - Summary node: aggregates comments into a structured review
    - Output: ReviewResult with comments[], overallSeverity, summary

    Include HITL interrupt before the summary node for human override.
    Use parallel research workers for large diffs (>500 lines).`,
});
```

## Implementation Plan

1. **Register template** — Add `flow-builder` to built-in templates in `apps/server/src/services/agent-templates/`
2. **System prompt** — Create detailed prompt in `@automaker/prompts` with the 5-layer pattern reference
3. **Crew integration** — Optional: add as a crew member that watches for flow-related features and auto-activates

## Dependencies

- `@automaker/flows` — Core graph primitives (already built)
- `@automaker/llm-providers` — Model abstraction (already built)
- `@automaker/observability` — Tracing (already built)
- Content pipeline in `libs/flows/src/content/` — Reference implementation (already built)

## Success Criteria

- Agent generates compilable TypeScript that passes `npm run build:packages`
- All generated tests pass with `npm run test:packages`
- Generated flows follow the exact same patterns as the content pipeline
- No real API calls in any test file
