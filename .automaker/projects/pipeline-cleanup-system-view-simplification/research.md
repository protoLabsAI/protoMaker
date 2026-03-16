# Research Report: Pipeline Cleanup & System View Simplification

Generated: 2026-03-14T22:11:40.317Z
Sub-topics investigated: 5
Total citations: 77
Models used: Haiku (compression), Sonnet (research), Opus (synthesis)

# Research Report: Pipeline Cleanup & System View Simplification

## Summary

This project targets three objectives: (1) removing ~2,000 lines of dead pipeline/flow orchestration infrastructure across ~43 files, (2) simplifying the system view from a 3-lane + GTM + reflection topology down to a 2-lane visualization of real production services, and (3) adding lightweight project-awareness filtering to the features board. Research confirms that the `PipelineOrchestrator` (847 lines) is permanently disabled via `featureFlags.pipeline` defaulting to `false` [2][46], three flow graph exports have zero production consumers [11][12], and six engine routes are dead [9][10]. The system view architecture is cleanly layered — a single data-assembly hook (`useFlowGraphData`) and a constants file (`constants.ts`) control all topology — making the 2-lane reduction surgical [25][21]. Board project-awareness requires only filtering changes; all backend APIs and client bindings already exist [37][39].

---

## Codebase Findings

### 1. Dead Pipeline Orchestrator

The `PipelineOrchestrator` is the largest single block of dead code. It is instantiated at server startup in `services.ts` but gated behind a feature flag that defaults to `false`:

```typescript
// [FILE: apps/server/src/services/pipeline-orchestrator.ts:111-116]
/**
 * Feature flag — controlled by settings.featureFlags.pipeline.
 * When false, all event handling is skipped. Set via setEnabled() at server startup.
 * Defaults to false (disabled) until the HITL pipeline overhaul is complete.
 */
private enabled = false;
```

[2][45]

The startup wiring reads the flag and passes it through, but `pipeline` is never `true` in any default configuration:

```typescript
// [FILE: apps/server/src/server/services.ts:464]
const pipelineOrchestrator = new PipelineOrchestrator(events, featureLoader, settingsService);
void settingsService.getGlobalSettings().then((s) => {
  pipelineOrchestrator.setEnabled(s.featureFlags?.pipeline ?? false);
});
```

[3]

```typescript
// [FILE: libs/types/src/global-settings.ts:218-226]
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  designs: false,
  pipeline: false,
  specEditor: false,
  systemView: false,
  userPresenceDetection: false,
  reactorEnabled: false,
};
```

[46][69]

Processor registration is hardcoded inline rather than using the `wiring.ts` module, confirming the orchestrator was never fully integrated into the service container lifecycle [16][17]:

```typescript
// [FILE: apps/server/src/server/services.ts:811]
pipelineOrchestrator.setProcessors({ ops: pmAgent, gtm: gtmAgent, projm: projmAgent });
```

[17]

The `ServiceContainer` interface declares the orchestrator alongside live services — removal requires updating this type [3]:

```typescript
// ServiceContainer (services.ts:205–209)
signalIntakeService: SignalIntakeService;
pipelineOrchestrator: PipelineOrchestrator; // DEAD — remove
pipelineService: typeof pipelineService; // LIVE — keep
channelRouter: ChannelRouter; // SHARED — keep
```

### 2. Live `PipelineService` (Must Preserve)

The `PipelineService` is a distinct, live Kanban-step manager that operates on `.automaker/pipeline.json`. It is actively consumed by `AutoModeService` and `ExecutionService`:

```typescript
// [FILE: apps/server/src/services/auto-mode-service.ts:3798]
pipelineService.isPipelineStatus(currentStatus);
```

[4]

```typescript
// [FILE: apps/server/src/services/auto-mode/execution-service.ts:938]
pipelineService.getPipelineConfig(projectPath);
```

[5]

The live pipeline route must be preserved:

```typescript
// Live route (routes.ts:326)
app.use('/api/pipeline', createPipelineRoutes(pipelineService));
```

### 3. Dead Flow Exports (`@protolabsai/flows`)

