# @protolabs-ai/flows

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
  - @protolabs-ai/types@0.12.0
  - @protolabs-ai/utils@0.12.0
  - @protolabs-ai/prompts@0.12.0
  - @protolabs-ai/observability@0.12.0

## 0.11.0

### Minor Changes

- ### Features
  - auto-sync version bump back to staging and dev after release

### Patch Changes

- Updated dependencies
  - @protolabs-ai/types@0.11.0
  - @protolabs-ai/utils@0.11.0
  - @protolabs-ai/prompts@0.11.0
  - @protolabs-ai/observability@0.11.0

## 0.10.2

### Patch Changes

- ### Bug Fixes
  - surface AUTOMAKER_ROOT missing error on new installs (PRO-335) (#1411)
- Updated dependencies
  - @protolabs-ai/types@0.10.2
  - @protolabs-ai/utils@0.10.2
  - @protolabs-ai/prompts@0.10.2
  - @protolabs-ai/observability@0.10.2

## 0.10.1

### Patch Changes

- ### Bug Fixes
  - wire real implementations — tools, sitrep, config schema (#1409)
  - rebase onto target branch before PR creation in non-Graphite path (#1407)
  - delete changeset-release.yml — auto-release owns the release pipeline (#1406)
- Updated dependencies
  - @protolabs-ai/types@0.10.1
  - @protolabs-ai/utils@0.10.1
  - @protolabs-ai/prompts@0.10.1
  - @protolabs-ai/observability@0.10.1

## 0.10.0

### Minor Changes

- ### Features
  - createFlowModel adapter — unified LangGraph flow model creation (#1401)

### Patch Changes

- Updated dependencies
  - @protolabs-ai/types@0.10.0
  - @protolabs-ai/utils@0.10.0
  - @protolabs-ai/prompts@0.10.0
  - @protolabs-ai/observability@0.10.0

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
  - @protolabs-ai/types@0.9.0
  - @protolabs-ai/utils@0.9.0
  - @protolabs-ai/prompts@0.9.0
  - @protolabs-ai/observability@0.9.0

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
  - @protolabs-ai/types@0.8.0
  - @protolabs-ai/utils@0.8.0
  - @protolabs-ai/prompts@0.8.0
  - @protolabs-ai/observability@0.8.0

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
  - @protolabs-ai/types@0.7.0
  - @protolabs-ai/utils@0.7.0
  - @protolabs-ai/prompts@0.7.0
  - @protolabs-ai/observability@0.7.0

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
  - @protolabs-ai/types@0.5.0
  - @protolabs-ai/utils@0.5.0
  - @protolabs-ai/prompts@0.5.0
  - @protolabs-ai/observability@0.5.0

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
  - @protolabs-ai/types@0.4.0
  - @protolabs-ai/utils@0.4.0
  - @protolabs-ai/prompts@0.4.0
  - @protolabs-ai/observability@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [3e55d9f]
  - @protolabs-ai/types@0.3.0
  - @protolabs-ai/observability@0.3.0
  - @protolabs-ai/prompts@0.3.0
  - @protolabs-ai/utils@0.3.0
