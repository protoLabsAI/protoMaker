# Research Report: Lead Engineer Pipeline Alignment

Generated: 2026-03-14T08:10:06.446Z
Sub-topics investigated: 5
Total citations: 56
Models used: Haiku (compression), Sonnet (research), Opus (synthesis)

# Lead Engineer Pipeline Alignment — Comprehensive Research Report

## Summary

The Lead Engineer pipeline contains **15 confirmed alignment gaps** across four subsystems: the feature processing state machine, the event bus rule engine, the ceremony lifecycle orchestrator, and the merge pipeline. The most critical defect is a chain of three interlocking bugs (C1–C3) where `DeployProcessor` returns `nextState: null` instead of `'DONE'` [2], causing every successfully deployed feature to be marked `'blocked'` instead of `'completed'` [3], because the outcome gate's `'DONE'` branch is permanently unreachable [12]. This single defect chain silently breaks knowledge indexing, downstream completion logic, and checkpoint cleanup.

Secondary clusters of bugs disable the ceremony lifecycle (stuck at `milestone_retro` due to missing `remainingMilestones` [19], dead `project:completed` event [21], bypassed retro executor [23]), render three event-bus rules permanently dead (`autoModeHealth` [41], `rollbackTriggered` [42], `mergedNotDone` [34]), and force all PR merges through `--squash` regardless of configured strategy [30]. The `rebaseWorktreeOnMain` function misleadingly uses `git merge` rather than rebase [36], and a base-branch default mismatch (`'dev'` vs `'main'`) creates silent integration failures [38].

No single gap is isolated — the bugs form dependency chains where fixing one (e.g., adding a `DONE` processor) without fixing others (e.g., `DeployProcessor` return value) yields partial remediation at best.

---

## Codebase Findings

### 1. State Machine & Pipeline Architecture

#### 1.1 Missing `DONE` Processor (Gap #1)

`FeatureProcessingState` defines eight states including `'DONE'` [13]:

```typescript
// apps/server/src/services/lead-engineer-types.ts:97-105
export type FeatureProcessingState =
  | 'INTAKE'
  | 'PLAN'
  | 'EXECUTE'
  | 'REVIEW'
  | 'MERGE'
  | 'DEPLOY'
  | 'DONE'
  | 'ESCALATE';
```

However, `FeatureStateMachine` registers only seven processors [14]:

```typescript
// apps/server/src/services/lead-engineer-state-machine.ts:112-118
this.processors.set('INTAKE', new IntakeProcessor(serviceContext));
this.processors.set('PLAN', new PlanProcessor(serviceContext));
this.processors.set('EXECUTE', new ExecuteProcessor(serviceContext));
this.processors.set('REVIEW', new ReviewProcessor(serviceContext));
this.processors.set('MERGE', new MergeProcessor(serviceContext));
this.processors.set('DEPLOY', new DeployProcessor(serviceContext));
this.processors.set('ESCALATE', new EscalateProcessor(serviceContext));
```

Any transition to `'DONE'` hits the missing-processor error path and redirects to `ESCALATE` [1].

#### 1.2 Critical Bug Chain: C1–C3 (Gaps #2–#3)

**C1 — `DeployProcessor` returns `null` instead of `'DONE'`** [2][11]:

```typescript
// apps/server/src/services/lead-engineer-deploy-processor.ts:77-81
return { nextState: null, shouldContinue: false, reason: 'Feature deployed and verified' };
```

The processing loop breaks when `shouldContinue === false` with `currentState` still set to `'DEPLOY'` [8].

**C2 — Outcome gate unreachable for `'completed'`** [3][12]:

```typescript
// apps/server/src/services/lead-engineer-service.ts:522-527
const outcome: PipelineResult['outcome'] =
  result.finalState === 'DONE'
    ? 'completed'
    : result.finalState === 'ESCALATE'
      ? 'escalated'
      : 'blocked';
```

Since `finalState` is always `'DEPLOY'` (never `'DONE'`), every successfully deployed feature receives outcome `'blocked'`. Knowledge indexing at line 550 and all downstream "feature completed" logic silently no-op [3].

**C3 — Checkpoint cleanup compensates for the bug** [8][18]:

