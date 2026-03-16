# GSD Pattern Adoption

Adopt 5 high-value patterns from the GSD framework into the Lead Engineer pipeline: structured plan format, goal-backward verification (pre and post execution), context awareness, and deviation rules. Reduce wasted compute from context-rotted agents, catch semantic bugs before production, and give agents explicit deviation policies.

**Status:** active
**Created:** 2026-03-14T16:28:04.299Z
**Updated:** 2026-03-16T18:46:44.179Z

## PRD

### Situation

protoLabs Studio's Lead Engineer pipeline runs AI agents through a 7-state machine (INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DEPLOY → DONE). The PLAN phase generates freeform text plans validated only by length and an optional antagonistic review. The EXECUTE phase gives agents full context with no usage tracking — agents run blind until timeout or turn limits. The DEPLOY phase verifies code compiles (typecheck, build:packages) but not goal achievement. Agents have no explicit deviation policies — they either complete everything or escalate everything. The recent pipeline audit (C1-C3) revealed that all three critical bugs were 'code exists but isn't wired' class errors that passed compilation checks.

Key integration points already exist: StreamObserverService (loop/stall detection), AntagonisticReviewService (plan review gate), PlanProcessor (plan generation), ExecuteProcessor (agent monitoring), DeployProcessor (post-merge verification), ContextFidelityService (retry context shaping), and FactStoreService (execution retrospective extraction).

### Problem

Five gaps in the current pipeline cause preventable waste and escaped bugs:

1. **Context rot** — Agents degrade as context fills past ~70% capacity. No tracking, no warnings, no mitigation. Agents produce increasingly poor output until they hit timeout, wasting API budget on degraded completions.

2. **Semantic verification gap** — Post-merge verification catches syntax errors (typecheck) but not semantic bugs. The C1-C3 critical findings from the pipeline audit were all 'exists but not wired' — code that compiled fine but was functionally disconnected.

3. **Unstructured plans** — Plans are freeform text that can't be machine-validated against goals. ExecuteProcessor loads plan text but has no structured way to evaluate whether the agent's work matched the plan.

4. **No deviation policies** — Agents have binary tool access (allowed or denied) but no per-feature constraints. No policy defines what agents can auto-fix vs. what requires escalation.

5. **Incomplete plan validation** — AntagonisticReviewService reviews the plan document for quality but doesn't verify coverage of acceptance criteria.

### Approach

Adopt 5 patterns from the GSD (get-shit-done) framework, adapted to our existing architecture:

**1. Structured Plan Format** — Replace freeform text plans with structured JSON containing: goal statement, acceptance criteria array, task breakdown (each with file targets and verification commands), and deviation rules. PlanProcessor generates structured JSON via an engineered prompt. ExecuteProcessor parses and injects structured context.

**2. Goal-Backward Pre-Execution Validation** — Enhance AntagonisticReviewService.verifyPlan() with 3-level methodology: What must be TRUE? What must EXIST? What must be WIRED? Validates structured plan coverage of all acceptance criteria before execution.

**3. Goal-Backward Post-Execution Verification** — Add semantic verification to DeployProcessor. Lightweight haiku LLM call evaluates whether acceptance criteria were satisfied by actual code changes. Fire-and-forget, advisory only.

**4. Context Awareness** — Extend StreamObserverService with token/cost tracking. Inject warnings when context exceeds configurable threshold (default 70%).

**5. Deviation Rule Engine** — Per-feature constraints defining auto-fix scope vs. escalation triggers. Advisory in v1 (prompt instructions, not programmatic guards).

### Results

Reduce wasted compute from context-rotted agents by detecting degradation at 70% context usage instead of at timeout. Catch 'exists but not wired' semantic bugs in DEPLOY before production. Enable automated plan progress tracking via structured task format. Reduce unnecessary escalations by 30-50% via explicit auto-fix deviation rules. Prevent execution of plans with incomplete acceptance criteria coverage.

### Constraints

Must be backward-compatible with existing features — structured plan fields are additive, freeform fallback preserved. LLM verification calls use haiku model, fire-and-forget pattern, ~$0.001 per call. No new external dependencies. Must not increase PLAN phase latency by more than 30 seconds. Context awareness must work within Claude Agent SDK's existing event model. Deviation rules are advisory in v1 — prompt instructions, not programmatic enforcement. All new types in libs/types/src/lead-engineer.ts.

## Milestones

### 1. Structured Plan Format

Replace freeform text plans with a structured format that enables machine validation, progress tracking, and downstream consumption by verification and deviation rule systems. This is the foundation that all other milestones build on.

**Status:** completed

#### Phases

1. **Types + Structured Plan Generator** (medium)
2. **Plan Consumer in ExecuteProcessor** (medium)

### 2. Goal-Backward Verification

Add goal-backward verification at two pipeline stages: pre-execution (validate plan covers acceptance criteria before burning agent budget) and post-execution (verify acceptance criteria are satisfied by actual code changes before marking done).

**Status:** pending

#### Phases

1. **Pre-Execution Plan Validation** (medium)
2. **Post-Execution Goal Verification** (medium)

### 3. Context Awareness and Deviation Rules

Add context usage tracking to agent execution monitoring and implement a deviation rule system that gives agents explicit policies for what they can auto-fix vs. what requires escalation.

**Status:** pending

#### Phases

1. **Context Metrics and Warning System** (medium)
2. **Deviation Rule Engine** (medium)
