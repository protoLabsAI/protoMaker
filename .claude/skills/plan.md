---
name: plan
description: Idea intake -- generate SPARC PRD, run Ava x Jon antagonistic review, gate via HITL, create board project on approval.
category: planning
argument-hint: [idea description]
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
---

# plan -- Idea Intake & Planning

Receives an idea from any source (Discord, voice, Plane, GitHub), runs it through
the full planning pipeline, and returns immediately after posting the HITL gate.

## Flow

1. Extract the idea text and correlationId from the A2A message
2. Generate a SPARC PRD (Situation, Problem, Approach, Results, Constraints)
3. Run antagonistic review:
   - Ava lens: operational feasibility, capacity, technical risk
   - Jon lens: customer value, market positioning, ROI
4. Post HITLRequest to reply.topic (bus)
5. Return: {status: "pending_approval", correlationId}

The PlanStore (SQLite-backed) persists state keyed by correlationId.
Resume happens via the `plan_resume` skill.

## SPARC PRD format

Generate a concise PRD with:

- **Situation**: Current state, why this matters now
- **Problem**: What specific problem this solves
- **Approach**: How to solve it (high level)
- **Results**: Definition of done, success metrics
- **Constraints**: Team capacity, dependencies, risks

## Antagonistic review

Ava (operational):

- Is the team capacity available?
- What's the technical risk?
- What debt does this create?
- Is the timeline realistic?

Jon (strategic):

- Does this create customer/community value?
- Does it strengthen market positioning?
- What's the ROI vs alternatives?
- Is this the right time?

## Auto-approve path

If both Ava and Jon return high-confidence APPROVE (score > 4.0, no blocking concerns),
the plan is auto-approved and the project + epic feature are created immediately on the board.
No HITL gate is emitted.

## HITLRequest emitted to reply.topic

```json
{
  "type": "hitl_request",
  "correlationId": "<from A2A contextId>",
  "title": "<PRD title>",
  "summary": "<2-3 sentence plain text summary>",
  "avaVerdict": { "score": 3.5, "concerns": [], "verdict": "APPROVE_WITH_CONDITIONS" },
  "jonVerdict": { "score": 4.0, "concerns": [], "verdict": "APPROVE" },
  "options": ["approve", "reject", "modify"],
  "expiresAt": "<ISO, 24h from now>",
  "replyTopic": "<reply.topic from incoming message>"
}
```

## Implementation

The pipeline is implemented in `apps/server/src/services/planning-service.ts` (PlanningService).
State is persisted in `apps/server/src/services/plan-store.ts` (SQLite, $DATA_DIR/plans.db).
A2A routing is in `apps/server/src/routes/a2a/index.ts` (skillHint === 'plan').