```typescript
// apps/server/src/services/lead-engineer-state-machine.ts:352-361
if (currentState === 'DONE' || currentState === 'DEPLOY' || currentState === 'ESCALATE') {
  await this.checkpointService.delete(projectPath, feature.id);
}
```

`'DEPLOY'` is included as a terminal state only because the machine never reaches `'DONE'` in practice. Once `DONE` is fixed, `'DEPLOY'` should be removed from this condition.

#### 1.3 Orphaned `VERIFY` State (Gap #4)

The legacy `FeatureState` enum documents and defines `VERIFY` [4][15]:

```typescript
// libs/types/src/lead-engineer.ts:297-322
// Flow: INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DEPLOY → VERIFY → DONE
export enum FeatureState {
  DEPLOY = 'DEPLOY',
  VERIFY = 'VERIFY',
  DONE = 'DONE',
  ESCALATE = 'ESCALATE',
}
```

The active `FeatureProcessingState` type omits `VERIFY` [13]. No `VerifyProcessor` exists. The JSDoc is stale.

#### 1.4 No-Op Exit Gates (Gap #5)

Both `review-exit` and `merge-exit` gates unconditionally pass [5][16]:

```typescript
// apps/server/src/services/lead-engineer-state-machine.ts:62-81
['review-exit', {
  evaluate: (_ctx: StateContext) => ({
    passed: true, reason: 'Review validated by processor'
  })
}],
['merge-exit', {
  evaluate: (_ctx: StateContext) => ({
    passed: true, reason: 'Merge confirmed by processor'
  }),
  retryTarget: 'MERGE'  // dead code
}],
```

The `retryTarget: 'MERGE'` on `merge-exit` is dead code — the gate never fails [5][32].

#### 1.5 External-Merge Fast-Path Skips DEPLOY (Gap #6)

```typescript
// apps/server/src/services/lead-engineer-review-merge-processors.ts:92-108
logger.info('[REVIEW] Externally merged PR detected, transitioning to DONE', {
  featureId: ctx.feature.id,
});
return { nextState: null, shouldContinue: false, reason: 'PR merged externally' };
```

Logs say "transitioning to DONE" but returns `null`, stopping at current state [6][17]. No `DEPLOY` phase runs, no `feature:completed` event fires.

#### 1.6 ReviewProcessor "Already Done" Returns Null (Gap #7)

```typescript
// apps/server/src/services/lead-engineer-review-merge-processors.ts:81-85
// When ctx.feature.status === 'done', returns { nextState: null, shouldContinue: false }
```

Same pattern as C1 — stops at current state instead of transitioning to `'DONE'` [7].

#### 1.7 `execute-entry` Gate Missing `retryTarget` (Gap #10)

When `execute-entry` gate fails (missing `description`/`title`), the fallback is `retryTarget || 'ESCALATE'` [10]. No `retryTarget` is configured, so features with missing metadata escalate immediately rather than retrying from `INTAKE`. In contrast, `execute-exit` correctly defines `retryTarget: 'EXECUTE'` [10].

#### 1.8 Overflow Detection (Confirmed Correct)

`MAX_TRANSITIONS = 20` and `MAX_SAME_STATE_TRANSITIONS = 100` are correctly enforced [9]. Overflow runs `ESCALATE` processor inline rather than re-entering the loop.

---

### 2. Event Bus Rules & Event-Driven Behavior

#### 2.1 `autoModeHealth` Rule — Dead Due to Envelope Wrapping (Gap #8)

The rule declares triggers `['auto-mode:stopped', 'auto-mode:idle']` [41][53]:

```typescript
// apps/server/src/services/lead-engineer-rules.ts:162
export const autoModeHealth: LeadFastPathRule = {
  name: 'autoModeHealth',
  triggers: ['auto-mode:stopped', 'auto-mode:idle'],
  evaluate(worldState): LeadRuleAction[] {
    const backlogCount = worldState.boardCounts['backlog'] || 0;
    if (backlogCount > 0 && !worldState.autoModeRunning) {
      return [{ type: 'restart_auto_mode' }];
    }
    return [];
  },
};
```