The `@protolabsai/flows` package (v0.56.0) [1] exports ~20+ factory functions. Three exports have zero production imports and exist only in test contexts:

```typescript
// [FILE: libs/flows/src/index.ts:17]
export { createReviewFlow } from './graphs/review-flow.js';
```

[11]

```typescript
// [FILE: libs/flows/src/index.ts:22]
export {
  createCoordinatorGraph,
  createResearcherGraph,
  createAnalyzerGraph,
} from './graphs/coordinator-flow.js';
```

[12]

The `unified-pipeline` graph definition in the registry mirrors the dead orchestrator's topology and is safe to remove while keeping the registry itself intact for observability [13]:

```typescript
// [FILE: apps/server/src/lib/graph-registry.ts:229]
{ id: 'unified-pipeline', topology: 'multi-stage-hitl',
  // ops: triage → research → spec_review → design → plan → execute → verify → publish
  // gtm: triage → research → spec_review → execute → verify → publish }
```

[13]

### 4. Dead Engine Routes

Six pipeline-related endpoints in the engine routes (lines 625–991) are dead. They all gate on the disabled orchestrator:

```typescript
// [FILE: apps/server/src/routes/engine/index.ts:625]
router.post('/signal/approve-prd', ..., async (req, res) => {
  pipelineOrchestrator.resolveGate(...)
})
```

[9]

```typescript
// [FILE: apps/server/src/routes/engine/index.ts:842]
router.post('/pipeline/status', ..., async (req, res) => {
  if (!pipelineOrchestrator.isEnabled()) {
    return res.status(404).json({ error: 'Pipeline feature not enabled' });
  }
})
```

[10]

### 5. Deprecated No-Op Methods in AutoModeService

Four methods in `AutoModeService` are explicitly `@deprecated` with no-op bodies — remnants of the legacy global auto-loop:

```typescript
// [FILE: apps/server/src/services/auto-mode-service.ts:721-745]
/**
 * @deprecated Fields removed; no-op kept for call-site compatibility during transition
 */
private resetFailureTracking(): void {
  // no-op: legacy global failure tracking fields removed
}

/**
 * @deprecated Field removed; no-op kept for call-site compatibility during transition
 */
private recordSuccess(): void {
  // no-op: legacy global consecutiveFailures field removed
}
```

[47][70]

```typescript
// [FILE: apps/server/src/services/auto-mode-service.ts:1050-1058]
/**
 * @deprecated Use startAutoLoopForProject instead for multi-project support
 */
async startAutoLoop(
  projectPath: string,
  maxConcurrency = DEFAULT_MAX_CONCURRENCY
): Promise<void> {
  // For backward compatibility, delegate to the new per-project method
```

[75]

### 6. Deprecated Type Fields Across Codebase

Multiple deprecated fields exist across the type hierarchy:

- `enhancementModel`, `validationModel` → `phaseModels.*` [48][71]
- `claudeApiProfiles` → `claudeCompatibleProviders` [49]
- `ClaudeApiProfile` → `ClaudeCompatibleProvider` [53]
- `LegacyFeatureStatus` type with auto-migration mapping [50][72]
- `lastTraceId` → `traceIds[]` [51][73]
- `modelRank` — no longer used [49]
- `personaOverrides` → project-level `agentConfig.rolePromptOverrides` [49]
- `CLAUDE_MODEL_MAP` deprecated [55]
- `resolveActiveClaudeApiProfile()` deprecated [59]

### 7. System View Architecture

The system view renders at `/system-view` via `AnalyticsView` → `FlowGraphView` → `FlowGraphCanvas` [18][19][20]. The canvas uses `@xyflow/react` with externally-controlled nodes/edges — topology is data-driven, not embedded in the renderer [20].

**Node type discrimination** is clean. `EngineServiceId` defines 12 real backend-backed services [22][30]:

```typescript
// [FILE: apps/ui/src/components/views/flow-graph/types.ts:30]
export type EngineServiceId =
  | 'signal-sources'
  | 'triage'
  | 'decomposition'
  | 'launch'
  | 'auto-mode'
  | 'agent-execution'
  | 'git-workflow'
  | 'pr-feedback'
  | 'lead-engineer-rules'
  | 'reflection'
  | 'content-pipeline'
  | 'project-planning';
```

