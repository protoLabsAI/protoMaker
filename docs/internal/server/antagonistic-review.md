# Antagonistic Review

Dual-perspective PRD review pipeline that stress-tests product decisions through Ava (ops) and Jon (market) before consolidating into an updated PRD. Ava and Jon run as full **multi-turn agent loops** with tool access — not single LLM calls. They can investigate the codebase, read board state, and push back on capacity or timeline conflicts before rendering a verdict.

## Overview

`AntagonisticReviewService` orchestrates a review pipeline to validate PRDs before they are approved for implementation:

1. **Ava reviews** for operational feasibility — capacity, risk, tech debt, timeline alignment
2. **Jon reviews** for market value — customer impact, ROI, strategic positioning, brand fit
3. **Consolidation** — synthesizes both verdicts into a final PROCEED/MODIFY/REJECT + updated PRD

When the `useGraphFlows` feature flag is enabled (default: `true`), execution is delegated to `AntagonisticReviewAdapter` which runs the review as a LangGraph state machine.

Reviews must complete within **3 minutes** (`REVIEW_TIMEOUT_MS = 180_000`).

## Architecture

```text
AntagonisticReviewService
  ├── Feature flag: useGraphFlows (default: true)
  │     └── true  → AntagonisticReviewAdapter (LangGraph flow)
  └── AntagonisticReviewAdapter
        ├── FeatureLoader.getAll(projectPath)  — board context (active + backlog features)
        ├── createAntagonisticReviewGraph()    — LangGraph state machine
        ├── createFlowModel()                  — settings-aware LLM factory
        ├── streamingQuery injection            — agent-loop fn passed into graph state
        ├── Langfuse tracing                   — per-stage spans + cost tracking
        └── HITL support                       — pause/resume via threadId checkpoint
```

### Review Pipeline

```text
executeReview(ReviewRequest)
  → fetch board context (FeatureLoader.getAll)
  → inject agentQueryFn + projectPath + boardContext into graph state

  Graph: classify_topic → fan_out_pairs → aggregate → ava_review → jon_review → check_consensus → consolidate → check_hitl

  → Stage: ava_review (agent loop)
      system prompt: getAvaPrompt()  ← canonical Chief of Staff persona
      tools: Read, Glob, Grep        ← codebase investigation
      board context: serialized features by status
      up to 10 turns to research before XML verdict
      verdict areas: Capacity, Risk, Tech Debt, Feasibility, Alignment

  → Stage: jon_review (agent loop)
      system prompt: getJonPrompt()  ← canonical GTM persona
      tools: Read, Glob, Grep
      context: Ava's review + board state
      up to 10 turns to research before XML verdict
      verdict areas: Customer Impact, ROI, Market Positioning, Priority
      applies protoLabs brand filter: open-source first, orchestration > implementation

  → consolidate (single LLM call)
      XML → PROCEED / MODIFY / REJECT
      outputs updated SPARC PRD

  → check_hitl → HITLRequest or done
```

### Agent Loop Injection

The graph accepts these fields in its state to enable agent-loop reviewers:

| Field          | Type                                     | Description                                  |
| -------------- | ---------------------------------------- | -------------------------------------------- |
| `projectPath`  | `string`                                 | Working directory for tool calls             |
| `boardContext` | `string`                                 | Serialized board features (active + backlog) |
| `agentQueryFn` | `(AgentQueryOptions) => Promise<{text}>` | Injected `streamingQuery` from server layer  |

When `agentQueryFn` + `projectPath` are present, `avaReviewAdapter` and `jonReviewAdapter` in `graph.ts` run the agent loop path. Otherwise they fall back to a single `model.invoke()` call (or a deterministic mock if nothing is injected).

```typescript
// AgentQueryOptions (libs/flows/src/antagonistic-review/state.ts)
interface AgentQueryOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  cwd: string;
  maxTurns?: number;
  allowedTools?: string[];
  readOnly?: boolean;
}
```

### Board Context Serialization

Before invoking the graph, the adapter fetches all features for the project:

```typescript
const featureLoader = new FeatureLoader();
const features = await featureLoader.getAll(projectPath);
boardContext = serializeBoardContext(features); // groups by status, shows active + top 8 backlog
```

The serialized context is injected into both reviewers' prompts so they can assess capacity and flag conflicts with in-flight work.

## Key Components

### AntagonisticReviewService

Singleton service that owns the review pipeline. Key methods:

| Method                             | Description                                                   |
| ---------------------------------- | ------------------------------------------------------------- |
| `executeReview(request)`           | Run full pipeline; routes to flow or legacy path              |
| `resumeReview(threadId, feedback)` | Resume a HITL-paused flow review                              |
| `verifyPlan(params)`               | Lightweight plan quality gate (uses `simpleQuery` with Haiku) |