But `TypedEventBus.emitAutoModeEvent()` wraps all signals in an `'auto-mode:event'` envelope [40][52]:

```typescript
// apps/server/src/services/auto-mode/typed-event-bus.ts:59
this.events.emit('auto-mode:event', {
  type: eventType, // 'stopped', 'idle', etc. buried in payload
  ...data,
});
```

The rule engine uses strict string-match `rule.triggers.includes(eventType)` [48][56] — `'auto-mode:event'` never matches `'auto-mode:stopped'` or `'auto-mode:idle'`, so the rule never fires.

#### 2.2 `rollbackTriggered` Rule — Permanently Dead (Gap #9)

```typescript
// apps/server/src/services/lead-engineer-rules.ts:546
export const rollbackTriggered: LeadFastPathRule = {
  name: 'rollbackTriggered',
  triggers: ['feature:health-degraded', 'health:signal'],
};
```

Neither `'feature:health-degraded'` nor `'health:signal'` appears in `GENERIC_EVENT_TYPE_TO_TRIGGER` or any emit callsite [42][43]. These events are never emitted anywhere in the codebase.

#### 2.3 `mergedNotDone` Rule — Ordering Bug Makes It Dead (Gap #10)

```typescript
// apps/server/src/services/lead-engineer-rules.ts:40-52
export const mergedNotDone: LeadFastPathRule = {
  triggers: ['feature:pr-merged', 'feature:status-changed'],
  // Checks: feature.status === 'review' && feature.prMergedAt
};
```

`MergeProcessor` sets `status: 'done'` **before** emitting `feature:pr-merged` [33][34]:

```typescript
// apps/server/src/services/lead-engineer-review-merge-processors.ts:481-493
status: 'done',  // ← set first
this.serviceContext.events.emit('feature:pr-merged' as EventType, {...});  // ← emitted second
```

By the time the rule evaluates, `feature.status` is already `'done'`, not `'review'`, so the condition `feature.status === 'review'` is always false [34].

#### 2.4 `evaluateRules()` — Strict String Matching, No Wildcards

```typescript
// apps/server/src/services/lead-engineer-rules.ts:781
export function evaluateRules(
  rules: LeadFastPathRule[],
  worldState: LeadWorldState,
  eventType: string,
  eventPayload: unknown
): LeadRuleAction[] {
  const actions: LeadRuleAction[] = [];
  for (const rule of rules) {
    if (!rule.triggers.includes(eventType)) continue;
    // ...
  }
  return actions;
}
```

All 17 fast-path rules use strict string-match [48]. No wildcard or prefix matching exists — any event type mismatch silently skips the rule.

#### 2.5 Recursion Prevention Is Intentional

`LeadEngineerService` deliberately excludes `lead-engineer:rule-evaluated` to prevent infinite recursion [44][55]:

```typescript
// apps/server/src/services/lead-engineer-service.ts:252
this.events.subscribe((type: EventType, payload: unknown) => {
  if (type !== 'lead-engineer:rule-evaluated') {
    this.onEvent(type, payload);
  }
});
```

Rules that rely solely on self-tick (`stuckAgent`, `remediationStalled`) fire only via periodic refresh, not on-demand [44].

#### 2.6 Unverified Event Types

`pr:merge-blocked-critical-threads` [45] and `pr:missing-ci-checks` [46] are not present in `GENERIC_EVENT_TYPE_TO_TRIGGER` [43][49]. If not emitted elsewhere, associated rules are dormant.

---

### 3. Ceremony System Lifecycle & Orchestration

#### 3.1 Missing `remainingMilestones` — State Machine Stuck (Gap #11)

`ceremony:fired` emissions omit `remainingMilestones` [19]:

```typescript
// apps/server/src/services/ceremony-service.ts:750
this.emitter?.emit('ceremony:fired', {
  type: 'milestone_retro',
  projectSlug,
  milestoneSlug,
  projectPath,
  // ← remainingMilestones NEVER included
});
```

The state machine defaults to `1` when the field is absent [20]:

