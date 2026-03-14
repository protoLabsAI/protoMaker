# @protolabsai/dependency-resolver

## 0.55.1

### Patch Changes

- ### Bug Fixes
  - remove authority system from MCP tools
  - remove authority system from MCP tools
- Updated dependencies
  - @protolabsai/types@0.55.1

## 0.55.0

### Minor Changes

- ### Features
  - emit specific lifecycle events from FeatureLoader on status changes (#2501)
  - emit specific lifecycle events from FeatureLoader on status changes (#2501)
  - remove CRDT types from shared types package (#2494)
  - remove libs/crdt package and automerge dependencies (#2493)
  - strip Automerge from ProjectService, replace with plain Map cache (#2488)
  - remove CRDT types from shared types package (#2494)
  - remove libs/crdt package and automerge dependencies (#2493)
  - strip Automerge from ProjectService, replace with plain Map cache (#2488)

  ### Bug Fixes
  - include remainingMilestones and retroData in ceremony:fired events (#2502)
  - emit direct auto-mode events from TypedEventBus alongside envelope (#2500)
  - bridge ErrorBudgetService events to shared app event bus (#2499)
  - include remainingMilestones and retroData in ceremony:fired events (#2502)
  - emit direct auto-mode events from TypedEventBus alongside envelope (#2500)
  - bridge ErrorBudgetService events to shared app event bus (#2499)
  - remove stale libs/crdt references from Dockerfile and tsconfigs
  - remove AvaChannelReactorService references from test files
  - filter CRDT project sync by projectPath to prevent cross-repo leakage
  - remove stale libs/crdt references from Dockerfile and tsconfigs
  - remove AvaChannelReactorService references from test files
  - filter CRDT project sync by projectPath to prevent cross-repo leakage

  ### Refactors
  - MergeProcessor respects prMergeStrategy and PR merge race guard (#2505)
  - remove dead rollbackTriggered rule and gate-tuning action type (#2504)
  - Fix DeployProcessor DONE transition and clean up orphaned states (#2498)
  - MergeProcessor respects prMergeStrategy and PR merge race guard (#2505)
  - remove dead rollbackTriggered rule and gate-tuning action type (#2504)
  - Fix DeployProcessor DONE transition and clean up orphaned states (#2498)
  - remove human-assignee gate from auto-mode
  - Remove CRDT module wiring from startup and services container (#2490)
  - strip CRDT from notes routes, use disk-only reads/writes (#2486)
  - remove AvaChannelService and backchannel infrastructure (#2485)
  - remove human-assignee gate from auto-mode
  - Remove CRDT module wiring from startup and services container (#2490)
  - strip CRDT from notes routes, use disk-only reads/writes (#2486)
  - remove AvaChannelService and backchannel infrastructure (#2485)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.55.0

## 0.54.1

### Patch Changes

- ### Refactors
  - System Improvement: recurring merge_conflict failures (#2481)
  - System Improvement: recurring merge_conflict failures (#2479)
  - System Improvement: recurring merge_conflict failures (#2481)
  - System Improvement: recurring merge_conflict failures (#2479)
- Updated dependencies
  - @protolabsai/types@0.54.1

## 0.54.0

### Minor Changes

- ### Features
  - add WebSocket auto-refresh and manual refresh button to project timeline (#2467)
  - auto-complete epics when all child features are done (#2466)
  - fall back to feature metadata when ledger is empty (#2464)
  - unify agent prompt overrides — move personaOverrides to project-level agentConfig (#2462)
  - POST /api/features/backfill-project-slug migration endpoint (#2459)
  - normalize matchFeature confidence using diminishing-returns score (#2450)
  - add \_builtIn to ProjectAgent type and remove unsafe casts (#2449)
  - add WebSocket auto-refresh and manual refresh button to project timeline (#2467)
  - auto-complete epics when all child features are done (#2466)
  - fall back to feature metadata when ledger is empty (#2464)
  - unify agent prompt overrides — move personaOverrides to project-level agentConfig (#2462)
  - POST /api/features/backfill-project-slug migration endpoint (#2459)
  - normalize matchFeature confidence using diminishing-returns score (#2450)
  - add \_builtIn to ProjectAgent type and remove unsafe casts (#2449)

  ### Bug Fixes
  - add Traefik routing for docs.protolabs.studio (502 fix)
  - event listener leak, unguarded promise, and backoff overflow safety
  - align test mocks with MatchResult interface for auto-assign tests
  - replace fs.watch recursive with mtime polling in AgentManifestService (#2453)
  - eliminate double-counting in FeatureScheduler concurrency check (#2451)
  - dispose AgentManifestService on graceful shutdown (#2447)
  - return capabilities for built-in roles in /api/agents/get (#2446)
  - guard LeadEngineerSessionStore against missing sessions property
  - auto-assignment sequencing and manifest-aware model resolution
  - remove 9 dead links from VitePress docs
  - add Traefik routing for docs.protolabs.studio (502 fix)
  - event listener leak, unguarded promise, and backoff overflow safety
  - align test mocks with MatchResult interface for auto-assign tests
  - replace fs.watch recursive with mtime polling in AgentManifestService (#2453)
  - eliminate double-counting in FeatureScheduler concurrency check (#2451)
  - dispose AgentManifestService on graceful shutdown (#2447)
  - return capabilities for built-in roles in /api/agents/get (#2446)
  - guard LeadEngineerSessionStore against missing sessions property
  - auto-assignment sequencing and manifest-aware model resolution
  - remove 9 dead links from VitePress docs

  ### Refactors
  - Update docs after: Project Pipeline Unification (#2468)
  - Verify completion detector with projectSlug (#2465)
  - Fix Discord bot sending empty messages to #dev channel (#2463)
  - Backfill projectSlug on existing ledger entries (#2461)
  - Enrich feature events with projectSlug at emission (#2460)
  - Wire projectSlug auto-assignment into FeatureLoader.create (#2457)
  - Add route tests for /api/agents endpoints (#2455)
  - remove dead manifestPaths field from AgentConfig (#2454)
  - Add auto-assignment to pipeline execution path (#2448)
  - Update docs after: Project Pipeline Unification (#2468)
  - Verify completion detector with projectSlug (#2465)
  - Fix Discord bot sending empty messages to #dev channel (#2463)
  - Backfill projectSlug on existing ledger entries (#2461)
  - Enrich feature events with projectSlug at emission (#2460)
  - Wire projectSlug auto-assignment into FeatureLoader.create (#2457)
  - Add route tests for /api/agents endpoints (#2455)
  - remove dead manifestPaths field from AgentConfig (#2454)
  - Add auto-assignment to pipeline execution path (#2448)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.54.0

## 0.53.0

### Minor Changes

- ### Features
  - auto-assign role via match rules before feature execution (#2441)
  - inject role promptFile into agent system prompt (#2440)
  - auto-assign role via match rules before feature execution (#2441)
  - inject role promptFile into agent system prompt (#2440)
  - add AgentConfig to WorkflowSettings for per-role model overrides (#2431)
  - make AgentRole extensible with BUILT_IN_AGENT_ROLES and add agent-manifest types (#2430)
  - add InlineEditor component for click-to-edit fields

  ### Bug Fixes
  - force exit on graceful shutdown when server.close() hangs
  - force exit on graceful shutdown when server.close() hangs
  - no-op agent completion stuck in in_progress + status filter mismatch
  - deduplicate docs update feature spawning
  - notification badges show unread count instead of pending count

  ### Refactors
  - Agents panel in project settings + feature role selector (#2442)
  - Wire assignedRole into getModelForFeature() (#2439)
  - API routes for agent manifest (#2438)
  - Agents panel in project settings + feature role selector (#2442)
  - Wire assignedRole into getModelForFeature() (#2439)
  - API routes for agent manifest (#2438)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.53.0

## 0.52.0

### Minor Changes

- ### Features
  - add AgentConfig to WorkflowSettings for per-role model overrides (#2431)
  - make AgentRole extensible with BUILT_IN_AGENT_ROLES and add agent-manifest types (#2430)
  - add AgentConfig to WorkflowSettings for per-role model overrides (#2431)
  - make AgentRole extensible with BUILT_IN_AGENT_ROLES and add agent-manifest types (#2430)
  - add InlineEditor component for click-to-edit fields

  ### Bug Fixes
  - no-op agent completion stuck in in_progress + status filter mismatch
  - no-op agent completion stuck in in_progress + status filter mismatch
  - deduplicate docs update feature spawning
  - notification badges show unread count instead of pending count

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.52.0

## 0.51.0

### Minor Changes

- ### Features
  - generate QA Checklist doc on project launch (#2419)
  - generate QA Checklist doc on project launch (#2419)
  - paper trail UI — grouped artifacts, markdown expand, download, filter dropdown (#2415)
  - paper trail UI — ceremony labels, artifact links, decision/escalation filters (#2413)
  - add research trigger UI to ResearchTab with 4-state rendering (#2412)
  - enrich NewProjectDialog with description and research toggle (#2409)
  - pm agent reads research.md before PRD generation (#2406)
  - add POST /lifecycle/research route and lifecycle service method (#2404)
  - ceremony automation milestone — ceremonies settings + UI toggle (#2401)
  - add getResearchMdPath and getResearchArtifactDir helpers (#2399)
  - paper trail UI — grouped artifacts, markdown expand, download, filter dropdown (#2415)
  - paper trail UI — ceremony labels, artifact links, decision/escalation filters (#2413)
  - add research trigger UI to ResearchTab with 4-state rendering (#2412)
  - enrich NewProjectDialog with description and research toggle (#2409)
  - pm agent reads research.md before PRD generation (#2406)
  - add POST /lifecycle/research route and lifecycle service method (#2404)
  - ceremony automation milestone — ceremonies settings + UI toggle (#2401)
  - add getResearchMdPath and getResearchArtifactDir helpers (#2399)
  - add InlineEditor component for click-to-edit fields

  ### Bug Fixes
  - copy non-TS assets into dist for Docker server build
  - update Dockerfile server entrypoint for tsc project references output
  - expose CRDT sync ports (4444/4445) in staging Docker compose
  - deduplicate docs update feature spawning
  - copy non-TS assets into dist for Docker server build
  - update Dockerfile server entrypoint for tsc project references output
  - expose CRDT sync ports (4444/4445) in staging Docker compose
  - notification badges show unread count instead of pending count

  ### Refactors
  - use shared InlineEditor for Resources documents
  - use shared InlineEditor for Resources documents
  - use TipTap as inline editor for Resources documents
  - use TipTap as inline editor for Resources documents
  - Render markdown in Resources documents (#2423)
  - Polish QA checklist output (#2420)
  - Render markdown in Resources documents (#2423)
  - Polish QA checklist output (#2420)
  - Upgrade ResearchAgent with deep research patterns from open_deep_researc (#2416)
  - Wire CeremonyService to ProjectArtifactService (#2407)
  - Phase execution status sync from feature events (#2405)
  - Upgrade ResearchAgent with deep research patterns from open_deep_researc (#2416)
  - Wire CeremonyService to ProjectArtifactService (#2407)
  - Phase execution status sync from feature events (#2405)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.51.0

## 0.50.3

### Patch Changes

- ### Bug Fixes
  - use broadcast() instead of emit() for CRDT project sync
  - use broadcast() instead of emit() for CRDT project sync
- Updated dependencies
  - @protolabsai/types@0.50.3

## 0.50.2

### Patch Changes

- ### Bug Fixes
  - prevent orphaned concurrency slots from blocking auto-mode (#2388)
  - prevent orphaned concurrency slots from blocking auto-mode (#2388)

  ### Refactors
  - fix: auto-mode concurrency slots locked by orphaned in_progress features (#2386)
  - fix: auto-mode concurrency slots locked by orphaned in_progress features (#2386)

- Updated dependencies
  - @protolabsai/types@0.50.2

## 0.50.1

### Patch Changes

- ### Bug Fixes
  - stabilize flaky CRDT two-node sync test
  - regenerate-site workflow pushes to dev via PR instead of direct main push
  - stabilize flaky CRDT two-node sync test
  - regenerate-site workflow pushes to dev via PR instead of direct main push
- Updated dependencies
  - @protolabsai/types@0.50.1

## 0.50.0

### Minor Changes

- ### Features
  - add discord reaction endpoint and conditional discord loading (#2362)
  - add discord reaction endpoint and conditional discord loading (#2362)
  - add discord reaction endpoint and conditional discord loading (#2362)
  - add discord reaction endpoint and conditional discord loading (#2362)

  ### Bug Fixes
  - harden release pipeline — auto-sync, version gate, skip alert
  - harden release pipeline — auto-sync, version gate, skip alert

  ### Refactors
  - Decompose CI skills (#2377)
  - Decompose worktree skills (#2376)
  - Add trigger descriptions to remaining skills (#2375)
  - Decompose monorepo-patterns (#2374)
  - Skill overlap audit (#2372)
  - Decompose CI skills (#2377)
  - Decompose worktree skills (#2376)
  - Decompose CI skills (#2377)
  - Decompose worktree skills (#2376)
  - Add trigger descriptions to remaining skills (#2375)
  - Decompose monorepo-patterns (#2374)
  - Skill overlap audit (#2372)
  - Remove twitch integration
  - Remove twitch integration
  - Remove twitch integration

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.50.0

## 0.49.0

### Minor Changes

- ### Features
  - add discord reaction endpoint and conditional discord loading (#2362)
  - add discord reaction endpoint and conditional discord loading (#2362)
  - add discord reaction endpoint and conditional discord loading (#2362)
  - add recentEscalations and recentLogErrors to sitrep
  - add recentEscalations and recentLogErrors to sitrep

  ### Bug Fixes
  - null phase model value crashes settings endpoint (#2358)
  - reset stale feature state on staging deploy restart (#2353)
  - null phase model value crashes settings endpoint (#2358)
  - reset stale feature state on staging deploy restart (#2353)
  - null phase model value crashes settings endpoint (#2358)
  - reset stale feature state on staging deploy restart (#2353)

  ### Refactors
  - Remove twitch integration
  - Remove twitch integration
  - Remove twitch integration

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.49.0

## 0.48.0

### Minor Changes

- ### Features
  - add recentEscalations and recentLogErrors to sitrep
  - add recentEscalations and recentLogErrors to sitrep
  - move runtime state files from .automaker/ to DATA_DIR (#2346)
  - Notes as CRDT domain — dual-write with disk fallback (#2340)
  - add Notes as CRDT domain (#2338)
  - move runtime state files from .automaker/ to DATA_DIR (#2346)
  - Notes as CRDT domain — dual-write with disk fallback (#2340)
  - add Notes as CRDT domain (#2338)
  - add projectSlug filter to get_sitrep and get_board_summary
  - extend MetricsDocument with memoryStats for hivemind-wide memory file scoring (#2337)
  - add categories:updated CRDT sync via event bridge (#2336)
  - align ProjectDocument schema with full Project type (#2332)
  - remove vestigial hive config — replace with protolab/hivemind instanceId resolution (#2330)
  - add projectSlug filter to get_sitrep and get_board_summary
  - extend MetricsDocument with memoryStats for hivemind-wide memory file scoring (#2337)
  - add categories:updated CRDT sync via event bridge (#2336)
  - align ProjectDocument schema with full Project type (#2332)
  - remove vestigial hive config — replace with protolab/hivemind instanceId resolution (#2330)
  - expose category field in create_feature and update_feature MCP tools
  - expose category field in create_feature and update_feature MCP tools
  - wire tool profiles into execution pipeline (#2313)
  - auto-create PR after uncommitted work recovery (#2300)
  - wire tool profiles into execution pipeline (#2313)
  - auto-create PR after uncommitted work recovery (#2300)
  - replace inline project form with dialog including color and priority
  - replace inline project form with dialog including color and priority

  ### Bug Fixes
  - null phase model value crashes settings endpoint (#2358)
  - reset stale feature state on staging deploy restart (#2353)
  - null phase model value crashes settings endpoint (#2358)
  - reset stale feature state on staging deploy restart (#2353)
  - replace pre-flight git rebase with git merge to prevent parallel agent conflicts (#2351)
  - replace pre-flight git rebase with git merge to prevent parallel agent conflicts (#2351)
  - align test mocks with runtime state extraction and notes hydration (#2348)
  - block feature execution when pre-flight rebase detects merge conflicts (#2343)
  - handle directory entries in nested worktree recovery
  - align test mocks with runtime state extraction and notes hydration (#2348)
  - block feature execution when pre-flight rebase detects merge conflicts (#2343)
  - handle directory entries in nested worktree recovery
  - export CadenceConfig from @protolabsai/types barrel
  - resolve get_server_logs log path via server api, not monorepo root (#2333)
  - fall back to dev when epic branch doesn't exist on remote
  - export CadenceConfig from @protolabsai/types barrel
  - resolve get_server_logs log path via server api, not monorepo root (#2333)
  - fall back to dev when epic branch doesn't exist on remote
  - auto-mode concurrency race from premature startingFeatures timeout (#2327)
  - auto-mode concurrency race from premature startingFeatures timeout (#2327)
  - discord bot silent failure from env var mismatch (#2325)
  - discord bot silent failure from env var mismatch (#2325)
  - remove flaky AtomicWriter log assertion from feature-loader test
  - update feature-loader test for AtomicWriter cooldown cache
  - remove flaky AtomicWriter log assertion from feature-loader test
  - update feature-loader test for AtomicWriter cooldown cache
  - remove PORT=3009 override from \_dev:server script
  - remove PORT=3009 override from \_dev:server script
  - split server tsconfig for tsx dev vs tsc build
  - split server tsconfig for tsx dev vs tsc build

  ### Refactors
  - Upgrade @automerge packages to latest 3.x (#2347)
  - Fill CRDTStore test gaps (#2345)
  - Upgrade @automerge packages to latest 3.x (#2347)
  - Fill CRDTStore test gaps (#2345)
  - Fix updatePhaseClaim and saveProjectMilestones to broadcast to peers (#2334)
  - remove dead crdt:remote-changes event and rename CrdtFeatureEvent (#2331)
  - remove dead code from AutomergeFeatureStore (#2329)
  - Fix updatePhaseClaim and saveProjectMilestones to broadcast to peers (#2334)
  - remove dead crdt:remote-changes event and rename CrdtFeatureEvent (#2331)
  - remove dead code from AutomergeFeatureStore (#2329)
  - Update docs after: Open SWE Lessons: Agent Execution Hardening (#2318)
  - Update docs after: Open SWE Lessons: Agent Execution Hardening (#2318)
  - CRDT sync: suppress log spam for features without backing feature.json (#2315)
  - Post-execution middleware: recover work from nested Claude worktrees (#2314)
  - Per-phase temperature routing (#2312)
  - Update docs after: Open SWE Lessons: Agent Execution Hardening (#2310)
  - Message queue middleware with inject-clear pattern (#2306)
  - Refactor execution-service prompts to use PromptBuilder (#2304)
  - Tool error wrapper in provider layer (#2303)
  - CRDT sync: suppress log spam for features without backing feature.json (#2315)
  - Post-execution middleware: recover work from nested Claude worktrees (#2314)
  - Per-phase temperature routing (#2312)
  - Update docs after: Open SWE Lessons: Agent Execution Hardening (#2310)
  - Message queue middleware with inject-clear pattern (#2306)
  - Refactor execution-service prompts to use PromptBuilder (#2304)
  - Tool error wrapper in provider layer (#2303)
  - slash command dropdown with category grouping
  - slash command dropdown with category grouping

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.48.0

## 0.47.0

### Minor Changes

- ### Features
  - move runtime state files from .automaker/ to DATA_DIR (#2346)
  - Notes as CRDT domain — dual-write with disk fallback (#2340)
  - add Notes as CRDT domain (#2338)
  - move runtime state files from .automaker/ to DATA_DIR (#2346)
  - Notes as CRDT domain — dual-write with disk fallback (#2340)
  - add Notes as CRDT domain (#2338)
  - add projectSlug filter to get_sitrep and get_board_summary
  - extend MetricsDocument with memoryStats for hivemind-wide memory file scoring (#2337)
  - add categories:updated CRDT sync via event bridge (#2336)
  - align ProjectDocument schema with full Project type (#2332)
  - remove vestigial hive config — replace with protolab/hivemind instanceId resolution (#2330)
  - add projectSlug filter to get_sitrep and get_board_summary
  - extend MetricsDocument with memoryStats for hivemind-wide memory file scoring (#2337)
  - add categories:updated CRDT sync via event bridge (#2336)
  - align ProjectDocument schema with full Project type (#2332)
  - remove vestigial hive config — replace with protolab/hivemind instanceId resolution (#2330)
  - expose category field in create_feature and update_feature MCP tools
  - expose category field in create_feature and update_feature MCP tools
  - wire tool profiles into execution pipeline (#2313)
  - auto-create PR after uncommitted work recovery (#2300)
  - wire tool profiles into execution pipeline (#2313)
  - auto-create PR after uncommitted work recovery (#2300)
  - replace inline project form with dialog including color and priority
  - replace inline project form with dialog including color and priority

  ### Bug Fixes
  - replace pre-flight git rebase with git merge to prevent parallel agent conflicts (#2351)
  - replace pre-flight git rebase with git merge to prevent parallel agent conflicts (#2351)
  - align test mocks with runtime state extraction and notes hydration (#2348)
  - block feature execution when pre-flight rebase detects merge conflicts (#2343)
  - handle directory entries in nested worktree recovery
  - align test mocks with runtime state extraction and notes hydration (#2348)
  - block feature execution when pre-flight rebase detects merge conflicts (#2343)
  - handle directory entries in nested worktree recovery
  - export CadenceConfig from @protolabsai/types barrel
  - resolve get_server_logs log path via server api, not monorepo root (#2333)
  - fall back to dev when epic branch doesn't exist on remote
  - export CadenceConfig from @protolabsai/types barrel
  - resolve get_server_logs log path via server api, not monorepo root (#2333)
  - fall back to dev when epic branch doesn't exist on remote
  - auto-mode concurrency race from premature startingFeatures timeout (#2327)
  - auto-mode concurrency race from premature startingFeatures timeout (#2327)
  - discord bot silent failure from env var mismatch (#2325)
  - discord bot silent failure from env var mismatch (#2325)
  - remove flaky AtomicWriter log assertion from feature-loader test
  - update feature-loader test for AtomicWriter cooldown cache
  - remove flaky AtomicWriter log assertion from feature-loader test
  - update feature-loader test for AtomicWriter cooldown cache
  - remove PORT=3009 override from \_dev:server script
  - remove PORT=3009 override from \_dev:server script
  - split server tsconfig for tsx dev vs tsc build
  - split server tsconfig for tsx dev vs tsc build

  ### Refactors
  - Upgrade @automerge packages to latest 3.x (#2347)
  - Fill CRDTStore test gaps (#2345)
  - Upgrade @automerge packages to latest 3.x (#2347)
  - Fill CRDTStore test gaps (#2345)
  - Fix updatePhaseClaim and saveProjectMilestones to broadcast to peers (#2334)
  - remove dead crdt:remote-changes event and rename CrdtFeatureEvent (#2331)
  - remove dead code from AutomergeFeatureStore (#2329)
  - Fix updatePhaseClaim and saveProjectMilestones to broadcast to peers (#2334)
  - remove dead crdt:remote-changes event and rename CrdtFeatureEvent (#2331)
  - remove dead code from AutomergeFeatureStore (#2329)
  - Update docs after: Open SWE Lessons: Agent Execution Hardening (#2318)
  - Update docs after: Open SWE Lessons: Agent Execution Hardening (#2318)
  - CRDT sync: suppress log spam for features without backing feature.json (#2315)
  - Post-execution middleware: recover work from nested Claude worktrees (#2314)
  - Per-phase temperature routing (#2312)
  - Update docs after: Open SWE Lessons: Agent Execution Hardening (#2310)
  - Message queue middleware with inject-clear pattern (#2306)
  - Refactor execution-service prompts to use PromptBuilder (#2304)
  - Tool error wrapper in provider layer (#2303)
  - CRDT sync: suppress log spam for features without backing feature.json (#2315)
  - Post-execution middleware: recover work from nested Claude worktrees (#2314)
  - Per-phase temperature routing (#2312)
  - Update docs after: Open SWE Lessons: Agent Execution Hardening (#2310)
  - Message queue middleware with inject-clear pattern (#2306)
  - Refactor execution-service prompts to use PromptBuilder (#2304)
  - Tool error wrapper in provider layer (#2303)
  - slash command dropdown with category grouping
  - slash command dropdown with category grouping

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.47.0

## 0.46.0

### Minor Changes

- ### Features
  - replace inline project form with dialog including color and priority
  - replace inline project form with dialog including color and priority

  ### Bug Fixes
  - remove PORT=3009 override from \_dev:server script
  - remove PORT=3009 override from \_dev:server script
  - split server tsconfig for tsx dev vs tsc build
  - split server tsconfig for tsx dev vs tsc build

  ### Refactors
  - slash command dropdown with category grouping
  - slash command dropdown with category grouping

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.46.0

## 0.45.0

### Minor Changes

- ### Features
  - replace inline project form with dialog including color and priority
  - replace inline project form with dialog including color and priority

  ### Bug Fixes
  - split server tsconfig for tsx dev vs tsc build
  - split server tsconfig for tsx dev vs tsc build

  ### Refactors
  - slash command dropdown with category grouping
  - slash command dropdown with category grouping

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.45.0

## 0.44.1

### Patch Changes

- ### Refactors
  - slash command dropdown with category grouping
  - slash command dropdown with category grouping
- Updated dependencies
  - @protolabsai/types@0.44.1

## 0.44.0

### Minor Changes

- ### Features
  - redesign Ava chat footer + add thinking effort toggle
  - wire SlashCommandDropdown into ChatInput with command mode visual indicator (#2268)
  - add SubagentBlock component for subagent visibility in chat (#2256)
  - redesign Ava chat footer + add thinking effort toggle
  - redesign Ava chat footer + add thinking effort toggle
  - wire SlashCommandDropdown into ChatInput with command mode visual indicator (#2268)
  - wire SlashCommandDropdown into ChatInput with command mode visual indicator (#2268)
  - add SubagentBlock component for subagent visibility in chat (#2256)
  - add SubagentBlock component for subagent visibility in chat (#2256)

  ### Bug Fixes
  - resolve TypeScript DTS build error in CRDT store
  - prevent CRDT store crash on headless server shutdown
  - resolve TypeScript DTS build error in CRDT store
  - prevent CRDT store crash on headless server shutdown
  - resolve TypeScript DTS build error in CRDT store
  - respect user scroll position when streaming ends
  - pm chat opens to correct project instead of first in list
  - close slash command dropdown after selection
  - restore vite proxy target to localhost:3008
  - prevent CRDT store crash on headless server shutdown
  - respect user scroll position when streaming ends
  - pm chat opens to correct project instead of first in list
  - respect user scroll position when streaming ends
  - pm chat opens to correct project instead of first in list
  - close slash command dropdown after selection
  - close slash command dropdown after selection
  - restore vite proxy target to localhost:3008
  - restore vite proxy target to localhost:3008

  ### Refactors
  - System Improvement: recurring merge_conflict failures (#2262)
  - Command Discovery API Endpoint (#2254)
  - Bug: Project create route bypasses CRDT, causes getProject to return nul (#2250)
  - System Improvement: recurring merge_conflict failures (#2262)
  - System Improvement: recurring merge_conflict failures (#2262)
  - Command Discovery API Endpoint (#2254)
  - Bug: Project create route bypasses CRDT, causes getProject to return nul (#2250)
  - Command Discovery API Endpoint (#2254)
  - Bug: Project create route bypasses CRDT, causes getProject to return nul (#2250)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.44.0

## 0.43.0

### Minor Changes

- ### Features
  - expose epicId on update_feature MCP tool
  - expose epicId on update_feature MCP tool
  - le pre-flight commits .automaker/ drift before worktree rebase
  - le pre-flight commits .automaker/ drift before worktree rebase
  - fix AI credential resolution, wire project timeline, add cancelled status
  - fix AI credential resolution, wire project timeline, add cancelled status
  - implement PMWorldStateBuilder with layered world state (#2199)
  - implement PMWorldStateBuilder with layered world state (#2199)
  - add project assignment types and createdByInstance field (#2178)
  - add project assignment types and createdByInstance field (#2178)
  - add lazy feature lookup to world state event handler (#2176)
  - add PR merge poller to Lead Engineer service
  - persist prMergedAt and completedAt in MergeProcessor (#2170) (#2172)
  - wire AuthorityService.executeAction() into lead-engineer action execution path (#2165)
  - add lazy feature lookup to world state event handler (#2176)
  - add PR merge poller to Lead Engineer service
  - add PR merge poller to Lead Engineer service
  - persist prMergedAt and completedAt in MergeProcessor (#2170) (#2172)
  - wire AuthorityService.executeAction() into lead-engineer action execution path (#2165)
  - implement authority enforcement with audit trail
  - add execution gate to ExecuteProcessor with review/error/CI checks (#2158)
  - implement portfolio gate for signal intake evaluation (#2156)
  - implement authority enforcement with audit trail
  - implement authority enforcement with audit trail
  - add execution gate to ExecuteProcessor with review/error/CI checks (#2158)
  - implement portfolio gate for signal intake evaluation (#2156)
  - implement Error Budget System with rolling window tracking (#2150)
  - implement Error Budget System with rolling window tracking (#2150)
  - implement reconciliation service actuators (#2133)
  - implement reconciliation service actuators (#2133)
  - add local build target scripts (dev:headless, legless:dir, preview:web)
  - add local build target scripts (dev:headless, legless:dir, preview:web)
  - add instance name indicator + quick-switch dropdown to bottom panel
  - add instance name indicator + quick-switch dropdown to bottom panel
  - add instance name indicator + quick-switch dropdown to bottom panel
  - update Ava system prompt for delegation model (#2112)
  - slim Ava default tool groups for delegation model (#2111)
  - update Ava system prompt for delegation model (#2112)
  - slim Ava default tool groups for delegation model (#2111)
  - pm chat in ava overlay + markdown spacing polish
  - convert changelog Discord output to rich embeds
  - convert changelog Discord output to rich embeds
  - pm chat in ava overlay + markdown spacing polish
  - wire WorkIntakeService into auto-mode lifecycle (#2090)
  - wire WorkIntakeService into auto-mode lifecycle (#2089)
  - wire WorkIntakeService into auto-mode lifecycle (#2088)
  - wire WorkIntakeService into auto-mode lifecycle (#2087)
  - wire WorkIntakeService into auto-mode lifecycle (#2090)
  - wire WorkIntakeService into auto-mode lifecycle (#2089)
  - wire WorkIntakeService into auto-mode lifecycle (#2088)
  - wire WorkIntakeService into auto-mode lifecycle (#2087)
  - wire WorkIntakeService into auto-mode lifecycle
  - wire WorkIntakeService into auto-mode lifecycle
  - discord embeds for notifications + ava channel intent/expectsResponse
  - discord embeds for notifications + ava channel intent/expectsResponse
  - add SitrepCard and HealthCheckCard tool result renderers
  - add project status dropdown and fix update route (#2066)
  - add project status dropdown and fix update route
  - add SitrepCard and HealthCheckCard tool result renderers
  - add project status dropdown and fix update route (#2066)
  - add project status dropdown and fix update route
  - convert changelog Discord output to rich embeds
  - convert changelog Discord output to rich embeds
  - convert changelog Discord output to rich embeds
  - cascade rebase open PRs after merge to prevent conflicts
  - cascade rebase open PRs after merge to prevent conflicts
  - add ceremony action executor for retro-to-action processing (#2050)
  - add cumulative flow diagram and WIP trends to dashboard (#2049)
  - add approval queue consumer and trust enforcement (#2048)
  - add scheduled Ava sessions and calendar bridge (#2047)
  - add stage duration API and cycle time breakdown chart (#2046)
  - add protocol message filtering for Ava channel (#2045)
  - add rollback_feature MCP tool and rollbackTriggered circuit breaker (#2044)
  - add DORA trends dashboard with time-bucketed history endpoint (#2043)
  - add ReactiveSpawnerService with budget controls and circuit breakers (#2039)
  - add DORA KPI cards and useDora React Query hook (#2037)
  - add success criteria, kill conditions, hypothesis, and customer context to Feature type (#2035)
  - add 5 new Ava chat tool groups (#2030)
  - add missing tools to Ava chat - foundation & existing group completions (#2029)
  - add ceremony action executor for retro-to-action processing (#2050)
  - add cumulative flow diagram and WIP trends to dashboard (#2049)
  - add approval queue consumer and trust enforcement (#2048)
  - add scheduled Ava sessions and calendar bridge (#2047)
  - add stage duration API and cycle time breakdown chart (#2046)
  - add protocol message filtering for Ava channel (#2045)
  - add rollback_feature MCP tool and rollbackTriggered circuit breaker (#2044)
  - add DORA trends dashboard with time-bucketed history endpoint (#2043)
  - add ReactiveSpawnerService with budget controls and circuit breakers (#2039)
  - add DORA KPI cards and useDora React Query hook (#2037)
  - add success criteria, kill conditions, hypothesis, and customer context to Feature type (#2035)
  - add 5 new Ava chat tool groups (#2030)
  - rename Ava Channel tab to #backchannel
  - add missing tools to Ava chat - foundation & existing group completions (#2029)
  - capacity advertising and work-steal protocol (#2020)
  - capacity advertising and work-steal protocol (#2020)
  - rename Ava Channel tab to #backchannel
  - unify CRDT sync across all domains — wire CRDTStore into server lifecycle (#2017)
  - unify CRDT sync across all domains — wire CRDTStore into server lifecycle (#2017)
  - add friction tracking for reactor self-improvement (#2008)
  - add response handlers for Ava channel reactor (#2007)
  - add AvaChannelReactorService — core orchestrator for reactive channel (#2006)
  - add rule-based message classifier chain for Ava channel reactor (#2005)
  - extend AvaChatMessage with reactive protocol fields
  - add friction tracking for reactor self-improvement (#2008)
  - add response handlers for Ava channel reactor (#2007)
  - add AvaChannelReactorService — core orchestrator for reactive channel (#2006)
  - add rule-based message classifier chain for Ava channel reactor (#2005)
  - add friction tracking for reactor self-improvement (#2008)
  - add response handlers for Ava channel reactor (#2007)
  - add AvaChannelReactorService — core orchestrator for reactive channel (#2006)
  - add rule-based message classifier chain for Ava channel reactor (#2005)
  - extend AvaChatMessage with reactive protocol fields
  - extend AvaChatMessage with reactive protocol fields
  - wire Ava Channel CRDT sync for cross-instance coordination (#2004)
  - add DORA metrics collection and API (#2003)
  - update Ava skill for channel awareness (#2001)
  - auto-create System Improvements project on startup (#2002)
  - wire EventBus into Ava Channel auto-posts (#2000)
  - wire Ava Channel CRDT sync for cross-instance coordination (#2004)
  - add DORA metrics collection and API (#2003)
  - update Ava skill for channel awareness (#2001)
  - auto-create System Improvements project on startup (#2002)
  - wire EventBus into Ava Channel auto-posts (#2000)
  - live UI updates for CRDT mesh feature sync (#1999)
  - live UI updates for CRDT mesh feature sync (#1999)
  - add Discord channel message MCP tools
  - add Discord channel message MCP tools
  - add Discord channel message MCP tools
  - add Discord channel message MCP tools
  - add Discord channel message MCP tools
  - add private Ava channel MCP tools and server routes (#1990)
  - cross-instance assignment - board instance badges and peers panel (#1984)
  - add private Ava channel MCP tools and server routes (#1990)
  - cross-instance assignment - board instance badges and peers panel (#1984)
  - add AvaChannelService and types for multi-instance communication
  - add AvaChannelService and types for multi-instance communication
  - activate CRDT sync infrastructure and wire work-stealing
  - activate CRDT sync infrastructure and wire work-stealing
  - worktree git exclude for .automaker/features/
  - Project Sync — CRDT-backed ProjectService (#1967)
  - per-project Discord webhook settings UI (#1966)
  - Project Sync — CRDT-backed ProjectService (#1967)
  - per-project Discord webhook settings UI (#1966)
  - AutomergeFeatureStore — in-memory CRDT-backed feature store (#1961)
  - extract scripts from research for proto.config.yaml generation

  ### Bug Fixes
  - resolve Claude CLI OAuth for @ai-sdk/anthropic chat routes
  - resolve Claude CLI OAuth for @ai-sdk/anthropic chat routes
  - restore lockfile with cross-platform esbuild metadata
  - regenerate lockfile with turbo platform metadata
  - release script now inspects merge commits for feat: prefixes
  - restore lockfile with cross-platform esbuild metadata
  - regenerate lockfile with turbo platform metadata
  - release script now inspects merge commits for feat: prefixes
  - replace hardcoded paths in agent context with repo-agnostic placeholders
  - resolve AgentDefinition model aliases via SDK-native alias pattern (#2213)
  - replace hardcoded paths in agent context with repo-agnostic placeholders
  - resolve AgentDefinition model aliases via SDK-native alias pattern (#2213)
  - resolve agent model aliases before SDK calls (#2209)
  - resolve agent model aliases before SDK calls (#2209)
  - stabilize flaky auto-mode error handling test
  - update timeline test for TimelineEvent response format
  - auto-stash unstaged changes before worktree rebase + memory updates
  - stabilize flaky auto-mode error handling test
  - update timeline test for TimelineEvent response format
  - auto-stash unstaged changes before worktree rebase + memory updates
  - exclude lead-engineer:rule-evaluated from onEvent subscriber to prevent stack overflow (#2194)
  - exclude lead-engineer:rule-evaluated from onEvent subscriber to prevent stack overflow (#2194)
  - add worktree write guard + fix flaky CI tests
  - allow create_project to overwrite stub projects from initiate_project
  - add external merge detection to Lead Engineer REVIEW state
  - add worktree write guard + fix flaky CI tests
  - allow create_project to overwrite stub projects from initiate_project
  - add external merge detection to Lead Engineer REVIEW state
  - add external merge detection to Lead Engineer REVIEW state
  - repair extractTitleFromDescription test failures
  - use importOriginal in execution-service test git-utils mock
  - add format-time subpath export to avoid Vite fs/promises bundling error
  - resolve 3 typecheck errors blocking CI
  - explicitly set pathToClaudeCodeExecutable in SDK options
  - correct HITLFormStep schema in reconciliation service
  - delete orphaned project-planning test file from dev
  - repair extractTitleFromDescription test failures
  - use importOriginal in execution-service test git-utils mock
  - add format-time subpath export to avoid Vite fs/promises bundling error
  - resolve 3 typecheck errors blocking CI
  - explicitly set pathToClaudeCodeExecutable in SDK options
  - correct HITLFormStep schema in reconciliation service
  - delete orphaned project-planning test file from dev
  - test cooldown awareness and prettier formatting for ci
  - address CodeRabbit review findings
  - prevent ECONNREFUSED crash during CRDT shutdown
  - add missing getPickupCooldownMs method for auto-mode creation cooldown
  - resolve 7 bugs — HITL fixes, CRDT flaky test, stale resume trap, false auto-verify
  - broadcast chat:user-input-request event to reach WebSocket clients (#2125)
  - test cooldown awareness and prettier formatting for ci
  - address CodeRabbit review findings
  - prevent ECONNREFUSED crash during CRDT shutdown
  - add missing getPickupCooldownMs method for auto-mode creation cooldown
  - resolve 7 bugs — HITL fixes, CRDT flaky test, stale resume trap, false auto-verify
  - broadcast chat:user-input-request event to reach WebSocket clients (#2125)
  - copy .md assets to dist/ during server build to prevent staging crash
  - copy .md assets to dist/ during server build to prevent staging crash
  - make worktree fallback fatal instead of silent
  - make worktree fallback fatal instead of silent
  - prevent WorkIntakeService from creating duplicate features
  - align timeline test with implementation — Trophy icon, Milestone label
  - prevent WorkIntakeService from creating duplicate features
  - align timeline test with implementation — Trophy icon, Milestone label
  - add auth headers to chat transports and wire codex models endpoint
  - add auth headers to chat transports and wire codex models endpoint
  - render Ava Channel messages with markdown for clickable links
  - render Ava Channel messages with markdown for clickable links
  - update reactive-spawner test to match current log format
  - update reactive-spawner test to match current log format
  - remove foreign-feature check from Lead Engineer IntakeProcessor
  - scope CRDT feature sync by project name to prevent cross-project contamination
  - remove foreign-feature check from Lead Engineer IntakeProcessor
  - scope CRDT feature sync by project name to prevent cross-project contamination
  - update classifier tests for PeerAvaMessageRule and scope audit to production deps
  - update classifier tests for PeerAvaMessageRule and scope audit to production deps
  - reduce Discord #dev noise — suppress per-feature and duplicate milestone notifications
  - reduce Discord #dev noise — suppress per-feature and duplicate milestone notifications
  - project features tab — fix Zod Symbol key validation and add expandable detail rows
  - project features tab — fix Zod Symbol key validation and add expandable detail rows
  - gate CodeBlock syntax highlighting behind isStreaming + project cleanup
  - gate CodeBlock syntax highlighting behind isStreaming + project cleanup
  - add auth headers to chat transports and wire codex models endpoint
  - suppress async WebSocket error during CRDT store shutdown
  - exclude epics from work-stealing and fleet scheduling (#2031)
  - add role=tab to chat overlay tab buttons for a11y (#2028)
  - suppress async WebSocket error during CRDT store shutdown
  - exclude epics from work-stealing and fleet scheduling (#2031)
  - add registry sync to resolve CRDTStore split-brain across instances
  - replace deprecated docSync() with doc() across entire codebase
  - restore date field on AvaChannelDocument and Array.isArray guard
  - add role=tab to chat overlay tab buttons for a11y (#2028)
  - add registry sync to resolve CRDTStore split-brain across instances
  - replace deprecated docSync() with doc() across entire codebase
  - use millisecond arithmetic for stale validation tests
  - use millisecond arithmetic for stale validation tests
  - use millisecond arithmetic for stale validation tests
  - filter stub directories in listProjectPlans
  - filter stub directories in listProjectPlans
  - filter stub directories in listProjectPlans
  - restore Calendar and Todos CRDT document definitions dropped by PR #1995
  - restore date field on AvaChannelDocument and Array.isArray guard
  - restore Calendar and Todos CRDT document definitions dropped by PR #1995
  - register hivemind routes and update mesh docs
  - pass crdtSyncService to detailed health handler
  - pass crdtSyncService to detailed health handler
  - update AvaChannelService test constructor calls to match new signature (#1989)
  - update AvaChannelService test constructor calls to match new signature (#1989)
  - remove dead AvaChatMessage import from crdt-sync-service
  - remove merge conflict markers from 17 archived feature.json files
  - remove dead AvaChatMessage import from crdt-sync-service
  - remap remote projectPath to local repoRoot in CRDT sync receiver
  - remap remote projectPath to local repoRoot in CRDT sync receiver
  - remap remote projectPath to local repoRoot in CRDT sync receiver
  - remove merge conflict markers from 17 archived feature.json files
  - remap remote projectPath to local repoRoot in CRDT sync receiver
  - remap remote projectPath to local repoRoot in CRDT sync receiver
  - add WorkStealingService to ServiceContainer interface
  - align report UI types and test mocks with broadcast() migration
  - backport CRDT mesh event sync from staging
  - align Studio Mesh config key and fix report UI type mismatch
  - add WorkStealingService to ServiceContainer interface
  - align report UI types and test mocks with broadcast() migration
  - wire CRDT mesh event sync for cross-instance feature propagation
  - backport CRDT mesh event sync from staging
  - wire CRDT mesh event sync for cross-instance feature propagation
  - align Studio Mesh config key and fix report UI type mismatch
  - align changelog-artifact test assertions with service implementation
  - remove stale settingsService arg from completion-detector tests
  - align changelog-artifact test assertions with service implementation
  - remove stale settingsService arg from completion-detector tests
  - changelog-artifact tests match staging API
  - use poll-based assertions for async cascade tests
  - ci failures for formatting and test stability
  - use poll-based assertions for async cascade tests
  - ci failures for formatting and test stability
  - increase completion-detector test timeouts for CI stability

  ### Refactors
  - move version bump to staging branch (eliminate sync-back conflicts)
  - move version bump to staging branch (eliminate sync-back conflicts)
  - Unit tests for CalendarService and JobExecutorService (#2226)
  - Rewrite calendar-assistant skill for SDK-native patterns (#2224)
  - Google Calendar cancelled event cleanup and periodic sync (#2223)
  - Ceremony-to-calendar integration (#2222)
  - WebSocket broadcast for calendar mutations and job lifecycle (#2221)
  - Wire emitReminder() into JobExecutorService (#2219)
  - Bug: Agents skip prettier formatting before commit (#2218)
  - Server URL override in auth layer + app store (#2217)
  - Fix shell injection in run-command job actions (#2216)
  - Fix CRDT project scoping for calendar documents (#2215)
  - Improve: chunk ID uniqueness and input validation in knowledge store (#2214)
  - Fix MCP enum mismatch and ID prefix inconsistency (#2212)
  - Fix: preFlightChecks missing from settings merge logic (#2208)
  - LE Knowledge Indexing (#2207)
  - Unit tests for CalendarService and JobExecutorService (#2226)
  - Rewrite calendar-assistant skill for SDK-native patterns (#2224)
  - Google Calendar cancelled event cleanup and periodic sync (#2223)
  - Ceremony-to-calendar integration (#2222)
  - WebSocket broadcast for calendar mutations and job lifecycle (#2221)
  - Wire emitReminder() into JobExecutorService (#2219)
  - Bug: Agents skip prettier formatting before commit (#2218)
  - Server URL override in auth layer + app store (#2217)
  - Fix shell injection in run-command job actions (#2216)
  - Fix CRDT project scoping for calendar documents (#2215)
  - Improve: chunk ID uniqueness and input validation in knowledge store (#2214)
  - Fix MCP enum mismatch and ID prefix inconsistency (#2212)
  - Fix: preFlightChecks missing from settings merge logic (#2208)
  - LE Knowledge Indexing (#2207)
  - System Improvement: recurring merge_conflict failures (#2204)
  - System Improvement: recurring merge_conflict failures (#2204)
  - Ava World State Builder (#2201)
  - Replace DynamicAgentExecutor with SDK query() (#2200)
  - Change dev server default port to avoid collision with Docker container (#2197)
  - Three-Layer World State Types (#2193)
  - Simplify escalation to project-level (#2192)
  - Auto-rebuild headless server on dev branch changes (#2191)
  - Bug: Multiple agents writing to main repo despite worktree isolation (P1 (#2190)
  - Add auto-failover timer to ProjectAssignmentService (#2184)
  - Ava World State Builder (#2201)
  - Replace DynamicAgentExecutor with SDK query() (#2200)
  - Change dev server default port to avoid collision with Docker container (#2197)
  - Three-Layer World State Types (#2193)
  - Simplify escalation to project-level (#2192)
  - Auto-rebuild headless server on dev branch changes (#2191)
  - Bug: Multiple agents writing to main repo despite worktree isolation (P1 (#2190)
  - Add auto-failover timer to ProjectAssignmentService (#2184)
  - Update feature selection to be project-scoped (#2182)
  - Remove FleetSchedulerService and work-stealing (#2181)
  - restrict Ava/headsdown to monitor-only — no code editing
  - Update feature selection to be project-scoped (#2182)
  - Remove FleetSchedulerService and work-stealing (#2181)
  - restrict Ava/headsdown to monitor-only — no code editing
  - Polish server URL section in Developer Settings (#2174)
  - Convert bottom-panel ticker to hover popover with network stats (#2171)
  - Add error budget auto-freeze to AutoModeService (#2169)
  - Remove PeersPanel and All/Mine tabs from board view (#2168)
  - Polish server URL section in Developer Settings (#2174)
  - Convert bottom-panel ticker to hover popover with network stats (#2171)
  - Add error budget auto-freeze to AutoModeService (#2169)
  - Remove PeersPanel and All/Mine tabs from board view (#2168)
  - Server URL override in auth layer + app store (#2157)
  - Aggregate milestone-level facts on milestone completion (#2155)
  - Server URL override in auth layer + app store (#2157)
  - Aggregate milestone-level facts on milestone completion (#2155)
  - Add agentic metrics to collection service (#2149)
  - Add PR size check to git-workflow-service (#2148)
  - Clean up dead events and EventType gaps (#2147)
  - Add review queue depth tracking and auto-pause rule (#2146)
  - Add agentic metrics to collection service (#2149)
  - Add PR size check to git-workflow-service (#2148)
  - Clean up dead events and EventType gaps (#2147)
  - Add review queue depth tracking and auto-pause rule (#2146)
  - Remove @ts-nocheck from board view files (#2144)
  - Remove research flow stubs and clean up console.log (#2141)
  - Consolidate formatDuration, formatTimestamp, and formatElapsed (#2139)
  - Add pre-flight checklist to ExecuteProcessor (#2137)
  - Deduplicate antagonistic review interfaces and inline logic (#2136)
  - Extract shared git exec environment and extractTitleFromDescription (#2135)
  - Remove dead feature creation path and unused types (#2134)
  - Add post-merge verification step to DeployProcessor (#2132)
  - Wire ceremony retro outputs to board and rules engine (#2131)
  - Remove dead PRDService and LangGraph planning flow (#2130)
  - Remove @ts-nocheck from board view files (#2144)
  - Remove research flow stubs and clean up console.log (#2141)
  - Consolidate formatDuration, formatTimestamp, and formatElapsed (#2139)
  - Add pre-flight checklist to ExecuteProcessor (#2137)
  - Deduplicate antagonistic review interfaces and inline logic (#2136)
  - Extract shared git exec environment and extractTitleFromDescription (#2135)
  - Remove dead feature creation path and unused types (#2134)
  - Add post-merge verification step to DeployProcessor (#2132)
  - Wire ceremony retro outputs to board and rules engine (#2131)
  - Remove dead PRDService and LangGraph planning flow (#2130)
  - route failure bugs to in-app board instead of GitHub Issues
  - route failure bugs to in-app board instead of GitHub Issues
  - Server URL override in auth layer + app store (#2122)
  - Server URL override in auth layer + app store (#2122)
  - Hivemind instance auto-discovery in server picker (#2118)
  - Instance name indicator + quick toggle in bottom panel
  - Server Connection section in Developer Settings (#2116)
  - Instance name indicator + quick toggle in bottom panel
  - Hivemind instance auto-discovery in server picker (#2118)
  - Instance name indicator + quick toggle in bottom panel
  - Server Connection section in Developer Settings (#2116)
  - Timeline UI in project detail (#2109)
  - Server URL override in auth layer + app store (#2108)
  - PM model upgrade to Sonnet (#2104)
  - Bug: Lead Engineer REVIEW loop on done features (#2103)
  - Timeline UI in project detail (#2109)
  - Server URL override in auth layer + app store (#2108)
  - PM model upgrade to Sonnet (#2104)
  - Bug: Lead Engineer REVIEW loop on done features (#2103)
  - ask_user Inline Form Tool — Server Side (#2096)
  - Auto-Expand Tool Result Cards on Completion (#2095)
  - ask_user Inline Form Tool — Server Side (#2096)
  - Auto-Expand Tool Result Cards on Completion (#2095)
  - replace feature CRDT sync with pull-based work intake model
  - replace feature CRDT sync with pull-based work intake model
  - Update docs after: Ava Anywhere Chat Overlay Polish (#2081)
  - Update docs after: Ava Anywhere Chat Overlay Polish (#2081)
  - CodeRabbit config (#2077)
  - GitHub Actions: security audit workflow (#2076)
  - GitHub Actions: lint + format check workflow (#2074)
  - Update docs after: Chat Render Pipeline — Rich Tool Result Cards (#2072)
  - Wire ReactiveSpawnerService into Service Container (#2073)
  - CodeRabbit config (#2077)
  - GitHub Actions: security audit workflow (#2076)
  - GitHub Actions: lint + format check workflow (#2074)
  - Update docs after: Chat Render Pipeline — Rich Tool Result Cards (#2072)
  - Wire ReactiveSpawnerService into Service Container (#2073)
  - Update docs after: Ava Anywhere Chat Overlay Polish (#2069)
  - Update docs after: Ava Anywhere Chat Overlay Polish (#2069)
  - Regenerate Button and Branch Navigator (#2061)
  - Regenerate Button and Branch Navigator (#2061)
  - Update docs after: Idea-to-Outcome Pipeline Hardening (#2054)
  - Update docs after: Reactive Nervous System (#2052)
  - System Improvement: recurring unknown failures (#2034)
  - Rewrite ava-prompt.md with Complete Tool Coverage and Domain Knowledge (#2033)
  - Update docs after: Idea-to-Outcome Pipeline Hardening (#2054)
  - Update docs after: Reactive Nervous System (#2052)
  - System Improvement: recurring unknown failures (#2034)
  - Rewrite ava-prompt.md with Complete Tool Coverage and Domain Knowledge (#2033)
  - Reactor Module + ServiceContainer Integration (#2018)
  - Reactor Module + ServiceContainer Integration (#2018)
  - Ava Channel CRDT Document and Service (rebased on dev) (#1995)
  - Ava Channel Tab in Ava Anywhere (#1996)
  - Ava Channel CRDT Document and Service (rebased on dev) (#1995)
  - Ava Channel Tab in Ava Anywhere (#1996)
  - Wire AvaChannelService into service container and startup (#1988)
  - Wire AvaChannelService into service container and startup (#1988)
  - harden SetupLab gap analysis to two-tier severity
  - consolidate project flows + rename update-plugin
  - compact briefing digest to minimize token usage
  - Instance Capacity Advertising (#1974)
  - harden SetupLab gap analysis to two-tier severity
  - consolidate project flows + rename update-plugin
  - compact briefing digest to minimize token usage
  - Instance Capacity Advertising (#1974)
  - Shared Settings Sync (#1970)
  - Shared Settings Sync (#1970)
  - EventBus CRDT Bridge (#1962)
  - Changelog persistence + escalation artifact recording (#1955)
  - proto.config Loader (#1954)
  - Add promotion-check-staging.yml CI workflow (#1947)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.43.0

## 0.42.1

### Patch Changes

- Maintenance release.
- Updated dependencies
  - @protolabsai/types@0.42.1

## 0.41.1

### Patch Changes

- ### Bug Fixes
  - resolve AgentDefinition model aliases via SDK-native alias pattern (#2213)
- Updated dependencies
  - @protolabsai/types@0.41.1

## 0.41.0

### Minor Changes

- ### Features
  - add Todo UI view with sidebar entry and keyboard shortcut (#1913)
  - add get_sitrep MCP tool for unified operational status
  - add Todo types, service, routes, and unit tests
  - e2e pipeline hardening — dedup persistence + staging CI guard

  ### Bug Fixes
  - changelog-artifact tests match staging API
  - use poll-based assertions for async cascade tests
  - ci failures for formatting and test stability
  - update tests to match refactored service signatures
  - add missing types for buildProtoConfig (scripts field, MilestoneSummary, ProjectSummary)
  - add missing buildProtoConfig function and platform proto-config exports
  - lazy-load yaml in proto-config to fix ESM/CJS crash
  - strip large stale fields from get_settings MCP response
  - prevent escalation loop by guarding dep-unblock against agent failures
  - local rebase fallback for auto-rebase maintenance task
  - enable auto-merge on all PR creation paths
  - escalate no-explicit-any to error in source files
  - gitignore .automaker-lock to stop rebase conflicts
  - format todo UI files to pass prettier check
  - mount todo routes at /api/todos to match UI client paths
  - prevent REVIEW→REVIEW self-transition loop from exhausting state machine budget
  - inbox badge shows unread count instead of pending count
  - add phaseSlug field to Feature type
  - pass milestoneSlug + phaseSlug in both project services
  - rename sidebar Content label back to Notes + update CRDT project constraints
  - set milestoneSlug on features created by orchestrateProjectFeatures (#1909)
  - auto-clear stale agent context after server shutdown (resume trap)
  - use --merge for staging promotion auto-merge to preserve DAG
  - add .automaker-lock to tsx watch ignore list
  - disable false-positive auto-mode completion Discord notification
  - bump express-rate-limit to 8.3.0 for CVE fix

  ### Refactors
  - EventLedgerService implementation (#1893)
  - Bug: Project creation pipeline missing milestone persistence step (#1886)
  - Add update_project tool to Ava UI chat surface (#1887)
  - Feature scaffolding tests (#1888)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.41.0

## 0.40.6

### Patch Changes

- Maintenance release.
- Updated dependencies
  - @protolabsai/types@0.40.6

## 0.40.5

### Patch Changes

- ### Bug Fixes
  - propagate PipelineResult outcome through FeatureScheduler
- Updated dependencies
  - @protolabsai/types@0.40.5

## 0.40.4

### Patch Changes

- ### Bug Fixes
  - fallback to feature description when plan response is too short
- Updated dependencies
  - @protolabsai/types@0.40.4

## 0.40.3

### Patch Changes

- Maintenance release.
- Updated dependencies
  - @protolabsai/types@0.40.3

## 0.40.2

### Patch Changes

- ### Bug Fixes
  - correct GitHub issue URL casing in bug report buttons
  - prevent done features from bouncing to blocked via Lead Engineer

  ### Refactors
  - remove Langfuse prompt management, keep tracing only

- Updated dependencies
  - @protolabsai/types@0.40.2

## 0.40.1

### Patch Changes

- ### Refactors
  - Server-side compaction safety net (#1863)
  - Wire providerOptions for context management (#1860)
- Updated dependencies
  - @protolabsai/types@0.40.1

## 0.40.0

### Minor Changes

- ### Features
  - wire PRWatcherService — webhook handler, Ava tool, and UI push notifications (#1854)
  - add research summary tab and project progress indicator (#1846)
  - make Ava Anywhere GA — enable avaChat flag by default

  ### Bug Fixes
  - correct build badge repo URL and Discord invite links
  - regenerate lockfile with rehype-highlight dependency (#1853)
  - regenerate lockfile with rehype-highlight dependency
  - show feature title and reason in escalation notifications
  - correct @protolabsai/ui import path in documents-tab (#1847)
  - show current context window size, not cumulative token spend
  - remove inline Step indicator from chat messages

  ### Refactors
  - Project page: add members edit UI and project color picker to sidebar (#1852)
  - remove avaChat feature flag — Ava Anywhere is now GA
  - Project page: wire PRD lifecycle actions (Approve, Request Changes, Laun (#1850)
  - Gate rehype-highlight behind isComplete + wire sanitizeStreamingMarkdown (#1849)
  - CSS streaming cursor + post-completion static render handoff (#1848)
  - useScrollLock hook — auto-scroll with user override (#1842)
  - segment memoization for long messages (5k+ tokens) (#1840)
  - sanitizeStreamingMarkdown() helper + react-markdown plugin memoization f (#1836)
  - Project page: fix getProject response type (remove `as unknown as Projec (#1835)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.40.0

## 0.39.0

### Minor Changes

- ### Features
  - replace token estimate with real usage data from AI SDK

  ### Bug Fixes
  - auto-cleanup Docker when staging disk is low
  - add @protolabsai/types dep to libs/ui and stop inlining external DTS

  ### Refactors
  - move Issues into Projects tabs, PRs into Features tabs

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.39.0

## 0.38.0

### Minor Changes

- ### Features
  - add persistent status bar to Ava chat overlay
  - add token count indicator to Ava chat overlay + board updates
  - add perf metrics logging to Ava chat route

  ### Bug Fixes
  - remove duplicate estimatedTokens declaration in chat overlay (#1828)
  - use correct AI SDK v6 usage property names (inputTokens/outputTokens)
  - make start_agent fire-and-forget in Ava chat
  - default projects view to plans tab instead of metrics
  - resolve 7 PM lifecycle bugs from QA audit

  ### Refactors
  - remove all Linear integration from codebase
  - Fix bug report button URL in quick actions (#1820)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.38.0

## 0.37.1

### Patch Changes

- Maintenance release.
- Updated dependencies
  - @protolabsai/types@0.37.1

## 0.37.0

### Minor Changes

- ### Features
  - add hover popovers to bottom panel stats + system health indicator
  - epic-grouped features tab + consolidated resources tab (#1795)
  - remove feature flags for Notes and Calendar — ship as GA
  - Health Dashboard and Failure Alerting (M4) (#1785)
  - macOS System Tray (#1783)
  - enable PWA install on staging via Tailscale HTTPS
  - gate spec editor, notes, calendar behind feature flags + fix sensors nav

  ### Bug Fixes
  - remove calendar feature flag from FeatureFlags (now GA)
  - remove calendar and notes from feature flag labels
  - remove calendar and notes from feature flag labels
  - add missing 'calendar' feature flag to FeatureFlags interface
  - tray quit sets isQuittingIntentionally, disambiguate settings label
  - remove heart percentage number, swap terminal split directions
  - bottom panel stats clickable, sync heart color with peak metric
  - terminal hooks order, shift+= new terminal, notes bubble cleanup
  - remove stale DocumentsTab/LinksTab references, wire ResourcesTab content
  - bottom panel uses live API data via useProjectHealth
  - compact metrics tab — side-by-side health + events, less padding
  - guard leadEngineerService and sanitize PR number in shell commands
  - declutter board header — remove icon, title, and usage button
  - add clickable link to open terminal from empty state
  - fix empty terminal centering and copy
  - add hint text in empty terminal panel
  - show tab bar chrome in empty terminal state
  - remove PanelHeader from terminal view
  - resolve hooks ordering violation in bottom panel
  - projectPlanExists checks project.json not directory
  - load inbox notification count eagerly in sidebar
  - make Tailscale HTTPS setup non-fatal
  - stub PWA virtual modules in Electron dev mode
  - add credentials to chat transport for session auth

  ### Refactors
  - Project Lifecycle Tools in Ava Chat (#1806)
  - shared header for projects view toggle and time range
  - remove event feed from projects metrics tab
  - Wire State Machine into CeremonyService + Scheduler (#1800)
  - comment out Send to pipeline, terminal icon-only toggle, Cmd/Alt keybind
  - Tab Consolidation + Responsive Layout (#1796)
  - move board stats to bottom panel, remove health card from metrics
  - change default landing to /projects with metrics tab
  - rename sidebar items and update keyboard shortcuts
  - reorganize sidebar — move Notes/Calendar to Tools, add Ava Chat
  - consolidate Context & Memory into board ViewToggle tabs
  - break apart stats page from board view
  - move terminal to bottom panel, add Cmd+` toggle shortcut
  - SchedulerSettings Type and Persistence Wiring (#1775) (#1776)
  - Scheduler Status Endpoint (#1771) (#1772)
  - replace bottom panel tabs with resizable terminal
  - extract FeatureScheduler from AutoModeService (#1766)
  - Migrate escalation-router and notification-router (#1760)
  - Remove legacy executeFeature fallback (#1759)
  - Add typed on() method to EventEmitter (#1756)
  - Pipeline processors emit events directly (#1755)
  - Move model selection into INTAKE (#1753)
  - Scheduler interprets PipelineResult (#1754)
  - PipelineResult type and LE return value (#1752)
  - Worktree locking: prevent cleanup while agents are active (#1751)
  - Bug: Auto-loop 'stuck in starting state' cleanup races with LE pipeline (#1750)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.37.0

## 0.36.0

### Minor Changes

- ### Features
  - add hover popovers to bottom panel stats + system health indicator
  - epic-grouped features tab + consolidated resources tab (#1795)
  - remove feature flags for Notes and Calendar — ship as GA
  - Health Dashboard and Failure Alerting (M4) (#1785)
  - macOS System Tray (#1783)
  - enable PWA install on staging via Tailscale HTTPS
  - gate spec editor, notes, calendar behind feature flags + fix sensors nav

  ### Bug Fixes
  - remove calendar and notes from feature flag labels
  - tray quit sets isQuittingIntentionally, disambiguate settings label
  - remove heart percentage number, swap terminal split directions
  - bottom panel stats clickable, sync heart color with peak metric
  - terminal hooks order, shift+= new terminal, notes bubble cleanup
  - remove stale DocumentsTab/LinksTab references, wire ResourcesTab content
  - bottom panel uses live API data via useProjectHealth
  - compact metrics tab — side-by-side health + events, less padding
  - guard leadEngineerService and sanitize PR number in shell commands
  - declutter board header — remove icon, title, and usage button
  - add clickable link to open terminal from empty state
  - fix empty terminal centering and copy
  - add hint text in empty terminal panel
  - show tab bar chrome in empty terminal state
  - remove PanelHeader from terminal view
  - resolve hooks ordering violation in bottom panel
  - projectPlanExists checks project.json not directory
  - load inbox notification count eagerly in sidebar
  - make Tailscale HTTPS setup non-fatal
  - stub PWA virtual modules in Electron dev mode
  - add credentials to chat transport for session auth

  ### Refactors
  - shared header for projects view toggle and time range
  - remove event feed from projects metrics tab
  - Wire State Machine into CeremonyService + Scheduler (#1800)
  - comment out Send to pipeline, terminal icon-only toggle, Cmd/Alt keybind
  - Tab Consolidation + Responsive Layout (#1796)
  - move board stats to bottom panel, remove health card from metrics
  - change default landing to /projects with metrics tab
  - rename sidebar items and update keyboard shortcuts
  - reorganize sidebar — move Notes/Calendar to Tools, add Ava Chat
  - consolidate Context & Memory into board ViewToggle tabs
  - break apart stats page from board view
  - move terminal to bottom panel, add Cmd+` toggle shortcut
  - SchedulerSettings Type and Persistence Wiring (#1775) (#1776)
  - Scheduler Status Endpoint (#1771) (#1772)
  - replace bottom panel tabs with resizable terminal
  - extract FeatureScheduler from AutoModeService (#1766)
  - Migrate escalation-router and notification-router (#1760)
  - Remove legacy executeFeature fallback (#1759)
  - Add typed on() method to EventEmitter (#1756)
  - Pipeline processors emit events directly (#1755)
  - Move model selection into INTAKE (#1753)
  - Scheduler interprets PipelineResult (#1754)
  - PipelineResult type and LE return value (#1752)
  - Worktree locking: prevent cleanup while agents are active (#1751)
  - Bug: Auto-loop 'stuck in starting state' cleanup races with LE pipeline (#1750)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.36.0

## 0.35.3

### Patch Changes

- Maintenance release.
- Updated dependencies
  - @protolabsai/types@0.35.3

## 0.35.2

### Patch Changes

- ### Bug Fixes
  - circuit breaker cooldown race, outer catch, event bus leak
  - cast LangfuseSpanProcessor to resolve OTel type conflict

  ### Refactors
  - remove Linear, crew loops, Langfuse prompt versioning — rewrite README

- Updated dependencies
  - @protolabsai/types@0.35.2

## 0.35.1

### Patch Changes

- ### Bug Fixes
  - disable auto-trigger bug triage, gate to chukz reaction only
  - unify dependency check in IntakeProcessor with shared resolver
- Updated dependencies
  - @protolabsai/types@0.35.1

## 0.35.0

### Minor Changes

- ### Features
  - unify all icons to mirrored bot logo
  - changelog page — show 5 entries, collapse rest, add origin story

  ### Bug Fixes
  - unify all brand icons — solid #7c3aed, mirrored bot across site, docs, and UI
  - use solid brand violet (#7c3aed) for all icons — drop gradient
  - correct fork date in changelog story to Feb 4th, 2026

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.35.0

## 0.34.0

### Minor Changes

- ### Features
  - gated approval WebSocket flow and inline SubagentApprovalCard (#1711)
  - trust level toggle in Ava settings panel (#1712)
  - add mcpServers field to AvaConfig and wire into chat routes (#1708)
  - agent hook factory utilities for Claude Agent SDK integration (#1704)
  - ava chat UX overhaul — scroll fix, settings redesign, agent tools, cleanup
  - real-time tool progress labels for Ava chat (#1696)

  ### Bug Fixes
  - resolve npm audit high-severity vulnerabilities
  - resolve high-severity audit vulnerabilities
  - resolve CodeRabbit critical issues before staging
  - rename stragglers from upstream rebase
  - pr maintainer robustness — coderabbit transient detection, configurable review timeout, always-inject watermarks (#1714)
  - detect permanently missing CI status checks in PR Maintainer (#1705)
  - update @hono/node-server to resolve high severity vulnerability
  - update hono to fix high severity audit vulnerability
  - remove HITL from execute_dynamic_agent, fix hallucinated template names
  - use AI SDK convertToModelMessages for HITL approval continuation
  - surface HITL approval cards inside TaskBlock for multi-tool steps
  - maintenance scheduler branch detection, recovery service, and retry classification
  - use full OTLP trace URL — /api/public/otel returns 404
  - unify dual OTel SDK into single NodeSDK, wire subprocess telemetry

  ### Refactors
  - rename @protolabs-ai → @protolabsai and proto-labs-ai → protoLabsAI
  - Migrate protolabs-report to organisms (#1721)
  - replace diamond logo with Lucide Bot icon
  - Extract TerminalKeyboardMap and finalize (#1718)
  - Extract TerminalToolbar component (#1716)
  - Trust config types and canUseTool factory (#1710)
  - Ava settings MCP servers UI (#1709)
  - Bug 4: Max Retries Is Hardcoded and Doesn't Distinguish Failure Types (#1707)
  - DynamicAgentExecutor and AgentTemplate wiring (#1702)
  - Provider types and ClaudeProvider wiring (#1701)
  - **Auto-mode re-launches agents on features that already have open PRs:**
  - Delete duplicate app-level stories
  - Wire @storybook/addon-a11y in Storybook preview
  - Set up Chromatic CI integration

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.34.0

## 0.33.1

### Patch Changes

- Maintenance release.
- Updated dependencies
  - @protolabsai/types@0.33.1

## 0.33.0

### Minor Changes

- ### Features
  - project detail sidebar layout + tighten border radii
  - scaffold frontend tech debt remediation project + close 2 bug tickets

  ### Bug Fixes
  - calendar showing tomorrow as today due to UTC date conversion

  ### Refactors
  - Install and configure eslint-plugin-jsx-a11y

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.33.0

## 0.32.1

### Patch Changes

- ### Bug Fixes
  - use GH_PAT for version sync PRs to trigger staging deploy
  - git-track feature.json files for cross-instance board sync

  ### Refactors
  - we have many references to `npm run dev:web` throughout our docs and int

- Updated dependencies
  - @protolabsai/types@0.32.1

## 0.32.0

### Minor Changes

- ### Features
  - add ongoing ProjectStatus for persistent projects
  - pipeline cohesion — remove Linear sync, fix escalation/ceremony wiring, consolidate inbox
  - build out Ava settings panel + fix model precedence (#1667)

  ### Bug Fixes
  - git-track .automaker/projects/ for cross-instance sync
  - escape Vue template syntax in linear-deeplink.md
  - resolve 17 dead links breaking VitePress build
  - delete stale Linear test files referencing removed services
  - add auth headers to file-editor browse and settings health endpoints
  - route staging deploy failures to #alerts, add release failure notification
  - make release notes Discord step non-fatal

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.32.0

## 0.31.0

### Minor Changes

- ### Features
  - wire LLM release notes rewriter into auto-release pipeline
  - add LLM-powered release notes rewriter with prompt template and docs

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.31.0

## 0.30.1

### Patch Changes

- ### Bug Fixes
  - capture thinking blocks in simpleQuery for Opus plan generation
- Updated dependencies
  - @protolabsai/types@0.30.1

## 0.30.0

### Minor Changes

- ### Features
  - remove file editor feature flag and fix tooltip provider
  - add New Terminal button to empty terminal state
  - add one-time scheduled jobs to calendar
  - wire file editor to upstream parity — CodeMirror, tabs, tree context menu, diff, 30+ languages

  ### Bug Fixes
  - dark mode for date picker, sonner toasts, scrollbars, and sidebar overlay auto-close
  - rename sidebar nav item from Kanban Board to Board
  - bold date and add separator in clock hover popover
  - use 24h format for ticker clock, keep 12h in hover popover
  - clock updates every second, add hover popover with full date/time

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.30.0

## 0.29.0

### Minor Changes

- ### Features
  - add clock to bottom ticker bar

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.29.0

## 0.28.0

### Minor Changes

- ### Features
  - remove calendar and projects from feature flags — always enabled

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.28.0

## 0.27.0

### Minor Changes

- ### Features
  - compact sidebar nav, enable calendar + projects flags by default
  - move Ava Chat from sidebar nav to bottom ticker bar
  - tighten kanban column spacing — reduce gap, padding, and min width
  - list view consistency for projects + board header uses PanelHeader
  - unified PanelHeader component for consistent panel headers
  - google calendar-style month grid, fix MCP calendar endpoints, add API docs
  - persistent bugs project with ongoing flag and bug triage wiring
  - project delete stats capture, delete UI button, nav fix + hotkey

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.27.0

## 0.26.0

### Minor Changes

- ### Features
  - native project management system with shared tools, tabbed UI, and PM agent

  ### Bug Fixes
  - oauth auth detection + pr-feedback stale entry cleanup
  - address CodeRabbit review feedback on project management PR
  - add @protolabsai/tools as server dependency

  ### Refactors
  - unify project view with design system atoms and semantic tokens

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.26.0

## 0.25.0

### Minor Changes

- ### Features
  - discord channel workflow engine + bug triage flow
  - decouple project lifecycle from Linear + add Projects UI
  - add Ava Chat nav item to desktop sidebar + update docs

  ### Bug Fixes
  - remove undefined react-hooks/exhaustive-deps disable comment
  - show project details inline instead of broken PrdReviewDialog
  - update worktree-recovery-service tests for projectPath parameter
  - use main repo prettier binary in worktree formatting

  ### Performance
  - remove duplicate status polling from /spec page load

  ### Refactors
  - Message Branch Navigation (response variants) (#1621)
  - Delete MaintenanceSection UI and scheduler backend routes (#1620)
  - cant adjust concurrent agents (#1615)
  - ask ava chat window doesn't focus on open (#1613)
  - Add Run Now, timestamps, stats, and human-readable cron (#1616)
  - Enrich automation list response with scheduler stats (#1614)
  - Replace inline hardcoded colors in flow-graph, analytics, and renderers (#1612)
  - Relocate domain components from shared/ to view directories (#1611)
  - Eliminate rounded-2xl and audit rounded-xl overuse (#1610)
  - Migrate dashboard, welcome, calendar, settings, and remaining views (#1609)
  - Adaptive notification routing + get_presence_state Ava tool (#1607)
  - Migrate git-diff-panel, log-viewer, and shared components (#1606)
  - Migrate status color violations (usage popovers, terminal, board) (#1603)
  - Server-side plan streaming chunk + AvaConfig plan tool (#1598)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.25.0

## 0.24.0

### Minor Changes

- ### Features
  - surface Needs Action blocked features in ava, headsdown, and board skills (#1592)
  - add avaChat feature flag to gate Ava Anywhere
  - add inline form card, hitl context, storybook stories

  ### Bug Fixes
  - stale context trap auto-detection, plan-loop guard, needs-action badge (#1591)

  ### Refactors
  - QueueView panel component (#1594)
  - WebPreviewCard tool result card (#1586)
  - Wire Actions + Loader + Shimmer into ChatMessage and ChatMessageList (#1582)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.24.0

## 0.23.0

### Minor Changes

- ### Features
  - add global settings button to quick actions bar

  ### Bug Fixes
  - event-driven reconciliation — multi-project PR lookup, epic auto-promotion, stale reset (#1587)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.23.0

## 0.22.0

### Minor Changes

- ### Features
  - add systemView feature flag, gate system view behind it
  - step-split bubbles, table styling, docs + Matt ownership
  - add orphaned feature detection to health monitor (#1576)

  ### Bug Fixes
  - prevent premature auto-mode idle event emission (#1575)

  ### Refactors
  - HITL Confirmation Dialogs (#1573)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.22.0

## 0.21.0

### Minor Changes

- ### Features
  - add otlp http exporter + auto-instrumentation to server (#1553)
  - headless claude subprocess tool + maintenance langgraph flow (#1551)
  - DynamicStructuredTool wrappers and tool registry for 4 service families (#1549)
  - migrate hardcoded maintenance tasks to automation records (#1547)
  - automation registry REST API and scheduler wiring (#1546)

  ### Bug Fixes
  - handle single numbered items and strip prefixes in parseSteps fallback (#1562)
  - format pre-pushed agent commits to fix prettier CI failures (#1559)
  - add session resume rule — check worktree state before starting

  ### Refactors
  - centralize featureFlags.pipeline gate in HITLFormService.create() (#1567)
  - fix(intake): Linear issue creation bypasses intake state gate — routes t (#1569)
  - Fix orphaned features on worktree delete (#1568)
  - Chain of Thought Reasoning Component (#1561)
  - Register ceremonies as Automations + inbox event routing (#1560)
  - AutomationService + flow node OTel instrumentation (#1555)
  - Matt Review: M1 Phase 1 Brand + Styling Pass (#1550)
  - Conversation Container + Prompt Input Upgrade (#1548)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.21.0

## 0.20.1

### Patch Changes

- ### Bug Fixes
  - filter chore PRs from GitHub release notes
  - add file edit path discipline rule to agent CLAUDE.md
- Updated dependencies
  - @protolabsai/types@0.20.1

## 0.20.0

### Minor Changes

- ### Features
  - createLangChainModel() LangChain adapter (#1531)

  ### Bug Fixes
  - show all features on main worktree when worktrees are loaded (#1534)

  ### Refactors
  - Update all existing flows to use createLangChainModel() (#1533)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.20.0

## 0.19.0

### Minor Changes

- ### Features
  - add demo mode (`npm run demo`)

  ### Bug Fixes
  - replace Zustand store with useSyncExternalStore for demo mode

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.19.0

## 0.18.1

### Patch Changes

- ### Bug Fixes
  - use default API key instead of random generation
- Updated dependencies
  - @protolabsai/types@0.18.1

## 0.18.0

### Minor Changes

- ### Features
  - rename /analytics to /system-view and add keyboard shortcuts for all nav items

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.18.0

## 0.17.0

### Minor Changes

- ### Features
  - add /welcome onboarding skill with docs links

  ### Bug Fixes
  - add sync-wait guard to auto-release and /promote skill
  - add /api/app-spec CRUD routes and deduplicate plugin skills

  ### Refactors
  - [linear] feat(maintenance): replace board-health merged-not-done poll wi (#1498)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.17.0

## 0.16.1

### Patch Changes

- Maintenance release.
- Updated dependencies
  - @protolabsai/types@0.16.1

## 0.16.0

### Minor Changes

- ### Features
  - add /upgrade-plugin command and temp-skills tracking

  ### Bug Fixes
  - add dumb-init PID 1, right-size resources, fix subprocess exit race (#1501)
  - add --ignore-path /dev/null to prettier in commitChanges and formatAndAmendLastCommit
  - p0 — gate hitl forms behind featureFlags.pipeline, deduplicate per-feature

  ### Refactors
  - rename plugin identity from automaker to protolabs/studio
  - [linear] test protoExtension (#1495)
  - [linear] P1: HITL form system is brittle — repeated popups blocking alph (#1493)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.16.0

## 0.15.3

### Patch Changes

- ### Bug Fixes
  - update worktree-recovery-service mocks for execFileAsync PR creation
  - add pull-requests:write to auto-release sync step

  ### Refactors
  - [linear] docs: Add browser extension installation guide to protoLabs doc (#1489)
  - [linear] fix(agent): git-workflow-service PR body backtick shell error — (#1490)
  - [linear] feat(observability): add per-tool-call span tracing in TracedPr (#1488)
  - [linear] fix(observability): remove cost=0 stub in antagonistic review a (#1487)
  - [linear] fix(observability): extend Langfuse cost pricing table to cover (#1485)
  - [linear] feat(ci): add langfuse-prompt-update repository_dispatch workfl (#1482)
  - [linear] feat(observability): implement TrajectoryStoreService — persist (#1481)

- Updated dependencies
  - @protolabsai/types@0.15.3

## 0.15.2

### Patch Changes

- ### Bug Fixes
  - stop marking releases as pre-release
  - tighten CI npm audit to high severity for production deps (#1475)

  ### Refactors
  - [linear] cant adjust concurrent agents (#1473)
  - [linear] ux(ava-anywhere): polish the overlay as the primary Ava chat su (#1472)

- Updated dependencies
  - @protolabsai/types@0.15.2

## 0.15.1

### Patch Changes

- ### Bug Fixes
  - prevent concurrency lease race on EXECUTE retry

  ### Refactors
  - Migrate Discord profile fields → Integrations tab (#1469)
  - discord config dialog — signal sources section (#1465)

- Updated dependencies
  - @protolabsai/types@0.15.1

## 0.15.0

### Minor Changes

- ### Features
  - add browser extension template and legacy dropdown for starter kits (#1463)
  - wire Groq and OpenAI-Compatible settings tabs to UI (#1461)
  - add optional user profile step to setup flow (#1459)
  - complete discord-monitor + signal wiring (#1452) (#1453)

  ### Bug Fixes
  - allow empty title in feature creation and fix flow graph edge handles
  - prevent HITL form dialog crash when steps is undefined (#1462)
  - auto-focus chat input when chat overlay opens (#1458)
  - handle linear:agent-session:updated events in LinearAgentRouter (#1455)
  - prevent crash when toolExecutions is undefined in agent-node

  ### Refactors
  - remove Graphite integration entirely (#1451)
  - Security: Parameterize hardcoded paths in staging compose (#1450)
  - Content Badge Removal (#1444)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.15.0

## 0.14.0

### Minor Changes

- ### Features
  - persona management system UI and mutations (#1443)
  - Add ReactionAbility types, storage, and API endpoints (#1438)

  ### Bug Fixes
  - exclude TodoWrite from loop detection, hash full input
  - update worktree-recovery tests for staging verification
  - add staging verification and fallback to worktree recovery
  - mask API keys in CI deploy workflows (#1440)
  - replace hardcoded Grafana credentials with env vars (#1436)

  ### Refactors
  - AddFeatureDialog Cleanup (#1446)
  - Assignee Badge Removal (#1441)
  - remove All/Mine/Agent assignee filter (#1439)
  - Remove Discord slash commands (#1437)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.14.0

## 0.13.0

### Minor Changes

- ### Features
  - add getFileExtension utility to image-utils

  ### Bug Fixes
  - normalize feature.dependencies from JSON string to array
  - quick UX wins — sidebar order, nav labels, settings consistency
  - stop excluding .automaker/memory from commits
  - use GITHUB_TOKEN for sync-back PR creation in auto-release
  - guard auth bypass, mask API key in logs (#1429)

  ### Refactors
  - remove voice activation system (dead code)
  - remove sidebar chat — Ava Anywhere overlay is the one surface
  - move project-specific skills and MCP servers out of plugin

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.13.0

## 0.12.0

### Minor Changes

- ### Features
  - server-side agent output summary extraction and persistence (#1422)
  - feature-gate PipelineOrchestrator behind settings.featureFlags.pipeline
  - add GH_PAT validation step to auto-release.yml (#1419)
  - deploy docs from dev branch on docs/\*\* changes

  ### Bug Fixes
  - use dynamic hostname in dev-server-service test (#1425)
  - replace hardcoded Josh references with dynamic user identity (#1424)
  - add pipeline field to FeatureFlags fallback in use-settings-sync
  - add AUTOMAKER_ROOT validation wrapper and update install docs (#1421)
  - sidebar cleanup, settings toggle, TypeScript CI typecheck (#1414)
  - harden deploy-main.yml — drain, fatal smoke, rollback gate (#1418)

  ### Refactors
  - unify settings views — shared header, nav, components (#1420)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.12.0

## 0.11.0

### Minor Changes

- ### Features
  - auto-sync version bump back to staging and dev after release

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.11.0

## 0.10.2

### Patch Changes

- ### Bug Fixes
  - surface AUTOMAKER_ROOT missing error on new installs (PRO-335) (#1411)
- Updated dependencies
  - @protolabsai/types@0.10.2

## 0.10.1

### Patch Changes

- ### Bug Fixes
  - wire real implementations — tools, sitrep, config schema (#1409)
  - rebase onto target branch before PR creation in non-Graphite path (#1407)
  - delete changeset-release.yml — auto-release owns the release pipeline (#1406)
- Updated dependencies
  - @protolabsai/types@0.10.1

## 0.10.0

### Minor Changes

- ### Features
  - createFlowModel adapter — unified LangGraph flow model creation (#1401)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.10.0

## 0.9.0

### Minor Changes

- ### Features
  - OpenAI-compatible provider settings tab with model selector integration (#1396)
  - full-screen /chat route + Chat nav in MobileBottomNav and Sidebar (#1394)
  - wire project context into ChatOverlayContent and ChatSidebar (#1390) (#1393)
  - Groq Settings UI — provider tab, model selector, API key management (#1392)

  ### Bug Fixes
  - bump deploy-staging timeout to 60min, enable BuildKit (#1398)

  ### Refactors
  - extract buildGitAddCommand to shared utility + regression tests (#1389)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.9.0

## 0.8.0

### Minor Changes

- ### Features
  - OpenAICompatibleProvider — native OpenAI SDK provider with CRUD settings API (#1384)
  - Ava API client mixin and AvaSettingsPanel component (#1381)
  - mobile responsive memory and context views (#1377)
  - chat store and hook — project scoping (#1378)
  - add Ava config CRUD endpoints and wire services into chat routes (#1376)

  ### Bug Fixes
  - guard git add pathspec against missing .automaker dirs (#1387)
  - remove stale llm-providers COPY from Dockerfile [HOTFIX] (#1383)
  - use workspace Prettier binary in worktrees (#1385)
  - branch worktrees from origin/dev, not HEAD (#1380)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.8.0

## 0.7.0

### Minor Changes

- ### Features
  - File Tree + /api/git/details Route + FileEditorView Scaffold (#1371)
  - CodeMirror tabbed editor + auto-save (#1368)
  - Ava Tools — Board and Agent Groups (#1365)
  - GroqProvider implementation and factory registration (#1352)
  - EscalateProcessor creates structured HITL form on escalation (M3.1) (#1354)
  - add guardrails reminder to phaseToFeatureDescription (#1355)
  - HITL response triggers pipeline resume (M3.2) (#1356)
  - AvaConfig and Sitrep Modules (#1349)
  - add HITL form + actionable item MCP tools (M2.3) (#1347)
  - HITL reconnect sync — mount fetch + WS subscriber dedup (#1346)
  - HITL form re-trigger on reconnect + TTL/2 reminder (#1344)
  - SignalIntent type + intent classification layer (#1340)
  - ava-only chat — remove dead chat session system and multi-persona (#1339)
  - post release notes to Discord #dev + mark releases as alpha pre-release
  - post release notes to Discord #dev on auto-release

  ### Bug Fixes
  - prevent settings-service test dir collision in parallel CI (#1375)
  - use env context for DISCORD_DEV_WEBHOOK in auto-release if condition (#1372)
  - sync CI test expectations with current service behavior (#1370)
  - update provider-factory test count for Groq (4 → 5) (#1369)
  - increment failureCount on git workflow failure to prevent retry storm (#1366)
  - stage all files before commit in git workflow service (#1362)
  - restore SignalIntent + classifySignalIntent() — dropped in M2 merge fix (#1358)
  - split git add pathspec to fix agent commit failures (#1345)
  - route Linear comments to active agents, skip escalation dead-end (#1342)
  - mark auto-releases as alpha pre-release
  - feature flags default to off (#1336)

  ### Refactors
  - Enriched Chat Route and Personas Update (#1374)
  - Package Deletion and Reference Cleanup (#1350)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.7.0

## 0.5.0

### Minor Changes

- ### Features
  - escalation dedup persistence and pipeline state drift fix (#1327)
  - wire missing escalation channels and Discord DM/Linear acknowledgment (#1324)
  - Wiring, Escalation & Hardening (#1323)
  - critical + high pipeline bug fixes — verify gate hold, GTM signal, dep resolver (#1319)
  - signal-aware channel router — Discord + GitHub gate holds (#1320)

  ### Bug Fixes
  - pin deploy-staging to [self-hosted, staging] runner label (#1333)
  - fix 4 electron/action failures — step order, windows quoting, stale SHAs (#1331)
  - normalize HUSKY=0 in worktree-recovery-service execEnv (#1329)
  - memory files use merge=ours to prevent stale agent memory conflicts on rebase
  - add workflow_dispatch to checks.yml for manual trigger on epic branches
  - remove branches filter so CI runs on all PRs including epic/\* branches

  ### Refactors
  - decompose wiring.ts into self-registering service modules (#1328)
  - AntagonisticReviewService wiring and EM Agent guard (#1325)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.5.0

## 0.4.0

### Minor Changes

- ### Features
  - component library panel for PEN design editor (#1089)
  - property editing and file save for PEN design inspector (#1088)
  - Grafana alerting rules with Discord notification pipeline (#1087)
  - regenerate site stats with accurate PR count and date cutoff (#1086)
  - node selection and property inspector panel for designs view (#1085)

### Patch Changes

- Updated dependencies
  - @protolabsai/types@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [3e55d9f]
  - @protolabsai/types@0.3.0
