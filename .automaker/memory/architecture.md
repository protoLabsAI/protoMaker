---
tags: [architecture]
summary: Critical architectural decisions with system-wide impact and breaking-change risk
relevantTo: [architecture]
importance: 0.9
relatedFiles: []
usageStats:
  loaded: 544
  referenced: 129
  successfulFeatures: 129
---

<!-- domain: Architecture Decisions | System-wide structural decisions that have breaking consequences if changed -->

# architecture

### External backup system replaces git-based recovery for feature.json (2026-02-10)

- **Context:** Feature data loss incidents revealed git-tracking was fundamentally incompatible with runtime file mutations. Worktree operations and concurrent agent execution corrupted git state while modifying feature.json on disk.
- **Why:** Git is designed for developer-controlled changes with clear commit boundaries. Runtime systems that write continuously conflict with git's atomic commit model. External backups at `.automaker/.backups/features/{featureId}/` provide point-in-time recovery without git overhead.
- **Rejected:** Keeping git-tracked feature.json with gitignore rules — git operations continue conflicting with server writes.
- **Trade-offs:** External backups require rotation policy and disk management. Gain: git remains clean, server can write freely, multiple recovery strategies (backups + in-memory + manual restoration).
- **Breaking if changed:** If `readJsonWithRecovery()` is removed and replaced with direct disk reads, recovery capability disappears silently. If backups directory deleted, feature-loader.ts falls back to disk reads with no resilience.

### Exclude `.automaker/` from all git operations via pathspec, not just .gitignore (2026-02-10)

- **Context:** Multiple git operations (auto-mode-service.ts, git-workflow-service.ts) need to avoid staging .automaker runtime files.
- **Why:** Code-level pathspec exclusions (`git add -A -- ':!.automaker/'`) are explicit and documented. They survive .gitignore refactors. .gitignore is a safety net, not the primary mechanism.
- **Rejected:** Relying solely on .gitignore — fragile to rule order and hard to debug.
- **Breaking if changed:** If `-- ':!.automaker/'` is removed from any git operation, that operation stages .automaker runtime files, corrupting git history (server writes continuously change them).

### 50% feature count drop threshold chosen as critical breach trigger (2026-02-10)

- **Context:** Need to detect catastrophic data loss (Feb 10 incident: 141 features deleted) while avoiding false positives from normal cleanup.
- **Why:** 50% is high enough to ignore gradual cleanup but low enough to catch mass deletion. 100% threshold misses partial catastrophes; 10% triggers on every cleanup cycle.
- **Breaking if changed:** Lowering to 20% triggers false alarms on legitimate cleanup, blocking auto-mode. Raising to 80% misses the 50-70% range where significant work is lost but recovery is still possible.

### CodeRabbit resolver is a separate service (CodeRabbitResolverService), not inline in git-workflow-service (2026-02-10)

- **Context:** Need to resolve bot review threads that block auto-merge without cluttering the main workflow orchestrator.
- **Why:** Separation of concerns allows the resolver to be independently tested, reused, and modified without touching workflow logic.
- **Breaking if changed:** If CodeRabbitResolverService is removed, auto-merge workflow blocks on bot review threads — PR-to-merge gap reappears.

### Auto-merge task polls 'review' features rather than listening to status-change events (2026-02-10)

- **Context:** Decision between event-driven (react to status changes) vs polling (periodic evaluation).
- **Why:** Polling is more resilient to missed events, handles edge cases like manual setting changes, and integrates cleanly with existing SchedulerService cron pattern. Consistent with all other maintenance tasks.
- **Breaking if changed:** Switching to pure event-driven requires comprehensive event emission across all status-change paths; gaps cause silent failures.

### Per-project auto-merge flag (webhookSettings.autoMerge.enabled), not global server setting (2026-02-10)

- **Context:** Needed granular control — some projects want auto-merge, others don't.
- **Why:** Per-project settings allow gradual rollout, testing on pilot projects, and respecting team preferences.
- **Breaking if changed:** Removing per-project check and making it global auto-merges PRs on all projects — risky if some teams opted out.

### Setter injection (setAutoModeService) instead of constructor injection to break circular dependencies (2026-02-10)

- **Context:** PRFeedbackService needs to call AutoModeService.executeFeature(), but both are initialized at startup and wired together after construction.
- **Why:** Constructor injection would create circular dependency: PRFeedbackService → AutoModeService. Setter injection decouples construction from wiring.
- **Breaking if changed:** If setAutoModeService() is never called, processReviewStatus() falls back to event-only mode — loses direct automation but service still functions.

### Transient error detection is stateless drift detection (WorldStateMonitor), not a retry state machine (2026-02-10)

- **Context:** Auto-retry for blocked features needs to distinguish transient (network, rate limit) from permanent (merge conflict, auth) failures.
- **Why:** Drift-based approach integrates cleanly with existing tick-based architecture. Avoids separate state machine complexity and race conditions between services.
- **Breaking if changed:** If WorldStateMonitor tick interval becomes too long (>5min), retry window detection becomes unreliable. Minimum tick frequency of 30s is critical.

### Opus escalation at retry count >= 2 (after 2nd failure), not at 3 (after 3rd failure) (2026-02-10)

- **Context:** Features can be retried up to 3 times. Need to escalate to stronger model before last retry.
- **Why:** Escalate BEFORE the final chance, not after exhausting retries. Gives opus one opportunity to solve persistent issues.
- **Breaking if changed:** If max retry limit is reduced to 2, escalation at count>=2 means every feature gets escalated. Logic needs: escalate at count >= (MAX_RETRIES - 1).

### Continuation prompt injection via executeFeature options, not new agent creation (2026-02-10)

- **Context:** Agent needs to receive PR feedback without restarting from default system prompt.
- **Why:** AutoModeService.executeFeature() supports continuationPrompt which appends feedback to existing context rather than replacing the system prompt. Preserves feature state, branch context, and worktree continuity.
- **Breaking if changed:** If continuationPrompt parameter is removed from executeFeature options, PR feedback injection requires a new integration point.

### Use type-only imports to break circular dependency chains (2026-02-12)

- **Context:** DiscordBotService is created after AvaGatewayService in the initialization sequence.
- **Why:** Type-only imports are stripped at runtime, so they don't create actual module dependencies. Allows AvaGatewayService to reference the type for setter parameter typing without circular module dependency.
- **Breaking if changed:** If type import is converted to regular import without adding DiscordBotService to the constructor, Discord operations fail silently.

### Hardcoded prompt resolution in AgentDiscordRouter: role names map directly to prompt functions from @protolabsai/prompts (2026-03-11)

- **Context:** Discord thread routing maps role names to system prompts. The RoleRegistryService and dynamic template system were removed (commit 2a1563ca) — dynamic agent templates are superseded by Claude Code's native Agent tool and CLI skills.
- **Why:** Hardcoded prompt resolution is simpler and avoids the complexity of a dynamic registry. All roles have statically-defined prompts in `libs/prompts/src/agents/`. Adding a new role requires code changes across `libs/types`, `libs/prompts`, and `apps/server/src/services/agent-discord-router.ts`.
- **Breaking if changed:** If a new role is added to `AgentRole` union without wiring a prompt function, the router throws at runtime — no silent fallback.

### Fire-and-forget async agent spawning via void IIFE pattern in event handler (2026-02-12) [ARCHIVED — crew loops removed 2026-03-04]

- **Context (Historical):** Previously spawned Frank agent on critical health events without blocking the event loop. Frank cron schedules are no longer active.
- **Why the pattern works:** Event handlers must return quickly. `void (async () => {})()` allows non-blocking async work with error isolation. Still applicable for any fire-and-forget async event handler work.
- **Note:** If auto-spawned diagnostic agents are re-introduced, ensure they don't await in the event handler.

### In-memory cooldown timestamp for async agent spawn throttling (2026-02-12) [ARCHIVED — crew loops removed 2026-03-04]

- **Context (Historical):** Previously used to prevent Frank spawn storms when critical health events persisted for hours. No longer active.
- **Why the pattern works:** In-memory cooldown avoids external state dependencies; resets naturally on server restart. Applicable for any auto-triggered async operation that needs rate-limiting.

### Dual ESM/CJS builds with separate tsconfig files and output directories (2026-02-13)

- **Context:** Package declared as type:module but needs to support both import and require consumers.
- **Why:** ESM-declared packages treat .js files as ES modules. CJS consumers cannot use .js files directly. Separate outputs allow correct extensions (.js for ESM, .cjs for CJS).
- **Breaking if changed:** Removing separate tsconfig.cjs.json breaks CJS consumers — they'd require .js files from an ESM package, failing silently or with module errors.

### Copy type definitions inline in create-protolab rather than import from @protolabsai/types (2026-02-13)

- **Context:** create-protolab package needs setup pipeline types but cannot import @protolabsai/types in all execution contexts (standalone CLI runs).
- **Why:** Type duplication avoids runtime import failures when package manager workspace resolution fails.
- **Breaking if changed:** If types are updated in libs/types/src/setup.ts without updating the copy, create-protolab uses stale interfaces — type mismatches at feature creation time.

### AgentSelector and AgentModelSelector coexist as separate components used mutually exclusively (2026-02-12)

- **Context:** Could have modified AgentModelSelector to show both templates and raw models, or replaced it entirely.
- **Why:** Separation of concerns: AgentSelector (template-based) and AgentModelSelector (raw model) have different responsibilities and APIs.
- **Breaking if changed:** If a future requirement demands showing both selectors at once, the mutual exclusion pattern becomes a blocker requiring significant refactoring.

### Internal FeatureState (8 states) vs simplified public board status (5 states) (2026-03-09)

- **Context:** Need comprehensive internal state tracking for complex feature lifecycle while presenting simplified interface to users.
- **Why:** Internal 8-state machine (INTAKE, PLAN, EXECUTE, REVIEW, MERGE, DEPLOY, VERIFY, DONE) captures all transition paths. Public 5-state board (backlog, in_progress, review, blocked, done) is user-digestible.
- **Breaking if changed:** If internal states change without updating public board status mapping, UI shows stale feature progress even though backend state is updated.

### PhaseHandoff verdict system (APPROVE/WARN/BLOCK) explicitly gates pipeline progression (2026-03-09)

- **Context:** Feature pipeline progresses through multiple agent phases — need explicit gates to prevent bad work from advancing.
- **Why:** Verdict system makes progression decisions visible and auditable. Each phase explicitly approves or blocks before next phase starts.
- **Breaking if changed:** Removing verdict system and reverting to implicit checks loses visibility into why features get stuck and makes debugging phase failures much harder.

### Singleton pattern: export both class AND getter for test isolation (DataIntegrityWatchdogService) (2026-02-10)

- **Context:** Need production singleton behavior but tests require isolated instances without shared state between test cases.
- **Why:** Tests calling `new DataIntegrityWatchdogService(tmpDataDir)` get isolated instances; production uses singleton getter. Avoids mocking complexity and test pollution.
- **Breaking if changed:** If only getter is exported, tests lose isolation and fail with state cross-contamination. If only class is exported, production loses singleton guarantees — multiple instances spawn duplicate monitoring and redundant Discord alerts.

### Emit per-action events AND aggregate task completion event separately (2026-02-10)

- **Context:** Providing audit trail and UI feedback for autonomous cleanup operations.
- **Why:** Dual-event approach enables (1) real-time UI updates via individual events and (2) health monitoring via completion event with aggregate counts.
- **Breaking if changed:** Removing individual events loses real-time UI feedback. Removing completion event loses health/monitoring signal. Both matter for different consumers.

#### [Pattern] localStorage used as neutral bridge between auth.ts and app-store.ts. getServerUrl() reads from 'automaker:serverUrlOverride', setServerUrlOverride() writes to same key. No direct import between layers. (2026-03-11)

- **Problem solved:** Multiple layers (auth, state management) need access to same server URL override without creating circular dependency or tight coupling.
- **Why this works:** Avoids circular imports and direct service coupling. Creates implicit contract on localStorage key as decoupling mechanism.
- **Trade-offs:** One indirection (localStorage lookup) vs. zero import coupling; implicit key contract harder to refactor than explicit exports

#### [Pattern] HTTP client fully invalidated (recreated) on setServerUrlOverride(), not just base URL patched. Calls invalidateHttpClient() which triggers WebSocket reconnection. (2026-03-11)

- **Problem solved:** User switches server URL at runtime. Old connections/interceptors/middleware were initialized with original origin and need reset.
- **Why this works:** HTTP clients cache connections, configure TLS/auth per-origin, bind request middleware to specific base URL. Can't patch URL property; full recreation required.
- **Trade-offs:** Immediate fresh connection (good UX, correct state) vs. more expensive (full recreation vs. shallow update)

#### [Gotcha] Recent URLs deduplication removes old occurrence and appends new one. Array persisted to localStorage with max 10 entries. Deduplication via array filter + push, not Set or Map. (2026-03-11)

- **Situation:** User may switch to same server URL multiple times. Need clean dropdown UI without duplicates and bounded storage usage.
- **Root cause:** Array approach preserves insertion order (most recent at end) for UX. Set would lose order. 10-entry cap prevents localStorage quota creep. Filter+push is simpler than index tracking.
- **How to avoid:** Simple ordered dedup vs. unbounded storage; old entries lost when max reached

### When serverUrlOverride changes, setServerUrlOverride() explicitly calls invalidateHttpClient() to force recreation of both HTTP and WebSocket clients, rather than having clients auto-detect and reconnect. (2026-03-11)