```typescript
// apps/server/src/services/ceremony-state-machine.ts:27
} else if (phase === 'milestone_retro' && event === 'ceremony:fired(retro)') {
  const remaining = ... ?? 1;   // defaults to 1
  nextPhase = remaining <= 0 ? 'project_retro' : 'milestone_active';
}
```

Result: the machine always transitions back to `milestone_active`, never reaching `project_retro`.

#### 3.2 Unregistered `project:completed` Event (Gap #12)

`CeremonyService` calls `applyTransition` with `'project:completed'` [21]:

```typescript
// apps/server/src/services/ceremony-service.ts:884
await this.applyTransition(projectPath, projectSlug, 'project:completed', payload);
```

But the ceremony state machine has no matching rule for `'project:completed'` [22]. The call silently returns state unchanged.

Additionally, `LeadEngineerCeremonies.handleProjectCompleting` emits `'lead-engineer:project-completed'`, not `'project:completed'` [28]:

```typescript
// apps/server/src/services/lead-engineer-ceremonies.ts:37
this.deps.events.emit('lead-engineer:project-completed', { ... });
// ← never emits 'project:completed'
```

#### 3.3 `CeremonyActionExecutor` Dead Code — Missing `retroData` (Gap #13)

All three `ceremony:fired` emissions (lines 627–632, 750–755, 991) omit `retroData` [23][24]. The executor's `handleRetroCompleted` exits immediately:

```typescript
// apps/server/src/services/ceremony-action-executor.ts:264
if (!retroData) {
  logger.debug(`CeremonyActionExecutor: no retroData for ${type} in ${projectSlug}, skipping`);
  return; // ← always exits
}
```

LLM classification, context updates, and improvement-feature creation never execute [23].

#### 3.4 Missing `gate-tuning` Handler (Gap #14)

The action-execution loop handles only `context-update` and `improvement-feature` [25]:

```typescript
// apps/server/src/services/ceremony-action-executor.ts:291
for (const result of classified) {
  if (result.actionType === 'context-update' && ...) { ... }
  else if (result.actionType === 'improvement-feature' && ...) { ... }
  // ← no 'gate-tuning' branch
}
```

`gate:tuning-signal` is never emitted.

#### 3.5 Timestamp Fields Never Updated (Gap #15)

```typescript
// apps/server/src/services/ceremony-service.ts:373
const defaultState: CeremonyState = {
  lastStandup: '',   // ← never updated
  lastRetro: '',     // ← never updated
  ...
};
```

After ceremony execution, neither `lastStandup` nor `lastRetro` is written back [26][27].

#### 3.6 State Update Race Condition

Milestone tracking update runs fire-and-forget, racing with the standup flow [29]:

```typescript
// apps/server/src/services/ceremony-service.ts:538
this.getCeremonyState(...).then(...).catch(...);  // fire-and-forget
```

---

### 4. Merge Pipeline Strategy & Conflict Resolution

#### 4.1 Hardcoded `--squash` Ignores Configuration (Gap #16)

`MergeProcessor` hardcodes `--squash` [30]:

```typescript
// apps/server/src/services/lead-engineer-review-merge-processors.ts:452
await execAsync(`gh pr merge ${ctx.prNumber} --squash`, {
  cwd: ctx.projectPath,
  timeout: 60000,
});
```

Meanwhile, `GitHubMergeService` correctly routes strategies but is entirely bypassed [31]:

```typescript
// apps/server/src/services/github-merge-service.ts:148-186
switch (strategy) {
  case 'merge':
    autoMergeCmd += ' --merge';
    break;
  case 'squash':
    autoMergeCmd += ' --squash';
    break;
  case 'rebase':
    autoMergeCmd += ' --rebase';
    break;
}
```

#### 4.2 `feature:pr-merged` Event Ordering (Gap #17)

As described in §2.3, status is set to `'done'` before the event emits [33], making the `mergedNotDone` rule permanently ineffective [34].

#### 4.3 CI Gate Retry — Fragile String Matching

```typescript
// apps/server/src/services/lead-engineer-review-merge-processors.ts:505-517
if (errMsg.includes('check') || errMsg.includes('pending') || errMsg.includes('required')) {
  ctx.mergeRetryCount++;
  return { nextState: 'MERGE', shouldContinue: true };
}
```

