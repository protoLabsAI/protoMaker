# Research Report: Lossless Context Management & Agent Resilience

Generated: 2026-03-16T19:46:22.102Z
Sub-topics investigated: 5
Total citations: 57
Models used: Haiku (compression), Sonnet (research), Opus (synthesis)

# Lossless Context Management & Agent Resilience

## Summary

This report synthesizes research across five parallel investigations into integrating DAG-based context compression and workflow suspend/resume into the protoLabs agent pipeline. The project addresses two critical pain points: **agents losing context on long sessions** (current compaction discards information destructively at 100K tokens [3]) and **server crashes losing in-flight feature state** (P1 known issue, partially mitigated by file-based recovery [14][15]).

The core finding is that the existing architecture—file-based persistence, session-keyed execution, heuristic compaction, and crash-recovery via `pendingTools` injection—provides solid scaffolding for both capabilities. **lossless-claw** [45] offers a production-grade DAG summarization engine with SQLite-backed storage, depth-keyed compression prompts, and an expansion system that can replace the current lossy `message-compaction.ts`. **VoltAgent** [48] provides a suspend controller pattern, checkpoint-per-step persistence, and a `shutdown()` orchestration sequence that maps cleanly onto the existing `shutdown.ts` + `resumeInterruptedFeatures()` flow.

Key integration risk: the codebase uses no external database [23]—all state is JSON/markdown in `.automaker/`. Introducing SQLite for the summary DAG requires careful consideration of worktree isolation, atomic writes, and the existing backup-recovery pattern [18].

---

## Codebase Findings

### Session & Execution Model

**AgentService** manages sessions keyed by ID, persisted as JSON files. On every turn, the full conversation history is mapped and passed to the Claude SDK without any service-layer truncation [1][2]:

```typescript
// apps/server/src/services/agent-service.ts:348
const conversationHistory = session.messages.map((msg) => ({
  role: msg.role,
  content: msg.content,
}));
```

The `ExecuteOptions` envelope carries: prompt, model, cwd, systemPrompt, maxTurns, conversationHistory, `sdkSessionId` (resumption key), allowedTools, mcpServers, abortController, thinkingLevel, agents, hooks [1].

**SDK session resumption** via `sdkSessionId` delegates checkpoint continuity to the Anthropic SDK. When both history and a session ID are present, `ClaudeProvider` passes `{ resume: sdkSessionId }` [6]:

```typescript
// apps/server/src/providers/claude-provider.ts:264
...(sdkSessionId && conversationHistory && conversationHistory.length > 0
  ? { resume: sdkSessionId }
  : {})
```

**File checkpointing** (`enableFileCheckpointing: true`) is enabled only in auto-mode, not standard chat [7]. **Max turns** are hard ceilings: quick=50, standard=100, extended=250, maximum=1000 [8].

### Current Compaction (Lossy)

The existing compaction system operates at the route level, not within AgentService itself [3][4][5]:

- **Trigger**: 100K tokens (~400K characters) [3]
- **Strategy**: Preserves last 10 messages verbatim; summarizes older tool results to 200 chars and assistant text to 500 chars [4]
- **Token counting**: Heuristic at 4 chars ≈ 1 token—no real tokenizer [5]

This is purely destructive: once compacted, original content is unrecoverable. There is no DAG, no expansion capability, and no depth-aware summarization.

### Context & Memory Construction

**System prompt** is layered: base prompt → context files (`.automaker/context/`) → scored memory files → role-based domain filtering [13].

**Memory loading** scores files from `.automaker/memory/`, selects ≤5 highest-scoring, always includes `gotchas.md` and files with `importance >= 0.9` [9]:

```typescript
// libs/utils/src/context-loader.ts:462
const score = (tagScore + relevantToScore + summaryScore + categoryScore) * importance;
```

**MessageQueueMiddleware** injects context between turns, prepending queued prompts before the model call without blocking [10].

### Crash Recovery & Resume

**Graceful shutdown** writes a `.clean-shutdown` marker file [14]:

```typescript
// apps/server/src/server/shutdown.ts:54
fs.writeFileSync(path.join(dataDir, '.clean-shutdown'), JSON.stringify({ timestamp: new Date().toISOString() }));
```