The `verifyPlan` method is called by `PlanProcessor` before executing large/architectural features. It uses a one-turn Haiku query for a goal-backward coverage check. Returns `null` on error (callers approve by default).

### AntagonisticReviewAdapter

Wraps `createAntagonisticReviewGraph()` to match the legacy `AntagonisticReviewService` interface — zero changes required in calling code.

**HITL Flow:**

```typescript
const result = await adapter.executeReview(request);
if (result.hitlPending) {
  // ... collect human feedback (via Discord or Plane)
  const resumed = await service.resumeReview(result.threadId!, feedback);
}
```

The graph state is stored in `activeReviews` (in-memory Map keyed by `threadId`). On resume, feedback is injected via `graph.updateState()` and execution continues from the interrupt node.

### Model Selection

`smartModel` is resolved via `createFlowModel('specGenerationModel', projectPath, { settingsService })`. Respects project-level model overrides from `.automaker/settings.json`.

The agent loop reviewers use `resolveModelString('sonnet')` by default, configurable via `AgentQueryOptions.model`.

> **Note:** `AdapterConfig.smartModel` is deprecated — model selection is handled by `createFlowModel()`.

## Shared Types

Defined in `libs/types/src/antagonistic-review.ts`:

```typescript
interface ReviewRequest {
  prd: SPARCPrd;
  prdId: string;
  projectPath: string;
}

interface ReviewResult {
  success: boolean;
  reviewer: 'ava' | 'jon';
  verdict: string;
  concerns?: string[];
  recommendations?: string[];
  durationMs: number;
  error?: string;
}

interface ConsolidatedReview {
  success: boolean;
  avaReview: ReviewResult;
  jonReview: ReviewResult;
  resolution: string;
  finalPRD?: SPARCPrd;
  totalDurationMs: number;
  totalCost?: number;
  traceId?: string;
  threadId?: string;
  hitlPending?: boolean;
  error?: string;
}
```

## Langfuse Tracing

When Langfuse is available, the adapter creates:

| Span                  | Tracks                            |
| --------------------- | --------------------------------- |
| `antagonistic-review` | Top-level trace with PRD metadata |
| `graph-execution`     | Full graph invocation time        |
| `ava-review`          | Ava node input/output + verdict   |
| `jon-review`          | Jon node input/output + verdict   |
| `consolidate`         | Resolution node input/output      |
| `error`               | Error details on failure          |

Token usage from each node (`avaTokenUsage`, `jonTokenUsage`, `consolidateTokenUsage`) is used to calculate total cost via `calculateCost()`.

## Events

| Event                  | Payload                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- |
| `prd:review:started`   | `{ prdId, projectPath, timestamp }`                                             |
| `prd:review:completed` | `{ prdId, projectPath, totalDurationMs, success, error?, traceId?, timestamp }` |

## Key Files

| File                                                      | Role                                                                             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/server/src/services/antagonistic-review-service.ts` | Orchestration service, feature flag routing, plan verification                   |
| `apps/server/src/services/antagonistic-review-adapter.ts` | LangGraph adapter: board context fetch, `agentQueryFn` injection, HITL, Langfuse |
| `apps/server/src/services/feature-loader.ts`              | `FeatureLoader.getAll(projectPath)` — board context source                       |
| `libs/flows/src/antagonistic-review/state.ts`             | Graph state: `AgentQueryOptions`, `projectPath`, `boardContext`, `agentQueryFn`  |
| `libs/flows/src/antagonistic-review/graph.ts`             | Adapter functions: agent-loop branch + single-turn fallback                      |
| `libs/flows/src/antagonistic-review/nodes/ava-review.ts`  | Ava review node + exported `parseReviewXml`                                      |
| `libs/flows/src/antagonistic-review/nodes/jon-review.ts`  | Jon review node                                                                  |
| `libs/flows/src/antagonistic-review/nodes/consolidate.ts` | Consolidation node (single LLM call)                                             |
| `libs/prompts/src/agents/ava.ts`                          | Canonical `getAvaPrompt()` — Chief of Staff persona                              |
| `libs/prompts/src/agents/jon.ts`                          | Canonical `getJonPrompt()` — GTM persona with brand filter                       |
| `libs/types/src/antagonistic-review.ts`                   | Shared `ReviewRequest`, `ReviewResult`, `ConsolidatedReview` types               |

## See Also

- [Auto Mode Service](./auto-mode-service) — triggers plan reviews via `verifyPlan()`
- [Knowledge Store](./knowledge-store) — agent context injected into review prompts
- [HITL](../../protoWorkstacean/hitl) — Human-in-the-Loop gate for plan approval