Matches unrelated error messages containing "check" or "required" [35].

#### 4.4 `rebaseWorktreeOnMain` Misnamed — Uses `git merge` (Gap #18)

```typescript
// libs/git-utils/src/rebase.ts:53-82
await execAsync(`git merge ${targetBranch}`, { ... });
// On conflict:
await execAsync('git merge --abort', { cwd: worktreePath, timeout: 30_000 });
return { success: false, hasConflicts: true };
```

Function is named "rebase" but performs a merge [36]. Conflicts silently abort with no resolution attempt.

#### 4.5 Base Branch Default Mismatch

`prBaseBranch` defaults to `'dev'` [38]:

```typescript
// libs/types/src/git-settings.ts:57-67
export const DEFAULT_GIT_WORKFLOW_SETTINGS: Required<GitWorkflowSettings> = {
  prBaseBranch: 'dev',
  // ...
};
```

But `rebaseWorktreeOnMain` implies `'main'` as its target. This creates a mismatch when defaults are used across the pipeline [36][38].

#### 4.6 `MergeEligibilityService` Unused

The service implements five eligibility checks (`ci_passing`, `reviews_approved`, `no_requested_changes`, `conversations_resolved`, `up_to_date`) [37] but is never called by the pipeline — `MergeProcessor` handles merge attempts directly [30].

---

## Relevant Patterns & Integration Points

**Pattern 1: `null`-as-terminal convention.** Multiple processors (`DeployProcessor` [2], `ReviewProcessor` [7], external-merge fast-path [6]) use `{ nextState: null, shouldContinue: false }` to signal completion. The processing loop treats `null` as "stop here" but never maps it to `'DONE'`. This is the root convention causing C1–C3.

**Pattern 2: Event envelope wrapping.** `TypedEventBus` wraps auto-mode signals in `'auto-mode:event'` [52], but the rule engine matches on raw event types [56]. Any rule targeting unwrapped sub-types is dead.

**Pattern 3: Fire-and-forget state writes.** Ceremony state updates [29] and timestamp writes [26] use `.then().catch()` patterns without awaiting, creating race conditions with concurrent flows.

**Pattern 4: Gate-as-documentation.** Exit gates (`review-exit`, `merge-exit`) exist structurally but unconditionally pass [5][32]. They serve as documentation placeholders, not enforcement points. The `retryTarget` on `merge-exit` is dead code.

**Pattern 5: Service bypass.** `MergeProcessor` directly shells out to `gh pr merge` [30] rather than calling `GitHubMergeService` [31] or `MergeEligibilityService` [37], bypassing all strategy routing and eligibility checks.

**Integration Points:**

- `LeadEngineerService.processFeature()` → `FeatureStateMachine.run()` → outcome gate [3][12]
- `CeremonyService` ↔ `CeremonyStateMachine` ↔ `CeremonyActionExecutor` [19][20][23]
- `LeadEngineerCeremonies` → event bus → `CeremonyService` (broken: wrong event name) [28]
- `evaluateRules()` ← event bus subscriber [44][48]

---

## External Research

No external research was required for this analysis. All findings are derived from codebase inspection. The patterns observed (state machine with missing terminal processor, event envelope wrapping defeating trigger matching, fire-and-forget state updates) are well-known categories of distributed-system bugs documented in distributed systems literature.

---

## Recommended Approach

### Priority 1: Fix the DONE Chain (Gaps #1–#3, #6, #7)

**Step 1a.** Change `DeployProcessor.process()` to return `{ nextState: 'DONE', shouldContinue: false }` instead of `{ nextState: null }` in `lead-engineer-deploy-processor.ts:77` [2][11].

**Step 1b.** Register a lightweight `DoneProcessor` in `FeatureStateMachine` that emits `feature:completed` and returns `{ nextState: null, shouldContinue: false }` [14]. Alternatively, handle `'DONE'` as a recognized terminal state in the loop without requiring a processor.

**Step 1c.** Fix `ReviewProcessor` "already done" fast-path to return `nextState: 'DONE'` [7]. Fix external-merge fast-path to return `nextState: 'DEPLOY'` (or `'DONE'` if deploy is intentionally skipped) [6][17].