[30]

`PipelineStageNode` is a separate type that tracks work-item aggregates via WebSocket, not engine API [23][34]:

```typescript
// [FILE: apps/ui/src/components/views/flow-graph/hooks/use-flow-graph-data.ts:1]
import { usePipelineTracker } from './use-pipeline-tracker'; // WebSocket
import { useEngineStatus } from '@/hooks/queries/use-metrics'; // HTTP poll
```

[34]

The current **3-lane layout** is defined in `constants.ts` [21][31]:

```typescript
// [FILE: apps/ui/src/components/views/flow-graph/constants.ts:57]
// Lane 1 (y=50): Signal Sources → Triage → Decomposition → Launch
// Lane 2 (y=280): Lead Engineer → Auto-Mode → Agent Execution → Git Workflow → PR Feedback
// GTM (y=-70): Content Pipeline
// Reflection (y=840)
```

[31]

**Data assembly** occurs in a single hook — `useFlowGraphData` — merging five data sources [25]:

1. `/api/engine/status` → engine-service nodes
2. `usePipelineTracker` (WebSocket) → pipeline-stage nodes
3. `/api/integration/status` → integration nodes
4. `useRunningAgents` → agent nodes
5. `useAppStore` → feature nodes

GTM filtering already has a gate pattern:

```typescript
// [FILE: apps/ui/src/components/views/flow-graph/hooks/use-flow-graph-data.ts:422]
const services = gtmEnabled
  ? ENGINE_SERVICES
  : ENGINE_SERVICES.filter((s) => s.serviceId !== 'content-pipeline');
```

[32]

The **node type registry** maps 11 types; removing a type string here prevents rendering [26][33]:

```typescript
// [FILE: apps/ui/src/components/views/flow-graph/nodes/index.ts:32]
export const nodeTypes: NodeTypes = {
  orchestrator: OrchestratorNode,
  service: ServiceNode,
  'engine-service': EngineServiceNode,
  integration: IntegrationNode,
  feature: FeatureNode,
  agent: AgentNode,
  'pipeline-stage': PipelineStageNode,
  'flow-process': FlowProcessNode,
  'flow-decision': FlowDecisionNode,
  'flow-hitl': FlowHitlNode,
  'flow-start-end': FlowStartEndNode,
};
```

[33]

Five flow-graph metrics are stubbed with hardcoded zeros [64]:

```typescript
// [FILE: apps/ui/src/components/views/flow-graph/hooks/use-flow-graph-data.ts:115-168]
// Five `throughput: 0` with `// TODO: Wire real ... once ... exposes metrics`
```

[64]

### 8. Features Board & Project Awareness

The Kanban board in `board-view.tsx` drives columns via `use-board-column-features.ts`, returning features grouped by status (`backlog`, `in_progress`, `review`, `blocked`, `done`) [35].

The `Feature` type already carries the project link [36]:

```typescript
// [FILE: libs/types/src/feature.ts:172]
projectSlug?: string;       // Project this feature belongs to
milestoneSlug?: string;     // Milestone this feature belongs to
phaseSlug?: string;         // Phase this feature was created from
```

[36]

The backend `getProjectFeatures()` method is implemented and filters by slug [37]:

```typescript
// [FILE: apps/server/src/services/project-service.ts:885]
async getProjectFeatures(projectPath: string, projectSlug: string): Promise<{ features: Feature[]; epics: Feature[] }> {
  const allFeatures = await this.featureLoader.getAll(projectPath);
  const projectFeatures = allFeatures.filter((f) => f.projectSlug === projectSlug);
  const epics = projectFeatures.filter((f) => f.isEpic);
  const features = projectFeatures.filter((f) => !f.isEpic);
  return { features, epics };
}
```

[37]

The UI client binding already exists [39]:

```typescript
// [FILE: apps/ui/src/lib/clients/system-client.ts:482]
getProjectFeatures: (projectPath: string, projectSlug: string) =>
  this.post('/api/projects/tools/project_list_features', { projectPath, projectSlug });
