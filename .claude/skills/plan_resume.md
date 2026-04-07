---
name: plan_resume
description: Resume a pending plan after HITL approval/rejection. Resumes plan state by correlationId.
category: planning
argument-hint: [correlationId] [approve|reject|modify] [optional feedback]
allowed-tools:
  - Read
  - Bash
---

# plan_resume -- Resume Planning After HITL

Resumes a pending plan after human approval, rejection, or modification request.

## On approve

1. Load PlanState from SQLite store by correlationId
2. Create project + features on board
3. Stamp all features with correlationId in metadata
4. Emit plan:created event
5. Return: {status: "created", projectSlug, featureCount}

## On reject

1. Load PlanState, mark as rejected
2. Delete from plan store
3. Emit plan:rejected event
4. Return: {status: "rejected"}

## On modify

1. Load PlanState with feedback
2. Re-draft PRD incorporating feedback
3. Re-run antagonistic review (Ava + Jon)
4. Emit new HITLRequest to bus/reply topic
5. Return: {status: "pending_approval", correlationId}

## A2A wire format

Workstacean sends structured payloads:

```json
{
  "correlationId": "ws-abc123",
  "decision": "approve"
}
```

Or with feedback for modifications:

```json
{
  "correlationId": "ws-abc123",
  "decision": "modify",
  "feedback": "reduce scope to MVP, drop the knowledge graph for v1"
}
```

## Implementation

The resume logic is in `apps/server/src/services/planning-service.ts` (PlanningService.resumePlan).
A2A routing is in `apps/server/src/routes/a2a/index.ts` (skillHint === 'plan_resume').
State is loaded from SQLite via `apps/server/src/services/plan-store.ts`.