**Fatal crashes** handled via `uncaughtException`/`unhandledRejection` handlers. Non-fatal codes (`ECONNRESET`, `EPIPE`, `ERR_STREAM_DESTROYED`, `ERR_STREAM_WRITE_AFTER_END`) are filtered; fatal exceptions trigger graceful shutdown with a 10-second timeout + force exit, notifying `ReactiveSpawnerService` [15].

**Feature resume** on startup: `autoModeService.resumeInterruptedFeatures()` scans `.automaker/features/` for `in_progress`/`interrupted` status, guarded by a `resumeCheckedProjects` set (once per server lifecycle) [16]:

```typescript
// apps/server/src/services/auto-mode-service.ts:3343-3433
async resumeInterruptedFeatures(projectPath: string) {
  if (this.resumeCheckedProjects.has(projectPath)) return;
  this.resumeCheckedProjects.add(projectPath);
  // Scans for status in ['in_progress', 'interrupted']; verifies agent-output.md
  // Calls resumeFeature(projectPath, featureId, true)
}
```

**Interrupted tool recovery** persists `pendingTools` state, patches synthetic `[Interrupted]` error messages into conversation history on session restart [11][25]:

```typescript
// apps/server/tests/unit/services/agent-service.test.ts:166
const pendingTools = [
  { name: 'Bash', startTime: 1700000000000 },
  { name: 'Read', startTime: 1700000001000 },
];
// On resume: injects synthetic error messages, clears pending file
expect(errorMessages[0].content).toContain('[Interrupted]');
```

### Feature State Model

The `Feature` type carries rich execution metadata [17]:

```typescript
// libs/types/src/feature.ts:72-97
executionHistory?: ExecutionRecord[];
lastSessionId?: string;                 // SDK session ID for resume
traceIds?: string[];                    // Langfuse trace IDs
statusHistory?: StatusTransition[];
failureClassification?: { category, confidence, recovery_strategy };
retryCount?: number;
remediationHistory?: RemediationHistoryEntry[];
```

Persistence uses `atomicWriteJson()` with `readJsonWithRecovery()` for backup restoration [18].

### Worktree Infrastructure

**Worktree metadata** at `.automaker/worktrees/{sanitizedBranch}/worktree.json` tracks branch, creation time, PR state, init script status [19].

**Worktree recovery** detects uncommitted work post-crash: `git status` → format → `git commit --no-verify` → push → create PR [20].

**Worktree lifecycle** runs 6-hour drift detection, distinguishing phantom (registered, missing on disk) vs. orphan worktrees. Cleanup guarded by `isWorktreeLocked()` [21][22]:

```typescript
// apps/server/src/services/worktree-lifecycle-service.ts:31
const DRIFT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
```

**Memory drift** (known recurring issue): agents write `.automaker/memory/` in worktrees; git staging explicitly includes `memory/` files, blocking pre-flight merges when unstaged [12].

### Resource Pressure Guards

Heap checks before agent spawn: 80% threshold stops new agents, 90% aborts running agents [23]. Primary context checkpoint: `.automaker/features/{featureId}/agent-output.md`; presence indicates a mid-run crash, absence means never started [24].

---

## Relevant Patterns & Integration Points

### Six Injection Points for DAG Compression

Based on the architecture analysis, six integration points have been identified:

| Point | Location | Purpose |
|-------|----------|---------|
| **A. Pre-spawn** | `auto-mode-service.ts` → `ExecutionService.runFeature()` | Assemble DAG context before SDK call |
| **B. Output sink** | `agent-output.md` write | Persist raw messages for DAG leaf creation |
| **C. Post-crash** | `shutdown.ts` uncaughtException handler | Flush in-flight DAG state before exit |
| **D. Resume** | `resumeInterruptedFeatures()` → `feature.lastSessionId` | Rebuild context from DAG on restart |
| **E. Pre-flight** | `worktree-guard.ts` → `ensureCleanWorktree()` | Exclude DAG SQLite from git staging |
| **F. Storage** | `.automaker/features/{id}/` | Colocate DAG database with feature state |

### Mapping VoltAgent Patterns to Existing Infrastructure

