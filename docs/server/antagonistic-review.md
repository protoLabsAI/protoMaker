# Antagonistic Review

Dual-perspective PRD review pipeline that stress-tests product decisions through adversarial Ava (ops) and Jon (market) critiques before consolidating into an updated PRD.

## Overview

`AntagonisticReviewService` orchestrates a 3-stage sequential review pipeline to validate PRDs before they are approved for implementation:

1. **Ava reviews** for operational feasibility — capacity, risk, technical debt
2. **Jon reviews** for market value — customer impact, ROI, strategic positioning
3. **Resolution** — Ava as Chief of Staff synthesizes both verdicts into a consolidated PRD

When the `useGraphFlows` feature flag is enabled (default: `true`), execution is delegated to `AntagonisticReviewAdapter` which runs the review as a LangGraph state machine. The legacy `DynamicAgentExecutor` path remains as a fallback.

Reviews must complete within **3 minutes** (`REVIEW_TIMEOUT_MS = 180_000`).

## Architecture

```text
AntagonisticReviewService
  ├── Feature flag: useGraphFlows
  │     ├── true  → AntagonisticReviewAdapter (LangGraph flow)
  │     └── false → DynamicAgentExecutor (legacy)
  └── AntagonisticReviewAdapter
        ├── createAntagonisticReviewGraph()   — LangGraph state machine
        ├── createFlowModel()                 — settings-aware LLM factory
        ├── Langfuse tracing                  — per-stage spans + cost tracking
        └── HITL support                      — pause/resume via threadId checkpoint
```

### Review Pipeline

```text
executeReview(ReviewRequest)
  → Stage 1: executeAvaReview()
      — operational feasibility (capacity, risk, debt)
      — verdict: APPROVE / APPROVE_WITH_CONDITIONS / REJECT
  → Stage 2: executeJonReview()
      — market value (ROI, customer impact, positioning)
      — has access to Ava's critique
      — verdict: APPROVE / APPROVE_WITH_CONDITIONS / REJECT
  → Stage 3: executeResolution()
      — Ava as CoS synthesizes both verdicts
      — outputs consolidated SPARC PRD + final decision
  → ConsolidatedReview returned to caller
```

## Key Components

### AntagonisticReviewService

Singleton service that owns the review pipeline. Key methods:

| Method                             | Description                                                   |
| ---------------------------------- | ------------------------------------------------------------- |
| `executeReview(request)`           | Run full pipeline; routes to flow or legacy path              |
| `resumeReview(threadId, feedback)` | Resume a HITL-paused flow review                              |
| `verifyPlan(params)`               | Lightweight plan quality gate (uses `simpleQuery` with Haiku) |

The `verifyPlan` method is called by `PlanProcessor` before executing large/architectural features. It uses a one-turn Haiku query to check for missing error handling, architectural risks, missing tests, and overly complex approaches. Returns `null` on error (callers approve by default).

### AntagonisticReviewAdapter

Wraps `createAntagonisticReviewGraph()` to match the legacy `AntagonisticReviewService` interface — zero changes required in calling code.

**HITL Flow:**

```typescript
// Adapter returns hitlPending: true if graph interrupted
const result = await adapter.executeReview(request);
if (result.hitlPending) {
  // ... collect human feedback
  const resumed = await service.resumeReview(result.threadId!, feedback);
}
```

The graph state is stored in `activeReviews` (in-memory Map keyed by `threadId`). On resume, feedback is injected via `graph.updateState()` and execution continues from the interrupt node.

### Model Selection

The `smartModel` is resolved via `createFlowModel('specGenerationModel', projectPath, { settingsService })`. This respects project-level model overrides from `.automaker/settings.json`.

> **Note:** The `AdapterConfig.smartModel` field is deprecated — model selection is now handled entirely by `createFlowModel()`.

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

function extractPRDFromText(text: string, fallback: SPARCPrd): SPARCPrd;
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

| File                                                      | Role                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/server/src/services/antagonistic-review-service.ts` | Orchestration service, feature flag routing, plan verification     |
| `apps/server/src/services/antagonistic-review-adapter.ts` | LangGraph flow adapter with HITL and Langfuse tracing              |
| `libs/types/src/antagonistic-review.ts`                   | Shared `ReviewRequest`, `ReviewResult`, `ConsolidatedReview` types |
| `libs/flows/src/index.ts`                                 | Exports `createAntagonisticReviewGraph()`                          |

## See Also

- [Auto Mode Service](./auto-mode-service) — triggers plan reviews via `verifyPlan()`
- [Knowledge Store](./knowledge-store) — agent context injected into review prompts