**Step 1d.** Remove `'DEPLOY'` from checkpoint cleanup terminal states once `DONE` works [18].

### Priority 2: Fix Ceremony Lifecycle (Gaps #11–#15)

**Step 2a.** Include `remainingMilestones` in all `ceremony:fired` emissions in `ceremony-service.ts` [19]. Compute from milestone plan data.

**Step 2b.** Add `'project:completed'` transition rule to `ceremony-state-machine.ts` [22]. Have `LeadEngineerCeremonies` emit `'project:completed'` in addition to `'lead-engineer:project-completed'` [28].

**Step 2c.** Include `retroData` in `ceremony:fired` payloads so `CeremonyActionExecutor.handleRetroCompleted` can execute [23][24].

**Step 2d.** Add `gate-tuning` branch to the action-execution loop [25].

**Step 2e.** Update `lastStandup`/`lastRetro` after ceremony execution [26][27]. Await the state write rather than fire-and-forget [29].

### Priority 3: Fix Event Bus Rules (Gaps #8–#10)

**Step 3a.** Either change `autoModeHealth` triggers to `['auto-mode:event']` and inspect `payload.type`, or change `TypedEventBus` to emit raw event types alongside the envelope [41][52].

**Step 3b.** Either implement and emit `'feature:health-degraded'`/`'health:signal'` events, or remove `rollbackTriggered` as dead code [42].

**Step 3c.** In `MergeProcessor`, emit `feature:pr-merged` **before** setting `status: 'done'`, so `mergedNotDone` rule can fire [33][34].

### Priority 4: Fix Merge Pipeline (Gaps #16–#18)

**Step 4a.** Replace hardcoded `--squash` in `MergeProcessor` with a call to `GitHubMergeService.mergePR()` that respects `prMergeStrategy` [30][31].

**Step 4b.** Rename `rebaseWorktreeOnMain` to `mergeWorktreeOnTarget` or implement actual rebase logic [36].

**Step 4c.** Reconcile base branch defaults — either change `prBaseBranch` default to `'main'` or make `rebaseWorktreeOnMain` read from `GitWorkflowSettings` [38].

**Step 4d.** Wire `MergeEligibilityService` into the pipeline or document it as opt-in [37].

### Priority 5: Cleanup

**Step 5a.** Remove `VERIFY` from legacy `FeatureState` enum or add it to active type and implement processor [4][15].

**Step 5b.** Add `retryTarget: 'INTAKE'` to `execute-entry` gate [10].

**Step 5c.** Add `description` field to `execute-entry` gate definition [10].

---

## Open Questions & Risks

1. **Should `VERIFY` be restored?** The legacy enum and JSDoc document a `VERIFY` state between `DEPLOY` and `DONE` [4][15]. Was it intentionally removed or accidentally omitted? If verification is needed, a `VerifyProcessor` must be created and the type updated.

2. **External-merge: skip DEPLOY or not?** The current fast-path [6] skips `DEPLOY` entirely for externally-merged PRs. Is post-merge deployment verification intentionally skipped for these, or should they still go through `DEPLOY`?

3. **Gate enforcement timeline.** The no-op gates [5][32] may be intentional placeholders for future enforcement. Implementing real validation in `review-exit` and `merge-exit` could break existing flows if processors don't supply the expected context fields.

4. **`auto-mode:event` envelope change impact.** Changing `TypedEventBus` to emit raw event types [52] could have unintended downstream effects if other subscribers expect the envelope format. The safer approach is to update rule triggers.

5. **Race condition in ceremony state writes.** Switching from fire-and-forget to awaited writes [29] could impact standup flow latency. Need to verify whether the ceremony state persistence path has acceptable latency.

6. **`mergedNotDone` reordering risk.** Emitting `feature:pr-merged` before setting `status: 'done'` [33] means the rule fires with stale status. If the rule's action (`move_feature` to `'done'`) races with the processor's own status update, a double-write could occur.

7. **CI retry string matching.** The fragile `errMsg.includes('check')` pattern [35] needs a more robust replacement, but the exact error formats from `gh pr merge` need to be cataloged first.