| VoltAgent Pattern | Automaker Equivalent | Gap |
|-------------------|---------------------|-----|
| `createSuspendController()` [48] | `abortController` in ExecuteOptions [1] | No suspend-specific abort reason payload |
| `WorkflowSuspensionMetadata` [53] | `Feature.executionHistory` + `pendingTools` [17][11] | No per-step checkpoint granularity |
| `shutdown()` orchestration [55] | `shutdown.ts` graceful + ReactiveSpawner [14][15] | No `suspendAllActiveWorkflows()` equivalent |
| `SIGTERM`/`SIGINT` handlers [57] | `process.on('uncaughtException')` [15] | Only handles exceptions, not signals |
| Step-level `suspend(reason)` [50] | N/A | No mid-execution suspend capability |
| `execution.resume(resumeData)` [50] | `resumeInterruptedFeatures()` [16] | Coarser: resumes entire feature, not specific step |

---

## External Research

### lossless-claw: DAG-Based Context Compression

**lossless-claw** (2,230 stars, MIT, 2026-02-18) [45] is a TypeScript plugin for OpenClaw that replaces sliding-window truncation with hierarchical DAG summarization.

**Summary DAG Structure**: Leaf nodes (depth 0) created from raw message chunks; condensed nodes (depth 1+) created from same-depth parent summaries. Each node carries a SHA-256 `summaryId`, time range, `descendantCount`, and `tokenCount` [46]:

```typescript
// src/compaction.ts
function generateSummaryId(content: string): string {
  return "sum_" + createHash("sha256").update(content + Date.now().toString()).digest("hex").slice(0, 16);
}
```

**CompactionEngine** operates in three modes [36]:
1. **Incremental**: leaf pass + optional condensation
2. **Full sweep**: complete recompaction
3. **Budget-targeted**: iterates ≤10 rounds to fit within token budget

Escalation progression: normal (temperature 0.2) → aggressive (temperature 0.1) → deterministic truncation [36].

**CompactionConfig** [44]:

```typescript
export interface CompactionConfig {
  contextThreshold: number;      // fraction of budget (default 0.75)
  freshTailCount: number;        // protected recent turns (default 8)
  leafChunkTokens?: number;      // max source tokens per chunk (default 20k)
  leafTargetTokens: number;      // target summary size (default 600)
  condensedTargetTokens: number; // target summary size (default 900)
  maxRounds: number;             // max compaction rounds (default 10)
}
```

**Fresh Tail Protection**: Last N items (default 32, configurable via `LCM_FRESH_TAIL_COUNT`) excluded from compaction but always included in context assembly even when over budget [37].

**Depth-keyed prompts** encode semantic compression priorities [38]:

| Depth | Focus | Target |
|-------|-------|--------|
| d0 (leaf) | Preserve decisions, rationale, constraints, tasks, file ops | 35% reduction |
| d1 (condensed) | Condense leaves + timeline; preserve decisions + blockers | — |
| d2 | Multi-session trajectory; drop session-local detail | — |
| d3+ | Durable memory: decisions, work, constraints, lessons | — |
| Fallback | Deterministic truncation (~512 tokens, marked `[Truncated]`) | — |

**Context assembly**: Fetches context items → resolves to `AgentMessage` → splits into evictable prefix + protected tail → fills budget oldest-first → sanitizes orphaned tool pairs. Summaries become XML-wrapped user messages [47]:

```xml
<summary id="sum_abc123" kind="leaf" depth="0" descendant_count="0"
         earliest_at="2026-02-17T07:37:00" latest_at="2026-02-17T08:23:00">
  <content>...Expand for details about: exact error, config diff, debug steps</content>
</summary>
```

**SQLite schema** [39]: Tables `summaries`, `summary_messages` (leaf→message), `summary_parents` (condensed→parent), `context_items` (ordinal-sequenced), `large_files`, `summaries_fts` (FTS5). `replaceContextRangeWithSummary` atomically deletes a range, inserts the summary, and resequences ordinals.

**Expansion system** [40]: `lcm_expand_query` delegates to a sub-agent (120s timeout); DAG walk via `lcm_expand` returns `{ answer, citedIds, expandedSummaryCount, totalSourceTokens, truncated }`. Grants are scoped by `conversationId` with TTL.

**Large file handling** [41]: Files >25K tokens intercepted, stored to `~/.openclaw/lcm-files/<conv>/<id>.<ext>`, replaced with ~200-token stub. Retrieved via `lcm_describe(id)`.

**Crash recovery** [42]: Handles messages written to JSONL before LCM could persist them—replay on restart.

