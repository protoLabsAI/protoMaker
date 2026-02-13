---
tags: [architecture]
summary: architecture implementation decisions and patterns
relevantTo: [architecture]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 9
  referenced: 5
  successfulFeatures: 5
---
# architecture

### Chose to version-control feature.json (immutable disaster recovery) while keeping agent-output.md and images ignored (mutable runtime artifacts) (2026-02-10)
- **Context:** Post-incident analysis: .automaker/features/ directory was completely wiped during 9+ agent crash. Feature.json contains permanent state (feature definitions), while agent-output.md and images are ephemeral logs/scratch space
- **Why:** Clear separation of concerns: track immutable schema/state (feature.json), ignore mutable runtime output. This creates a survivable backup mechanism without cluttering git history with logfiles
- **Rejected:** Alternative 1: Track everything (git bloat, merge conflicts from concurrent agent runs). Alternative 2: Track nothing (accepted disaster loss). Alternative 3: External backup system (adds complexity, duplication with git)
- **Trade-offs:** Accept occasional merge conflicts on feature.json (rare, when same feature modified simultaneously) in exchange for automatic disaster recovery via git history
- **Breaking if changed:** If feature.json changes from immutable schema to mutable runtime state, version control becomes a liability (constant merge conflicts, stale history)

### Used `**/` greedy wildcard in .gitignore pattern (`!.automaker/features/**/feature.json`) instead of single-level glob (`!.automaker/features/*/feature.json`) (2026-02-10)
- **Context:** Current feature storage is single-level (.automaker/features/{featureId}/feature.json), but future structure might nest deeper
- **Why:** Future-proofing: if feature structure evolves to multi-level nesting (e.g., .automaker/features/{category}/{featureId}/feature.json), single-level glob breaks silently. Greedy `**` handles both current and future shapes
- **Rejected:** Single-level `*/` pattern (less future-proof, requires .gitignore update if structure changes)
- **Trade-offs:** Greedy `**` is slightly more permissive (would match deeply nested files) but this is acceptable because feature.json is the only tracked file in that subtree. Added ~3 characters of complexity for zero fragility
- **Breaking if changed:** If someone enforces strict directory structure and later changes it, single-level glob breaks and features stop being tracked until .gitignore is fixed

### Placed CodeRabbit resolver as a separate service (CodeRabbitResolverService) rather than embedding thread resolution logic directly in git-workflow-service (2026-02-10)
- **Context:** Need to resolve bot review threads that block auto-merge without cluttering the main workflow orchestrator
- **Why:** Separation of concerns allows the resolver to be independently tested, reused elsewhere (other bot types, different workflows), and modified without touching workflow logic. Service pattern matches existing architecture (StatusService, etc.)
- **Rejected:** Inline resolver logic in git-workflow-service Step 5a - would increase workflow service complexity and make it harder to test thread resolution independently
- **Trade-offs:** Easier: testing, reusability, maintainability. Harder: one extra service to instantiate and import
- **Breaking if changed:** If CodeRabbitResolverService is removed, auto-merge workflow will block on bot review threads again - PR-to-merge gap reappears

### Using curated list of known bot accounts (coderabbitai, github-actions, dependabot, renovate) rather than detecting bots via `[bot]` suffix convention (2026-02-10)
- **Context:** Need to distinguish bot review threads from human review threads and only resolve bot threads
- **Why:** Not all bots follow the `[bot]` suffix convention. A whitelist gives precise control over which bots are trusted for auto-resolution. Easy to extend without code changes (just add to array). Prevents accidentally resolving threads from unknown/untrusted bots.
- **Rejected:** Check for `[bot]` suffix in login - brittle across different bot implementations. Detect via GitHub API bot flag - adds API call overhead and doesn't work for all bot types
- **Trade-offs:** Easier: explicit control, no false positives. Harder: must maintain whitelist as new bots are added
- **Breaking if changed:** If whitelist is cleared or CodeRabbitai removed, CodeRabbit threads won't resolve - auto-merge will block. Conversely, if random account names are added, they'll be auto-resolved

### Integration point placed in git-workflow-service Step 5a (after CI checks complete, immediately before merge attempt) (2026-02-10)
- **Context:** When should bot review threads be resolved relative to CI status checks?
- **Why:** Waiting for CI ensures the code is valid before attempting to modify thread state. Resolving immediately before merge minimizes race conditions where new threads could appear between resolution and merge. Only runs when `waitForCI=true`, respecting user preferences about CI validation.
- **Rejected:** Resolve threads immediately after PR creation - wastes API calls if PR will fail CI anyway. Resolve during CI polling - adds latency to CI wait loop
- **Trade-offs:** Easier: guarantees CI passed before touching anything. Harder: slightly longer time between PR creation and merge
- **Breaking if changed:** If moved earlier in workflow (before CI), could attempt merge even though code is broken. If moved later (after merge), no longer prevents merge blockers

### EM agent's handlePRApproved() checks gitWorkflow.autoMergePR setting before executing merge, rather than always merging on approval (2026-02-10)
- **Context:** Needed to enable auto-merge in EM agent without forcing it on all users. Settings system already existed for git workflow configuration.
- **Why:** Preserves backward compatibility - existing workflows with auto-merge disabled remain unchanged. Users explicitly opt-in to automation. Audit trail shows this was a deliberate constraint, not a limitation.
- **Rejected:** Alternative: Always merge on approval. This would break existing manual workflows and surprise users who aren't ready for full automation.
- **Trade-offs:** Easier: Users control automation level. Harder: Requires settings discovery/configuration before auto-merge activates.
- **Breaking if changed:** If autoMergePR check is removed, all PRs merge immediately on approval regardless of user intent, bypassing manual review gates some teams need.

#### [Pattern] Audit service is invoked for BOTH success and failure paths of merge decision, with different verdict values and structured metadata (2026-02-10)
- **Problem solved:** Need comprehensive audit trail for compliance, debugging, and merge decision analytics across projects.
- **Why this works:** Single audit point captures complete decision lifecycle. Success path logs mergeCommitSha and strategy. Failure path logs CI status and specific error reason. Both use 'pr_merge' type for queryable filtering.
- **Trade-offs:** Easier: Complete audit trail enables debugging and metrics. Harder: All merge paths must have proper error handling to log failures correctly.

#### [Gotcha] Feature transitions to 'done' status AFTER successful merge, via feature:pr-merged event emission. Status change happens in event subscriber, not in EM agent directly. (2026-02-10)
- **Situation:** EM agent shouldn't own feature lifecycle transitions - multiple services need to react to PR merge (UI notification, worktree cleanup, etc.). Event-driven pattern decouples concerns.
- **Root cause:** Event emission allows other services to subscribe without coupling EM agent to their implementations. Feature loader or feature service handles actual status transition.
- **How to avoid:** Easier: Clean separation of concerns, extensible. Harder: Status change is implicit/async, harder to trace in single call stack.

#### [Gotcha] AuditService and SettingsService added to EM agent constructor as NEW dependencies, requiring update to instantiation in index.ts (2026-02-10)
- **Situation:** Circular import risk: EM agent lives in authority-agents/, audit service in services/. Adding service imports during implementation could create circular dependencies.
- **Root cause:** Audit and settings are singletons instantiated early in index.ts, passed down. This pattern prevents circular imports - singletons instantiate before EM agent, then EM agent receives them as constructor arguments.
- **How to avoid:** Easier: Dependency injection pattern is explicit and testable. Harder: Every EM agent instantiation point must be updated with new parameters.

### Replaced git-based recovery (feature.json tracked in version control) with external backup system (atomic snapshots at `.automaker/.backups/features/{featureId}/`). Feature loader proactively checks external backups first via `readJsonWithRecovery()` before using in-memory state. (2026-02-10)
- **Context:** Feature data loss incidents revealed git-tracking was fundamentally incompatible with runtime file mutations. Worktree operations and concurrent agent execution were corrupting git state while modifying feature.json on disk.
- **Why:** Git is designed for developer-controlled changes with clear commit boundaries. Runtime systems that write continuously conflict with git's atomic commit model. External backups provide point-in-time recovery without requiring git's versioning overhead. Decoupling recovery from git allows worktree isolation and concurrent operations without corruption risk.
- **Rejected:** Keeping git-tracked feature.json with gitignore rules. Git operations would continue conflicting with server writes. Alternative of using git branches per feature was rejected as too heavyweight for runtime recovery.
- **Trade-offs:** External backups require rotation policy and disk management (not handled by git). Gain: git remains clean, server can write freely without coordination with vcs, multiple recovery strategies per feature (backups + in-memory + manual restoration). Loss: recovery requires external system, not git history.
- **Breaking if changed:** If external backup system is disabled or backups directory deleted, feature-loader.ts will fall back to disk reads without recovery, losing all data loss resilience. If `readJsonWithRecovery()` is removed and replaced with direct disk reads, recovery capability disappears silently.

#### [Pattern] Atomic writer pattern: buffered writes to temporary file, explicit backup to external location with rotation, then atomic rename to target. Feature loader pattern: try primary location, check external backup if missing, use recovery if both fail. (2026-02-10)
- **Problem solved:** Incident Feb 10: entire `.automaker/features/` directory recursively deleted during concurrent agent operations. Team realized single-location storage (feature.json in working directory) was insufficient for operational continuity.
- **Why this works:** Separating write operations (atomic, backup-aware) from read operations (fallback chain) provides multiple recovery vectors without coordinating state across systems. Backup rotation prevents unbounded disk growth. Backup-first read order ensures stale data recovery is automatic, not manual.
- **Trade-offs:** Added complexity: three code paths (primary, backup, recovery). Gain: system survives directory deletion, server crashes, concurrent corruption. Loss: requires monitoring backup disk usage, staleness detection between primary and backup.

### Exclude entire `.automaker/` directory from git operations using `git add -A -- ':!.automaker/'` in all git workflow services, rather than selectively gitignoring specific files. This makes the exclusion explicit in code and independent of .gitignore rules. (2026-02-10)
- **Context:** Multiple git operations (auto-mode-service.ts, git-workflow-service.ts, graphite-service.ts) all need to avoid staging .automaker runtime files. Initial approach was .gitignore rules, but that created ambiguity.
- **Why:** Code-level pathspec exclusions are explicit and documented. They survive .gitignore refactors. They're the source of truth for what gets staged. .gitignore is a safety net for accidental commits, not the primary mechanism.
- **Rejected:** Relying solely on .gitignore with selective includes/excludes. That approach is fragile to gitignore rule order and hard to debug.
- **Trade-offs:** Easier to audit (all git operations have same pattern) but requires discipline across three services. If forgotten in one place, files would be staged. Gain: clear intent, independent of .gitignore state.
- **Breaking if changed:** If the `-- ':!.automaker/'` pathspec is removed from any git operation, that operation will suddenly stage .automaker runtime files. If those files are different between commits (which they always are due to server writes), it will corrupt git history.

### Singleton pattern with direct class export for test isolation - export both `DataIntegrityWatchdogService` class and `getDataIntegrityWatchdogService()` getter (2026-02-10)
- **Context:** Need production singleton behavior but tests require isolated instances without shared state between test cases
- **Why:** Tests calling `new DataIntegrityWatchdogService(tmpDataDir)` get isolated instances; production uses singleton getter. Avoids mocking complexity and test pollution where one test's watchdog state leaks into another's verification checks
- **Rejected:** Pure singleton (only getter) - would force tests to mock/stub state or stub the singleton before import, adding test infrastructure. Pure class export - production gets multiple instances, defeating per-project state tracking and memory efficiency
- **Trade-offs:** Slightly larger API surface (two export paths) but eliminates test mocking boilerplate. Makes it explicit that class is safe to instantiate directly for testing purposes
- **Breaking if changed:** If code switches to only exporting the getter, test suites lose isolation and fail with state cross-contamination. If only the class is exported, production loses singleton guarantees - multiple auto-mode service instances could each spawn their own watchdog, causing duplicate monitoring and redundant Discord alerts

#### [Pattern] Per-project integrity state stored in atomic-write JSON file (`{DATA_DIR}/integrity-state.json`) with project path as key (2026-02-10)
- **Problem solved:** Need persistent breach state that survives server restarts and supports multiple concurrent projects without mutual interference
- **Why this works:** Atomic writes (write-to-temp, then rename) prevent corruption if server crashes mid-write. JSON file avoids database dependency, persists automatically, human-readable for debugging. Per-project map supports multi-workspace environments where one project's data loss shouldn't block another's auto-mode
- **Trade-offs:** Atomic writes add I/O but guarantee safety. Requires manual JSON parsing instead of ORM convenience. File-based state is simpler to inspect but slower than in-memory for high-frequency checks (mitigated by 5-minute check interval)

### 50% feature count drop threshold chosen as critical breach trigger (2026-02-10)
- **Context:** Need to detect catastrophic data loss (like Feb 10 incident with 141 features deleted) but avoid false positives from normal feature archiving or cleanup
- **Why:** 50% is high enough to ignore gradual cleanup (deleting old features one-by-one) but low enough to catch mass deletion. Feb 10 incident was total directory wipe (100% loss) - anything over 50% is clearly anomalous for a healthy project workflow
- **Rejected:** 100% threshold - would only catch complete project wiping, missing partial catastrophes. 10% threshold - would trigger on every cleanup cycle, creating alert fatigue. Configurable threshold - adds operational complexity and requires per-project tuning
- **Trade-offs:** Fixed threshold is simple and predictable but might miss edge cases (e.g., project intentionally downsizing from 100 to 60 features). Configurable version trades simplicity for flexibility
- **Breaking if changed:** If threshold is lowered to 20%, legitimate feature cleanup operations trigger false alarms and block auto-mode unnecessarily. If raised to 80%, only near-total data loss is detected, missing the 50-70% range where significant portions of work are lost but recovery might still be possible

### Grace period on feature count growth - update baseline when feature count increases to prevent false alarms on legitimate project growth (2026-02-10)
- **Context:** Watchdog should track anomalous *drops* in feature count, not fluctuations from normal development (features added, others completed/archived)
- **Why:** Updating baseline on growth normalizes the feature count for the current project state. Prevents accumulation of 'should have had 100' baseline when project legitimately scales to 150 features. A subsequent drop from 150 to 75 is still a breach (50% loss), correctly detected
- **Rejected:** Never updating baseline - drift detection becomes meaningless after first growth spike. Baseline stays at old project size forever, creating persistent false positive pressure. Updating on any delta - loses ability to detect drops because baseline chases the count down
- **Trade-offs:** Baseline tracking becomes stateful (need to remember previous count) but more realistic. Growth is treated as normalization rather than anomaly, keeping baseline current with project lifecycle
- **Breaking if changed:** If baseline is locked at initialization and never updated on growth, watchdog becomes permanently miscalibrated once a project scales. A project growing 10→100 features then dropping 100→50 won't be detected as a breach because baseline is still 10

### Force-start flag (`forceStart: true` in API request) provided as escape hatch to bypass integrity checks without state file editing (2026-02-10)
- **Context:** Legitimate scenarios exist where auto-mode should start despite integrity breach: intentional project reset, recovery after manual cleanup, testing scenarios
- **Why:** Users shouldn't need to manually edit `integrity-state.json` or kill the watchdog to run auto-mode during recovery. Flag is explicit in API surface, auditable in logs. Prevents worst case: user unable to run auto-mode, loses trust in system, switches off integrity checking permanently
- **Rejected:** No override - forces manual state file editing or watchdog refactoring during incidents. Automatic bypass on growth - ambiguous, hides problems from visibility. Environment variable flag - not request-scoped, affects all auto-mode starts globally
- **Trade-offs:** Override adds code path and requires discipline to use sparingly, but prevents operational dead-ends. Should be logged for audit trail
- **Breaking if changed:** If override is removed, watchdog becomes unmergable during recovery scenarios - user is stuck. If override is made automatic on growth (no flag needed), teams lose visibility into whether auto-mode is actually running against a broken state

#### [Pattern] Maintenance task integration pattern: registered task runs integrity check on *all* active projects every 5 minutes, emits events for UI awareness (2026-02-10)
- **Problem solved:** Watchdog needs periodic execution without adding complexity to auto-mode startup. Multiple projects running concurrently need checking
- **Why this works:** Maintenance task framework already exists and runs on fixed intervals. Checking all projects in one task prevents per-project scheduling complexity. Emitting events allows UI to show real-time breach status without polling, matching existing architecture (HealthMonitor pattern)
- **Trade-offs:** 5-minute interval adds latency for breach detection (worst case: feature deletion + 5 min wait to discover it) but reduces constant polling overhead. All-projects-per-task is simpler than N tasks but requires task to handle varying project counts dynamically

