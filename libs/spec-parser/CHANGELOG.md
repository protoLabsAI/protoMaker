# @protolabsai/spec-parser

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