**Dependency injection** [43]: All core capabilities injected via constructor; no direct imports of infrastructure.

### VoltAgent: Workflow Suspend/Resume & Graceful Shutdown

**Suspend controller factory** [48][49]: `createSuspendController()` wraps `AbortController` with typed `{ type: "suspended", reason }` payload. Supports graceful (waits for step completion) and immediate (aborts mid-step) modes:

```typescript
// packages/core/src/workflow/suspend-controller.ts
export function createSuspendController(): WorkflowSuspendController {
  const abortController = new AbortController();
  let suspensionReason: string | undefined;
  let suspended = false;
  return {
    signal: abortController.signal,
    suspend: (reason?: string) => {
      if (!suspended && !cancelled) {
        suspensionReason = reason;
        suspended = true;
        abortController.abort({ type: "suspended", reason: suspensionReason });
      }
    },
    isSuspended: () => suspended,
    getReason: () => suspensionReason,
  };
}
```

**Step-level suspend/resume** [50]: Steps receive an injected `suspend(reason?)` function. Resume via `execution.resume(resumeData, { stepId? })`:

```typescript
execute: async ({ data, suspend, resumeData }) => {
  if (resumeData) return { approved: resumeData.approved };
  await suspend("Waiting for approval");
}
```

**Checkpoint persistence** [53][54]: `WorkflowSuspensionMetadata` captures `suspendedStepIndex`, `completedStepsData[]`, `workflowState`, per-step `stepData` snapshots, and `usage`. Written to memory adapter under `"__voltagent_restart_checkpoint"` key on each step completion (configurable `checkpointInterval`):

```typescript
// packages/core/src/workflow/types.ts
export interface WorkflowSuspensionMetadata<SUSPEND_DATA = any> {
  suspendedAt: Date;
  reason?: string;
  suspendedStepIndex: number;
  lastEventSequence?: number;
  suspendData?: SUSPEND_DATA;
  checkpoint?: {
    stepExecutionState?: any;
    completedStepsData?: any[];
    workflowState?: WorkflowStateStore;
    stepData?: Record<string, WorkflowCheckpointStepData>;
    usage?: UsageInfo;
  };
}
```

**Shutdown orchestration** [55][57]: `VoltAgent.shutdown()` sequentially stops HTTP server → suspends all active workflows → destroys workspace → flushes telemetry → closes A2A/MCP. Signal handlers use `process.once()` to prevent duplicate fires:

```typescript
// packages/core/src/voltagent.ts
public async shutdown(): Promise<void> {
  if (this.serverInstance?.isRunning()) await this.stopServer();
  await this.workflowRegistry.suspendAllActiveWorkflows();
  // ...cleanup...
}
```

**Suspend-all pattern** [56]: Registry iterates active execution controllers, calls `suspend()` on each, waits 1 second for in-flight steps to complete.

**REST API** [52]: `POST /workflows/:id/executions/:executionId/suspend`, `POST .../resume` (body: `{ resumeData, stepId? }`), `GET .../state`. Not in default protected routes—must be explicitly secured.

### Testing & Validation Research

**CCF (Context Compression Framework)** [31] achieves ROUGE-L 0.97–1.00 at 8× compression with perfect NIAH (Needle-In-A-Haystack) retrieval—the benchmark for compression quality validation.

**ReliabilityBench** (Jan 2026) [34] categorizes faults into: network/API, resource constraints, data inconsistencies, latency. Metrics: success rate under faults, graceful-degradation curves, self-recovery rate.

**Replay testing** [32] (Temporal/LangGraph/DBOS pattern): capture history → kill process → replay → assert zero non-determinism. New process rehydration surfaces serialization gaps.

**agent-chaos** [33]: Python library providing `llm_rate_limit()`, `llm_timeout()`, `llm_stream_interrupted()`, `tool_error()`, `tool_mutate()`. No TypeScript equivalent exists.

---

## Recommended Approach

### Phase 1: DAG Context Compression (replaces `message-compaction.ts`)

1. **Extract lossless-claw's `CompactionEngine`** as a vendored dependency or fork. The DI pattern [43] makes it adapter-friendly—inject Automaker's token counting and LLM provider where lossless-claw expects OpenClaw's.

2. **Add SQLite per feature session** at `.automaker/features/{featureId}/context.sqlite`. This colocates with existing atomic JSON persistence [18] and avoids cross-feature contention. Add `context.sqlite*` to `.gitignore` and the git-staging exclusion list in `git-staging-utils.ts` [12].