```

[39]

A reference implementation exists in `ProjectsView`'s features tab, which renders project-scoped feature lists grouped by epic with status badges [38]. The board header (`board-header.tsx`) is confirmed as the extension point for a project-filter dropdown [40][43].

---

## Relevant Patterns & Integration Points

### Critical Shared Dependencies

**`ChannelRouter`** is shared between the dead `PipelineOrchestrator` and the live `HITLFormService`. The router itself must be preserved; only the orchestrator's registration should be removed [6]:

```typescript
// [FILE: apps/server/src/services/channel-router.ts:63]
export class ChannelRouter {
  register(handler: ChannelHandler): void { ... }
  getHandler(featureId: string): ChannelHandler | undefined { ... }
}
```

[6]

**`github-channel-handler.ts`** has a hard constructor dependency on `PipelineOrchestrator`, calling `resolveGate()` at line 237. This handler is live and must be refactored to remove the orchestrator dependency without breaking GitHub webhook processing [8]:

```typescript
// [FILE: apps/server/src/services/channel-handlers/github-channel-handler.ts:87]
constructor(private readonly pipelineOrchestrator: PipelineOrchestrator, ...)
```

[8]

The channel-handlers module wires both together [7]:

```typescript
// [FILE: apps/server/src/services/channel-handlers/channel-handlers.module.ts:10]
const { pipelineOrchestrator, channelRouter } = container;
```

[7]

### Live Services Boundary

**`SignalIntakeService`** (745 lines) routes signals to Lead Engineer, GTM Authority, and HITL forms. Despite similar naming to pipeline concepts, it is NOT a consumer of the orchestrator — it is independently live [15].

**`PipelineService`** manages Kanban steps in `.automaker/pipeline.json` — completely separate from the orchestrator. Its `/api/pipeline/*` routes and method calls in `AutoModeService` and `ExecutionService` must be preserved [4][5].

### Feature Flag Gating Pattern

Two other route sets use the same disabled-by-default pattern:

- Content routes return 403 when `gtmEnabled` is false [65][76]
- HITL form creation returns 403 when `featureFlags.pipeline` is false [66][77]

### Event Bus Migration (Out of Scope but Noted)

Seven services still use `this.events.subscribe()` with `// TODO: migrate to bus.on()` comments [52][74]. This is a separate migration concern but relevant if touching event subscription patterns during cleanup.

---

## External Research

No external APIs, libraries, or third-party documentation were consulted for this analysis. All findings are derived from codebase inspection. The key technology dependency — `@xyflow/react` — is a well-established React Flow library; its node/edge model is standard and does not introduce removal constraints beyond ensuring referential integrity between `nodes`, `edges`, and `nodeTypes`.

---

## Recommended Approach

### Phase 1: Dead Orchestrator Removal (Server-Side)

1. **Remove `PipelineOrchestrator` class** (`pipeline-orchestrator.ts`, ~847 lines) [2]
2. **Remove orchestrator from `ServiceContainer` interface** and all instantiation/wiring in `services.ts` [3][17]
3. **Remove 6 dead engine routes** (lines 625–991 in `routes/engine/index.ts`) [9][10]
4. **Refactor `github-channel-handler.ts`** — remove `PipelineOrchestrator` constructor parameter; stub or remove `resolveGate()` call [8]. This is the highest-risk change and should be isolated in its own commit.
5. **Update `channel-handlers.module.ts`** — remove orchestrator destructure, keep `channelRouter` [7]
6. **Remove `unified-pipeline` definition from `graph-registry.ts`** — keep registry infrastructure [13]
7. **Remove dead flow exports** from `libs/flows/src/index.ts`: `createReviewFlow`, `createCoordinatorGraph`, `createResearcherGraph`, `createAnalyzerGraph`, `createInterruptLoop` [11][12]. Delete backing graph files if they have no other consumers.

### Phase 2: Deprecated Code Cleanup (Server-Side)

8. **Remove no-op methods** in `AutoModeService`: `resetFailureTracking()`, `recordSuccess()`, `startAutoLoop()`, `runAutoLoop()`, `stopAutoLoop()`, `getActiveAutoLoopProjects()` — verify no live call sites first [47]
9. **Leave deprecated type fields** (`LegacyFeatureStatus`, `lastTraceId`, `enhancementModel`, etc.) for a separate migration — they have backward-compatibility concerns [50][51][48]

### Phase 3: System View Simplification (UI)

10. **Rebuild `constants.ts`** to a 2-lane topology — keep Lane 2 services (`lead-engineer-rules`, `auto-mode`, `agent-execution`, `git-workflow`, `pr-feedback`) plus integration sidebar [28][31]
11. **Remove from `ENGINE_SERVICES`**: Lane 1 nodes (`signal-sources`, `triage`, `decomposition`, `launch`), GTM node (`content-pipeline`), reflection node (`reflection`) [31]
12. **Prune `STATIC_EDGES`** — delete all edges referencing removed node IDs to avoid dangling-edge warnings from React Flow [27]
13. **Remove `PipelineStageNode`** renderer and `usePipelineTracker` hook — pipeline-stage nodes are work-tracking artifacts, not real services [23][34]
14. **Prune `FlowNode` union type** and `nodeTypes` registry — remove unused node types (`orchestrator`, `pipeline-stage`, `flow-process`, `flow-decision`, `flow-hitl`, `flow-start-end`) [29][33]
15. **Update `useFlowGraphData`** — remove pipeline-tracker merge, simplify to engine-status + integration + agents + features [25]
16. **Narrow `EngineServiceId`** to the 5 kept services plus `project-planning` if retained [30]

### Phase 4: Board Project Awareness (UI)

17. **Add `selectedProjectSlug` state** to `board-view.tsx` [43]
18. **Add project-filter dropdown** to `board-header.tsx` — use existing project list from app store [40]
19. **Inject filter predicate** into `use-board-column-features.ts`: `f.projectSlug === selectedProjectSlug` when a project is selected [35][43]
20. **Leverage existing `getProjectFeatures()` client binding** — no new API plumbing required [39]

### Commit Strategy

- **Commit per phase** minimum; Phase 1 step 4 (github-channel-handler refactor) deserves its own commit
- Run full test suite after Phase 1 — orchestrator removal touches startup path
- UI changes (Phases 3–4) can be developed in parallel with server cleanup

---

## Open Questions & Risks

1. **`github-channel-handler.ts` refactor risk** — This live handler hard-depends on `PipelineOrchestrator` in its constructor and calls `resolveGate()` [8]. The `resolveGate()` call path needs tracing to determine if it can be deleted or must be replaced with a no-op. This is the single highest-risk change in the project.

2. **HITL form 403 behavior** — HITL form creation currently returns 403 when `featureFlags.pipeline` is false [66][77]. If the `pipeline` feature flag is removed entirely (since the orchestrator is removed), this gate needs updating or removal. Clarify: should HITL forms become unconditionally available?

3. **`ChannelRouter` consumer audit incomplete** — Research confirms `HITLFormService` uses it [6], but a full consumer audit of `channelRouter.getHandler()` was not exhaustively completed. Before removing orchestrator registrations, verify no other service depends on handlers the orchestrator registered.

4. **Testing strategy gap** — No research was completed on existing test coverage for the dead code paths. Before deletion, a test inventory should confirm: (a) which tests exercise the orchestrator and can be deleted, (b) which tests exercise `github-channel-handler` and must be updated, and (c) whether integration tests exist for the engine routes being removed.

5. **`STATIC_EDGES` and `PIPELINE_EDGES` full content unknown** — Lines 149–397 of `constants.ts` were identified but not fully excerpted [27]. The 2-lane rebuild needs the complete edge list to ensure no dangling references.

6. **`usePipelineTracker` WebSocket teardown** — Removing the tracker hook requires confirming it doesn't share a WebSocket connection with other live hooks. If the WebSocket is multiplexed, only the pipeline message handler should be removed, not the connection [34].

7. **Deprecated type fields are widespread** — 15+ deprecated fields span `global-settings.ts`, `feature.ts`, `provider-settings.ts`, `provider.ts`, `model.ts`, and `project.ts` [48–61]. These carry backward-compatibility obligations and should NOT be removed in this project without a migration plan for persisted data.

8. **`project-planning` service ID** — The `EngineServiceId` includes `'project-planning'` [30] which doesn't appear in any lane definition [31]. Clarify whether this is a planned future node or dead weight.

---

## Citations

| #    | Source                                                                          | Description                                     |
| ---- | ------------------------------------------------------------------------------- | ----------------------------------------------- |
| [1]  | `libs/flows/package.json:2`                                                     | `@protolabsai/flows` package identity           |
| [2]  | `apps/server/src/services/pipeline-orchestrator.ts:116`                         | `enabled = false` field                         |
| [3]  | `apps/server/src/server/services.ts:464`                                        | Orchestrator instantiation and flag wiring      |
| [4]  | `apps/server/src/services/auto-mode-service.ts:3798`                            | Live `pipelineService.isPipelineStatus()` call  |
| [5]  | `apps/server/src/services/auto-mode/execution-service.ts:938`                   | Live `pipelineService.getPipelineConfig()` call |
| [6]  | `apps/server/src/services/channel-router.ts:63`                                 | `ChannelRouter` class — shared dependency       |
| [7]  | `apps/server/src/services/channel-handlers/channel-handlers.module.ts:10`       | Module destructures orchestrator + router       |
| [8]  | `apps/server/src/services/channel-handlers/github-channel-handler.ts:87`        | Hard constructor dependency on orchestrator     |
| [9]  | `apps/server/src/routes/engine/index.ts:625`                                    | Dead `/signal/approve-prd` route                |
| [10] | `apps/server/src/routes/engine/index.ts:842`                                    | Dead `/pipeline/status` route                   |
| [11] | `libs/flows/src/index.ts:17`                                                    | Dead `createReviewFlow` export                  |
| [12] | `libs/flows/src/index.ts:22`                                                    | Dead `createCoordinatorGraph` exports           |
| [13] | `apps/server/src/lib/graph-registry.ts:229`                                     | Dead `unified-pipeline` graph definition        |
| [15] | `apps/server/src/services/signal-intake-service.ts`                             | Live service, NOT an orchestrator consumer      |
| [16] | `apps/server/src/server/wiring.ts:24`                                           | Wiring module does NOT register pipeline        |
| [17] | `apps/server/src/server/services.ts:811`                                        | Hardcoded processor registration                |
| [18] | `apps/ui/src/routes/system-view.tsx:1`                                          | System view route                               |
| [19] | `apps/ui/src/components/views/analytics-view.tsx:1`                             | AnalyticsView wrapper                           |
| [20] | `apps/ui/src/components/views/flow-graph/flow-graph-canvas.tsx:1`               | React Flow canvas                               |
| [21] | `apps/ui/src/components/views/flow-graph/constants.ts:1`                        | Topology constants                              |
| [22] | `apps/ui/src/components/views/flow-graph/types.ts:30`                           | `EngineServiceId` type                          |
| [23] | `apps/ui/src/components/views/flow-graph/types.ts:114`                          | `PipelineStageNode` type                        |
| [25] | `apps/ui/src/components/views/flow-graph/hooks/use-flow-graph-data.ts:419`      | Data assembly hook                              |
| [26] | `apps/ui/src/components/views/flow-graph/nodes/index.ts:32`                     | Node type registry                              |
| [27] | `apps/ui/src/components/views/flow-graph/constants.ts:149`                      | Static edges (partial)                          |
| [28] | `.automaker/.../phase-01-rebuild-flow-graph-constants-to-2-lane-topology.md:12` | 2-lane spec                                     |
| [29] | `apps/ui/src/components/views/flow-graph/types.ts:186`                          | `FlowNode` union type                           |
| [30] | `apps/ui/src/components/views/flow-graph/types.ts:30`                           | `EngineServiceId` 12-value union                |
| [31] | `apps/ui/src/components/views/flow-graph/constants.ts:57`                       | 3-lane layout positions                         |
| [32] | `apps/ui/src/components/views/flow-graph/hooks/use-flow-graph-data.ts:422`      | GTM filtering gate                              |
| [33] | `apps/ui/src/components/views/flow-graph/nodes/index.ts:32`                     | Full `nodeTypes` object                         |
| [34] | `apps/ui/src/components/views/flow-graph/hooks/use-flow-graph-data.ts:1`        | WebSocket/HTTP imports                          |
| [35] | `apps/ui/src/components/views/board-view/hooks/use-board-column-features.ts:1`  | Board column hook                               |
| [36] | `libs/types/src/feature.ts:172`                                                 | `projectSlug` field on Feature                  |
| [37] | `apps/server/src/services/project-service.ts:885`                               | `getProjectFeatures()` implementation           |
| [38] | `apps/ui/src/components/views/projects-view/tabs/features-tab.tsx:53`           | Reference features tab                          |
| [39] | `apps/ui/src/lib/clients/system-client.ts:482`                                  | Client binding for project features             |
| [40] | `apps/ui/src/components/views/board-view/board-header.tsx`                      | Board header extension point                    |
| [43] | `.automaker/.../phase-01-add-project-filter-dropdown-to-board-header.md`        | Board awareness spec                            |
| [45] | `apps/server/src/services/pipeline-orchestrator.ts:111-116`                     | Orchestrator flag documentation                 |
| [46] | `libs/types/src/global-settings.ts:218-226`                                     | Default feature flags (all false)               |
| [47] | `apps/server/src/services/auto-mode-service.ts:721-745`                         | Deprecated no-op methods                        |
| [48] | `libs/types/src/global-settings.ts:392-395`                                     | Deprecated model fields                         |
| [49] | `libs/types/src/global-settings.ts:547,553,707`                                 | Deprecated settings fields                      |
| [50] | `libs/types/src/feature.ts:567-586`                                             | `LegacyFeatureStatus` deprecated type           |
| [51] | `libs/types/src/feature.ts:408-413`                                             | `lastTraceId` deprecated field                  |
| [52] | `apps/server/src/services/agent-discord-router.ts:66-67`                        | Event bus migration TODO                        |
| [53] | `libs/types/src/provider-settings.ts:325,362,377`                               | Deprecated provider types                       |
| [55] | `libs/types/src/model.ts:26`                                                    | `CLAUDE_MODEL_MAP` deprecated                   |
| [59] | `apps/server/src/lib/settings-helpers.ts:398`                                   | `resolveActiveClaudeApiProfile()` deprecated    |
| [64] | `apps/ui/src/.../use-flow-graph-data.ts:115-168`                                | Five hardcoded throughput zeros                 |
| [65] | `apps/server/src/routes/content/index.ts:23-35`                                 | GTM 403 gate                                    |
| [66] | `apps/server/src/routes/hitl-forms/routes/create.ts:52-57`                      | HITL 403 gate                                   |
| [69] | `libs/types/src/global-settings.ts:218-226`                                     | Default flags (verbatim)                        |
| [70] | `apps/server/src/services/auto-mode-service.ts:721-745`                         | No-op methods (verbatim)                        |
| [71] | `libs/types/src/global-settings.ts:391-395`                                     | Deprecated model fields (verbatim)              |
| [72] | `libs/types/src/feature.ts:567-586`                                             | Legacy status (verbatim)                        |
| [73] | `libs/types/src/feature.ts:408-413`                                             | `lastTraceId` (verbatim)                        |
| [74] | `apps/server/src/services/agent-discord-router.ts:66-67`                        | Event subscribe TODO (verbatim)                 |
| [75] | `apps/server/src/services/auto-mode-service.ts:1050-1058`                       | Deprecated `startAutoLoop` (verbatim)           |
| [76] | `apps/server/src/routes/content/index.ts:23-35`                                 | GTM gate (verbatim)                             |
| [77] | `apps/server/src/routes/hitl-forms/routes/create.ts:52-57`                      | HITL gate (verbatim)                            |
