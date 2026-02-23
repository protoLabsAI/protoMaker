---
tags: [architecture]
summary: architecture implementation decisions and patterns
relevantTo: [architecture]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 22
  referenced: 13
  successfulFeatures: 13
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

### Defined ContentCreationConfig type locally in service file instead of importing from flows package (2026-02-14)
- **Context:** ContentConfig interface existed in flows package but wasn't exported; attempted to re-export as ContentCreationFlowConfig but service couldn't access it across workspace boundaries
- **Why:** Type re-exports across workspace package boundaries require proper package.json exports configuration. Defining locally avoids circular dependency risks and packaging configuration complexity
- **Rejected:** Importing from @automaker/flows - would require modifying package exports and handling potential circular dependencies when service imports from flows which may import types
- **Trade-offs:** Easier: Avoids packaging configuration. Harder: Type duplication between service and flow definition - future changes require updating both locations
- **Breaking if changed:** If ContentConfig interface changes in the flow, the service won't automatically update and will silently accept outdated config shapes

#### [Pattern] MCP tools implemented as markdown documentation files in commands/ directory with tool definitions and handlers in central index.ts (2026-02-14)
- **Problem solved:** Need to expose 5 content flow operations via MCP protocol alongside existing server REST APIs
- **Why this works:** Centralizes tool schema definitions and request routing (switch statement on tool names). Markdown docs serve dual purpose as documentation and source of truth for tool capabilities. Separates concerns: docs define interface, index.ts handles registration and dispatch
- **Trade-offs:** Easier: Single source of truth for tools, clear overview of all capabilities. Harder: index.ts becomes large as more tools added, requires framework to understand this pattern

### HITL gates implemented as interrupt points that pause flow execution, requiring explicit resume with review decision state (2026-02-14)
- **Context:** Content creation needs human review at research (20%), outline (40%), and final review (80%) stages before proceeding
- **Why:** LangGraph's interruptBefore() mechanism provides clean pause/resume semantics with full state persistence via checkpointer. Review decision becomes part of state graph instead of separate callback
- **Rejected:** Callback-based review where human feedback doesn't update graph state - creates race conditions and makes resumption unreliable
- **Trade-offs:** Easier: State consistency, clean resumption, full audit trail in checkpointer. Harder: Client must explicitly resume with decision, adds round-trip latency
- **Breaking if changed:** If checkpointer is removed, no resumption capability and flow state is lost on interrupt. If interruptBefore removed, gates become no-ops and flow proceeds without human input

#### [Gotcha] Workspace imports must use published package names (@automaker/*) not relative paths to source files (2026-02-14)
- **Situation:** Attempted to import flow creation function and types from source files in flows library using relative paths, resulting in type resolution failures
- **Root cause:** Monorepo tooling (likely turborepo/nx) compiles workspace packages and expects consumers to import from published exports defined in package.json#exports, not from source directories directly
- **How to avoid:** Easier: Guarantees consumers always use built package. Harder: Can't directly debug source, requires build step between code changes and testing

### Structured documentation around explicit 9-section framework (Architecture Overview, Content Types, Config Reference, Blog Strategy, A/B Testing, Examples, Prompts, Tracing, Testing) rather than narrative prose (2026-02-14)
- **Context:** Content creation pipeline is complex with many decision points (which content type, what config, how to trace), and developers need different information for different tasks (implementation vs configuration vs debugging)
- **Why:** Section-based organization allows developers to navigate to their specific need without reading entire guide. The explicit sections become checklist items for completeness. Discovered concepts like '8-dimension antagonistic review scoring' need dedicated real estate to explain properly
- **Rejected:** Single narrative flow would be easier to write but creates discovery problem - developer implementing new content type wouldn't naturally find the ContentConfig Reference section nested in prose
- **Trade-offs:** Requires more upfront structure/planning but makes documentation vastly more navigable. Slight redundancy between sections (e.g., BlogPost appears in both Content Types and Usage Examples) improves standalone readability of each section
- **Breaking if changed:** If sections were removed or reordered, developers would lose the mental model of 'which section answers my question type' and would need to search/skim entire document

### Leveraged VitePress auto-sidebar generation (`generateSidebar()`) rather than manually configuring documentation file in nav config (2026-02-14)
- **Context:** Documentation files in `docs/dev/` directory need to appear in sidebar navigation automatically as new files are added
- **Why:** Auto-discovery pattern removes the need for documentation PRs to also update configuration, reducing merge conflicts and cognitive load. New developers adding docs won't forget to register the file in nav config
- **Rejected:** Manual config entry would require changing `.vitepress/config.mts` for each documentation addition, creating friction and easy-to-miss step
- **Trade-offs:** Auto-generation requires following file naming conventions (kebab-case) and directory structure strictly. One misnamed file silently doesn't appear in nav
- **Breaking if changed:** If auto-generation is removed and config must be maintained manually, documentation maintenance becomes distributed responsibility between multiple files, increasing entropy

### Tier 0 templates are immutable system-level constructs that cannot be overwritten or unregistered via API, creating a protected namespace for core agent types (2026-02-14)
- **Context:** Cindi was registered as tier 0 (protected) despite being a specialized agent, not a foundational system agent
- **Why:** Protects core agent infrastructure from accidental modification or user-driven registry pollution. Tier 0 agents represent canonical implementations that should remain stable across deployments
- **Rejected:** Making Cindi tier 1+ (user-modifiable) - would allow registry pollution and inconsistent behavior across instances
- **Trade-offs:** Prevents customization at the cost of ensuring consistency. Trade-off favors stability and predictability for system agents over flexibility
- **Breaking if changed:** Removing tier-based protection would require redesigning the role registry's override/extend mechanism and could introduce conflicting template definitions

#### [Pattern] Agent templates require role registration in KNOWN_ROLES before template definition can be validated, enforcing type safety through compile-time constraints (2026-02-14)
- **Problem solved:** The 'content-writer' role had to be added to KNOWN_ROLES in types package before being usable in the template definition
- **Why this works:** Creates a single source of truth for valid role identifiers and ensures TypeScript type checking catches invalid role references at compile time, not runtime
- **Trade-offs:** Requires two-step registration (types first, then implementation) but prevents entire categories of type errors and enables IDE autocomplete

### System prompts are philosophy-first rather than instruction-first, establishing principles (antagonistic review, SEO-awareness) over procedural steps (2026-02-14)
- **Context:** Cindi's system prompt emphasizes 'Content Writing Specialist' identity and review methodology rather than listing exact tasks
- **Why:** Allows the LLM to derive specific tasks from core principles, making behavior composable with different content pipeline flows without rewriting prompts. Supports goal-oriented reasoning rather than rigid procedures
- **Rejected:** Task-list prompts (Write X, then review Y, then export Z) - would be tightly coupled to one pipeline flow and require new prompts for each use case
- **Trade-offs:** Requires more sophisticated prompt engineering upfront but enables flexible composition. LLM has to derive tasks from principles rather than following explicit steps
- **Breaking if changed:** Removing principle-based framing would require separate prompts for each content pipeline flow, creating maintenance overhead

#### [Pattern] Agent template ordering in built-in registry is semantically organized (content-related roles grouped together) rather than alphabetical, making the codebase more maintainable for developers (2026-02-14)
- **Problem solved:** Cindi (content-writer) was placed before Jon (gtm-specialist) despite alphabetical ordering, grouping content-focused roles
- **Why this works:** Developers scanning the template list can understand agent families at a glance. Semantic grouping creates discoverable patterns that reduce cognitive load when adding related agents
- **Trade-offs:** Slight lookup penalty (linear search still O(n)) but significantly better readability and onboarding experience. Most lookups use get() with caching anyway

### Applied HTML entity unescaping at the extraction layer rather than at consumption points (2026-02-14)
- **Context:** LLM outputs contain HTML entities (&lt;, &gt;, &amp;, etc.) in code blocks instead of raw characters. Parser functions extract these entities verbatim.
- **Why:** Centralizing normalization at extraction time (single point) prevents duplicate unescaping logic across all callers. Helper functions like extractRequiredTag and extractOptionalTag automatically inherit the fix through function composition.
- **Rejected:** Alternative: Unescape at each consumption point (caller responsibility). This would require changes in multiple files and risk inconsistent handling.
- **Trade-offs:** Easier: single fix point, automatic propagation to all extraction variants. Harder: consuming code loses visibility that normalization happened; potential issue if future code needs raw entities.
- **Breaking if changed:** If removed, code blocks with angle brackets fail parsing (e.g., TypeScript generics become corrupted: 'Map&lt;string, number&gt;' instead of 'Map<string, number>').