3. **Replace `message-compaction.ts`** with a `ContextCompressionService` that:
   - Ingests raw messages as DAG leaf nodes after each turn (integration point B)
   - Runs incremental compaction when context exceeds `contextThreshold × budget` [44]
   - Assembles context via the protected-tail + oldest-first fill algorithm [37][46]
   - Emits XML-wrapped summaries compatible with the existing system prompt layering [13]

4. **Wire fresh tail protection** with `LCM_FRESH_TAIL_COUNT=32` [37] to replace the current "last 10 messages verbatim" strategy [4], providing 3× more protected recent context.

5. **Expose expansion** as an MCP tool (`lcm_expand`) so agents can drill into compressed summaries on demand [40]. This preserves losslessness—compressed content remains retrievable.

6. **Replace heuristic token counting** (4 chars ≈ 1 token [5]) with `tiktoken` or the Claude tokenizer for accurate budget management.

### Phase 2: Workflow Suspend/Resume (adapts VoltAgent patterns)

1. **Create `SuspendController`** adapting VoltAgent's factory [48]. Extend the existing `abortController` in `ExecuteOptions` [1] to carry typed suspension payloads:

   ```typescript
   interface SuspensionPayload {
     type: 'suspended';
     reason: string;
     checkpoint: FeatureCheckpoint;
   }
   ```

2. **Enrich `Feature` type** [17] with `WorkflowSuspensionMetadata`-style checkpoint data [53]: `suspendedAt`, `lastCompletedStep`, `completedStepsData`, `dagContextState` (reference to SQLite snapshot). This extends the existing `executionHistory` and `lastSessionId` fields.

3. **Add `suspendAllActiveFeatures()`** to `auto-mode-service.ts`, modeled on VoltAgent's registry pattern [56]. Iterate active feature executions, call `suspend()` on each controller, wait up to 5 seconds (vs. VoltAgent's 1 second) given heavier I/O.

4. **Wire into `shutdown.ts`** [14][15]: Before writing `.clean-shutdown`, call `suspendAllActiveFeatures()`. On `uncaughtException`, attempt suspension before the 10-second force-exit timeout. This replaces the current pattern where ReactiveSpawnerService only fires on fatal crashes.

5. **Enhance `resumeInterruptedFeatures()`** [16] to read checkpoint data and reconstruct DAG context from SQLite, passing `sdkSessionId` for SDK-level resume [6] alongside the reconstructed conversation history.

6. **Add `SIGTERM`/`SIGINT` handlers** using `process.once()` [57] alongside the existing `uncaughtException` handler [15]. This catches container stops, deploy rotations, and manual kills—currently unhandled.

### Phase 3: Testing & Validation

1. **NIAH retrieval tests**: Inject known "needle" facts at various conversation depths, compress via DAG, verify agent retrieval accuracy. Target: ≥0.97 ROUGE-L at 8× compression [31].

2. **Kill-and-rehydrate integration tests**: Start a feature execution → kill the process → restart → assert feature resumes from checkpoint with zero lost steps. Follows the Temporal replay-testing pattern [32].

3. **TypeScript chaos framework**: Build a minimal `agent-chaos-ts` providing `llmRateLimit()`, `llmTimeout()`, `llmStreamInterrupted()`, `toolError()` as composable test decorators [33]. Replace the current ad-hoc `mockRejectedValueOnce()` patterns [29].

4. **Graceful-degradation curves** per ReliabilityBench [34]: Measure success rate across increasing fault intensity (1%, 5%, 10%, 25% fault injection rate).

5. **Raise CI thresholds**: Current 55% branch coverage [30] is insufficient for safety-critical resume/compression code. Target 80% for new modules.

---

## Open Questions & Risks

