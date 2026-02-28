# @protolabs-ai/tools

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
  - @protolabs-ai/types@0.15.3

## 0.15.2

### Patch Changes

- ### Bug Fixes
  - stop marking releases as pre-release
  - tighten CI npm audit to high severity for production deps (#1475)

  ### Refactors
  - [linear] cant adjust concurrent agents (#1473)
  - [linear] ux(ava-anywhere): polish the overlay as the primary Ava chat su (#1472)

- Updated dependencies
  - @protolabs-ai/types@0.15.2

## 0.15.1

### Patch Changes

- ### Bug Fixes
  - prevent concurrency lease race on EXECUTE retry

  ### Refactors
  - Migrate Discord profile fields → Integrations tab (#1469)
  - discord config dialog — signal sources section (#1465)

- Updated dependencies
  - @protolabs-ai/types@0.15.1

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
  - @protolabs-ai/types@0.15.0

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
  - @protolabs-ai/types@0.14.0

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
  - @protolabs-ai/types@0.13.0

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

## 0.11.0

### Minor Changes

- ### Features
  - auto-sync version bump back to staging and dev after release

### Patch Changes

- Updated dependencies
  - @protolabs-ai/types@0.11.0

## 0.10.2

### Patch Changes

- ### Bug Fixes
  - surface AUTOMAKER_ROOT missing error on new installs (PRO-335) (#1411)
- Updated dependencies
  - @protolabs-ai/types@0.10.2

## 0.10.1

### Patch Changes

- ### Bug Fixes
  - wire real implementations — tools, sitrep, config schema (#1409)
  - rebase onto target branch before PR creation in non-Graphite path (#1407)
  - delete changeset-release.yml — auto-release owns the release pipeline (#1406)
- Updated dependencies
  - @protolabs-ai/types@0.10.1

## 0.10.0

### Minor Changes

- ### Features
  - createFlowModel adapter — unified LangGraph flow model creation (#1401)

### Patch Changes

- Updated dependencies
  - @protolabs-ai/types@0.10.0

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

## 0.3.0

### Patch Changes

- Updated dependencies [3e55d9f]
  - @protolabs-ai/types@0.3.0
