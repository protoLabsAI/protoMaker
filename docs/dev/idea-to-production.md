# Idea to production pipeline

The complete lifecycle of work in protoLabs Studio, from initial signal through merged PR. This document is the canonical reference for all pipeline phases, gates, authority agents, and state transitions.

## Overview

Every piece of work flows through an 8-phase pipeline with two human gates. The pipeline has two branches (ops and gtm), three authority agents, a Lead Engineer state machine, and fast-path supervisor rules.

```
Signal → TRIAGE → RESEARCH → SPEC → SPEC_REVIEW → DESIGN → PLAN → EXECUTE → PUBLISH
                                         ^ GATE                               ^ GATE
```

GTM branch skips DESIGN and PLAN (content doesn't need architectural decomposition).

## Signal entry

Work enters through four channels, all routed by `SignalIntakeService`:

| Source                | Classification  | Path                          |
| --------------------- | --------------- | ----------------------------- |
| GitHub issue/PR event | ops             | Lead Engineer state machine   |
| Discord event         | ops / gtm       | Signal classification + route |
| MCP `create_feature`  | ops (fast path) | Direct to board, skip PM      |
| MCP `process_idea`    | ops (full path) | PM Agent research + PRD       |

**GTM gate:** The entire GTM branch is controlled by the `gtmEnabled` global setting (default: `false`). When disabled, `SignalIntakeService` forces all signals to ops, content API routes return 403, and the UI hides GTM-related nodes. Enable via settings to activate GTM routing.

**Fast path** skips the PM pipeline -- feature goes straight to the board and Lead Engineer picks it up. Use when you know exactly what needs building.

**Full path** routes through PM Agent for research, PRD generation, and CTO approval before decomposition.

### Signal intent classification

`SignalIntakeService` applies a second classification layer -- intent -- independent of the ops/gtm routing. Intent identifies the nature of the signal so the Lead Engineer and downstream agents can handle it appropriately without re-classifying.

**Type:** `SignalIntent` in `libs/types/src/signal-intent.ts`

| Intent           | Description                                                                              | Routing                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `work_order`     | Concrete task ready for implementation (MCP create_feature, UI board action)             | Ops pipeline -- normal execution                                          |
| `idea`           | Vague concept needing PM refinement (MCP process_idea, Discord brainstorm channels)      | PM Agent research + PRD                                                   |
| `feedback`       | Commentary on existing work (PR review, Discord discussion)                              | Routes to running agent via `sendMessageToAgent()` or `followUpFeature()` |
| `conversational` | Casual message or question -- no work item created (Discord @mentions, social exchanges) | GTM or acknowledged without feature creation                              |
| `interrupt`      | Urgent signal requiring immediate human attention (SLA breach, emergency)                | Bypasses PM pipeline entirely -- creates HITL form directly               |

The `intent` field is threaded onto all `signal:routed` events. The interrupt fast-path uses `HITLFormService` (wired via `setHITLFormService()` at server startup).

## The 8 phases

Defined in `libs/types/src/pipeline-phase.ts`.

### Phase 1: TRIAGE

**Gate:** auto | **Agent:** SignalIntakeService | **workItemState:** `idea`

Classify the signal as ops or gtm. Create the feature. Emit `authority:idea-injected`.

### Phase 1.5: TRIAGE + CLARIFICATION (optional HITL gate)

**Gate:** auto or HITL | **Agent:** PM Agent (Opus triage) | **workItemState:** `research`

During triage, the PM Agent evaluates whether the idea is too vague to produce a quality PRD. If clarification is needed, a HITL form dialog is shown to the user with 2-4 targeted questions (generated in the same triage LLM call at zero extra cost). The pipeline pauses up to 10 minutes for a response. On timeout or cancellation, it proceeds gracefully with the original idea. User answers are appended to the feature description as `## User Clarifications` before research begins.

### Phase 2: RESEARCH

**Gate:** auto | **Agent:** PM Agent (Sonnet) | **workItemState:** `research`

PM Agent reads the codebase with read-only tools (enriched by any HITL clarification answers). Investigates feasibility, existing patterns, and constraints. Emits `authority:pm-research-completed`.

### Phase 3: SPEC

**Gate:** auto | **Agent:** PM Agent (Sonnet) | **workItemState:** `pm_processing`

PM Agent generates a SPARC PRD (Situation, Problem, Approach, Results, Constraints). Emits `authority:pm-prd-ready`.

### Phase 4: SPEC_REVIEW

**Gate:** review (ops) / manual (gtm) | **Agent:** none (human) | **workItemState:** `prd_ready`

**First human gate.** The pipeline holds here (`awaitingGate: true`). CTO reviews the PRD and approves or requests changes. On approval, emits `authority:pm-review-approved` and transitions to `approved`.

The PRD approval endpoint (`/api/engine/signal/approve-prd`) bridges directly to `pipelineOrchestrator.resolveGate()`, so approving the PRD also advances the pipeline gate in a single action. Rejecting the PRD resets the feature to `idea` state and rejects the gate.

If a HITL form is pending for the feature (e.g., clarification questions), clicking the gated node in the flow graph or the amber gate indicator in the progress bar opens the HITL form dialog directly.

### Phase 5: DESIGN (ops only)

**Gate:** auto | **Agent:** ProjM Agent | **workItemState:** `approved`

ProjM creates a project with milestones. Only one milestone can be in-progress at a time (sequential execution). Emits `milestone:planned`.

GTM branch skips this phase entirely.

### Phase 6: PLAN (ops only)

**Gate:** auto | **Agent:** ProjM Agent | **workItemState:** `planned`

ProjM decomposes milestone phases into child features with dependencies. Sets up the execution order. Emits `milestone:started`. Features transition to `ready`.

GTM branch skips this phase entirely.

### Phase 7: EXECUTE

**Gate:** auto | **Agent:** Lead Engineer + persona agents | **workItemState:** `in_progress`

The Lead Engineer state machine takes over. See the Lead Engineer section below for the full sub-state machine (INTAKE, PLAN, EXECUTE, REVIEW, MERGE, DEPLOY, DONE).

### Phase 8: PUBLISH

**Gate:** review (ops) / manual (gtm) | **Agent:** PR feedback service | **workItemState:** `done`

**Second human gate.** PR is created, CI runs, CodeRabbit reviews. The pipeline can hold here for human review if issues are found. On clean pass, auto-proceeds. PR merges to target branch (dev, epic, or main). Board status updates to `done`. Emits `feature:pr-merged`.

## Gate system

Defined in `pipeline-orchestrator.ts`.

Three gate modes control phase transitions:

| Mode       | Behavior                                    |
| ---------- | ------------------------------------------- |
| **auto**   | Proceed immediately on phase completion     |
| **review** | Auto-proceed if clean; hold if issues found |
| **manual** | Always hold, wait for human action          |

### Default gate configuration (ops)

| Phase transition     | Gate       |
| -------------------- | ---------- |
| TRIAGE → RESEARCH    | auto       |
| RESEARCH → SPEC      | auto       |
| SPEC → SPEC_REVIEW   | auto       |
| SPEC_REVIEW → DESIGN | **review** |
| DESIGN → PLAN        | auto       |
| PLAN → EXECUTE       | auto       |
| EXECUTE → PUBLISH    | **review** |
| PUBLISH → done       | auto       |

### Gate hold state

When a gate holds, the feature's `pipelineState` records:

```typescript
{
  awaitingGate: true,
  awaitingGatePhase: 'SPEC_REVIEW',
  gateArtifacts: { /* phase-specific context */ }
}
```

Gate resolution emits `pipeline:gate-resolved` and advances to the next phase.

**Duplicate event guard:** Multiple events can map to the same phase completion (e.g., both `authority:pm-prd-ready` and `ideation:prd-generated` map to SPEC completed). The orchestrator's `handlePhaseEvent` checks `!pipelineState.awaitingGate` before calling `advancePhase`, preventing duplicate gate holds from redundant events.

## Authority agents

Three AI agents manage the pre-execution pipeline. Defined in `apps/server/src/services/authority-agents/`.

### PM Agent (`pm-agent.ts`)

**Phases:** TRIAGE, RESEARCH, SPEC

- Triggered by `authority:idea-injected`
- Opus triage decides web research need + generates clarifying questions for vague ideas
- If clarification needed, shows HITL form dialog (10 min TTL, `callerType: 'api'`)
- Researches codebase with read-only tools (Sonnet), enriched by user clarification
- Generates SPARC PRD
- Posts to Discord for CTO review
- State flow: `idea → pm_review → research → [HITL form] → pm_processing → prd_ready`

### ProjM Agent (`projm-agent.ts`)

**Phases:** DESIGN, PLAN

- Triggered by `authority:pm-review-approved`
- Creates project with milestones (sequential, one at a time)
- Decomposes phases into child features with dependencies
- State flow: `approved → planned → ready`

### EM Agent (`em-agent.ts`)

**Phase:** EXECUTE kickoff

- Polls for `ready` features every 10 seconds
- Checks capacity (WIP limit, default 3)
- Assigns model by complexity, triggers auto-mode
- State flow: `ready → in_progress`

## Lead Engineer state machine

Defined in `apps/server/src/services/lead-engineer-service.ts`. This is the per-feature execution engine that runs inside phase 7 (EXECUTE).

```
INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DEPLOY → DONE
                    |         |
                 (retry)   (CI fail → back to EXECUTE)
                    |
                 BLOCKED → ESCALATE (to Ava)
```

### INTAKE

Check dependencies, assign persona agent based on file-path domain detection:

| File pattern                            | Agent                |
| --------------------------------------- | -------------------- |
| `apps/ui/`, components                  | Frontend agent       |
| `apps/server/src/routes/`, services     | Backend agent        |
| `libs/flows/`, providers, observability | Infrastructure agent |
| `scripts/`, Docker, `.github/`          | DevOps agent         |
| Mixed or unclear                        | Backend (default)    |

Model selection by complexity: small → Haiku, medium/large → Sonnet, architectural → Opus.

If dependencies unmet → BLOCKED. If plan needed (large/architectural) → PLAN. Otherwise → EXECUTE.

### PLAN (complex features only)

Generate task breakdown. For architectural features, an antagonistic gate challenges the plan before execution. Optional human approval gate (`awaitingGate`).

### EXECUTE

Persona agent runs in isolated worktree. On success → REVIEW. On failure: retry with context (max 3 attempts per complexity tier), then escalate model (haiku → sonnet → opus). After exhausting retries → BLOCKED/ESCALATE.

### REVIEW

PR created, CI runs, CodeRabbit reviews. `PRFeedbackService` polls GitHub every 60 seconds:

- On `changes_requested`: collect feedback, send to agent for remediation (max 2 feedback cycles)
- On `approved` + CI passing → MERGE
- On CI failure → back to EXECUTE with failure context
- Max 4 total remediation cycles before escalation

### MERGE

Verify CI, merge PR (squash/merge/rebase per settings). Emit `feature:pr-merged`. Board status → `done`.

### DONE

Terminal state. Cleanup checkpoint, store metrics, update Langfuse traces.

## Escalation routing

When the Lead Engineer can't resolve a situation, signals are routed through the `EscalationRouter` to appropriate channels based on severity and signal type. See [Escalation routing](../agents/escalation-routing) for the full architecture.

| Trigger                | Action                        |
| ---------------------- | ----------------------------- |
| Feature fails 3+ times | Escalate model, then flag Ava |
| PR fails CI 3+ times   | Flag Ava with failure context |
| Budget exceeded        | Stop agent, flag Ava          |
| Circular dependency    | Flag Ava                      |
| Unknown error          | Flag Ava for manual triage    |

## Fast-path supervisor rules

Defined in `apps/server/src/services/lead-engineer-rules.ts`. Pure functions (no LLM) that react to events:

| Rule               | Trigger                          | Action                             |
| ------------------ | -------------------------------- | ---------------------------------- |
| mergedNotDone      | PR merged, status still review   | Move to done                       |
| orphanedInProgress | In-progress >4h, no agent        | Reset to backlog                   |
| staleDeps          | Blocked + all deps done          | Unblock                            |
| autoModeHealth     | Backlog >0 + auto-mode off       | Restart auto-mode                  |
| staleReview        | Review >30min, no auto-merge     | Enable auto-merge                  |
| stuckAgent         | Agent running >2h                | Abort and resume                   |
| prApproved         | PR approved                      | Enable auto-merge, resolve threads |
| capacityRestart    | Feature completed + more backlog | Restart auto-mode                  |
| projectCompleting  | All features done                | Trigger project completion         |

## Feature status system

Five canonical statuses on the board (`libs/types/src/feature.ts`):

```
backlog → in_progress → review → done
             |           |
          blocked < < < -+
```

### Pipeline phase to status mapping

| Pipeline phase | workItemState | Board status |
| -------------- | ------------- | ------------ |
| TRIAGE         | idea          | backlog      |
| RESEARCH       | research      | backlog      |
| SPEC           | pm_processing | backlog      |
| SPEC_REVIEW    | prd_ready     | backlog      |
| DESIGN         | approved      | backlog      |
| PLAN           | planned       | backlog      |
| EXECUTE        | in_progress   | in_progress  |
| PUBLISH        | done          | done         |

## Dependency resolution

Defined in `libs/dependency-resolver/src/resolver.ts`. Uses Kahn's algorithm with priority-aware selection.

**Foundation dependencies** (`isFoundation: true`) require the dependency to be `done` (merged to main).

**Standard dependencies** allow `review` or `done` -- work can start once the dependency has a PR up.

## Observability

Every pipeline run creates a Langfuse trace (UUID). Each phase creates a span within the trace. Stored in `pipelineState.traceId` and `pipelineState.phaseSpanIds`.

## Multi-pipeline UI

The flow graph view tracks all concurrent pipelines, not just one. When multiple features have active pipeline states, a pill selector appears above the progress bar.

**Components:**

- `PipelinePillSelector` -- horizontal row of chips, each showing feature title + status dot (violet=active, amber=gated, emerald=done). Auto-hides when <=1 pipeline active.
- `PipelineProgressBar` -- unchanged, always shows the selected pipeline's 8-phase stepper.
- `usePipelineProgress` hook -- tracks a `Map<featureId, PipelineEntry>` internally. WebSocket events upsert by `featureId`. Exposes `pipelines` array + `selectedFeatureId` + `setSelectedFeatureId`.

**Gate interaction:** Clicking the amber gate indicator on the progress bar or a gated pipeline-stage node opens the pending HITL form for the selected pipeline's feature (if one exists). The `Advance`/`Reject` buttons in the progress bar resolve the selected pipeline's gate.

## Key files

| File                                                                     | Purpose                           |
| ------------------------------------------------------------------------ | --------------------------------- |
| `libs/types/src/pipeline-phase.ts`                                       | 8 phases, gate modes, transitions |
| `libs/types/src/feature.ts`                                              | Feature status, pipelineState     |
| `libs/types/src/authority.ts`                                            | WorkItemState (15 states)         |
| `libs/types/src/lead-engineer.ts`                                        | Lead Engineer types               |
| `apps/server/src/services/pipeline-orchestrator.ts`                      | Phase transitions and gates       |
| `apps/server/src/services/signal-intake-service.ts`                      | Signal classification             |
| `apps/server/src/services/lead-engineer-service.ts`                      | State machine                     |
| `apps/server/src/services/lead-engineer-rules.ts`                        | Fast-path rules                   |
| `apps/server/src/services/auto-mode-service.ts`                          | Orchestration, worktree mgmt      |
| `apps/server/src/services/feature-scheduler.ts`                          | Scheduling loop, dep resolution   |
| `apps/server/src/services/notification-router.ts`                        | Notification signal routing       |
| `apps/server/src/services/pr-feedback-service.ts`                        | PR polling and remediation        |
| `apps/server/src/services/hitl-form-service.ts`                          | HITL form creation and responses  |
| `apps/server/src/services/escalation-router.ts`                          | Escalation signal routing         |
| `apps/server/src/services/authority-agents/pm-agent.ts`                  | PM (research + PRD + HITL)        |
| `apps/server/src/services/authority-agents/projm-agent.ts`               | ProjM (milestone planning)        |
| `apps/server/src/services/authority-agents/em-agent.ts`                  | EM (capacity + execution)         |
| `apps/ui/src/components/views/flow-graph/hooks/use-pipeline-progress.ts` | Multi-pipeline tracking hook      |
| `apps/ui/src/components/views/flow-graph/pipeline-pill-selector.tsx`     | Pipeline selector UI              |
| `apps/ui/src/components/views/flow-graph/pipeline-progress-bar.tsx`      | Phase stepper + gate button       |
| `apps/ui/src/components/shared/hitl-form/hitl-form-dialog.tsx`           | HITL form dialog                  |

## Next steps

- [Escalation routing](../agents/escalation-routing) -- Escalation channel architecture and configuration
- [Inbox system](./inbox-system) -- Unified actionable items inbox
- [Feature status system](./feature-status-system) -- Canonical status details
- [PR remediation loop](./pr-remediation-loop) -- CI failure handling