| # | Question / Risk | Impact | Mitigation |
|---|----------------|--------|------------|
| 1 | **SQLite in worktrees**: If DAG databases live in `.automaker/features/`, worktree copies may conflict with main repo. | Data corruption, merge conflicts | Exclude `context.sqlite*` from git staging [12]; use WAL mode for concurrent reads |
| 2 | **Compaction latency**: DAG summarization requires LLM calls. At depth 0 with 20K-token chunks [44], each compaction round adds ~5-10s. | Agent response lag | Run compaction asynchronously between turns; use incremental mode [36] |
| 3 | **Memory drift amplified**: SQLite files in worktrees add to the existing memory drift problem [12]. | Pre-flight merge failures | Fix git-staging-utils to exclude `*.sqlite*` globally; prioritize the memory drift fix |
| 4 | **No signal handlers**: Current shutdown only handles `uncaughtException` [15], not `SIGTERM`/`SIGINT`. Deploy rotations kill agents without suspension. | Lost in-flight work | Add `process.once('SIGTERM')` and `process.once('SIGINT')` [57] in Phase 2 |
| 5 | **Expansion sub-agent cost**: `lcm_expand` spawns a sub-agent with 120s timeout [40]. Frequent expansions multiply API costs. | Budget overrun | Rate-limit expansions per session; cache expanded results in SQLite FTS5 [39] |
| 6 | **Heuristic token counting**: Replacing 4-char heuristic [5] with a real tokenizer changes compaction trigger timing. | Over/under-compaction during rollout | A/B test with shadow compaction: run both counters, log divergence, switch after validation |
| 7 | **SDK session ID lifetime**: `sdkSessionId` [6] has an unknown TTL on Anthropic's side. Long suspensions may invalidate it. | Resume fails, full restart required | Always persist DAG context as fallback; treat SDK resume as optimization, not requirement |
| 8 | **No external database**: All persistence is file-based JSON/markdown [23]. SQLite is the first non-JSON store. | Operational complexity | SQLite is embedded (no server); use the same atomic-write + backup-recovery patterns [18] |
| 9 | **Heap pressure during compaction**: Compaction LLM calls consume heap. With 80% stop threshold [23], compaction may be blocked when most needed. | Agents can't compact under memory pressure | Run compaction in a child process or worker thread; exempt compaction calls from heap checks |
| 10 | **Test coverage gap**: Zero existing tests for context compression behavior or kill-and-rehydrate flows [25][26]. | Regressions ship silently | Phase 3 testing is prerequisite to production rollout; gate behind feature flag |

---

## Citations