#### [Pattern] Delegating to unescapeHtmlEntities() helper function rather than inline regex replacement (2026-02-14)
- **Problem solved:** Multiple HTML entities need conversion (&lt; &gt; &amp; &quot; &#39;) across multiple extraction functions.
- **Why this works:** Encapsulation allows single-point maintenance of entity mapping. If new entities appear in LLM outputs, only one function updates. Testability: function can be tested independently.
- **Trade-offs:** Easier: centralized entity definitions, single test suite for unescaping. Harder: extra function call overhead (negligible), indirection requires reading two functions to understand behavior.

#### [Gotcha] LangGraph Annotation.Root does not support default value syntax like `Annotation<number>({ default: () => 0 })`. Defaults must be provided at node invocation time via initial state in executeAntagonisticReviewer(). (2026-02-14)
- **Situation:** Attempted to set default values on Annotation fields during type definition, which compiled but failed at runtime.
- **Root cause:** LangGraph's Annotation API is designed for explicit state management - defaults are a runtime concern, not a type definition concern. This prevents implicit state mutations and makes data flow explicit.
- **How to avoid:** More verbose invocation code but clearer state initialization semantics. Caller must always provide initial values, preventing silent bugs from missing state.

### Designed subgraph with dual execution modes: standalone via executeAntagonisticReviewer() and composable via wrapSubgraph() for embedding in larger flows. (2026-02-14)
- **Context:** Needed a primitive that could be reused both independently and as part of multi-step workflows.
- **Why:** Subgraphs in LangGraph are composable units, but direct instantiation has different calling conventions than wrapped versions. Providing both patterns maximizes reusability without forcing callers into one pattern.
- **Rejected:** Single execution function only, or requiring wrapper code in every usage
- **Trade-offs:** Slightly more code complexity in the module, but eliminates boilerplate for common use cases. executeAntagonisticReviewer() handles the mechanical setup that wrapSubgraph() would force on every caller.
- **Breaking if changed:** Removing executeAntagonisticReviewer() would require all callers to use wrapSubgraph() and manage state/invoke mechanics manually.

### Implemented weighted scoring formula that converts 1-10 dimension scores to 0-100 overall score: `((score - 1) / 9) * 100`. Scores are clamped to 1-10 range before calculation. (2026-02-14)
- **Context:** Needed to aggregate multiple dimension scores into single 0-100 overall score with respect for configured weights.
- **Why:** 1-10 scale is natural for human-intuitive scoring, but 0-100 scale is standard for overall percentages. The formula (score-1)/9 properly maps [1,10] to [0,100]. Clamping prevents out-of-range values from skewing results.
- **Rejected:** Simple average without weighting, or direct conversion without clamping
- **Trade-offs:** Adds math complexity but enables per-dimension weight tuning and handles edge cases gracefully. Prevents single bad score from dominating overall result when properly weighted.
- **Breaking if changed:** Changing the formula (e.g., to (score/10)*100) would shift score distribution and likely break threshold logic (75% cutoff) that depends on calibration.

#### [Pattern] Used XML output format with specific tag structure for LLM parsing (dimension reasoning in `<reasoning>` tags, scores as `<score>` attributes) combined with custom extractors (extractClampedInt, extractRequiredEnum). (2026-02-14)
- **Problem solved:** Needed reliable extraction of structured data from LLM outputs without requiring JSON mode (which may not be available in all models).
- **Why this works:** XML is more robust for partial/malformed responses than JSON (XML parsers can recover from some corruption). Custom extractors provide validation and type coercion in one step. Existing xml-parser.ts utilities reduce implementation burden.
- **Trade-offs:** XML is more verbose than JSON and requires custom extraction logic, but the clamping and type coercion in extractors is safer than post-hoc validation. Reduces likelihood of type mismatches reaching application logic.

### Implemented retry loop with configurable maxRetries (default 2) and revision tracking. Verdict is FAIL only after exhausting retries, not on first REVISE. (2026-02-14)
- **Context:** Wanted multi-turn revision capability for content that initially doesn't meet passing threshold.
- **Why:** Single-pass critique doesn't match real review workflows where content can be revised. Configurable retries allow callers to control cost/quality tradeoff. Default of 2 provides one revision attempt without excessive iterations.
- **Rejected:** Single-pass verdict with just PASS/FAIL, or unlimited revisions
- **Trade-offs:** Adds loop complexity and LLM call costs, but aligns with human review patterns. Retry limit prevents infinite loops on difficult-to-satisfy content.
- **Breaking if changed:** Removing retry logic would require upstream systems to handle multi-turn revision themselves, losing the critique-improve pattern entirely.

### Separated 'smart model' (full detailed reviews) and 'fast model' (structural checks) with different model assignments: sonnet for smart, haiku for fast. (2026-02-14)
- **Context:** Needed to balance review quality and cost, and allow tuning of expensive vs cheap LLM calls.
- **Why:** Haiku is significantly cheaper for routine checks, sonnet provides better reasoning for complex evaluations. Allowing configurable model selection enables per-use-case cost optimization without code changes.
- **Rejected:** Single model for all calls, or no model configuration
- **Trade-offs:** Adds configuration complexity but dramatically reduces costs for high-volume use. Two-model pattern requires explicit selection logic in the prompt/invoke code.
- **Breaking if changed:** Removing model configurability would lock callers into one cost/quality point, preventing optimization for their specific use case.

#### [Pattern] Model fallback chain (smartModel → fastModel) for graceful degradation in LLM-dependent nodes (2026-02-14)
- **Problem solved:** factCheckerNode needs to make LLM calls but must work even if models unavailable or fail
- **Why this works:** Prevents pipeline failure when API unavailable. Fast model provides degraded but working service. This pattern scales to supporting offline/batch processing.
- **Trade-offs:** Slightly more complex state management vs robust production reliability. False negatives (missing some checks) better than false positives (blocking valid content)

### Heuristic fallback function maintains original stub logic as escape hatch when LLM fails (2026-02-14)
- **Context:** LLM calls can fail, timeout, or hit rate limits in production. Need baseline fact-checking that always works.
- **Why:** Heuristics are deterministic, fast, and never fail. Rule-based checks (missing citations, unsourced numbers) work without external dependencies. Keeps system functional during LLM outages.
- **Rejected:** Removing heuristics entirely - would create hard dependency on LLM availability. Relying only on LLM - no protection against API failures.
- **Trade-offs:** Heuristics less sophisticated than LLM but provide 80/20 coverage. More code to maintain but critical for resilience.
- **Breaking if changed:** Removing heuristic fallback creates silent quality degradation - missing checks become invisible to users since no error is raised

#### [Pattern] Cross-referencing state.researchFindings in fact-checker provides continuity between review nodes (2026-02-14)
- **Problem solved:** factCheckerNode receives researchFindings from prior research-worker node. Needs context about what's already been verified.
- **Why this works:** Avoids duplicate fact-checking work and allows checker to focus on claims not already covered. State threading creates natural pipeline dependency without explicit coordination.
- **Trade-offs:** Requires state flow coordination but enables smarter, focused checking. More implicit dependencies in pipeline.

#### [Pattern] Reviewer field hardcoding ('FactChecker') creates audit trail of which node produced finding (2026-02-14)
- **Problem solved:** ReviewFinding objects need attribution. Different nodes (researcher, fact-checker, etc.) produce findings.
- **Why this works:** Hardcoding reviewer name prevents accidental misattribution and makes debug logs clear. Audit trail is important for user trust and debugging.
- **Trade-offs:** Simple hardcoding vs flexibility. Less flexible but clearer, less error-prone.

#### [Pattern] Quality metrics calculated per-section (section: score pairs) rather than document-level only (2026-02-14)
- **Problem solved:** Need insight into which parts of generated content are problematic vs which are good
- **Why this works:** Section-level scores enable targeted debugging and prompt optimization. If only document average exists and it's 65%, you don't know if 3 sections are 30% and 1 is 95% (fixable) or all 4 are 65% (pervasive issue). Section scores guide which parts need regeneration.
- **Trade-offs:** Gained: Granular debugging, targeted regenration, understanding of quality distribution. Lost: More data to track, more complexity in visualization.

### Documentation uses auto-generated sidebar via VitePress config instead of manual sidebar entries (2026-02-14)
- **Context:** Adding new documentation file to docs/dev/ directory needed to appear in sidebar navigation
- **Why:** VitePress config uses generateSidebar() function that auto-discovers .md files, extracts H1 titles, and sorts alphabetically. Eliminates manual sidebar maintenance and keeps navigation DRY
- **Rejected:** Manual sidebar entry in config file - would require config changes for every new doc
- **Trade-offs:** Easier: add doc → appears automatically. Harder: sidebar order is alphabetical only, can't customize order without refactoring generateSidebar logic
- **Breaking if changed:** Removing the auto-generation would require manually updating sidebar config for every documentation file, creating maintenance burden

#### [Pattern] Documenting external pattern references (STORM, CrewAI, Constitutional AI) establishes conceptual foundation rather than reinventing terminology (2026-02-14)
- **Problem solved:** Antagonistic review pattern combines multiple established techniques; need to explain how they interact
- **Why this works:** Readers familiar with these patterns immediately understand the antagonistic review approach; avoids explaining Constitutional AI from first principles. Creates conceptual bridges to existing knowledge
- **Trade-offs:** Easier: dense information transfer for experienced readers. Harder: less accessible for readers unfamiliar with referenced patterns

### Shifted content pipeline from HITL gates at 3 checkpoints to autonomous operation with antagonistic review as primary quality control (2026-02-14)
- **Context:** Original design required human approval at multiple gates; new design runs fully autonomous by default with automatic scoring
- **Why:** Enables high-volume content generation without human bottlenecks while maintaining quality through automated antagonistic review (8-dimension scoring). HITL becomes optional overlay for high-stakes content only
- **Rejected:** Keeping mandatory HITL gates would limit throughput; purely autonomous without review risks quality degradation
- **Trade-offs:** Gained: scalability, throughput; Lost: guaranteed human oversight by default; Mitigation: aggressive antagonistic review criteria and optional HITL for critical content
- **Breaking if changed:** Systems depending on human approval gates at specific pipeline stages would break; must be refactored to use optional checkpointer/interruptBefore pattern

#### [Pattern] HITL overlay implemented via optional MemorySaver checkpointer with interruptBefore=['final_review'] pattern, allowing state resumption after human intervention (2026-02-14)
- **Problem solved:** Need to support both autonomous mode and optional human-in-loop without complex mode switching
- **Why this works:** LangGraph's checkpointer + interruptBefore provides clean state management without requiring separate code paths; threadId enables resumption from exact interrupt point
- **Trade-offs:** Gained: clean separation of concerns, optional feature; Lost: requires explicit checkpointer setup, adds state management complexity

### Two-phase dependency sync: individual feature sync on creation + batch project sync on scaffolding (2026-02-14)
- **Context:** Need to sync feature dependencies to Linear issue relations, but dependencies may reference features not yet synced
- **Why:** Individual sync handles dependencies discovered incrementally; batch sync during scaffolding catches all project dependencies in one operation to avoid incomplete relation graphs
- **Rejected:** Single sync point (either on feature creation only or scaffolding only) - would miss dependencies if features are created after scaffolding or skip individual feature dependency creation
- **Trade-offs:** More complex event handling but more robust coverage; trades simplicity for completeness
- **Breaking if changed:** Removing either sync point leaves dependency graphs incomplete - individual features won't sync inline dependencies, project scaffolding won't catch batch updates

#### [Pattern] Filtering at load time (feature features that have linearIssueId AND dependencies AND match projectSlug) before iteration (2026-02-14)
- **Problem solved:** Batch dependency sync during project scaffolding needs to only process relevant features
- **Why this works:** Reduces unnecessary iterations and sync attempts; clearly documents preconditions for successful relation creation; avoids null-pointer like issues
- **Trade-offs:** More declarative but requires loading all features into memory first; scales with project size

#### [Pattern] Non-fatal error handling for dependency sync allows graceful degradation where relation sync failures don't block other field syncs (status, title, priority) (2026-02-14)
- **Problem solved:** When syncing Linear issue updates to Automaker, multiple fields need to be synced. If relation fetching fails, the entire sync could fail.
- **Why this works:** Dependency relations are a secondary concern compared to critical fields like status. Wrapping in try-catch with warning log preserves atomicity of core field updates while allowing partial failures.
- **Trade-offs:** Easier: Robust handling of API transients. Harder: Silently incomplete syncs if relation fetch fails (mitigated by warning logs).

#### [Pattern] Batching dependency updates with other field updates (status, title, priority) into a single featureLoader.update call (2026-02-14)
- **Problem solved:** The onLinearIssueUpdated method syncs multiple independent fields from Linear to Automaker.
- **Why this works:** Single batched update reduces database transactions, ensures atomic consistency, and leverages existing debouncing/sync guards that operate at the update level rather than per-field.
- **Trade-offs:** Easier: Consistent state, leverages existing infrastructure. Harder: More complex changeDescriptions tracking, but already established pattern.

### Made LinearMCPClient.executeGraphQL public instead of keeping it private (2026-02-14)
- **Context:** LinearProjectUpdateService needs to execute custom GraphQL queries beyond what predefined mutations provide
- **Why:** GraphQL API flexibility - different services may need different queries/mutations. Making executeGraphQL public enables composition without duplicating GraphQL execution logic across multiple service classes
- **Rejected:** Alternative: Create specific public methods on LinearMCPClient for each query type (projectUpdateCreate, etc). This would be less flexible and create coupling between MCP client and specific use cases
- **Trade-offs:** More flexible API surface (easier to add new features) vs potentially exposing internal GraphQL details. Mitigation: still wrapping calls in service layer
- **Breaking if changed:** If executeGraphQL is made private again, LinearProjectUpdateService can't function - it relies on this to post updates

#### [Pattern] Service aggregates features by filtering on milestone rather than querying Linear API directly for filtered features (2026-02-14)
- **Problem solved:** Need to get progress metrics for a specific milestone (done/in_progress/review/blocked counts)
- **Why this works:** Feature source of truth is FeatureLoader (which owns project structure), not Linear. Linear only has updates. Filtering locally vs requesting from Linear avoids API coupling and handles case where milestone info lives in project definition
- **Trade-offs:** Simpler, more testable (can mock FeatureLoader) vs requires FeatureLoader to already have loaded features (doesn't scale if thousands of features - would need pagination)

### Health status is computed automatically (offTrack/atRisk/onTrack) based on blockers and completion percentage, not passed in as parameter (2026-02-14)
- **Context:** Need to send health indicator with project update to Linear
- **Why:** Single source of truth for health calculation - service owns the logic of what constitutes each status. Prevents client code from calculating wrong status. Rules: blockers present = offTrack, no blockers + <50% complete + no active work = atRisk, else onTrack
- **Rejected:** Accept health status as parameter - creates risk of incorrect health values from caller, duplicates business logic
- **Trade-offs:** Service is opinionated about health rules (harder to customize) vs guaranteed correctness. If rules need to change, only service needs update
- **Breaking if changed:** If health calculation is moved outside service or made configurable, client code must replicate these exact thresholds or health statuses become inconsistent across system

#### [Pattern] Service formats status as markdown before posting to Linear (formatStatusUpdate private method) (2026-02-14)
- **Problem solved:** Linear projectUpdateCreate mutation accepts body as string, needs human-readable format
- **Why this works:** Separates presentation logic from business logic. Markdown is portable across Linear and other systems. Private method means caller never sees raw structure - always gets consistent formatting
- **Trade-offs:** Easier to read in Linear UI vs harder to parse programmatically. Markdown is one-way (can't extract counts back out without parsing)

### In-memory Map-based state cache per feature in GitHubStateChecker rather than persistent storage (2026-02-14)
- **Context:** Need to detect PR state changes and emit events only on actual transitions, avoiding duplicate event emission
- **Why:** State is reconstructed on service startup from GitHub API, so persistence is redundant. In-memory cache is sufficient since state polling happens continuously. Reduces complexity and storage overhead.
- **Rejected:** Persistent cache (database/file) would add unnecessary I/O and complexity given that state is polled fresh from GitHub regularly
- **Trade-offs:** Simpler implementation and lower latency vs. lost state tracking across service restarts (acceptable since polling reconstructs state)
- **Breaking if changed:** If state cache is removed, duplicate events will be emitted on every state check, breaking downstream logic that assumes single-emission-per-change

### Optional EventEmitter parameter in GitHubStateChecker constructor - service works with or without it (2026-02-14)
- **Context:** Need to add event emission to existing service without breaking existing usage or making EventEmitter a hard requirement
- **Why:** Enables backward compatibility. Services that don't care about events continue to work. New consumers can pass EventEmitter to enable event-driven workflows. Makes the service more flexible and testable.
- **Rejected:** Requiring EventEmitter would break existing code and force event emission everywhere, even where not needed
- **Trade-offs:** Optional parameter adds slight complexity (null-checks at emit sites) but enables gradual adoption and easier testing
- **Breaking if changed:** If EventEmitter becomes required, all existing instantiations fail

### Event-driven crew member architecture: emit events for downstream services to consume rather than direct escalation (2026-02-14)
- **Context:** PR state sync crew member needed to communicate drift detection to the GitHub-to-Linear bridge without tight coupling
- **Why:** Allows the bridge service to subscribe and react independently, enabling flexible composition and loose coupling. The crew member becomes a pure detector/emitter rather than orchestrator
- **Rejected:** Direct method calls on bridge service or synchronous state updates would create circular dependencies and tight coupling between crew members
- **Trade-offs:** Easier to test crew member in isolation; harder to guarantee immediate sync if bridge is down; requires event infrastructure and careful event ordering
- **Breaking if changed:** Removing event emission would require bridge to poll crew state or implement alternative notification mechanism

#### [Pattern] Helper function pattern: define severity mappers and converters as functions outside CrewMemberDefinition, not as methods (2026-02-14)
- **Problem solved:** mapDriftSeverity() needed to transform drift severity ('low'|'medium'|'high'|'critical') to crew check severity ('ok'|'info'|'warning'|'critical')
- **Why this works:** Keeps utility logic separated from lifecycle concerns, easier to unit test, follows functional composition pattern seen in codebase
- **Trade-offs:** More files/functions to track but clearer separation of concerns; easier to reuse mappers if needed elsewhere

#### [Pattern] Drift severity has 4 levels (low/medium/high/critical) mapping to crew check severity with critical as top severity (2026-02-14)
- **Problem solved:** PR state drift detection needs to communicate urgency to crew member health system with ability to escalate critical issues
- **Why this works:** Four-level system matches common severity models; 'critical' maps to 'critical' check severity to flag urgent drifts that may need manual intervention
- **Trade-offs:** More granular severity makes it harder to miss critical issues but requires explicit handling of 'critical' case in all mappers

### Crew member runs on 5-minute schedule (*/5 * * * *) for state drift detection, never escalates directly (2026-02-14)
- **Context:** Need to balance responsiveness to GitHub state changes against resource usage; bridge service is responsible for escalation
- **Why:** 5 minutes is responsive enough for most use cases (PRs are typically reviewed/merged over hours); event-driven approach means immediate detection once crew runs; bridge decides escalation based on business logic
- **Rejected:** More frequent intervals (1-2 min) would use more resources; longer intervals (30+ min) could miss time-sensitive state changes
- **Trade-offs:** Up to 5 minutes latency but lower resource cost; no direct escalation means bridge must listen for events and decide action
- **Breaking if changed:** Removing the schedule would stop drift detection entirely; changing interval affects how quickly state sync can react to GitHub changes

#### [Pattern] Linear GraphQL mutations for creating issue relations use a nested mutation pattern (issueRelationCreate) that requires both source and target issue IDs plus a relation type enum (2026-02-14)
- **Problem solved:** Implementing sync of feature dependencies to Linear issue relations
- **Why this works:** Linear's GraphQL API abstracts relation directionality through enum types (blocks, blocked, duplicate, related) rather than separate mutations. This design allows bidirectional relationships while maintaining a single mutation endpoint
- **Trade-offs:** Simpler API surface but requires consumer to understand relation semantics - 'blocks' means source blocks target, so ordering of IDs matters

#### [Gotcha] Feature dependencies are stored by feature ID, but Linear sync requires linearIssueId - missing mapping causes silent skipping of valid relationships (2026-02-14)
- **Situation:** When syncing dependencies from Automaker to Linear, features without linearIssueId populated are skipped without clear visibility
- **Root cause:** There's no transitive lookup: we can't fetch the Linear issue ID from the feature ID dynamically during sync. Both feature and dependency must already have linearIssueId set from a prior sync operation
- **How to avoid:** Fast, simple sync logic vs silent data loss when dependencies haven't been synced yet. Requires careful ordering of operations

#### [Pattern] Route handler uses dependency injection pattern - settingsService and featureLoader passed as parameters to handler factory function rather than imported directly (2026-02-14)
- **Problem solved:** Creating POST /api/linear/sync-dependencies handler that needs to access feature data and Linear configuration
- **Why this works:** Dependency injection enables unit testing without mocking require(), allows different service implementations, and makes data flow explicit. Handler factory pattern (createSyncDependenciesHandler) follows existing Linear route patterns in codebase
- **Trade-offs:** More boilerplate (factory function wrapper) vs testability and flexibility. Consistent with codebase patterns so minimal cognitive overhead

#### [Gotcha] Linear routes are mounted before auth middleware, so sync-dependencies endpoint is publicly accessible without authentication (2026-02-14)
- **Situation:** POST endpoint can be called without credentials - potential security concern if endpoint is later called from untrusted sources
- **Root cause:** Routes mounted before auth middleware enable webhook/OAuth flows that need public access. This is intentional for Linear integration patterns
- **How to avoid:** Public webhook support vs endpoint security. Currently mitigated by requiring valid projectPath parameter, but not cryptographically secure

### Dual-mode milestone progress calculation: async method checking actual feature statuses vs sync fallback using milestone status (2026-02-14)
- **Context:** Need to sync accurate project progress to Linear while handling cases where feature loader may not be available
- **Why:** Feature-based calculation is more accurate (reflects true work completion) but requires async I/O. Fallback ensures sync codepaths don't break if feature loader unavailable or in error states
- **Rejected:** Single method approach would either force async everywhere (performance/architectural complexity) or lose accuracy in edge cases
- **Trade-offs:** Dual methods add code but enable graceful degradation. Async method used when available, sync fallback for backwards compatibility and simple scenarios
- **Breaking if changed:** Removing fallback mode would break sync update paths and simple status-only updates. Removing async mode loses accuracy for complex milestone structures

### Status mapping groups multiple Automaker states into fewer Linear states (3 Automaker statuses → 'started' state) (2026-02-14)
- **Context:** Automaker has 7 granular project statuses but Linear only has 3 project status values (planned/started/completed)
- **Why:** Lossy mapping is intentional—Linear's simpler model suffices for project-level tracking. Grouping 'approved', 'scaffolded', 'active' as 'started' reflects that they all represent in-progress work
- **Rejected:** Custom field approach would require Linear workspace config changes. Separate sync table would duplicate data and create consistency issues
- **Trade-offs:** Linear visibility loses Automaker's fine-grained status detail, but reduces sync complexity and keeps Linear clean. Real detail stays in Automaker
- **Breaking if changed:** Changing mappings (e.g., moving 'approved' to 'planned') changes reported project status in Linear dashboards and reports. Clients relying on status for filtering would be affected

#### [Gotcha] Progress calculation uses completed phases count, not completed features—phases are cheaper to track but can become stale (2026-02-14)
- **Situation:** Initial implementation counted features, but shifted to counting phases within milestones
- **Root cause:** Phases are structural metadata that rarely change. Features can be added/removed later, making feature-count-based progress unstable. Phases represent planned scope
- **How to avoid:** Phase-based progress is stable but requires phases to be properly structured upfront. If phases added retroactively, progress calculations ignore them until next sync

#### [Pattern] Event-driven sync trigger: 'project:status-changed' event detected and processed asynchronously without blocking the status update (2026-02-14)
- **Problem solved:** Project status updates in Automaker need to be reflected in Linear, but the update itself shouldn't wait for Linear's GraphQL response
- **Why this works:** Decouples Automaker state from Linear state. If Linear sync fails, Automaker status update already completed. Allows independent scaling—Linear service can queue/retry without affecting Automaker
- **Trade-offs:** Eventual consistency: brief window where Automaker and Linear disagree. Adds event infrastructure overhead. Enables cleaner separation of concerns

#### [Pattern] Dual-layer feature flag configuration - ceremony settings control WHEN updates fire, while Linear settings control WHETHER the feature is available at all (2026-02-14)
- **Problem solved:** CeremonyService needed to conditionally post to Linear project updates based on both ceremony event types and integration enablement
- **Why this works:** Separates concerns: ceremony settings manage ceremony workflow preferences (standups, milestones, etc.), while Linear settings manage platform integration availability. This prevents Linear config from leaking into ceremony logic
- **Trade-offs:** Requires checking two separate config locations for feature activation, but provides clear separation of responsibility and allows independent feature toggle control

### Health status automatically derived from blocker presence rather than explicit parameter (2026-02-14)
- **Context:** LinearProjectUpdateService needed to set health status for project updates, but ceremony data includes blocker information
- **Why:** Reduces API surface and prevents callers from making inconsistent decisions about health status. Single source of truth from data. Aligns with domain logic that blockers = degraded health
- **Rejected:** Could pass health status as explicit parameter, but then caller must compute this and stays in sync with blocker data
- **Trade-offs:** Less flexibility for callers to override health status, but more correctness and consistency. Service becomes opinionated about health semantics
- **Breaking if changed:** If health status logic changes (e.g., some blockers don't matter), service must be updated and all callers automatically benefit

#### [Pattern] Service accepts pre-composed markdown content rather than building it internally (2026-02-14)
- **Problem solved:** LinearProjectUpdateService needs to post ceremony data to Linear, but content formatting is ceremony-specific
- **Why this works:** Keeps service focused on Linear API mechanics and keeps formatting logic in domain layer (CeremonyService). Avoids service needing to understand ceremony semantics
- **Trade-offs:** Caller has more responsibility for content composition, but service remains reusable and domain-agnostic

### Conditional integration hooks based on ceremony event types rather than generic listener pattern (2026-02-14)
- **Context:** CeremonyService fires multiple event types (kickoff, standup, milestone completion, etc.) but only some should post to Linear
- **Why:** Explicit conditionals are clearer about which events integrate with Linear. Avoids event bus complexity and makes behavior obvious when reading code. Ceremony controls what fires
- **Rejected:** Event listener pattern would require separate listener registration, less clear which events trigger Linear updates
- **Trade-offs:** Ceremony service knowledge slightly increases, but integration behavior is explicit and maintainable. No runtime discovery of integration hooks
- **Breaking if changed:** If this moves to event pattern, the integration becomes implicit and harder to trace through code

#### [Pattern] Type-first design for LangGraph state management - define comprehensive ProjectStatusState with Annotation.Root() before implementing flow nodes (2026-02-14)
- **Problem solved:** Initial implementation created conflicting types that didn't align with a broader type system. Had to rewrite flow to use existing state types.
- **Why this works:** LangGraph's type safety depends on correct StateAnnotation usage. Defining types first ensures all nodes operate on same state schema. Prevents runtime state mismatches and enables proper reducer logic.
- **Trade-offs:** Upfront type design takes longer but eliminates mid-implementation refactoring. Makes the codebase more predictable for team expansion.

### Separate each LangGraph node into its own file rather than bundling in main flow file (2026-02-14)
- **Context:** Linter auto-refactored the monolithic flow file into modular node files. Initially seemed like over-engineering, but improved maintainability significantly.
- **Why:** Each node has distinct responsibility (gather metrics, analyze, assess risk, generate, review, format). Separate files make it easier to locate, test, and replace individual nodes. Follows Unix philosophy - single responsibility.
- **Rejected:** Keeping all nodes in status-report-flow.ts - simpler initially but creates 400+ line file that's hard to navigate and test in isolation
- **Trade-offs:** More files to manage but much clearer dependency graph. Easier to add new nodes (just create new file and register in flow). Harder to see overall flow at a glance.
- **Breaking if changed:** Node files must be imported in correct order. If a node file depends on another, circular imports can occur. Must use interface contracts between nodes.

### Use dependency injection pattern for MetricsCollector interface - implementations injected via config, not hardcoded in nodes (2026-02-14)
- **Context:** gather-metrics node needs to pull real data from FeatureLoader, Git, and AgentService, but those aren't available in all contexts
- **Why:** Metrics collection touches external systems. DI lets you provide mock collectors for testing, real collectors for production. Nodes remain pure - they don't know where data comes from. Enables testing without full system setup.
- **Rejected:** Direct imports of FeatureLoader, Git services - couples nodes to infrastructure and breaks testing in isolation
- **Trade-offs:** Requires more setup code to inject implementations. But decouples nodes from infrastructure completely. Makes unit testing trivial.
- **Breaking if changed:** If MetricsCollector interface changes, all implementations must update. Missing implementations at injection time causes runtime failures silently (flows execute with empty metrics).

#### [Pattern] Use conditional edges with routing logic instead of multiple sequential nodes for quality gates and approval workflows (2026-02-14)
- **Problem solved:** review-quality node checks if report meets quality standards. Could have been implemented as always-execute node that sets a flag, but conditional edges are cleaner.
- **Why this works:** Conditional edges make the graph structure match the decision logic. Approval path and revision path are explicit in the graph, not hidden in node logic. Graph visualization shows the real flow.
- **Trade-offs:** Requires registering conditional_edges instead of linear node chains. But produces clearer state graphs and easier reasoning about paths.

### Workflow metadata exposed as static HTTP endpoint instead of extracted from runtime agent registry (2026-02-15)
- **Context:** CopilotKit runtime has registered agents (Ava, content-pipeline, antagonistic-review). Could either extract metadata from runtime dynamically or define statically in HTTP response.
- **Why:** Static definitions provide predictable API contract, enable versioning independently of agent registration, and don't require exposing internal runtime structure. Simpler initial implementation.
- **Rejected:** Dynamic extraction from runtime.agents would require introspection API, coupling HTTP contract to runtime impl details, risk of agents being registered/unregistered changing API responses mid-session.
- **Trade-offs:** Easier: stable API, clear schema. Harder: metadata sync required when agents change, requires manual update in two places.
- **Breaking if changed:** If metadata endpoint is removed, frontend components relying on `/api/copilotkit/workflows` fail silently (loading state persists). If schema changes (add/remove field), frontend selector breaks unless it handles gracefully.

#### [Pattern] useAgentContext must be called inside CopilotKitProvider component tree. Calling it outside provider causes undefined behavior. Create intermediate wrapper component (ProjectContextInjector) that lives inside provider and calls the hook. (2026-02-15)
- **Problem solved:** CopilotKit hooks have provider dependency similar to React Context. App provider structure needed adjustment to place hook consumer inside correct scope.
- **Why this works:** Hook-provider coupling is enforced by CopilotKit's internal state management. Intermediate component pattern avoids restructuring entire provider tree while satisfying hook constraints.
- **Trade-offs:** Adds small wrapper component but keeps provider logic clean and decoupled. Alternative (monolithic provider) would couple unrelated concerns.

### Conditionally inject context values (only if data exists) rather than always injecting null/undefined. Prevents noisy context, reduces cognitive load on agents. (2026-02-15)
- **Context:** App store may not have loaded currentProject, features, or spec yet during initial render. Injecting null/undefined for unavailable data clutters agent context.
- **Why:** Agents should only see relevant, available data. Injecting undefined forces them to handle null checks they don't need. Conditional injection keeps context clean and focused.
- **Rejected:** Always injecting all values (including null) would work but create noise. Agents must then write defensive code to check for undefined on every use.
- **Trade-offs:** Cleaner agent context, less defensive coding needed. Cost is conditional checks in ProjectContextInjector (minimal).
- **Breaking if changed:** If agents assume context values always exist, missing values will cause errors. Agents should always check value existence before using (defensive pattern).

#### [Pattern] HITL (Human-In-The-Loop) interrupt gates use dual-trigger pattern: config flag AND content condition. Interrupts only fire when enableHITL=true AND criticalIssues.length > 0. (2026-02-15)
- **Problem solved:** Implementing HITL approval gates in content pipeline that should respect both user configuration and actual content review findings
- **Why this works:** Prevents spurious interrupts on clean reviews (enableHITL alone) and prevents interrupts when disabled (criticalIssues alone). Both conditions must align for human review to trigger.
- **Trade-offs:** Slightly more complex conditional logic, but catches edge cases where config disagrees with content quality

#### [Pattern] HITL phases (research/outline/final) are explicitly named in interrupt payload type, not inferred from node name. Payload includes 'phase: research|outline|final' as discrete value. (2026-02-15)
- **Problem solved:** Three different HITL gates in a pipeline all use similar interrupt mechanics but need to be distinguished in downstream processing
- **Why this works:** Explicit phase field makes payload self-describing and eliminates need for downstream code to parse node names or maintain phase ordering. CopilotKit runtime and UI can instantly know which stage failed without inference.
- **Trade-offs:** Slightly more verbose payload, but decouples phase semantics from implementation details (node names). Phase is semantic; node name is implementation.

### Interrupt calls are placed INSIDE HITL node functions (after review logic), not at graph compilation level. Uses LangGraph's interruptBefore=[nodeNames] for pause points, but interrupt(payload) for data injection. (2026-02-15)
- **Context:** Distinguishing between where execution pauses (graph structure) vs. where human context is injected (node logic)
- **Why:** interruptBefore is a graph-level directive that marks nodes as interrupt candidates; interrupt() is called inside the node when the condition is met. This allows selective interrupts within a node (only on critical issues) rather than pausing unconditionally.
- **Rejected:** Could pause all HITL nodes unconditionally via interruptBefore and let downstream decide to interrupt, but that wastes resources pausing clean reviews
- **Trade-offs:** Requires condition logic in node code (not declarative at graph level), but enables smart filtering and only passes data when actually needed
- **Breaking if changed:** If interrupt() is removed and only interruptBefore is used, system pauses on clean reviews (empty/null reviewResult), forcing UI to handle 'no-op' interrupts

### ModelProvider context created as intermediate provider that depends on WorkflowProvider context, requiring specific nesting order in provider tree (2026-02-15)
- **Context:** Model selection needs to read from WorkflowProvider (selectedAgent) and provide model state to CopilotKitInnerProvider, but CKProvider was already nested inside WorkflowProvider
- **Why:** Allows ModelProvider to hook into WorkflowProvider's selectedAgent via useWorkflowSelection(). Alternative of flattening providers would require prop drilling or context merging, losing composition benefits
- **Rejected:** Could have merged ModelProvider logic into CopilotKitInnerProvider directly, but this violates separation of concerns and makes state management less reusable
- **Trade-offs:** Provider nesting depth increased by one level (slight performance cost from extra context consumer) but gained isolated, reusable model selection logic that other components can independently consume
- **Breaking if changed:** Provider nesting order is now critical - ModelProvider MUST be inside WorkflowProvider. Reversing order breaks useWorkflowSelection() call in ModelProvider

#### [Pattern] Setter function pattern for persistence: setSelectedModel(model, workflowId) both updates state AND persists to localStorage in single call (2026-02-15)
- **Problem solved:** Model selection needs to update UI state and persist preference without requiring separate effect hooks or manual save calls from consumers
- **Why this works:** Encapsulates state and persistence logic together, preventing accidental state-only updates that forget to persist. Single source of truth for how model changes are handled. Consumer code (SidebarControls) doesn't need to know about localStorage
- **Trade-offs:** Setter must take both model AND workflowId parameter (more complex signature) but prevents silent bugs where model changes but doesn't persist across page reloads. Forces explicit intent on every change

#### [Pattern] Factory function pattern for creating agents with model injection: agentFactories.get(selectedModel)(agentConfig) returns model-specific agent instance (2026-02-15)
- **Problem solved:** Need to support dynamic model selection without hardcoding model strings in agent implementations or creating separate agent classes per model
- **Why this works:** Factory pattern decouples model selection (runtime/UI) from agent instantiation (server logic). Allows swapping model implementation without changing agent code. Scales to future models without proliferating agent variants
- **Trade-offs:** Factory registry pattern requires registration step for each model, but gained flexibility and avoided class explosion. Makes model behavior testable via mock factories

#### [Pattern] Component structure follows existing CopilotKit UI patterns (Dialog composition, state reset on props change, Tailwind styling consistent with shadcn/ui) (2026-02-15)
- **Problem solved:** Codebase has established patterns in copilotkit/agent-state-display.tsx and other CopilotKit-related components. New HITL component must integrate cohesively.
- **Why this works:** Consistency reduces cognitive load for future maintainers. Uses already-proven patterns from codebase (Dialog wrapper, useEffect cleanup for state, Tailwind + shadcn/ui). Reduces chance of unexpected behavior from ad-hoc patterns.
- **Trade-offs:** Following established patterns means some constraints (must use Dialog, Tailwind classes, specific file locations). Upside: immediate familiarity for Josh/team, easier to find/modify, integrates with existing design system.

### Created separate TipTapEditor component instead of inline TipTap setup inside PRDEditorModal (2026-02-15)
- **Context:** TipTap editor setup is complex: extension configuration, event handlers, content state management. Could have written it inline inside modal.
- **Why:** Separation of concerns: TipTapEditor encapsulates all TipTap-specific logic (useEditor hook, extension setup, toolbar rendering). PRDEditorModal focuses on modal UX (approve/reject, content display). Makes both components testable/reusable independently.
- **Rejected:** Inline TipTap in PRDEditorModal: simpler initially but mixes concerns. If future features need TipTap elsewhere (inline editing in grid, comment threads), code duplication or tight coupling. Harder to unit test TipTap behavior without modal context.
- **Trade-offs:** Component split adds one extra file and prop drilling (editorRef, onContentChange callbacks). Benefit: TipTapEditor can be reused in other contexts, easier to test TipTap features in isolation, PRDEditorModal stays focused on modal/approval logic.
- **Breaking if changed:** Merging TipTapEditor back into PRDEditorModal removes reusability and mixes concerns, making future TipTap usage elsewhere require code duplication or refactoring.

#### [Gotcha] Hook returns JSX (InterruptRouter component) directly. This violates traditional hook naming conventions where hooks return values, not UI. (2026-02-15)
- **Situation:** useLangGraphInterrupt both manages interrupt state AND renders UI. Standard React pattern would return state + handlers, separate component would render.
- **Root cause:** Encapsulation: hook owns complete interrupt lifecycle (detect, route, resume). Returning JSX keeps related logic together. Caller just imports hook and renders result.
- **How to avoid:** Gains: Single import, cleaner provider code. Loses: Violates hook naming convention (naming suggests it returns state, not UI). Hook harder to test in isolation.

#### [Pattern] Discriminated union routing pattern for payload.type determines which UI component renders. Type system enforces exhaustive checking. (2026-02-15)
- **Problem solved:** Four different interrupt types need different handling logic and UI. Need to ensure new types added in future are handled.
- **Why this works:** Discriminated unions with switch statements allow TypeScript to prove exhaustiveness at compile time. If new interrupt type added to union, compiler errors until all cases handled.
- **Trade-offs:** Gains: Type safety, prevents silent failures on new interrupt types. Loses: Must update union type + switch case + test coverage when adding new types.

#### [Pattern] Graceful fallback in interrupt resume: attempt to parse userEditedContent as structured JSON (ResearchResult[], Outline) first, then fall back to treating it as feedback text if parsing fails (2026-02-15)
- **Problem solved:** researchHitlNode needs to handle both structured edits (researcher modified results array) and unstructured feedback (text comments). Can't assume the frontend always sends valid JSON.
- **Why this works:** Prevents graph interruption on invalid JSON from user edits. Gives users freedom to edit content freely without strict serialization requirements. Maintains robustness when frontend passes unexpected data types.
- **Trade-offs:** Easier: flexible user edits, resilient resume. Harder: ambiguity between 'valid JSON that happens to be feedback' vs 'actual structured data'. Added logging becomes critical for debugging.

### Clear userEditedContent from state after processing in each HITL node to prevent stale edited data from affecting subsequent resume cycles (2026-02-15)
- **Context:** When graph resumes multiple times (e.g., research approved but then outline rejected and re-edited), old userEditedContent from previous resume could contaminate later phases.
- **Why:** State hygiene. If userEditedContent persists after being consumed, a second interrupt/resume cycle would reapply old edits from a previous phase. Each phase only cares about edits relevant to that phase.
- **Rejected:** Keep userEditedContent throughout graph execution to allow downstream nodes to inspect edit history. Would require careful ordering and phase-checking to avoid cross-phase contamination.
- **Trade-offs:** Easier: clear semantics, no stale data bugs. Harder: can't retrospectively audit what edits were made in earlier phases once they're cleared.
- **Breaking if changed:** If any downstream node (beyond the HITL gate) tries to access userEditedContent for audit/logging, it will be empty. Must capture/log edits before clearing, or store them in a separate audit field.

#### [Pattern] Consistent HITL gate pattern across three phases (research, outline, final review): each gate uses the same interrupt/resume flow, parses phase-specific edited content from userEditedContent, and applies it to state before continuing (2026-02-15)
- **Problem solved:** Rather than unique interrupt logic per phase, all three gates follow the same schema: check approval flag, parse edited content, update state, clear field, continue.
- **Why this works:** Predictability and maintainability. Future developers see 'HITL gate pattern' and know exactly how resume works in any phase. Reduces cognitive load and bug surface. Makes it easy to add a fourth gate.
- **Trade-offs:** Easier: consistent code, clear mental model. Harder: the pattern is opinionated and constrains how future gates can work. If a future phase needs async validation on resume, the pattern may not fit.

### ErrorDisplay placed in SidebarControls below AgentStateDisplay, reusing existing sidebar integration pattern (2026-02-15)
- **Context:** Error display needs to be visible in UI; must integrate without requiring new UI structure or layout changes
- **Why:** Reusing sidebar pattern follows established convention in codebase; AgentStateDisplay already proven to work in that location. Reduces layout refactoring
- **Rejected:** Placing error display in modal or toast would require new integration points; inline in main content area would obscure workflow visualization
- **Trade-offs:** Error display shares sidebar real estate with other controls (spacing constraints) but integrates seamlessly without new structure
- **Breaking if changed:** Moving to different location requires updating provider.tsx imports/placement and potentially breaking layout assumptions if error info becomes critical for navigation

#### [Pattern] CopilotKit interrupt routing via useAgent hook with OnStateChanged subscription pattern (2026-02-15)
- **Problem solved:** Need to receive LangGraph interrupts from agent execution and route them to appropriate UI components
- **Why this works:** useAgent hook provides reactive state updates when agent execution encounters interrupts. OnStateChanged subscription mode efficiently listens for interrupt events without polling. Separating router from specific dialog implementations allows multiple interrupt types to coexist.
- **Trade-offs:** Router pattern adds one component layer but enables extensibility. Alternative of direct callbacks would be simpler for one interrupt type but brittles as types multiply.

#### [Pattern] Dialog components follow controlled component pattern (open prop + onResolve callback) rather than imperative show/hide methods (2026-02-15)
- **Problem solved:** EntityWizard and InterruptRouter both use Dialog with controlled visibility
- **Why this works:** React best practice: declarative state management makes interrupt lifecycle predictable. Component renders when interrupt exists, closes when resolved. Callback-based resolution ensures parent can handle completion.
- **Trade-offs:** Controlled pattern requires parent to manage open state, but prevents dialog from getting orphaned. Parent can add loading spinners, error handling, retry logic.

#### [Gotcha] InterruptRouter requires placement in component tree where CopilotKit context exists. Cannot work in arbitrary location. (2026-02-15)
- **Situation:** Implementation creates router component but integration point is not specified
- **Root cause:** useAgent hook depends on CopilotKit provider being ancestor. Router only receives interrupts if within that tree.
- **How to avoid:** Context dependency ensures proper lifecycle management but restricts placement flexibility.

#### [Pattern] Service initialization in Express index.ts follows early instantiation + route binding + graceful shutdown pattern. TwitchService initialized once, passed to route creators, then drained in gracefulShutdown() before process exit. (2026-02-17)
- **Problem solved:** Integrating a stateful service (TwitchService maintaining IRC connection) into Express without connection leaks or orphaned processes on restart
- **Why this works:** Early initialization ensures single instance. Route-level dependency injection avoids globals. Graceful shutdown prevents zombie connections when dev server restarts or deploys.
- **Trade-offs:** More code in index.ts (service plumbing) but guarantees connection lifecycle is managed centrally. Early binding means TwitchService must not fail startup or entire server fails.

#### [Gotcha] updateSuggestion() rewrites entire append-only JSONL file instead of appending. Works for current low-volume scenario but becomes inefficient and risky at scale (partial writes on crash). (2026-02-17)
- **Situation:** Marking suggestions as processed requires state mutation, but file was designed append-only for crash safety
- **Root cause:** Simpler implementation - read all, modify in-memory, rewrite. Avoids need for indexing or separate files.
- **How to avoid:** Simple now, brittle later. High-volume scenarios (1000s of suggestions) would cause perf degradation and crash vulnerability during rewrite.

#### [Gotcha] Poll result handling is missing - POST /api/twitch/poll creates poll but never listens for completion. Winning suggestion is not auto-created on board when poll ends. (2026-02-17)
- **Situation:** Feature spec defined end-to-end flow (collect ideas → pick 3 → poll → auto-create winner), but implementation stopped at poll creation
- **Root cause:** Scope constraint. Poll result detection requires either EventSub webhooks (external event ingestion) or polling Helix API periodically.
- **How to avoid:** MVP is feature-incomplete but deployable. Poll metadata is persisted for future webhook handler. Backend responsibility is clear but frontend/external system must handle the bridge.

#### [Pattern] WebSocket events (twitch:connection, twitch:suggestion:updated, etc.) are emitted from routes for all state changes, enabling real-time UI updates without polling. (2026-02-17)
- **Problem solved:** UI needs to show suggestion queue, connection status, and poll results in real-time as they change
- **Why this works:** Event-driven pattern decouples UI from polling logic. Server pushes changes instead of client polling. Reduces latency and server load.
- **Trade-offs:** Requires WebSocket connection to remain open. Clients must handle connection loss. But enables low-latency reactive UI.

#### [Gotcha] Health check integration for Twitch status is optional (uses ...(twitchStatus && { twitch: twitchStatus })) instead of always present. Means Twitch connection status only appears in health if enabled. (2026-02-17)
- **Situation:** TwitchService may not be initialized if TWITCH_ENABLED=false. Health check endpoint must handle optional services gracefully.
- **Root cause:** Conditional logic avoids null/undefined values in health response. Only includes status if service is active.
- **How to avoid:** Response shape varies based on configuration. Clients must handle conditional fields. But avoids misleading false statuses.

### Created separate dedicated overlay components (stream-overlay-view, overlay-board, suggestion-queue, activity-feed) instead of modifying existing board-view.tsx (2026-02-17)
- **Context:** Stream overlay is a specialized view for OBS with different constraints (1920x1080, dark theme, no interactivity, WebSocket-driven) than the standard board view used in the app UI
- **Why:** Separation prevents scope creep in board-view.tsx, avoids coupling overlay constraints (hardcoded dark theme, view-only) into the general-purpose board component, and allows independent iteration on streaming UX without affecting the main app
- **Rejected:** Reusing board-view.tsx with conditional rendering flags (e.g., isOverlay prop) — would complicate component logic and create maintenance burden for two different rendering paths
- **Trade-offs:** More code duplication (board columns rendered twice) vs cleaner separation of concerns. The duplication is acceptable here because overlay and main board have fundamentally different goals
- **Breaking if changed:** If overlay components are merged back into board-view.tsx, the hardcoded dark theme and view-only constraints must be made conditional, potentially introducing bugs in the main board view

#### [Pattern] Chat response handler (ChatResponseHandler) designed as injectable service with dependency-injected fetcher functions, not coupled to TwitchService (2026-02-17)
- **Problem solved:** `!help`, `!queue`, `!status` commands need access to suggestion state and build status, but these live in different layers (Zustand store, HTTP API), not in the chat service itself
- **Why this works:** Injection pattern makes handler testable without Twitch connection — unit tests can pass mock fetchers. Keeps chat response logic separate from Twitch client coupling. Handler can be instantiated independently for testing
- **Trade-offs:** Requires plumbing fetcher functions through constructor vs simpler 'just access the store' approach. Additional lines of boilerplate, but significant testability gain

#### [Pattern] Step icon mapping as Record<StepType, IconComponent> constant rather than discriminated union or factory (2026-02-18)
- **Problem solved:** 7 different pipeline steps each need a specific Lucide icon for visual identification
- **Why this works:** Record approach is simpler than a union discriminator and more explicit than a factory function. Icon lookup is O(1) and exhaustiveness checking at compile time if step type is a discriminated union. Easy to refactor icons later without touching component logic.
- **Trade-offs:** Static mapping makes adding new steps require updating the constant, but that's intentional coupling - ensures developers remember to pick an icon. Could be lazy-loaded if bundle size matters.

### Centralized idea processing service with operation-specific routing endpoints (refire.ts, edit.ts) that delegate to shared IdeaProcessingService methods (2026-02-18)
- **Context:** Implementing node refire and edit endpoints that need to handle idea state mutations with consistent error handling and session management
- **Why:** Separates routing concerns (parameter extraction, HTTP layer) from business logic (idea processing). Allows multiple HTTP endpoints to share the same core service logic without duplication while maintaining clear separation of concerns.
- **Rejected:** Implementing business logic directly in route handlers would require duplicating session validation, error handling, and idea state mutation logic across endpoints
- **Trade-offs:** Adds an extra abstraction layer (routes → service) but prevents maintenance burden of duplicated logic. Makes testing more complex at route level but easier at service level.
- **Breaking if changed:** If service methods are refactored to combine refire/edit logic, individual endpoints lose flexibility to handle operation-specific error cases or response formats

### Used React Query polling (refetchInterval: 10s) instead of WebSocket subscription for real-time session updates (2026-02-18)
- **Context:** Ideation API lacks WebSocket event system; needed real-time updates for session state changes
- **Why:** Polling provides immediate real-time behavior without infrastructure overhead. Reduces coupling to event system that doesn't exist yet. Query cache automatically deduplicates redundant requests.
- **Rejected:** Implemented WebSocket subscription - would require API infrastructure not yet available; over-engineered for current needs
- **Trade-offs:** Polling trades server load for simplicity and immediate deployability. Must replace with event subscription when WebSocket system exists (pattern exists in codebase via use-query-invalidation.ts)
- **Breaking if changed:** If refetchInterval removed, sessions become stale until manual refresh. If API gains WebSocket support, polling becomes inefficient but still functional.

#### [Pattern] Lane-based layout with pipeline steps as columns; sessions as rows with fixed LANE_HEIGHT, steps with fixed STEP_WIDTH (2026-02-18)
- **Problem solved:** Need to visualize many sessions across linear workflow stages in React Flow
- **Why this works:** Separates two independent concerns: session grouping (rows) and workflow progression (columns). Constants enable responsive adjustment without code changes. Matches existing flow-graph-data pattern in codebase.
- **Trade-offs:** Fixed dimensions simplify positioning and performance but require adjustment logic for small viewports. Lane structure prevents complex branching visualization naturally (see commented branching topology section).

#### [Gotcha] Branching topology (research vs fast_path at same column) acknowledged but not implemented; deferred as commented structure (2026-02-18)
- **Situation:** Sessions can follow multiple paths (research-heavy vs fast-path) that converge at same pipeline step
- **Root cause:** Implementation complexity with visual representation unclear. Placeholder structure documents intent without blocking core feature. Allows future enhancement without refactoring.
- **How to avoid:** Deferred complexity maintains simple linear layout but creates future tech debt. Commented code preserves design intent for implementer.

### Hook returns selectedSession (current) and selectSession (callback) for external session filtering control instead of managing selection internally (2026-02-18)
- **Context:** useIdeaFlowData needs to support session filtering for feature requirements
- **Why:** Inverts control to consumer; allows parent component to manage selection state. Prevents prop drilling and state synchronization issues. Single source of truth for selection lives in consuming component.
- **Rejected:** Internal useState for selection - couples data transformation with UI state; makes component harder to test and reuse
- **Trade-offs:** Parent must manage selectedSession state; useIdeaFlowData becomes pure transformation function. Simplifies hook and enables flexible selection patterns (single, multi-select, filters).
- **Breaking if changed:** If selection moved into hook, loses ability to share selection state across multiple views or sync with URL/navigation state.

#### [Gotcha] Component uses memo() wrapper but state updates (countdown timer tick) cause frequent re-renders that memo doesn't optimize (2026-02-18)
- **Situation:** CountdownTimer sub-component updates every frame but memo() only prevents re-renders from parent changes, not internal state changes
- **Root cause:** memo() compares props - it prevents re-renders when ApprovalNodeData props are unchanged. But requestAnimationFrame-driven state updates inside CountdownTimer bypass this optimization entirely. This is a fundamental limitation of memo for components with internal animation loops.
- **How to avoid:** memo() provides value for parent-driven updates but doesn't optimize animation-driven updates. Acceptable tradeoff since countdown is performance-intensive but localized to single node.

#### [Pattern] TODO markers left for mutation wiring (handleApprove/handleReject) instead of implementing placeholders or throwing errors (2026-02-18)
- **Problem solved:** Component handlers need to call backend mutations but mutation integration not in scope for initial implementation
- **Why this works:** TODO markers make incomplete wiring explicit and searchable across codebase. Placeholder console.log prevents component breakage. Better than throwing error (breaks component) or no marker (mutation forgotten).
- **Trade-offs:** TODO markers require developer discipline to follow up, but prevent accidental breaking changes and document integration points clearly.

#### [Pattern] Separate canvas component (controlled mode) wrapped by view component (ReactFlowProvider) (2026-02-18)
- **Problem solved:** Managing React Flow initialization and node/edge state across feature views
- **Why this works:** ReactFlowProvider must wrap canvas for hooks to work; separating concerns allows canvas to be stateless/testable while view handles provider setup and data fetching
- **Trade-offs:** More files but cleaner separation; canvas is reusable independent of view context; view component purely handles orchestration

#### [Pattern] Node/edge type registries use placeholder components initially (empty objects) (2026-02-18)
- **Problem solved:** Building foundation for node/edge types without implementing actual renderers
- **Why this works:** Allows controlled mode setup to succeed without circular dependencies; actual implementations can be added incrementally without touching canvas component
- **Trade-offs:** Nodes render as nothing initially but render pipeline is correct; type safety maintained; future changes are isolated to registry files

#### [Pattern] Tab state managed via URL query params, not component state (2026-02-18)
- **Problem solved:** Switching between System Graph and Idea Pipeline views in analytics page
- **Why this works:** URL as single source of truth enables deep linking, browser back/forward navigation, and tab state persistence without context/reducer; component just renders based on search param value
- **Trade-offs:** Requires router integration but gains free deep linking and history support; no prop drilling needed

### Used loose SessionItem interface for IdeaListPanel props instead of importing full IdeationSession type to decouple component from domain model (2026-02-18)
- **Context:** Component needed to display session data but importing full domain type would create tight coupling
- **Why:** Allows component to be tested independently, reused with different data sources, and evolved without breaking domain changes
- **Rejected:** Importing IdeationSession directly - would make component tightly coupled to backend schema changes
- **Trade-offs:** Slightly more work to define interface, but gained flexibility and testability. Easier to mock data in tests.
- **Breaking if changed:** If props interface is removed/changed, component becomes non-functional. Parent component must guarantee shape matches.

#### [Pattern] Both components handle all their own styling and state representation - no external state management needed for UI toggles (2026-02-18)
- **Problem solved:** Toolbar doesn't manage its own open/closed state. List panel doesn't manage grouping/filtering state.
- **Why this works:** Avoids context providers or prop drilling. Parent component controls all state. Components become pure/deterministic - easier to test.
- **Trade-offs:** Parent must track more state, but UI is fully transparent and testable. No surprise re-renders from internal state changes.

#### [Pattern] onSelectSession callback parameter is just session ID string, not full session object (2026-02-18)
- **Problem solved:** When user clicks a session, panel calls callback with only the ID
- **Why this works:** Decouples panel from knowing session shape. Parent already has full session data. Reduces payload/memory, clearer intent (selecting, not mutating).
- **Trade-offs:** Parent must look up full session by ID, but gains flexibility. If session structure changes, parent logic is isolated.

#### [Pattern] Dialogs receive complete data structures (ReviewOutput, IdeaProcessingState) rather than individual fields (2026-02-18)
- **Problem solved:** Building dialogs that need to display related but distinct pieces of information
- **Why this works:** Reduces prop drilling and makes data flow explicit; easier to extend dialog with new fields later without changing consumer API
- **Trade-offs:** Requires consumers to understand complete data structures but enables better encapsulation and change isolation

#### [Pattern] Context menu implemented with fixed backdrop overlay pattern for outside-click detection rather than relying on React Flow's built-in context menu systems (2026-02-18)
- **Problem solved:** Needed re-fire action on completed pipeline step nodes without blocking interaction with other UI elements
- **Why this works:** Fixed positioning backdrop (z-40) with motion.div menu (z-50) provides reliable click-outside detection independent of React Flow's event handling. Allows custom styling and animation control that matches design system. The backdrop preventDefault on contextMenu prevents browser menu interference.
- **Trade-offs:** Manual z-index management required (40/50) vs automatic handling; must manage click handlers and cleanup; gained full control over animations and styling; lost some accessibility features that libraries provide automatically

#### [Gotcha] Re-fire handler defined in parent view component (idea-flow-view.tsx) but triggered from deeply nested node (PipelineStepNode) - requires prop drilling for callback (2026-02-18)
- **Situation:** Re-fire context menu action needs to communicate back to parent to execute POST request with sessionId and nodeId
- **Root cause:** SessionId lives at view level, node ID lives at node level. Rather than using React Context or Redux, props were drilled through because the component tree is shallow (view -> node) and React Flow's custom node props mechanism already expects function callbacks. Avoids premature abstraction.
- **How to avoid:** Gained: simpler mental model, no extra providers; Lost: won't scale if tree deepens significantly (would need context refactor). Easy to trace data flow but mixes concerns at node level.

#### [Pattern] Node types registry (nodeTypes object) created upfront as extensibility point even though only one node type implemented (2026-02-18)
- **Problem solved:** Three additional node types noted as pending (intake, approval, terminal) in comments and registry placeholder
- **Why this works:** React Flow requires nodeTypes to be passed as configuration. By creating registry upfront with placeholder comments showing where types go, future developers see the pattern immediately. Prevents merge conflicts when multiple features add nodes simultaneously. Each feature can modify only their section without touching others.
- **Trade-offs:** Gained: clear extension points, no config chasing; Lost: slightly verbose for single implementation. Future node additions are now obvious where to go.

### Extracted Idea Pipeline from analytics tab bar into a separate sidebar route rather than keeping it as a parameterized view within analytics (2026-02-18)
- **Context:** Previously, both System Graph and Idea Pipeline were accessible via a tab switcher within the /analytics route using a 'tab' search parameter validated by Zod
- **Why:** Separation of concerns - each feature gets its own mental model and URL space. Reduces complexity in analytics view (no tab state management), makes Idea Pipeline discoverable as a top-level feature, and allows independent keyboard shortcuts for each view
- **Rejected:** Keeping both views in /analytics with conditional rendering based on 'tab' parameter - would have required maintaining Zod schema validation, tab state management, and tab UI components indefinitely
- **Trade-offs:** Simpler individual views but two separate route definitions instead of one parameterized route. Keyboard shortcut now routes to /ideas instead of /analytics?tab=ideas
- **Breaking if changed:** Any bookmarks or direct links to /analytics?tab=ideas will no longer work - they must now use /ideas. Any code that relied on the tab parameter will break

### Navigation item placement in Project section after System View and before Kanban Board, with consistent icon/label pattern (2026-02-18)
- **Context:** Idea Pipeline needed to be added to navigation hierarchy alongside System View and Kanban Board in the Project section
- **Why:** Maintains visual hierarchy and logical grouping - all project-level analytics/workflows in one section. Consistent icon (Lightbulb for ideas) and label pattern with existing items makes the mental model predictable
- **Rejected:** Placing in a separate 'Workflows' section - would fragment related features; using text-only without icon - inconsistent with other nav items
- **Trade-offs:** Navigation structure becomes more crowded as features grow, but remains logically organized. Icon choices must be semantically clear
- **Breaking if changed:** If navigation layout is restructured without maintaining semantic grouping, users lose the mental model of what features belong together

#### [Pattern] File-based routing with TanStack Router eliminates need for explicit route registration - new route file automatically discovered and route available (2026-02-18)
- **Problem solved:** Created new `/ideas` route by simply adding `ideas.tsx` file with `createFileRoute('/ideas')` without registering anywhere
- **Why this works:** Reduces boilerplate and coupling. Route tree generation is automatic, preventing missed route registrations and keeping routing logic decentralized
- **Trade-offs:** Automatic discovery is convenient but route tree is less visible/auditable than centralized list; file naming becomes contractual

#### [Pattern] Navigation shortcut binding happens declaratively in nav item configuration, then automatically wired via keyboard handler - no imperative event binding needed (2026-02-18)
- **Problem solved:** Ideation keyboard shortcut added as `shortcut: shortcuts.ideation` property on nav item, keyboard handler in use-navigation.ts lines 269-277 automatically maps it to navigation
- **Why this works:** Centralizes shortcut definitions with nav items (single source of truth), prevents scattered event listeners, makes shortcuts auditable in one place
- **Trade-offs:** Declarative approach requires keyboard handler infrastructure but eliminates imperative listener management and duplicate code

#### [Pattern] Navigation items are objects with declarative properties (id, label, icon, shortcut) rather than components - enables centralized nav configuration and consistent behavior (2026-02-18)
- **Problem solved:** New 'ideas' nav item added to projectItems array in use-navigation.ts with specific shape and properties
- **Why this works:** Single nav item definition generates: sidebar UI item, keyboard shortcut binding, and route navigation. Changes to nav structure automatically propagate everywhere
- **Trade-offs:** Declarative config is easier to maintain and audit but less flexible for nav items with custom behavior; requires hook infrastructure to consume and generate UI

#### [Pattern] Multi-entry-point tsup configuration for package.json exports map alignment (2026-02-18)
- **Problem solved:** Building a monorepo UI package with multiple logical entry points (root, atoms, molecules, organisms, lib utilities)
- **Why this works:** Each entry point in package.json exports map requires a corresponding tsup entry in the entry array. Without both, the build produces no output for that path and consumers get import failures despite the export being declared.
- **Trade-offs:** Multiple entries increase build time slightly and create more dist files, but enables granular package consumption and proper tree-shaking per entry point. Consumers can import only what they need.

### Vite alias required for workspace CSS imports in monorepo. Added `@protolabs/ui` alias pointing to `libs/ui/src` in vite.config.mts (2026-02-18)
- **Context:** Theme CSS files moved from apps/ui to libs/ui, but Vite couldn't resolve relative path imports during build. Build failed with module resolution errors.
- **Why:** Vite's CSS import resolution and Tailwind's content scanning require explicit alias mappings for workspace packages. Without the alias, Vite treats the relative path as external and fails to bundle CSS.
- **Rejected:** Using package.json 'exports' field alone. Package exports work for JS imports but not for CSS file resolution during Vite build. Also rejected: symlink resolution—unreliable across platforms.
- **Trade-offs:** Alias adds build config complexity but guarantees consistent resolution. Alternative of using fully-qualified package imports (@protolabs/ui/themes.css) would require additional loader configuration and wouldn't work with Tailwind's content scanning.
- **Breaking if changed:** Removing the alias breaks the build immediately—Vite can't find libs/ui imports. Any future workspace CSS packages would need similar alias configuration.

#### [Gotcha] Tailwind CSS content scanning in monorepos requires explicit `@source` directive in global.css. Without it, CSS classes unique to shared packages don't generate. (2026-02-18)
- **Situation:** This was NOT part of the current feature but is a critical lesson from session history. Theme CSS files in libs/ui wouldn't be scanned by Tailwind in apps/ui unless @source directive is added to global.css.
- **Root cause:** Tailwind v4 auto-detects content by scanning from the nearest package.json upward. libs/ui/src is outside apps/ui's scan scope. The @source directive extends the scan to include that directory.
- **How to avoid:** @source directive is explicit and maintainable but easy to forget. Default scanning is simpler but fails silently for monorepos. Explicit wins for reliability.

#### [Gotcha] CSS import path uses relative traversal (../../../../libs/ui/src/themes/base.css) from app-level global.css to shared package-level theme file. This creates a fragile dependency on directory structure. (2026-02-18)
- **Situation:** When extracting theme definitions from monorepo app to shared package, the import statement must reach across the workspace tree.
- **Root cause:** Relative paths work because Tailwind CSS 4 processes @import statements without path resolution during compilation. Workspace symlinks don't apply to CSS-level imports.
- **How to avoid:** Relative paths are fragile to directory moves but work immediately. Package-level imports would be cleaner but require PostCSS plugin for CSS module resolution, adding build complexity.

#### [Pattern] CSS variable extraction creates two-level indirection: @theme inline (Tailwind → CSS var bridge) + :root declaration (CSS var → actual values). This decouples token naming from value assignment. (2026-02-18)
- **Problem solved:** Tailwind 4 @theme blocks expect CSS variables as values, but color values are expressed in oklch color space. Separating the mapping from the values allows reuse across themes.
- **Why this works:** The pattern allows @custom-variant definitions and @theme inline to remain static (theme-agnostic structure), while :root and @media (prefers-color-scheme) can swap actual values. Single source of truth for token structure, multiple sources for values.
- **Trade-offs:** Extra indirection adds one layer of lookup (Tailwind → CSS var → oklch value), negligible performance cost. But it prevents accidental direct color references and forces consistent token usage.

#### [Gotcha] Pre-existing build issue (@protolabs/ui/atoms import resolution failure) blocks verification of CSS changes, creating false uncertainty about correctness. The CSS extraction itself is valid; the test failure masks other problems. (2026-02-18)
- **Situation:** After extracting theme CSS, E2E tests fail because the app won't load due to unrelated import resolution errors.
- **Root cause:** The @protolabs/ui package name mismatch (package declares @protolabs/ui, tsconfig doesn't map it, but build still references it) is a separate, pre-existing issue that prevents the app from running at all.
- **How to avoid:** CSS changes are correct and verified by static inspection (syntax, structure, line reduction), but cannot be validated via end-to-end tests until the import issue is resolved. Increasing build/test complexity to work around unrelated issues is worse than documenting the blockers.

### Multi-entry-point tsup configuration with explicit package.json exports field for theme utilities sub-export (2026-02-18)
- **Context:** Need to expose theme utilities from @protolabs/ui without polluting main export; library already uses tsup with single entry point
- **Why:** tsup's entry point array allows building isolated chunks; package.json exports creates conditional resolution paths. Consumers import @protolabs/ui/themes (clean API) which resolves to dist/themes/index.js without modifying main entry
- **Rejected:** Re-export from main index.ts (pollutes bundle, mixes concerns); separate package (adds monorepo complexity); direct dist imports (no type safety, fragile paths)
- **Trade-offs:** Requires maintaining parallel tsup config array and package.json exports in sync; slightly higher build artifact count; enables precise tree-shaking per sub-export
- **Breaking if changed:** Removing entry from tsup array or package.json exports breaks @protolabs/ui/themes imports; changing dist folder structure breaks consumer imports

### Centralized THEMES constant array over per-file theme definitions, enabling single source of truth for theme metadata (2026-02-18)
- **Context:** Apps previously had hardcoded theme lists scattered across components; adding new utilities requires consistent metadata (name, class, type, label)
- **Why:** Array of { name, class, type, label } objects enables reuse across all theme utilities; allows functions like getThemeClass() and UI dropdowns to derive data from single source; future applications can import and consume without re-defining
- **Rejected:** Enum (lacks rich metadata like labels); Record<string, ThemeInfo> (loses order); inline definitions in each utility function (high duplication, hard to sync)
- **Trade-offs:** Adds small runtime overhead (one array definition); enables powerful composability and eliminates duplication; slight learning curve for consumers (must understand THEMES structure)
- **Breaking if changed:** Removing THEMES breaks all downstream code that uses it; changing structure (e.g., renaming 'class' to 'className') requires cascading updates in all consumers and type definitions

#### [Gotcha] Node.js-specific dependencies bundled into browser build when moving components between packages without declaring them in the target package (2026-02-18)
- **Situation:** Moved `markdown` component from apps/ui to libs/ui. Build failed with Node.js module errors (fs, path) because react-markdown, rehype-raw, rehype-sanitize were in apps/ui/package.json but not libs/ui/package.json. Vite bundled them as external dependencies into the browser build.
- **Root cause:** Package.json dependencies control what Vite can resolve. When a package imports a dependency it doesn't declare, the bundler treats it as external and includes it in the output, causing runtime failures in the browser.
- **How to avoid:** Adding dependencies to libs/ui increases package size and dependency surface, but ensures the package is truly portable and doesn't depend on consumer package.json entries. Required for publishing @protolabs/ui as a standalone package.

### Move dependent components (hotkey-button before confirm-dialog) in dependency order to avoid circular references when consolidating into single package (2026-02-18)
- **Context:** confirm-dialog depends on hotkey-button. Both were in apps/ui but needed to move to libs/ui/molecules. Moving only confirm-dialog first would create cross-package dependency (confirm-dialog in libs/ui → hotkey-button in apps/ui).
- **Why:** When consolidating related components into a shared package, topological ordering prevents circular dependency chains across package boundaries. Keeping dependent components in the same package ensures they share the same resolution scope.
- **Rejected:** Moving all components simultaneously without ordering. Creates merge conflicts and makes it harder to identify which dependency causes build failures.
- **Trade-offs:** Requires upfront dependency mapping before refactoring. Easier verification and isolation of build issues per component. Slightly more manual effort vs. bulk-moving everything.
- **Breaking if changed:** If confirm-dialog remains in apps/ui while hotkey-button moves to libs/ui, the import path becomes apps/ui → libs/ui → apps/ui (circular reference through import chain), causing module resolution loops or duplicate instantiation.

#### [Pattern] libs/ui package uses relative imports with .js extensions (e.g., `from '../atoms/button.js'`) instead of aliased paths (@protolabs/ui/atoms) within the library (2026-02-18)
- **Problem solved:** When moving components to libs/ui, internal imports must use relative paths with .js extensions, not the @protolabs/ui alias. The alias is only for external consumers (apps/ui, etc).
- **Why this works:** ESM module resolution in Node.js requires explicit extensions in relative imports. Internal package imports using relative paths resolve directly without going through the export map. Using aliases internally would create circular reference issues during bundling and adds resolution overhead.
- **Trade-offs:** Internal imports are less consistent with external API, but avoids circular resolution. Requires developers to know the internal convention. However, this is standard practice in monorepo libraries (shadcn/ui follows same pattern).

#### [Pattern] Package.json exports field with type definitions (./molecules export) enables TypeScript and build tools to resolve both ESM and type definitions without manual tsconfig paths (2026-02-18)
- **Problem solved:** libs/ui/package.json already had `./molecules` configured in exports with types field pointing to dist/molecules/index.d.ts. This made the component consolidation work immediately without adding tsconfig paths or additional configuration.
- **Why this works:** Modern Node.js and TypeScript resolve packages via exports field first, before falling back to main/types. Properly configured exports work for both runtime (ESM) and type-checking without duplication. This follows Node.js package standard.
- **Trade-offs:** Requires upfront configuration of package.json exports (which was already done), but eliminates need for tsconfig paths coordination. Scales better across monorepo projects.

#### [Gotcha] NPM workspace hoisting causes version conflicts when different workspace packages need incompatible versions of the same dependency (e.g., apps/ui@Storybook^10.2.8 vs libs/ui@Storybook^8.4.7). Hoisting aggregates dependencies to root node_modules, forcing version resolution that may break the package with stricter constraints. (2026-02-18)
- **Situation:** Moving Storybook config from apps/ui to libs/ui failed with runtime errors ('No matching export for definePreview', 'Missing ./internal/theming'). Root cause: NPM hoisted the newer v10.2.8 from apps/ui to root, breaking v8.4.7 consumers in libs/ui.
- **Root cause:** NPM workspace hoisting is a dependency deduplication optimization—it moves common dependencies to root to save disk space. However, this breaks when versions are incompatible across workspaces, and there's no automatic fallback to workspace-local node_modules.
- **How to avoid:** NPM hoisting saves disk space but forces version lock-in across all workspaces. Isolation (pnpm strict-peer-dependencies or yarn workspaces) would prevent this but costs disk/install time. Monorepo split (Storybook in separate repo) eliminates conflict but increases operational complexity.

#### [Pattern] Theme decorator with toolbar switcher pattern: Create a Storybook preview decorator that imports all theme CSS files and exposes theme selection via the toolbar control. The decorator applies a theme class to the story container, allowing all stories to inherit theme styling without manual per-story setup. (2026-02-18)
- **Problem solved:** libs/ui has 6 theme variants (violet/zinc/slate × dark/light). Goal: allow theme switching in Storybook without duplicating 6 theme CSS imports in every story file.
- **Why this works:** Centralizing theme setup in the preview decorator scales with N theme variants—adding a 7th theme only requires updating preview.tsx (one file) and doesn't touch individual story files. The toolbar control is discoverable (visible in Storybook UI) and doesn't require story code changes.
- **Trade-offs:** Importing all theme files upfront (at preview load time) means all CSS is parsed even if only 1 theme is active. Alternative: lazy-load theme CSS only when selected (requires async decorator, more complex). The current approach is simpler and theme CSS files are small (~1KB each).

### Configure Storybook story glob to scan monorepo paths (../src/**/*.stories.*) instead of app-specific paths. This decouples story discovery from app location, allowing libs/ui stories to be found by name pattern alone. (2026-02-18)
- **Context:** apps/ui previously had Storybook scanning apps/ui/src/. When moving Storybook config to libs/ui, the glob needed to point to libs/ui/src/ instead. Question: should it reference relative paths (../src/) or absolute paths (@protolabs/ui)?
- **Why:** Relative paths are the Storybook convention (main.ts in .storybook/ is the reference point). They're agnostic to monorepo structure and work with any workspace layout. Absolute paths (@protolabs/ui/src/) would require resolving package imports, adding a dependency on webpack/tsup import configuration.
- **Rejected:** Absolute imports using @protolabs/ui (adds coupling to package name and import resolution configuration; harder to refactor if package is renamed). Glob that includes both apps/ui and libs/ui (creates confusion about which stories are canonical; duplicates stories if both locations exist).
- **Trade-offs:** Relative paths are simple and discoverable but break if someone moves .storybook/ to a different depth (would need to update ../../../src/ refs). Absolute imports are more resilient to directory reshuffles but require import resolution setup.
- **Breaking if changed:** If you change the glob pattern, stories won't be discovered—Storybook UI shows empty story list. If you move .storybook/ without updating ../src/ paths, stories disappear again.

### Storybook story files located in libs/ui/src/atoms/ (shared package) rather than apps/ui/src/ (app project), with configuration update to scan both locations (2026-02-18)
- **Context:** Component library (@protolabs/ui) is a shared package in monorepo. Stories need discovery by Storybook running in apps/ui app.
- **Why:** Stories are part of the component library contract, not the consuming app. Co-locating stories with components in libs/ makes them versioned with the library and re-usable across any app that imports components.
- **Rejected:** Keeping stories only in apps/ui/src/ would decouple component documentation from the library itself, making it impossible to document components when the library is consumed by external projects.
- **Trade-offs:** Requires Storybook config to explicitly include out-of-project paths (../../../libs/ui/src/). Without this config, story discovery fails silently (no error, just missing stories). Discovered stories now come from TWO locations, increasing cognitive load for maintainers.
- **Breaking if changed:** Removing the '../../../libs/ui/src/**/*.stories.@(js|jsx|mjs|ts|tsx)' entry from .storybook/main.ts stories array causes 25 stories to vanish from Storybook with no error message—only detection is 'fewer stories than expected'.

#### [Gotcha] CSF3 stories in monorepo shared packages (libs/) with relative imports to component src files can fail silently during Storybook build if typescript path resolution hasn't resolved workspace symlinks (2026-02-18)
- **Situation:** Stories import from @automaker/ui components using workspace symlink, which must be fully resolved before Storybook transpiles stories.
- **Root cause:** Monorepo workspace symlinks are 'lazy'—they exist but don't guarantee module resolution order. Storybook can transpile and bundle the story file before the symlink is followed, resulting in 'module not found' at runtime.
- **How to avoid:** Using workspace symlinks (@automaker/ui) is correct long-term (works in both monorepo and published package) but requires careful Storybook config and occasionally needs full clean rebuild to fix symlink resolution issues.

### Storybook configuration must explicitly include shared library paths via @source directive or story discovery config, not rely on automatic scanning from project root (2026-02-18)
- **Context:** Stories in libs/ui/src/ were not being discovered by Storybook even though they existed. Tailwind CSS 4 had similar issue (PR #749) where content scanning stopped at package.json boundary
- **Why:** Storybook scans for stories relative to each project's package.json. Since libs/ui is outside apps/ui project root, stories weren't found without explicit path configuration in main.ts. This mirrors the Tailwind CSS 4 root cause from MEMORY.md
- **Rejected:** Assumption that Storybook would auto-discover all .stories.tsx files in workspace. Reality: monorepo structure requires explicit scope declaration
- **Trade-offs:** Explicit config is more verbose but guarantees story discovery across workspace boundaries. Alternative of moving stories into apps/ui/ would break the libs/ui as standalone package principle
- **Breaking if changed:** Removing the libs/ui/src path from Storybook main.ts makes all 25 component stories disappear from Storybook UI. Any future shared components in libs/ also won't be discoverable

#### [Pattern] Consistent story structure across 25 components: Default export + multiple variant exports + interactive argTypes achieves both discoverability and comprehensive prop coverage without boilerplate (2026-02-18)
- **Problem solved:** All 25 atoms follow identical pattern: Meta config, Default story, AllVariants/AllSizes/AllStates stories, argTypes for interactive controls. Total 193 stories from consistent template
- **Why this works:** Pattern scales to new components automatically. Any new atom can copy the template and fill in props. autodocs tag generates docs from Default + argTypes without additional documentation work. Consistent naming (Default, AllVariants) makes Storybook sidebar predictable
- **Trade-offs:** 194-story structure is higher maintenance than 25-story version but provides much better coverage. Developers can test all prop combinations interactively. Time investment in consistent template pays off across all 25 atoms

### Monorepo workspace commands (--workspace=@protolabs/ui) are used from repo root in CI, not with working-directory context switching (2026-02-18)
- **Context:** CI workflow needed to run build-storybook for a specific package in a monorepo. Initial implementation used working-directory: libs/ui with workspace flag, then corrected to use workspace flag from root.
- **Why:** Workspace-aware package managers (npm with workspace support) understand relative paths from the repo root. Using --workspace flag eliminates the need to change directories in CI runners, reducing state management complexity. Running from root means the PATH, environment variables, and relative imports all work consistently regardless of which package is being built.
- **Rejected:** Could have used cd libs/ui && npm run build-storybook (no workspace flag). This couples the CI step to the physical directory structure and breaks if the package moves. Working-directory context switching also makes it harder to reason about which files are where in CI logs.
- **Trade-offs:** Workspace flag requires npm 7+ (monorepo support). The package.json must be workspace-aware. Upside: CI steps are directory-agnostic and resilient to package restructuring.
- **Breaking if changed:** Removing the --workspace flag and expecting cwd to be libs/ui fails because CI starts from root. The script would need to explicitly cd first, adding state management overhead.

### prepublishOnly script (not prepare) for automatic build before npm publish in monorepo packages (2026-02-18)
- **Context:** Monorepo UI package needs build artifacts in dist/ before publishing, but developers might forget to run build before npm publish
- **Why:** prepublishOnly only runs during `npm publish`, not on every `npm install`. In a monorepo, prepare runs for every dependency install, causing unnecessary rebuilds and potential CI slowdown. prepublishOnly is surgical - only when package is actually being published.
- **Rejected:** prepare script - fires on every install, would rebuild package during workspace hoisting and for every developer setup
- **Trade-offs:** prepublishOnly is safer but requires discipline - if someone runs npm publish without a build, it fails (good failure mode). prepare is always-safe but wastes resources in monorepo context.
- **Breaking if changed:** If prepublishOnly is removed, package must be manually built before every publish, or old dist/ artifacts get shipped

#### [Pattern] Package documentation (README) should live in package root and reference upper-level philosophy docs, not duplicate content (2026-02-18)
- **Problem solved:** Creating @protolabs/ui package documentation required deciding where to place README and how to avoid duplication with docs/dev/frontend-philosophy.md
- **Why this works:** Keeps package-level docs (installation, usage, API) close to source code for discoverability, while higher-level philosophy and design decisions live in docs/ for team-wide reference. Single source of truth per layer prevents drift.
- **Trade-offs:** Requires maintaining two documents with overlapping content. Benefit: Each document serves its intended audience (package users vs. frontend team philosophy readers) without context-switching.

#### [Pattern] Code examples in README should progress from minimal (5-line getting started) to comprehensive (full component with variants/customization), not jump to advanced patterns (2026-02-18)
- **Problem solved:** Writing component usage examples for README had choice between showing just basic button import vs. layered examples of increasing complexity
- **Why this works:** Users of varying skill levels will read the README. Minimal example gets them running in < 5 minutes (acceptance criteria). Subsequent examples show variants, className overrides, cn() utility, custom themes for users who need more. Cognitive load increases gradually.
- **Trade-offs:** Longer README, but serves broader audience. Benefits: Self-contained reference without needing to jump to Storybook. Cost: More content to maintain if component API changes.

### Renamed EscalationSource.crew_escalation to lead_engineer_escalation to clarify that this enum value is actively used for Lead Engineer escalations, not legacy crew loop system. (2026-02-19)
- **Context:** Crew loop system was removed years ago, but EscalationSource.crew_escalation remained and was actively used in escalation routing. Needed to clarify naming during dead code cleanup.
- **Why:** The enum value is actively referenced in escalation-channels services (discord-channel-escalation, github-issue-channel). Renaming clarifies intent: this is for Lead Engineer, not crew. Prevents future confusion about what 'crew' means.
- **Rejected:** Could have removed the enum value entirely and aliased to a different escalation type - but that would require more refactoring of escalation routing logic. Renaming is surgical and isolated.
- **Trade-offs:** Rename requires updating 3 references across services. New name is clearer but slightly longer. Alternative of leaving 'crew_escalation' as-is would perpetuate confusion about the crew loop system.
- **Breaking if changed:** Any external code (agents, plugins, integrations) that references EscalationSource.crew_escalation will fail at runtime. This is a breaking change but necessary for clarity. Services should fail fast with 'crew_escalation is not a valid enum value' rather than silently using wrong routing.

#### [Pattern] When removing dead code systems, distinguish between dead types/configs (safe to delete) and dead but referenced enum values (must be renamed, not deleted, if still referenced). (2026-02-19)
- **Problem solved:** Crew loop system removal left behind CrewLoopSettings type, CrewMemberConfig type, crewLoops settings field, and crew event types. But EscalationSource.crew_escalation was still actively used despite crew system being gone.
- **Why this works:** Types are compile-time constraints - safe to delete if no imports reference them. But enum values are runtime identifiers - deleting an actively-used enum value causes runtime failures. Renaming makes the mismatch explicit.
- **Trade-offs:** Renaming is more work than deleting (requires 3 reference updates). But it improves code clarity and prevents future confusion about what escalation types are used for.

#### [Gotcha] npm workspace type resolution requires `npm install` at root after modifying shared packages. TypeScript doesn't auto-detect updated types in workspace dependencies even though source files were changed. (2026-02-19)
- **Situation:** Modified `libs/types/src/escalation.ts` enum. Dependent package `@automaker/server` failed to resolve new enum value despite correct source changes. Build error: enum value not found.
- **Root cause:** npm workspaces use symlinks to link packages. The symlink target's `dist/` contains the compiled JavaScript/TypeScript declarations. Modifying source doesn't update `dist/` until the package is rebuilt. Running `npm install` at root triggers workspace rebuild and re-links the packages.
- **How to avoid:** Running full `npm install` is slower than targeted rebuild, but ensures all workspace symlinks are fresh and all dependent packages see consistent types. Prevents subtle version skew bugs.

### Deleted entire `apps/server/src/services/crew-members/` directory as dead code cleanup, rather than marking functions as deprecated. (2026-02-19)
- **Context:** Directory contained only a placeholder `index.ts` file with comment 'removed'. No active code referenced it. Escalation system uses `EscalationSource.crew_escalation` (now renamed), but the crew-members service never implemented actual crew loop logic.
- **Why:** Hard deletion is appropriate for code that (1) has never been active, (2) is replaced by a different system (lead engineer escalations), and (3) has no external API contracts. Keeping deprecated code creates maintenance burden and confuses future developers about which escalation system is active.
- **Rejected:** Could have marked with `@deprecated` and kept as a reference, but the code was never functional. Deprecation is for APIs that need gradual migration; this was orphaned code.
- **Trade-offs:** Immediate cleanup removes future confusion about 'is crew loop still supported?' But loses history of the experiment in source. Git history preserves the deletion decision.
- **Breaking if changed:** Any external code that imports from `apps/server/src/services/crew-members` will fail. Build-time check confirmed no imports exist in the codebase.

#### [Pattern] Minimal surgical change: single field addition to response object rather than refactoring health endpoint structure (2026-02-19)
- **Problem solved:** Feature requirement was narrowly scoped to add one field to health check response
- **Why this works:** Least invasive change reduces risk of introducing bugs, minimizes testing surface area, and aligns with single responsibility principle
- **Trade-offs:** Quick, low-risk implementation vs opportunity to improve response structure; easy to verify vs harder to extend later

### Separate graph definitions from execution state tracking via two distinct structures: static graph-registry.ts and dynamic ContentFlowService.executionState (2026-02-19)
- **Context:** Needed to expose both LangGraph topology definitions and runtime flow execution state through single /api/engine/flows endpoint
- **Why:** Decoupling static metadata from dynamic runtime state prevents tight coupling between graph definitions and execution tracking. Allows graph definitions to be versioned/cached independently from execution state which changes frequently. Enables different services to own different concerns (graph structure vs flow lifecycle).
- **Rejected:** Alternative of embedding execution data directly in graph definitions would require updating graph objects at runtime, conflating two orthogonal concerns and making caching/versioning problematic
- **Trade-offs:** Easier to scale (graph definitions are static/cacheable) and maintain separation of concerns. Harder initially to understand that execution state comes from different source than definitions. Requires calling two systems (registry + service) to get complete picture.
- **Breaking if changed:** If execution state and definitions are merged, any change to graph structure would invalidate cached execution data. Removing the separation would require re-architecture when adding flow types with different execution tracking needs (project planning, antagonistic review flows).

#### [Gotcha] 7 distinct LangGraph topology types (linear, linear-hitl, parallel-fanout, conditional-routing, multi-stage-hitl, complex-parallel, loop) required explicit enumeration rather than inferring from edge patterns (2026-02-19)
- **Situation:** Initially assumed topology type could be derived from graph structure (number of branches, loop detection, etc.), but realized topologies represent semantic intent and constraints, not just structure
- **Root cause:** Two graphs with identical structure can have different semantics: a simple linear graph could be topology='linear' or topology='linear-hitl' depending on whether human interrupts are part of the contract. Topology is a design decision, not a computed property. Explicit enumeration forces documentation of design intent.
- **How to avoid:** Explicit enumeration adds maintenance burden (new topologies require registry updates) but provides clarity and allows topology-aware validation/routing. Alternative of inferring topology automatically would be cheaper but ambiguous.

#### [Gotcha] ContentFlowService.getExecutionState() filters for running/interrupted flows only, not completed flows, creating implicit contract about what execution state represents (2026-02-19)
- **Situation:** getExecutionState() called by API endpoint to populate executionState response, but method intentionally excludes completed flows
- **Root cause:** Execution state is meant to represent current workload/health (active flows), not historical record. Completed flows don't affect current system capacity or decision-making. This keeps execution state lightweight and fast to compute.
- **How to avoid:** Faster/smaller execution state responses. Cannot use /api/engine/flows to audit completed flows - requires separate history endpoint. Implicit contract could confuse consumers who expect all flows.

### Graph metadata fields (id, name, description, topology, nodes, edges, entryPoint, features, useCase) are required and validated at test time, not at definition time (2026-02-19)
- **Context:** Test 4 in implementation validates each graph has all required fields, catching missing fields late rather than at graph creation
- **Why:** Runtime validation catches errors after developer ships code, not preventing them. Could be caught at type level instead, but TypeScript doesn't have sealed object literal types that prevent missing properties.
- **Rejected:** Could use TypeScript interfaces to make fields required, but wouldn't catch cases where values are undefined/null or omitted
- **Trade-offs:** Test-time validation is cheaper (no TypeScript complexity) but catches errors later. Type-level validation would be earlier but adds complexity to graph registry initialization.
- **Breaking if changed:** If test 4 is removed/skipped, invalid graphs (missing entryPoint, empty nodes, etc.) could be exposed through API, causing execution failures. If fields become optional, callers must handle undefined values.

#### [Pattern] Type-discriminated unions for node data (FlowNodeData with discriminator union of specific node data types) (2026-02-19)
- **Problem solved:** Different node types (process, decision, HITL, start/end) have different data structures and validation rules
- **Why this works:** Allows type-safe extraction of node-specific data while remaining flexible. React Flow doesn't enforce data shapes, so discriminated unions provide compile-time safety without runtime overhead
- **Trade-offs:** Slightly more verbose type definitions upfront, but eliminates entire classes of runtime errors in node components

#### [Pattern] Node registry pattern: exported nodeTypes map keyed by kebab-case string IDs, separate from component definitions (2026-02-19)
- **Problem solved:** React Flow requires nodeTypes as a Map<string, ComponentType> passed to the canvas at initialization
- **Why this works:** Decouples component file organization from the runtime registry. Allows adding/removing nodes without modifying canvas initialization code. Registry lives in index.ts barrel file, making it the single source of truth
- **Trade-offs:** One additional file (index.ts) per component directory, but enables modular component discovery and lazy loading

#### [Pattern] Service-to-Graph mapping managed in frontend via SERVICE_TO_GRAPH_MAP rather than requiring backend configuration (2026-02-19)
- **Problem solved:** Need to associate engine services (auto-mode, project-planning) with their LangGraph flow definitions without backend coordination
- **Why this works:** Allows frontend to control which services expose flow visualization without backend deployment. Reduces coupling between engine service layer and graph definition layer. Makes feature extension trivial - just add a mapping entry.
- **Trade-offs:** Easier: frontend-only changes for new service integrations. Harder: frontend becomes source of truth for service-graph relationships, could diverge from actual backend capabilities if not kept in sync.

### Separate hooks for flow definition (static graph) vs flow execution (dynamic state) rather than single combined hook (2026-02-19)
- **Context:** FlowDetailPanel needs both LangGraph topology (rarely changes, 5min cache) and real-time execution state (WebSocket updates)
- **Why:** Different cache strategies and subscription patterns. Definition is mostly static - good for React Query caching. Execution is dynamic - needs WebSocket subscriptions. Separating them avoids mixing concerns and allows independent optimization.
- **Rejected:** Single useFlowData hook combining both. Would force unnecessary re-fetches when execution updates, or overly aggressive caching that misses definition changes.
- **Trade-offs:** Easier: clean separation of concerns, independent caching. Harder: component must compose two hooks, slightly more complex initialization.
- **Breaking if changed:** Combining these into one hook would break the cache invalidation strategy - definition updates would get lost among execution updates.

### Data structures use optional graphId in node data and optional onNodeClick callback rather than enforcing them everywhere (2026-02-19)
- **Context:** EngineServiceNode needed to support both regular flow visualization (no detail panel) and detailed flow exploration (with detail panel)
- **Why:** Makes the component work in multiple contexts - existing flow graph view doesn't need detail panel, but can opt-in by providing graphId and callback. Avoids breaking changes to existing components.
- **Rejected:** Required graphId and onNodeClick. Would force all consumers to provide these even if not using detail panel.
- **Trade-offs:** Easier: backward compatible, works in multiple contexts. Harder: optional properties add type uncertainty, harder to enforce that both must be provided together.
- **Breaking if changed:** Making these required would break the existing flow graph view that doesn't have detail panel integration.

#### [Gotcha] Graph registry node IDs can drift from actual implementation without enforcement mechanism (2026-02-19)
- **Situation:** coordinator-flow graph registry had 5 mismatched node IDs and was missing a 6th node that actually exists in the implementation
- **Root cause:** Registry is manually maintained separate from the actual graph definition, creating a source-of-truth problem where changes to one aren't automatically reflected in the other
- **How to avoid:** Manual registry allows flexibility for documentation/description fields but sacrifices consistency guarantees; automatic generation would guarantee sync but lose custom metadata

### Conditional routing encoded in edge definitions rather than as explicit decision nodes (2026-02-19)
- **Context:** coordinator-flow has parallel vs sequential execution modes with different routing, but edges have string conditions ('parallel or sequential') rather than decision nodes
- **Why:** Keeps logical flow simpler and avoids node proliferation; conditions likely evaluated at execution time by the framework
- **Rejected:** Could have explicit decision nodes that evaluate conditions, but would add complexity to registry representation
- **Trade-offs:** Simpler registry representation but makes it harder to visualize true execution paths statically; requires runtime knowledge to understand actual flow
- **Breaking if changed:** Graph analysis/visualization tools that don't understand condition semantics would show all edges as possible, hiding actual routing logic

#### [Gotcha] Node type assignment based on return type, not semantic purpose (2026-02-19)
- **Situation:** sequential_analysis node changed from 'processor' to 'fanout' type because it returns Send[] (multiple outputs), not because of its role
- **Root cause:** Framework uses return type to determine node type for parallel/delegation semantics
- **How to avoid:** Type system is consistent with framework implementation but can be confusing when node name doesn't match type (a 'sequential' node is type 'fanout')

### Implemented in-memory signal counters that reset on server restart rather than persisting to database (2026-02-19)
- **Context:** SignalIntakeService tracks signal counts by source (linear, github, discord, mcp) and last signal timestamp
- **Why:** Observability metrics have different lifecycle requirements than audit logs. Transient metrics allow detection of current system health without storage overhead. Matches typical observability patterns (like Prometheus metrics) where state is ephemeral
- **Rejected:** Persisting to database would add latency to signal handling, require schema migrations, and create audit log bloat for data that's only useful for current operational awareness
- **Trade-offs:** Simpler implementation and faster signal processing vs losing historical signal patterns across restarts. Users cannot query 'how many signals did we receive yesterday'
- **Breaking if changed:** If consumers start depending on signal counts surviving server restarts, this design will fail. Would require migration to persistent storage

#### [Gotcha] Signal deduplication Set capped at 1000 entries to prevent unbounded memory growth (2026-02-19)
- **Situation:** The service maintains a `processedSignals` Set to avoid double-processing. Without a cap, this Set grows indefinitely with the number of unique signal IDs processed
- **Root cause:** Long-running servers would eventually exhaust memory. 1000 entries is sufficient for duplicate detection within typical signal processing windows (seconds to minutes) while staying bounded
- **How to avoid:** Memory-safe at cost of potential duplicates if same signal ID reappears after 1000 other signals. Acceptable because reappearance within that window is extremely unlikely in normal operation

#### [Pattern] Service method `incrementSignalCount()` silently ignores unknown signal sources instead of throwing (2026-02-19)
- **Problem solved:** Signal sources are extensible (linear, github, discord, mcp); new sources might be added in future without updating this method
- **Why this works:** Forward compatibility. New signal sources can be added elsewhere in codebase without requiring simultaneous updates to signal-intake-service. Prevents cascading failures from unknown sources
- **Trade-offs:** Silently dropping unknown sources is harder to debug (source data lost silently) vs explicit error makes bugs visible. Trade debugging visibility for architectural flexibility

#### [Gotcha] Graph registry definition drift - manual registry can diverge from actual flow implementations (2026-02-19)
- **Situation:** Registry had 10 nodes for antagonistic-review, 10 for project-planning, 15 for content-creation but actual implementations had 12, 11, and 21 respectively
- **Root cause:** Single source of truth principle violated - registry was maintained separately from actual LangGraph definitions in source files
- **How to avoid:** Manual registry provides explicit control and documentation but requires discipline to keep in sync; auto-generation would be safer but adds build complexity

#### [Pattern] HITL (Human-In-The-Loop) retry pattern with increment nodes - each HITL node preceded by retry counter increments (2026-02-19)
- **Problem solved:** Content creation flow uses distributed HITL nodes (research_hitl, outline_hitl, final_review_hitl) with preceding increment nodes to track retry attempts
- **Why this works:** Separates concern of HITL approval from retry logic management; allows centralized retry counting without embedding retry semantics in HITL nodes
- **Trade-offs:** Adds more nodes (+3 increment nodes) but achieves cleaner separation of concerns; increment nodes are deterministic processors that don't require human input

### Final consolidation node pattern - all graphs route through explicit terminal nodes (done/complete) before reaching END (2026-02-19)
- **Context:** All three graphs added final processor nodes: antagonistic-review.done, project-planning.done, content-creation.complete
- **Why:** Provides single exit point for logging, cleanup, and result aggregation; prevents multiple independent paths reaching END state
- **Rejected:** Direct edges to END would be simpler but loses ability to standardize exit behavior and track completion
- **Trade-offs:** One additional node per graph adds complexity but centralizes completion logic; easier to instrument and debug exit behavior
- **Breaking if changed:** Removing terminal nodes requires refactoring all completion paths; breaks any middleware expecting final consolidation step

### Interrupt-loop marked as conceptual pattern rather than fully implemented graph (2026-02-19)
- **Context:** Interrupt-loop graph exists but is explicitly marked in description as demonstrating loop+interrupt primitives, not production flow
- **Why:** Prevents API consumers from expecting complete node/edge coverage or using it as template for real workflows
- **Rejected:** Could remove it entirely but useful for documentation of pattern support; could implement it fully but out of scope
- **Trade-offs:** Keeps reference implementation visible but flags it as non-executable; documentation reader must recognize 'conceptual' marker
- **Breaking if changed:** Removing conceptual marker causes API consumers to expect full graph definition; renaming requires updating discovery code

#### [Pattern] Singleton service instance injected through factory function dependency injection pattern (2026-02-19)
- **Problem solved:** GitWorkflowService needed to be wired from server initialization through route factory to provide real-time status
- **Why this works:** Maintains single source of truth for workflow state across all route handlers while preserving encapsulation. Factory function pattern allows services to be passed without polluting global scope or requiring context propagation
- **Trade-offs:** Requires explicit wiring in three places (service file, route factory signature, server init) but provides clear dependency graph and testability

#### [Pattern] Operation tracking with ring buffer (FIFO, max 10) instead of unbounded array (2026-02-19)
- **Problem solved:** Need to track recent git operations (commit, push, PR, merge) with success/failure outcomes for observability
- **Why this works:** Prevents unbounded memory growth in long-running server. 10 operations provides meaningful history for debugging workflow issues while staying memory-efficient. FIFO ensures oldest operations drop automatically
- **Trade-offs:** Lost visibility into operations beyond last 10, but acceptable for real-time monitoring use case

#### [Pattern] RecentOperation interface captures operation type, featureId, timestamp, and success state with optional error, rather than just success boolean (2026-02-19)
- **Problem solved:** Tracking git workflow operations (commit, push, PR create, merge) for observability and debugging
- **Why this works:** Optional error field allows capturing root cause of failures without null-checking. FeatureId provides correlation context. Timestamp (ISO string) enables analysis of operation timing and ordering without relying on client-side sorting
- **Trade-offs:** Slightly larger objects but rich context for debugging. ISO timestamp slightly larger than epoch number but unambiguous across timezones

#### [Gotcha] Orphaned type definitions in TypeScript union types can persist indefinitely without causing compilation errors if handlers exist for them, even when no code path actually uses that type value. (2026-02-19)
- **Situation:** The 'signal-intake' EngineServiceId existed in the type union and had a case handler in the status function and an icon mapping, but zero nodes in the flow graph actually emitted this value. It went unnoticed until explicit cleanup.
- **Root cause:** TypeScript only validates that values conform to the union type at call sites - it doesn't warn about unused union members. This allowed dead code to accumulate in the handler logic.
- **How to avoid:** Removing orphaned types makes the codebase cleaner but requires manual auditing since TypeScript won't flag them automatically. The alternative of keeping dead code keeps the type definition exhaustive-checked but creates maintenance burden.

#### [Pattern] Separation of concerns between EngineServiceId (typed flow graph nodes) and event classification strings (untyped WebSocket event styling) prevents over-coupling of the type system. (2026-02-19)
- **Problem solved:** The codebase maintains 'signal-intake' as an untyped string for event classification in event-stream-panel.tsx and events-tab.tsx, separate from the typed EngineServiceId union. This allows the event system to reference SignalIntakeService without coupling it to the flow graph's type system.
- **Why this works:** The event classification system doesn't need type safety since it's just mapping event prefixes to visual styles. Keeping it as magic strings decouples two independent systems that happen to reference the same service. If the EngineServiceId type changes, event classification continues working.
- **Trade-offs:** Easier to evolve the flow graph type system independently, but harder to discover all references to 'signal-intake' across the codebase without grepping. The type system doesn't enforce consistency.

#### [Pattern] SERVICE_TO_GRAPH_MAP uses Partial<Record<EngineServiceId, string>> to maintain optional mappings between engine services and graph flows (2026-02-19)
- **Problem solved:** Need to selectively enable flow detail panel for certain nodes while keeping others non-interactive
- **Why this works:** Partial<Record<T>> allows sparse mapping where only mapped services get graphId passed through, undefined for unmapped ones. This is cleaner than conditional logic in component render
- **Trade-offs:** Enables declarative mapping at cost of runtime lookup. Undefined values become falsy for click handlers, making it implicit rather than explicit disable logic

### Semantic mapping of services to flows based on conceptual workflow pattern rather than 1:1 service-to-flow coupling (2026-02-19)
- **Context:** 11 total engine services but only 6 have meaningful associated LangGraph flows for visualization
- **Why:** 5 services (decomposition, launch, git-workflow, lead-engineer-rules, reflection) represent infrastructure/utility operations not modeled as graphs. Mapping non-existent flows would cause runtime errors or require null checks everywhere
- **Rejected:** Alternative: Create placeholder graphs for all 11 services - adds graph definition overhead for non-graphable operations. Or: Put conditional logic in click handlers checking if graph exists
- **Trade-offs:** Clean mapping file at cost of incomplete coverage. Consumers must handle undefined graphId gracefully (which they do - undefined means no click handler attached)
- **Breaking if changed:** If a new service needs a flow visualization added later, both SERVICE_TO_GRAPH_MAP and the actual LangGraph definition must be created together. Missing either breaks the feature

### Used proxy data (prFeedback.trackedPRs) for git-workflow status instead of waiting for direct GitWorkflowService metrics (2026-02-19)
- **Context:** Backend service doesn't expose git workflow metrics yet, but UI needs to show real activity state
- **Why:** Unblocks UI development and provides meaningful signal using available data. trackedPRs is a strong indicator of active workflow since PR feedback tracking only happens when workflows exist
- **Rejected:** Hardcoding 'idle' status or waiting for backend metrics implementation would leave stale UI
- **Trade-offs:** Gains immediate real data but creates implicit coupling - if PR tracking logic changes, workflow status breaks silently. Requires TODO and future refactoring
- **Breaking if changed:** If prFeedback.trackedPRs semantics change (e.g., tracks closed PRs), statusLine becomes misleading without code change

#### [Gotcha] Optional chaining with nullish coalescing (?? operator) needed because engineStatus fields may be undefined or explicitly false (2026-02-19)
- **Situation:** Early in implementation, engineStatus structure may have missing fields or falsy values
- **Root cause:** Prevents false 'idle' states when field is undefined vs explicitly false. Handles both missing data (undefined) and intentional idle state (false) correctly
- **How to avoid:** More verbose syntax but bulletproofs against incomplete backend responses during development

### Decomposition wired directly to projectLifecycle.activeProjects count as throughput metric (2026-02-19)
- **Context:** Decomposition represents work breakdown into projects; need to show volume of active work
- **Why:** activeProjects is a first-class count in engine status, directly represents the scope of decomposition work. No proxy needed
- **Rejected:** Using derived metrics or flags would lose the quantitative signal that activeProjects provides
- **Trade-offs:** Simple and direct, but creates hard dependency on projectLifecycle field - if field name changes, entire logic breaks
- **Breaking if changed:** Removing or renaming projectLifecycle.activeProjects would require fallback logic or hardcoded 'idle' state

#### [Pattern] TODO comments marking both the limitation (backend doesn't expose X) and the desired future state (when SignalIntakeService exposes metrics) (2026-02-19)
- **Problem solved:** Multiple features partially wired with proxy data pending backend implementation
- **Why this works:** Creates discoverable trail for developers. Specific about what's needed (metrics exposure) from which service, reducing ambiguity for follow-up work
- **Trade-offs:** Adds code noise but prevents knowledge loss about partial implementation state

### Use synthetic placeholder work items for initial HTTP hydration instead of raw aggregate data (2026-02-19)
- **Context:** Pipeline stages needed to display correct feature counts on page load before WebSocket events arrive
- **Why:** Synthetic items maintain the existing pipeline data structure (array of work items) rather than creating a parallel data model. This allows the same rendering logic to work for both initial load and real-time updates without conditional rendering branches
- **Rejected:** Alternative: Store aggregate counts separately and render stages differently during hydration phase. This would require dual rendering logic and state models
- **Trade-offs:** Easier: Unified rendering path. Harder: Must track which items are synthetic and remove them when real events arrive, requiring stage-level state management
- **Breaking if changed:** If changed to raw aggregates, UI rendering code would need branches for 'hydrated state' vs 'real state' rendering, creating maintenance burden

#### [Gotcha] Synthetic items must be removed when the first real WebSocket event arrives for that stage, not on every event (2026-02-19)
- **Situation:** Without this, duplicate counts occur: synthetic item (showing 5 items) + real events (adding items one by one) = over-counting
- **Root cause:** HTTP hydration returns aggregated counts while WebSocket sends individual events. Removing on first event prevents this double-counting while maintaining real-time accuracy for subsequent events
- **How to avoid:** Requires stage-level flag to track 'has received real event', adding complexity. Prevents the simpler approach of just appending all events

### Add featureLoader as explicit parameter to createEngineRoutes instead of accessing it from closure (2026-02-19)
- **Context:** New pipeline-state endpoint needed access to feature data that wasn't originally part of route parameters
- **Why:** Makes dependencies explicit in function signature. Easier to mock in tests. Prevents hidden coupling to outer scope. Clearer what the routes module actually depends on
- **Rejected:** Alternative: Access featureLoader from module-level variable or through dependency injection at engine routes level
- **Trade-offs:** Requires changing call site in server index.ts (1 line change). Gains: Testability, explicit dependencies, easier to refactor
- **Breaking if changed:** If this parameter is removed, pipeline-state endpoint loses access to feature data and will fail at runtime

#### [Gotcha] Graph registry definitions can drift from actual implementation when node IDs and edge connections change during development (2026-02-19)
- **Situation:** The graph-registry.ts file had 5 incorrect node IDs and was missing the 6th node entirely, while the actual coordinator-flow.ts had the correct implementation
- **Root cause:** Declarative graph registries are separate from implementation code, making them prone to synchronization drift. When developers refactor node names or add nodes, the registry isn't automatically updated
- **How to avoid:** Trade-off between declarative clarity (registry as source of truth) vs tight coupling (auto-generate from code). Current approach requires manual verification but maintains readable declarations

### Conditional routing in coordinator-flow uses fanout pattern where fan_out node branches to research_delegate OR analyze_delegate based on execution mode (parallel vs sequential) (2026-02-19)
- **Context:** The flow needs to support two execution strategies: parallel research+analysis vs sequential analysis-only
- **Why:** Fanout pattern with conditional edges allows single orchestration point that can route to different worker pipelines without duplicating coordinator logic. More maintainable than separate coordinator implementations
- **Rejected:** Separate coordinator flows for each mode would duplicate business logic and require caller to know which flow to invoke
- **Trade-offs:** Single flow is more maintainable but adds conditional logic complexity. Node graph becomes 2D instead of linear, requiring careful edge documentation
- **Breaking if changed:** Removing conditional edges or collapsing branches would force callers to handle routing logic instead of coordinator handling it transparently

#### [Pattern] Node type mismatch between declaration and implementation: sequential_analysis declared as 'processor' in registry but actually returns Send[] (fanout behavior) (2026-02-19)
- **Problem solved:** The node executes conditional logic that produces multiple outputs to different downstream nodes based on mode
- **Why this works:** Node type in registry should reflect what the node actually does. Processor type means single output; fanout means multiple outputs. Sequential_analysis produces variable outputs (either goes to analyze_delegate or completes)
- **Trade-offs:** Accurate type declarations make graph topology self-documenting but require developers to understand node type semantics when writing implementations

#### [Pattern] Service injection into route factories via function parameters rather than global/singleton initialization (2026-02-19)
- **Problem solved:** SignalIntakeService needed to be accessible in engine routes without modifying the service itself or creating circular dependencies
- **Why this works:** Allows multiple route handlers to share the same service instance while maintaining loose coupling. Route factory functions accept all dependencies as parameters, making dependency graphs explicit and testable.
- **Trade-offs:** Requires passing services through multiple function call layers (index.ts → createEngineRoutes → route handlers), but gains explicitness and testability

### Use event listener pattern for passive signal counting rather than explicit method calls or database queries (2026-02-19)
- **Context:** SignalIntakeService needed to track real-time signal counts by source without modifying every place signals are emitted
- **Why:** The application already has an event system (signal:received events). Hooking into existing events means signal tracking happens automatically as a side effect, requiring no coordination logic.
- **Rejected:** Explicit increment calls at each signal source would create coupling; database queries would add I/O overhead
- **Trade-offs:** Easier maintenance and zero latency, but harder to debug if events aren't being emitted as expected. Counts exist only in memory and reset on restart.
- **Breaking if changed:** If the event system changes or the signal:received event stops being emitted, the counts would freeze

### In-memory state for signal counts rather than persistent storage (2026-02-19)
- **Context:** SignalIntakeService tracks `signalCounts` and `lastSignalAt` in memory without database backing
- **Why:** The feature spec only requires 'real status' - current session counts. In-memory tracking is simpler, has zero I/O latency, and matches the pattern of the original hardcoded data (which was also stateless per session).
- **Rejected:** Persisting to database would add complexity and I/O overhead for data that's primarily useful within a session
- **Trade-offs:** Simpler code and faster responses, but counts reset when the server restarts and can't be queried across multiple instances in a clustered deployment
- **Breaking if changed:** If the requirement changes to 'total signals ever received' or 'persist counts across restarts', the entire storage strategy would need to change

#### [Pattern] Graph registry entries must exactly mirror source file node definitions - maintaining a separate registry requires verification against source of truth (2026-02-19)
- **Problem solved:** Graph registry in graph-registry.ts was out of sync with actual graph definitions in libs/flows/src/, causing missing nodes in the registry
- **Why this works:** Decoupling registry from source files allows runtime introspection and documentation, but creates sync liability. Manual verification against source ensures consistency.
- **Trade-offs:** Easier: Manual control over registry structure. Harder: Maintaining two sources of truth; requires discipline to keep in sync

#### [Pattern] HITL (human-in-the-loop) nodes use conditional edge routing with fixed outcomes (approved/revise/failed/done) rather than generic edges (2026-02-19)
- **Problem solved:** Three graphs (antagonistic-review, project-planning, content-creation) all follow same pattern: HITL nodes with conditional exit routes
- **Why this works:** HITL represents a decision point with discrete outcomes. Using conditional edges makes the decision tree explicit and allows different paths based on human judgment without ambiguity.
- **Trade-offs:** Easier: Clear visual representation of decision workflows. Harder: More edges to maintain; each HITL adds 3-4 outbound edges

#### [Pattern] Retry counter nodes (increment_*_retry) always loop back to phase start, creating cyclic patterns within linear graphs (2026-02-19)
- **Problem solved:** content-creation graph has 6 HITL nodes paired with 3 retry counters that route back to start of their respective phases (research, outline, final_review)
- **Why this works:** Allows bounded retries without escaping the workflow entirely. Retry counter increments a counter, then conditionally loops back or exits based on retry limit.
- **Trade-offs:** Easier: Scope retries to specific phases. Harder: More complex graph with cycles; requires counter state management

#### [Gotcha] Multi-line node object definitions in TypeScript arrays are not counted by simple grep patterns - requires parsing complete node structures (2026-02-19)
- **Situation:** Attempting to count nodes with grep -c '{ id:' missed nodes that spanned multiple lines; manual verification showed all 21 nodes present
- **Root cause:** Grep with single-line patterns can't match objects that break across lines. Node objects use multi-line formatting for readability.
- **How to avoid:** Easier: Multi-line formatting is more readable. Harder: Can't use simple text counting; requires reading actual content or AST parsing

### Using own design system (@protolabs/ui branded as 'Glyphkit') as portfolio/proof-of-concept rather than third-party UI kit (2026-02-22)
- **Context:** Storybook deployment showcases design system to external users and potential clients
- **Why:** Demonstrates protoLabs methodology with real implementation; provides credible proof of design system capabilities and their design tooling approach
- **Rejected:** Use third-party design system, build separate demo system, or use generic component library
- **Trade-offs:** Requires maintaining public-facing Storybook quality; ties design system releases to marketing cadence; but increases credibility and dog-food testing
- **Breaking if changed:** If @protolabs/ui is removed or replaced, portfolio proof-of-concept disappears; existing links to Storybook become invalid

### Cloudflare Pages + Wrangler deployment path vs GitHub Pages or simpler alternatives (2026-02-22)
- **Context:** Static site deployment for design system documentation/reference
- **Why:** Likely indicates existing Cloudflare infrastructure investment; provides direct integration with Cloudflare ecosystem; supports custom domain setup
- **Rejected:** GitHub Pages (simpler, built-in), Vercel (feature-rich but third-party), Netlify (similar), S3 (requires more configuration)
- **Trade-offs:** More setup steps and API token management required; fewer feature niceties than Vercel; but tighter Cloudflare integration and potentially better performance for existing Cloudflare customers
- **Breaking if changed:** Requires valid Cloudflare API credentials and correct account configuration; changing hosts requires updating deployment workflow

#### [Pattern] Explicit multi-step operational ceremony for infrastructure setup documented before automation enabled (2026-02-22)
- **Problem solved:** Cloudflare Pages project creation and API credential configuration required before GitHub Actions can deploy
- **Why this works:** Makes prerequisite setup explicit and prevents silent deployment failures; documents expected manual steps once; provides debugging path if automation fails
- **Trade-offs:** Requires one-time manual setup and documentation overhead; but prevents mysterious deployment failures from missing credentials or misconfigured projects

#### [Pattern] Dual operational paths: automated GitHub Actions deployment plus manual CLI commands in documentation (2026-02-22)
- **Problem solved:** Users can trigger Storybook deployment either via git push (automated) or explicit commands (manual/testing)
- **Why this works:** Enables debugging without committing, one-off deployments, testing in CI environment before enabling automation, and fallback if GitHub Actions fails
- **Trade-offs:** More documentation to maintain; but significantly increases operational flexibility and debugging capability

#### [Gotcha] Path-based workflow triggers (`libs/ui/**`) are tightly coupled to directory structure; refactoring library location silently disables deployments (2026-02-22)
- **Situation:** Workflow only runs on pushes affecting `libs/ui/**` files, but this path pattern isn't validated or monitored
- **Root cause:** Optimizes CI efficiency by avoiding expensive Storybook rebuilds for unrelated commits; but creates hidden brittle dependency
- **How to avoid:** Saves CI costs and time; but creates risk of silent failures if library structure changes

### Used awk/sed incremental extraction instead of loading entire 4,480-line file into memory for refactoring (2026-02-22)
- **Context:** Refactoring monolithic index.ts with 127 tool definitions into domain modules
- **Why:** Scales to files of arbitrary size; memory footprint remains constant regardless of file size; pattern generalizes across similar legacy code refactoring tasks
- **Rejected:** In-memory string manipulation; line-by-line reading in high-level language with concatenation
- **Trade-offs:** Slightly more complex shell commands, but enables processing of arbitrarily large files; approach can be reused for similar extraction patterns in codebase
- **Breaking if changed:** If scaled to larger files with in-memory approach, hits memory limits causing script failures; refactoring process would become O(n) space instead of O(1)

### Preserved handleTool() switch statement as centralized router in index.ts rather than distributing across domain modules (2026-02-22)
- **Context:** Could have implemented factory pattern with self-registering modules or dynamic routing registry; instead kept 127-case switch as single source of truth
- **Why:** Prevents silent discovery failures where tools are added to modules but not registered; enables grep-based verification that all 127 cases present; avoids circular dependencies between modules; maintains explicit dispatch visibility
- **Rejected:** Distributed switch/case logic per domain module with factory registration; dynamic routing registry with module.register() callbacks
- **Trade-offs:** Index.ts retains routing logic (not purely aggregation layer) but guarantees consistency; distributed approach appears more modular but creates hidden dependency risks where tool availability isn't guaranteed at runtime
- **Breaking if changed:** If refactored to distributed registry pattern, developers could add tool definitions without registering in switch statement, causing runtime failures or features appearing unavailable despite being implemented

### Organized tools into 13 semantic domain modules rather than optimizing module count or pure functional grouping (2026-02-22)
- **Context:** Example: project-tools bundles Project Spec + Orchestration + Lifecycle (domains that share business concerns); could have been 4-5 large functional modules or 20+ granular feature modules
- **Why:** 13 modules balances cognitive load against discoverability sweet spot; developers can reason about related business concerns together; aligns with team's ubiquitous language; moderate navigation overhead compared to extremes
- **Rejected:** Fewer larger modules (4-5) organized by pure function type; granular feature-based split (20+ modules); arbitrary alphabetical distribution
- **Trade-offs:** Requires navigating more files than 4-module approach, but maintains coherent domain reasoning vs. 20-module scattered complexity; some domains intentionally blur traditional architectural boundaries
- **Breaking if changed:** If consolidated to fewer larger modules, finding related tools requires searching across unrelated code; if granularized to 20+ modules, cross-domain refactoring becomes scattered across many files making changes error-prone

#### [Pattern] Used static spread operator aggregation for tool collection instead of dynamic registry or factory patterns (2026-02-22)
- **Problem solved:** Index.ts imports 13 modules and combines arrays with `{...featureTools, ...agentTools, ...queueTools}` syntax
- **Why this works:** All tool references visible at parse time enabling static analysis; build tools can perform tree-shaking; verification straightforward with grep (127 total tools always verifiable); avoids runtime reflection/magic that obscures tool availability
- **Trade-offs:** Requires manual aggregation list in index.ts maintaining explicit visibility; dynamic approach would enable module independence at cost of losing build-time guarantees

#### [Gotcha] Section marker-based extraction creates coupling between documentation comments and code organization - markers drifting from actual code cause silent tool misplacement (2026-02-22)
- **Situation:** Used 30+ identified comment markers ('## Feature Management Tools', etc.) as section boundaries via grep/awk; relies on markers accurately reflecting actual tool grouping
- **Root cause:** Pragmatic approach for legacy code where structure is unclear; safer than full AST parsing; avoids need to understand code semantics deeply; can be automated reliably
- **How to avoid:** Section markers are fragile if documentation drifts but much safer than semantic transformation; won't catch drift until code review or feature testing reveals tools in wrong domain

#### [Pattern] Session state persistence to filesystem (`.automaker/stream-sessions/{sessionId}.json`) after each state transition enables recovery from server restarts during long-running external async operations (OpusClip processing). (2026-02-22)
- **Problem solved:** OpusClip processing can take hours and the polling loop might be interrupted by server crash. Without persistence, progress is lost and OpusClip job orphaned.
- **Why this works:** Atomic state saves after each transition create checkpoints. On restart, service reloads all sessions and resumes polling exactly where it left off. This is simpler than database persistence for a single-server system with atomic per-session updates.
- **Trade-offs:** Easy crash recovery and simplicity of file-based format vs. lack of queryability and concurrency limitations (but single-server architecture mitigates this).

### State machine includes both automated steps (remux, OpusClip polling) and manual steps (Gling editing, TubeBuddy scheduling) as explicit state transitions. Manual steps must be advanced via API (`/api/stream-pipeline/sessions/advance`). (2026-02-22)
- **Context:** Full YouTube Shorts workflow requires human intervention (video editing, metadata). Cannot be fully automated, but workflow should be visible and trackable as unified system.
- **Why:** Unified state machine means single source of truth for workflow progress. UI/frontend can display complete journey from recording to published. Manual steps become explicit state transitions, making workflow status queryable.
- **Rejected:** Separate tracking system for manual steps would require UI to reconcile two independent state systems. Skipping manual tracking loses visibility into why stream isn't published yet.
- **Trade-offs:** Unified visibility and state tracking vs. requires explicit API calls to advance manual steps (users can't auto-complete these, system doesn't know when human work is done).
- **Breaking if changed:** Removing manual steps from state machine loses workflow visibility. Users cannot query 'is this stream still being edited?' Users must track Gling/TubeBuddy outside the system.

### StreamPipelineSettings stored in GlobalSettings (not ProjectSettings). Single configuration applies to all projects. (2026-02-22)
- **Context:** Ambiguous whether settings are personal workflow (global) or per-project configuration. Josh has one Twitch channel and one OBS setup.
- **Why:** Settings are tied to personal hardware/accounts (OBS output directory, Twitch channel, OpusClip credentials), not project-specific. Global scope avoids duplication if Josh adds new projects. Simpler configuration experience.
- **Rejected:** ProjectSettings would support multiple Twitch channels per installation, but adds unnecessary complexity for Josh's current single-channel setup.
- **Trade-offs:** Simpler configuration and setup vs. less flexible for future multi-channel scenarios (would require settings migration).
- **Breaking if changed:** Changing to ProjectSettings requires updating initialization, UI, and settings queries to be project-aware.

#### [Gotcha] MCP tool authentication requirement blocked automated content generation pipeline, forcing manual content creation as workaround (2026-02-22)
- **Situation:** Feature required blog post generation; content pipeline tools (create_content, export_content) were available via MCP but required API authentication that wasn't accessible
- **Root cause:** Chose manual HTML content creation to unblock feature rather than waiting for auth setup, maintaining delivery timeline
- **How to avoid:** Manual content guaranteed quality and control but is higher effort per post; automated pipeline would enable rapid future posts but adds infrastructure dependency and requires solved authentication

#### [Pattern] Used pure HTML with Tailwind CDN (script-based, no build step) instead of SSG/build system for site content (2026-02-22)
- **Problem solved:** Needed static site content deployable to Cloudflare Pages without build infrastructure, maximizing portability and deployment speed
- **Why this works:** Eliminates build tool dependency, allows content to be deployed without Node.js/npm at deployment time, reduces surface area for deployment failures, makes content portable across environments
- **Trade-offs:** Simpler deployment and easier hand-off to non-technical users; harder to reuse component code, no shared templating between pages, duplicated HTML structure, no server-side capabilities

#### [Pattern] Storybook built locally then copied to site/ as pre-built static artifact for deployment, rather than building it as part of site deployment (2026-02-22)
- **Problem solved:** Design system documentation (Storybook) needed to be published alongside marketing site; both are static content but built independently
- **Why this works:** Decouples design system build lifecycle from site build lifecycle, allows independent versioning, treats component documentation as a versioned release artifact, reduces runtime dependencies at deployment time
- **Trade-offs:** Simpler site-only deployment (no npm/build tools needed); version skew possible if Storybook not rebuilt before deploy, larger repository size from static artifacts, build workflow requires manual step

### Created comprehensive DEPLOYMENT.md with deployment instructions, social media announcement templates, and measurement checklist as formal part of feature delivery (2026-02-22)
- **Context:** New content launch requires coordination across deployment, announcement, and measurement - traditionally handled via Slack/verbal instructions, creating friction and inconsistency
- **Why:** Formalizes launch process making it repeatable and team-independent, enables anyone to conduct launch without institutional knowledge, reduces communication overhead, creates accountability trail
- **Rejected:** Verbal Slack instructions; ad-hoc deployment process; deployment documentation in README or internal wiki
- **Trade-offs:** Higher upfront documentation effort; enables consistent repeatable launches, reduces launch friction, becomes source of truth; requires maintenance if process changes
- **Breaking if changed:** If deployment process changes without updating documentation, teams follow outdated instructions and launch fails; if documentation is lost or goes out of sync, it becomes a liability pointing teams in wrong direction

#### [Pattern] Documented the unused content pipeline tools (create_content, review_content, export_content) in DEPLOYMENT.md as reference for future blog posts, even though they weren't used for this feature (2026-02-22)
- **Problem solved:** MCP tools existed for automated content generation but had authentication barriers; feature was completed via manual creation
- **Why this works:** Enables future blog posts to use pipeline without re-discovery effort, captures knowledge of existing infrastructure, reduces friction when authentication is eventually solved, serves as runbook for team
- **Trade-offs:** Documentation overhead now for future benefit; prevents re-discovery work, enables self-service workflow, creates path to automation; increases maintenance burden if tools change

#### [Pattern] Event-driven centralized signal classification: All monitors emit generic `signal:received` events which are then classified and routed by SignalIntakeService, rather than each monitor handling its own signal processing. (2026-02-22)
- **Problem solved:** Multiple social platforms (Twitter, YouTube, Substack, RSS) each have different signal structures but need to feed into a single GTM pipeline.
- **Why this works:** Centralizes routing logic in one place (SignalIntakeService.classifySignal), allowing new platforms to be added without modifying the router. Enables consistent signal processing pipeline regardless of source. Follows single responsibility principle.
- **Trade-offs:** Adds one extra layer (monitor → event → SignalIntakeService → GTM) increasing latency slightly, but provides centralized location for business logic and easier to test signal classification independently.

#### [Gotcha] Type package (`libs/types`) must be rebuilt independently before server compilation after adding new type exports, due to monorepo dependency chain. (2026-02-22)
- **Situation:** Added new monitor config interfaces to `agent-roles.ts`, updated `index.ts` exports, but server TypeScript compilation still failed to see new types until `libs/types/dist` was regenerated.
- **Root cause:** Server compilation depends on pre-built type definitions in `libs/types/dist`, not source files. Changes to source don't auto-propagate to dist without running build script.
- **How to avoid:** Monorepo structure requires explicit build ordering vs single unified build simplicity. Caught early but requires developer awareness.

### Integration registration (in BuiltInIntegrations) is decoupled from initialization wiring - integrations are registered but not connected to server startup sequence. (2026-02-22)
- **Context:** New integrations (Twitter, YouTube, Substack, RSS) are defined and registered, but their initialization/startup is deferred to future features.
- **Why:** Keeps this feature focused on core service implementation. Allows startup wiring to be implemented separately and potentially configured differently (e.g., conditionally enable platforms). Prevents circular dependencies.
- **Rejected:** Wire initialization immediately - would expand scope; Skip registration - would require duplicate work later.
- **Trade-offs:** Cleaner separation of concerns vs gap where integrations exist but don't run. Simpler current feature vs more work in future feature.
- **Breaking if changed:** If initialization code assumes all registered integrations are initialized, it will have missing services. If startup wiring is never implemented, integrations register but never start.

### Externalized SignalCounts type from signal-intake-service.ts to centralized @automaker/types/signal.ts package (2026-02-22)
- **Context:** Type needed to be imported by both server services and tools domain packages, creating cross-package dependency
- **Why:** Creating explicit contract in shared types package enforces compatibility and single source of truth. Alternative was duplicating type or using any
- **Rejected:** Keep type local to SignalIntakeService; import in tools would require circular dependency or re-exporting from server package
- **Trade-offs:** Easy cross-package reuse now, but changes to SignalCounts structure break both packages simultaneously - tightly couples them
- **Breaking if changed:** Removing from @automaker/types breaks both server and tools package imports; changing field structure breaks both packages at same time

#### [Pattern] Signal classification uses string prefix matching (twitter:, youtube:, substack:) to route to GTM category rather than enum-based dispatch (2026-02-22)
- **Problem solved:** Multiple unrelated platforms need to be classified as marketing signals and routed to same queue
- **Why this works:** Prefix pattern allows new sources to be added without modifying classification logic - new source just needs matching prefix. More extensible than hardcoded enum
- **Trade-offs:** Gained extensibility and implicit namespacing, lost type-safety of enum classification. Prefix convention is implicit, not part of public contract

### Routed all social media sources (Twitter, YouTube, Substack) to single GTM (marketing) signal category rather than platform-specific categories (2026-02-22)
- **Context:** Multiple unrelated platforms with different APIs and interaction patterns need signal classification for routing
- **Why:** Signal intelligence interpretation treats all three as marketing/communications channels. Simpler routing logic with less category overhead
- **Rejected:** Platform-specific categories (twitter_category, youtube_category); more granular classification (content_distribution, community_engagement)
- **Trade-offs:** Simpler classification logic and fewer signal queues, but groups diverse platforms together - masks different handling needs. Hard to un-group later
- **Breaking if changed:** If future requirements need platform-specific signal handling (e.g., YouTube needs different rate limits than Twitter), classification refactoring required throughout signal pipeline

#### [Pattern] Signal classification uses source prefix matching (twitter:, youtube:, substack:) rather than explicit switch statements for routing (2026-02-22)
- **Problem solved:** New signal sources need to be added to SignalIntakeService classification; pattern enables extensibility
- **Why this works:** Prefix-based routing decouples signal source additions from routing logic; new platforms require only new tool definitions and count tracking, not signal service modification
- **Trade-offs:** More flexible and scalable but requires discipline to maintain naming conventions; harder to find all signal handlers via IDE search

### Centralized SignalCounts type in @automaker/types package instead of keeping in signal-intake-service (2026-02-22)
- **Context:** Multiple packages (tools, server) need to reference signal count structure; placed in shared types package
- **Why:** Breaks circular dependency; prevents server package from exposing implementation details to tools package; establishes single source of truth
- **Rejected:** Defining SignalCounts in server package - would require tools package to depend on server or duplicate the type
- **Trade-offs:** Cleaner dependency graph but requires types package rebuild when signal structure changes; moved implementation concern to shared layer
- **Breaking if changed:** If SignalCounts moves back to server, tools package cannot type its signal handling correctly

#### [Pattern] Three-layer separation: tool definitions (social-tools.ts), API handlers (social-handlers.ts), signal routing (SignalIntakeService) (2026-02-22)
- **Problem solved:** Social media tools need definitions, implementations, and classification logic across different modules
- **Why this works:** Enables deferred implementation - tools defined before /social/* endpoints exist; handlers can call unimplemented endpoints; separates concerns for testability
- **Trade-offs:** Adds abstraction layer and extra file; enables parallelized development (tool definitions before endpoint implementation); easier to test handlers independently

### Exceeded minimum requirement (15-20) by implementing exactly 20 tools across 3 platforms with balanced distribution (7 Twitter, 8 YouTube, 6 Substack) (2026-02-22)
- **Context:** Feature scope allowed 15-20 tools; team chose deliberate distribution across platforms rather than concentrating on single platform
- **Why:** Comprehensive coverage across major social platforms; distribution ensures feature completeness; 20 is memorable boundary
- **Rejected:** 15 tools concentrated on single platform (e.g., 15 Twitter tools); variable distribution
- **Trade-offs:** Higher initial maintenance burden but more valuable feature surface; future social sources fit established pattern
- **Breaking if changed:** If reduced below 7-8 per platform, some platform functionality becomes limited; API client code must support all tool paths

#### [Gotcha] Express Response and Fetch Response API have naming conflicts when using both frameworks. Resolved by aliasing Express Response as ExpressResponse in handler signatures. (2026-02-22)
- **Situation:** When integrating OAuth handlers that use both Express request/response objects and fetch API calls, TypeScript/Node clash on Response type.
- **Root cause:** Global Response type resolves to Fetch API Response by default in modern Node/TypeScript, breaking Express-specific properties. Aliasing forces correct type binding.
- **How to avoid:** Aliasing adds clarity and maintains type safety, but developers must remember this pattern exists or face confusing type errors.

#### [Pattern] OAuth callback routes mounted before auth middleware (mounted at `/api/google` before other middleware), allowing unauthenticated access to `/oauth/callback` endpoint. (2026-02-22)
- **Problem solved:** OAuth flow requires the redirect_uri callback to be accessible without user authentication (provider initiates the callback, user not yet logged in).
- **Why this works:** Auth middleware requires valid credentials; OAuth callback must execute before this check to receive and process the authorization code from provider.
- **Trade-offs:** Simpler mounting but requires careful ordering of middleware initialization. Clear when other auth integrations exist.

#### [Pattern] OAuth token storage follows existing Linear integration pattern: store accessToken, refreshToken, tokenExpiresAt, and scopes in `settings.integrations.{service}` per-project. (2026-02-22)
- **Problem solved:** Multiple OAuth integrations needed; must decide on token storage structure and scope.
- **Why this works:** Storing under `integrations.{service}` namespace keeps related data together, parallels existing patterns for maintainability, and scopes tokens to projects (multi-project support).
- **Trade-offs:** Nested structure is slightly deeper but keeps settings organized. Per-project scoping prevents accidental cross-project token access.

### Webhook handlers use 'respond immediately with 200, process async' pattern to avoid timeout violations (2026-02-23)
- **Context:** Webhooks must complete within ~5 seconds per spec, but downstream operations (GitHub sync, Langfuse API calls) may take longer
- **Why:** Returning 200 before processing signals to the sender that the webhook was received reliably. Processing async in background allows long operations without timeout risk. Sender retries on non-2xx, creating potential duplicates if we hold response.
- **Rejected:** Synchronous processing (wait for all work to complete before responding) - would exceed webhook timeout and cause sender to retry, creating duplicate work
- **Trade-offs:** Pro: Reliable delivery signal, no timeout crashes. Con: Async errors are logged but not returned to caller; must monitor logs for silent failures.
- **Breaking if changed:** If changed to sync processing, webhook handler will timeout and crash under load during sync service operations

### TODO placeholder defers sync service integration, intentionally stopping at webhook reception (2026-02-23)
- **Context:** Webhook implementation receives and validates Langfuse events, but doesn't call downstream sync service. Feature scope explicitly stops here.
- **Why:** Scope discipline per requirements - breaking work into independent features. Sync service is separate feature. Webhook feature is complete when 'receive and validate' done.
- **Rejected:** Implementing full sync pipeline in this feature - creates coupling, makes feature harder to test, violates scope boundary
- **Trade-offs:** Pro: Feature is focused, testable, ships faster. Con: Webhook is non-functional without sync service implementation; requires coordination between features.
- **Breaking if changed:** Removing TODO without implementing sync service means webhooks are received but ignored. Calling the TODO without sync service implementation causes crashes.