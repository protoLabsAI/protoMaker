---
tags: [architecture]
summary: Critical architectural decisions with system-wide impact and breaking-change risk
relevantTo: [architecture]
importance: 0.9
relatedFiles: []
usageStats:
  loaded: 436
  referenced: 69
  successfulFeatures: 69
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

### Fire-and-forget async agent spawning via void IIFE pattern in event handler (2026-02-12)

- **Context:** Need to spawn Frank agent on critical health events without blocking event loop.
- **Why:** Event handlers must return quickly. `void (async () => {})()` allows non-blocking spawn with error isolation.
- **Breaking if changed:** If changed to await, event loop blocks during Frank initialization (5-10s), health checks queue up, metrics become stale, critical events can be missed.

### In-memory cooldown timestamp for Frank spawn throttling (not persistent state) (2026-02-12)

- **Context:** Prevent spawn storms when critical health persists for hours.
- **Why:** In-memory is sufficient because Frank is diagnostic-only; cooldown resets on server restart (when issues often resolve); no cross-session tracking needed.
- **Breaking if changed:** If cooldown is removed, rapid critical events spawn Frank every 5 minutes — spawn storms can worsen cascading failures.

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
- **Why:** Minimal tool sets reduce attack surface and token usage per agent type. Profiles serve as living documentation of which tools each role needs (with rationale per tool). Three profiles: `execution` (list_features, get_feature, update_feature, request_user_input + Claude Code built-ins), `orchestration` (all board CRUD + Discord + GitHub PR + claude-code delegation + Twitch + full Claude Code built-ins), `review` (read-only board/project + PR status + discord_read_channel + Read/Glob/Grep — no write tools).
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