| # | Source |
|---|--------|
| [1] | `apps/server/src/services/agent-service.ts:143` — Session interface and management |
| [2] | `apps/server/src/services/agent-service.ts:348` — Conversation history construction |
| [3] | `apps/server/src/routes/chat/message-compaction.ts:16` — Compaction budget (100K tokens) |
| [4] | `apps/server/src/routes/chat/message-compaction.ts:142` — Last 10 messages preserved verbatim |
| [5] | `apps/server/src/routes/chat/message-compaction.ts:68` — Heuristic token estimation |
| [6] | `apps/server/src/providers/claude-provider.ts:264` — SDK session resumption |
| [7] | `apps/server/src/lib/sdk-options.ts:747` — File checkpointing (auto-mode only) |
| [8] | `apps/server/src/lib/sdk-options.ts:315` — Max turns configuration |
| [9] | `libs/utils/src/context-loader.ts:462` — Memory file scoring |
| [10] | `apps/server/src/services/agent-service.ts:544` — MessageQueueMiddleware injection |
| [11] | `apps/server/src/services/agent-service.ts:226` — Interrupted tool recovery |
| [12] | `apps/server/src/lib/git-staging-utils.ts:18` — Git staging includes memory files |
| [13] | `apps/server/src/services/agent-service.ts:442` — System prompt layering |
| [14] | `apps/server/src/server/shutdown.ts:54` — Graceful shutdown marker |
| [15] | `apps/server/src/server/shutdown.ts:125-173` — Uncaught exception handler |
| [16] | `apps/server/src/services/auto-mode-service.ts:3343-3433` — Resume interrupted features |
| [17] | `libs/types/src/feature.ts:72-97` — Feature type with execution metadata |
| [18] | `apps/server/src/services/feature-loader.ts:1-150` — Atomic JSON writes with backup recovery |
| [19] | `apps/server/src/lib/worktree-metadata.ts:73-128` — Worktree metadata read/write |
| [20] | `apps/server/src/services/worktree-recovery-service.ts:58-150` — Uncommitted work recovery |
| [21] | `apps/server/src/services/worktree-lifecycle-service.ts:198-290` — Worktree cleanup |
| [22] | `apps/server/src/services/worktree-lifecycle-service.ts:31,137-188` — 6-hour drift detection |
| [23] | `apps/server/src/services/auto-mode-service.ts` — Heap pressure thresholds |
| [24] | `apps/server/src/services/auto-mode-service.ts:3385-3403` — agent-output.md presence check |
| [25] | `apps/server/tests/unit/services/agent-service.test.ts:166` — Pending tools interrupt test |
| [26] | `apps/server/tests/unit/services/agent-service.test.ts:211` — Idempotent replay guard |
| [27] | `apps/server/tests/unit/providers/claude-provider.test.ts:147` — SDK resume test |
| [28] | `apps/server/tests/unit/services/recovery-service.test.ts:1` — Failure recovery framework tests |
| [29] | `apps/server/tests/unit/services/worktree-recovery-service.test.ts` — Git fault injection tests |
| [30] | `apps/server/vitest.config.ts:30` — CI coverage thresholds |
| [31] | [CCF: Context Compression Framework](https://arxiv.org/html/2509.09199v1) — ROUGE-L 0.97–1.00 at 8× compression |
| [32] | [Replay Testing (Temporal/DBOS)](https://www.bitovi.com/blog/replay-testing-to-avoid-non-determinism-in-temporal-workflows) |
| [33] | [agent-chaos (Python)](https://github.com/deepankarm/agent-chaos) — Composable fault injection |
| [34] | [ReliabilityBench](https://arxiv.org/pdf/2601.06112) — Agent reliability benchmarking |
| [35] | `research-lossless-claw-20260316121321.json:357` — Confidence/completeness metrics |
| [36] | `research-lossless-claw-20260316121321.json:84` — CompactionEngine modes and escalation |
| [37] | `research-lossless-claw-20260316121321.json:203` — Fresh tail protection |
| [38] | `research-lossless-claw-20260316121321.json:111` — Depth-keyed prompt definitions |
| [39] | `research-lossless-claw-20260316121321.json:172` — SQLite schema and key operations |
| [40] | `research-lossless-claw-20260316121321.json:137` — Expansion system with sub-agent |
| [41] | `research-lossless-claw-20260316121321.json:149` — Large file interception threshold |
| [42] | `research-lossless-claw-20260316121321.json:214` — JSONL crash recovery |
| [43] | `research-lossless-claw-20260316121321.json:194` — Dependency injection pattern |
| [44] | [lossless-claw `src/compaction.ts`](https://github.com/Martian-Engineering/lossless-claw) — CompactionConfig interface |
| [45] | [lossless-claw repository](https://github.com/Martian-Engineering/lossless-claw) — MIT, 2,230 stars |
| [46] | [lossless-claw architecture docs](https://github.com/Martian-Engineering/lossless-claw/blob/main/docs/architecture.md) — DAG structure |
| [47] | [lossless-claw architecture docs](https://github.com/Martian-Engineering/lossless-claw/blob/main/docs/architecture.md) — XML summary format |
| [48] | [VoltAgent repository](https://github.com/VoltAgent/voltagent) — Suspend controller |
| [49] | [VoltAgent workflow hooks](https://voltagent.dev/docs/workflows/hooks/) — Graceful/immediate modes |
| [50] | [VoltAgent streaming](https://voltagent.dev/docs/workflows/streaming/) — Step-level suspend/resume |
| [51] | [VoltAgent streaming](https://voltagent.dev/docs/workflows/streaming/) — Resume API |
| [52] | [VoltAgent REST endpoints](https://voltagent.dev/docs/api/endpoints/workflows/) — Suspend/resume/state APIs |
| [53] | [VoltAgent `packages/core/src/workflow/types.ts`](https://github.com/VoltAgent/voltagent) — WorkflowSuspensionMetadata |
| [54] | [VoltAgent `packages/core/src/workflow/core.ts`](https://github.com/VoltAgent/voltagent) — Checkpoint persistence |
| [55] | [VoltAgent `packages/core/src/voltagent.ts`](https://github.com/VoltAgent/voltagent) — Shutdown orchestration |
| [56] | [VoltAgent `packages/core/src/workflow/registry.ts`](https://github.com/VoltAgent/voltagent) — suspendAllActiveWorkflows |
| [57] | [VoltAgent `packages/core/src/voltagent.ts`](https://github.com/VoltAgent/voltagent) — Signal handlers |