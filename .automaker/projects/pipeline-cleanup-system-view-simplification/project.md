# Pipeline Cleanup & System View Simplification

Aggressively remove all dead pipeline/flow infrastructure (~2,000 lines of disabled code, 43 files), simplify the system view to visualize only real services, and add lightweight project awareness to the features board.

**Status:** active
**Created:** 2026-03-14T20:48:29.493Z
**Updated:** 2026-03-16T18:46:44.274Z

## Research Summary

This project targets three objectives: (1) removing ~2,000 lines of dead pipeline/flow orchestration infrastructure across ~43 files, (2) simplifying the system view from a 3-lane + GTM + reflection topology down to a 2-lane visualization of real production services, and (3) adding lightweight project-awareness filtering to the features board. Research confirms that the `PipelineOrchestrator` (847 lines) is permanently disabled via `featureFlags.pipeline` defaulting to `false` [2][46], three flow graph exports have zero production consumers [11][12], and six engine routes are dead [9][10]. The system view architecture is cleanly layered — a single data-assembly hook (`useFlowGraphData`) and a constants file (`constants.ts`) control all topology — making the 2-lane reduction surgical [25][21]. Board project-awareness requires only filtering changes; all backend APIs and client bindings already exist [37][39].

---

## PRD

### Situation

The codebase contains three generations of pipeline/orchestration infrastructure layered on top of each other. PipelineOrchestrator (847 lines) has been feature-flagged OFF since Feb 2026 after being replaced by the Lead Engineer state machine. PipelineService (320 lines) is old config CRUD with zero consumers. Three LangGraph flows (coordinator, review, interrupt-loop) are exported but never imported at runtime. The system view (/system-view) renders a 3-lane visualization including a pre-production lane and pipeline stages lane that model infrastructure which no longer exists. The features board has zero project awareness despite Feature having projectSlug/milestoneSlug fields.

### Problem

Dead code creates cognitive overhead — engineers reading the codebase see PipelineOrchestrator and must determine if it's active. The system view misleads operators by visualizing disabled services as if they were real. featureFlags.pipeline is permanently false and will never be re-enabled. The board doesn't surface which project a feature belongs to, making it hard to assess project progress without switching views.

### Approach

1. Delete all dead server infrastructure: PipelineOrchestrator, PipelineService, PipelineCheckpointService, their routes, tests, and all wiring. 2. Delete dead flow graphs (coordinator, review, interrupt-loop) and tests from @protolabsai/flows. Remove 3 defunct graph registry entries. 3. Delete all pipeline-specific UI components (panels, dialogs, edges, nodes, hooks, store). 4. Simplify system view to a 2-lane topology: Production lane (Lead Engineer → Auto-Mode → Agent Execution → Git Workflow → PR Pipeline) and Integrations sidebar (GitHub, Discord). 5. Add lightweight project awareness to the board: project filter dropdown in header, compact project badge on feature cards, enhanced milestone progress in projects features tab.

### Results

~43 files deleted, ~18 files modified, ~2,000+ lines of dead code removed. System view accurately reflects the real production pipeline. Board operators can filter by project and see which project a feature belongs to at a glance. No regression in auto-mode, Lead Engineer, agent execution, or GTM content flow.

### Constraints

Must not break auto-mode, Lead Engineer state machine, or agent execution. Must preserve GTM content flow (ContentFlowService, antagonistic-review, ceremony flows — gated by gtmEnabled, not pipeline flag). System view must still show real-time service health and running agents. Board project awareness must be lightweight — no new routes, uses existing projectSlug field on features. featureFlags.pipeline removal must update FeatureFlags type, DEFAULT_FEATURE_FLAGS, and developer-section.tsx FEATURE_FLAG_LABELS.

## Milestones

### 1. Server Pipeline Deletion

Remove PipelineOrchestrator, PipelineService, PipelineCheckpointService and all server-side wiring, routes, and tests. Remove featureFlags.pipeline entirely.

**Status:** completed

#### Phases

1. **Delete PipelineOrchestrator and engine pipeline routes** (medium)
2. **Delete PipelineService and /api/pipeline/\* routes** (medium)
3. **Delete PipelineCheckpointService and remove featureFlags.pipeline** (medium)

### 2. Flow Library and Registry Cleanup

Delete 3 dead LangGraph flow graphs and their tests. Remove 3 defunct graph registry entries. Maintain the 4 active flows.

**Status:** completed

#### Phases

1. **Delete dead LangGraph flows and update barrel exports** (small)
2. **Remove defunct graph registry entries** (small)

### 3. UI Pipeline Component Deletion

Delete all pipeline-specific UI components: flow-graph panels/dialogs/edges/nodes, board-view pipeline dialogs, pipeline store and query hook, and clean pipeline methods from API clients.

**Status:** pending

#### Phases

1. **Delete flow-graph pipeline components and update registries** (medium)
2. **Delete board-view pipeline components and clean API clients** (medium)

### 4. System View Simplification

Rebuild system view to a 2-lane topology: Production lane (Lead Engineer → Auto-Mode → Agent Execution → Git Workflow → PR Pipeline) and Integrations sidebar (GitHub, Discord). Remove all pipeline-stage and pre-production lane code.

**Status:** completed

#### Phases

1. **Rebuild flow-graph constants to 2-lane topology** (medium)
2. **Simplify use-flow-graph-data and flow-graph-view** (medium)

### 5. Board Project Awareness

Add lightweight project awareness: project filter dropdown in board header, compact project badge on feature cards, enhanced milestone progress in projects features tab.

**Status:** pending

#### Phases

1. **Add project filter dropdown to board header** (medium)
2. **Add project badge to feature cards** (small)
3. **Enhance projects features tab with milestone progress** (medium)