#### [Pattern] Optional callback injection for platform-level constraints. WorktreeLifecycleService accepts optional getRunningFeatures callback instead of hard-wiring AutoModeService dependency. (2026-02-10)
- **Problem solved:** Need to prevent worktree deletion when agents are running, but WorktreeLifecycleService lives in lower layer and AutoModeService is in higher layer (circular dependency risk).
- **Why this works:** Callback injection breaks circular dependencies while maintaining loose coupling. The service doesn't need to know about AutoModeService; it just needs a way to check running agents. This pattern allows the framework to wire dependencies at initialization without tight coupling.
- **Trade-offs:** Slightly more indirection (one extra function call) but eliminates circular dependency risk. Makes testing easier with mock callbacks. Requires careful documentation of callback contract.

### Pass AutoModeService through multiple route handler layers rather than making it globally accessible. (2026-02-10)
- **Context:** DELETE worktree route needs access to running agents list, which is managed by AutoModeService created at server startup.
- **Why:** Dependency injection through layers (Server → WorktreeRoutes → DeleteHandler) maintains clear data flow and makes dependencies explicit. Global service access would hide the dependency and make testing harder.
- **Rejected:** Global service registry or singleton pattern would reduce parameter passing but would hide dependencies and make the code flow less traceable.
- **Trade-offs:** More parameter passing through layers, but clear dependency chain. If you need to modify what data flows to DeleteHandler, it's obvious from the function signatures.
- **Breaking if changed:** If AutoModeService is not passed through, DeleteHandler won't have access to running agents and safety guard fails silently.

#### [Pattern] Scheduled maintenance tasks integrated into startup sequence with conditional registration based on service availability (2026-02-10)
- **Problem solved:** PR auto-merge poller needed to run periodically without blocking startup, but depends on FeatureLoader and SettingsService being initialized
- **Why this works:** Avoids circular dependencies and allows graceful degradation if services aren't ready. Task registration deferred until post-scheduler-init means services are guaranteed available. Conditional logging provides visibility into registration state without raising errors.
- **Trade-offs:** Silent failures easier to miss in production (mitigation: task metadata in scheduler tracks registration). Looser coupling vs harder debugging when task silently skipped.

### Auto-merge task polls all features with 'review' status rather than listening to status-change events (2026-02-10)
- **Context:** Decision between event-driven (react to status changes) vs polling (periodic evaluation)
- **Why:** Polling is more resilient to missed events, handles edge cases like manual setting changes, and integrates cleanly with existing SchedulerService cron pattern. All other maintenance tasks (stale-features, board-health) use same polling approach—consistency across codebase.
- **Rejected:** Event-driven approach would require feature status change event emission and subscription management; fragile if status changes happen outside normal paths
- **Trade-offs:** Polling adds latency (max 5 min delay) and redundant checks. Avoids event ordering problems and missed-event debugging nightmares. Better for non-critical background ops.
- **Breaking if changed:** Removing polling and switching to pure event-driven would require comprehensive event emission across all status-change paths; gaps would cause silent failures.

#### [Gotcha] MergeEligibilityService and GitHubMergeService already exist and handle complex edge cases (gh CLI availability, transient failures, branch conflicts) (2026-02-10)
- **Situation:** Discovered during integration that merge logic was not monolithic—already abstracted into separate, well-tested services
- **Root cause:** Service isolation meant reusing battle-tested code; no need to reimplement merge checking or GitHub API interaction logic
- **How to avoid:** Depends on external services being stable and well-maintained. Hidden complexity in MergeEligibilityService (review thread resolution, CI check interpretation) becomes task's dependency risk.

### Project-level auto-merge enablement flag (webhookSettings.autoMerge.enabled) controls task execution, not global server setting (2026-02-10)
- **Context:** Needed granular control: some projects want auto-merge, others don't
- **Why:** Per-project settings allow operators to enable feature gradually, test on pilot projects first, and respect team preferences. Backwards compatible (defaults to disabled). Integrates with existing settings infrastructure.
- **Rejected:** Global flag would force all projects into same behavior; would require feature flag or deprecation strategy to introduce
- **Trade-offs:** Requires loading settings for every project on every task run (minor overhead). Operators must explicitly enable per project (more config, less accidental merges).
- **Breaking if changed:** Removing per-project check and making it global would auto-merge PRs on all projects—risky if some teams opt out of automation.

#### [Pattern] Scheduled tasks emit scheduler:task_completed events for monitoring and UI visibility, not just logging (2026-02-10)
- **Problem solved:** Need to track task execution across multiple subsystems (logs, UI, metrics)
- **Why this works:** Event emission decouples task from consumers. UI can display task status in real-time, metrics systems can track success rates, alerts can trigger on failures. Follows Automaker event bus pattern.
- **Trade-offs:** Adds event emission boilerplate. Payload schema must be versioned if changed. Event listeners must handle missing events gracefully.

### Task logs every merge decision (skipped, merged, failed) for audit trail, even though most decisions are negative (2026-02-10)
- **Context:** Verbose logging required for debugging 'why wasn't this PR merged?' questions
- **Why:** Default to VERBOSE for maintenance tasks—ops need full visibility into automated system behavior. Single skipped PR with reason in logs beats having to trace through code to understand decision.
- **Rejected:** Sparse logging (only merges) would miss debugging opportunities. Silent skips are dangerous in automated systems.
- **Trade-offs:** Log volume increases. Grep-friendly if structured well. Helps catch bugs (e.g., 'all PRs skipped due to CI not passing')
- **Breaking if changed:** If logging is removed for performance, debugging 'PR X should have merged but didn't' becomes nearly impossible without tracing code.

### Transient error detection is stateless drift detection (WorldStateMonitor), not a separate retry service with persistent state machine (2026-02-10)
- **Context:** Auto-retry for blocked features needed to distinguish transient (network, rate limit) from permanent (merge conflict, auth) failures and trigger retries
- **Why:** Drift-based approach integrates cleanly with existing WorldStateMonitor tick-based architecture. Status changes trigger reconciliation atomically. Avoids separate state machine complexity and potential race conditions between services
- **Rejected:** Separate RetryService with exponential backoff state machine (like BullMQ). Would add service coupling and require managing retry queue state across restarts
- **Trade-offs:** Stateless drift detection is simpler but retries are coarse-grained (5-min window); can't do fine-grained exponential backoff. Trade precision for simplicity and integration
- **Breaking if changed:** If WorldStateMonitor tick interval becomes too long (>5min), retry window detection becomes unreliable. Minimum tick frequency of 30s is critical

### 5-minute cooldown is implemented as a timestamp field (lastFailureTime) checked against current time, not as iteration counters (2026-02-10)
- **Context:** Need a reliable way to enforce retry cooldown that survives service restarts and runs in a periodic monitor
- **Why:** Timestamp approach is idempotent across service restarts and tick cycles. Comparing `now - lastFailureTime > 300000ms` works regardless of how many monitor ticks have elapsed. Iteration counters would reset on service restart
- **Rejected:** Tick counter approach: increment counter each monitor cycle, retry when counter > N. Breaks across service restarts because counter resets to 0
- **Trade-offs:** Timestamp approach requires wall-clock dependency and timezone handling, but is far more reliable. No accumulation of state across service boundaries
- **Breaking if changed:** If lastFailureTime is deleted or not set when feature fails, cooldown logic breaks. Auto-mode-service MUST set this field when marking features as 'blocked'

#### [Gotcha] Transient error list is hard-coded pattern matching on error strings, not typed error codes (2026-02-10)
- **Situation:** Needed to distinguish 'timeout' from 'merge conflict' in error field
- **Root cause:** Error field is unstructured string. GitHub API and Node.js throw errors with inconsistent formats (message strings vary, no error codes). Pattern matching is most portable solution across error sources
- **How to avoid:** Pattern matching is fragile (string changes break detection), but doesn't require central error schema. Future work could introduce error code wrapper if errors become more complex

### Opus escalation happens at retry count ≥ 2 (after 2nd failure), not at 3 (after 3rd failure) (2026-02-10)
- **Context:** Features can be retried up to 3 times total. Need to escalate to stronger model before last retry
- **Why:** Escalate BEFORE the final chance, not after exhausting all retries. Gives opus one opportunity to solve persistent issues. Escalating at count=3 would only apply to a feature that already failed twice—wasting the escalation
- **Rejected:** Escalate at count=3: would mean opus only runs on the last retry if the feature fails twice. Leaves haiku trying problems twice before escalating
- **Trade-offs:** Early escalation uses more opus quota but increases success rate. Late escalation (at count=3) saves quota but feature likely already dead after 2 failures
- **Breaking if changed:** If max retry limit is reduced to 2, escalation at count≥2 means every feature gets escalated—breaks the 'escalate before last chance' guarantee. Logic needs: escalate at count >= (MAX_RETRIES - 1)

#### [Pattern] Drift-based remediation: WorldStateMonitor detects drift (blocked + transient error + cooldown passed), ReconciliationService executes correction (reset to backlog) (2026-02-10)
- **Problem solved:** Auto-retry logic needed to fit into existing anomaly detection and correction framework
- **Why this works:** Separates detection (read-only, observational) from correction (state-mutating). WorldStateMonitor is a detective; ReconciliationService is the executor. Allows other services to observe the same drifts without executing, and allows human review of detected drifts
- **Trade-offs:** Two-service pattern adds indirection but enables observability and auditability. Drift events can be logged, monitored, and audited separately from execution

#### [Pattern] Use `git merge-base --is-ancestor` rather than branch comparison or reflog inspection to verify branch is fully merged (2026-02-10)
- **Problem solved:** Determining if a branch is safe to delete by checking if all commits are included in main/master
- **Why this works:** `merge-base --is-ancestor` is a git porcelain command designed exactly for this query. It's atomic, handles rebased histories correctly, and returns exit code 0/1 (easy to test). Alternatives like parsing `git log` are fragile to different merge strategies
- **Trade-offs:** Requires shell execution (subprocess overhead) but provides definitive answer vs. heuristic approaches. Cost is one subprocess call per branch at cleanup time (acceptable)

### Emit separate events (`maintenance:worktree_cleaned`, `maintenance:branch_cleaned`) for each cleanup action PLUS aggregate task completion event with counts and failure reasons (2026-02-10)
- **Context:** Providing audit trail and UI feedback for autonomous cleanup operations that run on a schedule without user request
- **Why:** Dual-event approach enables two use cases: (1) real-time UI updates via individual events as cleanups happen, (2) health monitoring via completion event with aggregate counts. Single event type would force choice between granularity and completeness
- **Rejected:** Single completion event (misses real-time feedback), individual events only (no aggregate metrics for monitoring), logging to file (loses async event-driven architecture)
- **Trade-offs:** More event types to define and handle, but separation of concerns. Individual events fire immediately, completion event fires at end, both can be monitored independently
- **Breaking if changed:** Removing individual events loses real-time UI feedback. Removing completion event loses health/monitoring signal. Both matter for different consumers

### Setter injection (setAutoModeService) instead of constructor injection to avoid circular dependencies during service initialization (2026-02-10)
- **Context:** PRFeedbackService needs to call AutoModeService.executeFeature() to restart agents, but both services are initialized at server startup and wired together after construction
- **Why:** Constructor injection would create circular dependency: PRFeedbackService → AutoModeService, but server.ts also needs to wire PRFeedbackService to AutoModeService events. Setter injection decouples construction from wiring, allowing both services to exist independently then be linked
- **Rejected:** Constructor injection (would require passing AutoModeService to PRFeedbackService constructor at initialization time, creating immediate circular dependency)
- **Trade-offs:** Easier: avoids circular dependency and allows flexible wiring. Harder: runtime dependency is optional rather than guaranteed at compile time; code must handle null/undefined AutoModeService
- **Breaking if changed:** If setAutoModeService() is never called, processReviewStatus() falls back to only emitting events instead of directly restarting agents. Loss of direct automation but service still functions

#### [Pattern] Dual event emission strategy: Service both emits events AND directly calls AutoModeService for same action (2026-02-10)
- **Problem solved:** PRFeedbackService needs to restart agents when PR feedback arrives, but also needs to notify EM agent and other observers
- **Why this works:** Provides two independent paths to automation (direct call + event). If AutoModeService fails or isn't available, event-based fallback ensures EM agent can still handle escalation manually. If events fail or no listeners, direct call already restarted the agent
- **Trade-offs:** Easier: highly resilient, redundant automation ensures something happens. Harder: duplicate work (agent may get restarted twice if both paths succeed), must track iteration count carefully to prevent loops

### Continuation prompt injection via executeFeature options rather than creating new agent from scratch (2026-02-10)
- **Context:** Agent needs to receive PR feedback without restarting from default system prompt. Must maintain context of original task and PR
- **Why:** AutoModeService.executeFeature() already supports continuationPrompt in options parameter, which appends feedback to agent's existing context rather than replacing the system prompt. Preserves feature state, branch context, and worktree continuity. Simpler than creating new agent
- **Rejected:** Creating new dev agent with PR feedback as system prompt (would lose original task context, require managing new agent lifecycle, force branch re-checkout)
- **Trade-offs:** Easier: reuses existing agent restart infrastructure, preserves worktree and branch state. Harder: must ensure feedback prompt is formatted correctly to integrate naturally with ongoing context
- **Breaking if changed:** If continuationPrompt parameter is removed from executeFeature options, feature cannot inject feedback into running agent - would need to refactor to pass feedback some other way (environment variables, feature metadata, etc)

#### [Pattern] Feature status transition to 'backlog' when restarting agent via PRFeedbackService, allowing auto-loop to pick it up naturally (2026-02-10)
- **Problem solved:** After restarting agent, feature must be re-executed by auto-loop. If status remains unchanged, auto-loop won't process it again
- **Why this works:** Automaker's auto-loop processes features with status 'backlog' in round-robin fashion. By setting status to 'backlog' before calling executeFeature(), the feature gets picked up through normal auto-loop machinery rather than requiring special queue handling
- **Trade-offs:** Easier: one code path for both initial execution and restart. Harder: status change is asynchronous and must complete before auto-loop processes feature, otherwise duplicate executions possible

#### [Pattern] Event emission timing: issues must be emitted BEFORE auto-remediation to allow subscribers to react to raw detected state (2026-02-12)
- **Problem solved:** HealthMonitorService detects issues, initiates auto-remediation, and notifies subscribers. If emission happened after remediation, subscribers would see already-remediated state.
- **Why this works:** Subscribers (like AvaGatewayService) need to know about issues BEFORE remediation attempts so they can post alerts, create tasks, or trigger notifications based on the original problem state, not the post-remediation state
- **Trade-offs:** Slightly more complex control flow (emit, then remediate) vs simpler sequential flow. Worth it because subscribers need unmodified issue data.

### Payload structure includes both type-specific fields (featureId for stuck_feature) and generic fields (type, severity, message, metrics) in a flat object (2026-02-12)
- **Context:** Need to emit events for different issue types (stuck_feature, high_memory_usage, etc.) each with their own context, but also need a consistent severity/message layer for subscribers
- **Why:** Flat structure with optional type-specific fields allows subscribers to handle issues generically (check severity, post alert) OR type-specifically (extract featureId for stuck_feature handler) from the same event
- **Rejected:** Nested structure like {generic: {severity, message}, typeSpecific: {featureId}} would segregate concerns but make subscriber code more verbose
- **Trade-offs:** Flat structure is easier for subscribers but requires discipline not to duplicate generic fields. Nested would be more explicit but harder to consume.
- **Breaking if changed:** If the generic layer (type, severity, message) was removed, subscribers would lose the ability to handle unknown issue types generically

#### [Gotcha] HealthMonitorService had all detection infrastructure working correctly but the event emission was missing - a gap in an otherwise complete pipeline (2026-02-12)
- **Situation:** Issues were detected, metrics calculated, auto-remediation wired - but AvaGatewayService had a handleHealthIssue subscriber waiting for events that were never emitted
- **Root cause:** This highlights the risk of plumbing work: infrastructure can be 90% complete (detection, metrics, remediation) but the final 10% (notifications) gets skipped. The service worked in isolation, so no tests caught the missing piece.
- **How to avoid:** Well-factored code (separate services) means one service can be mostly working while leaving its outbound notifications incomplete. Would've been caught faster by integration tests.

