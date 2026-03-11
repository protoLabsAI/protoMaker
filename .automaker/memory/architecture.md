---
tags: [architecture]
summary: Critical architectural decisions with system-wide impact and breaking-change risk
relevantTo: [architecture]
importance: 0.9
relatedFiles: []
usageStats:
  loaded: 144
  referenced: 53
  successfulFeatures: 53
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

### Registry-first pattern for role prompts: templates store systemPrompt; router checks registry before hardcoded switch cases (2026-02-12)
- **Context:** Discord thread routing needed to map role names to system prompts without hardcoding logic in the router.
- **Why:** Decouples prompt management from router logic. Adding new roles only requires registering a template — no router changes needed.
- **Breaking if changed:** If a template is registered without systemPrompt, registry-first check fails and falls through to switch cases; if switch case also missing, role gets generic fallback prompt.

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