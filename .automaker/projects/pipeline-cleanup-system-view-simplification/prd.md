# PRD: Pipeline Cleanup & System View Simplification

## Situation

The codebase contains three generations of pipeline/orchestration infrastructure layered on top of each other. PipelineOrchestrator (847 lines) has been feature-flagged OFF since Feb 2026 after being replaced by the Lead Engineer state machine. PipelineService (320 lines) is old config CRUD with zero consumers. Three LangGraph flows (coordinator, review, interrupt-loop) are exported but never imported at runtime. The system view (/system-view) renders a 3-lane visualization including a pre-production lane and pipeline stages lane that model infrastructure which no longer exists. The features board has zero project awareness despite Feature having projectSlug/milestoneSlug fields.

## Problem

Dead code creates cognitive overhead — engineers reading the codebase see PipelineOrchestrator and must determine if it's active. The system view misleads operators by visualizing disabled services as if they were real. featureFlags.pipeline is permanently false and will never be re-enabled. The board doesn't surface which project a feature belongs to, making it hard to assess project progress without switching views.

## Approach

1. Delete all dead server infrastructure: PipelineOrchestrator, PipelineService, PipelineCheckpointService, their routes, tests, and all wiring. 2. Delete dead flow graphs (coordinator, review, interrupt-loop) and tests from @protolabsai/flows. Remove 3 defunct graph registry entries. 3. Delete all pipeline-specific UI components (panels, dialogs, edges, nodes, hooks, store). 4. Simplify system view to a 2-lane topology: Production lane (Lead Engineer → Auto-Mode → Agent Execution → Git Workflow → PR Pipeline) and Integrations sidebar (GitHub, Discord). 5. Add lightweight project awareness to the board: project filter dropdown in header, compact project badge on feature cards, enhanced milestone progress in projects features tab.

## Results

~43 files deleted, ~18 files modified, ~2,000+ lines of dead code removed. System view accurately reflects the real production pipeline. Board operators can filter by project and see which project a feature belongs to at a glance. No regression in auto-mode, Lead Engineer, agent execution, or GTM content flow.

## Constraints

Must not break auto-mode, Lead Engineer state machine, or agent execution. Must preserve GTM content flow (ContentFlowService, antagonistic-review, ceremony flows — gated by gtmEnabled, not pipeline flag). System view must still show real-time service health and running agents. Board project awareness must be lightweight — no new routes, uses existing projectSlug field on features. featureFlags.pipeline removal must update FeatureFlags type, DEFAULT_FEATURE_FLAGS, and developer-section.tsx FEATURE_FLAG_LABELS.