8. **Test coverage.** No test files were found for `ceremony-action-executor.ts`, `ceremony-state-machine.ts`, or `merge-eligibility-service.ts`. The fixes above should be accompanied by unit tests, particularly for the state machine terminal transitions and ceremony lifecycle progression.

---

## Citations

| #    | Source                                                                      | Description                                                                       |
| ---- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [1]  | `apps/server/src/services/lead-engineer-types.ts:97-105`                    | `FeatureProcessingState` union type includes `'DONE'` but no processor registered |
| [2]  | `apps/server/src/services/lead-engineer-deploy-processor.ts:77-81`          | `DeployProcessor.process()` returns `nextState: null`                             |
| [3]  | `apps/server/src/services/lead-engineer-service.ts:522-527`                 | Outcome gate marks all deployed features as `'blocked'`                           |
| [4]  | `libs/types/src/lead-engineer.ts:297-322`                                   | Legacy `FeatureState` enum with orphaned `VERIFY`                                 |
| [5]  | `apps/server/src/services/lead-engineer-state-machine.ts:62-81`             | No-op `review-exit` and `merge-exit` gates                                        |
| [6]  | `apps/server/src/services/lead-engineer-review-merge-processors.ts:91-108`  | External-merge fast-path bypasses `DEPLOY`                                        |
| [7]  | `apps/server/src/services/lead-engineer-review-merge-processors.ts:81-85`   | ReviewProcessor "already done" returns `null`                                     |
| [8]  | `apps/server/src/services/lead-engineer-state-machine.ts:352-361`           | Checkpoint cleanup includes `DEPLOY` as terminal                                  |
| [9]  | `apps/server/src/services/lead-engineer-state-machine.ts:151-156, 324-349`  | Loop overflow detection (correct)                                                 |
| [10] | `apps/server/src/services/lead-engineer-state-machine.ts:33-46`             | `execute-entry` gate missing `retryTarget`                                        |
| [11] | `apps/server/src/services/lead-engineer-deploy-processor.ts:77-81`          | Code excerpt: `nextState: null` return                                            |
| [12] | `apps/server/src/services/lead-engineer-service.ts:522-527`                 | Code excerpt: three-way outcome gate                                              |
| [13] | `apps/server/src/services/lead-engineer-types.ts:97-105`                    | Code excerpt: `FeatureProcessingState` type                                       |
| [14] | `apps/server/src/services/lead-engineer-state-machine.ts:112-118`           | Code excerpt: processor registration (no `DONE`)                                  |
| [15] | `libs/types/src/lead-engineer.ts:297-322`                                   | Code excerpt: JSDoc flow and `FeatureState` enum                                  |
| [16] | `apps/server/src/services/lead-engineer-state-machine.ts:62-81`             | Code excerpt: no-op gates                                                         |
| [17] | `apps/server/src/services/lead-engineer-review-merge-processors.ts:92-108`  | Code excerpt: external merge log vs return mismatch                               |
| [18] | `apps/server/src/services/lead-engineer-state-machine.ts:352-361`           | Code excerpt: checkpoint cleanup terminals                                        |
| [19] | `apps/server/src/services/ceremony-service.ts:750`                          | `ceremony:fired` omits `remainingMilestones`                                      |
| [20] | `apps/server/src/services/ceremony-state-machine.ts:27`                     | State machine defaults `remaining` to `1`                                         |
| [21] | `apps/server/src/services/ceremony-service.ts:884`                          | `applyTransition` called with `'project:completed'`                               |
| [22] | `apps/server/src/services/ceremony-state-machine.ts:19`                     | No rule for `'project:completed'`                                                 |
| [23] | `apps/server/src/services/ceremony-action-executor.ts:264`                  | `handleRetroCompleted` exits when no `retroData`                                  |
| [24] | `apps/server/src/services/ceremony-service.ts:991`                          | `project_retro` emission omits `retroData`                                        |
| [25] | `apps/server/src/services/ceremony-action-executor.ts:291`                  | Action loop missing `gate-tuning` branch                                          |
| [26] | `apps/server/src/services/ceremony-service.ts:373`                          | `lastStandup`/`lastRetro` initialized empty, never updated                        |
| [27] | `apps/server/src/services/ceremony-service.ts:582`                          | No `lastStandup` write after standup flow                                         |
| [28] | `apps/server/src/services/lead-engineer-ceremonies.ts:37`                   | Emits `'lead-engineer:project-completed'` not `'project:completed'`               |
| [29] | `apps/server/src/services/ceremony-service.ts:538`                          | Fire-and-forget state update race                                                 |
| [30] | `apps/server/src/services/lead-engineer-review-merge-processors.ts:452`     | Hardcoded `--squash` in `MergeProcessor`                                          |
| [31] | `apps/server/src/services/github-merge-service.ts:148-186`                  | `GitHubMergeService` strategy routing (bypassed)                                  |
| [32] | `apps/server/src/services/lead-engineer-state-machine.ts:71-81`             | `merge-exit` gate with dead `retryTarget`                                         |
| [33] | `apps/server/src/services/lead-engineer-review-merge-processors.ts:481-493` | Status set to `'done'` before event emission                                      |
| [34] | `apps/server/src/services/lead-engineer-rules.ts:40-52`                     | `mergedNotDone` rule checks `status === 'review'`                                 |
| [35] | `apps/server/src/services/lead-engineer-review-merge-processors.ts:505-517` | CI gate retry fragile string matching                                             |
| [36] | `libs/git-utils/src/rebase.ts:53-82`                                        | `rebaseWorktreeOnMain` uses `git merge`                                           |
| [37] | `apps/server/src/services/merge-eligibility-service.ts`                     | `MergeEligibilityService` unused by pipeline                                      |
| [38] | `libs/types/src/git-settings.ts:57-67`                                      | `prBaseBranch` defaults to `'dev'`                                                |
| [39] | `apps/server/src/lib/events.ts:42`                                          | Event bus architecture                                                            |
| [40] | `apps/server/src/services/auto-mode/typed-event-bus.ts:60`                  | `emitAutoModeEvent` envelope wrapping                                             |
| [41] | `apps/server/src/services/lead-engineer-rules.ts:162`                       | `autoModeHealth` rule with unreachable triggers                                   |
| [42] | `apps/server/src/services/lead-engineer-rules.ts:546`                       | `rollbackTriggered` rule with non-existent events                                 |
| [43] | `apps/server/src/services/event-hook-service.ts:49`                         | `GENERIC_EVENT_TYPE_TO_TRIGGER` mapping                                           |
| [44] | `apps/server/src/services/lead-engineer-service.ts:252`                     | Recursion prevention exclusion filter                                             |
| [45] | `apps/server/src/services/lead-engineer-rules.ts:340`                       | `pr:merge-blocked-critical-threads` unverified                                    |
| [46] | `apps/server/src/services/lead-engineer-rules.ts:604`                       | `pr:missing-ci-checks` unverified                                                 |
| [47] | `apps/server/src/lib/events.ts:92`                                          | `broadcast()` dual dispatch                                                       |
| [48] | `apps/server/src/services/lead-engineer-rules.ts:781`                       | `evaluateRules()` strict string-match                                             |
| [49] | `apps/server/src/services/event-hook-service.ts:49`                         | Event hook service excludes lead-engineer events                                  |
| [50] | `apps/server/src/lib/events.ts:54`                                          | `emit()` dual-mode dispatch implementation                                        |
| [51] | `apps/server/src/lib/events.ts:92`                                          | `broadcast()` local + remote implementation                                       |
| [52] | `apps/server/src/services/auto-mode/typed-event-bus.ts:59`                  | Envelope wrapping code excerpt                                                    |
| [53] | `apps/server/src/services/lead-engineer-rules.ts:162`                       | `autoModeHealth` rule code excerpt                                                |
| [54] | `apps/server/src/services/lead-engineer-rules.ts:546`                       | `rollbackTriggered` rule code excerpt                                             |
| [55] | `apps/server/src/services/lead-engineer-service.ts:252`                     | Exclusion filter code excerpt                                                     |
| [56] | `apps/server/src/services/lead-engineer-rules.ts:781`                       | `evaluateRules()` code excerpt                                                    |
