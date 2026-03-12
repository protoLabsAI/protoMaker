---
tags: [architecture]
summary: Critical architectural decisions with system-wide impact and breaking-change risk
relevantTo: [architecture]
importance: 0.9
relatedFiles: []
usageStats:
  loaded: 422
  referenced: 60
  successfulFeatures: 60
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