- **Context:** Ensuring both HTTP and WebSocket stay synchronized when switching servers at runtime
- **Why:** Clients cache server URL internally at instantiation; explicit invalidation guarantees both client types get fresh instances pointing to new URL. Prevents subtle bugs where HTTP migrates but WebSocket stays on old server.
- **Rejected:** Reactive auto-reconnect pattern (clients watch serverUrlOverride store change) - too implicit, risk of partial state divergence; URL property mutation (clients don't know to reconnect); separate invalidation per client (easy to forget one)
- **Trade-offs:** Gained: Explicit guarantee of sync, atomic client refresh. Lost: Manual trigger coupling; tight lifecycle bond between URL changes and client creation
- **Breaking if changed:** If invalidateHttpClient() call is removed, clients remain connected to original server despite URL change, silently failing requests

#### [Gotcha] invalidateHttpClient() must be called AFTER serverUrlOverride state is set in store, not before. Calling before means new clients read stale URL from store. (2026-03-11)

- **Situation:** Ordering of state mutation vs client recreation
- **Root cause:** New HTTP/WebSocket clients read serverUrlOverride from store during instantiation. If invalidate is called before state update, new clients get old URL.
- **How to avoid:** Gained: Clients always read fresh state. Lost: Implicit ordering dependency that's not obvious in code

### SDK single-level constraint enforced via synchronous interface design: LeadEngineerWorldStateProvider.getWorldStateSummary() is deliberately synchronous (not async/async-generator) to structurally prevent it from being implemented as a subagent. (2026-03-11)

- **Context:** Anthropic SDK enforces single-level of subagents. Need to allow LE queries within Ava's PM delegated flow without violating this constraint.
- **Why:** Synchronous interface makes subagent implementation impossible at the type level. This uses the type system as constraint enforcement rather than relying on documentation or runtime checks.
- **Rejected:** Could implement LE as async subagent (SDK violation) or document the constraint. Type-level enforcement prevents accidental misuse.
- **Trade-offs:** LE implementation cannot be async/parallel, but constraint violation becomes impossible. Adds clarity at cost of implementation flexibility.
- **Breaking if changed:** Converting to async interface would require SDK restructuring to separate Ava's PM context from LE query evaluation, violating single-level constraint.

#### [Pattern] Three-layer briefing with independent failure degradation: PM layer, LE layer, and strategic context layer each fail independently with graceful markdown fallback ('_World state unavailable: provider error_') rather than cascade failure. (2026-03-11)

- **Problem solved:** Ava entry point aggregates heterogeneous world state (project management + engineering execution + brand context). Any layer could be unavailable or slow.
- **Why this works:** Each layer has different SLA and failure modes. PM might be stale, LE might be slow. Degrading independently ensures Ava can operate with partial information rather than blocking.
- **Trade-offs:** Adds error handling complexity in each layer but preserves Ava operability. Briefing output clarity slightly reduced when layer unavailable.

#### [Pattern] Adapter pattern via BriefingWorldStateProvider interface: briefing.ts remains framework-agnostic (no imports from apps/server, no direct service dependencies) by delegating to provided interface implementation rather than instantiating services directly. (2026-03-11)

- **Problem solved:** Briefing framework must live in packages/mcp-server (MCP tool registration) but world state assembly lives in apps/server (PM/LE services). Module boundary violation if direct coupling.
- **Why this works:** Adapter pattern inverts dependency: framework depends on interface contract, not concrete implementation. Allows apps/server to provide implementation without cyclic imports.
- **Trade-offs:** Extra abstraction layer adds indirection (BriefingWorldStateProvider interface) but enables clean module separation. Interface contract becomes documentation.

### PMProjectQueryService uses synchronous service boundary (queries LeadEngineerWorldStateProvider via sync call) rather than spawning LE as child subagent, even though PM is itself delegated by Ava. (2026-03-11)

- **Context:** Ava delegates to PM, PM needs LE status. Could structure as: Ava→PM(subagent)→LE(subagent), but SDK limits to single subagent level.
- **Why:** SDK single-level constraint means LE cannot be a child subagent of PM subagent. Synchronous service call stays within single level: Ava delegates to PM (one level), PM queries LE as service (not subagent).
- **Rejected:** Async subagent model (Ava→PM→LE hierarchy) violates SDK. Sequential async/await in PM would require LE to be subagent.
- **Trade-offs:** PM is synchronous query service (not async subagent), which means PM cannot parallelize LE queries or benefit from subagent infrastructure (tool use, reasoning). But stays within SDK constraints.
- **Breaking if changed:** Removing SDK single-level constraint would allow LE to become child subagent, enabling async parallelism and tool use within LE context.

#### [Pattern] Client reconnection on URL change: invalidateHttpClient() calls reconnect() on existing singleton before nulling it, ensuring WebSocket gracefully switches to new URL rather than just creating a new client (2026-03-11)

- **Problem solved:** When user changes server URL at runtime, HTTP client must reconnect to new origin without losing in-flight request context
- **Why this works:** Simply nulling and recreating the client doesn't guarantee graceful reconnection. Explicit reconnect() signals active client to switch endpoints before being replaced. Prevents race conditions between old/new connections.
- **Trade-offs:** Slightly more complex invalidation logic but ensures clean connection switching. Without this, users might see hung requests when switching URLs.

#### [Pattern] localStorage-as-side-channel pattern: Store writes serverUrlOverride to localStorage, auth layer reads from localStorage instead of store directly (2026-03-11)

- **Problem solved:** Multiple layers (UI, auth, HTTP client) need access to current server URL. Store is UI state source-of-truth, but auth.ts must resolve URL before store might be initialized
- **Why this works:** Avoids circular dependencies and initialization order issues. localStorage acts as a fast side-channel for auth layer to get current URL without depending on store availability. Store manages UI state; localStorage manages runtime configuration.
- **Trade-offs:** Adds localStorage sync overhead but decouples layers. Easier to reason about when store writes, auth reads, without waiting for store hydration.

### Multi-level fallback chain for server URL: localStorage → Electron IPC cache → VITE_SERVER_URL env var → hostname default (2026-03-11)

- **Context:** App runs in multiple environments (web, Electron, local dev). Each has different configuration source. Need single getServerUrl() that works everywhere.
- **Why:** Progressive specificity: localStorage is most specific (user override), Electron IPC is app-level (Electron main process config), env var is build-time, hostname default is bare-minimum fallback. Each level handles a specific deployment scenario.
- **Rejected:** Single source of truth (e.g., only env var) - would require rebuilds for server changes in Electron, wouldn't support user overrides
- **Trade-offs:** Flexibility across environments but implicit fallback chain is not self-documenting. If someone adds a new fallback level, they must understand the precedence order.
- **Breaking if changed:** Removing any fallback level breaks that deployment scenario. Removing localhost default breaks offline-first behavior. Removing env var breaks web builds.

#### [Pattern] Guard integrated into BOTH `createAutoModeOptions()` and `createChatOptions()` to apply across all execution contexts (agents and chat). (2026-03-11)

- **Problem solved:** Worktree isolation needed for multiple SDK consumer types. Could apply guard only to agent execution but that leaves chat mode vulnerable.
- **Why this works:** Defense in depth across all contexts that can spawn agents or tools. Single vulnerability surface (one guard implementation) applied universally.
- **Trade-offs:** Slightly broader hook surface (some overhead in non-agent chat) but uniform security posture. Simpler to maintain and audit.

### Used @tanstack/react-query with 5-minute stale time instead of SWR (spec suggested SWR pattern) (2026-03-11)

- **Context:** Hook needed SWR-like caching behavior for command list
- **Why:** Project standardizes on React Query. 5-minute stale time approximates SWR's revalidation strategy while using the established data-fetching library
- **Rejected:** Implement SWR directly; useEffect + useState fetch pattern
- **Trade-offs:** React Query adds dependency but provides consistent patterns across codebase; 5min stale time is slower revalidation than SWR's default ~2s, reducing server load but potentially stale command data
- **Breaking if changed:** Switching to SWR would require rewriting hook entirely; changing stale time affects how often command list refreshes

### Fallback chain for server URL resolution: localStorage override → Electron IPC → env var → relative URL (2026-03-11)

- **Context:** Need to support runtime switching (localhost → staging → prod), build-time configuration, and fallback to relative paths
- **Why:** Runtime override must win (user explicitly chose), then build-time config (dev/staging/prod builds), then sensible default (relative URLs work in all contexts). Order matters because earlier sources take precedence.
- **Rejected:** Single config source would simplify but eliminate runtime switching; hard-coded URL would require rebuild for each server change
- **Trade-offs:** Multiple sources of truth require coordination, but enables dev-time switching without rebuilding. IPC layer couples to Electron packaging.
- **Breaking if changed:** Removing localStorage check breaks runtime overrides entirely. Removing IPC breaks Electron-packaged builds. Removing env fallback makes server URL always relative.

#### [Pattern] App-store is single source of truth (SSoT) for server URL state; localStorage is persistence layer only (2026-03-11)

- **Problem solved:** Server URL override needs to survive page reloads and be accessible to all components
- **Why this works:** Reading from app-store ensures all components see same value and react to changes. localStorage is only for persistence. Alternative of reading localStorage directly would bypass state updates and create stale reads.
- **Trade-offs:** App-store is initialized from localStorage on boot (extra load path), but all runtime access goes through SSoT. Easier to test (mock app-store, not localStorage).

#### [Pattern] localStorage keys are namespaced with 'automaker:' prefix to avoid collisions (2026-03-11)

- **Problem solved:** Multiple apps/extensions may use same localStorage in browser; must prevent silent data corruption
- **Why this works:** Raw keys like 'serverUrlOverride' could collide with other code (third-party scripts, extensions, other apps in same domain). Collision would cause one app to overwrite another's data silently. Prefix isolates namespace.
- **Trade-offs:** Slightly longer keys, but prevents silent data corruption. Easy to adopt (just prepend prefix everywhere).

#### [Pattern] Dual-layer connection invalidation: HTTP client cache AND WebSocket reconnection triggered atomically in single setServerUrlOverride() action, not as separate concerns (2026-03-11)

- **Problem solved:** Server URL changes require both HTTP and WebSocket connections to be reset. If only one is invalidated, stale connections persist.
- **Why this works:** Clients use both HTTP (REST) and WebSocket (long-lived) for communication. Either being stale breaks the app. Atomic action ensures consistency.
- **Trade-offs:** Tighter coupling in action handler, but guarantees consistency. Alternative is distributed invalidation logic (harder to reason about)

### State shape separates serverUrlOverride (transient selection) from recentServerUrls (persistent history) rather than merging into single state object (2026-03-11)

- **Context:** Need to track current server URL override separately from user's browsing history of server URLs for dropdown UI
- **Why:** Separates concerns: override is ephemeral app state (doesn't persist on reload), recentServerUrls is user preference (persisted to localStorage). Different lifecycles require different shapes.
- **Rejected:** Single recentServers array with 'active' flag would conflate current choice with history
- **Trade-offs:** Slightly more verbose state definitions, but clearer intent and prevents accidental history pollution
- **Breaking if changed:** If merged into one array/object, setting override would add it to history, filling history with transient choices instead of intentional visits

### HTTP client invalidation via singleton recreation + explicit WebSocket closure rather than creating new client instances (2026-03-11)

- **Context:** Runtime server URL switching requires disconnecting old WebSocket and establishing new connection
- **Why:** Preserves other client state and connection pool efficiency. Singleton pattern ensures single source of truth for HTTP/WebSocket connections across entire app.
- **Rejected:** Create new HTTP client instance per URL change - would abandon connection pooling and force re-initialization of all client middleware
- **Trade-offs:** Requires explicit closure logic (must call invalidateHttpClient) vs simpler new-instance approach; gained: connection reuse and state preservation; lost: simplicity of stateless creation
- **Breaking if changed:** Removing explicit WebSocket close leaves dangling connections; removing singleton pattern breaks connection pooling assumptions throughout codebase

#### [Pattern] Layered configuration precedence: localStorage (runtime override) > env vars (build time) > Electron cache (platform persistence) (2026-03-11)

- **Problem solved:** Supporting multiple override sources (users switching servers at runtime, CI passing config, platform-specific storage) without conflicts
- **Why this works:** Allows high-priority runtime changes (localStorage) to shadow build-time config without requiring env var updates. Each layer has appropriate lifetime and trust level.
- **Trade-offs:** Gained: flexibility across deployment models; lost: potential confusion about which source is active

#### [Pattern] Context-bridging wrapper component: ChatInputWithSlashCommands placed inside PromptInputProvider to bridge useSlashCommands hook (context-dependent) to ChatInput's component-prop interface (2026-03-11)

- **Problem solved:** useSlashCommands needs input value from context, but ChatInput expects props; mismatch between hook and component APIs
- **Why this works:** Keeps context dependencies localized within provider scope. Alternatives (prop-drilling value/setValue down) would create prop tunneling and tight coupling between parent and ChatInput. Wrapper makes the context dependency explicit and contained.
- **Trade-offs:** One extra wrapper component adds indirection, but clear separation of concerns—PromptInputProvider owns state, wrapper owns the bridge logic

### PromptBuilder canonical location is `libs/prompts/src/prompt-builder.ts`; execution-service uses it for phase-aware prompt assembly (2026-03-11)

- **Context:** ExecutionService builds prompts for EXECUTE, PLAN, and REVIEW phases. First refactored to use a local `PromptBuilder` in `apps/server/src/lib/prompt-builder.ts` (commit 94c5833cb), then the canonical reusable version was extracted to `libs/prompts/src/prompt-builder.ts` (commit fd4511683) and exported from `@protolabsai/prompts`.
- **Why:** Named sections (`SectionName` enum: ENVIRONMENT, TASK, CONTEXT, TOOLS, CODING_STANDARDS, TESTING, COMMIT_RULES, COMMUNICATION) make prompt structure explicit and auditable. Phase filtering (`options.phase?: string | string[]`) automatically excludes sections not relevant to the current phase. Priority ordering (`options.priority?: number`, lower = earlier) controls section sequence. Conditional predicates (`options.conditional?: () => boolean`) allow runtime exclusion. Output format: `## SECTION_NAME\n\ncontent` sections joined with `\n\n---\n\n`.
- **Usage:** `new PromptBuilder().setPhase('EXECUTE').addSection(SectionName.TASK, content, { priority: 1 }).build()`
- **Breaking if changed:** If PromptBuilder is removed, phase-aware filtering must be re-implemented inline. If section names in `SectionName` enum are changed, callers break without a migration path. If output separator (`\n\n---\n\n`) is changed, downstream parsers expecting section boundaries break silently.

### PostExecutionMiddleware extracted from ExecutionService.executeFeature() finally block (2026-03-11)

- **Context:** The cleanup logic that runs on every agent exit path (success, error, timeout, abort) was previously inline in `executeFeature()`. Extracted to `PostExecutionMiddleware` in `apps/server/src/services/auto-mode/post-execution-middleware.ts` (commit 5f2d2e46b).
- **Why:** Guarantees cleanup runs on ALL exit paths. Five steps in order: (1) recover uncommitted work, (2) fire abort controller, (3) remove worktree lock, (4) remove from runningFeatures map, (5) persist execution state.
- **Breaking if changed:** If PostExecutionMiddleware is bypassed or steps removed, lock files accumulate blocking future agent runs, running features map becomes stale, and uncommitted work is silently stranded.

### Tool profiles define named capability sets per agent role: execution (10 tools), orchestration (full), review (read-only) (2026-03-11)

- **Context:** Trajectory analysis of `.automaker/trajectory/` revealed execution agents consistently use ~10 tools; Ava/orchestration agents use the full set; review agents need read-only access only. Codified in `libs/tools/src/tool-profiles.ts` (commit cd02a8529), exported from `@protolabsai/tools`.
- **Why:** Minimal tool sets reduce attack surface and token usage per agent type. Profiles serve as living documentation of which tools each role needs (with rationale per tool). Three profiles: `execution` (list_features, get_feature, update_feature, request_user_input + Claude Code built-ins), `orchestration` (all board CRUD + Discord + GitHub PR + claude-code delegation + full Claude Code built-ins), `review` (read-only board/project + PR status + discord_read_channel + Read/Glob/Grep — no write tools).
- **API:** `getToolsForProfile(profile: ToolProfileName): readonly string[]`, `getProfile(profile): ToolProfile`, `listProfileNames(): ToolProfileName[]`
- **Breaking if changed:** If a tool is renamed in SharedTool registration without updating the profile, that tool silently disappears from the profile. If a profile is removed, any agent wired to it falls back to no tool restriction (full access). If execution profile is expanded, agents get unintended capabilities — narrowing is safe, widening is risky.

### Per-phase temperature routing via `resolvePhaseTemperature()` in `libs/model-resolver` (2026-03-11)

- **Context:** Agent execution phases have different creativity requirements — planning needs creative exploration, implementation needs determinism, review needs balanced evaluation. Added `PhaseTemperaturesConfig` type and `DEFAULT_PHASE_TEMPERATURES` in `libs/types/src/workflow-settings.ts`, and `resolvePhaseTemperature()` in `libs/model-resolver/src/resolver.ts` (commit 715424800).
- **Why:** Hard-coding a single temperature across all phases (or leaving it at provider default) gives suboptimal results. Configurable per-phase temperatures allow tuning without code changes. When `phaseTemperatures` is absent from WorkflowSettings, `resolvePhaseTemperature()` returns `undefined`, preserving provider default behavior.
- **Defaults:** `PLAN=1.0` (max creative exploration), `EXECUTE=0` (fully deterministic implementation), `REVIEW=0.5` (balanced evaluation).
- **API:** `resolvePhaseTemperature(phase: 'PLAN' | 'EXECUTE' | 'REVIEW', phaseTemperatures?: PhaseTemperaturesConfig): number | undefined`
- **Breaking if changed:** If `DEFAULT_PHASE_TEMPERATURES` values are changed, all agents without explicit WorkflowSettings get different behavior immediately. If `resolvePhaseTemperature()` is removed, callers must either hard-code temperature or lose per-phase differentiation. If the `phaseTemperatures` field is removed from `WorkflowSettings`, existing persisted settings files have an unknown field (benign but stale).

### ToolRegistry error boundary converts thrown exceptions to structured error responses (2026-03-11)

- **Context:** Tool execution errors previously propagated as exceptions that could crash the agent session. `ToolRegistry.execute()` now wraps all tool calls in an error boundary (commit befe3e279).
- **Why:** The LLM should receive structured error context (toolName, errorMessage, recoveryHint) to attempt recovery rather than the session crashing. Always resolves; never throws.
- **Breaking if changed:** If error boundary is removed, tool errors crash the agent session rather than giving the LLM a chance to recover. If recoveryHint is removed from metadata, LLM has less guidance on how to proceed after a failure.

#### [Gotcha] CLAIM_VERIFY_DELAY_MS (200ms setTimeout/re-read pattern in claim()) was based on false assumption that remote peers could mutate the Automerge doc. Features are strictly local-only; only the owning instance mutates the doc. (2026-03-12)

- **Situation:** Inherited synchronization pattern from distributed system design that didn't match actual architecture.
- **Root cause:** Code assumed distributed consensus settling was needed for claim ownership. Actually unnecessary because features never receive remote mutations.
- **How to avoid:** Claim operations became instant instead of 200ms+ delayed. Safe because local-only semantics eliminate race conditions.

### Removed applyRemoteChanges() and getDocBinary() methods — part of abandoned cross-instance CRDT sync model from db8801061. (2026-03-12)

- **Context:** Dead code that persisted years after the feature-sync model was abandoned, never called from production.
- **Why:** Dead code accumulates technical debt and obscures actual system behavior. Historical commit analysis confirms model is abandoned.
- **Rejected:** Keeping for 'future compatibility' or gradual deprecation period.
- **Trade-offs:** Cleaner, smaller surface area. But requires confidence in git history and grep verification before removal.
- **Breaking if changed:** If code was being called via reflection/dynamic dispatch or in untested code paths, removal would break those.

#### [Pattern] Scope boundary pattern: CLAIM_VERIFY_DELAY_MS exists in both AutomergeFeatureStore AND work-intake-service.ts with different values/purposes. Each service has own claim logic. (2026-03-12)

- **Problem solved:** Similar constants/methods across services can mask that they solve different problems with different timing requirements.
- **Why this works:** Services have different claim semantics (work-intake is multi-step workflow, automerge is local feature ownership). Unifying constants would break both.
- **Trade-offs:** Code duplication, but each service can optimize for its actual constraints. Prevents accidental coupling.

### Left JSON wire format string 'feature_event' unchanged while renaming TypeScript type CrdtFeatureEvent → CrdtSyncWireMessage (2026-03-12)

- **Context:** Refactoring type name for semantic clarity (type carries all wire messages, not just feature events), but need to maintain wire protocol stability for remote peer compatibility
- **Why:** Wire format is a JSON protocol contract over WebSocket; TypeScript identifiers are internal. Decoupling them prevents breaking remote peers running older code
- **Rejected:** Renaming wire format string to 'sync_wire_message' would achieve naming consistency but breaks peers on old versions
- **Trade-offs:** Slightly confusing having a type named 'SyncWireMessage' with wire value 'feature_event', but gains backwards compatibility
- **Breaking if changed:** If wire format string is changed, any remote peer with old code fails to deserialize the message

#### [Gotcha] ProtoConfigHive type had instanceId field but YAML hive block never populated it (hiveId/syncPort/meshEnabled only). Type and schema were out of sync — dead type field never used in practice. (2026-03-12)

- **Situation:** Removing vestigial hive config revealed type/schema mismatch
- **Root cause:** TypeScript types were defined defensively but not validated against actual YAML structure; no enforcement that typed fields are populated
- **How to avoid:** Discovered dead code only by systematic review; better to validate typed fields at runtime or in tests

### Consolidated instance identity resolution: protolab.instanceId (explicit) → hivemind.instanceId → hostname registry match → os.hostname(). Stored result in protolab.instanceId, not hive.instanceId. (2026-03-12)

- **Context:** Multiple fields capable of holding instanceId; unclear priority when multiple defined
- **Why:** Establishes single source of truth in protolab; explicit config takes precedence over derived/fallback values; prevents silent surprises from stale values
- **Rejected:** Keep hive.instanceId as separate path (adds complexity, was never populated); treat all sources equally (ambiguous precedence)
- **Trade-offs:** Code path is clearer and testable; requires explicit migration of existing protolab configs, but this was already the practice
- **Breaking if changed:** Code reading config.hive.instanceId returns undefined; must use config.protolab.instanceId. Env var PROTO_HIVE_INSTANCE_ID now sets protolab.instanceId (redirect preserves intent)

#### [Pattern] LegacyProjectDoc intersection type (Partial<ProjectDocument> & { prd?: string | SPARCPrd; milestoneCount?: number }) enables safe backwards-compatible normalizers without type-casting to `any` (2026-03-12)

- **Problem solved:** Normalizer must handle wire format fields (legacy string prd, milestoneCount) that don't exist in the final ProjectDocument type
- **Why this works:** Preserves type safety across both legacy and new field shapes; documents the migration contract explicitly; compiler catches if normalizer accesses undefined fields
- **Trade-offs:** Slightly more verbose type signature but eliminates entire class of runtime errors where normalizer might access non-existent fields

### Three-layer legacy migration in normalizeProjectDocument: (1) missing milestones → [] (2) string prd → SPARCPrd with approach field, empty other fields (3) missing phase.executionStatus → 'unclaimed' (2026-03-12)

- **Context:** Expanding thin ProjectDocument schema from 7 fields to 40+; old CRDT documents in the wild won't have new fields
- **Why:** Ensures old documents normalize without errors; allows incremental schema evolution; defaults are domain-safe (empty milestones = no work, unclaimed phases = ready to assign)
- **Rejected:** Requiring migrations to be re-written (breaks old data); failing on missing fields (requires data repair); making fields mandatory (incompatible with old docs)
- **Trade-offs:** Migration layers hide incompleteness (old string prd loses structure); requires testing each migration path; easier than data repair tool but creates technical debt if migrations are forgotten
- **Breaking if changed:** Removing any migration layer causes old documents to fail normalization or normalize incorrectly (e.g., if milestones migration is removed, documents without milestones array will have undefined milestones field)

### Replaced denormalized milestoneCount: number with milestones: Milestone[] array. Consumers switch from `doc.milestoneCount` to `doc.milestones.length`. (2026-03-12)

- **Context:** Schema expansion to align with full Project type; thin stub had only denormalized count
- **Why:** Normalizes the data model (single source of truth); enables accessing milestone details; aligns with Project domain model
- **Rejected:** Keeping both milestoneCount and milestones (dual representation); computing count on write (extra work in every create/update)
- **Trade-offs:** Easier to work with milestone data; breaking change for code reading milestoneCount directly; length computation is negligible (O(1) for arrays)
- **Breaking if changed:** Any code accessing doc.milestoneCount will read undefined. Normalizer doesn't include milestoneCount in output, so migrations must update all readers.

#### [Gotcha] Phase.executionStatus defaults to 'unclaimed' when missing in legacy documents, implicitly assuming all old phases are unassigned. Different default (e.g., 'executing') would change bulk semantics. (2026-03-12)

- **Situation:** Legacy thin Milestone objects may not have phases with executionStatus fields; normalizer must supply a default
- **Root cause:** 'unclaimed' is safest domain default (allows re-assignment); prevents false assumption that old phases are already executing
- **How to avoid:** Bulk operation on old projects will show all phases as unclaimed (may require claiming/reassigning work); safe but creates operational overhead

#### [Gotcha] Relative path resolution diverges when different processes run from different working directories. MCP server runs from monorepo root, actual server runs from apps/server/, causing ./data to resolve to different locations (automaker/data vs apps/server/data) (2026-03-12)

- **Situation:** Debugging stale logs that appeared 12+ hours old despite server being fresh; logs were actually from a different file path entirely
- **Root cause:** Relative paths like ./data are resolved against the process's CWD; when CWD differs, the same path string resolves to completely different filesystem locations
- **How to avoid:** Using relative paths is convenient (portable), but creates fragility across process boundary; absolute paths are more explicit but less portable

### When two systems can compute the same value differently (log path), make the system actually using it the authoritative source via API, rather than duplicating computation logic in both places (2026-03-12)

- **Context:** MCP and server both needed to know log path; path computation diverged due to CWD mismatch; had to choose between option 1 (API) or option 2 (agreed absolute path in both)
- **Why:** Server is the authoritative source (it's the one writing logs); eliminates coordination overhead; automatically handles environment variations (DATA_DIR changes, path overrides, etc.); enables correct fallback logic for server-down case
- **Rejected:** Option 2 (hardcode agreed absolute path in both MCP and server code) fails when environment changes; creates maintenance burden of keeping two code paths in sync
- **Trade-offs:** One extra network hop when server is up (acceptable cost for observability); enables working offline with corrected logic; eliminates future path divergence
- **Breaking if changed:** If API contract changes without updating fallback logic, or if getServerLogPath() implementation changes without verifying fallback still works

#### [Pattern] When adding an API dependency to replace buggy fallback logic, the fallback must be corrected too (not kept in old buggy state) to avoid regression when the API is unavailable (2026-03-12)

- **Problem solved:** Adding GET /api/health/log-path meant old fallback path (AUTOMAKER_ROOT/data/server.log) was still used when server down; had to decide whether to fix fallback or keep it for 'compatibility'
- **Why this works:** Partial fixes create maintenance debt and confusion; when server is down, tool should still work correctly; fallback path serves the same purpose (reading logs) so it must have same fix
- **Trade-offs:** Fixing fallback requires understanding root cause deeply (more work upfront), but prevents cascading bugs and ensures consistent behavior in all modes (server up/down)

### Services (updatePhaseClaim, saveProjectMilestones) write to disk AND auto-emit project:updated when CRDT is enabled. syncProjectToCrdt() is the escape hatch for external callers that write project.json themselves and need to sync the in-memory doc. (2026-03-12, corrected 2026-03-12)

- **Context:** Both `updatePhaseClaim()` and `saveProjectMilestones()` in ProjectService include CRDT doc updates and `this._crdtEvents?.emit('project:updated', ...)` when `_isCrdtEnabled()` returns true. Emission is part of the service method, not the caller's responsibility.
- **Why:** Atomicity: disk write + Automerge doc update + event emission are a single logical operation. Callers (WorkIntakeService, route handlers) don't need to remember to fire a separate event.
- **syncProjectToCrdt() use case:** Routes that bypass the service (e.g., directly write project.json via the create/update route handler) and only need to sync the in-memory doc without a disk re-write should call `syncProjectToCrdt()` explicitly.
- **Trade-offs:** Caller simplicity (one call does everything) vs reduced flexibility for batch operations that want to suppress intermediate events. `syncProjectToCrdt()` remains the escape hatch.
- **Breaking if changed:** If `_crdtEvents?.emit(...)` calls are removed from these methods, WorkIntakeService phase claims and PM agent milestone saves will stop propagating to remote peers silently.

#### [Pattern] Tests simulate event-driven sync (EventBus → persistRemoteProject) without real WebSockets. crdt-sync.module.ts wiring is tested indirectly through event flow, not transport layer. (2026-03-12)

- **Problem solved:** Full WebSocket transport testing would require multi-instance setup and async coordination
- **Why this works:** Decouples sync logic from transport. EventBus mocks are faster and deterministic. Real transport is tested in e2e/staging.
- **Trade-offs:** Unit-level sync logic confidence vs. transport-layer coverage. Transport bugs won't be caught here; rely on e2e tests.

#### [Pattern] Reused existing CRDT event bridge pattern for categories sync instead of creating new synchronization mechanism (2026-03-12)

- **Problem solved:** Multi-instance category state needed to propagate from one server to remote peers without implementing new cross-instance communication
- **Why this works:** Event bridge already intercepts broadcast() calls and filters against CRDT_SYNCED_EVENT_TYPES before forwarding to remotes; avoids duplicating setRemoteBroadcaster logic
- **Trade-offs:** Gained zero-overhead reuse of proven sync pattern; traded away ability to customize remote propagation semantics per-event-type

### Remote handler writes to container.repoRoot, not payload.projectPath, when receiving categories:updated from peer (2026-03-12)

- **Context:** CRDT sync handler needs to write categories.json to correct filesystem after receiving remote event
- **Why:** Remote handlers execute in receiving server's context; container.repoRoot is that server's canonical project root. Using payload.projectPath would write to wrong location on multi-instance setup
- **Rejected:** Could naively use payload.projectPath for all handlers; would work single-instance but fail in distributed deployments
- **Trade-offs:** Correct location guaranteed; requires discipline that all remote handlers understand they receive events about OTHER servers' changes
- **Breaking if changed:** If handler uses payload.projectPath instead of container.repoRoot, multi-instance sync writes to wrong filesystem and data diverges

#### [Gotcha] Categories route exists but unreachable because not registered in apps/server/src/server/routes.ts (2026-03-12)

- **Situation:** Route module created with POST endpoints but no HTTP server actually serves it
- **Root cause:** Intentional scope discipline: 'files to modify' list didn't include routes.ts, preventing scope creep from route->routes registration
- **How to avoid:** Clear task boundaries and prevented scope expansion; feature incomplete without separate routes.ts registration step

### Made memoryStats a required field in MetricsDocument schema despite having a schema-on-read normalizer with defaults. This forces all getOrCreate call sites with initialData to provide the field explicitly. (2026-03-12)

- **Context:** Schema evolution in distributed CRDT document. Could have made field optional (memoryStats?) since normalizer provides default.
- **Why:** Compile-time safety over avoiding collateral updates. Discovered dora.ts bug at typecheck time rather than runtime.
- **Rejected:** Optional field would avoid the dora.ts fix, but would allow silent bugs where initialData omits the field and relies on runtime normalizer.
- **Trade-offs:** Required field: compile-time catch of issues vs requires updating all call sites. Optional field: faster migration vs runtime reliance on normalizer.
- **Breaking if changed:** If field made optional, code can construct MetricsDocument without memoryStats, shifting safety to runtime. If made required post-hoc, MUST grep all getOrCreate<MetricsDocument> call sites.

#### [Pattern] Fire-and-forget pattern for non-critical CRDT writes: crdtWriter(...).catch(...) does not block caller. Disk YAML remains primary store, CRDT is secondary distributed signal. (2026-03-12)

- **Problem solved:** Memory usage stats need to be tracked across hivemind instances (CRDT) but cannot block individual agent work if CRDT is slow/unavailable.
- **Why this works:** Separation of concerns: primary store (disk) guarantees availability for single instance. CRDT eventual consistency is additive. Agent work continues even if distributed write fails.
- **Trade-offs:** Non-blocking: fast, resilient to CRDT failures vs eventual consistency (brief window where CRDT lags disk). Best for non-critical telemetry.

#### [Gotcha] Adding required field to CRDT document schema requires finding and updating ALL getOrCreate<MetricsDocument> call sites that provide initialData. TypeCheck caught one (dora.ts), but this is a class of invisible bugs in monorepos. (2026-03-12)

- **Situation:** dora.ts was constructing MetricsDocument initial value without memoryStats field. Only discovered at typecheck, not at design time.
- **Root cause:** Required field enforcement means initialData objects are now type-invalid if memoryStats is missing. TypeScript catches it, but requires knowledge of all call sites.
- **How to avoid:** Required field: safety, caught early vs requires discipline/tooling to find all sites. Optional field: easier migration vs silent bugs if normalizer isn't applied.

#### [Pattern] Dual-write backwards compatibility: update disk (YAML frontmatter) first, then CRDT second (fire-and-forget). Single-instance deployments continue working if CRDT write fails. (2026-03-12)

- **Problem solved:** Migrating to CRDT-based memory tracking while maintaining single-instance safety. Existing code reads from disk; new code reads from CRDT.
- **Why this works:** Primary store (disk) guarantees single-instance correctness. CRDT is new, optional, might fail/lag. Disk-first means system survives CRDT failures.
- **Trade-offs:** Dual-write: simple (update both, caller gets best-effort) vs temporary inconsistency if CRDT lags disk. Data duplication across stores.

### Idempotency check uses in-memory registry (store.getRegistry()) rather than filesystem state or mtime comparison (2026-03-12)

- **Context:** hydrateNotesWorkspace() needs to avoid re-seeding the CRDT document on repeated server starts
- **Why:** Registry is already loaded during store initialization; checking it is O(1) and doesn't require I/O. Treats registry as source of truth post-startup.
- **Rejected:** Alternative: check if .automaker/notes/workspace.json exists on disk, or compare mtime. Rejected because adds I/O latency and mtime can be unreliable across deployments.
- **Trade-offs:** Faster startup vs. creates coupling to registry population logic. If registry initialization fails silently, idempotency breaks and hydration could re-run.
- **Breaking if changed:** If registry key 'notes:workspace' is cleared or registry is reset without document deletion, hydration will re-run and potentially overwrite CRDT state.

### Separate DiskNoteTab and DiskNotesWorkspace interfaces decoupled from CRDT NoteTab and NotesWorkspaceDocument (2026-03-12)

- **Context:** Disk format (numeric timestamps, optional permissions/metadata) differs from CRDT runtime format (ISO strings, strict typing)
- **Why:** Decouples persistence layer from domain model. Allows evolution of CRDT schema (add fields, change types) without changing disk format, or vice versa.
- **Rejected:** Alternative: use NotesWorkspaceDocument directly for disk serialization. Rejected because couples schema evolution—any CRDT change requires migration.
- **Trade-offs:** Flexibility vs. maintenance burden: two interfaces to keep in sync, explicit mapping code in hydration function.
- **Breaking if changed:** If disk format needs to change in future, mapping logic in hydrateNotesWorkspace() must be updated and made backward-compatible.

#### [Pattern] Namespace prefix pattern: uses 'notes:workspace' as registry key (domain:documentId) to allow multiple documents under same domain (2026-03-12)

- **Problem solved:** Store registry holds documents from multiple domains (calendar, todos, avaChannel); needs to disambiguate notes documents
- **Why this works:** Enables future documents under 'notes' domain (e.g., 'notes:trash', 'notes:archived') without key collisions. Scalable design.
- **Trade-offs:** Clear namespacing vs. hardcoded separator logic; adding new document types requires updating hydration and registry lookup

### Runtime state files migrated from .automaker/ subdirectories to DATA_DIR (2026-03-12)

- **Context:** Previously, metrics, session, PR tracking, and ceremony state files were scattered under `.automaker/` in the repo root and `apps/server/.automaker/`. Moved to `DATA_DIR` (env var `DATA_DIR`, defaults to `./data`) so runtime state is cleanly separated from repo-tracked config.
- **Affected services and new paths:**
  - `ErrorBudgetService`: constructor takes `dataDir`; path is `DATA_DIR/metrics/error-budget.json`
  - `MetricsCollectionService`: new `dataDir` parameter; path is `DATA_DIR/metrics/dora.json`
  - `PRFeedbackService`: new `dataDir` parameter; path is `DATA_DIR/pr-tracking.json`
  - `LeadEngineerSessionStore`: `deps.dataDir` required; path is `DATA_DIR/lead-engineer-sessions.json`
  - `CeremonyService`: call `setDataDir(dataDir)` after construction; path is `DATA_DIR/ceremony-state/{slug}.json`
- **One-time migration:** `migrateRuntimeStateFiles()` in `startup.ts` runs at server start, moving old files from `.automaker/` paths to new `DATA_DIR` paths. Idempotent — skips files that don't exist at old location.
- **Breaking if changed:** If `dataDir` is not passed to these services (or `setDataDir()` not called on `CeremonyService`), services fall back to CWD-relative paths which diverge between MCP server and app server processes.

### LeadEngineerSessionStore consolidated from per-project files to a single multi-project file (2026-03-12)

- **Context:** Previously stored one `lead-engineer-sessions.json` per project path. Now uses a single `DATA_DIR/lead-engineer-sessions.json` with structure `{ sessions: Record<string, PersistedSessionData>, savedAt: string }`.
- **Why:** Eliminates the need to enumerate all project paths at restore time. `findProjectsWithSessions()` was fragile — it scanned settings for project paths and checked each for a session file. Single file with keyed map is simpler and survives project path changes.
- **Rejected:** Per-project files with a shared index; keyed map achieves the same lookup without extra indirection.
- **Breaking if changed:** If the file format reverts to per-project, `restoreSessions()` must re-implement project enumeration. Old per-project files are migrated by `migrateRuntimeStateFiles()` at startup (only the top-level `lead-engineer-sessions.json`).

### Pre-flight rebase conflict blocks feature execution instead of proceeding on stale base (2026-03-12)

- **Context:** Previously, when a pre-flight rebase onto `origin/main` (or `origin/dev`) detected merge conflicts, auto-mode logged a warning and let the agent proceed on the conflict-ridden branch. This caused repeated `merge_conflict` failures wasting execution cycles.
- **Why:** Setting status to `blocked` with a clear `statusChangeReason` stops the wasted execution and surfaces the required manual action (human must resolve conflicts and rebase). Both `AutoModeService` and `ExecutionService` apply this gate for initial execution and follow-up execution paths.
- **Follow-up path detail:** `AutoModeService` captures the conflict reason in `followUpConflictReason` before the rebase try/catch block, then checks and throws after it — this ensures the block-and-throw runs outside the rebase catch scope.
- **Breaking if changed:** Reverting to warning-only would resume repeated merge_conflict failures for stale branches. The `blocked` status is the only signal to the human that manual rebase is needed.

#### [Pattern] Path helpers delegate validation to composed parent function (getProjectDir → validateSlugInput). Validation is inherited implicitly, not validated at each helper level. (2026-03-13)

- **Problem solved:** getResearchMdPath and getResearchArtifactDir both call getProjectDir internally, which handles slug validation automatically.
- **Why this works:** Composition pattern reduces duplication — validate once at the base level, all derived paths inherit safety. Single source of validation rules.
- **Trade-offs:** Implicit validation easier to maintain (rules in one place) but harder to trace — caller can't see validation happening without reading implementation.

### Introduced nested artifact directory convention: artifacts/research-report/ subdirectory under project slug, rather than flat artifact storage. (2026-03-13)

- **Context:** getResearchArtifactDir returns .automaker/projects/{slug}/artifacts/research-report/, establishing a tiered structure for artifact categorization.
- **Why:** Scalable for multiple artifact types (design-doc, specs, reports, etc.) without flat-dir name collision. Organizes by artifact purpose, not by project.
- **Rejected:** Flat structure (.automaker/projects/{slug}/research-report/ or similar) — simpler initially but harder to scale if artifacts diversify.
- **Trade-offs:** Nested structure requires mkdir -p discipline; tools must create intermediate dirs. Improves scalability and clarity; adds filesystem depth.
- **Breaking if changed:** Code expecting artifacts at project root (.automaker/projects/{slug}/research-report/) will fail. Paths are concrete; moving artifacts breaks all references.

### Implemented deep merge for nested `ceremonies` object in SettingsService instead of shallow merge/replacement (2026-03-13)

- **Context:** Updating nested settings (ceremonies.dailyStandup) where multiple sibling properties (enabled, lastRunAt) must persist atomically
- **Why:** Shallow merge would overwrite entire ceremonies.dailyStandup object, losing lastRunAt timestamp when toggling enabled flag. Deep merge preserves all properties in nested objects.
- **Rejected:** Shallow merge or direct property assignment - these would lose sibling properties in the nested object hierarchy
- **Trade-offs:** Deep merge adds algorithmic complexity but guarantees atomicity of related nested properties; follows existing patterns for keyboardShortcuts and phaseModels
- **Breaking if changed:** If reverted to shallow merge, lastRunAt would be lost on every enabled toggle, causing ceremony automation to lose execution history

#### [Gotcha] GlobalCeremoniesConfig type already existed in global-settings.ts but was not exported from package @protolabsai/types index (2026-03-13)

- **Situation:** Monorepo with multiple packages consuming shared types; type defined in one module but not accessible to cross-package consumers
- **Root cause:** Package index exports define the public API boundary; internal module definitions are invisible to consumers using package imports
- **How to avoid:** Explicit exports in index.ts add maintenance burden (must keep in sync) but enforce clean architecture and prevent internal API leakage

### Placed CeremoniesSection component within Developer settings tab rather than creating dedicated /settings/ceremonies route (2026-03-13)

- **Context:** Ceremony automation feature is new and currently scoped to single ceremony type (Daily Standup); room for future expansion to multiple ceremony types
- **Why:** Current scope is minimal; co-locating with other developer settings reduces routing complexity. Component can be extracted later if ceremonies becomes first-class feature.
- **Rejected:** Dedicated settings route - would be premature abstraction given current single-ceremony scope; adds routing maintenance without clear benefit
- **Trade-offs:** Simpler now, requires refactoring if ceremonies expand significantly; temporary placement trades future flexibility for present simplicity
- **Breaking if changed:** If ceremonies system expands to multiple ceremony types and dedicated UX, component placement becomes limiting and requires restructuring settings navigation

### Created synthetic StandupProjectService adapter to convert board-wide context into standup-flow LangGraph API format, rather than modifying the flow or changing data structures (2026-03-13)

- **Context:** standup-flow expects project-scoped milestone and feature arrays; board context is cross-project and flat
- **Why:** Allows standup-flow to remain independent and reusable without coupling to board architecture; adapter layer isolates API contract negotiation
- **Rejected:** Modifying standup-flow to accept board-wide context directly would couple it to this specific board implementation
- **Trade-offs:** Easier to swap standup implementations later; harder to debug data flow through adapter; adapter becomes maintenance debt if standup-flow API shifts
- **Breaking if changed:** If standup-flow changes its input shape, the adapter is the single point of failure for the entire ceremony

#### [Pattern] Multi-level fallback chain for Discord channel resolution: global discord integration → project settings → DISCORD_CHANNEL_DEV env var, with explicit cast to typed interface at each level (2026-03-13)

- **Problem solved:** Discord channel could be configured at global or project level, with env var as safety net; need to resolve without null-coalescing errors
- **Why this works:** Provides configuration flexibility (global team channels vs project-specific) while maintaining clear precedence; explicit typing at each level prevents silent config misses
- **Trade-offs:** Easier deployment (many configs work); harder debugging (which level actually won?); type casting complexity increases but clarity improves

### Dual guards on cron execution: enabled flag AND 20+ hour window since lastRunAt, preventing both admin disable and ceremony fatigue (2026-03-13)

- **Context:** Cron runs every 15 minutes; standup should fire ~once daily but user can pause via settings
- **Why:** Prevents noisy standups even if somehow triggered multiple times; makes enabled flag meaningful beyond just disable; ensures ceremonies stay valuable
- **Rejected:** Single enabled flag would allow accidental multiple-standups-per-day if someone forgets to disable; pure time-based would fire even if already ran that day
- **Trade-offs:** More guardrails = safer; can't get ad-hoc standup without disabling+re-enabling; two conditions to reason about instead of one
- **Breaking if changed:** Removing the 20-hour window reverts to fire-on-demand behavior; removing enabled check removes operator control

#### [Pattern] Cron task registration delegated to SchedulerModule during startup (scheduler.module.ts calls dailyStandupService.initialize), rather than service self-registering (2026-03-13)

- **Problem solved:** Service exists independently; scheduler infrastructure is environment-specific (might not exist in tests or edge environments)
- **Why this works:** Cleanly separates concerns: service logic doesn't depend on scheduler; scheduler module has single entry point for all cron tasks; enables testing service without scheduler infrastructure
- **Trade-offs:** Cleaner testing; requires two files to understand the full flow (service + scheduler); initialization order becomes explicit dependency

### Board-wide standup aggregation (single aggregated standup across all projects) rather than per-project ceremonies (2026-03-13)

- **Context:** Daily standup is implicit team ritual; board context is cross-project; most other features are project-scoped
- **Why:** Standup needs to show team-wide activity to be useful; one daily cadence for whole team prevents ceremony fragmentation
- **Rejected:** Per-project standups would allow project autonomy but fragment communication and require N running agents; project-scoped ceremonies don't capture cross-project dependencies
- **Trade-offs:** Simpler coordination (one ritual); harder to make project-specific later; single point of failure if board data is stale or inconsistent
- **Breaking if changed:** If the architecture moves to project isolation, this artifact model becomes incompatible

#### [Pattern] Fire-and-forget HTTP endpoint with async background execution: endpoint validates input and returns {started: true} immediately while research runs async via runResearch(). Route is separate from service to isolate HTTP concerns. (2026-03-13)

- **Problem solved:** Research operations can be long-running (minutes). Blocking HTTP response would cause client timeout.
- **Why this works:** Decouples request/response cycle from operation duration. Client gets immediate confirmation of acceptance, work proceeds independently. Return value signals initiation success, not completion.
- **Trade-offs:** Easier: client doesn't hang. Harder: client can't track research progress directly via response, needs separate polling or events.

### Double-run guard using researchStatus state flag: method checks if researchStatus === 'running' and returns {started: true} without re-queuing. Idempotent pattern prevents duplicate concurrent research on same project. (2026-03-13)

- **Context:** Multiple API calls or auto-triggers could fire research on same project within milliseconds. Prevent resource waste and conflicting results.
- **Why:** Simple state check is efficient for single-node scenarios. Idempotent behavior (caller gets same response whether it's new or already-running) is correct for async operations.
- **Rejected:** Distributed locking via Redis would be over-engineered for single-node. Unique job IDs in queue would still allow duplicate queue entries.
- **Trade-offs:** Easier: no external dependencies, fast check. Harder: breaks down on multi-node deployments without shared state.
- **Breaking if changed:** If guard is removed, duplicate research jobs could run simultaneously on same project, wasting compute and producing conflicting outputs.

#### [Pattern] Auto-trigger via event listener with conditional filtering: listens for project:lifecycle:initiated event, checks project.researchOnCreate flag before firing research. Decouples research initiation from project creation logic. (2026-03-13)

- **Problem solved:** Want automated research for some projects (those marked for it) but not all. Don't want to hardcode auto-trigger into creation logic.
- **Why this works:** Event-driven architecture allows optional behavior. Conditional flag (researchOnCreate) makes feature toggleable per-project without code changes. Service can subscribe/unsubscribe independently.
- **Trade-offs:** Easier: feature is optional and configurable. Harder: requires event system and listener registration.

### ResearchStatus added to CreateProjectInput so initiate() can set researchStatus: 'idle' atomically at project creation. Status is pre-populated so auto-trigger listener knows project is ready without separate query. (2026-03-13)

- **Context:** Auto-trigger checks researchStatus === 'idle' to decide whether to fire research. If status is set after creation via separate step, race condition where event fires before status is set.
- **Why:** Ensures correct initial state at creation time. Eliminates race between project creation event and status initialization. Event listener can trust status is correct.
- **Rejected:** Setting status in separate step after creation creates race window. Querying project to check status before triggering adds latency.
- **Trade-offs:** Easier: atomic creation with correct state, no races. Harder: slightly more complex CreateProjectInput type.
- **Breaking if changed:** If researchStatus is removed from input, auto-trigger becomes racy: event fires before status can be set, trigger sees undefined/null and skips research.

### Use existing getResearchFilePath() instead of waiting for dedicated getResearchMdPath() function (2026-03-13)

- **Context:** Feature spec referenced getResearchMdPath which doesn't exist yet; getResearchFilePath provides identical path semantics
- **Why:** Pragmatic unblocking: both return same path, avoids cross-phase dependency wait, reduces implementation blocker
- **Rejected:** Wait for platform helpers phase to deliver getResearchMdPath; build custom path resolver inline
- **Trade-offs:** Technical debt: requires refactoring when getResearchMdPath lands; cleaner than inline logic now
- **Breaking if changed:** If getResearchMdPath semantics differ when implemented, this becomes a hot-spot for bugs during refactoring

### Maintain dual research sections in PRD prompt: Codebase Research Findings (automated) vs. Research Findings (pre-existing docs) (2026-03-13)

- **Context:** Added Research Findings section separate from existing Codebase Research Findings in prompt template
- **Why:** Preserves source attribution: distinguishes between dynamically-analyzed code patterns vs. human-curated pre-research; avoids conflating data sources
- **Rejected:** Merge both sections; replace codebase findings with research.md if available
- **Trade-offs:** Two sections provide clarity on provenance but risk redundancy if both sources contain overlapping insights; longer prompt tokens
- **Breaking if changed:** If model training shifts to expect merged research sections, prompt structure becomes suboptimal; if source distinction becomes unimportant, dual sections waste context

#### [Pattern] Optional enrichment files in project structure (research.md, artifacts/) enable specialized workflows without burdening all projects (2026-03-13)

- **Problem solved:** Project lifecycle accommodates both minimal projects (just project.md, project.json) and feature-rich projects that generate research notes and ceremony artifacts
- **Why this works:** Not all projects perform research phase or ceremonies; consumers (PM agent, CeremonyService) handle both cases gracefully. Keeps baseline project structure lightweight.
- **Trade-offs:** Optional files increase documentation complexity (must explain when/why) but maximize flexibility. PM agent must check file existence before consuming.

#### [Pattern] Single-source-of-truth path helpers (getResearchFilePath) in platform layer abstract path construction from consuming code (2026-03-13)

- **Problem solved:** research.md location is computed via getResearchFilePath(projectPath, projectSlug) instead of having path format scattered across PM agent, setup handlers, and docs
- **Why this works:** Path structure can change (e.g., new nesting) without updating every consumer. Centralizes validation of path format. Reduces coupling to path conventions.
- **Trade-offs:** Adds single import/function call cost; gains refactoring safety and consistency. Forces developers to think about path abstraction instead of hardcoding.

### Under resource constraints (96 files changed, tight turn budget), scoped documentation to single file with concrete bugs rather than broad sweep of all affected docs (2026-03-13)

- **Context:** Feature touched many components; could have attempted to update all 96 files' docs or just the one with duplicate section + research.md gaps
- **Why:** One accurate, complete doc is better than 96 partially accurate docs. Correctness > coverage. Duplicate section removal is objective correctness fix, not opinion.
- **Rejected:** Broad doc updates without prioritization would have risked shipping inaccurate docs at scale or missing the quality bar
- **Trade-offs:** Narrow scope is easier to verify and QA. Broader scope risks shipping docs where gaps remain or inaccuracies propagate. Favors depth over breadth.
- **Breaking if changed:** If other docs remain inconsistent with project-lifecycle.md canonical source, new developers will have conflicting references. Single source of truth pattern requires discipline to update all references or none.

### Refactored NewProjectDialog from callback-based (onSubmit/isPending props) to self-contained hook pattern using useCreateProject internally. (2026-03-13)

- **Context:** Dialog needed to handle submission, navigation, and toasts. Original design used parent component callbacks.
- **Why:** Self-contained hooks pattern eliminates prop drilling, makes side effects (navigation, toasts) local to dialog, cleaner for features with internal complexity. Dialog becomes autonomous unit.
- **Rejected:** Keep callback delegation pattern (onSubmit/isPending props from ProjectsList). Would require prop threading for each new side effect.
- **Trade-offs:** Gain: autonomy, clarity, easier to add features. Loss: dialog less reusable for different submission flows. If you need multiple submission handlers, refactoring required.
- **Breaking if changed:** If future features need dialog to work with different submission logic (e.g., draft saving, different endpoints), you'd need to either parameterize the hook or break out callback pattern again.

#### [Pattern] Multi-source artifact field extraction: Server checks three payload field names (`artifactUrl`, `reportUrl`, `reportPath`) for artifact URL, accepting the first present value. (2026-03-13)

- **Problem solved:** Different ceremony services use different naming conventions for artifact/report URLs. Need to integrate with heterogeneous systems without version negotiation.
- **Why this works:** Defensive programming for integration with multiple ceremony implementations. Centralizes compatibility logic on server where ceremony knowledge lives.
- **Trade-offs:** Extraction logic slightly more complex, but supports multiple ceremony implementations without coupling or version negotiation.

### Server owns ceremony type → label mapping. Ceremony handler contains `CEREMONY_LABELS` dictionary, sends `ceremonyLabel` in TimelineEvent response. UI renders this label in badge. (2026-03-13)

- **Context:** Ceremony type names (e.g., 'standup', 'milestone_retro') are not user-friendly. Need readable labels for timeline UI.
- **Why:** Ceremony type semantics are business logic; centralizing on server prevents UI from needing to know ceremony taxonomy. Single source of truth for label definitions.
- **Rejected:** Send raw ceremony type to UI, let client map it (creates duplicate label definitions, harder to maintain, UI depends on ceremony domain knowledge).
- **Trade-offs:** Server becomes ceremony-aware, but TimelineEvent remains consistent interface. Maintenance burden in one place instead of two.
- **Breaking if changed:** Moving labels to UI requires syncing definitions across systems; removing label logic entirely means UI shows raw ceremony type strings.

#### [Gotcha] Decision and escalation filters were already implemented from prior session. Icon/color configs were already defined. Feature was 'missing last mile' — foundational pieces existed but weren't connected to ceremony events. (2026-03-13)

- **Situation:** Implementing ceremony label and artifact link features. Expected to build filters from scratch; discovered they already existed in codebase.
- **Root cause:** Parallel feature development with layered implementation. Filter system built, but not applied to ceremony events. No integration work until now.
- **How to avoid:** Extra audit time up-front (reading existing code) saved duplicate implementation effort. Ensured consistency.

#### [Pattern] Archive deprecated patterns with date/reason instead of deleting them; preserve underlying pattern knowledge while marking use case as inactive (2026-03-13)

- **Problem solved:** Frank auto-spawn IIFE and cooldown patterns were deprecated (crew loops removed 2026-03-04), but the underlying fire-and-forget async pattern and in-memory cooldown approach remain valid for other use cases
- **Why this works:** Prevents institutional knowledge loss; allows future developers to understand why patterns exist and reuse the pattern logic for similar problems. Archiving with [ARCHIVED — date] signals status without orphaning the technical insight.
- **Trade-offs:** Requires more doc maintenance (marking sections as archived) but preserves pattern reusability and decision context for future work

### Rely on strategic decisions document as single source of truth for major changes (Linear removal, crew loops removal); don't require updates to all downstream references if patterns remain conceptually valid (2026-03-13)

- **Context:** Explore agent found deprecated Linear/Frank references across 5+ docs (security.md, performance.md, gotchas.md). Rather than updating all, chose to update only key decision points (architecture.md, templates) and leave historical patterns intact
- **Why:** Reduces update burden when strategic changes cascade widely. Historical patterns (rate limiting, diagnostic scoping, eventual consistency) remain valid even if specific implementation (Frank, Linear) is removed. Strategic decisions doc serves as authoritative changelog.
- **Rejected:** Alternative of updating every downstream reference is high effort for low benefit, especially when the patterns themselves are reusable
- **Trade-offs:** Docs require readers to cross-reference strategic decisions for context, but reduces churn and keeps focus on what actually changed in implementation
- **Breaking if changed:** If strategic decisions doc is not maintained as source of truth, readers have no way to understand which references are stale vs which patterns are still valid

### Accept ArtifactEntry with optional content field; provide metadata-as-markdown fallback when content unavailable (2026-03-13)

- **Context:** Component needs to display expandable markdown views, but ArtifactIndexEntry has no content field. Parent component (project-detail.tsx) would need to fetch and enrich artifacts with real content.
- **Why:** Enables gradual adoption: component is immediately useful with metadata fallback while allowing parent to add content enrichment later without requiring immediate parent refactor. Maintains type compatibility (ArtifactEntry extends ArtifactIndexEntry), so existing callsites work without changes.
- **Rejected:** Could require content field (breaking change) or wrap ArtifactIndexEntry in separate enrichment type (requires parent coordination)
- **Trade-offs:** Feature degrades gracefully but shows date+filename instead of real report content until parent enriches. Trades immediate full functionality for type-safe incremental adoption.
- **Breaking if changed:** Removing metadata fallback would cause artifact cards without content to show nothing; expanding cards becomes pointless for non-enriched data

#### [Pattern] Sort artifacts globally by date-descending before grouping by type; grouping preserves global sort order within each group (2026-03-13)

- **Problem solved:** Need to show artifacts grouped by type (Standup, Ceremony Report, etc.) but also maintain consistent date ordering within and across groups.
- **Why this works:** Single-pass sort maintains sort invariant across all group boundaries. Alternative (per-group sorting) would require map iteration + individual sorts, adding complexity. This pattern ensures if user views 'All' vs filtered view, relative date ordering is identical.
- **Trade-offs:** Simpler code (one sort operation), but requires understanding that Map iteration order equals sort order. Makes it harder to implement non-date sorts later (would need post-group resort).

### Separate filterTypes prop (parent control) from typeFilter state (user control); allow independent filtering dimensions (2026-03-13)

- **Context:** Parent may want to show only certain artifact types (e.g., 'ceremonies only'), while user wants to filter further within that set (e.g., 'standups only'). Both needs must be satisfied without coupling.
- **Why:** Prop controls scope (what types are available), state controls user selection (which type to focus on). Allows parent to restrict domain (SUPPORTED types) while user navigates freely within it. Cleaner separation of concerns than trying to merge decisions into single state.
- **Rejected:** Single filter state (requires parent to manage local UI state); no supported-types gate (leaks invalid types into UI)
- **Trade-offs:** Slightly more code (two separate filters), but each dimension is independently controllable. Harder to reason about if not documented.
- **Breaking if changed:** Removing SUPPORTED gate allows invalid types into the component; removing typeFilter state removes user control

#### [Gotcha] Two independent code paths (executeFeature and executePipelineSteps) both assemble system prompts but operate independently. Role prompt injection had to be implemented in both locations. (2026-03-13)

- **Situation:** When adding role prompt prefix support, discovered that context files were loaded in two separate flows with no shared helper.
- **Root cause:** Features can be executed via two different routes, each with its own context assembly logic. No abstraction to unify prompt building.
- **How to avoid:** Current approach: easier to implement locally, harder to maintain (changes must be applied twice). Shared function: more DRY, but adds an abstraction layer that could complicate context passing.

### Auto-assignment is opt-OUT, not opt-IN: autoAssignEnabled defaults to true, match logic only skips on explicit false (2026-03-13)

- **Context:** Feature flag for disabling auto-assignment in workflow settings
- **Why:** Assumes auto-assignment is beneficial by default; requires explicit action to disable. This makes auto-routing the primary product behavior, manual assignment the override.
- **Rejected:** Opt-IN model (default false, require explicit true) would make auto-assignment secondary, require explicit enablement per workflow
- **Trade-offs:** Opt-out encourages adoption and intelligent routing; opt-in requires users to discover and enable feature
- **Breaking if changed:** Changing to opt-IN would require backwards migration of existing workflows and shifts routing from automatic to manual-first

#### [Pattern] Cascading precedence guards: Manual assignedRole → Feature flag → Match call. Each level short-circuits lower levels. (2026-03-13)

- **Problem solved:** Need to respect user intent (manual assignment) while supporting both feature-gating and auto-matching
- **Why this works:** Respects intent hierarchy: explicit user assignment > organizational configuration > algorithmic suggestion. Avoids expensive match calls unnecessarily.
- **Trade-offs:** Early exits optimize for manual/disabled case; requires understanding guard order to modify behavior

### Match errors are non-fatal: caught, logged, execution continues. Manifest parsing/matching failures never block feature execution. (2026-03-13)

- **Context:** AgentManifestService.matchFeature() can throw parsing errors or fail gracefully
- **Why:** Feature execution is critical path; role assignment is enhancement. Graceful degradation ensures routing never prevents work from starting.
- **Rejected:** Fail-fast on match error would catch malformed manifests early but would block feature execution entirely
- **Trade-offs:** Non-fatal enables execution continuity at cost of potentially missing role misassignment signals. Requires good logging/monitoring.
- **Breaking if changed:** Fail-fast would require manifest validation before execution and would break any execution when AgentManifestService is unavailable or misconfigured

#### [Pattern] Null from matchFeature signals 'no match found' and triggers no assignedRole update (defensive: does not mutate on null) (2026-03-13)

- **Problem solved:** AgentManifestService.matchFeature() returns null when no rule matches confidence threshold, or a match object with role+metadata
- **Why this works:** Null is explicit sentinel for 'no match' — cleaner than empty object or success-but-no-role. Defensive null-check before update prevents silent noop mutations.
- **Trade-offs:** Requires explicit null-handling in code; explicit defensive prevents accidental mutations of assignedRole to undefined

### routingSuggestion populated with full metadata (confidence, reasoning, autoAssigned flag, suggestedAt timestamp) creating audit trail of auto vs manual assignments (2026-03-13)

- **Context:** Need to track origin and confidence of role assignment for observability and debugging
- **Why:** Audit trail enables: (1) tracing why a role was assigned, (2) measuring match confidence distribution, (3) retroactively identifying auto-assigned vs manually-assigned features. Autoassigned flag is semantic marker.
- **Rejected:** Could only store assignedRole without metadata; would lose traceability and confidence signal needed for threshold tuning
- **Trade-offs:** Adds payload to Feature; enables rich observability and potential future ML feedback loops on assignment quality
- **Breaking if changed:** Removing metadata would eliminate ability to distinguish high-confidence from low-confidence auto-assignments, making manifest tuning impossible

#### [Gotcha] Manifest-driven service layer and synthetic API-layer agent creation represent a dual source of truth that creates impedance mismatches. getResolvedCapabilities() only knows about manifest agents, not synthetic built-in fallbacks created at the route layer. (2026-03-13)

- **Situation:** Built-in agents are created synthetically in the API route (lines 108–114) when the manifest has no entry for operational resilience. Service methods like getResolvedCapabilities() were designed assuming the manifest is the single source of truth.
- **Root cause:** The route layer intentionally deviates from manifest-as-canonical for fallback/resilience, but downstream abstractions weren't told about this exception pattern.
- **How to avoid:** Route-level guard keeps synthetic fallback logic localized and explicit (easier to trace) but distributed the dual-source-of-truth logic. Service layer stays simpler but now has implicit constraints callers must understand.

### The built-in agent fallback (synthetic agent creation + capability lookup) is placed at the API route layer, not in the service layer. This keeps the synthetic fallback pattern co-located with where synthetic agents are created, but distributes dual-source-of-truth handling. (2026-03-13)

- **Context:** Routes create synthetic agents as a fallback (lines 108–114). Their capabilities also need a fallback. Decision: where should the fallback lookup live?
- **Why:** Route layer creates the synthetic agents, so route layer is where they're fully understood. Keeps service layer pure/manifest-focused. Alternative (service-layer fallback) would require exposing fallback capability sources through service API, mixing concerns.
- **Rejected:** Moving to service layer via new method like getCapabilitiesOrBuiltIn() would centralize dual-source logic but require service to know about synthetic agents, coupling service to route-layer operations.
- **Trade-offs:** Route-level placement is more explicit and keeps service focused (testable in isolation). Cost: route now has special knowledge of how to find built-in capabilities; testing route logic in isolation requires mocking both manifest AND built-in sources.
- **Breaking if changed:** If service layer ever needs to be the exclusive canonical source of truth (e.g., for caching strategies or audit trails), this pattern blocks that migration. Any code calling service directly bypasses the built-in fallback.

#### [Pattern] Shutdown sequence is ordered — services disposed in specific sequence (after crdtSyncService.shutdown() but before shutdownLangfuse()) (2026-03-13)

- **Problem solved:** AgentManifestService disposed in middle of shutdown sequence, not arbitrary
- **Why this works:** Ordered disposal prevents resource dependency issues and ensures cleanup happens when dependent services are still available. Placing in 'service teardown zone' keeps related operations together.
- **Trade-offs:** Adds cognitive load for new services — developers must understand shutdown ordering. Gains: predictable resource cleanup and no use-after-dispose bugs.

#### [Pattern] Try/catch wrapping lifecycle methods (dispose, shutdown) during graceful shutdown — failures are logged but never block the shutdown path (2026-03-13)

- **Problem solved:** getAgentManifestService().dispose() wrapped in try/catch with logger.warn fallback
- **Why this works:** Shutdown must be non-blocking even if individual service cleanup fails. Ensures one broken service doesn't prevent full shutdown sequence.
- **Trade-offs:** Hides dispose failures from strict error reporting. Gains: guaranteed shutdown completion and no hung processes. Cost: potential silent resource leaks if dispose fails.

### Singleton getter pattern (getAgentManifestService()) used for accessing singleton services in shutdown path, not direct instantiation or dependency injection (2026-03-13)

- **Context:** Import and call uses getAgentManifestService() getter, consistent with getTerminalService() and getReactiveSpawnerService() patterns throughout codebase
- **Why:** Getter pattern allows initialization-on-demand and handles uninitialized state. Calling on singleton avoids coupling to construction, letting service optionally be created.
- **Rejected:** Direct instantiation would require knowledge of constructor; DI would require shutdown.ts to be aware of all services upfront
- **Trade-offs:** Getter adds indirection and silent no-op if service never initialized. Gains: loose coupling and graceful handling of uninitialized services.
- **Breaking if changed:** Switching to direct field access would require tracking which services are initialized before calling dispose, adding shutdown fragility

#### [Pattern] UI derives isBuiltIn from ROLE_LABELS (frontend's ground-truth constant) rather than trusting the API's \_builtIn flag as source of truth. (2026-03-13)

- **Problem solved:** Agent suggestion badge needs to identify built-in agents. Could trust API flag or validate against frontend's role registry.
- **Why this works:** ROLE_LABELS is the frontend's contract for what roles it knows how to label. Deriving from it provides defense against API inconsistencies and creates a validation gate: if a role isn't in ROLE_LABELS, we shouldn't claim it's built-in regardless of what the API says.
- **Trade-offs:** Trades implicit trust in API for explicit validation, but creates a hidden sync point between frontend and backend role lists that has no verification test.

#### [Gotcha] DEFAULT_PROJECT_AGENT intentionally omits \_builtIn field, creating an implicit contract that the API layer must set this flag for built-in agents during response serialization. (2026-03-13)

- **Situation:** Default agent constant is used as a template for user-created agents. If not handled carefully during API serialization, all agents (user and built-in alike) could inherit missing \_builtIn.
- **Root cause:** DEFAULT_PROJECT_AGENT is user-authored scaffold, so it shouldn't have \_builtIn set. But this means there's no 'safe default' for the field—the API must explicitly set it.
- **How to avoid:** Cleaner manifests vs. implicit responsibility. If the API layer ever forgets to populate \_builtIn for a built-in agent, the badge won't show—silent failure rather than explicit default.

#### [Pattern] Used breaking return type change (ProjectAgent | null → MatchResult | null) as a compile-time verification mechanism to force discovery of all call sites. (2026-03-13)

- **Problem solved:** Refactoring agent manifest scoring from hardcoded 1.0 confidence to computed values. Feature description listed 2 files to update, but TypeScript compilation revealed a third caller (routes/agents.ts) that needed updating.
- **Why this works:** Return type changes propagate through the type system automatically, ensuring all consumers are found and forced to recompile. This is more reliable than grep-based refactoring for TypeScript APIs.
- **Trade-offs:** Breaking change requires updating all call sites immediately (harder short-term) vs. ensures no call sites are missed (safer long-term). In a monorepo with build checks, this is low-friction.

### Selected diminishing-returns formula (rawScore / (rawScore + 10)) instead of linear or sigmoid normalization to preserve match ordering invariant. (2026-03-13)

- **Context:** Confidence scoring needs to reflect match strength while integrating with existing agent routing logic that depends on relative match scores.
- **Why:** The formula is strictly monotone-increasing: if agent A has rawScore > agent B, then normalize(A) > normalize(B) always holds. This preserves the implicit invariant that 'best match' determined by highest raw score remains the best match in confidence space. Linear normalization (score/maxScore) or sigmoid could reorder matches.
- **Rejected:** Linear normalization (simpler to understand), sigmoid (tighter bounds at extremes), fixed confidence tiers (easier to reason about in logs). All risk reordering matches in edge cases.
- **Trade-offs:** Confidence never reaches 1.0 (max ~0.75 at reasonable scores), making the asymptotic behavior less intuitive. But prevents subtle bugs in routing logic where a different agent becomes 'top match' after scoring.
- **Breaking if changed:** Any code assuming confidence can equal 1.0 or using it as a binary threshold (>= 1.0) will break. Formula change would need systematic re-verification of routing decisions.

#### [Pattern] Implemented scoring formula as a private helper method (\_normalizeScore) instead of inlining or externalizing to a separate service. (2026-03-13)

- **Problem solved:** Normalization logic used in one place (matchFeature return), but likely to be needed in multiple scoring contexts as the system evolves.
- **Why this works:** Private method creates a single source of truth for the formula, making it impossible for future developers to implement divergent normalization logic. Also keeps the method co-located with the data it operates on (raw match scores).
- **Trade-offs:** One more private method to maintain, but prevents inconsistent scoring if scoring is needed elsewhere. Low cost for high consistency guarantee.

### Preserve startingFeatures Set throughout the entire async dispatch lifecycle—don't clear it when ConcurrencyManager lease is acquired, only when the dispatch promise resolves. This keeps the synchronous double-start guard intact within a single loop iteration. (2026-03-13)

- **Context:** startingFeatures serves two purposes: (1) reserve a capacity slot during startup, and (2) provide a cheap, synchronous guard against accidentally starting the same feature twice within one scheduler loop. If the Set is cleared upon lease acquisition, the synchronous guard disappears for the remainder of the iteration.
- **Why:** The loop iteration is performance-critical and synchronous. Querying ConcurrencyManager state (async-created lease) in the hot path adds latency and creates implicit coupling. The Set provides an O(1) check without async dependencies. Keeping it until dispatch completion maintains clean architectural separation.
- **Rejected:** Clear the Set immediately when lease acquired to eliminate the overlap window. This pushes the double-start guard responsibility to checking lease state, making the loop logic asynchronous and dependent on ConcurrencyManager implementation details.
- **Trade-offs:** Keeping the Set in both states costs memory (set membership tracking continues) and requires consistent filtering logic everywhere capacity is calculated. In return, the loop stays synchronous and simple, and the separation between scheduler state and system state remains clean.
- **Breaking if changed:** Removing the Set entirely and relying solely on ConcurrencyManager leases forces all double-start checks to go async. Clearing the Set immediately after lease acquisition makes it unsafe to check the Set anywhere in the loop after that point, creating fragile coupling between initialization code and state-checking code.

### Poll-based watchers must call timer.unref() to prevent the poller from blocking process shutdown. clearInterval alone is insufficient if the process exits before the interval fires. (2026-03-13)

- **Context:** setInterval returns a Timer reference that by default keeps the event loop alive. In a server that needs graceful shutdown, this timer can block exit.
- **Why:** unref() marks the timer as 'non-blocking' — the event loop will exit even if the timer is pending. This is essential for clean server shutdown in production.
- **Rejected:** Relying on clearInterval alone (process may hang waiting for final interval to fire); explicit shutdown handlers (more complex)
- **Trade-offs:** unref() adds a single line but prevents shutdown hangs. Cost is negligible; benefit is process lifecycle correctness.
- **Breaking if changed:** Removing unref() causes process shutdown to block until the next interval fires, potentially causing deployment timeouts or zombie processes

#### [Pattern] File scope in specifications acts as semantic intent signal. When removal task lists only type and doc files (not service files), that signals 'remove, don't implement'—preventing scope creep and misaligned effort. (2026-03-14)

- **Problem solved:** Feature description listed workflow-settings.ts and agent-manifests.md for modification, but NOT agent-manifest-service.ts. Developer correctly interpreted this as removal-only scope.
- **Why this works:** Explicit service exclusion communicates: 'we don't want service-level changes.' Ambiguous specs lead to wasted implementation effort on features no one asked for.
- **Trade-offs:** Minimal scope = faster completion, but requires developers to read scope intent carefully. Verbose specs with 'do NOT modify X' would be clearer but noisier.

#### [Gotcha] Declared-but-never-consumed configuration fields create false APIs. Users can set manifestPaths, see no effect, and either think the feature is broken or doesn't exist—worse than not having the field at all. (2026-03-14)

- **Situation:** manifestPaths existed in AgentConfig for ~Xmonths but AgentManifestService only hardcoded .automaker/agents.yml and .automaker/agents/ paths. No watcher, no dynamic loading, no effect.
- **Root cause:** Field was probably added speculatively to 'future-proof' for extensibility. But undocumented constraints (hardcoded paths) + unused field = confusing API surface.
- **How to avoid:** Removal reduces documentation burden and user confusion, but makes extending manifest paths later require a new field/migration. Trade clarity for flexibility.

#### [Pattern] Exhaustive codebase search (grep all files) before removing config fields validates zero impact. If field only appears in type/doc, removal is objectively safe. (2026-03-14)

- **Problem solved:** Developer ran: grep manifestPaths across entire repo → found only in type definition + docs, nowhere else. Enabled confident, zero-risk removal.
- **Why this works:** Config removal is a breaking change if consumers exist. Grep proves non-existence. This is cheap insurance vs. silent breakage.
- **Trade-offs:** 5 minutes of searching saves potential 2-hour rollback. Automation could enforce this (linter that flags declared-but-unused config fields).

### Prefer minimal configuration surface (only expose what's consumed) over speculative future-proofing. When a feature isn't implemented, remove the declaration—users can request it if needed. (2026-03-14)

- **Context:** manifestPaths was a speculative field waiting for a feature that never materialized. Keeping it causes confusion; removing it clarifies intent.
- **Why:** Cognitive load: every extra config field users have to understand is a cost. Unused fields are net negative. Implement when requirements exist, not before.
- **Rejected:** Keep field with warning docs ('planned for future'). But this leaves dead code that accumulates over time.
- **Trade-offs:** Removal = simpler API + less documentation. Cost: future custom-path feature needs new field + migration path. But that's rare; most features don't need it.
- **Breaking if changed:** If someone built automation around manifestPaths (config validation, schema checks), removal breaks it. Mitigated by proving nobody was using it (grep validation).

#### [Pattern] Dual-path template registration: scaffold-based templates require @protolabsai/templates package changes + server route + UI registry entry, while clone-based templates only require UI registry entry. This split is driven by tooling constraints, not API design. (2026-03-15)

- **Problem solved:** The starter kit system supports both scaffold kits (docs, portfolio, general) and clone kits (extension, future kits with native tooling). Different paths have different provisioning requirements.
- **Why this works:** Scaffold kits work via local file copying because they're pure template content. Clone kits are necessary when the kit itself includes non-JS native tooling (WXT bundler for extensions) that can't be replicated via local file scaffolding — the git repo IS the distribution mechanism for the complete toolchain.
- **Trade-offs:** Flexibility to support diverse stacks (easier for future kits) vs cognitive load (developers must understand two registration paths and when to use each). The complexity is unavoidable given the diversity of target stacks.

#### [Gotcha] VitePress sidebar is auto-generated via generateSidebar() which scans docs/templates/ at build time. New .md files automatically appear in sidebar without config changes. This is convenient but creates a fragile assumption: if sidebar config is ever refactored to use explicit entries, auto-discovery breaks silently. (2026-03-15)

- **Situation:** Three new .md files were added and automatically appeared in sidebar navigation. No manual sidebar config was needed. The feature worked, but the mechanism is undocumented in the codebase.
- **Root cause:** Auto-generation reduces config maintenance overhead. Developers can add docs pages without understanding sidebar config. Works well for stable directory structures.
- **How to avoid:** Automatic discovery (lower maintenance, faster doc publishing) vs explicit control (better UX, can curate ordering and visibility). Current approach implicitly assumes all .md files in the directory should be discoverable.

#### [Gotcha] Extension kit is intentionally clone-based only. The server scaffold route validates kitType against ['docs', 'portfolio', 'general', 'my-kit'] — extension is not in this list. This is a tooling constraint (WXT native build tools can't be scaffolded), not an API limitation, but it's not obvious without investigation. (2026-03-15)

- **Situation:** When writing add-a-starter.md, the absence of extension from the scaffold validation list needed explanation. Investigation revealed this is intentional: WXT bundler and native browser extension tooling require repo-level distribution.
- **Root cause:** Browser extension projects require WXT build tools, manifest configuration, and specific directory structures that are better maintained in a git repo than scaffolded from a template. Cloning ensures the complete working toolchain is present without users having to install and configure separate build tools.
- **How to avoid:** Clone approach (works out-of-the-box, users don't configure tooling) vs scaffold approach (smaller, users can update kit version independently). Chose clone because the repo IS the distribution mechanism for the complete, working toolchain.

### Starter kit packages are made zero-dependency on internal monorepo packages (@protolabsai/\*). All imports replaced with local implementations or inlined code. (2026-03-15)

- **Context:** When extracting AI chat components to a starter kit scaffold at libs/templates/starters/ai-agent-app/packages/ui, team chose to copy button.tsx, popover.tsx and inline formatDuration rather than import from @protolabsai packages
- **Why:** Starter kits must be fully self-contained and usable outside the monorepo context. Dependencies on internal packages would break the starter kit when used standalone or when internal packages are refactored.
- **Rejected:** Re-exporting @protolabsai/ui and @protolabsai/utils from starter kit packages (would create hidden monorepo coupling)
- **Trade-offs:** Accepts code duplication (button, popover copied not shared) to gain true independence. Maintenance burden increases when utilities change, but starter kit remains stable.
- **Breaking if changed:** If this were reversed and starter kit imported from monorepo, it would fail to run outside the monorepo or if internal package structure changes. Users copying the starter kit would inherit broken imports.

#### [Pattern] Tool invocation extensibility pattern: keep the ToolResultRegistry interface but strip all 30 tool-specific implementations (BoardSummaryCard, SitrepCard, HealthCheckCard, etc). Only generic JSON fallback renderer remains. (2026-03-15)

- **Problem solved:** tool-invocation-part.tsx had hardcoded registry entries for 30 automaker-specific tools. When extracting to starter kit, these were completely removed but the registry interface preserved.
- **Why this works:** Allows consumers to implement custom tool renderers without inheriting automaker internals. The registry interface is the extension point; the implementations are context-specific.
- **Trade-offs:** Starter kit is truly generic but requires users to implement their own tool card renderers. Generic fallback (JSON display) is functional but less polished.

#### [Gotcha] Inlining small utility functions like formatDuration creates maintenance coupling: if the logic needs to change, the starter kit copy won't auto-update with the source. (2026-03-15)

- **Situation:** formatDuration was extracted from @protolabsai/utils and inlined in chain-of-thought.tsx to avoid monorepo dependency
- **Root cause:** Unavoidable tradeoff when choosing zero-dependency approach. Must choose between monorepo coupling or code duplication.
- **How to avoid:** Eliminates import dependency at cost of maintenance divergence. If formatDuration behavior needs to change (e.g. new time unit), starter kit won't inherit the fix automatically.

### Use CSS custom properties `bg-[var(--primary)]` with Tailwind arbitrary values instead of semantic Tailwind tokens `bg-primary` in starter kit atoms (2026-03-15)

- **Context:** Starter kit ai-agent-app lacks @protolabsai/ui themes.css infrastructure to define semantic color tokens. Decision between CSS vars + arbitrary syntax vs building semantic token infrastructure.
- **Why:** Greenfield starter kit must be self-contained with zero @protolabsai/\* dependencies. Semantic tokens require monorepo infrastructure that doesn't exist yet in the template.
- **Rejected:** Define semantic tokens in starter kit's tailwind.config.js (couples atoms to Tailwind config) or import themes.css from main package (breaks zero-dependency constraint)
- **Trade-offs:** CSS vars are more flexible for runtime theming but require verbose arbitrary Tailwind syntax. Atoms are portable but will need refactoring when semantic tokens are added in later phases.
- **Breaking if changed:** If removed, atoms lose CSS variable theming ability and cannot be recolored at runtime. Migration to semantic tokens requires updating all `[var(--*)]` arbitrary values to token names.

### Duplicate `cn()` helper (clsx + tailwind-merge) in starter kit instead of importing from @protolabsai/ui (2026-03-15)

- **Context:** Atoms need class merging utility for CVA. Could import from monorepo package or reimplement locally.
- **Why:** Zero monorepo dependencies constraint for starter kit. Ensures atoms work in isolation without npm hoisting or worktree symlink issues. Code duplication is acceptable cost for portability.
- **Rejected:** Import from @protolabsai/ui (violates zero-dependency constraint); implement custom class merger (reinvent, unmaintained); use Tailwind directly without merge (fails when CVA overrides classes)
- **Trade-offs:** Duplication vs dependency simplicity. Maintenance burden if clsx/tailwind-merge APIs change, but atoms remain self-contained learning examples.
- **Breaking if changed:** Removing this duplicate and adding monorepo import breaks the standalone constraint and couples atoms to @protolabsai/ui package existence.

### Use Tailwind CSS 4 `@theme inline` in tokens.css to bridge CSS custom properties to Tailwind utilities (2026-03-15)

- **Context:** Need CSS vars for runtime theming but also need Tailwind utilities to consume those vars. Tailwind v4 introduced @theme inline directive.
- **Why:** @theme inline allows embedding theme values directly in CSS without separate tailwind.config.js, keeping tokens centralized in one source file. Avoids duplication between CSS vars and Tailwind config.
- **Rejected:** Duplicate values in tailwind.config.js theme object (maintenance burden, sync issues); use CSS vars only without @theme (loses Tailwind utility optimization); traditional config (adds another config file to maintain)
- **Trade-offs:** Clean single source of truth vs potential Tailwind version coupling if @theme inline API changes. Works for Tailwind v4+ only.
- **Breaking if changed:** Removing @theme inline requires replicating all 6 values in tailwind.config.js theme.colors. Downgrading to Tailwind v3 breaks the @theme syntax entirely.

### ToolContext implemented as generic Record<string, unknown> interface with index signature, not a specific typed interface with required properties (2026-03-15)

- **Context:** Extracting tool definitions into standalone starter-kit package; needed to avoid framework-specific types (@protolabsai, @automaker, Feature, FeatureStatus)
- **Why:** Generic Record enables zero-contamination, framework-agnostic tool definitions. Single definition compiles across MCP, LangGraph, Express without coupling to any framework's type system. Allows package reuse outside protoMaker ecosystem.
- **Rejected:** Specific typed interface with required properties (e.g., interface ToolContext { userId: string; tenantId: string }) — would couple adapters to framework concerns and prevent reuse
- **Trade-offs:** Flexibility vs type safety. Callers lose compile-time validation of required context properties; runtime errors if context missing expected keys. Must document context shape in JSDoc.
- **Breaking if changed:** If changed to specific types, any adapter supporting multiple frameworks breaks. Package loses zero-contamination property. Starter-kit becomes framework-specific.

#### [Gotcha] LangGraph adapter uses dynamic require('@langchain/core/tools') to avoid hard compile-time dependency, but fails silently at package install and only breaks at runtime when toLangGraphTool() called without @langchain/core installed (2026-03-15)

- **Situation:** Wanted @langchain/core as optional adapter support, not hard requirement. Package should install clean without it.
- **Root cause:** Reduces install size and dependency tree for users who only need MCP or Express adapters. Matches LangGraph's optional usage pattern in runtime environment.
- **How to avoid:** Install-time clarity vs runtime discovery of missing optional dependency. Users get cleaner install tree but must handle runtime dependency missing errors. Package manifests don't signal dependency requirement at graph resolution time.

#### [Pattern] define-once-deploy-everywhere: single SharedTool<TInput, TOutput> definition with Zod schemas compiles via three adapters (toMCPTool, toLangGraphTool, toExpressRouter) to MCP JSON Schema, LangGraph DynamicStructuredTool, Express typed routes respectively (2026-03-15)

- **Problem solved:** Problem: maintaining separate tool definitions for each runtime (MCP tools.ts, LangGraph tool_nodes.ts, API routes.ts) with identical behavior but different type representations causes drift and duplicate validation logic
- **Why this works:** Single source of truth for tool behavior, validation, error handling, examples. Adapters are thin translation layers to runtime-specific schemas. Any fix or feature in tool definition automatically propagates to all runtimes. Reduces cognitive load: one tool definition to reason about.
- **Trade-offs:** Adapter complexity increases (must understand MCP JSON Schema, LangGraph DynamicStructuredTool, Express middleware). Single point of failure: adapter bug affects all three runtimes. Benefit: consistency guarantees, reduced maintenance surface.

#### [Gotcha] Zod v4 broke the generic factory pattern `<TInputSchema extends z.ZodTypeAny>` used in the source. ZodTypeAny was deprecated and ZodTypeDef removed. Fixed by switching to direct type inference: `<TInput, TOutput>` with `z.ZodType<TInput>`. (2026-03-15)

- **Situation:** defineSharedTool factory didn't compile under stricter tsconfig in worktree with Zod v4 (^4.3.6)
- **Root cause:** Zod v4 changed its type architecture fundamentally. The pattern of constraining a generic to ZodTypeAny no longer works. Direct type parameters bypass the ZodTypeDef requirement.
- **How to avoid:** Direct inference is cleaner but less expressive — can't do complex schema validation on the ZodType itself. Gain: simpler, Zod v4-compatible API.

### ToolContext is generic `Record<string, unknown>` instead of coupled to Feature/FeatureStatus types from @protolabsai/core. This was intentional to make the starter kit fully standalone and usable outside the monorepo. (2026-03-15)

- **Context:** Extracting @protolabsai/tools pattern into ai-agent-app-starter-kit packages/tools as zero-monorepo-dependency
- **Why:** Starter kit must be copy-paste-able and self-contained. Coupling to Feature would force users to import from @protolabsai/core, breaking the 'define-once-deploy-everywhere' independence. Generic Record allows tools to accept any context shape.
- **Rejected:** Using Feature/FeatureStatus from monorepo — would require starter kit users to import from @protolabsai packages, creating unwanted dependency.
- **Trade-offs:** Loss: type safety on what context contains. Gain: true starter kit independence, users can define their own ToolContext shape.
- **Breaking if changed:** If changed back to Feature-coupled, starter kit is no longer standalone — users must depend on @protolabsai/core.

#### [Pattern] LangGraph adapter uses dynamic require('@langchain/core/tools') instead of static import. This avoids forcing @langchain/core as a hard dependency while still supporting LangGraph users. (2026-03-15)

- **Problem solved:** Adapter pattern needed to support multiple orchestration frameworks (MCP, LangGraph, Express) without bloating the package
- **Why this works:** Most users will only use one orchestration framework. Hard dependency on @langchain/core would bloat bundles for Express-only users. Dynamic require makes it optional — users install it if they need it.
- **Trade-offs:** Easier: minimal bundle size for Express-only users. Harder: users must know to install @langchain/core separately for LangGraph support (requires runtime error messaging).

### Included all three adapters (MCP, LangGraph, Express) in a single packages/tools module instead of separate adapter packages. This enables the 'define once, deploy everywhere' pattern — a single SharedTool definition works across MCP, LangGraph orchestration, and Express REST. (2026-03-15)

- **Context:** Designing a reusable tool system for the starter kit that works with multiple framework choices
- **Why:** Users need flexibility to switch between orchestration frameworks without rewriting tools. Single definition with multiple adapters is the simplest composition model.
- **Rejected:** Separate @protolabsai/tools-mcp, @protolabsai/tools-langgraph packages — would fragment the tool definition across repos and require users to understand multiple APIs.
- **Trade-offs:** Easier: unified tool API, easy framework switching. Harder: all three adapters must live in one package, slightly increased bundle size (though adapters are tree-shakeable).
- **Breaking if changed:** Removing any adapter breaks the 'deploy everywhere' promise — users lose a framework option without code rewrite.

#### [Gotcha] Text input not normalized before chunking — multiple spaces or special formatting could break chunking logic (2026-03-15)

- **Situation:** chunkString assumes single spaces between words via split(' '); edge cases like 'word word' (two spaces) would create empty string tokens
- **Root cause:** Simple implementation assumes clean input; real streaming might include formatting, markdown, or spacing artifacts
- **How to avoid:** Simplest implementation for typical English prose; fragile with non-standard spacing or unicode edge cases

#### [Pattern] Streaming text features implemented only in main app; starter kit deferral creates split feature implementation (2026-03-15)

- **Problem solved:** Part 2 targets starter kit files that don't exist yet (UI extraction phase incomplete); only Part 1 (main app) shipped
- **Why this works:** Starter kit is under active development; UI files will exist eventually, so implementation was scoped as 'add when available' rather than blocking on file creation
- **Trade-offs:** Main app gets feature immediately; starter kit gets it later via manual copy-paste pattern; creates intentional code duplication and drift risk

### Use static imports for all three provider SDKs (Anthropic, OpenAI, Google) instead of dynamic conditional imports (2026-03-15)

- **Context:** Multi-provider model resolver supporting three different AI providers in a starter kit template
- **Why:** Keeps TypeScript types fully resolved at compile time, ensuring IDE autocompletion and type checking work correctly for all providers regardless of which one is actually used at runtime. Critical for developer experience in a starter kit.
- **Rejected:** Dynamic imports with require()/import() - would break TypeScript type resolution for unused providers and degrade IDE experience
- **Trade-offs:** All three SDK dependencies bundled even if only one is used in practice. For a starter kit, DX and type safety outweigh dependency bloat.
- **Breaking if changed:** Switching to dynamic imports would lose type checking and IDE support for model IDs and client methods from non-imported providers

#### [Pattern] Lazy singleton client factories—provider clients instantiated only on first use, not at server startup (2026-03-15)

- **Problem solved:** Multi-provider system where developers may not have all API keys configured initially
- **Why this works:** Prevents hard startup failures when some API keys are missing. Server remains operational with partial provider configuration, allowing developers to add providers incrementally without restarts.
- **Trade-offs:** First request to a provider incurs client instantiation overhead. Acceptable tradeoff for the flexibility of optional provider configuration.

#### [Pattern] Multi-level model resolution with fallback chain: alias → provider prefix detection → MODEL env var → hard default (2026-03-15)

- **Problem solved:** Resolving user-provided model names to actual provider model IDs without requiring explicit configuration
- **Why this works:** Each fallback layer addresses a different user sophistication level: aliases for common models (haiku/sonnet/opus), full IDs for explicit specification, env var for runtime control, default for zero-config. Eliminates multiple competing ways to achieve the same outcome.
- **Trade-offs:** Adds routing logic to resolveModel() but provides single unified resolution path that serves multiple use cases without duplication.

### Use `git ls-remote --heads origin <branch>` to check epic branch existence on remote before attempting PR creation, not error-driven PR creation with try-catch (2026-03-15)

- **Context:** When prBaseBranch='dev', child PRs merge directly to dev and epic branch never gets created on remote. Service blindly tried to create epic-to-dev PR from non-existent branch, causing failures and blocking epic.
- **Why:** Remote-direct check (no local fetch needed), returns empty output (not error) when absent — clean boolean mapping. Error-driven approach would block epic in error state instead of auto-recovering. Checking local branch won't work for unfetched refs.
- **Rejected:** Catch errors from `gh pr create` and retry logic — this blocks epic in error state instead of safe auto-completion path. Check local git state — incomplete without fetch.
- **Trade-offs:** Adds one extra git command per epic completion. Gains: cleaner recovery logic, no transient network failures permanently blocking epic. Loses: no explicit error context if branch was deleted vs never created.
- **Breaking if changed:** Without this check, epic blocks when children merge directly to dev (reintroduces original bug). Existing PR-creation flow fully preserved when branch exists.

#### [Gotcha] Catch block intentionally returns `false` (branch absent) instead of throwing when git command fails, treating transient failures as 'branch doesn't exist' (2026-03-15)

- **Situation:** Network hiccup or git config issue during `git ls-remote` — should not permanently block epic
- **Root cause:** False positive (assuming branch absent when it exists) is less harmful than blocking epic — false positive triggers safe direct-completion path. True negative (missing real branch) is caught by the normal case.
- **How to avoid:** Trades precise error diagnostics for resilience — you won't know if the git command actually failed vs branch really absent

#### [Pattern] Asymmetric dedup claim timing: direct-completion path claims dedup before any async ops; PR-creation path claims only after successful PR (2026-03-15)

- **Problem solved:** Two paths to epic.done have different failure modes — direct completion is sync, PR creation can fail. Each uses different strategy to avoid losing epics on retry.
- **Why this works:** Direct path: all operations succeed or throw, so dedup can be claimed upfront. PR path: gh pr create can fail transiently, so dedup must be claimed only after success to allow retries without losing the epic.
- **Trade-offs:** Gains: resilience to transient failures in each path. Loses: code duplication and asymmetry that must be maintained

#### [Gotcha] Epic branch nonexistence is used as a proxy signal for 'children merged directly to base', but this relies on implicit invariant: if epic.branchName is set, it exists on remote IFF children went through it (2026-03-15)

- **Situation:** When prBaseBranch='dev', epic.branchName is set but branch never created on remote. Service detects this via absence to infer bypass behavior.
- **Root cause:** Epic branch is only created when child PRs target it. If children target dev directly, epic branch never exists. Absence → bypass is deterministic.
- **How to avoid:** Implicit detection is flexible (auto-adapts if config changes mid-project) but fragile — breaks if someone manually deletes epic branch on remote after creation

#### [Pattern] Convergence point for cascade completion: both PR path and direct path call emit('feature:completed') + checkMilestoneCompletion, but code is duplicated (2026-03-15)

- **Problem solved:** When epic completes (either via PR auto-merge or direct completion), parent milestone must be checked for completion. This logic appears in both paths.
- **Why this works:** Milestone completion cascade must trigger in both cases — epic completion (any path) can unlock milestone. Currently duplicated to avoid shared mutable state.
- **Trade-offs:** Duplication is clearer (explicit in both paths) but violates DRY; extracted helper is DRYer but adds indirection that obscures the cascade responsibility

#### [Pattern] Tool profiles (chat/execution/review) enable context-aware tool availability in ToolRegistry (2026-03-15)

- **Problem solved:** ToolRegistry stores and vends tools with optional profile markers that filter tool sets by execution context
- **Why this works:** Allows same tool registry to provide different tool subsets depending on caller context — e.g., 'chat' profile excludes destructive tools, 'execution' profile includes them. Encodes policy without duplicating tools.
- **Trade-offs:** Flexibility: can swap profiles at runtime. Cost: need to define and maintain profile metadata for each tool; adds complexity to tool registration.

### Anthropic agentic loop implemented server-side (POST /chat handler) — detects tool_use blocks, executes via registry, feeds results back, repeats until end_turn (2026-03-15)

- **Context:** Server owns the orchestration of multi-turn tool interactions rather than delegating to client
- **Why:** Server maintains control over tool execution (security, logging, auditing); encapsulates Anthropic SDK specifics; centralizes retry/error-handling logic. Client sees simple request-response.
- **Rejected:** Alternative: client-side loop (client detects tool_use, decides execution, makes follow-up calls). This exposes Anthropic protocol to client, loses server control.
- **Trade-offs:** Simpler client contract. Cost: server must manage stateless multi-turn context (each call needs message history); more verbose API traffic.
- **Breaking if changed:** If loop moves to client, server can no longer audit/intercept tool calls; client must understand Anthropic tool-use protocol.

#### [Pattern] Server package defines local tools (getCurrentTimeTool in tools/example.ts) using defineSharedTool from tools package, not just importing pre-built tools (2026-03-15)

- **Problem solved:** Tools can be defined anywhere (not just in tools package) using the shared tool infrastructure
- **Why this works:** Allows server-specific tools without cluttering the shared tools package. Demonstrates that defineSharedTool is a reusable primitive for defining tools in any context, not just the tools package.
- **Trade-offs:** Flexibility: tools can be defined where they're used. Cost: tool definitions scattered across codebase; harder to discover/audit all tools.

### Cross-package TypeScript setup uses tsconfig paths + project references (tools package builds with composite:true, server references it and uses paths mapping to dist declarations) (2026-03-15)

- **Context:** Server needs types from tools package at compile time; tools package provides declarations to dist/
- **Why:** Project references ensure proper incremental compilation and type-safe cross-package dependencies. paths mapping lets server import from tools package using @@PROJECT_NAME-tools alias. Tools builds declarations first (composite:true) so types are available during server compilation.
- **Rejected:** Alternative: import directly from tools package source (no composite). This loses incremental build benefits and can cause circular dependency issues in monorepos.
- **Trade-offs:** Robust type safety and build ordering. Cost: requires understanding TypeScript project references; build failures if tools package declarations aren't generated.
- **Breaking if changed:** Removing composite:true or references will cause 'cannot find module' errors in server during typecheck. Changing paths mapping breaks imports.

#### [Pattern] Streaming pipeline: streamText → toUIMessageStream → createUIMessageStream → pipeUIMessageStreamToResponse. Each step transforms the stream for the next layer (inference→UI→HTTP). (2026-03-15)

- **Problem solved:** Building a server endpoint that streams agentic inference results back to a client using useChat hook
- **Why this works:** Each transformation is necessary: streamText produces raw inference stream; toUIMessageStream parses AI messages; createUIMessageStream adds event framing; pipeUIMessageStreamToResponse formats for HTTP text/event-stream
- **Trade-offs:** More abstraction layers increase complexity but ensure compatibility with Vercel ecosystem; single-purpose transformations make debugging easier

### Tools execute server-side (getCurrentTime runs on server, result streamed back), not delegated to client. Tool output is streamed inline within the agent response. (2026-03-15)

- **Context:** Designing tool execution model for a server-side agentic loop
- **Why:** Server-side execution keeps sensitive logic and state centralized; streaming results back keeps the conversation fluent for the client (no round-trip delay for each tool call)
- **Rejected:** Client-side execution (requires tool definitions shipped to client, logic duplication); polling for tool results (higher latency, complexity)
- **Trade-offs:** Server must be capable of executing tools; reduces client complexity; enables tools with side effects (server state, APIs)
- **Breaking if changed:** If tools are moved to client, the agent loop breaks (model expects tool results inline); if tool results aren't streamed, response latency increases per tool call

#### [Pattern] VitePress auto-scans `docs/templates/` directory to generate sidebar; new `.md` files appear without manual sidebar config changes (2026-03-15)

- **Problem solved:** Documentation site needs to maintain sidebar consistency as new starter kits are added
- **Why this works:** Convention over configuration reduces config coupling and eliminates friction for adding documentation. Developers just drop a file and it appears.
- **Trade-offs:** Pro: Zero config overhead. Con: Sidebar generation becomes 'magic'; developers unfamiliar with convention might not realize it's auto-generated and waste time trying to manually configure.

#### [Gotcha] Documentation describes `ai-agent-app` as a scaffold kit, but the server route at `apps/server/src/routes/setup/routes/scaffold-starter.ts` only validates `'docs' | 'portfolio' | 'landing-page' | 'general'` — `ai-agent-app` is not yet in the validation list (2026-03-15)

- **Situation:** Docs were written for a feature that isn't fully wired into the backend scaffold route
- **Root cause:** Documentation was written forward-compatible to describe the intended API/UX. Server-side wiring is a separate task. This decouples docs from implementation completion.
- **How to avoid:** Pro: Docs describe intended feature. Con: Users following docs might attempt to use `ai-agent-app` via CLI and fail with validation error, creating expectation mismatch.

#### [Pattern] Landing page starter uses JSON-driven content via Astro Content Collections — section content lives in JSON files, not in templates; rebranding needs only 6 CSS custom property changes (2026-03-15)

- **Problem solved:** Starter kits need to be easily customizable by users without requiring template edits
- **Why this works:** Separating content from presentation enables rebranding with data changes only. Single source of truth for customizable values reduces risk of inconsistency.
- **Trade-offs:** Pro: Rebranding is just JSON + CSS. Con: Extra indirection; developers need to understand Content Collections schema and JSON structure.

#### [Pattern] AI agent app starter uses `defineSharedTool` pattern where single tool definition compiles to MCP, LangGraph, and Express adapters (2026-03-15)

- **Problem solved:** Multiple runtime targets (different AI frameworks) need identical tool definitions without duplication
- **Why this works:** Single source of truth prevents tool definition divergence. Avoids maintaining same schema across three different adapter formats. Compilation ensures type safety across all targets.
- **Trade-offs:** Pro: One schema to maintain, automatic consistency. Con: Requires understanding compilation targets; tool authors must think about multi-adapter compatibility from the start.

### Browser extension kit uses `git clone` from GitHub; other kits use file scaffold from `@protolabsai/templates` package (2026-03-15)

- **Context:** Different starter kits have different provisioning requirements
- **Why:** WXT (browser extension tooling) requires native build scripts that `git clone` preserves. File copy can't reliably reproduce native behavior. Other kits don't have this constraint, so scaffold is preferred (offline capable, automatic name substitution).
- **Rejected:** Could scaffold browser extension via file copy, but npm hoisting would not preserve custom WXT build hooks
- **Trade-offs:** Clone: Network required, manual naming, native scripts work. Scaffold: Works offline, automatic naming, simpler provisioning. Right tool for each job.
- **Breaking if changed:** If browser extension moves to scaffold, native build scripts may fail due to npm hoisting losing build context

#### [Pattern] AI agent app uses three-package monorepo structure: `packages/server` (agentic loop), `packages/ui` (streaming chat), `packages/tools` (shared tool definitions) (2026-03-15)

- **Problem solved:** Single application needs separate runtime concerns with different deployment and usage targets
- **Why this works:** Separates concerns by responsibility. Tools can be reused by different clients (Express server, LangGraph flows, etc.). UI can be swapped independently. Server can be replaced with different runtime.
- **Trade-offs:** Pro: Clear responsibility boundaries, tool reusability. Con: npm hoisting complexity (documented as P3 known issue with symlinks)

### Used `any` type for optional Langfuse SDK dependency with dynamic import, rather than attempting complex conditional TypeScript types (2026-03-15)

- **Context:** Needed to support Langfuse as optional peer dependency so package installs without hard Langfuse requirement, but can still use it if available
- **Why:** TypeScript's type system cannot dynamically type based on optional imports at compile time. Conditional types insufficient for this pattern. Using `any` with explicit eslint-disable makes intent clear and trades type safety for flexibility.
- **Rejected:** Attempting clever conditional type signatures (proved insufficient in practice). Making Langfuse a required dependency (bloats starter kit).
- **Trade-offs:** Lose type safety on SDK instance, but gain portability. Package stays under ~2KB without langfuse installed.
- **Breaking if changed:** If dynamic import is removed, either SDK calls break at runtime or types must be tightened, breaking the optional-dependency contract.

#### [Pattern] FileTracer as always-available fallback ensures local observability always works, even without Langfuse or external services (2026-03-15)

- **Problem solved:** Starter kit needs working observability in dev/test environments where external services may not be configured
- **Why this works:** Provides immediate tracing capability for debugging and development. File-based backend has no external dependencies. Improves developer experience by removing setup friction.
- **Trade-offs:** File I/O and disk space overhead (per-trace JSON files) vs guaranteed observability availability. Traces in files are not queryable like Langfuse.

### Zero @protolabsai/\* internal imports — package is entirely standalone and portable outside monorepo (2026-03-15)

- **Context:** Building a 'starter kit' package that may be extracted, reused, or scaffolded into new projects
- **Why:** Internal imports create tight coupling to monorepo structure. Prevents package from being copy-pasted or npm-installable independently. Starter kits need to work as templates outside their origin.
- **Rejected:** Using shared utilities from main codebase (would require monorepo resolution). Using @automaker-scoped imports.
- **Trade-offs:** Duplication of some utility logic (e.g., logger parameter defaults) vs complete independence. Requires discipline to avoid importing @protolabsai.
- **Breaking if changed:** Any future reference to @protolabsai modules breaks the package's reusability and forces consumers to refactor.

#### [Pattern] Environment-variable-based factory auto-detection (createTracingConfig) couples deployment configuration to feature activation (2026-03-15)

- **Problem solved:** Need to auto-select between Langfuse and FileTracer based on whether external service is configured
- **Why this works:** Env vars are the standard deployment configuration mechanism. Checking LANGFUSE_PUBLIC_KEY + LANGFUSE_SECRET_KEY allows ops to enable/disable Langfuse without code changes. Simplifies onboarding: developers get FileTracer by default, ops sets env to upgrade to Langfuse.
- **Trade-offs:** Feature availability depends on deployment config (good for flexibility, harder to test all paths locally). Env var absence is implicit feature detection, not explicit declaration.

#### [Gotcha] SharedTool type parameter requires <any, any> not <unknown, unknown> due to contravariance on the execute function parameter (2026-03-15)

- **Situation:** registerTool() accepts any SharedTool variant and wraps registry.register(). TypeScript's contravariance rules made unknown unsuitable.
- **Root cause:** The execute function is contravariant in its parameters (it must accept _more_ general types than the specific tool provides). With unknown representing an unknown-but-specific type, it violates contravariance. Only any (representing truly unconstrained types) satisfies the constraint.
- **How to avoid:** Loses type safety but necessary for the generic registry pattern. Mitigated with ESLint disable comment to flag the compromise.

#### [Pattern] Use Object.assign on defineSharedTool result instead of importing registry into example.ts to attach requiresConfirmation flag (2026-03-15)

- **Problem solved:** Need to define server-local tools with confirmation requirements without creating circular import (registry would import example for defaults, example needs registry for the flag)
- **Why this works:** Breaks circular dependency by keeping example.ts import-light. The flag is attached at call-site, not at definition. Registry stays as the single source of truth for confirmation tracking via registerTool().
- **Trade-offs:** Adds indirection (Object.assign) but cleaner module boundaries and no import cycles. Slightly less discoverable that requiresConfirmation is registry-managed.

#### [Pattern] Tool profiles (chat, execution, review) as role-scoped tool subsets via getAnthropicToolsForProfile(), not all tools available to all callers (2026-03-15)

- **Problem solved:** Different agent roles and chat routes need different tool access. Not all tools safe/relevant for all contexts.
- **Why this works:** Implements least-privilege principle. Caller asks 'what tools does this role use' rather than 'is this tool available'. Profile is source of truth for role→tools mapping.
- **Trade-offs:** Profile definitions require maintenance as new tools added, but intent is clear and role access is centralized and auditable

### Server-local tools (get_weather with requiresConfirmation) coexist with shared tools (get_current_time). Tool profiles handle visibility, not a separate 'server tools' queue. (2026-03-15)

- **Context:** Some tools are shared across templates/clients; others are server-specific with custom requirements like human confirmation
- **Why:** Single registry treats all tools uniformly. The requiresConfirmation flag and profile membership determine behavior per tool, not tool classification. Avoids separate registries and keeps registration consistent.
- **Rejected:** Separate 'server tools' registry or queue adds complexity and breaks the single source of truth. Shared vs local is implementation detail, not architectural.
- **Trade-offs:** All tools go through same registerTool() path but can have different profiles/flags. Simpler conceptually but requires discipline to define profiles correctly.
- **Breaking if changed:** If someone assumes shared tools never have requiresConfirmation or server tools aren't in the main registry, they'll miss the flag or tool entirely

### WebSocket sideband runs on separate port with idempotent lifecycle, independent of HTTP server (2026-03-15)

- **Context:** Broadcasting real-time tool progress to clients without blocking chat
- **Why:** Separation of concerns: WS server lifecycle independent from HTTP; port flexibility (WS_PORT env var or explicit arg); startWebSocketServer() is idempotent so safe to call multiple times without coordination logic
- **Rejected:** Could merge into HTTP server for simplicity, but loses port flexibility and couples unrelated concerns; HTTP SSE/long-polling simpler to wire but higher overhead
- **Trade-offs:** Adds another port to manage, but gains flexibility to run/stop WS independently; no wiring needed in express routes
- **Breaking if changed:** If WS merged into HTTP server, would lose ability to configure port separately; clients couldn't connect before HTTP fully initialized

### toolProgress singleton exported from progress.ts; tools import and use directly without knowing about ws.ts (2026-03-15)

- **Context:** Tools need a way to emit progress; ws.ts handles broadcast, but tools shouldn't import ws module
- **Why:** Decouples tool code (which is domain logic) from infrastructure (WebSocket, rate limiting). Tools just call emit(); the singleton hides complexity. Keeps tool code testable and reusable outside WS context.
- **Rejected:** Could require tools to import ws.ts and call broadcastProgress directly (couples domain to infra), or pass emitter as parameter to every tool (friction)
- **Trade-offs:** Hidden dependency: tool behavior changes based on what's wired in progress.ts, but keeps tool code clean and testable in isolation
- **Breaking if changed:** If toolProgress singleton removed, every tool using it breaks; if moved to different module, import paths break across codebase

#### [Gotcha] TanStack Router requires routeTree.gen.ts to exist as a pre-seeded stub in templates, despite being auto-generated by Vite plugin on first run. Stub syntax may not match actual generated output across TanStack Router versions. (2026-03-15)

- **Situation:** Building Vite SPA skeleton with file-based routing; TypeScript must resolve imports in main.tsx before Vite plugin executes
- **Root cause:** Vite plugin runs during dev server startup, not during initial build validation. TypeScript needs the file to exist for import resolution. Without stub, 'Cannot find module routeTree.gen.ts' errors block the entire build.
- **How to avoid:** Stub gets overwritten on first dev run (acceptable); syntax mismatches possible across versions (no runtime impact but could confuse developers); committed file that looks like dead code but is essential

### TypeScript tsconfig.json: moduleResolution set to 'bundler' (not 'node') and module set to 'ESNext' (not 'commonjs'), for Vite SPA compatibility. (2026-03-15)

- **Context:** Building Vite 7 frontend that imports ES modules and Vite-specific plugins
- **Why:** 'bundler' tells TypeScript to resolve modules the same way Vite does, not how Node.js does. 'ESNext' output prevents TypeScript from transpiling to CommonJS, which Vite cannot optimize. Mismatch causes 'Cannot find module' errors at runtime despite files existing.
- **Rejected:** moduleResolution: 'node' + module: 'commonjs' causes TypeScript and Vite to disagree on module paths; moduleResolution: 'node' + module: 'esnext' confuses TypeScript about conditional exports
- **Trade-offs:** 'bundler' mode incompatible with pure Node.js runtime code; ensures TypeScript and bundler agree; loses ability to import CommonJS modules directly
- **Breaking if changed:** Reverting to 'node' moduleResolution causes mysterious runtime errors for modules that resolve in Vite but not from Node perspective; reverting to 'commonjs' module output breaks Vite treeshaking and dynamic imports

#### [Gotcha] AI SDK v6 does not expose a stepType field directly. Step type must be inferred from content (presence of tool calls = tool-result, otherwise = text). (2026-03-15)

- **Situation:** UI needs to categorize steps for display but SDK doesn't provide explicit type annotation
- **Root cause:** SDK design abstracts step classification away; inference from content structure is reliable alternative
- **How to avoid:** Inference logic adds complexity but avoids external dependencies; makes step type derivation fragile to SDK content changes

#### [Gotcha] AI SDK v6 does not expose per-step wall-clock timings. Step duration must be approximated by distributing total stream duration evenly across steps. (2026-03-15)

- **Situation:** Latency waterfall visualization requires per-step timing but SDK only provides aggregate metrics
- **Root cause:** SDK design focuses on aggregate performance; per-step instrumentation would require deeper framework integration
- **How to avoid:** Even distribution hides actual step bottlenecks; waterfalls are visually accurate but misleading about performance

#### [Pattern] Trace storage uses in-memory ring buffer (max 100 traces) instead of persistent storage or unbounded array. (2026-03-15)

- **Problem solved:** Starter template needs observability without infrastructure dependency or memory bloat
- **Why this works:** Ring buffer provides bounded memory guarantee (prevents OOM) while remaining simple; max 100 is reasonable for local dev/demo
- **Trade-offs:** Traces lost on server restart and when buffer wraps (FIFO); production observability would need persistence and larger limits

### Trace viewer UI uses REST polling (GET /api/traces) instead of WebSocket or Server-Sent Events for updates. (2026-03-15)

- **Context:** Observability dashboard needs to refresh trace list but starter template should minimize infrastructure
- **Why:** REST fits existing Express routing pattern; polling is stateless and requires no new protocol
- **Rejected:** WebSocket — requires persistent connection, more complex server state; SSE — still requires server initiative
- **Trade-offs:** Manual refresh button required (not real-time); polling can overwhelm server if many clients; simplicity wins for template
- **Breaking if changed:** Real-time trace visibility requires upgrading to WebSocket or SSE; polling latency grows with scale

#### [Pattern] Flush-before-switch pattern: explicitly save messages to store before switching sessions via handleSwitchSession callback. (2026-03-15)

- **Problem solved:** Preventing message loss when user switches between chat sessions. Session switches are discontinuous events that break automatic syncing.
- **Why this works:** Without explicit flush, messages in flight remain in useChat hook's state but never persist to session store. Automatic Zustand updates only capture messages synced via setMessages(), not messages the hook is still holding during a switch.
- **Trade-offs:** Adds extra localStorage writes per switch but guarantees no message loss. Simpler than debouncing or polling for stale state.

### LRU eviction by updatedAt timestamp, not creation date, with hard cap at 50 sessions. (2026-03-15)

- **Context:** Limiting localStorage footprint while preserving user accessibility. 50 sessions is typical limit in Discord/Slack clones.
- **Why:** updatedAt (last activity) is better heuristic than createdAt (creation time) — recently used sessions more likely to be needed again. Hard cap prevents unbounded growth that degrades app performance.
- **Rejected:** FIFO (oldest created first) — loses recent working sessions. Unbounded growth — localStorage bloat. User-configurable limits — adds UI complexity.
- **Trade-offs:** Older conversations evicted silently. Users may lose < 50 chats but gain predictable perf. Alternative is manual pruning burden on user.
- **Breaking if changed:** Remove LRU → unbounded sessions, localStorage can exceed 5-10MB limit on some browsers. Change 50→smaller → aggressive eviction harms UX.

### Zero monorepo dependencies in starter kit: only zustand, ai, @ai-sdk/react. Intentionally omit @protolabsai/\* packages (auth, subagent, PR watch, checkpoint rewind). (2026-03-15)

- **Context:** Starter kit must be copyable by external users who don't have access to protoMaker's internal packages.
- **Why:** Maintain reusability. External users clone ai-agent-app/ and npm install; if @protolabsai/types was imported, their install fails. Starter kit teaches patterns, not protoMaker internals.
- **Rejected:** Reuse @protolabsai/types, @protolabsai/auth → forces external users to install monorepo or duplicate types. Creates hard coupling.
- **Trade-offs:** Can't leverage shared patterns from main app (some duplicated types, some simplified). Simpler onboarding for external users. Maintenance burden: keep in sync manually.
- **Breaking if changed:** Add @protolabsai/\* import → starter kit becomes unmigrateable for external users. Defeats 'zero-monorepo-dependency' constraint.

### Instead of a single configurable createGraph({ topology: 'linear', ...config }) builder, created separate factory functions for each topology: createLinearGraph, createLoopGraph, createBranchingGraph. Each factory is tailored to its topology's router constraints. (2026-03-15)

- **Context:** Needed a way to create LangGraph state graphs with different control flow patterns (linear sequences, loops, branching decisions).
- **Why:** Separate factories provide type safety—each topology enforces appropriate router types at compile time. Avoids discriminated union complexity in a single builder. Simpler mental model: developers think about graph topology first, then use the appropriate factory.
- **Rejected:** Single configurable builder with topology parameter would provide more flexibility but requires runtime type guarding and less clear type inference for routers.
- **Trade-offs:** Easier to understand and type-safe vs harder to extend—adding a new topology requires a new factory function and code change (not just config). No polymorphic extension mechanism.
- **Breaking if changed:** Code that calls createLinearGraph or similar expects those functions to exist. Removing a factory function breaks all code using that topology. Changing factory signatures breaks callers.

#### [Pattern] Provided 10 reducer functions (appendReducer, counterReducer, mapMergeReducer, idDedupAppendReducer, etc.) for different state merge semantics instead of a simple replacement strategy. Each reducer handles a specific accumulation or merge pattern. (2026-03-15)

- **Problem solved:** LangGraph state nodes produce output that needs to be merged into the global state. Different fields require different merge behaviors (append to list, increment counter, merge maps, deduplicate by ID, etc.).
- **Why this works:** Multi-node flows need field-specific merge semantics. A simple replace loses information (can't accumulate results). Reducers enable declarative merge strategies per field without developers writing merge logic.
- **Trade-offs:** More abstractions to learn and configure vs cleaner state management without custom logic. Adds 10 functions but saves developers from writing context-specific merge code.

#### [Pattern] createSubgraphBridge pattern for composing interrupt/resume flows. Wraps a subgraph in a bridge node that checks pending approvals and routes accordingly, enabling HITL workflows with checkpointing. (2026-03-15)

- **Problem solved:** HITL (human-in-the-loop) approval flows need to pause execution for human review, store state, and resume with human decision. LangGraph checkpointing supports this, but composing approval logic with main flow requires a composition pattern.
- **Why this works:** Subgraph composition keeps approval logic encapsulated and reusable. Bridge pattern separates the composition glue (routing, state mapping) from the subgraph implementation. Enables nested approval flows.
- **Trade-offs:** Cleaner composition and reusability vs additional abstraction layer. Bridge requires understanding interrupt semantics and command-based resumption.

#### [Pattern] Router composition combinators (combineRoutersAnd, combineRoutersOr) allow combining multiple router conditions without developers writing conditional logic. Routers compose into more complex routing policies. (2026-03-15)

- **Problem solved:** Complex routing decisions often need AND/OR logic (route if condition1 AND condition2, or condition3). Developers would otherwise write nested conditionals.
- **Why this works:** Compositional routing enables declarative complex logic. Reduces cognitive load of conditional chains. Makes routing policies reusable and testable.
- **Trade-offs:** Enables powerful routing composition vs adds abstraction layer that developers must understand (AND semantics, OR semantics).

### Implemented a zero-dependency XML parser (xml-parser.ts) instead of using an external XML library. Parser is custom-built for LLM structured output extraction. (2026-03-15)

- **Context:** Tool-calling agent example needs to parse XML tool calls from LLM output. Starter kit aims to minimize dependencies.
- **Why:** Starter kits must minimize dependencies for bundle size and setup friction. Custom parser is optimized for the specific XML structure (tool calls with params). Avoids dependency on full XML parsing library.
- **Rejected:** Using xml2js, fast-xml-parser, or similar libraries adds dependency and bundle bloat for starter kit.
- **Trade-offs:** Custom code requires maintenance vs avoiding external dependency. Parser is not feature-complete (no namespaces, CDATA, etc.) but sufficient for LLM tool calls.
- **Breaking if changed:** If tool call XML structure changes significantly, custom parser requires updates. Removing the parser breaks tool-calling-agent example.

### Tool progress events flow through separate WebSocket sideband (port 3002) rather than main chat stream (2026-03-15)

- **Context:** Needed to show live tool execution progress (progress label updates) without blocking or cluttering main message stream
- **Why:** Tool progress is high-frequency, independent of message ordering, has separate lifecycle. Decoupling allows each stream to scale independently. Main stream handles discrete messages; sideband handles continuous state.
- **Rejected:** Sending progress as streaming updates through main chat API or server-sent events on same connection
- **Trade-offs:** Gains: independent connection management, cleaner event separation. Loses: requires dual connection management, port 3002 is hardcoded and brittle, dev environment must have progress server running for feature to work.
- **Breaking if changed:** Removing the sideband connection silently removes all tool progress labels. No error, just missing feature. Breaking change is invisible.

### Use a closed, enumerated set of five domain-specific node types (Agent/Tool/Condition/State/HITL) rather than a generic extensible node system (2026-03-15)

- **Context:** The flow builder generates valid @langchain/langgraph TypeScript. Each node type has specific code generation semantics (Agent → LLM call, Condition → router with edge conditions, State → transformation, etc.).
- **Why:** A closed set makes code generation deterministic. Each node type knows exactly how to generate itself: AgentNode → agent executor, ConditionNode → conditional edge routing. A generic 'node with inputs/outputs' would require runtime type inspection, user-specified templates, or schema inference — making code generation intractable.
- **Rejected:** Fully generic node system (like Obsidian Canvas) offers more expressivity but breaks codegen — you can't auto-generate valid code for arbitrary node shapes without runtime schema metadata.
- **Trade-offs:** Reduced expressivity (can only model 5 node kinds) vs. reliable, predictable code generation. Adding a new node type requires both a React Flow custom component AND codegen logic.
- **Breaking if changed:** If types become generic, the code generation system breaks — it no longer knows how to produce valid LangGraph code for arbitrary nodes.

### Commands self-register via side-effect imports (example.ts imported by both chat.ts and commands.ts). This ensures availability regardless of which route initializes first, without explicit factory calls or initialization order management. (2026-03-15)

- **Context:** Needed to make commands available to both the chat route (for expansion) and the commands endpoint (for listing). Had to ensure registration happened before either route tried to use them.
- **Why:** Side-effect imports eliminate the need to maintain an explicit initialization order or central registry loader. Both entry points can simply import example.ts and be guaranteed commands exist. Simple and automatic.
- **Rejected:** Explicit factory pattern with parameterized initialization, or main-level registration orchestration. These require coordination across multiple files.
- **Trade-offs:** Side-effects are less visible than explicit calls — developers might not realize registration happens on import. But the benefit is complete decoupling of import order.
- **Breaking if changed:** Removing the import from either chat.ts or commands.ts silently breaks command availability in that route. No compiler error signals the problem.

#### [Pattern] Command detection runs only on the LAST user message, not all messages or history. The parser uses regex returning null for non-commands, which keeps normal chat completely unaffected by command logic. (2026-03-15)

- **Problem solved:** Need to intercept user commands without blocking normal conversation. Important to avoid false positives or breaking existing chat.
- **Why this works:** Last message only is the natural UX — user types command at current turn. Null return for non-commands means the expansion branch never executes for normal chat (no performance cost, no side effects). This is fail-safe: command logic is completely isolated.
- **Trade-offs:** Can't use commands for historical analysis or batch operations. But this simplifies the model's task — it always sees fresh command-expanded context, not historical command artifacts.

#### [Gotcha] The system prompt prepending order matters: `expansion + '\n\n' + resolvedSystem`. If expansion comes after, it can be overridden by default system instructions. The two-newline separator is critical for visual clarity in model interpretation. (2026-03-15)

- **Situation:** Built-in system prompts could conflict with or override command expansions if the order is wrong. The model sees the concatenated string.
- **Root cause:** Commands must take precedence because they're explicit user intent. Prepending ensures they appear first in the model's context window. Two newlines provide clear section break (vs. single newline which looks like continuation).
- **How to avoid:** Double newline adds 2 bytes but significantly improves model readability. The trade-off is worth it for clarity.

### Built minimal inline YAML parser instead of using gray-matter or js-yaml dependency (2026-03-15)

- **Context:** PromptLoader needs to parse YAML frontmatter from markdown prompt files
- **Why:** Keep starter kit truly standalone with zero runtime dependencies; simplicity matches the narrow YAML subset needed (key: value, lists)
- **Rejected:** gray-matter, js-yaml — adds ~100KB dependencies to starter kit when only parsing simple frontmatter is needed
- **Trade-offs:** Lost: complex YAML features (anchors, refs, nested structures). Gained: zero dependencies, smaller bundle, easier onboarding for beginners scaffolding from this kit
- **Breaking if changed:** If prompt frontmatter expands to complex YAML (anchors, nested objects), the inline parser fails — forces upgrade to real YAML library

#### [Pattern] Registry ships empty; Loader is separate population mechanism. Registry is pure data structure, Loader couples to file I/O (2026-03-15)

- **Problem solved:** Need a prompt store that can be tested without file system, but also loaded from disk at runtime
- **Why this works:** Separation of concerns: registry never needs to know where prompts come from. Enables testing registry in isolation, swapping loaders (disk, HTTP, database) without changing registry API
- **Trade-offs:** Easier: independent unit testing, runtime flexibility (load from different sources). Harder: two classes to understand instead of one

#### [Pattern] Prompts stored as git-tracked markdown files (not JSON, YAML files, or database) with YAML frontmatter (2026-03-15)

- **Problem solved:** Need versioned, reviewable prompt evolution as prompts change across releases
- **Why this works:** Plain markdown makes diffs naturally human-readable; PR review workflow is native (see prompt changes inline); git history tracks why prompts changed; no separate infrastructure needed
- **Trade-offs:** Easier: natural diffs, zero infra, works with git blame/log. Harder: can't query prompts by metadata without parsing (no full-text search without loading files)

#### [Pattern] Side-effect import registration pattern: roles are registered via `import '../roles/assistant.js'` in the route handler, not explicitly called in code (2026-03-15)

- **Problem solved:** Roles system needed to auto-register built-in roles without explicit registration calls in route handler
- **Why this works:** Decouples role definitions from route wiring. Mirrors the commands system pattern. Enables new roles to be added by simply creating a new file + importing it, without modifying route code
- **Trade-offs:** Less explicit (implicit dependency via side effect) but more flexible for extensibility. New roles require just a file + import, no route changes

#### [Pattern] Separation of registry mechanism (index.ts) from role definitions (assistant.ts): core `registerRole / getRole / listRoles` live in index; actual roles in separate files (2026-03-15)

- **Problem solved:** Needed extensible role system where new roles can be added without modifying core logic
- **Why this works:** Creates plugin-like architecture. Reduces cognitive load: registry is the contract, roles are implementations. New roles added by: create file + import it. No modification to index.ts needed
- **Trade-offs:** More files to maintain but clearer extension points. Requires discipline: each role must import `registerRole` and side-effect import from route

### Switched from direct component render (<TracesPage />) to TanStack Router's RouterProvider to activate file-based route definitions (2026-03-15)

- **Context:** File-based routes (prompts.tsx, sessions.tsx, etc.) were defined but not being rendered because App.tsx wasn't using RouterProvider
- **Why:** TanStack Router requires explicit RouterProvider wrapper to activate createFileRoute() definitions. Without it, the routing framework doesn't bootstrap.
- **Rejected:** Keeping direct component rendering (would require manual route management; file-based routes ignored by framework)
- **Trade-offs:** Gained: automatic route discovery, type-safe routing, lazy loading support. Cost: RouterProvider is now mandatory wrapper.
- **Breaking if changed:** Removing RouterProvider breaks all file-based routes (prompts, sessions, flows, settings become unreachable)

#### [Pattern] Store prompts as git-versioned Markdown files with YAML frontmatter + inline {{variable}} extraction instead of database (2026-03-15)

- **Problem solved:** Prompts need versioning, easy diffing, and version control alongside app code
- **Why this works:** Treats prompts as code artifacts. Enables git history, collaborative review via PRs, easy restore/rollback without database migrations. Inline {{var}} extraction allows both declarative metadata and template syntax in same file.
- **Trade-offs:** Gained: git integration, file-based diffs, natural backup/restore, single source of truth. Cost: no real-time multi-server sync, read-from-disk I/O on each request, eventual consistency only

### Bind prompts to specific LLM models via toolbar selector; not model-agnostic (2026-03-15)

- **Context:** Different models have different prompt engineering best practices (system message placement, token limits, special tokens)
- **Why:** Model-specific tuning maximizes quality; allows showing model-appropriate constraints (context window, max tokens). Generic prompts rarely optimize for all models.
- **Rejected:** Model-agnostic prompts (lower quality across all models; no model-specific validation)
- **Trade-offs:** Gained: model-optimized prompts, appropriate constraints shown. Cost: prompt reuse across models requires manual adjustment
- **Breaking if changed:** Removing model binding loses model-specific validation; can't warn on incompatible prompt patterns

### Slash commands expand via system-prompt prepending, not message body injection. Command text is stripped from user message before adding to history. (2026-03-15)

- **Context:** Implementing slash command system that affects how model responds without changing conversation history semantics
- **Why:** System-prompt prepending keeps the command metadata out of the persisted conversation. User sees clean message history while model gets instruction context. If injected into message body, command text would appear in exports and history.
- **Rejected:** Message body injection (would pollute conversation history with command syntax)
- **Trade-offs:** Slightly more complex server logic (detect + extract + prepend) for cleaner conversation semantics
- **Breaking if changed:** If changed to message injection, exported conversations and chat history would include raw slash command syntax; user experience degrades

#### [Pattern] Agent roles load via side-effect imports in shared registration file (roles/assistant.ts), not explicit wiring. New roles are available immediately after registration without additional setup. (2026-03-15)

- **Problem solved:** Designing extensibility model for agent roles without requiring manual registration in routing layer
- **Why this works:** Side-effect imports enable zero-wiring extensibility. File loads on startup, runs registerRole() calls automatically. Developers only touch one file (roles/assistant.ts) to add a role; no routing, no enum updates, no service locator changes needed.
- **Trade-offs:** Side-effects are harder to trace (why is this module imported?) but easier for developers adding roles (single-file change)

### Starter kit CSS theming uses arbitrary Tailwind syntax (e.g., `bg-[var(--primary)]`) instead of semantic design tokens or @protolabsai/ui dependency. (2026-03-15)

- **Context:** Keeping starter kit lightweight and self-contained vs integrating with design system infrastructure
- **Why:** Starter kit has no dependency on design system package. Using CSS variables + arbitrary Tailwind values allows custom theming (color swap via :root vars) without framework lock-in. Keeps template dependencies minimal and bundle small.
- **Rejected:** Adding @protolabsai/ui dependency (couples starter kit to design system, adds weight); hardcoding colors (not themeable); semantic token system (requires design system infrastructure)
- **Trade-offs:** Simpler, standalone template at cost of not leveraging shared design patterns. Users upgrading to full design system will need refactoring.
- **Breaking if changed:** If starter kit later adopts design system tokens, all theme variable names and patterns would need systematic renaming; styling approach fundamentally changes

#### [Pattern] Starter kit uses @@PROJECT_NAME template placeholders in package names, imports, and identifiers, requiring find-replace as first setup step. (2026-03-15)

- **Problem solved:** Making a single starter template reusable for multiple projects with different names
- **Why this works:** Placeholders decouple template source from user project naming. Single README/code base serves all users. Find-replace is faster than templating engine and requires no build-time processing. Users understand they're customizing a template.
- **Trade-offs:** Simple find-replace vs sophisticated templates; users must understand placeholder semantics

#### [Pattern] Tool progress events stream over separate WebSocket sideband (default port 3002), not blocking main REST API. If WebSocket unavailable, tools still execute; only progress labels fail silently. (2026-03-15)

- **Problem solved:** Providing live feedback for long-running tools without coupling to main request/response cycle
- **Why this works:** WebSocket sideband is optional for UI polish but not required for functionality. Tools don't wait on sideband connection. Decoupling progress from execution lets main API respond immediately while updates stream asynchronously.
- **Trade-offs:** Extra port + connection complexity for better UX; graceful degradation if sideband fails

#### [Gotcha] Scaffold functions (scaffoldAiAgentAppStarter) can exist in the template library and be exported without being wired into the feature/context integration system. They are separate concerns. (2026-03-15)

- **Situation:** Found that scaffoldAiAgentAppStarter was already exported from scaffold.ts but AI_AGENT_APP_FEATURES array and getAiAgentAppStarterContext() were missing, requiring explicit addition despite the scaffolder existing.
- **Root cause:** Scaffold functions define template file structure. Features and context functions define user onboarding (board items + CONTEXT.md). These are decoupled: a scaffold can exist without onboarding guidance.
- **How to avoid:** More code needed to integrate new templates, but allows incremental development (scaffold first, onboarding later); forces intentional design of user experience

#### [Pattern] kitType union type is defined independently in 5+ files (setup-client.ts, scaffold.ts, templates.ts, features.ts, starters.ts) rather than imported from a single canonical source. (2026-03-15)

- **Problem solved:** Each integration point (UI, server, client, orchestrator, library) declares its own kitType union instead of sharing one definition.
- **Why this works:** Avoids creating a shared type that forces import dependencies between packages. Each package/layer declares the types it needs independently.
- **Trade-offs:** Must update multiple files when adding new template type (more friction, easier to miss), but each layer remains independently testable and deployable without type coordination

#### [Pattern] Adapter pattern (toMCPTools) bridges internal ToolRegistry format to MCP SDK protocol format, enabling tool definitions to be reused across multiple protocol/consumer implementations without SDK coupling (2026-03-15)

- **Problem solved:** MCP server must expose tools that were defined in an internal format (ToolRegistry) to the MCP SDK's expected interface
- **Why this works:** Decouples internal tool representation from external protocol requirements; allows same tool definitions to work with multiple protocols (MCP, HTTP, etc.) without duplication
- **Trade-offs:** Adds abstraction layer (+indirection cost, +maintenance) but enables protocol independence and tool reusability (-tight coupling)

#### [Pattern] Templated workspace dependencies (@@PROJECT_NAME-tools placeholder) enable generic starter kits where imports use symbolic project names that resolve as workspace symlinks at install time (2026-03-15)

- **Problem solved:** Starter kit must work for any user project name without hardcoding specific package names; tools package is local and should be referenced generically
- **Why this works:** Single starter template works for all users; npm workspace resolution automatically creates symlinks for @@PROJECT_NAME-\* packages, so code requires zero manual path editing
- **Trade-offs:** Generic templates work without templating engines (+simplicity) but create unusual import patterns that might confuse IDE tooling and require npm workspace setup

#### [Pattern] Minimal viable example tools (getWeatherTool, searchWebTool) are auto-registered in the server to provide immediate functionality and serve as copy-paste templates for users adding custom tools (2026-03-15)

- **Problem solved:** Empty MCP server with no tools registered is not useful for testing or demonstration; users need working examples to understand how to add their own tools
- **Why this works:** Self-documenting through example; users see 'registry.register(getTool)' pattern and can replicate it; server starts with immediate utility rather than requiring configuration before first use
- **Trade-offs:** Example tools add cognitive load and footprint (+what to remove) but eliminate blank-slate confusion and provide working reference implementation

### Used `@@PROJECT_NAME` placeholder pattern in all documentation code examples instead of hardcoded package names (2026-03-15)

- **Context:** AI Agent App Starter Kit is a reusable template that users will customize with their own project name
- **Why:** Enables single-pass find-replace during project setup. Docs become universally applicable regardless of user's project name choice. Avoids maintaining fork-specific documentation.
- **Rejected:** Hardcoding real package names (e.g., 'my-agent-tools') would bind docs to specific project, requiring per-fork updates or breaking examples
- **Trade-offs:** Slightly less immediately clear during development/reading, but vastly improves reusability and reduces maintenance burden for all downstream users
- **Breaking if changed:** Removing this pattern forces every project using the starter kit to manually update docs or creates a new source of truth per fork

#### [Pattern] Applied Diataxis framework to structure 10 documentation files across four categories: tutorials (quickstart), explanations (concepts), how-to guides, and reference (2026-03-15)

- **Problem solved:** Complex starter kit with multiple subsystems (tools, flows, tracing, MCP, prompts) required coherent documentation strategy
- **Why this works:** Diataxis separates by user intent: learners follow tutorials, searchers scan references, builders read how-tos, students study explanations. Each doc type answers different questions and optimizes for different reading patterns.
- **Trade-offs:** More files to maintain but dramatically improves findability, clarity, and user outcomes. Requires discipline to not duplicate content across categories.

### Documentation authored as pure markdown (no code generation, no embedded TypeScript, no dynamic references) (2026-03-15)

- **Context:** Starter kit needs living docs that evolve independently from runtime code
- **Why:** Markdown is version-controllable, fork-safe, and human-readable. Separating docs from code prevents docs from becoming outdated when code changes, allows docs to explain intent beyond what code shows, enables copy-paste examples without runtime dependencies.
- **Rejected:** Auto-generated docs (JSDoc, TypeDoc) would stay in sync but lose narrative flow, teaching value, and ability to show step-by-step progression
- **Trade-offs:** No automatic sync detection means docs drift if code API changes, but humans can write better examples, explain trade-offs, and guide learning
- **Breaking if changed:** If docs are auto-generated later, all narrative structure, examples, and teaching content would be lost

#### [Pattern] ASCII architecture diagram in README instead of external image file (2026-03-15)

- **Problem solved:** Starter template needs to communicate system topology (packages/app → packages/server → packages/mcp with WebSocket sideband)
- **Why this works:** ASCII diagrams are version-controllable, renderable in plain text terminals, require no external assets, survive git diffs/reviews clearly
- **Trade-offs:** ASCII is harder to make visually polished but gains portability across all documentation contexts (GitHub, terminals, generated docs)

#### [Pattern] Relative documentation paths (docs/guides/creating-tools.md) instead of absolute URLs in starter template README (2026-03-15)

- **Problem solved:** Starter template README must work in multiple contexts: GitHub web UI, local git clone, generated documentation sites
- **Why this works:** Relative paths resolve correctly across all contexts; absolute URLs break during docs restructuring or when served from different origins
- **Trade-offs:** Relative paths are slightly less flexible for cross-project linking but gain robustness against docs restructuring

#### [Gotcha] Wire format (string fills) vs structured types (object fills) are two different representations. libs/pen-parser/types.ts uses actual .pen wire format (fill?: string); libs/types/pen.ts uses abstracted structured format (PenFill[]). Unified by making wire format authoritative and keeping both representations in types.ts. (2026-03-15)

- **Situation:** Extracting type definitions from two different sources with incompatible type shapes
- **Root cause:** The actual pencil.dev .pen format is wire-compatible, not structured. Pen-parser is the source of truth. Attempting to use libs/types shape would require runtime conversions.
- **How to avoid:** Keep wire format representation = simpler parser, more conversions in style-utils; use structured format = more complex parser, cleaner style layer. Chose former to minimize parser complexity.

### Extracted package has zero npm dependencies. All utilities copied as-is without adding lodash, uuid, or other common helpers. (2026-03-15)

- **Context:** Creating reusable design-system starter kit package that should work via copy-paste into any project
- **Why:** Zero dependencies = zero transitive security surface, zero version conflicts, pure copy-paste portability. Starter kits get forked/customized, so external deps become maintenance burden.
- **Rejected:** Add typed-helpers for common patterns (cleaner code, but dependency lock-in); use utility libraries (standard practice, but conflicts with starter philosophy)
- **Trade-offs:** Some code duplication vs zero integration friction. Utilities less polished but completely self-contained.
- **Breaking if changed:** If code adds dependency on lodash (for memoization, defaults, etc), starter kit becomes non-portable—users must manage lodash versions.

### Node types include annotation types (note, prompt, context) as first-class node types, not metadata fields. Brings total from 7 to 15 PenNode types. (2026-03-15)

- **Context:** Design tool supports design annotations (comments, prompts) that need structure in .pen format
- **Why:** Treats annotations as structural objects, not attributes. Enables traversal, selection, export like other nodes. Simplifies visitor pattern.
- **Rejected:** Metadata field on other nodes (less discoverable, complicates traversal); separate annotation document (adds complexity to format)
- **Trade-offs:** Cleaner traversal = complexity in serialization (annotations must survive round-trip). Union type larger but visitor pattern simpler.
- **Breaking if changed:** If annotation nodes are later downgraded to metadata, all traversal code must change to check attributes instead of type discriminants.

### Design token variables ($--variable) are extracted as dual mechanisms: CSS custom properties in the style object AND optional TypeScript props on the component interface. This creates a bridge where tokens are both statically declared (from design system) and runtime-overridable (via React props). (2026-03-15)

- **Context:** Design system variables must serve as defaults from the design system while remaining customizable by consuming applications.
- **Why:** This pattern solves the tension between design consistency (baked-in tokens) and runtime flexibility (prop overrides). The typed interface makes it explicit which tokens can be overridden and what their types are, enforcing a contract between design system and consumers.
- **Rejected:** Alt 1: Emit only CSS variables (no props) → loses runtime flexibility. Alt 2: Emit only props (no CSS vars) → loses design system declarative power. Alt 3: Use context/theme provider → indirection overhead and runtime resolution cost.
- **Trade-offs:** Increases complexity in prop-extractor (tree walk + interface generation) and output size, but gains composable design tokens and type safety at the call site.
- **Breaking if changed:** Removing either side breaks the pattern: without CSS variables, tokens aren't declarative; without props, they can't be overridden.

### Icon-font nodes from the design system are mapped directly to Lucide React components by converting node names to PascalCase and collecting named imports per component file. (2026-03-15)

- **Context:** Design system defines icons as font nodes, but React consumers need tree-shakeable component imports without font file dependencies.
- **Why:** Lucide React provides SVG icons with zero font files, better tree-shaking, and standard React component semantics. Mapping design system icons to Lucide achieves icon portability without runtime font loading.
- **Rejected:** Alt 1: Embed icon font files → browser compatibility, loading overhead, no tree-shaking. Alt 2: Inline raw SVG → loses icon library ecosystem. Alt 3: Alternative icon library → requires separate remapping logic per library.
- **Trade-offs:** Couples codegen to Lucide's naming scheme and available icons. Icon name mismatches or Lucide API changes require regeneration or manual fixes.
- **Breaking if changed:** Removing Lucide dependency breaks all generated icon components. Changing icon library requires rewriting the icon-mapping logic and regenerating all components.

#### [Pattern] Pipeline is structured as five independent, single-purpose modules (css-extractor, prop-extractor, import-generator, jsx-serializer, react-generator), each with explicit input/output contracts. Each module focuses on one concern: CSS rules, TypeScript interfaces, import statements, JSX structure, or orchestration. (2026-03-15)

- **Problem solved:** Converting design AST to React code requires handling disparate concerns with different syntactic rules, dependency chains, and validation logic.
- **Why this works:** Single Responsibility Principle enables independent testing, clear separation of concerns, and easier extension for new node types or styling features. Problems in one concern don't cascade into others.
- **Trade-offs:** Five files instead of one, some information must be computed multiple times (e.g., collecting imports requires analyzing which nodes produce which imports). Clarity and maintainability win over file count.

### @design-system/codegen is intentionally zero-dependency on other workspace packages (@automaker/types, etc.). PenDocument types are self-contained; no imports from sibling packages. (2026-03-15)

- **Context:** Codegen is part of a monorepo but needs to be publishable, testable, and usable independently outside the monorepo.
- **Why:** Portability — the package can be published as a standalone npm module, used in non-monorepo projects, and avoids circular dependencies and version entanglement. Clean boundaries make dependency management simpler.
- **Rejected:** Alt: Import types from @automaker/types → tighter integration, reduced duplication, but loses independence and creates monorepo coupling.
- **Trade-offs:** Must define or re-export PenDocument types locally; some duplication. Gains complete portability and independence.
- **Breaking if changed:** Future features importing from other workspace packages violate this constraint and couple codegen to the monorepo, reducing portability.

### Tree-walking terminates at reusable frames with `continue` (no recursion). Each reusable frame becomes an independent, top-level export—no frame depends on importing another frame's output. (2026-03-15)

- **Context:** Handling nested reusable components during code generation
- **Why:** Enforces component isolation: each frame is self-contained and testable independently. Consumers choose which components to use without hidden cascading imports.
- **Rejected:** Could recursively process nested frames and compose them in parent output. Would create implicit component dependency chains and tighter coupling.
- **Trade-offs:** Simpler individual components vs. consumers managing their own imports for nested compositions
- **Breaking if changed:** If changed to allow nested composition in output, generators would need to emit import statements and handle circular dependency resolution

### Variables extracted as CSS custom properties in `:root {}` block. Fill/stroke values reference them as `var(--variable)` instead of hard-coded values. (2026-03-15)

- **Context:** Creating a runtime-themeable design system from static design tokens
- **Why:** Custom properties are native CSS, override without recompilation, and establish a clear theming API that browsers and CSS-in-JS libraries can hook into.
- **Rejected:** Hard-code all color/value literals into generated CSS. Separate variable system in JS (CSS-in-JS). Require pre-build time theme selection.
- **Trade-offs:** Slightly more complex CSS (requires variable declarations), but gains full runtime theming flexibility without tooling
- **Breaking if changed:** Removing the custom property layer eliminates runtime theming entirely—code must recompile for any design token change

#### [Pattern] BEM (Block Element Modifier) class naming applied consistently: `.block`, `.block__element`, `.block__element--modifier`. Scopes all child nodes under the frame's block class. (2026-03-15)

- **Problem solved:** Preventing CSS class name collisions across independently generated components
- **Why this works:** BEM guarantees collision-free naming without runtime JS scoping (CSS modules) or build-time transforms. Output is predictable and inspectable in DevTools.
- **Trade-offs:** More verbose class names in generated HTML, but no hidden dependencies and explicit visual scoping

### HTML and CSS emitted as separate files linked via `<link rel="stylesheet">` rather than inlined or CSS-in-JS. (2026-03-15)

- **Context:** Making generated code deployable, cacheable, and testable in isolation
- **Why:** HTTP caching can preserve `.css` across HTML updates. HTML files can be previewed in browsers without JS. Clear separation enables independent CI/CD of assets.
- **Rejected:** Inline all styles in `<style>` blocks (bloats HTML, defeats caching). CSS-in-JS (introduces JS runtime, complicates server-side rendering).
- **Trade-offs:** More files and explicit relative path dependencies, but independent caching and progressive enhancement
- **Breaking if changed:** If you remove the `<link>` and inline styles, you lose per-asset HTTP caching; if you change the relative path resolver, all links break

### Support both `extensions` and `groups` theme strategies for DTCG theming (dual-strategy extractor/exporters), not just one (2026-03-15)

- **Context:** Design systems use fundamentally incompatible theming patterns: extensions strategy uses :root variable overrides; groups strategy uses separate isolated theme objects
- **Why:** Design-system starter must serve diverse users; forcing one strategy excludes design systems built on the other pattern. Abstraction via `themeStrategy` option makes both first-class citizens.
- **Rejected:** Single strategy (simpler, fewer code paths) — would make starter unusable for half the design system market
- **Trade-offs:** Extractor and exporter code branches on strategy; more paths to maintain but unblocks support for major incompatible design patterns
- **Breaking if changed:** Removing either strategy breaks all design systems using it; design-system starter loses compatibility with entire category of user design systems

### Support both Tailwind v3 (JS config object with theme.extend) and v4 (@theme CSS block) with single unified exportToTailwind() API (2026-03-15)

- **Context:** Tailwind major version transition in progress; users upgrade at different speeds; design-system starter should not force version lock
- **Why:** Unified API abstracts away incompatible output formats (JS vs CSS); enables gradual user migration without branching; starter remains useful across transition period
- **Rejected:** v3-only (backwards compat but future-incompatible) or v4-only (forward-looking but breaks existing users)
- **Trade-offs:** Output code handles two completely different target formats internally; version inference via config flag. Non-trivial to maintain.
- **Breaking if changed:** Dropping v3 support breaks all users still on v3; dropping v4 support makes starter incompatible with Tailwind's future direction

### Implement composite value interfaces (shadow, gradient, typography, border, transition) as structured types instead of string or union encoding (2026-03-15)

- **Context:** DTCG spec defines multi-property composite values (e.g., shadow = {offsetX, offsetY, blur, spread, color}); must support both validation and export
- **Why:** Interfaces enable struct-level validation at compile time; TypeScript catches missing required fields in shadow/gradient definitions before export; export code can safely assume shape without runtime guards
- **Rejected:** String encoding (JSON stringify) — loses type safety and requires runtime parsing in exporters. Union types — harder to validate all required fields present.
- **Trade-offs:** Verbose type definitions but enables complete compile-time safety for complex composite values throughout export pipeline
- **Breaking if changed:** Switching to string encoding requires all export code to add runtime parsing/validation; type system can no longer guarantee valid composite shapes

### Implement strict spec compliance: all 14 W3C DTCG token types (color, dimension, duration, font-family, font-weight, font-size, line-height, stroke-width, border-radius, spacing, sizing, opacity, motion, transition, rotation, scale, skew, transform) as distinct types, not generic value (2026-03-15)

- **Context:** Building spec-compliant token system that exports to multiple platforms (CSS, Tailwind); need type safety to ensure exports can make assumptions about value shapes
- **Why:** Distinct types enable platform-specific export logic (e.g., Tailwind sizing exports infer section differently than colors); type system guarantees exporters won't receive invalid shapes; spec alignment ensures interoperability with other DTCG tooling
- **Rejected:** Generic value type (union of all shapes) — forces exporters to perform extensive runtime type checking and validation
- **Trade-offs:** Requires careful implementation of 14 type variants but enables strong compile-time validation throughout export pipeline
- **Breaking if changed:** Reverting to generic type loses compile-time guardrails; export code can no longer safely assume shape properties

#### [Gotcha] Extractor tightly coupled to .pen file format; .pen schema changes immediately break token extraction pipeline (2026-03-15)

- **Situation:** Extractor reads internal .pen design file format (variables with theme conditions) and converts to DTCG spec
- **Root cause:** Necessary tight coupling to enable single source of truth: design teams maintain variables in design tools, extractor bridges to open spec. Alternative (separate token definitions) causes divergence.
- **How to avoid:** Direct coupling to .pen makes starter more fragile but enables zero-copy token workflow from design tooling

### OKLCH color space chosen as primary representation throughout entire engine (scales, harmonies, semantic mapping, palette generation). All outputs emit oklch() CSS strings. (2026-03-15)

- **Context:** Color science engine must represent colors in a way that is perceptually uniform, maintains stable hue across lightness changes, and maps to modern CSS.
- **Why:** OKLCH is perceptually uniform (unlike RGB), hue is stable across lightness ranges (unlike HSL), and aligns with CSS Color Module Level 4 standard. Enables predictable scale generation and harmony calculations.
- **Rejected:** RGB (not perceptually uniform), HSL (hue drifts), HSV (non-uniform), Lab (no hue stability)
- **Trade-offs:** OKLCH chroma values are lower (0.18) than sRGB saturation 0-100 scale, requiring mental model adjustment. Enables portable, spec-compliant output.
- **Breaking if changed:** Switching color spaces requires rewriting scale generation, harmony algorithms, and contrast calculations. WCAG luminance calculation must convert to sRGB anyway, so change cascades throughout.

### Semantic scale generation: each role (primary, destructive, warning, success) has its own hue+chroma pair. Scales generated independently, then mapped to semantic tokens. Not: global scale mapped to all roles. (2026-03-15)

- **Context:** Design system needs semantic meaning (destructive = red-ish, success = green-ish) while maintaining harmonious palette and WCAG compliance across all roles.
- **Why:** Decouples color meaning from arbitrary role assignment. Allows each role to have perceptually appropriate hue (warm for destructive, cool for info) while maintaining consistent chroma and scale structure. Enables theme consistency.
- **Rejected:** Single global scale with role-based remapping (loses semantic color meaning, destructive could be blue). Hardcoded RGB values per role (not perceptually uniform, breaks on hue shift).
- **Trade-offs:** More configuration (DEFAULT_SEMANTIC_HUES lookup table) but enables semantic consistency. Slightly larger config surface but easier to maintain/extend.
- **Breaking if changed:** Removing role-specific hue/chroma breaks semantic color association. Changing to single scale means success could be red, destructive could be blue—confusing users.

#### [Pattern] Complementary accent generation uses hue rotation ~180° + chroma reduction, not pure hue inversion. Accent is derivation of primary, not independent color. (2026-03-15)

- **Problem solved:** Palette needs a complementary accent color that is visually balanced, not oversaturated or clashing with primary.
- **Why this works:** Pure 180° rotation creates oversaturation and visual clash. Reducing chroma on complementary maintains visual hierarchy and prevents accent from dominating primary. Treats accent as secondary role, derived from primary.
- **Trade-offs:** Accent is constrained by primary choice (less creative freedom) but design system coherence is maintained (easier to skin). Chroma reduction empirically improves designs.

### Zero runtime dependencies: pure TypeScript implementation. No color libraries (tinycolor, chroma.js). Emits oklch() strings for CSS consumption, no runtime color conversion. (2026-03-15)

- **Context:** Color package is embedded in design-system starter kit template. Must be portable, lightweight, and usable in any JavaScript environment.
- **Why:** Eliminates transitive dependencies and bundle bloat. Starter kit template should be minimal. CSS handles color natively (oklch() spec), no need for JS runtime conversion. Enables full control over implementation.
- **Rejected:** Using tinycolor/chroma.js (adds deps, increases template size, less control), shipping runtime converters (adds overhead)
- **Trade-offs:** Must implement some color science (chroma-js functionality) manually. Gained control and portability, lost convenience and community-maintained bugfixes.
- **Breaking if changed:** Adding any external dependency changes template surface. If adding deps later, must justify over custom implementation.

#### [Pattern] Preset palettes implemented as factory functions, not static objects: `PRESET_PALETTES.violet()` returns fresh palette, enabling immutability and customization. (2026-03-15)

- **Problem solved:** Design system provides 7 preset themes (violet, blue, teal, green, amber, rose, slate). Each preset is a complete palette with scales, harmonies, and tokens.
- **Why this works:** Factories prevent accidental mutations of shared preset object. Each palette invocation is independent. Enables future customization (e.g., `violet({ chromaBoost: 1.2 })`). Cleaner API than static objects.
- **Trade-offs:** Slight memory overhead (new object per call) but encapsulation and safety gained. Enables extension without breaking compatibility.

### Extension kits use clone-based distribution only, not scaffold-based. Scaffold route validates kitType against allowlist ['docs','portfolio','landing-page','general','ai-agent-app'], excluding 'extension'. (2026-03-15)

- **Context:** WXT browser extension projects require repo-level build tools, manifest configuration, and specific directory structures that cannot be safely scaffolded.
- **Why:** Cloning ensures the complete working toolchain is present without users installing/configuring WXT build tools separately. Repos ARE the distribution mechanism for extensions.
- **Rejected:** Scaffold approach: smaller downloads, independent version updates, but would force users to configure WXT bundler, manifests, and directory structure manually.
- **Trade-offs:** Clone: out-of-the-box functionality (easier UX), larger footprint. Scaffold: smaller, versioning flexibility, but requires user toolchain setup (barrier to entry).
- **Breaking if changed:** Switching to scaffold would require users to install WXT, configure manifests, and understand native browser extension project structure — the repo-as-distribution model would be lost.

#### [Pattern] Use @@PROJECT_NAME as template placeholders in scaffold kit documentation. Users find-and-replace during setup per README quickstart. Do NOT substitute with hardcoded names. (2026-03-15)

- **Problem solved:** ai-agent-app starter kit docs (building-flows.md, mcp.md, tracing-debugging.md, etc.) use @@PROJECT_NAME-tools, @@PROJECT_NAME-tracing, @@PROJECT_NAME-prompts to reference package names.
- **Why this works:** Same docs must work for any project name without maintaining separate copies. Placeholders + find-replace is simpler than generating docs per-project at scaffold time.
- **Trade-offs:** Placeholder approach: simple, works forever, but users must run find-replace step (minor friction). Generated approach: tailored per-project, but adds complexity and brittleness.

### Excluded vite.config.ts from tsconfig 'include' array and removed 'rootDir' compiler option to prevent TypeScript from attempting to type-check Vite's build config file (2026-03-15)

- **Context:** Vite config uses import.meta.glob (dynamic imports), which causes TypeScript compilation errors when included in type checking. The app itself only needs src/ type-checked.
- **Why:** Vite config is a build-time artifact, not part of the runtime application. Its compilation should be managed by Vite, not tsc. Removing rootDir forces TypeScript to infer root from include, avoiding scope confusion.
- **Rejected:** Include vite.config.ts and add ts-ignore comments (leaves tech debt); or use separate tsconfig for build (over-complicates packaging)
- **Trade-offs:** Easier: cleaner type checking, no build-time conflicts. Harder: developers must remember vite.config.ts is not tsc-checked (requires documentation)
- **Breaking if changed:** If someone adds business logic to vite.config.ts and expects TypeScript validation, it will silently fail to catch errors

#### [Gotcha] import.meta.glob requires explicit 'types': ['vite/client'] in tsconfig.json to resolve. Without it, TypeScript treats import.meta as 'any' and compilation succeeds but IDE/build tools don't understand the type signature. (2026-03-15)

- **Situation:** auto-discovery of \*.stories.tsx files via import.meta.glob succeeded at runtime but lacked proper type definitions, causing downstream issues in prop editor and story parsing.
- **Root cause:** import.meta is Vite-specific ambient global, not part of DOM or ES spec. Its types live in the @vite/client package and must be explicitly included.
- **How to avoid:** Easier: one-line tsconfig fix, then import.meta.glob is fully typed. Harder: obscure compiler option, not discoverable without Vite docs.

### Built playground as fully self-contained React + Vite package with zero external dependencies, rather than wrapping/embedding Ladle or Storybook (2026-03-15)

- **Context:** Needed a component workbench for the design-system starter that could ship as a template without adding production dependencies or long dependency chains.
- **Why:** Full control over UX, zero lock-in risk, minimal bundle, trivial to customize or strip out. Ladle/Storybook both add transitive dependencies and opinions that conflict with 'zero external deps' template goal.
- **Rejected:** Integrate Storybook (adds 50+ transitive deps, large bundle, opinionated plugin model); wrap Ladle (same dep bloat, less familiar to most devs)
- **Trade-offs:** Easier: lightweight, self-contained, teachable. Harder: must implement prop editor, viewport switching, theme toggle from scratch (but small surface area).
- **Breaking if changed:** If team wants features like a11y testing addons or snapshot testing, those need custom implementation or template modification. No existing plugin ecosystem.

### Docs route auto-generates from existing .stories.tsx files instead of maintaining separate documentation metadata (2026-03-15)

- **Context:** Two potential sources: (1) extract from stories, (2) maintain parallel docs metadata files
- **Why:** Stories are already authored with argTypes, parameters.docs.description, and control definitions. Reusing this source is DRY and keeps docs always in sync with actual component implementations
- **Rejected:** Separate JSDoc annotations or dedicated .docs.tsx files - would create dual authorship burden
- **Trade-offs:** Easier: single source of truth, lower maintenance. Harder: story format constrains what docs can express; story validation directly impacts docs completeness
- **Breaking if changed:** If docs source decoupled from stories, maintainers must now track two parallel systems; docs become stale

### Implemented inline markdown renderer (h1-h3, bold, italic, code, fenced blocks) instead of importing markdown library (2026-03-15)

- **Context:** Feature requires rendering story descriptions as markdown; options: (1) zero-dep inline parser, (2) remark/rehype/markdown-it libraries
- **Why:** Zero-dependency constraint (noted in acceptance criteria). Inline parser is sufficient for typical story descriptions and avoids bundle bloat
- **Rejected:** remark + rehype: adds ~50KB, overcomplicated for limited feature set
- **Trade-offs:** Easier: no external deps, lightweight. Harder: maintenance of custom parser; advanced markdown features (tables, strikethrough, etc.) unsupported. Risk: user writes unsupported markdown, silently renders incorrectly
- **Breaking if changed:** If zero-dep constraint removed, team might switch to real library and markdown format would need validation

#### [Gotcha] ControlType → TypeScript type string mapping creates temporal coupling between story argTypes and docs rendering (2026-03-15)

- **Situation:** Props table converts story control types (e.g., 'color', 'text', 'boolean') to human-readable type strings for documentation
- **Root cause:** Raw control types aren't meaningful to end users; mapping improves UX. Mapping logic lives in docs-generator.ts extractProps
- **How to avoid:** Easier: consistent, polished docs. Harder: if new control type added to a story, docs-generator.ts must be updated or type renders as unknown

### Used CSS custom properties (--pg-\* prefix) for theming instead of theme context provider or inline styles (2026-03-15)

- **Context:** DocsRoute components need theme awareness for live component examples. Options: (1) CSS vars scoped to DOM, (2) React context, (3) inline styles
- **Why:** CSS vars work without JS context, enable static generation potential, zero runtime overhead. Prefix (--pg-\*) prevents conflicts with app tokens. Works across shadow DOM boundaries
- **Rejected:** React context: requires provider wrap, adds JS bundle. Inline styles: non-composable, hard to override
- **Trade-offs:** Easier: decoupled from React state, works in iframes. Harder: browser CSP issues if vars not in stylesheet; variable scoping requires careful naming
- **Breaking if changed:** If theme switched to context, components must be wrapped in provider; if removed entirely, theme toggle in live examples doesn't work

#### [Gotcha] Playwright test required NODE_PATH environment variable and trial-and-error to locate @playwright/test package (2026-03-15)

- **Situation:** Running Playwright from CLI with external config file in monorepo caused module resolution failures
- **Root cause:** Monorepo hoisting makes @playwright/test location non-obvious; NODE_PATH is crude but necessary workaround when npm module resolution fails
- **How to avoid:** Easier: don't need to install Playwright locally. Harder: NODE_PATH is fragile, breaks if hoisting changes

#### [Pattern] Category-based sidebar grouping of components with per-component main panel (master-detail layout) (2026-03-15)

- **Problem solved:** DocsRoute must display many components from stories; options: (1) flat list, (2) category groups, (3) search-only
- **Why this works:** Categories already exist in story organization; grouping reduces cognitive load, helps users discover related components, mirrors playground structure
- **Trade-offs:** Easier: intuitive navigation, grouping enforces organization discipline. Harder: requires consistent category naming in stories; if categories inconsistent, sidebar becomes cluttered

### Self-hosted TinaCMS (no TinaCloud dependency). Content is git-backed, stored in repo, managed entirely by local tinacms dev server. (2026-03-15)

- **Context:** Integrating CMS into design-system starter kit without external service dependencies
- **Why:** Maximizes starter kit autonomy: git versioning automatic, offline-first development, no cloud account setup required. Better for templates/cloning.
- **Rejected:** TinaCloud would provide hosted admin UI + user management, but introduces vendor lock-in and deployment coupling
- **Trade-offs:** Developer manages TinaCMS server startup, but gains full git history and offline capability. Schema changes are version-controlled.
- **Breaking if changed:** Migrating to cloud CMS (Contentful, Sanity) would require major refactor of content storage and admin workflow

#### [Pattern] Admin route performs async health-check to TinaCMS endpoint; if running, redirects to admin; if offline, shows setup instructions (tinacms dev) instead of erroring (2026-03-15)

- **Problem solved:** TinaCMS backend is optional and may not be running; need graceful UX that doesn't break when optional service is absent
- **Why this works:** Solves the 'missing optional dependency' problem. Developers see helpful instructions instead of blank/error page. No blocking waits.
- **Trade-offs:** Adds async logic to page load and must handle health check timeout/failure cases; simpler UX for developers

#### [Pattern] Vite glob imports (`import.meta.glob`) used to statically discover content files at build time. Site.tsx iterates glob results to populate navbar and render pages. (2026-03-15)

- **Problem solved:** Need to automatically discover markdown files in content/ without hardcoded imports or runtime filesystem scanning
- **Why this works:** Build-time discovery via Vite static analysis; enables server-less rendering, static file hosting, predictable bundle. No glob() function needed at runtime.
- **Trade-offs:** Files must match glob pattern exactly or won't be discovered; adds build-time coupling to file structure

### Implemented custom inline frontmatter parser in React component instead of gray-matter dependency. Only parses YAML key:value and ignores complex structures. (2026-03-15)

- **Context:** Starter kit should minimize bundle size and dependencies. gray-matter adds ~15KB unpacked.
- **Why:** Starter kits are templates meant to be copied; keeping deps minimal reduces bloat. Simpler frontmatter parsing covers 80% of cases.
- **Rejected:** gray-matter is battle-tested but adds dependency and bundle size to a starter template that developers will ship directly
- **Trade-offs:** Limited YAML support (no nested objects, no lists) accepted in exchange for no external dependency
- **Breaking if changed:** Adding complex frontmatter (arrays, nested objects) breaks the parser; requires migrating to gray-matter or equivalent

### Hash-based routing (#/) instead of HTML5 history API (/#/playground, /#/site, /#/admin). Router implemented in main.tsx, no server-side routing. (2026-03-15)

- **Context:** Designing a preview/starter kit that should work as static files or on simple HTTP servers without routing config
- **Why:** Hash routing works everywhere: static hosting (S3, Netlify static), simple HTTP servers, file:// URLs. No server-side routing needed.
- **Rejected:** Browser history API (/playground, /site, /admin) requires server to handle 404s and route to index.html on every path
- **Trade-offs:** URLs contain hash (#/site not pretty), but maximum compatibility. Deep linking works but includes hash in bookmarks.
- **Breaking if changed:** Switching to server-side routing requires URL migration (links change), server config changes, and SEO implications

### Content stored in git repository alongside code (content/pages/index.md, etc). TinaCMS reads/writes directly to repo files. (2026-03-15)

- **Context:** Choosing content storage model for a git-versioned starter kit
- **Why:** Content versioning is automatic via git. Content deploys together with code. Offline dev works. Cloning the repo gives you everything.
- **Rejected:** Headless CMS (Contentful, Firebase) would separate content from repo, require API keys, and add deployment complexity
- **Trade-offs:** Merge conflicts possible if multiple editors touch same file; content structure changes are breaking changes (like code changes)
- **Breaking if changed:** Extracting content to external service requires migration tools, schema mapping, losing git history

### State-based responsiveness (resize listener + isMobile/sidebarOpen state) instead of CSS media queries for layout switching (2026-03-15)

- **Context:** Mobile drawer vs desktop fixed sidebar layout needs to respond to viewport changes
- **Why:** Consistency with existing codebase pattern (site.tsx). Provides single source of truth in React state for responsive behavior. Allows dynamic sidebar toggle state independent of viewport.
- **Rejected:** CSS media queries (@media) would be simpler and more standard, but breaks consistency with existing codebase patterns
- **Trade-offs:** Gains: consistent architecture, centralized state management, easier to test. Loses: CSS-only responsiveness, potential performance (resize listener overhead)
- **Breaking if changed:** Changing to CSS media queries breaks architectural consistency. SSR would need special handling for window.innerWidth in initial render (noted as safe for Vite SPA only).

#### [Pattern] Token-driven theming via --pg-\* CSS custom properties with inline styles, zero external UI library dependencies (2026-03-15)

- **Problem solved:** Need runtime-customizable theming for documentation site starter template
- **Why this works:** Matches existing site.tsx pattern. Avoids adding dependencies to starter template. CSS variables enable color customization without component re-architecture. Inline styles keep everything co-located.
- **Trade-offs:** Gains: no deps, runtime theming, consistent with existing code. Loses: CSS encapsulation, component-local style scoping. Makes inline styles verbose but predictable.

#### [Gotcha] Workspace placeholder packages (@@PROJECT_NAME-\*) cannot be listed in package.json dependencies. npm validates package names at install time and rejects placeholders. Must use tsconfig paths + references instead for TypeScript resolution. (2026-03-15)

- **Situation:** Initial approach put @@PROJECT_NAME-agents in server package.json dependencies, causing npm install failure.
- **Root cause:** npm performs semantic validation on dependency package names during install. Placeholders are invalid identifiers. TypeScript compilation and npm install operate on different validation layers.
- **How to avoid:** Complexity: requires dual resolution strategy (tsconfig + npm). Benefit: forces clean separation between generation-time placeholders and runtime dependencies.

#### [Gotcha] TypeScript project references require composite: true in referenced package's tsconfig. Without it, tsc errors with confusing 'must have setting composite' messages. This is a silent failure mode. (2026-03-15)

- **Situation:** Server package (server/tsconfig.json) references agents package (agents/tsconfig.json) via paths and project references.
- **Root cause:** TypeScript composite flag enables incremental compilation across project boundaries. Without it, tsc cannot track cross-project dependencies properly.
- **How to avoid:** Benefit: enables proper incremental builds and type resolution. Complexity: another tsconfig constraint to remember.

#### [Pattern] Include mock tool executors as first-class implementations in agentic code. Agent switches between mock and real MCP calls at execution boundary. Enables self-contained local testing without live external services. (2026-03-15)

- **Problem solved:** Design agent needs to call Pencil MCP tools (batch_design, set_variables, get_screenshot, snapshot_layout) but Pencil MCP server may not be running locally.
- **Why this works:** Improves developer experience and test isolation. Mocks are not test doubles but actual production code paths with switchable executors. Allows package to be useful standalone.
- **Trade-offs:** Benefit: self-contained agents, faster iteration, easier testing. Cost: duplicated tool executor logic (mock + real). Worth it for UX.

#### [Pattern] Monorepo internal packages use tsconfig paths mapping to dist/ directories instead of placeholder workspace dependencies in package.json. Server references agents via paths (../agents/dist/), not via @@PROJECT_NAME-agents dependency. (2026-03-15)

- **Problem solved:** Server and agents packages are both generated into a single starter kit. Need type resolution between them without npm understanding the relationship.
- **Why this works:** Maintains clean separation: package.json has only real npm packages (anthropic, express). tsconfig handles internal resolution. Follows established ai-agent-app pattern. Avoids npm validation of placeholder names.
- **Trade-offs:** Benefit: works with any package manager, no special monorepo tooling required. Cost: requires careful tsconfig paths setup and dist/ output routing.

#### [Pattern] Design prompt (design.md) is a first-class code artifact encoding operational knowledge: token definitions (8pt spacing), type hierarchies, MCP tool schemas, and agent workflow steps. Treated as infrastructure, not documentation. (2026-03-15)

- **Problem solved:** Agent needs shared understanding of design tokens, component patterns, and valid tool operations. This knowledge was encoded in the prompt itself.
- **Why this works:** Prompt as code enables version control, code review, and tight coupling between agent reasoning and operational constraints. Design tokens become testable specifications.
- **Trade-offs:** Benefit: maintainable design specifications, clear agent behavior boundaries. Cost: prompt becomes large (~1K tokens), requires careful organization.

### Agentic loop implements configurable maxIterations (default 10) with screenshot-driven verification: execute → capture screenshot → verify output → adjust → loop. Prevents infinite loops while enabling visual feedback cycles. (2026-03-15)

- **Context:** Design agent must apply multiple design operations iteratively, verifying each step produces expected visual output.
- **Why:** Bounded iteration prevents resource exhaustion. Screenshot capture creates concrete feedback for agent to reason about success/failure. Matches human design workflow (apply change, review, adjust).
- **Rejected:** Unbounded loops (risk of infinite execution), single-shot execution (brittle), external verification (harder to debug)
- **Trade-offs:** Benefit: self-correcting agent, visual grounding. Cost: extra screenshot calls per iteration, bounded by max iterations.
- **Breaking if changed:** If maxIterations is removed or set to 0, agent either runs indefinitely or doesn't execute at all.

#### [Pattern] Dynamic runtime imports of sibling packages using absolute paths instead of static npm dependencies with @PROJECT_NAME-\* placeholders (2026-03-15)

- **Problem solved:** Starter kit template projects need to support name substitution (@@PROJECT_NAME-\*), but npm can't resolve placeholders at install time
- **Why this works:** Allows sibling packages (pen, codegen) to be required without hardcoding @PROJECT_NAME names in package.json. Resolves at runtime when the template is instantiated with a real name
- **Trade-offs:** Easier: template works out-of-box without post-processing. Harder: runtime errors if sibling packages aren't built or paths shift; no static analysis

#### [Gotcha] System prompt (implement.md) must be loaded and embedded in messages.create() call; changes to prompt don't auto-reload in running processes (2026-03-15)

- **Situation:** Prompt file is external, separate from agent code. If prompt is updated after agent starts, changes won't be visible until restart
- **Root cause:** Prompt is read via fs.readFileSync() at call time. No hot-reload or caching. This is by design—prompts should be versioned and stable
- **How to avoid:** Easier: iterate on prompt without rebuilding. Harder: prompt must be present at runtime, not bundled in compiled js