#### [Pattern] Setter injection pattern for ordered service dependencies: Instead of reordering constructor calls or passing services through multiple initialization layers, use a setter method (setDiscordBot) to wire dependencies after both services are instantiated. (2026-02-12)
- **Problem solved:** AvaGatewayService needed DiscordBotService, but DiscordBotService is created after AvaGatewayService in the initialization sequence due to other dependencies being resolved first.
- **Why this works:** Avoids circular dependency issues and allows services to initialize independently without forcing specific construction order. Setter is called after discordBotService.initialize() completes, ensuring the dependency is fully ready before use.
- **Trade-offs:** Cleaner initialization order (no cascade restructuring) but slightly delayed wiring (Discord posting won't work until setDiscordBot is called). Mitigated by keeping the setter call immediately after initialization.

#### [Gotcha] start() method must be explicitly called after initialize() to activate event listening. Initialization alone does not begin processing events. (2026-02-12)
- **Situation:** AvaGatewayService.initialize() was being called but the service was never actually listening to events. The health monitor and event routing had no effect because the internal event listeners were never registered.
- **Root cause:** Separation of concerns: initialize() sets up state and configuration, start() activates the operational loop. This pattern allows for initialization without side effects, and delayed startup if needed.
- **How to avoid:** Requires explicit two-step lifecycle (initialize then start) but prevents accidental side effects during setup and allows deferring activation if needed.

### Use type-only imports (type { DiscordBotService }) instead of regular imports to break circular dependency chains. (2026-02-12)
- **Context:** DiscordBotService is created after AvaGatewayService in the initialization sequence. Using a regular import could create a module-level circular reference if both services are instantiated in the same file.
- **Why:** Type-only imports are stripped at runtime, so they don't create actual module dependencies. This allows AvaGatewayService to reference the type for setter parameter typing without creating a circular module dependency.
- **Rejected:** Alternative of importing the concrete DiscordBotService class was rejected because it could force module evaluation order issues in the index.ts file where both services are instantiated.
- **Trade-offs:** Type safety is maintained (setter parameter is typed) but the actual DiscordBotService instance must be passed at runtime via setter, not constructor. This is a worthwhile tradeoff.
- **Breaking if changed:** If the type import is converted to a regular import without adding DiscordBotService to the constructor, the dependency won't be injected and all Discord operations will fail silently.

#### [Gotcha] Event payload shape mismatches between emitters and handlers are silent failures - TypeScript doesn't catch destructuring of wrong object shapes at compile time (2026-02-12)
- **Situation:** discord-bot-service.ts was emitting {agentId, messages: [{content}]} but agent-discord-router.ts destructured {routedToAgent, content}. Build passed but routing would fail at runtime.
- **Root cause:** TypeScript's structural typing allows assignment of incompatible shapes if they share some properties. Destructuring doesn't validate all required fields exist - it just extracts what's there.
- **How to avoid:** Type safety on the receiver side (handler) doesn't prevent wrong shapes being emitted. Need explicit type guards or compile-time event type registration to catch this.

### Removed projectPath from internal event payload even though it's available - kept payload minimal to what handlers actually need (2026-02-12)
- **Context:** discord-bot-service emits event, agent-discord-router receives it. projectPath was in original payload but handler never uses it.
- **Why:** Minimal contracts prevent accidental coupling. Handler can't misuse projectPath if it's not there. Reduces payload size for internal events.
- **Rejected:** Could have kept projectPath for 'future-proofing', but that's speculative coupling
- **Trade-offs:** If handler later needed projectPath, would have to modify both emitter and handler. But that would indicate design change (handler shouldn't depend on project context anyway).
- **Breaking if changed:** Any code subscribing to this event expecting projectPath breaks. Scope is internal service layer so risk is low.

### Fire-and-forget async agent spawning via void IIFE pattern in event handler (2026-02-12)
- **Context:** Need to spawn Frank agent on critical health events without blocking event loop or waiting for completion
- **Why:** Event handlers must return quickly. Wrapping async operation in void (async () => {})() allows non-blocking spawn with error isolation. Awaiting would block event emission and delay other subscribers.
- **Rejected:** Alternative: Store spawn promise in Set for tracking. Rejected because: (1) critical health triage is best-effort, not mission-critical to track, (2) tracking Set would require cleanup logic on agent completion, (3) event loop must stay responsive to continuous health checks
- **Trade-offs:** Gained: non-blocking, loose coupling. Lost: observability of Frank's completion status (mitigated by Frank's own Discord posting)
- **Breaking if changed:** If changed to await: event loop blocks during Frank initialization (5-10s), health checks queue up, metrics become stale, could miss subsequent critical events

### In-memory cooldown timestamp instead of persistent state for Frank spawn throttling (2026-02-12)
- **Context:** Prevent spawn storms when critical health persists (e.g., memory leak lasting hours). Need 10-minute window between spawns.
- **Why:** In-memory is sufficient because: (1) Frank is diagnostic-only, not addressing root cause, (2) repeated spawning in same session indicates operator should manual intervene, (3) resets on server restart (when issues often resolve), (4) no need for cross-session state tracking
- **Rejected:** Alternatives: (1) Persist to database - adds latency to event handler, overkill for diagnostic throttling, (2) Use HeadsdownService world-state - couples health monitor to service layer, breaks separation of concerns, (3) Track in feature database - Frank isn't tracked as a feature, would be hacky
- **Trade-offs:** Gained: zero latency, simple implementation. Lost: cooldown resets on restart (acceptable tradeoff - restart usually resolves issues)
- **Breaking if changed:** If removed: rapid critical events spawn Frank every 5 minutes (health check interval). With 3+ concurrent agents causing crashes, Frank spawn storms could worsen cascading failures

#### [Gotcha] AgentFactoryService.createFromTemplate() with tool override doesn't auto-include base template tools - explicit enumeration required (2026-02-12)
- **Situation:** Initial attempt passed `tools: [...]` expecting merge with template defaults. Agent had zero tools.
- **Root cause:** Template tool list is a suggestion/default, not a contract. Service treats explicit `tools` override as 'use exactly these, ignore template defaults'. This follows principle of least privilege for critical agent spawning.
- **How to avoid:** Gained: explicit, secure, auditable. Lost: brevity - must list all tools even if duplicating template list

#### [Pattern] Event payload type assertion + property access for health status/issues extraction (2026-02-12)
- **Problem solved:** health:check-completed event carries typed health data. Need to extract status and issue details for decision logic.
- **Why this works:** Event emitter in codebase uses untyped payload (`any`). Type assertion documents expected shape and enables IDE autocomplete for next developers. Property access pattern (e.g., `result.status === 'critical'`) is clearer than destructuring when only checking one property.
- **Trade-offs:** Gained: type safety without refactoring infra. Lost: compile-time checks (runtime assertion only)

#### [Gotcha] Diagnostic prompt must include full issue details AND metrics as JSON for Frank to have actionable context (2026-02-12)
- **Situation:** Initial version sent only issue summary. Frank had no concrete metrics to diagnose (CPU/memory/stuck features).
- **Root cause:** Frank is an LLM-based agent without live system access in prompt context. Detailed metrics in prompt are the only way Frank understands 'critical'. Issue list alone is ambiguous (critical in what metric?).
- **How to avoid:** Gained: faster triage, Frank focuses on diagnosis not data gathering. Lost: metric freshness (prompt snapshot, not live)

#### [Pattern] Cooldown window calculation with min-remaining check to inform operator (2026-02-12)
- **Problem solved:** Multiple critical events within 10-minute window. Need to communicate when Frank is throttled.
- **Why this works:** Cooldown prevents spawn storms but creates observability gap (operator doesn't know Frank is waiting). Calculating `remainingMinutes` and logging it means: (1) operators can see throttling in logs, (2) if critical events persist, operator knows roughly when Frank will re-spawn, (3) makes cooldown duration tunable (easy to adjust 10-minute window)
- **Trade-offs:** Gained: observability, operator can make manual intervention decisions. Lost: slightly noisier logs (one message per throttled critical event)

#### [Gotcha] Service initialization order in index.ts is a hard ordering constraint - services must initialize AFTER their dependencies are instantiated, not before. (2026-02-12)
- **Situation:** EventHookService was initialized before DiscordBotService was created, causing 'used before declaration' errors when trying to pass discordBotService to initialize().
- **Root cause:** JavaScript evaluation is sequential. Passing an undefined reference fails immediately. The dependency graph is implicit in the initialization sequence.
- **How to avoid:** Explicit ordering is brittle (moving one line breaks things) but makes dependencies visible in the code. Complex initialization DAG becomes hard to reason about.

#### [Pattern] Stub service replacement pattern: Replace MCP stub implementations with real service instances by (1) accepting real service as dependency, (2) checking if available before calling, (3) graceful fallback if unavailable. (2026-02-12)
- **Problem solved:** EventHookService was calling a stub DiscordService that never actually sent messages. AvaGateway had the same problem. Both needed to use the real DiscordBotService.
- **Why this works:** Allows gradual migration from stubs to real implementations. Services remain functional even if integration is missing (logs warning instead of crashing). Matches the MCP pattern where services start without external integrations.
- **Trade-offs:** Optional dependencies add conditional logic but increase resilience. The codebase now has multiple stub→real patterns (AvaGateway, EventHookService, likely others) suggesting this should become a formalized utility.

### Registry-first pattern for role prompts: templates store systemPrompt fields directly; router checks registry before falling back to hardcoded switch cases (2026-02-12)
- **Context:** Discord thread routing needed to map role names (chief-of-staff, gtm-specialist) to their system prompts without hardcoding logic in the router
- **Why:** Decouples prompt management from router logic. Adding new roles only requires registering a template with systemPrompt—no router changes needed. Makes the system extensible without modifying core routing code
- **Rejected:** Adding switch cases to agent-discord-router.ts for each role. Would couple prompt definitions to router implementation and require router changes for every new role
- **Trade-offs:** Templates become source of truth for prompts (easier maintenance, but requires all roles to be registered). Router code stays lean (easier to reason about, but depends on registry being populated correctly)
- **Breaking if changed:** If a template is registered without systemPrompt, the registry-first check fails and falls through to switch cases. If switch case is also missing, the role gets a generic fallback prompt instead of its intended one

#### [Gotcha] Inline systemPrompt strings in template definitions can create circular dependencies if prompts import from other modules. Solution: keep prompts as inline strings or carefully manage import order (2026-02-12)
- **Situation:** Could have imported gtm-specialist-prompt from libs/prompts, but needed to embed it directly to avoid circular dependency between template registration and prompt modules
- **Root cause:** Built-in templates are registered at server startup. If template definitions import from modules that import from server code, circular dependency breaks initialization. Inline strings are safe
- **How to avoid:** Inline strings are slightly harder to maintain (duplication risk) but guarantee no circular imports. Importing would be cleaner but risky during startup

#### [Pattern] Event-driven notification dispatch through a centralized AvaGatewayService switch-case handler, with rate limiting enforced per notification type rather than globally (2026-02-12)
- **Problem solved:** Needed real-time Discord notifications for critical events without flooding the channel with spam during cascading failures
- **Why this works:** Per-type rate limiting allows different event classes to flow independently. A `feature_error` spam doesn't block `feature_waiting_approval` notifications. Switch-case in event handler is cleaner than separate listener registrations and avoids closure capture issues
- **Trade-offs:** Per-type tracking uses more memory (one Map entry per notification type) but gives fine-grained control. Alternative: single throttle queue would be simpler but less flexible if future needs require different cadences for different event types

#### [Gotcha] Notification filtering by type (feature_error, feature_waiting_approval only) is a soft contract. AvaGatewayService doesn't validate that incoming notification events match a strict schema—it just checks string equality on `type` field (2026-02-12)
- **Situation:** During event emission in other services, typos in notification type or unexpected new types will silently drop notifications
- **Root cause:** The current codebase has no central notification type registry. Each service emits with a string type. Hardcoding the two types in `shouldPostNotification` keeps the feature scoped to requirements but creates a hidden dependency
- **How to avoid:** Simpler implementation now, but debugging is hard when a new service starts emitting `feature_error_v2` and notifications don't fire. Prevention: document the two valid types in MEMORY.md or create a light constants file

#### [Pattern] Notification severity mapping (feature_error → 🔴 critical, feature_waiting_approval → 🟠 high) is hardcoded in postToDiscordWithRateLimit, not externalized to a severity config or enum (2026-02-12)
- **Problem solved:** Different notification types signal different urgency levels to the on-call engineer reading #infra
- **Why this works:** Emoji are visual and immediate. Hardcoding keeps the feature self-contained and avoids config file sprawl for a simple mapping
- **Trade-offs:** Hardcoded emojis are simple and visible. But if severity rules change (e.g., feature_error should be 🟡 instead), code change is required. No runtime configuration. If we later add 10 more notification types, this function grows unmaintainable

### Custom Model fallback option is implemented as a special CommandItem that opens PhaseModelSelector modal instead of selecting an agent (2026-02-12)
- **Context:** Needed a way to let users provide custom model parameters when no agent template matched their needs
- **Why:** PhaseModelSelector already exists and handles model configuration complexity. Reusing it avoids duplication and keeps model selection logic centralized. Placing it at the bottom of the agent list preserves the agent-first workflow while providing an escape hatch.
- **Rejected:** Could have embedded model selector directly in AgentSelector or added it as a separate UI element, but that duplicates model logic and requires prop drilling
- **Trade-offs:** Easier: no duplicate model selection code, users see agents first. Harder: requires parent component to handle both agent and custom model callbacks, two different selection paths.
- **Breaking if changed:** If PhaseModelSelector is removed or its props change (customModel, onCustomModelSelect), the Custom Model fallback breaks. Parent components must handle both onAgentSelect and onCustomModelSelect callbacks.

#### [Pattern] Template resolution applied at service layer (AgentService.sendMessage), not at route/endpoint layer (2026-02-12)
- **Problem solved:** Adding role parameter support required deciding where template lookups and system prompt merging happens
- **Why this works:** Service layer placement allows both template-based and non-template agent execution to coexist. Template becomes optional enhancement, not mandatory middleware. Keeps route handlers thin and focused on request/response mapping. Single source of truth for template resolution logic.
- **Trade-offs:** Easier: maintaining template logic in one place; adding role support to other endpoints; testing. Harder: slightly more complex AgentService constructor with additional dependency injection

#### [Gotcha] AgentConfig.role already existed in UI types before implementation; feature only needed plumbing to surface it (2026-02-12)
- **Situation:** When updating agent-view.tsx, agentConfig.role was already available as a typed field
- **Root cause:** Indicates the UI data model was designed with role support in mind before the server-side endpoint existed. Good separation: UI type definitions can evolve independently from backend implementation.
- **How to avoid:** Easier: no type definition refactoring needed. Harder: could mask that feature discovery and requirements-gathering weren't tightly coupled

#### [Pattern] Optional parameters propagate through full stack (UI → Hook → HTTP → Route → Service) without transformation (2026-02-12)
- **Problem solved:** role parameter flowed from agent-view.tsx → useElectronAgent → HTTP client → POST /api/agent/send → route handler → AgentService.sendMessage()
- **Why this works:** Each layer is a simple pass-through for optional parameters, avoiding parameter transformation logic. Keeps concerns separated: each layer handles its own responsibility (UI concern, HTTP concern, service concern), not intermediate mapping.
- **Trade-offs:** Easier: simple, readable flow; each layer has one responsibility. Harder: no intermediate validation; errors bubble up from service, not caught early at HTTP boundary

#### [Pattern] State is lifted from InputControls → AgentInputArea → AgentView. AgentView owns selectedAgent and passes it down via callback pattern (onAgentSelect), creating a clear unidirectional data flow. (2026-02-12)
- **Problem solved:** Multiple nested components (InputControls, AgentModelSelector, AgentSelector) need access to agent selection state and must coordinate model auto-setting.
- **Why this works:** Lifting state to AgentView (parent of AgentInputArea) creates a single source of truth and makes the dependency graph explicit. The callback pattern allows InputControls to communicate selection changes back up without tight coupling.
- **Trade-offs:** Slightly more prop drilling, but vastly clearer data flow. Easier to add new features that depend on selectedAgent (logging, validation, etc.) because they all go through the same state object.

### AgentSelector is a new component, not an extension of AgentModelSelector. Both coexist but are used mutually exclusively based on selectedAgent state. (2026-02-12)
- **Context:** Could have modified AgentModelSelector to show both templates and raw models, or created a new component to replace it entirely.
- **Why:** Separation of concerns: AgentSelector (template-based selection) and AgentModelSelector (raw model selection) have different responsibilities and APIs. Keeping them separate makes each component's intent clear and avoids feature creep.
- **Rejected:** Merging both into one component would create a mega-selector that must handle two different modes (template vs raw), two different data sources (agent registry vs model list), and conflicting state (selectedAgent vs selectedModel).
- **Trade-offs:** More components to maintain, but each has a single responsibility. Easier to unit test and reason about, harder to sync state if both were somehow active simultaneously.
- **Breaking if changed:** If a future requirement demands showing both selectors at once (e.g., select a template but override its model), the mutual exclusion pattern becomes a blocker and requires significant refactoring.

#### [Pattern] Layered parameter threading through React hook → TypeScript interface → HTTP client requires explicit type propagation at each boundary (2026-02-12)
- **Problem solved:** Passing agentConfig properties (role, maxTurns, systemPromptOverride) from UI component through hook to backend API
- **Why this works:** TypeScript's structural typing + npm workspace module resolution creates isolated type spaces. Each layer (component, hook, interface, HTTP client) maintains its own type definition. Without explicit threading, type information gets lost at boundaries.
- **Trade-offs:** More verbose (5 files modified for 3 parameters) but gains: compile-time safety, refactoring support, clear API contracts at each layer. Refactoring one parameter requires touching all 5 files.

### Scope discipline: UI layer changes only - backend parameter consumption left for separate feature despite accepting parameters at API boundary (2026-02-12)
- **Context:** Feature accepts role, maxTurns, systemPromptOverride at HTTP API layer but backend doesn't yet use them for execution logic
- **Why:** Prevents scope creep and enables parallel work - UI can be deployed independently. Clear contract: UI wires parameters through all layers, backend integration is decoupled feature. Matches monorepo strategy of feature isolation.
- **Rejected:** Could implement full end-to-end in single feature - would require backend changes (process management, prompt modification) alongside UI, larger PR, harder to test independently
- **Trade-offs:** Allows UI→API contract to be established before backend implementation is ready. Risk: if backend implementation differs from expectations, UI wiring becomes dead code until synced.
- **Breaking if changed:** If backend never implements parameter consumption, parameters are silently dropped - creates silent failures instead of compile-time errors. No way to detect at UI layer that backend is ignoring values.

### Optional prop pattern for selectedAgentTemplate with null initialization and fallback rendering (2026-02-12)
- **Context:** Adding agent template support to AgentHeader while maintaining backward compatibility with existing sessions that have no template selected
- **Why:** Makes the feature non-breaking: existing components work unchanged when prop is undefined/null, new features can opt-in by passing the prop. Allows incremental adoption - state can be added to agent-view without requiring all consumers to provide template data immediately
- **Rejected:** Required prop would force all callers to provide template data upfront, breaking existing sessions and requiring coordinated changes across codebase
- **Trade-offs:** Adds null-check logic in render path (minor), but enables shipping foundation without waiting for session persistence layer. Defers the harder dependency (storing/loading template with session) to later phase
- **Breaking if changed:** If displayName/role rendering logic becomes required (not optional), would need to handle null case in templates that don't provide selectedAgentTemplate - creates fragile cascading failures

### Deferring selectedAgentTemplate state initialization to null/undefined, not wiring state setters anywhere (2026-02-12)
- **Context:** Feature is a 'foundation' phase that implements UI structure but doesn't wire selection logic or persistence yet
- **Why:** Allows shipping the rendering layer without blocking on session state management (which requires ORM changes, persistence, loading logic). Creates discrete deliverable: foundation (UI shape) can be reviewed/deployed before state layer. Unblocks later phases to add selector UI, session hooks, etc. independently
- **Rejected:** Could wire everything end-to-end immediately - but would require coordinating session persistence changes (harder to review in one PR), ORM layer changes, and UI layer changes simultaneously
- **Trade-offs:** Component has unused state for now (slightly confusing to read), but enables parallel work - UI can be styled/reviewed while state layer is being built. Creates small tech debt of disconnected state
- **Breaking if changed:** If state setters are never wired, the prop remains unused - would need follow-up phase to connect selector UI to state. If that phase is delayed/cancelled, the code is dead. Clear owner must exist for 'add template selection UI' to avoid this limbo

#### [Pattern] Interface duplication: SelectedAgentTemplate defined separately in both agent-header.tsx and agent-view.tsx (2026-02-12)
- **Problem solved:** Two components needed the same template shape (displayName, role, optionally description) but started from files that didn't import from shared types
- **Why this works:** Avoided creating new shared type file and importing across components during foundation phase. Each file is self-contained and testable independently. Duplication cost is low for a 3-field interface during foundation
- **Trade-offs:** Easier to modify one component without worrying about breaking imports. Harder to ensure consistency - if one updates to add 'description', other still doesn't have it. Creates mild maintenance burden for future changes

#### [Pattern] useMemo() used to calculate boardCounts from features array. Reduces function signature complexity - hook returns flat object with computed value instead of raw data + function. (2026-02-12)
- **Problem solved:** Features array changes frequently (polling, WebSocket invalidation). Recalculating counts on every render is cheap, but the pattern is 'compute once, return result' not 'return data for caller to compute'.
- **Why this works:** Keeps hook interface simple (boardCounts is ready to use, not a function). Memoization prevents unnecessary re-renders of consumers when features data hasn't semantically changed (same counts, different object reference).
- **Trade-offs:** useMemo adds callback overhead but the reducer is O(n features) which is cheap anyway. Benefit: single source of count calculation logic.

### Conditional rendering of Project Activity section only when currentProject is set, rather than showing a generic 'no project selected' state (2026-02-12)
- **Context:** Feature needed to display real-time activity for a selected project on the dashboard, but dashboard is primarily a project selector, not a project viewer
- **Why:** The dashboard's purpose is project navigation. Showing activity only when a project context exists (currentProject !== null) prevents misleading empty states and aligns UX with actual use case.
- **Rejected:** Could render static placeholder when no project selected, but this confuses users about the section's purpose and clutters the dashboard
- **Trade-offs:** Simpler code and clearer UX vs potential discoverability issue if users don't know the section exists. Resolved by relying on collapsible default-expanded state.
- **Breaking if changed:** If the app changes to show dashboard while a project is still 'active' in background, this conditional becomes problematic and needs refactoring to show project context

#### [Pattern] Prop-based standalone components (EventFeed, ProjectHealthCard) that receive projectPath rather than relying on global state or context providers (2026-02-12)
- **Problem solved:** Two new components needed to display project-specific information on the dashboard without tight coupling to dashboard's state management
- **Why this works:** Prop-drilling is explicit and makes component dependencies clear. Avoids creating additional context providers which would complicate the state management tree. Easier to test and reuse in other views.
- **Trade-offs:** Parent (dashboard-view) must pass props explicitly. This is more verbose but self-documenting and prevents prop hell at deeper nesting levels.

#### [Gotcha] EventFeed's project filtering logic references events with project context metadata that doesn't exist yet (TODO comment in place), creating a gap between component design and actual data availability (2026-02-12)
- **Situation:** Component was designed with filtering capability but the authority event system doesn't currently include project path metadata in event objects
- **Root cause:** Anticipated future state where events would include context. Better to build the capability now than refactor later.
- **How to avoid:** Filter logic is dormant (commented out) today but ready to activate. Adds ~5 lines of unused code now, saves refactoring later.

#### [Pattern] ProjectHealthCard uses placeholder data structure with TODO comments for future metric integration, rather than hardcoding static values or raising errors on missing data (2026-02-12)
- **Problem solved:** Project metrics (status, active tasks, completed today) aren't yet available from backend, but component needed for dashboard integration
- **Why this works:** Placeholder structure is self-documenting via TODOs. Makes it obvious where real data should come from. Component is immediately usable for UI/UX validation.
- **Trade-offs:** Component renders with fake data that could mislead if not carefully labeled. TODOs document the intent but aren't enforced.

#### [Pattern] Event payload type discrimination via `isEpic` boolean flag instead of separate event type (2026-02-12)
- **Problem solved:** CeremonyService needed to handle epic completion differently from milestone/project completion, but all three emerge from feature lifecycle events
- **Why this works:** Single `feature:completed` event with discriminator flag reduces event proliferation. Allows gradual feature addition without schema explosion. Payload structure is self-documenting.
- **Trade-offs:** Simpler event model (+) but requires instanceof checks at runtime (-). More scalable for future feature types (+).

### Aggregate child feature costs at announcement time by loading from feature data, rather than pre-computing in epic completion event (2026-02-12)
- **Context:** Epic delivery announcement needs to show total cost, average cost per feature, and per-feature cost breakdown. Child features and their costs exist in feature.json files.
- **Why:** Feature data is source of truth. Loading at announcement time ensures cost reflects final state (no stale data from event emission time). Avoids redundant cost tracking in CompletionDetectorService.
- **Rejected:** Alternative: Pass aggregate costs in EpicCompletedPayload. This couples CompletionDetectorService to ceremony announcement concerns and creates dual source of truth for cost.
- **Trade-offs:** Requires I/O at announcement time (-) but guarantees accuracy and separation of concerns (+). One-time cost per epic completion is acceptable.
- **Breaking if changed:** If feature data structure changes (cost field renamed/moved), announcement generation breaks silently. Needs defensive null-checks.

#### [Gotcha] Discord message splitting at 2000 char limit needed for announcements with many child features, but no auto-truncation of feature list (2026-02-12)
- **Situation:** Epics with 20+ features produce announcements exceeding Discord's single-message limit. Implementation splits messages but doesn't indicate to user when features were omitted.
- **Root cause:** Discord API hard limit enforces split. Without splitting, entire announcement fails. Split preserves at least partial information.
- **How to avoid:** Message fragmentation is visible but informative (+). User sees data was split (-). No indication of omitted features in split case (-).

#### [Pattern] Two-level ceremony settings check: `enabled` AND `enableEpicDelivery`, both defaulting to true (2026-02-12)
- **Problem solved:** CeremonyService needed granular control: disable all ceremonies vs. disable only epic ceremonies
- **Why this works:** Hierarchical settings allow cost-free opt-out at multiple levels. Parent `enabled` flag kills all ceremony logic. Feature-specific flag provides fine-grained control without startup overhead.
- **Trade-offs:** Extra condition at runtime (+/-) is negligible. Flexibility gained outweighs small cost. Default-true for both prevents silent disablement surprises (+).

### Dual ESM/CJS builds with separate tsconfig files and output directories (dist/ for ESM, dist-cjs/ for CJS) rather than single transpilation target (2026-02-13)
- **Context:** Package declared as type:module but needs to support both import and require consumers
- **Why:** ESM-declared packages treat .js files as ES modules. CJS consumers cannot use .js files directly. Separate outputs allow each format to use correct extensions (.js for ESM, .cjs for CJS) without conflicts
- **Rejected:** Single build with conditional exports - would require either dual extension output from one tsconfig or runtime path resolution, both fragile
- **Trade-offs:** Doubles build complexity and output size, but enables true dual-format compatibility. npm pack size increases but consumers get correct format
- **Breaking if changed:** Removing separate tsconfig.cjs.json breaks CJS consumers - they'd try to require .js files from an ESM package, failing silently or with module errors

#### [Pattern] Postbuild script copies static assets (templates/) to compiled output directory (dist/templates/) rather than treating them as part of source or keeping separate (2026-02-13)
- **Problem solved:** Templates directory needed in npm package but should not be in git-ignored dist/ during development
- **Why this works:** Decouples template files from build system. Build is the single source of truth for what's published. Copying during postbuild ensures templates/ is always sync'd with dist/ state
- **Trade-offs:** Requires postbuild step execution but makes published package size/content deterministic and independent of template changes between builds

### .npmignore explicitly excludes src/, tests/, and config files rather than using files field inclusion-list approach (2026-02-13)
- **Context:** Need to publish only compiled output and templates, not source or test files
- **Why:** Exclusion is simpler when there are many file types to exclude (src/, tests/, tsconfig files, build scripts, etc). files field requires listing every path to include - fragile and verbose
- **Rejected:** files field with ['dist', 'dist-cjs', 'templates', 'package.json'] - requires maintenance as new included files added; implicit inclusion of other files if pattern missed
- **Trade-offs:** .npmignore is declarative and defensive (assumes everything included unless stated). Slightly slower npm pack scanning but much more maintainable
- **Breaking if changed:** Removing .npmignore allows src/ and test files into published package - increases tarball size and exposes implementation details

### CLI entry point (src/cli.ts) is separate file from main export (src/index.ts) rather than single-file dual-export (2026-02-13)
- **Context:** Package exports main function for library use and bin entry point for CLI use
- **Why:** Separation allows each use case to have appropriate side effects. CLI can initialize readline, parse process.argv, and exit; library main() is pure export. Consumers can tree-shake unused CLI code
- **Rejected:** Single index.ts with conditional export - mixes concerns, harder to test independently, library consumers would bundle CLI code unnecessarily
- **Trade-offs:** Requires two entry points but enables better code splitting and clearer intent. bin field points directly to dist/cli.js, avoiding indirection
- **Breaking if changed:** Merging cli.ts into index.ts couples CLI side effects to library export - consumers importing main would trigger CLI initialization on import

#### [Pattern] Conditional exports (require vs import) in package.json pointing to different file extensions (.cjs vs .js) rather than same file for both (2026-02-13)
- **Problem solved:** Supporting both ESM and CJS consumers requires providing each with correct module format
- **Why this works:** Node.js module resolution respects conditional exports - allows single package.json to direct each consumer to their expected format without ambiguity or runtime detection
- **Trade-offs:** Requires maintaining two build outputs but creates zero runtime overhead and works with all bundlers/loaders correctly

### Extracted pure function with zero external dependencies into standalone package rather than keeping it in monorepo service layer (2026-02-13)
- **Context:** researchRepo() function in repo-research-service.ts needed to be reusable outside the main server, but was tightly coupled to the service structure
- **Why:** Pure functions with no external deps (only Node.js builtins) are ideal candidates for package extraction. No version management issues, no circular deps, no auth/context passing needed. Enables reuse in create-protolab CLI without dragging server infrastructure
- **Rejected:** Could have kept it in server and imported from there, but that would require create-protolab to depend on @automaker/server (huge bloat). Could have rewritten logic in create-protolab, but that duplicates 652 lines and creates maintenance burden
- **Trade-offs:** Extraction adds new package surface but gains true reusability. Upside: create-protolab stays lightweight. Downside: two places to maintain types/utils if not carefully unified
- **Breaking if changed:** If this function gains dependencies on @automaker/* packages later (auth, caching, logging from shared libs), the package extraction fails - becomes unmaintainable. Must keep this function pure or extraction was wrong

#### [Gotcha] Git command failures (like branch protection checks) initially failed silently; had to enhance runCmd() to log warnings instead of swallowing errors (2026-02-13)
- **Situation:** Extracted function inherited git error handling from original service - errors were caught but not surfaced, making debugging hard when moving to new package context
- **Root cause:** Function works fine in service context where git failures are infrequent, but in CLI extraction context where function is called in isolation, silent failures hide real problems. Users need visibility into what git checks failed
- **How to avoid:** Added logging overhead but gained observability. CLI users can now see why research returned empty git branch, DNS check, etc. Cost: slightly noisier logs if git is misconfigured

#### [Pattern] Created local type definitions and utility stubs (types.ts, utils.ts) instead of importing from @automaker/* packages (2026-02-13)
- **Problem solved:** Original function imported RepoResearchResult from @automaker/types and createLogger from @automaker/utils. Extraction required breaking these external deps
- **Why this works:** Package must be self-contained to avoid coupling create-protolab to the main monorepo. Copying types.ts (interface only, no logic) is cost-free. createLogger() stub is minimal (~5 lines) - only used for console output. This isolation pattern allows the package to evolve independently and be vendored/published separately
- **Trade-offs:** Duplication of types is minimal (interface definitions only). Gain: zero runtime deps. Lose: if core types change, must manually sync. Mitigation: types are stable, changes unlikely

### Copy entire type definitions file inline rather than import from @automaker/types package (2026-02-13)
- **Context:** create-protolab package needs setup pipeline types but cannot import @automaker/types due to runtime context where @automaker/types fails (likely browser environment or circular dependency)
- **Why:** Type duplication avoids runtime import failures. Package manager workspace resolution fails in certain execution contexts (create-protolab runs standalone during repo research), so local types prevent module resolution errors entirely
- **Rejected:** Re-exporting types from @automaker/types would be cleaner but creates hard dependency on package manager correctly resolving @automaker/types in all contexts where create-protolab executes
- **Trade-offs:** Maintenance burden (keep two copies in sync) vs reliability (no import-time failures). Added sync comment + potential CI check to mitigate drift
- **Breaking if changed:** If types are updated in libs/types/src/setup.ts without updating the copy, create-protolab will use stale interfaces, leading to type mismatches at composition time when features are created

#### [Gotcha] Types file must have ZERO external imports including @automaker/* packages to remain standalone (2026-02-13)
- **Situation:** Initial concern: would importing from @automaker/types break the standalone nature? Yes - any import at module load time fails in certain contexts
- **Root cause:** create-protolab is invoked in repo research phase before full monorepo build completes, and in contexts where npm workspace resolution is not available or breaks. Even @automaker/types (a workspace package) cannot be reliably imported
- **How to avoid:** Pure interfaces (no code, no imports) are trivially safe. Any runtime code or imports resurrects the original problem

### Logger writes all levels (info/warn/error/debug) to stderr, not stdout (2026-02-13)
- **Context:** Building CLI utilities that need logging without interfering with data output
- **Why:** CLI convention: stdout is for data piping/output, stderr is for logs/diagnostics. Allows users to redirect output while keeping logs visible
- **Rejected:** Writing all to stdout (would pollute data pipelines) or splitting info to stdout/errors to stderr (inconsistent for CLI consumers)
- **Trade-offs:** Slightly less intuitive for new developers (expect info on stdout) but correct for production CLI usage and stream redirection
- **Breaking if changed:** Any code that expects logger output on stdout will fail; stream redirection in consuming CLIs will lose log visibility

#### [Pattern] Optional picocolors with try-catch fallback to identity functions (2026-02-13)
- **Problem solved:** Wanting colored output without forcing dependency; package must work with zero external deps
- **Why this works:** Try-catch on optional import (not import-safe) lets picocolors enhance the CLI when available but never fails the app. Fallback identity functions preserve interface consistency
- **Trade-offs:** Try-catch adds 3 lines but enables graceful degradation; colors appear only if dev installs picocolors, not by default

### Helper functions stay minimal without validation or error wrapping (2026-02-13)
- **Context:** Creating lightweight utils without adding complexity for create-protolab scaffolding
- **Why:** Minimal surface area (53 lines) reduces maintenance burden; errors propagate naturally to caller who has context. Scaffolding CLI will add its own validation layer
- **Rejected:** Adding try-catch to readJson/writeJson (hides errors, makes debugging harder); throwing typed errors (adds complexity); returning Result type (forces unwrapping everywhere)
- **Trade-offs:** Errors propagate quickly but require caller to handle; no retry logic or detailed error messages; simpler to understand and maintain
- **Breaking if changed:** Adding validation would change error types; wrapping errors would require refactoring all call sites; Result type would break existing interfaces

### Extracted pure synchronous function with zero external dependencies by creating inline type definitions and minimal logger wrapper instead of importing from monorepo packages (2026-02-13)
- **Context:** Gap analysis service needed to be extracted from server (which imports @automaker/types, @automaker/utils) into create-protolab package for use as standalone library
- **Why:** Monorepo package imports would create circular dependencies and tight coupling. Pure function with embedded types ensures create-protolab can be used independently without server build artifacts or external package resolution
- **Rejected:** Re-exporting from @automaker/types via package.json exports field - would still require server packages to be built and available at runtime
- **Trade-offs:** Type duplication (GapAnalysisReport, RepoResearchResult copied into new package) eliminates tight coupling. Slightly larger package but complete standalone functionality
- **Breaking if changed:** If gap check logic in analyzeGaps changes, must update in BOTH locations (server + create-protolab) or create-protolab will drift from server behavior

### Postbuild script (`cp -r templates dist/`) copies template files to dist/ directory rather than building/processing them (2026-02-13)
- **Context:** Need to distribute static template files (YAML, MD, JSON) in npm package without compilation
- **Why:** Templates are configuration/documentation files that must be served as-is to consumers. Compilation would corrupt YAML/JSON structure. Postbuild runs AFTER TypeScript compilation, ensuring dist/ exists before copy. This separates compiled code (src → dist via tsc) from static assets (templates → dist via cp).
- **Rejected:** Alternative: Include templates in src/ and copy via import statements (would require bundler logic). Rejected because: (1) Makes source tree cluttered, (2) Requires loader/plugin in consumer code, (3) Harder to edit templates when mixed with code
- **Trade-offs:** Easier: Simple copy operation, templates stay in source directory, no build logic needed. Harder: Two separate build steps (tsc + cp), requires explicit 'files' field in package.json to include dist/
- **Breaking if changed:** If postbuild is removed, npm pack will exclude templates (only dist/src exists in dist/). Consumer apps won't have template files available. Distribution becomes incomplete.

### Created new standalone `packages/create-protolab` package rather than exporting templates from `apps/server` (2026-02-13)
- **Context:** Templates were originally in apps/server/src/templates/, needed to be distributed via npm
- **Why:** Monorepo pattern: server is a production application (Electron), create-protolab is a utility library. Separating into packages/ keeps library concerns isolated from app concerns. Allows independent versioning, independent npm distribution, and clear dependency direction (apps depend on packages, not vice versa).
- **Rejected:** Alternative: Export templates directly from apps/server via npm. Rejected because: (1) Makes server package heavier with unrelated scaffolding code, (2) Couples scaffolding versioning to server releases, (3) Violates monorepo separation (apps shouldn't be published as libraries)
- **Trade-offs:** Easier: Clean package boundaries, independent distribution, reusable in other projects. Harder: One more package to maintain, requires separate build/test/publish pipeline
- **Breaking if changed:** If merged back into apps/server, the server package becomes a dual-purpose app+library, conflating concerns. Build process becomes more complex (what's for distribution vs what's app-only?). Consumers importing server for templates would import unnecessary Electron dependencies.

#### [Pattern] Template files use {{variableName}} placeholders for runtime substitution by consumers (2026-02-13)
- **Problem solved:** Templates must work for different projects with different build commands, branch names, package managers, etc.
- **Why this works:** Mustache-like placeholder syntax is: (1) Language-agnostic (works in YAML, JSON, Markdown, shell), (2) Easy to regex replace in consumer code, (3) Visually distinct and searchable, (4) Safe (won't collide with actual syntax like ${ENV_VAR} in shell scripts)
- **Trade-offs:** Easier: Simple text replacement, works across any file type. Harder: Consumers must know which placeholders exist, no type safety on substitution

### Created coderabbit.yaml template (didn't exist in source) rather than omitting it (2026-02-13)
- **Context:** Feature requirement listed coderabbit.yaml as a template deliverable, but it didn't exist in apps/server/src/templates/
- **Why:** Feature requirements take precedence over existing source state. Coderabbit.yaml is a standard config file in modern repos (required by branch protection CI checks). Creating a sensible default (review rules + {{mainBranch}} placeholder) aligns with template system goals and prevents feature from being incomplete.
- **Rejected:** Alternative: Skip coderabbit.yaml since it didn't exist. Rejected because: (1) Breaks acceptance criteria, (2) Future consumers expecting it would have a gap, (3) Easy to create a reasonable default
- **Trade-offs:** Easier: Feature complete, covers real use case. Harder: Created file without explicit source reference (judgment call on format/content)
- **Breaking if changed:** If this approach is reverted to 'only copy from source', feature becomes incomplete and feature flag stays unresolved.

### Extract pure algorithmic service (alignment-proposal-service) into a reusable package by removing all logger/side-effect dependencies, making it a stateless synchronous function (2026-02-13)
- **Context:** Server-based alignment proposal generation needed to be used in create-protolab context, but service had logging and environmental dependencies that prevented reuse
- **Why:** Logging and side effects create coupling to runtime environment (server context). Removing them makes the function portable across CLI, API, and UI contexts. Pure functions are easier to test, compose, and reason about
- **Rejected:** Alternative: Keep logging in place and pass a logger interface. Rejected because it adds unnecessary parameter-passing complexity and ties the pure algorithm to logging infrastructure
- **Trade-offs:** Easier: reusability, testability, composition. Harder: debugging proposal generation requires adding logging at call site, not inside function
- **Breaking if changed:** If logging is added back inside generateProposal, it loses portability to non-server contexts (e.g., CLI tools, browser). The function becomes coupled to a specific logger implementation

#### [Pattern] Define milestone structure as a static array (MILESTONE_DEFS) external to function logic, allowing the algorithm to iterate/reference without hardcoding milestone rules (2026-02-13)
- **Problem solved:** Alignment proposal needs to group gaps into Foundation → Quality Gates → Testing → UI → Automation sequence, with specific dependencies and sort orders per milestone
- **Why this works:** Static definition decouples milestone policy from algorithm. Changes to milestone order, names, or dependencies don't require function rewrite. Algorithm just iterates the array and applies rules consistently
- **Trade-offs:** Easier: changing milestone strategy (reorder, add new, remove). Harder: understanding flow requires reading both MILESTONE_DEFS and the iteration logic together

#### [Gotcha] Unassigned gaps are silently caught in an 'Other' milestone with no dependencies, allowing parallel execution despite other milestones having dependsOn chains (2026-02-13)
- **Situation:** Gap analysis may contain items that don't match any MILESTONE_DEFS pattern. Without special handling, these gaps disappear from the proposal
- **Root cause:** Catch-all prevents data loss. 'Other' milestone with empty dependsOn array signals these features can run independently, which is correct for items that didn't fit established patterns
- **How to avoid:** Easier: complete proposals with no missing gaps. Harder: 'Other' category masks problems where expected gaps don't match any milestone pattern

### Sort features within each milestone by priority (urgent first) then effort (small first), using a stable sort order independent of input gap order (2026-02-13)
- **Context:** Gap analysis returns gaps in discovery order, not strategic order. Proposals need to highlight highest-impact / lowest-effort work first
- **Why:** Deterministic sort ensures consistent proposals and makes sprint planning predictable. Urgent items float to top regardless of where they appeared in analysis. Small efforts batch together for quick wins
- **Rejected:** Alternative: Preserve input order from gap analysis. Rejected because it hides strategic priority under discovery order noise
- **Trade-offs:** Easier: sprint planning (take first N items). Harder: tracing why a particular gap ended up in position X requires understanding sort keys
- **Breaking if changed:** If sort order changes (e.g., effort-first instead of priority-first), sprint decisions change. Downstream automation relying on 'take first N features' will pick different work

### ESM-only package with dual-path resolution (prod dist/ fallback to dev src/) instead of file bundling or template embedding (2026-02-13)
- **Context:** Template system needs to work in both development (source templates visible) and production (compiled distribution) contexts without duplicating template files or requiring template bundling
- **Why:** Allows templates to remain as plain text files in src/templates/, automatically copied to dist/ during build via package.json script. Avoids storing templates as strings in compiled code (harder to edit/maintain) and avoids npm package publishing complexity
- **Rejected:** Alternative 1: Bundle templates into compiled JS as template literals - rejected because templates become immutable and harder to iterate on. Alternative 2: Require templates as separate npm package - rejected as over-engineered for internal use
- **Trade-offs:** Pro: Templates remain editable as files, clean separation. Con: Requires try-catch fallback logic and build script dependency (cp command)
- **Breaking if changed:** If build script (tsc && cp -r src/templates dist/) is removed or template directory is deleted, loadTemplate() will fail at runtime in production. Dev paths act as safety net but shouldn't be relied upon for prod

#### [Gotcha] ESM modules require import.meta.url with fileURLToPath() for directory resolution - no __dirname available (2026-02-13)
- **Situation:** Initial approach assumed __dirname would work in Node.js ESM, but CommonJS globals don't exist in ESM context
- **Root cause:** ESM spec doesn't provide __dirname/__filename. Must use import.meta.url (contains file:// URL) and convert to filesystem path with fileURLToPath() from 'url' module
- **How to avoid:** Pro: Correct for ESM spec, future-proof. Con: More boilerplate than CommonJS (requires fileURLToPath import and setup)

#### [Pattern] Package manager command abstraction via getPackageManagerVars() helper returning standardized var object with packageManager, installCommand, runCommand, execCommand (2026-02-13)
- **Problem solved:** Templates need to reference package manager-specific commands (npm run vs yarn vs pnpm run vs bun) but different PMs have different command syntax
- **Why this works:** Single source of truth for PM command mappings. Integrates cleanly with interpolateTemplate() - caller just spreads pmVars into the vars object. Decouples PM knowledge from template content
- **Trade-offs:** Pro: Testable, composable, easy to extend for new PMs. Con: Requires caller to know which PM to pass in (caller must determine from research.monorepo.packageManager)

### Created CLI entry point in separate workspace package (create-protolab) rather than embedding in main server (2026-02-13)
- **Context:** CLI needs independent versioning, distribution, and lifecycle from the core server
- **Why:** Workspace isolation allows npm publish of CLI without server dependencies. Consumers can install just the CLI tool globally without pulling in 500MB of server deps. Monorepo structure provides shared type safety via @automaker/types without tight coupling
- **Rejected:** Embedding CLI in main server package would require publishing entire server + dependencies for CLI-only updates
- **Trade-offs:** Easier: independent updates, distribution, CI/CD. Harder: coordinating type changes across packages, ensuring types are published
- **Breaking if changed:** If merged back into server package, CLI consumers would need to install full server, bloating footprint 10-20x

#### [Pattern] Postbuild chmod +x script instead of pre-commit git attributes or manual permissions (2026-02-13)
- **Problem solved:** Shebang requires executable bit on dist/index.js, but git doesn't preserve permissions across clones by default
- **Why this works:** postbuild script runs after tsc, guarantees file is executable in all environments (local, CI, npm package). Avoids git config fragility (core.fileMode, safecrlf) and pre-commit hooks complexity
- **Trade-offs:** Easier: simple one-liner, works everywhere. Harder: invisible to git (permissions not tracked), must remember postbuild is critical

### Exported main() function alongside CLI invocation for potential library reuse vs pure CLI-only (2026-02-13)
- **Context:** CLI logic may be called programmatically in future (e.g., within server, tests, other tools)
- **Why:** Separating setup logic from invocation (export function + check for esm.meta.main) allows npm consumers to require/import the function without spawning a subprocess. Monorepo pattern for tools that serve both CLI and API use cases
- **Rejected:** Pure CLI with no exports couples consumers to subprocess spawn, adds IPC overhead, fails in browser/non-spawn contexts
- **Trade-offs:** Easier: flexible consumption. Harder: must maintain function API alongside CLI API, breaking changes affect both surfaces
- **Breaking if changed:** If function signature changes, both CLI usage AND programmatic callers break

### Idempotent file creation with existence checks before writing instead of overwrite-by-default (2026-02-13)
- **Context:** Init phase needs to run multiple times without corrupting existing user modifications or re-generating content
- **Why:** ProtoLab projects may be re-initialized after setup (e.g., tech stack changes). Overwriting would lose user edits to CLAUDE.md, coding-rules.md, or protolab.config. Existence checks + skip-if-present pattern allows safe re-runs.
- **Rejected:** Overwrite-by-default (would corrupt user edits), version-numbered backups (adds complexity, users confused about which file is active)
- **Trade-offs:** Idempotency prevents accidental data loss but also means init can't repair corrupted context files — requires manual deletion to regenerate. Users must be aware files persist.
- **Breaking if changed:** If idempotency is removed and overwrite-by-default is used, any user modifications to .automaker/ context files will be silently lost on re-init, breaking user trust in the tool.

#### [Pattern] Stack-aware template composition — multiple small template fragments combined based on tech stack detection results (2026-02-13)
- **Problem solved:** Different projects need different CLAUDE.md and coding-rules.md content (React projects need different rules than FastAPI projects; monorepos need different guidance than single-app repos)
- **Why this works:** Reduces template sprawl and keeps rules maintainable. Each tech (TypeScript, React, Python, etc.) has its own rule fragment. Init combines only relevant fragments based on research data, producing focused context files instead of generic boilerplate with irrelevant sections.
- **Trade-offs:** Composition requires parsing RepoResearchResult to determine which fragments to include — more conditional logic, but context files stay focused. Fragment order matters (TypeScript rules before React-specific rules for clarity).

#### [Gotcha] ESM module resolution requires explicit Node.js built-in imports — `import * as path` and `import { promises as fs }` instead of default/named imports (2026-02-13)
- **Situation:** Initial implementation used standard CommonJS-style imports which failed silently in ESM context
- **Root cause:** Node.js built-in modules don't export defaults in ESM. The `path` module is a namespace, not a default export. The `fs.promises` API must be destructured on import, not accessed as `fs.promises` post-import.
- **How to avoid:** Explicit import syntax is verbose but matches modern Node.js patterns and avoids async/await for module loading. Other developers expect `import * as path` in 2026 codebase.

### Enrich protolab.config with computed fields (techStack, commands, standard.skip) based on research data instead of storing only user-provided values (2026-02-13)
- **Context:** Config file needs to support CLI/UI runtime decisions without re-running research phase
- **Why:** Research phase runs once at init time, but protolab.config needs to be a complete source of truth for downstream tooling (e.g., 'which package manager to use' or 'does this project need a Python section'). Commands array is derived from package manager type (npm → npm run, poetry → poetry run), not user input. Standard.skip list is based on what the project already has (e.g., skip Prettier if hasPrettier=true).
- **Rejected:** Store only raw user input (requires re-running research later), keep config minimal and compute on-the-fly in CLI (violates locality, slow)
- **Trade-offs:** Config file is larger and couples to RepoResearchResult structure, but it's the complete state needed for the entire ProtoLab pipeline. No need to re-run research for every command.
- **Breaking if changed:** If tech detection changes in research phase, config fields become stale. Config must be regenerated or validated on load. Version field in config helps track staleness.

#### [Gotcha] TypeScript tsconfig.json base path must point to `../../libs/tsconfig.base.json`, not `../../tsconfig.base.json` (2026-02-13)
- **Situation:** Initial config used wrong path, breaking TypeScript compilation for the entire package
- **Root cause:** Workspace structure: packages/create-protolab/ → up 2 levels → libs/tsconfig.base.json (not project root). The root tsconfig.json is a reference file, not the base. Each workspace package extends libs/tsconfig.base.json which has the actual compiler settings.
- **How to avoid:** Explicit base path is verbose but ensures consistent TypeScript settings across 200+ files in workspace. Mistake is easy to make for new packages.

### Separated CLI concerns into parse → execute → display flow with mock backend functions designed for easy API integration (2026-02-13)
- **Context:** Building interactive CLI that needed to be testable, maintainable, and ready for real server integration without existing backend
- **Why:** Mock functions (performResearch, performGapAnalysis, etc.) allow CLI logic to be complete and verifiable before backend exists. Separation means backend integration is a search-replace operation on function bodies, not structural refactoring
- **Rejected:** Alternative: Build CLI directly calling real API endpoints. Breaks testing and development when server unavailable or API unstable
- **Trade-offs:** Easier: Testing CLI logic, parallel development with backend team. Harder: Must remember these are mocks before deploying to production
- **Breaking if changed:** If mock functions are removed without API integration, all CLI features fail silently with empty results

#### [Gotcha] Standalone TypeScript tsconfig.json in package directory is required—cannot inherit from monorepo root when package is used as published npm module (2026-02-13)
- **Situation:** Initial attempt to run CLI used inherited tsconfig pointing to monorepo paths. When package is published to npm or used in external projects, those paths don't exist
- **Root cause:** Published npm packages must be self-contained. Inheriting monorepo tsconfig creates implicit dependencies on repo structure. Consumers installing from npm won't have the monorepo root, so compilation fails. Standalone tsconfig ensures 'npm install create-protolab && npx create-protolab' works anywhere
- **How to avoid:** Easier: Published package works anywhere. Harder: Config duplication (copy relevant parts from monorepo tsconfig), must update both configs if compilation rules change

### Package manager setup in CI workflows uses conditional action selection: pnpm → pnpm/action-setup@v4, bun → oven-sh/setup-bun@v2, yarn/npm → setup-node. Different packages need different setup tools and cannot be unified. (2026-02-13)
- **Context:** CI phase must support npm, pnpm, yarn, and bun. Each has different GitHub Actions ecosystem and setup requirements.
- **Why:** Pnpm has monorepo-specific requirements (pnpm/action-setup must run before setup-node). Bun is a separate runtime (cannot use setup-node). Yarn and npm both work with setup-node. Unifying would require bun to use setup-node (wrong runtime) or all to use package-specific actions (unnecessary complexity).
- **Rejected:** Single setup-node action for all would break pnpm and bun. Using package-specific actions for all (including npm/yarn) adds unnecessary complexity and different action versions.
- **Trade-offs:** Conditional setup logic is more complex but correct per package manager. Running unnecessary actions (e.g., setup-node for bun) wastes CI minutes but simplifies workflow.
- **Breaking if changed:** Changing setup action for any package manager breaks that package manager's CI. Pnpm without pnpm/action-setup loses monorepo awareness. Bun without oven-sh/setup-bun has no runtime.

#### [Pattern] Template interpolation uses regex-based {{variable}} replacement at file write time. Templates stored in source with placeholders, replaced during scaffold generation based on detected package manager. (2026-02-13)
- **Problem solved:** ProtoLab scaffold needs dynamic CI workflows that adapt to project's package manager without duplicating 4 separate workflow files.
- **Why this works:** Late binding (at scaffold time) allows single template source with runtime-determined values. {{variable}} syntax is readable in templates and unambiguous for regex matching. Matches pattern from existing templates.ts file.
- **Trade-offs:** Template syntax is simple but requires careful placeholder naming to avoid collisions. Regex replacement is fast but cannot handle nested logic (would need a proper templating engine for complex cases).

### CI phase checks for existing workflow files and skips writing (idempotent). Does not overwrite existing .github/workflows/ files. (2026-02-13)
- **Context:** Scaffold tool may be run multiple times on same project or user may have manually created workflows. Overwriting would lose manual customizations.
- **Why:** Idempotency is critical for scaffolding tools. Users expect to run scaffold multiple times safely. Preserving existing files respects user customizations and prevents accidental data loss.
- **Rejected:** Could overwrite existing files (simpler logic) but breaks user trust and loses customizations. Could fail/error on existing files but adds complexity for users who need to re-run scaffolds.
- **Trade-offs:** File existence check adds minimal overhead but prevents re-initialization. Users cannot update workflows by re-running scaffold without manual deletion.
- **Breaking if changed:** Removing idempotency check causes workflows to be overwritten on each scaffold run, potentially losing user customizations.

#### [Pattern] Phase functions return status objects with optional fields (success: boolean, rulesetId?: number, error?: string) rather than throwing errors or returning early (2026-02-13)
- **Problem solved:** Branch protection phase needs to fail gracefully when gh CLI unavailable, without blocking downstream phases
- **Why this works:** Allows caller to differentiate between 'feature not available' (success: true, no rulesetId) vs 'feature failed' (success: false, error message). Single status object unifies happy/warning/error paths without exceptions
- **Trade-offs:** Caller must check status.success AND status.rulesetId separately; simpler error handling means no stack traces unless explicitly logged

#### [Gotcha] Template interpolation uses {{placeholder}} syntax which must match EXACTLY in both template file AND interpolateTemplate() string replacement (2026-02-13)
- **Situation:** branch-protection/main.json uses {{defaultBranch}} in name and conditions.ref_name.include[0]
- **Root cause:** Simple string replacement is readable and doesn't require template engine dependency. Placeholder syntax chosen to avoid collision with JSON reserved chars
- **How to avoid:** Very simple, but if placeholder appears in actual data, it will be accidentally replaced. No validation that all placeholders were replaced

#### [Pattern] Phase auto-detects repository info from git remote origin instead of requiring it as parameter (2026-02-13)
- **Problem solved:** Branch protection ruleset creation needs owner/repo, but passing these as explicit params creates coupling to git setup
- **Why this works:** Git remote origin is always available in cloned repos; auto-detection reduces parameter count and makes phase 'just work' in standard flows. Caller doesn't need to know/parse git origin
- **Trade-offs:** Works automatically in cloned repos; fails silently in bare repos or non-origin-named remotes. Error handling must be very clear about this assumption

### Three-tier error classification (FATAL/RECOVERABLE/WARNING) with explicit recovery paths rather than throwing exceptions (2026-02-13)
- **Context:** CLI tool needs to guide users toward resolution without crashing. Different error severities require different user actions.
- **Why:** FATAL errors need rollback+abort. RECOVERABLE errors allow retry/skip/continue decisions. WARNING errors should not block progress. Exception-based approach loses this granularity and forces ugly try-catch chains.
- **Rejected:** Traditional exception-throwing with catch handlers - loses error context and doesn't guide user toward recovery
- **Trade-offs:** Easier: user-friendly recovery guidance, no silent failures. Harder: error handling becomes explicit at every call site (not implicit propagation)
- **Breaking if changed:** If converted to exception-based, recovery suggestions disappear and rollback becomes a finally-block cleanup problem instead of structured operation

#### [Pattern] State file (`.automaker/setup-state.json`) tracking completed phases for resumability rather than idempotency through command re-execution (2026-02-13)
- **Problem solved:** Setup can be interrupted at any point. Re-running the CLI after interrupt should skip completed phases, not redo them.
- **Why this works:** Re-running phases is dangerous (e.g., re-creating git repos overwrites history, re-initializing beads may corrupt state). State file allows granular skip logic: phase-by-phase resume without full re-execution.
- **Trade-offs:** Easier: clear resume path, obvious state tracking. Harder: state file can go stale or be deleted (lost resume context). Mitigation: state file backed up in rollback system.

#### [Gotcha] Rollback registration must happen BEFORE operation execution, not after success (2026-02-13)
- **Situation:** Implemented rollback system where each unsafe operation registers its undo action. Initial design registered rollback after successful completion.
- **Root cause:** If operation succeeds but then system crashes before rollback registration, the operation won't be undone. Correct order: register rollback → execute operation → on error, walk rollback stack backwards.
- **How to avoid:** Easier: rollback logic follows operation logic. Harder: must pre-declare undo action without knowing final outcome (requires careful design of undo operations).

### Graceful degradation for optional tools (gh, gt, bd) - warnings instead of FATAL errors (2026-02-13)
- **Context:** CLI requires 7+ tools. Some are optional (improve DX but not required). Question: hard requirement or soft requirement?
- **Why:** Users may have valid monorepos without gh/gt/bd installed. Blocking on missing optional tools prevents legitimate setups. However, certain tools (git, node, npm, jq) are truly required - these are FATAL.
- **Rejected:** Hard requirement on all tools - would fail for users in monorepos without gh CLI, Graphite, or Beads installed
- **Trade-offs:** Easier: broader compatibility. Harder: feature discovery becomes implicit (users don't know gh/gt/bd would improve setup). Mitigation: warning messages suggest tool installation.
- **Breaking if changed:** If optional tools become required (e.g., gh required for team collaboration), CI/CD setups without gh would fail. Conversely, if required tools become optional, setup skips critical validation.

#### [Pattern] Monorepo detection via workspace configuration files (pnpm-workspace.yaml, lerna.json, .yarnrc) rather than heuristic analysis (2026-02-13)
- **Problem solved:** Different package managers use different workspace formats. CLI needs to detect which one.
- **Why this works:** File-based detection is reliable (definitive signal) vs heuristics (multiple package.json files could mean monorepo or just nested projects). Fails safely: if no workspace file found, assumes single-repo setup.
- **Trade-offs:** Easier: deterministic detection. Harder: must know format for each package manager (pnpm, npm, yarn, lerna). Mitigation: list all known formats.

#### [Pattern] Phase-based initialization pattern with status objects returning {success, alreadyInitialized, error} for idempotent operations (2026-02-13)
- **Problem solved:** Beads initialization needs to be idempotent (safe to call multiple times), handle missing bd CLI gracefully, and integrate into a multi-phase setup workflow
- **Why this works:** Phase functions are meant to be composable and rerunnable during setup. The status object pattern lets callers distinguish between 'already done', 'just did it', and 'failed' without exceptions for non-error cases (bd CLI missing)
- **Trade-offs:** Callers must check the full status object rather than just success flag, but this is more informative and enables dry-run/idempotent behavior. Pattern is explicit but slightly verbose

### Set no-daemon: true in .beads/config.yaml AFTER bd init completes, via post-processing YAML file manipulation rather than passing config as arguments to bd init (2026-02-13)
- **Context:** bd init command doesn't have a CLI flag to set no-daemon mode, but the config must be set before beads is used in production
- **Why:** bd init generates its own config.yaml with defaults. Only way to override no-daemon is post-processing. Matches Ava's documented requirement that 'no-daemon: true' prevents auto-start issues in server contexts
- **Rejected:** Could shell escape quotes and pass config via --config flag, but bd doesn't support that pattern. Could also assume user would manually edit config.yaml (error-prone)
- **Trade-offs:** Adds YAML parsing dependency and extra file I/O, but ensures no-daemon is always set correctly. Makes function fully self-contained for beads setup
- **Breaking if changed:** If bd changes its config file format or location, the YAML mutation code breaks. Code assumes config.yaml exists after bd init (currently true)

#### [Gotcha] ES modules require explicit __dirname polyfill using fileURLToPath(import.meta.url) + dirname(). This cannot be assumed to exist like in CommonJS. (2026-02-13)
- **Situation:** Package uses ES modules (type: module in package.json). Template path resolution failed because __dirname was undefined at runtime.
- **Root cause:** Node.js ES modules don't provide __dirname/filename globals. Must derive from import.meta.url which is only available in ES module scope, not CommonJS.
- **How to avoid:** Slightly more verbose imports (fileURLToPath, dirname) but guarantees correct path resolution in all ES module contexts. Alternative of assuming __dirname exists creates hard-to-debug runtime failures.

#### [Pattern] Idempotent file generation with existed flag in return object allows caller to distinguish between 'created new' vs 'already present' without checking filesystem separately. (2026-02-13)
- **Problem solved:** Phase generates .coderabbit.yaml - needed to avoid overwriting user modifications while still satisfying the 'file must exist' requirement.
- **Why this works:** Idempotence (safe to call multiple times) + information richness (caller knows what happened) prevents data loss and enables better error messages/logging. The existed flag is a 'write intent' signal.
- **Trade-offs:** Return object adds minimal overhead but significantly improves observability. Prevents the common pattern of 'try to create → catch error → assume exists → move on' which hides real failures.

### Created validation library in libs/ not packages/, following monorepo structure with composite TypeScript builds (2026-02-13)
- **Context:** Feature description mentioned packages/create-protolab which doesn't exist. Had to verify correct directory structure.
- **Why:** libs/ is reserved for shared internal libraries with workspace member setup. packages/ is for published/external-facing modules. Validation is internal infrastructure.
- **Rejected:** Creating in packages/ would require npm publishing setup and external dependency management, overkill for internal validators.
- **Trade-offs:** libs/ means automatic workspace hoisting and simpler dependency resolution, but requires build:packages step and tsconfig.json composite references.
- **Breaking if changed:** If moved to packages/, must update all imports from @automaker/validation and adjust build pipeline. Workspace resolution would break in dependent packages.

#### [Pattern] Structured validator result pattern: {success: boolean, data?: T, errors?: ValidationError[]} used across all validators (2026-02-13)
- **Problem solved:** Multiple validator modules (schemas, api, template, filesystem) needed consistent error handling for downstream code.
- **Why this works:** Uniform result shape allows try-catch-free error handling. Callers check result.success once, not scattered error checks. Matches Zod's discriminated union pattern.
- **Trade-offs:** Requires result.success check before accessing data, but eliminates exception handling boilerplate. More explicit about error states.

#### [Gotcha] TypeScript composite references in initial tsconfig caused build errors; simplified to match other libs' configuration without composite flag (2026-02-13)
- **Situation:** Copied tsconfig pattern from another lib that used composite references, but this interfered with build:packages step.
- **Root cause:** Composite references are for repo-level build optimization when multiple tsconfig.json files exist. In this monorepo, build:packages handles compilation order. Composite adds unnecessary complexity.
- **How to avoid:** Non-composite tsconfig is simpler to maintain but requires build:packages to compile all packages in order. Composite could theoretically enable incremental builds but adds configuration complexity.

#### [Gotcha] Worktree file paths can be confused with project directories; created files in ~/Documents instead of .worktrees (2026-02-13)
- **Situation:** Working in a git worktree for feature development; new files were initially placed in wrong directory hierarchy
- **Root cause:** File paths are relative during development; easy to lose track of working directory in multi-step workflows
- **How to avoid:** Easier: catch with file existence checks. Harder: no programmatic detection; requires developer awareness

#### [Gotcha] ES module configuration required `type: "module"` in package.json AND `"module": "esnext"` in tsconfig.json for proper compilation and import resolution (2026-02-13)
- **Situation:** Converting CommonJS require() patterns to ES import statements for create-protolab package running on Node 18+
- **Root cause:** Node.js requires explicit `type: "module"` declaration to enable `.js` files as ES modules. TypeScript needs matching `module` config to generate correct import statements in compiled output.
- **How to avoid:** ES modules enable tree-shaking and are required for modern Node tooling, but adds configuration complexity. Requires Node 14+ (satisfied by test matrix 18/20/22).

#### [Pattern] Dual exports pattern for packages: main export (.) and server export (./server) to separate client and server-side code (2026-02-13)
- **Problem solved:** LLM providers package needs to expose different APIs for client-side and server-side consumers
- **Why this works:** Allows a single package to serve multiple entry points without circular dependencies or code duplication. Enables tree-shaking and selective imports - consumers only bundle what they need
- **Trade-offs:** Easier: flexible consumption patterns and code organization. Harder: consumers must know which export to use; accidental imports from wrong export possible

### Verification through actual build/test execution rather than just file existence checks (2026-02-13)
- **Context:** Package scaffolding needs to validate the package integrates correctly with monorepo tooling
- **Why:** File existence is insufficient - configuration files could have syntax errors, TypeScript could fail to compile, or workspace integration could be broken. Running actual npm commands validates the entire integration chain
- **Rejected:** JSON schema validation only (wouldn't catch runtime errors); static file checks only (misses configuration issues)
- **Trade-offs:** Easier: catches real integration problems early. Harder: verification tests take more time to run; requires build toolchain to be functional
- **Breaking if changed:** Removing the actual build/test verification step means broken configurations could slip through to CI/CD

#### [Pattern] Placeholder index.ts files with no exports in new packages to establish entry points before implementation (2026-02-13)
- **Problem solved:** Package scaffolding creates the structure before any actual provider code exists
- **Why this works:** Allows workspace to recognize the package and build tools to validate configuration immediately. Prevents 'empty module' errors during build. Creates the contract for what will be exported
- **Trade-offs:** Easier: immediate validation and structure clarity. Harder: requires developers to remember these are placeholders; could add unnecessary import cycles if not careful

### Adding package to workspace build:libs script during scaffolding rather than on-demand before first build (2026-02-13)
- **Context:** Root package.json needs to know about all packages in the monorepo
- **Why:** Prevents the gotcha of forgetting to register the package with the build system, which leads to silent failures where a package exists but never gets built. Catches configuration errors immediately in next build
- **Rejected:** Manual registration later (easy to forget; creates inconsistent developer experience); automatic discovery via directory scanning (too magical, hard to debug)
- **Trade-offs:** Easier: ensures all packages are always built. Harder: requires manual registration step; easy to forget when adding packages manually
- **Breaking if changed:** Removing from build:libs means the package won't be included in build output even if the code exists, leading to missing exports in consuming applications

### Package build chain ordering: observability placed after policy-engine and before git-utils in build:libs script (2026-02-13)
- **Context:** Adding new package to monorepo workspace with existing build chain dependencies
- **Why:** Packages must be built in dependency order - observability only depends on @automaker/types, so it can be placed relatively early. Positioning matters because npm workspace builds can fail if dependencies aren't built first
- **Rejected:** Arbitrary placement or appending to the end without considering dependency tree
- **Trade-offs:** Correct ordering prevents build failures and improves build parallelization efficiency, but requires understanding the full dependency graph
- **Breaking if changed:** Incorrect build order will cause 'module not found' errors at runtime if dependents try to import from packages built after them

#### [Pattern] Multi-level export paths in package.json: both './' and './langfuse' as named exports (2026-02-13)
- **Problem solved:** Observability package needed to support both core observability utilities and Langfuse-specific integration
- **Why this works:** This pattern allows consumers to choose between importing core utilities or the specific Langfuse adapter without requiring separate packages or internal path imports that break bundler optimization
- **Trade-offs:** Requires maintaining explicit export mappings in package.json but enables clean public API and prevents coupling to internal directory structure

### Package structure mirrors existing libs/* packages exactly: tsconfig.json extends base, vitest.config.ts provided, src/ with subdirectories (2026-02-13)
- **Context:** New observability package needed to follow workspace conventions for consistency
- **Why:** Consistency enables tooling assumptions (build scripts, IDE configurations, developer expectations). Following established patterns reduces cognitive load and maintenance burden
- **Rejected:** Simplified structure or deviance from conventions to 'optimize' for early-stage package
- **Trade-offs:** Slight upfront effort to mirror patterns, but prevents future refactoring and ensures all tooling (linters, formatters, build) works identically
- **Breaking if changed:** Deviating from established patterns causes build/test tools to behave unpredictably and creates inconsistency that compounds across the codebase

### Singleton ProviderFactory with explicit resetInstance() method for testing instead of dependency injection (2026-02-13)
- **Context:** Factory needs to be globally accessible but tests require isolation and state reset between test cases
- **Why:** Global singleton eliminates need to thread factory through entire codebase, while resetInstance() provides clean test isolation without mocking frameworks. DI would require plumbing factory through all constructor chains.
- **Rejected:** Dependency injection pattern (more testable but requires constructor changes everywhere); implicit singleton (impossible to reset between tests)
- **Trade-offs:** Easier: global access, less boilerplate. Harder: must remember to reset in tests, creates hidden global state. Tests become dependent on test order if resetInstance() is forgotten.
- **Breaking if changed:** Removing resetInstance() breaks all tests that need provider state isolation. Removing singleton pattern breaks every code path that assumes global factory access.

#### [Pattern] Separation of provider registration (registerProvider) from configuration initialization (initialize) as distinct operations (2026-02-13)
- **Problem solved:** Factory needs to validate config structure separately from loading actual provider instances
- **Why this works:** Config validation happens during initialize() to catch errors early, but provider instances are registered separately. This allows tests to use mock providers without requiring real config or API keys. Also enables runtime provider swapping.
- **Trade-offs:** Easier: test flexibility, runtime provider swapping. Harder: two-step initialization can be forgotten, state can be invalid if only one step completes.

### Created tier-based model abstraction (fast/smart/creative) mapping to specific Claude models (haiku/sonnet/opus) rather than exposing raw model names (2026-02-13)
- **Context:** Needed to provide LLM provider abstraction that works across different provider implementations while maintaining flexibility
- **Why:** Tier system decouples application code from specific model versions. If Claude releases new models, only the default config needs updating, not consumer code. Provides semantic meaning (fast vs smart) that's more stable than version numbers
- **Rejected:** Direct model name exposure (e.g., 'claude-sonnet-4-5') would couple code to specific versions and force updates across codebase when models change
- **Trade-offs:** Adds abstraction layer that increases indirection but provides stability. Requires maintaining tier-to-model mapping in config. Enables provider-agnostic code but limits direct model control
- **Breaking if changed:** Removing tier system would require consumers to know specific model names and manage version updates themselves across the codebase

#### [Pattern] BaseLLMProvider abstract class with getModel(), listAvailableModels(), and healthCheck() as core interface - provider-agnostic contract (2026-02-13)
- **Problem solved:** Need to support multiple LLM providers (Anthropic, OpenAI, etc.) with pluggable implementations
- **Why this works:** Abstract base class provides contract that all providers must fulfill, enabling polymorphic usage. Consumers code against interface, not implementation. New providers can be added without changing consumer code
- **Trade-offs:** Abstract class is more opinionated and harder to evolve without breaking changes, but enables default implementations. Interface is more flexible but requires duplication

### Implemented healthCheck() with dual validation: API key presence AND actual API call validation, returning detailed error context (2026-02-13)
- **Context:** Need to verify provider is correctly configured and functional before allowing use
- **Why:** Two-level validation catches configuration errors (missing key) separately from authentication errors (invalid key), providing distinct error messages for debugging. Latency measurement provides performance baseline
- **Rejected:** Could skip API call and only check key presence, but that misses invalid key errors until runtime. Could skip latency, but baseline performance measurement is useful for diagnostics
- **Trade-offs:** Additional API call in health check adds latency but provides confidence in provider setup. Real environment benefits; test environments can mock
- **Breaking if changed:** Removing API call validation would miss invalid credentials until actual inference attempted. Removing latency measurement loses performance diagnostics

### Default configuration stored in separate `default-config.ts` file rather than inline in provider class or environment variables only (2026-02-13)
- **Context:** Need to manage model-to-tier mappings in a way that's configurable but has sensible defaults
- **Why:** Separation of concerns - config is independent of provider logic. Single source of truth for defaults. Can be easily overridden by environment or runtime config without modifying code. Enables easy updates when new models release
- **Rejected:** Inline defaults couple config to implementation. Env-vars-only approach makes defaults invisible and harder to discover
- **Trade-offs:** Extra file adds minimal complexity but significantly improves maintainability and discoverability. Makes it obvious what models are configured
- **Breaking if changed:** Moving defaults into code makes updates require code changes and redeploys rather than config-only updates

### Implemented LangfuseClient as a wrapper with graceful degradation when SDK is unavailable, rather than requiring SDK presence upfront (2026-02-13)
- **Context:** Need to support offline execution and missing Langfuse credentials without crashing
- **Why:** Allows the observability layer to be optional - the system works with or without Langfuse, and the decision to use it is deferred to runtime (isAvailable() check). This prevents hard dependencies and deployment failures.
- **Rejected:** Direct Langfuse SDK instantiation at module load time would fail fast if credentials missing, forcing hard dependency on Langfuse being configured
- **Trade-offs:** Easier: graceful fallback, optional dependency. Harder: need validation logic in client wrapper, caller must check isAvailable() before using features
- **Breaking if changed:** Removing isAvailable() check would cause crashes when Langfuse unavailable; removing fallback logic would break offline scenarios

#### [Pattern] ExecutionContext passed to executor function includes traceId and generationId for cross-cutting concern propagation without breaking encapsulation (2026-02-13)
- **Problem solved:** Executor function (caller-provided) needs trace context for custom logging/tracking but shouldn't directly depend on Langfuse
- **Why this works:** Passing context as object allows executor to use IDs without coupling to Langfuse SDK. IDs are generated by observability layer but used by application code for correlation.
- **Trade-offs:** Easier: loose coupling, testable. Harder: caller must remember to pass context object, more boilerplate in function signature

### Created self-contained provider abstraction package with local type definitions instead of depending on shared @automaker/types (2026-02-13)
- **Context:** Needed to implement OpenAI and Google providers with consistent interfaces while maintaining type safety across different provider implementations
- **Why:** Prevents circular dependencies and gives the provider package autonomy. Shared types across providers would create tight coupling to a central types package that might not evolve at the same pace as provider implementations
- **Rejected:** Centralize all provider types in @automaker/types - would force all provider packages to depend on a monolithic types package
- **Trade-offs:** Easier: Independent evolution of provider types; packages self-document their contracts. Harder: Type definitions duplicated across packages if multiple packages need to understand provider contracts
- **Breaking if changed:** If external code directly imports types from @automaker/types instead of @automaker/llm-providers, it breaks. Consumer code must import from the provider package itself

#### [Pattern] Used abstract BaseProvider class with concrete provider implementations rather than factory functions or strategy objects (2026-02-13)
- **Problem solved:** Needed consistent interface across OpenAI and Google while supporting health checks, metrics, and model resolution
- **Why this works:** Class-based inheritance provides clearer semantics for 'is-a' relationships (OpenAIProvider IS-A Provider), enables instanceof checks, and makes adding lifecycle hooks (initialize, shutdown) more natural later
- **Trade-offs:** Easier: IDE autocomplete, type checking, adding provider-specific methods. Harder: Slightly more verbose than functional approach, inheritance hierarchy must be carefully designed

### Model definitions include both categorical (fast/balanced/quality/reasoning) AND capability-based (vision, streaming, functionCalling) metadata (2026-02-13)
- **Context:** Needed to support different selection strategies: users might want 'fastest model' OR 'model with vision' OR 'model for reasoning'
- **Why:** Dual metadata allows flexible provider selection without needing to iterate all models with filters. Categories provide semantic meaning (gpt-4o-mini is fastest), capabilities enable precise matching
- **Rejected:** Single flat list with filtering would require iterating all models for each selection criteria
- **Trade-offs:** Easier: Multiple selection strategies at runtime. Harder: Must maintain consistency between categories and capabilities (e.g., ensure reasoning model actually has reasoning capability)
- **Breaking if changed:** If consuming code relies only on categories and ignores capabilities, it might select models lacking required features (e.g., selecting gpt-4o-mini for vision when o1 in reasoning category lacks vision)

### Model alias system in default config allows multiple names to resolve to same model (e.g., 'gpt-4-latest' → 'gpt-4o') (2026-02-13)
- **Context:** Need to support deprecated model names, shortened aliases, and version-agnostic references without duplicating model definitions
- **Why:** Single source of truth for each model definition. Aliases enable backward compatibility and user-friendly shorthand without bloating the model list
- **Rejected:** Duplicate full model definitions for each alias - would violate DRY and make updates harder
- **Trade-offs:** Easier: Backward compatible naming, migration paths. Harder: Must resolve aliases before model lookup, adds indirection layer
- **Breaking if changed:** If code bypasses alias resolution and uses model IDs directly, aliases become invisible. Must validate that all model references go through alias resolution

#### [Gotcha] Provider package has independent tsconfig that might not match root project settings, and successful npm test doesn't guarantee tsc compilation (2026-02-13)
- **Situation:** Tests passed (36/36) but `tsc --project libs/llm-providers/tsconfig.json` showed errors due to missing node_modules dependencies
- **Root cause:** Test runners (vitest) use different resolution than tsc compiler; npm install wasn't fully completed due to Python/node-pty issues, so type resolution failed differently
- **How to avoid:** Easier: Tests run despite missing dependencies. Harder: Can't trust test success as proof of compilation

### Health checks return provider-specific status object with latency and timestamp rather than boolean (2026-02-13)
- **Context:** Need to track provider health over time and understand response characteristics, not just 'up/down'
- **Why:** Rich status object enables monitoring patterns: latency trending, timestamp-based cache invalidation, per-provider SLA tracking. Boolean would lose debugging information
- **Rejected:** Simple boolean would be simpler but useless for real health monitoring
- **Trade-offs:** Easier: Real health monitoring, debugging. Harder: Callers must handle status objects instead of simple booleans
- **Breaking if changed:** If code expects health check to return boolean and checks `if (provider.health())`, it breaks when method returns object (truthy regardless of actual status)

### Created unified BaseProvider interface with provider-specific ExecuteOptions instead of using SDK's native options (messages, maxTokens, temperature) (2026-02-13)
- **Context:** Needed to support heterogeneous providers (Groq API, local Ollama, AWS Bedrock) with different invocation patterns
- **Why:** Each provider has different execution models - Groq uses REST API with prompt-based requests, Ollama uses local HTTP, Bedrock uses AWS SDK. A thin adapter layer mapping to provider-native formats is simpler than forcing a lowest-common-denominator interface
- **Rejected:** Standardizing on SDK ExecuteOptions (messages array, maxTokens, temperature) would require transforming data at execution time for each provider, adding unnecessary complexity
- **Trade-offs:** Added abstraction layer that's easier to extend, but requires provider implementations to handle format conversion themselves. Makes each provider more isolated but adds boilerplate
- **Breaking if changed:** If providers are changed to use native SDK ExecuteOptions, all three implementations would need to add transformation logic, and the BaseProvider interface contract would need renegotiation

#### [Gotcha] InstallationStatus must include `method` field ('cli', 'sdk', 'api') even in error cases, not just success cases (2026-02-13)
- **Situation:** Initial implementations returned InstallationStatus with only `installed` and `error` fields. Tests failed when trying to access `method` property
- **Root cause:** The method field identifies how the provider operates - this is runtime state that's needed even when installation fails, as it determines the code path for execution
- **How to avoid:** Small consistency cost in error responses, but eliminates conditional checks and type guards in consumer code

### ProviderMessage format uses type/subtype/structured content, not simple prompt strings - aligns with upstream SDK expectations rather than provider-native formats (2026-02-13)
- **Context:** Each provider has native message formats (Groq: REST JSON, Ollama: HTTP body, Bedrock: AWS SDK objects). SDK expects ProviderMessage with specific structure
- **Why:** Message format is SDK contract, not provider implementation detail. Using SDK format ensures compatibility with agent runtime and simplifies consumer code that works with multiple providers
- **Rejected:** Allowing each provider to use native message formats would require transformations at consumption time, adding logic to router/dispatcher code
- **Trade-offs:** Provider implementations have extra mapping logic, but consumer code is clean and consistent. Provider-specific message formats are encapsulated
- **Breaking if changed:** If ProviderMessage structure changes in SDK, all three providers need updates. If providers return native formats instead, consumer code becomes provider-aware

#### [Gotcha] ModelDefinition requires both `modelString` (unique identifier) and `description` (user-facing label). Initial implementations only provided one or used inconsistent naming (2026-02-13)
- **Situation:** Models like 'groq-llama-3.1-70b' need both the full model identifier and a readable description for UI/logging
- **Root cause:** Separation allows flexible model naming in code while maintaining readable user descriptions. The modelString is the execution key, description is display text
- **How to avoid:** Small duplication (both fields defined for each model), but clear separation of concerns between code and UI

#### [Pattern] Ollama provider includes getInstalledModels() method to dynamically detect locally-installed models, while Groq and Bedrock use hardcoded model lists (2026-02-13)
- **Problem solved:** Ollama is local-first and user can install arbitrary models. Groq and Bedrock APIs have fixed model catalogs
- **Why this works:** Ollama's value is flexibility - hardcoding models would prevent users from leveraging their custom-installed models. Groq/Bedrock model catalogs are API-defined
- **Trade-offs:** Ollama implementation is more complex (HTTP query to list models) but much more flexible. Groq/Bedrock are simpler but less dynamic

### Examples designed to work WITHOUT API keys by using process.env with optional fallback/mock mode documentation (2026-02-13)
- **Context:** Need for runnable examples that don't require users to configure credentials upfront
- **Why:** Lowers barrier to entry - users can explore API surface and learn patterns before investing in key setup. Demonstrates that library has graceful degradation.
- **Rejected:** Hardcoding dummy keys or requiring mandatory .env.example setup would require additional setup steps and could leak secrets if mishandled
- **Trade-offs:** Examples show error handling paths more than successful API calls. Users need to add keys themselves for full integration testing.
- **Breaking if changed:** If examples relied on actual API calls, they would fail in CI/CD or cold environments, making documentation unusable as reference material

### Split documentation into README (entry point), configuration.md (setup guide), and api-reference.md (complete reference) (2026-02-13)
- **Context:** Need to serve multiple audiences: quick-start users, configuration specialists, and API developers
- **Why:** README stays concise and focuses on value proposition. Configuration guide consolidates all provider-specific setup in one place. API reference enables IDE-assisted development and reduces context-switching.
- **Rejected:** Single mega-document would be overwhelming. Per-provider separate docs would be scattered and hard to maintain.
- **Trade-offs:** More files to maintain but each serves a clear purpose. Some information (like method signatures) appears in multiple places for context completeness.
- **Breaking if changed:** If merged into single file, discoverability suffers - users won't know configuration options exist until they've read entire API reference

### Health-checks example demonstrates failover and monitoring patterns, not just basic usage (2026-02-13)
- **Context:** Second example should show advanced patterns for production use, not just hello-world
- **Why:** Production deployments need reliability patterns. Showing these in examples means developers learn resilience from the start rather than bolting it on later.
- **Rejected:** Second example as basic CRUD pattern would duplicate basics and not add value for production usage
- **Trade-offs:** More complex example is harder for beginners but models correct production practices. Beginners still have basic-usage.ts as gentler entry point.
- **Breaking if changed:** Without health-check patterns in docs, developers write services without monitoring/failover, leading to cascading failures in production

### Implemented separate cache layer on top of Langfuse's built-in 60s caching rather than replacing it (2026-02-13)
- **Context:** Langfuse client already provides 60s request caching; decision needed on whether to replace or extend
- **Why:** Layered caching allows longer-term caching (5min default, configurable) for frequently accessed prompts while leveraging Langfuse's fast path for recent requests. Avoids reimplementing HTTP caching logic.
- **Rejected:** Direct replacement of Langfuse's cache would require understanding their internal caching implementation and managing HTTP response details
- **Trade-offs:** Simpler integration but slightly more memory overhead from dual caching layers. Better separation of concerns.
- **Breaking if changed:** If Langfuse removes or disables their internal cache, this system still works but loses the performance benefit of their fast path

#### [Pattern] Parallel prefetching of multiple prompts with aggregated error reporting instead of fail-fast (2026-02-13)
- **Problem solved:** Need to validate all required prompts exist at startup before allowing service to handle requests
- **Why this works:** Parallel fetching reduces startup time and aggregated errors show all failures at once, helping operators fix all missing prompts in one deploy rather than discovering them iteratively. Better UX than failing on first error.
- **Trade-offs:** Slightly more complex error handling but significantly better developer experience during startup failures

#### [Gotcha] TTL-based expiration requires explicit cleanup() call - items aren't automatically removed from cache at expiration time (2026-02-13)
- **Situation:** Cache stores expiration timestamps but memory isn't freed until cleanup() is called or item is accessed
- **Root cause:** Lazy expiration is more efficient than background timers. Prevents memory leaks by allowing cleanup to be called periodically (e.g., via cron or event). Accessing expired item triggers removal.
- **How to avoid:** Slightly more operational logic needed but avoids background threads and keeps hot path fast. Memory eventually frees.

### Delegate tracing implementation to existing middleware (wrapProviderWithTracing) in @automaker/observability rather than implementing tracing logic directly in TracedProvider (2026-02-13)
- **Context:** TracedProvider needed to wrap LLM providers with tracing, but observability package already contained comprehensive middleware handling token extraction, cost calculation, and Langfuse trace creation
- **Why:** Avoids duplication, maintains single source of truth for tracing logic, leverages existing tested middleware. TracedProvider becomes a thin adapter layer.
- **Rejected:** Implementing tracing logic directly in TracedProvider would duplicate middleware logic and create maintenance burden
- **Trade-offs:** Simple TracedProvider code (easier to maintain) vs potential coupling to observability package's middleware contract
- **Breaking if changed:** If middleware interface changes (token extraction, cost calculation), TracedProvider adapter must be updated. Removal of middleware breaks tracing entirely.

#### [Pattern] Decorator pattern with configuration object (TracingConfig) passed to wrapper, keeping tracing concerns orthogonal to provider implementation (2026-02-13)
- **Problem solved:** Multiple providers needed tracing capability without modifying their core logic or creating separate tracing-specific subclasses for each provider type
- **Why this works:** Decorator pattern allows composing behavior (tracing) with any provider transparently. Config object allows enabling/disabling tracing and passing context without changing provider API.
- **Trade-offs:** Extra wrapper object overhead vs clean separation of concerns. TracedProvider always wraps, even when tracing disabled - could optimize with conditional wrapping.

### Tracing disabled by default with explicit opt-in via ProviderFactory.configureTracing(), not enabled automatically (2026-02-13)
- **Context:** Feature adds tracing infrastructure that affects all provider invocations, but not all deployments/configurations need tracing overhead
- **Why:** Disabled-by-default is safer for production: no performance impact unless explicitly enabled. Requires conscious decision to enable tracing. Reduces risk of accidental telemetry.
- **Rejected:** Auto-enabled tracing would simplify for users who want it but inflict performance cost on those who don't. Harder to discover that tracing exists.
- **Trade-offs:** Users must explicitly configure to get tracing (slight friction) vs guaranteed no overhead for non-tracing workloads
- **Breaking if changed:** If tracing becomes enabled-by-default, all provider invocations will create Langfuse traces and incur potential network/performance cost. Existing code not expecting traces may fail.

### Used strategic `any` types in builder return types while maintaining type safety in user-facing APIs (2026-02-13)
- **Context:** LangGraph's recursive conditional types exceeded TypeScript's type depth limits during compilation, causing build failures
- **Why:** LangGraph's internal type system is too complex for direct exposure. A wrapper layer with simplified types provides better DX while internal implementation uses pragmatic `any` to avoid type depth explosions. Tests verify runtime correctness.
- **Rejected:** Attempting full type safety with LangGraph's native types would require deep type gymnastics or type narrowing that wouldn't improve actual runtime safety. Fully exposing LangGraph types would burden users with complexity.
- **Trade-offs:** Lost some compile-time type checking on builder return values, but gained: cleaner API surface, faster compilation, better IDE experience. Runtime behavior is verified by 42 unit tests.
- **Breaking if changed:** If removed, users get better types but build fails. If we tried to fully type LangGraph internals, consumers get worse DX and potential type depth errors in their codebases.

### Implemented deep merge strategy (`deepMergeState`) for complex nested state rather than shallow merge, with optional timestamp tracking (2026-02-13)
- **Context:** File reducer and todo reducer needed to merge state updates without overwriting sibling properties. Simple object spread would lose data.
- **Why:** Deep merge enables safe composition of multiple state fields being updated independently. Timestamp support allows tracking when last merge occurred, enabling optimistic conflict resolution.
- **Rejected:** Shallow merge (spread operator) loses data when multiple fields update simultaneously. Manual per-field merging would be error-prone and not scalable.
- **Trade-offs:** Deep merge is slightly slower for very large objects, but prevents data loss. Timestamp adds minimal overhead but enables audit trails.
- **Breaking if changed:** Without deep merge, concurrent updates to different state fields would cause one to overwrite the other. This is especially critical in multi-agent patterns.

### Used Annotation.Root API for state definition instead of plain TypeScript interfaces (2026-02-13)
- **Context:** LangGraph's StateGraph requires state type definition for proper type inference and validation across the graph
- **Why:** Modern LangGraph versions moved away from plain interfaces to Annotation API to enable runtime state validation, serialization, and type-safe state updates across distributed checkpoints
- **Rejected:** Plain TypeScript interface - would compile but lose runtime validation and checkpoint interoperability
- **Trade-offs:** More boilerplate (Annotation.Root wrapper) but gains type safety at compile time and runtime validation at checkpoint boundaries. State becomes self-documenting.
- **Breaking if changed:** Removing Annotation would lose checkpoint serialization capability and state validation at node boundaries, breaking resume functionality

#### [Pattern] MemorySaver checkpointer with configurable thread_id for each execution invocation (2026-02-13)
- **Problem solved:** Need to persist state across node execution and enable resuming from checkpoints in production workflows
- **Why this works:** Thread isolation (unique thread_id per execution) prevents state collision across concurrent executions and enables checkpoint isolation. MemorySaver trades persistence durability for simplicity in proof-of-concept.
- **Trade-offs:** MemorySaver is in-process only (survives function lifetime but not process restart). Production would need PostgresSaver or similar. Current approach suitable for stateless function deployments with retry capability.

### Created dedicated @automaker/flows package rather than adding graph to existing packages (2026-02-13)
- **Context:** Need to manage LangGraph dependency without forcing it on all consumers of core packages
- **Why:** Monorepo architecture benefits: LangGraph is optional infrastructure (PoC), not core domain. Separate package allows selective adoption. LangGraph version bumps don't affect @automaker/platform stability.
- **Rejected:** Adding to @automaker/platform - would make LangGraph a transitive dependency for all consumers, increases coupling, makes replacement harder if better framework emerges.
- **Trade-offs:** Added package management complexity (new tsconfig, vitest config, build script) but isolated dependency risk and allowed independent iteration on flows without coordinating with platform release cycle.
- **Breaking if changed:** Merging flows back into platform would expose LangGraph dependency to all consumers and make it harder to swap flow engines later. Separation provides architectural optionality.

### MemorySaver checkpointer is REQUIRED for interrupt functionality in LangGraph, not optional (2026-02-13)
- **Context:** Initial implementation failed with 'No checkpointer set' error when attempting to use interrupts without explicitly configuring state persistence
- **Why:** LangGraph's interrupt mechanism depends on persisting state between execution pauses. Without a checkpointer, the graph cannot serialize and restore execution context when resuming from an interrupt point
- **Rejected:** Assuming interrupts work on any compiled graph without checkpointer configuration - this assumption caused test failures
- **Trade-offs:** Adds MemorySaver dependency and slight overhead for state serialization, but enables critical pause/resume functionality that human-in-the-loop workflows require
- **Breaking if changed:** Remove checkpointer → interrupts silently fail or throw errors; state cannot be persisted across pause boundaries

#### [Pattern] interruptBefore pattern as semantic interrupt marker - pause BEFORE a node rather than waiting for completion (2026-02-13)
- **Problem solved:** Human review needs to happen BEFORE the decision node executes, not after, to prevent unintended state transitions
- **Why this works:** interruptBefore allows the system to halt before executing the human_review node, giving the human the opportunity to inspect and modify state before any review logic executes. This is safer than interrupting after node completion
- **Trade-offs:** interruptBefore is more explicit about control flow but requires careful node sequencing; interruptAfter is simpler but loses ability to modify state before review

### Conditional edges based on state values enable dynamic routing without requiring separate graph branches or multiple resumable states (2026-02-13)
- **Context:** Review flow needs to route to either END (approval) or revise (rejection) based on human decision without creating separate graph execution paths
- **Why:** Conditional routing via state inspection keeps the graph topology flat and simple while still supporting multiple execution paths. The same node (human_review) can branch based on what the human decides
- **Rejected:** Creating separate conditional nodes or branching earlier - would complicate the graph and require duplicating logic
- **Trade-offs:** Makes the graph more dynamic but state must be correctly set before the condition is evaluated; condition failures are harder to debug than explicit node branches
- **Breaking if changed:** Remove conditional edge logic → all paths execute regardless of approval state, defeating the purpose of the review

#### [Pattern] Modular node architecture with separate files for each node type (draft, revise) enables testing and reuse of individual steps (2026-02-13)
- **Problem solved:** Complex multi-step flow needed clean separation between initial content generation and feedback application
- **Why this works:** Separate node modules allow testing each transformation independently and enable reuse of nodes in different graphs. Makes the review cycle logic testable in isolation
- **Trade-offs:** More files to maintain but significantly better testability and composability; nodes can be combined differently in future workflows

#### [Pattern] Fallback-first design for SDK examples - all examples work without external service credentials (2026-02-13)
- **Problem solved:** Observability examples need to be functional for developers who haven't set up Langfuse accounts yet
- **Why this works:** Reduces friction in developer onboarding. Developers can learn the API immediately without credential setup delays. Fallback mode is a no-op, making it safe and transparent.
- **Trade-offs:** Client must implement silent no-op behavior for all methods (easier for DX, requires more implementation complexity in SDK), but enables developers to write real code immediately

### Multiple focused examples (prompt-management.ts and tracing.ts) instead of single monolithic example (2026-02-13)
- **Context:** Need to demonstrate both prompt lifecycle management and tracing/scoring capabilities
- **Why:** Separate examples allow developers to focus on specific use cases. Mixing concerns makes examples harder to understand and copy-paste into real code. Each file is independently runnable.
- **Rejected:** Single large example would be harder to navigate and harder to extract patterns for specific use cases
- **Trade-offs:** More files to maintain (easier to understand, harder to keep in sync), clearer separation of concerns (easier learning curve)
- **Breaking if changed:** If examples are merged into one file, developers lose the ability to isolate and understand individual patterns. Copy-paste usability drops significantly.

#### [Gotcha] Observability package needed explicit addition to build:libs script in package.json despite being in workspace (2026-02-13)
- **Situation:** Package was built individually but wasn't included in the monorepo's standard build pipeline
- **Root cause:** The build:libs script is a curated list of packages to build in order. Just being in the workspace isn't enough - the orchestration script must explicitly reference it.
- **How to avoid:** Explicit inclusion requires maintenance (must remember to add new packages, but provides control over build order and dependencies). Auto-discovery would be easier but less flexible.

### Implemented FakeProvider as self-contained without @langchain/core dependency despite initial assumption it would be needed (2026-02-13)
- **Context:** Feature required test provider with streaming support. Initial approach assumed LangChain FakeChatModel would be required based on feature title.
- **Why:** Avoided adding external dependency when provider abstraction layer already supports all needed functionality (AsyncGenerator streaming, message formatting, factory registration). Self-contained implementation reduces build complexity and dependency management overhead.
- **Rejected:** @langchain/core integration - would add unnecessary external dependency for functionality that can be achieved with existing abstractions
- **Trade-offs:** Slightly more code to write custom message handling (236 lines) but gains independence from LangChain, easier to maintain, no version conflicts with other packages
- **Breaking if changed:** If provider abstraction changes, self-contained impl fails. If we add @langchain/core later, this code becomes redundant.

#### [Pattern] Factory pattern with explicit provider registration via imports + automatic model string detection for routing (2026-02-13)
- **Problem solved:** System routes model requests to providers. FakeProvider registers at priority 20, responds to 'fake-*' model strings.
- **Why this works:** Two-level routing (explicit registration + pattern matching) allows flexibility: explicit registration with priority for named models, pattern matching for wildcards. Provider is opt-in but doesn't require special configuration.
- **Trade-offs:** Pattern matching adds slight routing overhead (string prefix check) but enables zero-config provider activation. Priority system ensures correct provider selected when multiple match.

### Provider supports both single response and response array with auto-cycling for multi-turn conversations (2026-02-13)
- **Context:** FakeProvider needed to support both simple test cases (single response) and multi-turn agent flows (multiple sequential responses).
- **Why:** Cycling through array of responses enables testing multi-turn scenarios without complex state management. Single response shorthand keeps API simple for basic tests.
- **Rejected:** Only support array - simpler API but less convenient for single-response tests. Only support single - can't test multi-turn flows.
- **Trade-offs:** Constructor must handle both cases (adds ~20 lines of type handling). Benefit is provider works for both simple unit tests and complex integration scenarios without modification.
- **Breaking if changed:** If response array cycling is removed, multi-turn test scenarios fail. If single-response shorthand removed, existing tests using that pattern break.