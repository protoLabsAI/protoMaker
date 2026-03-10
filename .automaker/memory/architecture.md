---
tags: [architecture]
summary: architecture implementation decisions and patterns
relevantTo: [architecture]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 97
  referenced: 36
  successfulFeatures: 36
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
- **Context:** Multiple git operations (auto-mode-service.ts, git-workflow-service.ts) all need to avoid staging .automaker runtime files. Initial approach was .gitignore rules, but that created ambiguity.
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
- **Rejected:** Could have kept it in server and imported from there, but that would require create-protolab to depend on @protolabsai/server (huge bloat). Could have rewritten logic in create-protolab, but that duplicates 652 lines and creates maintenance burden
- **Trade-offs:** Extraction adds new package surface but gains true reusability. Upside: create-protolab stays lightweight. Downside: two places to maintain types/utils if not carefully unified
- **Breaking if changed:** If this function gains dependencies on @protolabsai/* packages later (auth, caching, logging from shared libs), the package extraction fails - becomes unmaintainable. Must keep this function pure or extraction was wrong

#### [Gotcha] Git command failures (like branch protection checks) initially failed silently; had to enhance runCmd() to log warnings instead of swallowing errors (2026-02-13)
- **Situation:** Extracted function inherited git error handling from original service - errors were caught but not surfaced, making debugging hard when moving to new package context
- **Root cause:** Function works fine in service context where git failures are infrequent, but in CLI extraction context where function is called in isolation, silent failures hide real problems. Users need visibility into what git checks failed
- **How to avoid:** Added logging overhead but gained observability. CLI users can now see why research returned empty git branch, DNS check, etc. Cost: slightly noisier logs if git is misconfigured

#### [Pattern] Created local type definitions and utility stubs (types.ts, utils.ts) instead of importing from @protolabsai/* packages (2026-02-13)
- **Problem solved:** Original function imported RepoResearchResult from @protolabsai/types and createLogger from @protolabsai/utils. Extraction required breaking these external deps
- **Why this works:** Package must be self-contained to avoid coupling create-protolab to the main monorepo. Copying types.ts (interface only, no logic) is cost-free. createLogger() stub is minimal (~5 lines) - only used for console output. This isolation pattern allows the package to evolve independently and be vendored/published separately
- **Trade-offs:** Duplication of types is minimal (interface definitions only). Gain: zero runtime deps. Lose: if core types change, must manually sync. Mitigation: types are stable, changes unlikely

### Copy entire type definitions file inline rather than import from @protolabsai/types package (2026-02-13)
- **Context:** create-protolab package needs setup pipeline types but cannot import @protolabsai/types due to runtime context where @protolabsai/types fails (likely browser environment or circular dependency)
- **Why:** Type duplication avoids runtime import failures. Package manager workspace resolution fails in certain execution contexts (create-protolab runs standalone during repo research), so local types prevent module resolution errors entirely
- **Rejected:** Re-exporting types from @protolabsai/types would be cleaner but creates hard dependency on package manager correctly resolving @protolabsai/types in all contexts where create-protolab executes
- **Trade-offs:** Maintenance burden (keep two copies in sync) vs reliability (no import-time failures). Added sync comment + potential CI check to mitigate drift
- **Breaking if changed:** If types are updated in libs/types/src/setup.ts without updating the copy, create-protolab will use stale interfaces, leading to type mismatches at composition time when features are created

#### [Gotcha] Types file must have ZERO external imports including @protolabsai/* packages to remain standalone (2026-02-13)
- **Situation:** Initial concern: would importing from @protolabsai/types break the standalone nature? Yes - any import at module load time fails in certain contexts
- **Root cause:** create-protolab is invoked in repo research phase before full monorepo build completes, and in contexts where npm workspace resolution is not available or breaks. Even @protolabsai/types (a workspace package) cannot be reliably imported
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
- **Context:** Gap analysis service needed to be extracted from server (which imports @protolabsai/types, @protolabsai/utils) into create-protolab package for use as standalone library
- **Why:** Monorepo package imports would create circular dependencies and tight coupling. Pure function with embedded types ensures create-protolab can be used independently without server build artifacts or external package resolution
- **Rejected:** Re-exporting from @protolabsai/types via package.json exports field - would still require server packages to be built and available at runtime
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
- **Why:** Workspace isolation allows npm publish of CLI without server dependencies. Consumers can install just the CLI tool globally without pulling in 500MB of server deps. Monorepo structure provides shared type safety via @protolabsai/types without tight coupling
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
- **Why this works:** Re-running phases is dangerous (e.g., re-creating git repos overwrites history). State file allows granular skip logic: phase-by-phase resume without full re-execution.
- **Trade-offs:** Easier: clear resume path, obvious state tracking. Harder: state file can go stale or be deleted (lost resume context). Mitigation: state file backed up in rollback system.

#### [Gotcha] Rollback registration must happen BEFORE operation execution, not after success (2026-02-13)
- **Situation:** Implemented rollback system where each unsafe operation registers its undo action. Initial design registered rollback after successful completion.
- **Root cause:** If operation succeeds but then system crashes before rollback registration, the operation won't be undone. Correct order: register rollback → execute operation → on error, walk rollback stack backwards.
- **How to avoid:** Easier: rollback logic follows operation logic. Harder: must pre-declare undo action without knowing final outcome (requires careful design of undo operations).

### Graceful degradation for optional tools (gh, gt) - warnings instead of FATAL errors (2026-02-13)
- **Context:** CLI requires 7+ tools. Some are optional (improve DX but not required). Question: hard requirement or soft requirement?
- **Why:** Users may have valid monorepos without gh/gt installed. Blocking on missing optional tools prevents legitimate setups. However, certain tools (git, node, npm, jq) are truly required - these are FATAL.
- **Trade-offs:** Easier: broader compatibility. Harder: feature discovery becomes implicit (users don't know gh/gt would improve setup). Mitigation: warning messages suggest tool installation.
- **Breaking if changed:** If optional tools become required (e.g., gh required for team collaboration), CI/CD setups without gh would fail. Conversely, if required tools become optional, setup skips critical validation.

#### [Pattern] Monorepo detection via workspace configuration files (pnpm-workspace.yaml, lerna.json, .yarnrc) rather than heuristic analysis (2026-02-13)
- **Problem solved:** Different package managers use different workspace formats. CLI needs to detect which one.
- **Why this works:** File-based detection is reliable (definitive signal) vs heuristics (multiple package.json files could mean monorepo or just nested projects). Fails safely: if no workspace file found, assumes single-repo setup.
- **Trade-offs:** Easier: deterministic detection. Harder: must know format for each package manager (pnpm, npm, yarn, lerna). Mitigation: list all known formats.

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
- **Breaking if changed:** If moved to packages/, must update all imports from @protolabsai/validation and adjust build pipeline. Workspace resolution would break in dependent packages.

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
- **Why:** Packages must be built in dependency order - observability only depends on @protolabsai/types, so it can be placed relatively early. Positioning matters because npm workspace builds can fail if dependencies aren't built first
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

### Delegate tracing implementation to existing middleware (wrapProviderWithTracing) in @protolabsai/observability rather than implementing tracing logic directly in TracedProvider (2026-02-13)
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

### Created dedicated @protolabsai/flows package rather than adding graph to existing packages (2026-02-13)
- **Context:** Need to manage LangGraph dependency without forcing it on all consumers of core packages
- **Why:** Monorepo architecture benefits: LangGraph is optional infrastructure (PoC), not core domain. Separate package allows selective adoption. LangGraph version bumps don't affect @protolabsai/platform stability.
- **Rejected:** Adding to @protolabsai/platform - would make LangGraph a transitive dependency for all consumers, increases coupling, makes replacement harder if better framework emerges.
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
- **Rejected:** Importing from @protolabsai/flows - would require modifying package exports and handling potential circular dependencies when service imports from flows which may import types
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

#### [Gotcha] Workspace imports must use published package names (@protolabsai/*) not relative paths to source files (2026-02-14)
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

### Vite alias required for workspace CSS imports in monorepo. Added `@protolabsai/ui` alias pointing to `libs/ui/src` in vite.config.mts (2026-02-18)
- **Context:** Theme CSS files moved from apps/ui to libs/ui, but Vite couldn't resolve relative path imports during build. Build failed with module resolution errors.
- **Why:** Vite's CSS import resolution and Tailwind's content scanning require explicit alias mappings for workspace packages. Without the alias, Vite treats the relative path as external and fails to bundle CSS.
- **Rejected:** Using package.json 'exports' field alone. Package exports work for JS imports but not for CSS file resolution during Vite build. Also rejected: symlink resolution—unreliable across platforms.
- **Trade-offs:** Alias adds build config complexity but guarantees consistent resolution. Alternative of using fully-qualified package imports (@protolabsai/ui/themes.css) would require additional loader configuration and wouldn't work with Tailwind's content scanning.
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

#### [Gotcha] Pre-existing build issue (@protolabsai/ui/atoms import resolution failure) blocks verification of CSS changes, creating false uncertainty about correctness. The CSS extraction itself is valid; the test failure masks other problems. (2026-02-18)
- **Situation:** After extracting theme CSS, E2E tests fail because the app won't load due to unrelated import resolution errors.
- **Root cause:** The @protolabsai/ui package name mismatch (package declares @protolabsai/ui, tsconfig doesn't map it, but build still references it) is a separate, pre-existing issue that prevents the app from running at all.
- **How to avoid:** CSS changes are correct and verified by static inspection (syntax, structure, line reduction), but cannot be validated via end-to-end tests until the import issue is resolved. Increasing build/test complexity to work around unrelated issues is worse than documenting the blockers.

### Multi-entry-point tsup configuration with explicit package.json exports field for theme utilities sub-export (2026-02-18)
- **Context:** Need to expose theme utilities from @protolabsai/ui without polluting main export; library already uses tsup with single entry point
- **Why:** tsup's entry point array allows building isolated chunks; package.json exports creates conditional resolution paths. Consumers import @protolabsai/ui/themes (clean API) which resolves to dist/themes/index.js without modifying main entry
- **Rejected:** Re-export from main index.ts (pollutes bundle, mixes concerns); separate package (adds monorepo complexity); direct dist imports (no type safety, fragile paths)
- **Trade-offs:** Requires maintaining parallel tsup config array and package.json exports in sync; slightly higher build artifact count; enables precise tree-shaking per sub-export
- **Breaking if changed:** Removing entry from tsup array or package.json exports breaks @protolabsai/ui/themes imports; changing dist folder structure breaks consumer imports

### Centralized THEMES constant array over per-file theme definitions, enabling single source of truth for theme metadata (2026-02-18)
- **Context:** Apps previously had hardcoded theme lists scattered across components; adding new utilities requires consistent metadata (name, class, type, label)
- **Why:** Array of { name, class, type, label } objects enables reuse across all theme utilities; allows functions like getThemeClass() and UI dropdowns to derive data from single source; future applications can import and consume without re-defining
- **Rejected:** Enum (lacks rich metadata like labels); Record<string, ThemeInfo> (loses order); inline definitions in each utility function (high duplication, hard to sync)
- **Trade-offs:** Adds small runtime overhead (one array definition); enables powerful composability and eliminates duplication; slight learning curve for consumers (must understand THEMES structure)
- **Breaking if changed:** Removing THEMES breaks all downstream code that uses it; changing structure (e.g., renaming 'class' to 'className') requires cascading updates in all consumers and type definitions

#### [Gotcha] Node.js-specific dependencies bundled into browser build when moving components between packages without declaring them in the target package (2026-02-18)
- **Situation:** Moved `markdown` component from apps/ui to libs/ui. Build failed with Node.js module errors (fs, path) because react-markdown, rehype-raw, rehype-sanitize were in apps/ui/package.json but not libs/ui/package.json. Vite bundled them as external dependencies into the browser build.
- **Root cause:** Package.json dependencies control what Vite can resolve. When a package imports a dependency it doesn't declare, the bundler treats it as external and includes it in the output, causing runtime failures in the browser.
- **How to avoid:** Adding dependencies to libs/ui increases package size and dependency surface, but ensures the package is truly portable and doesn't depend on consumer package.json entries. Required for publishing @protolabsai/ui as a standalone package.

### Move dependent components (hotkey-button before confirm-dialog) in dependency order to avoid circular references when consolidating into single package (2026-02-18)
- **Context:** confirm-dialog depends on hotkey-button. Both were in apps/ui but needed to move to libs/ui/molecules. Moving only confirm-dialog first would create cross-package dependency (confirm-dialog in libs/ui → hotkey-button in apps/ui).
- **Why:** When consolidating related components into a shared package, topological ordering prevents circular dependency chains across package boundaries. Keeping dependent components in the same package ensures they share the same resolution scope.
- **Rejected:** Moving all components simultaneously without ordering. Creates merge conflicts and makes it harder to identify which dependency causes build failures.
- **Trade-offs:** Requires upfront dependency mapping before refactoring. Easier verification and isolation of build issues per component. Slightly more manual effort vs. bulk-moving everything.
- **Breaking if changed:** If confirm-dialog remains in apps/ui while hotkey-button moves to libs/ui, the import path becomes apps/ui → libs/ui → apps/ui (circular reference through import chain), causing module resolution loops or duplicate instantiation.

#### [Pattern] libs/ui package uses relative imports with .js extensions (e.g., `from '../atoms/button.js'`) instead of aliased paths (@protolabsai/ui/atoms) within the library (2026-02-18)
- **Problem solved:** When moving components to libs/ui, internal imports must use relative paths with .js extensions, not the @protolabsai/ui alias. The alias is only for external consumers (apps/ui, etc).
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
- **Context:** apps/ui previously had Storybook scanning apps/ui/src/. When moving Storybook config to libs/ui, the glob needed to point to libs/ui/src/ instead. Question: should it reference relative paths (../src/) or absolute paths (@protolabsai/ui)?
- **Why:** Relative paths are the Storybook convention (main.ts in .storybook/ is the reference point). They're agnostic to monorepo structure and work with any workspace layout. Absolute paths (@protolabsai/ui/src/) would require resolving package imports, adding a dependency on webpack/tsup import configuration.
- **Rejected:** Absolute imports using @protolabsai/ui (adds coupling to package name and import resolution configuration; harder to refactor if package is renamed). Glob that includes both apps/ui and libs/ui (creates confusion about which stories are canonical; duplicates stories if both locations exist).
- **Trade-offs:** Relative paths are simple and discoverable but break if someone moves .storybook/ to a different depth (would need to update ../../../src/ refs). Absolute imports are more resilient to directory reshuffles but require import resolution setup.
- **Breaking if changed:** If you change the glob pattern, stories won't be discovered—Storybook UI shows empty story list. If you move .storybook/ without updating ../src/ paths, stories disappear again.

### Storybook story files located in libs/ui/src/atoms/ (shared package) rather than apps/ui/src/ (app project), with configuration update to scan both locations (2026-02-18)
- **Context:** Component library (@protolabsai/ui) is a shared package in monorepo. Stories need discovery by Storybook running in apps/ui app.
- **Why:** Stories are part of the component library contract, not the consuming app. Co-locating stories with components in libs/ makes them versioned with the library and re-usable across any app that imports components.
- **Rejected:** Keeping stories only in apps/ui/src/ would decouple component documentation from the library itself, making it impossible to document components when the library is consumed by external projects.
- **Trade-offs:** Requires Storybook config to explicitly include out-of-project paths (../../../libs/ui/src/). Without this config, story discovery fails silently (no error, just missing stories). Discovered stories now come from TWO locations, increasing cognitive load for maintainers.
- **Breaking if changed:** Removing the '../../../libs/ui/src/**/*.stories.@(js|jsx|mjs|ts|tsx)' entry from .storybook/main.ts stories array causes 25 stories to vanish from Storybook with no error message—only detection is 'fewer stories than expected'.

#### [Gotcha] CSF3 stories in monorepo shared packages (libs/) with relative imports to component src files can fail silently during Storybook build if typescript path resolution hasn't resolved workspace symlinks (2026-02-18)
- **Situation:** Stories import from @protolabsai/ui components using workspace symlink, which must be fully resolved before Storybook transpiles stories.
- **Root cause:** Monorepo workspace symlinks are 'lazy'—they exist but don't guarantee module resolution order. Storybook can transpile and bundle the story file before the symlink is followed, resulting in 'module not found' at runtime.
- **How to avoid:** Using workspace symlinks (@protolabsai/ui) is correct long-term (works in both monorepo and published package) but requires careful Storybook config and occasionally needs full clean rebuild to fix symlink resolution issues.

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

### Monorepo workspace commands (--workspace=@protolabsai/ui) are used from repo root in CI, not with working-directory context switching (2026-02-18)
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
- **Problem solved:** Creating @protolabsai/ui package documentation required deciding where to place README and how to avoid duplication with docs/dev/frontend-philosophy.md
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
- **Situation:** Modified `libs/types/src/escalation.ts` enum. Dependent package `@protolabsai/server` failed to resolve new enum value despite correct source changes. Build error: enum value not found.
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

### Using own design system (@protolabsai/ui branded as 'Glyphkit') as portfolio/proof-of-concept rather than third-party UI kit (2026-02-22)
- **Context:** Storybook deployment showcases design system to external users and potential clients
- **Why:** Demonstrates protoLabs methodology with real implementation; provides credible proof of design system capabilities and their design tooling approach
- **Rejected:** Use third-party design system, build separate demo system, or use generic component library
- **Trade-offs:** Requires maintaining public-facing Storybook quality; ties design system releases to marketing cadence; but increases credibility and dog-food testing
- **Breaking if changed:** If @protolabsai/ui is removed or replaced, portfolio proof-of-concept disappears; existing links to Storybook become invalid

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

### Externalized SignalCounts type from signal-intake-service.ts to centralized @protolabsai/types/signal.ts package (2026-02-22)
- **Context:** Type needed to be imported by both server services and tools domain packages, creating cross-package dependency
- **Why:** Creating explicit contract in shared types package enforces compatibility and single source of truth. Alternative was duplicating type or using any
- **Rejected:** Keep type local to SignalIntakeService; import in tools would require circular dependency or re-exporting from server package
- **Trade-offs:** Easy cross-package reuse now, but changes to SignalCounts structure break both packages simultaneously - tightly couples them
- **Breaking if changed:** Removing from @protolabsai/types breaks both server and tools package imports; changing field structure breaks both packages at same time

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

### Centralized SignalCounts type in @protolabsai/types package instead of keeping in signal-intake-service (2026-02-22)
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

### GitHub API interaction uses @octokit/rest REST client instead of GitHub CLI (gh) wrapper (2026-02-23)
- **Context:** Codebase has github-merge-service.ts using gh CLI. New prompt sync service needed to create/update files in GitHub.
- **Why:** REST API provides direct control over file operations (SHA retrieval, base64 encoding, commit metadata). gh CLI is a CLI wrapper better suited for merge operations. REST API is more suitable for programmatic file manipulation with required metadata handling.
- **Rejected:** Using gh CLI like github-merge-service.ts does - would require shell escaping, parsing JSON output, less direct control over commit metadata
- **Trade-offs:** REST API requires GITHUB_TOKEN env var management (added dependency on auth layer); gh wraps auth but adds shell command overhead and parsing complexity
- **Breaking if changed:** Switching to gh CLI would lose direct control over: SHA parameter for updates (no conflict errors), custom commit message formatting, base64 content encoding - would need alternate approaches to achieve same functionality

#### [Pattern] Service provides both single (syncPrompt) and batch (syncPrompts) methods with aggregated error reporting (2026-02-23)
- **Problem solved:** Need to sync prompts individually or in batch with summary results for monitoring/logging
- **Why this works:** Batch method allows callers to sync multiple prompts and get aggregate success/failure count. Caller can process all prompts without stopping on first error, then handle failures together. Single method useful for individual updates.
- **Trade-offs:** Code duplication minimized by having syncPrompts call syncPrompt in loop; adds small overhead for aggregation logic but provides better operational visibility

#### [Pattern] File path derivation follows {category}/{key}.txt structure independent of prompt name/display-name (2026-02-23)
- **Problem solved:** Prompt metadata includes category, key, name, version. Path must be deterministic and stable across renames.
- **Why this works:** Using category + key ensures path stability - if prompt name/display changes, file path stays same. This allows rename operations without moving files. category and key are semantic identifiers, not display text.
- **Trade-offs:** Path is opaque (autoMode/planningLite) but stable. Name is kept in file content/metadata for human readability.

#### [Pattern] Service instantiation at server startup with deferred initialization pattern - service accepts env vars and gracefully degrades (null instance) when preconditions unmet (2026-02-23)
- **Problem solved:** PromptGitHubSyncService requires GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME. These may not be set in all environments (dev, staging, test). Webhook handler should not crash if credentials missing.
- **Why this works:** Allows optional features to coexist in same codebase without conditional route registration or environment-specific builds. Service availability checked at call time, not startup time. Matches existing pattern in codebase for optional integrations.
- **Trade-offs:** Easier: adds optional feature without code duplication or env-specific builds. Harder: requires defensive null checks at every call site. Risk: silent no-op if credentials misconfigured (false sense of working when actually disabled).

### Webhook handler responds 200 OK immediately, processes sync asynchronously (fire-and-forget). Does not wait for GitHub API completion before returning response. (2026-02-23)
- **Context:** Langfuse expects webhook responses within 5 seconds. GitHub API round-trip (create/update file, check for existing version, handle rate limiting) may exceed this timeout.
- **Why:** Decouples webhook response latency from GitHub API latency. Prevents Langfuse from retrying webhook if sync takes >5s. Error logging allows debugging via server logs without blocking webhook client.
- **Rejected:** Alternative: await full sync before responding (violates Langfuse's SLA). Alternative: queue job for background worker (adds dependency on job queue, not implemented in current architecture).
- **Trade-offs:** Easier: simple async/await pattern, no new infrastructure. Harder: difficult to signal sync failure back to Langfuse. Risk: user has no feedback on whether sync succeeded.
- **Breaking if changed:** If response timing requirement is removed and code changes to await syncService.syncPrompt(), webhook latency becomes subject to GitHub API variability. On network issues, webhook timeout errors will spike. Langfuse may interpret repeated timeouts as webhook endpoint failure and disable it.

#### [Pattern] Service dependency injection through route factory function signature - service passed as parameter to createLangfuseRoutes(), then forwarded to handler. Not stored in closure or global state. (2026-02-23)
- **Problem solved:** Server needs to pass PromptGitHubSyncService instance to webhook handler. Handler is nested inside route factory. Service is instantiated in index.ts, far from handler definition.
- **Why this works:** Explicit dependency makes data flow visible. Route factory signature documents what services are required. Enables testing by injecting mock services. Avoids global state or service registry lookups.
- **Trade-offs:** Easier: dependencies explicit and testable. Harder: requires thread dependency through multiple function signatures (index → createLangfuseRoutes → createWebhookHandler). Risk: if intermediate function forgets to pass parameter, type system catches it but integration breaks.

### Created standalone PromptGitHubSyncService as a separate concern from prompt creation/update logic, exported as singleton for injection into existing workflows (2026-02-23)
- **Context:** CI trigger for Langfuse prompt changes needed to be decoupled from the prompt sync workflow itself to avoid tight coupling
- **Why:** Allows the service to be called opportunistically after commits without requiring changes to the core prompt sync flow. Singleton pattern reduces instantiation overhead and ensures consistent state. Separation of concerns means CI triggering can be enabled/disabled without refactoring prompt handling code.
- **Rejected:** Inline CI trigger logic directly in prompt sync service - would create tight coupling and make disabling the feature require code changes rather than env var toggle
- **Trade-offs:** One additional service class to maintain, but decoupling pays off if CI trigger logic grows or is reused elsewhere. Singleton is simpler than dependency injection but less testable.
- **Breaking if changed:** If caller expects CI trigger to fire automatically on commit, they must explicitly call triggerCIAfterCommit() - implicit/automatic triggering would require architectural change

#### [Gotcha] Used `LANGFUSE_SYNC_CI_TRIGGER` env var with strict equality check ('true' or '1' only) rather than truthy check (2026-02-23)
- **Situation:** Accidental environment variable misconfiguration (e.g., LANGFUSE_SYNC_CI_TRIGGER=false string) could trigger unwanted CI runs if using JavaScript truthy logic
- **Root cause:** Explicit string comparison prevents subtle bugs where env vars like 'false', '0', or misspelled values would be truthy in JavaScript. This is defensive programming for infrastructure code.
- **How to avoid:** Slightly more verbose code, but eliminates entire class of environment-variable-related bugs. Worth the safety cost.

#### [Pattern] Followed github-merge-service.ts pattern: promisified exec(), extended PATH for cross-platform gh CLI support, createLogger integration, no error throwing (returns error objects instead) (2026-02-23)
- **Problem solved:** New service needed to invoke gh CLI (repository_dispatch), same as existing merge service that triggers CI for merges
- **Why this works:** Consistency across codebase means developers already understand the pattern. Extended PATH ensures gh CLI works on macOS (homebrew installs to /usr/local/bin not always in default PATH). Returning error objects instead of throwing preserves caller's ability to decide error handling strategy.
- **Trade-offs:** Tight coupling to gh CLI availability (though gracefully handled), but matches team conventions. If gh is ever removed from infrastructure, this service breaks alongside github-merge-service.

### Stored prompt metadata (name, version, labels, action) in client_payload rather than as gh CLI query parameters or commit metadata (2026-02-23)
- **Context:** CI workflow needs access to which prompt changed, what version, and what action triggered the update
- **Why:** client_payload in repository_dispatch is the idiomatic GitHub way to pass context to triggered workflows. It's visible in workflow event data without parsing commit messages or metadata. Keeps prompt context with the event rather than scattered across git/CLI.
- **Rejected:** Embedding data in commit message or push event metadata - would require parsing in CI workflow and is fragile if commit format changes
- **Trade-offs:** Adds payload to every dispatch event (small), but makes workflow logic straightforward. If event payloads become very large in future, this could impact GitHub API limits.
- **Breaking if changed:** CI workflows expecting data in commit message or git tags would need to be updated to read client_payload instead

### Environment variables organized into logical sections (Required, Optional - API Keys, Optional - Security, Optional - Langfuse Integration, Optional - GitHub Sync, Optional - Debugging) in .env.example with clear comments explaining each variable's purpose and when it's needed. (2026-02-23)
- **Context:** New Langfuse webhook and GitHub sync variables needed to be documented alongside existing 15+ env vars without creating confusion about which are truly required vs optional
- **Why:** Section headers create a mental model for developers: required vars at top, then optional features grouped by subsystem (Langfuse, GitHub, Debugging). This prevents developers from activating integrations without realizing they need multiple related vars. Comments explain the WHY (observability, repository operations) not just the WHAT.
- **Rejected:** Flat list of all vars with no sections - rejected because it obscures which vars are prerequisites for each feature (e.g., LANGFUSE_WEBHOOK_SECRET only matters if Langfuse integration is active)
- **Trade-offs:** Easier: Developers understand feature prerequisites at a glance. Harder: .env.example becomes longer; requires discipline to maintain section organization when adding future vars. Breaking change risk if sections are reordered or merged.
- **Breaking if changed:** If someone relies on .env.example line counts or section positions for parsing/validation, reorganizing sections would break their tooling. Parser scripts should be resilient to whitespace and comments.

#### [Pattern] Environment variables use consistent naming convention: UPPERCASE_WITH_UNDERSCORES for all vars, with prefixes for features (LANGFUSE_*, GITHUB_*, VITE_*, AUTOMAKER_*) to indicate subsystem ownership. Defaults are inline in CLAUDE.md (e.g., 'default: langfuse-sync') and .env.example is commented-out reference only. (2026-02-23)
- **Problem solved:** 15+ existing vars already follow this pattern; new vars needed to integrate without breaking naming conventions or tooling that parses env var names
- **Why this works:** Consistent naming enables shell scripts and config loaders to auto-discover vars by prefix (e.g., grep -E '^LANGFUSE_' to find all Langfuse vars). Commented-out defaults in .env.example prevent accidental activation while documenting required vs optional. Inline defaults in CLAUDE.md serve as quick reference for developers.
- **Trade-offs:** Easier: Config tooling can auto-discover and organize by prefix. Harder: env var names are longer; requires discipline across teams to maintain prefix naming

### Multi-tier fallback strategy that assumes commits should be pushed when detection methods fail, rather than failing safely with null (2026-02-23)
- **Context:** Fresh branches (never pushed to origin) fail git rev-list comparison because remote tracking branch doesn't exist. Original code caught exceptions and silently returned null, breaking the entire workflow.
- **Why:** Errs on the side of action (false positive: might push unnecessarily) rather than silent failure (false negative: silently skips commits). Silent failures break autonomous agent workflows completely; unnecessary pushes are recoverable.
- **Rejected:** Fail-safe approach (return null when uncertain) - this was the original behavior causing the bug. Safer in isolation but catastrophic when commits are lost silently.
- **Trade-offs:** Trade certainty for robustness. Code complexity increases but robustness against distributed git state inconsistency improves. Risk of false positives (pushing when shouldn't) but prevents false negatives (silently skipping).
- **Breaking if changed:** If callers depend on null strictly meaning 'no commits exist', this breaks that invariant. Now null only means 'truly no commits' - uncertain cases return hash with warn logs.

#### [Pattern] Cascading detection strategies with decreasing certainty: remote branch compare → total commit count → HEAD existence check → last resort log inspection (2026-02-23)
- **Problem solved:** Cannot rely on any single git operation succeeding in uncertain distributed state. Each fallback has different preconditions and reliability.
- **Why this works:** Matches the actual state of git repositories: distributed, potentially incomplete, with missing refs. Each strategy trades certainty for availability.
- **Trade-offs:** Increased complexity and multiple git invocations vs. guaranteed detection even with missing refs. Lines of code increase but success rate increases for edge cases.

### Use logging level semantics (info→warn, add debug) to signal decision confidence rather than adding error handling for uncertain outcomes (2026-02-23)
- **Context:** Code encounters uncertain situations (origin/main missing, git command failures) but must continue. Can't throw errors without breaking workflow.
- **Why:** Logging levels communicate severity to operators without exceptions. Warn level signals 'unexpected but handled' better than silent info logs that hide unusual behavior.
- **Rejected:** Silently handling with info-level logs (original behavior) - makes root causes invisible. Throwing errors would break autonomous workflows.
- **Trade-offs:** Increased log verbosity but makes problems discoverable in production. Operators can now see when fallback logic triggers.
- **Breaking if changed:** If monitoring treats warn logs differently than info (alerts, metrics), this changes operational behavior. Intentional - makes silent failures visible.

#### [Gotcha] Service initialization order is an implicit dependency: FeatureLoader must be created BEFORE AgentService if tool tracking is needed. No compile error if you get this wrong—tool tracking just silently fails. (2026-02-23)
- **Situation:** Modified apps/server/src/index.ts to reorder service creation, creating FeatureLoader before AgentService
- **Root cause:** AgentService.processCompletedTools() calls featureLoader.update() at runtime. If featureLoader is undefined, the no-op graceful degradation kicks in and tracking stops working without error.
- **How to avoid:** Loose coupling (optional dependency) makes services reusable but creates a silent failure mode if dependency injection wiring is incorrect

#### [Pattern] Graceful degradation via optional feature context: AgentService.sendMessage() accepts optional featureContext parameter. When present, tool tracking activates. When absent, service operates in context-free mode with tool tracking as a silent no-op. (2026-02-23)
- **Problem solved:** Agent service needs to work both in feature-aware contexts (with tool tracking) and generic contexts (without persistence)
- **Why this works:** Allows single service to support multiple usage patterns: (1) feature-driven pipeline with data capture, (2) standalone agent invocations without feature context
- **Trade-offs:** Enables code reuse but means tool tracking failures are silent. Missing featureContext doesn't error; it just skips tracking. Callers must know to pass the parameter to get the feature.

### Optional type fields (phaseDurations?, toolExecutions?) added to PipelineState for backward compatibility. Existing features in production won't have these fields after deployment. (2026-02-23)
- **Context:** New observability fields added to existing PipelineState type used by all features
- **Why:** Ensures old feature.json files on disk don't fail validation when server reads them. Features created before this code deployed will lack these fields forever, even after server restart.
- **Rejected:** Alternative: make fields required with empty defaults—rejected because it would require migration of all existing feature.json files in production
- **Trade-offs:** Backward compatibility achieved but creates an evolutionary schema: code must always check `if (feature.pipelineState.phaseDurations)` before using. New features will have the fields; old ones won't. No way to distinguish the two cases from data alone.
- **Breaking if changed:** If fields are changed to required without providing defaults or migration logic, old features will fail to load with type validation errors

#### [Gotcha] Pre-existing p-limit TypeScript declaration generation error in libs/platform/src/secure-fs.ts was encountered during build but not fixed. Build still passes, but the issue remains. (2026-02-23)
- **Situation:** During feature implementation, encountered unrelated pre-existing build issue. Decided it was out of scope and left it unfixed.
- **Root cause:** Feature scope boundary decision: fixing platform-level build issues is separate from observability feature work. Minimal risk since build succeeds despite the error.
- **How to avoid:** Kept scope tight for this feature, but technical debt accumulates. Future changes to platform code might trigger the same error.

#### [Pattern] Real-time observability via WebSocket events: feature:tool-use events emitted alongside persistent data writes. Clients can consume tool execution data in real-time without polling feature.json. (2026-02-23)
- **Problem solved:** Tool execution tracking needs to support both persistent record-keeping AND real-time dashboard updates
- **Why this works:** Dual consumption patterns: (1) historical analysis uses persisted data from feature.json, (2) live dashboards need real-time events. Event emission enables reactive UI updates without polling.
- **Trade-offs:** Dual-path (persistence + events) provides both durability and responsiveness, but requires two code paths to keep in sync. If event emission fails, persistence still works as fallback.

#### [Pattern] Phase tracking data maintained in separate Map<featureId, PhaseData> structure merged at render time, not extended into AgentNodeData object (2026-02-23)
- **Problem solved:** Phase timeline required adding fields (currentPhase, phaseDurations, activeTool, progressPct). Could add directly to node data or keep separate.
- **Why this works:** Decouples state updates: phase events via WebSocket update only the phase map; node structure remains stable for React Flow layout engine. Prevents unnecessary graph recalculations on every phase tick. Simplifies cleanup when feature completes (remove one map entry vs deep object mutation).
- **Trade-offs:** Adds one more data structure to manage; requires merge logic at render time. Gain: phase updates don't trigger node position/size recalculations. Loss: slightly more code complexity for conditional render logic.

#### [Pattern] Use index signatures (`[key: string]: unknown`) on data types to enable runtime property extension without modifying the base type definition. (2026-02-23)
- **Problem solved:** AgentNodeData extends with pipelineState at runtime in the node-detail-sections component. pipelineState was not defined in the original type but accessed via destructuring.
- **Why this works:** Allows UI components to work with dynamically-added data from different agent implementations without creating union types or modifying core type definitions. Reduces coupling between agent runtime behavior and UI layer.
- **Trade-offs:** Gains: loose coupling, zero migration cost when backend adds properties. Loses: type safety for extended properties—no IDE autocomplete or compile-time checking for `pipelineState` access. Must document the runtime schema or risk TypeScript `as any` casts.

#### [Pattern] In monorepos with pre-existing build failures, use selective app builds (`npm run build` in apps/ui/) to verify feature changes without being blocked by unrelated package failures. (2026-02-23)
- **Problem solved:** Root-level `npm run build` failed due to p-limit import error in `@protolabsai/platform` secure-fs.ts. Feature author worked around by building only the UI app where changes were made.
- **Why this works:** Enables fast feedback loop on localized changes. Full monorepo builds are slow and often accumulate technical debt (broken imports, outdated deps). Selective builds isolate the feature's package boundary and confirm no regressions within that scope.
- **Trade-offs:** Gains: unblocked verification, fast feedback. Loses: no guarantee that the full build works after PR merges. Another PR in platform may have unblocked the build by the time feature lands.

#### [Gotcha] FeatureLoader must be initialized before AgentService in dependency injection order. If AgentService is created without FeatureLoader being available, tool tracking silently becomes a no-op with no error thrown. (2026-02-23)
- **Situation:** Service initialization in apps/server/src/index.ts was reordered. AgentService constructor now requires FeatureLoader instance to persist tool execution data.
- **Root cause:** Tool tracking only works when FeatureLoader is available for atomic writes. Silent failure means bugs are hard to detect—developers won't know observability isn't working.
- **How to avoid:** Initialization order is now a constraint. Harder to test AgentService in isolation. But guarantees tool tracking works if construction succeeds.

#### [Pattern] WebSocket events (feature:tool-use) emitted for each completed tool, enabling real-time observability dashboards without blocking the execution pipeline or tight coupling. (2026-02-23)
- **Problem solved:** Need to surface tool execution data to clients in real-time while agents are running, without the agent service knowing or caring about specific consumers.
- **Why this works:** Event emission is non-blocking and decouples observability from execution. Multiple consumers (dashboards, metrics aggregators, alerts) can subscribe independently. No coupling between agent service and consumers.
- **Trade-offs:** Adds event listener complexity, but eliminates coupling. Event emission is fire-and-forget; if emission fails, tool execution still succeeds.

#### [Pattern] lastActiveTool state tracks fading tool while activeTool tracks current tool, enabling overlapping animation states (2026-02-23)
- **Problem solved:** Need to display fade-out animation when tool completes while potentially starting a new tool
- **Why this works:** CSS transitions can't animate unmounting elements. By keeping lastActiveTool in DOM during fade, component can render two badges (one fading, one active) simultaneously
- **Trade-offs:** Requires tracking two tool references instead of one, but enables smooth visual feedback. Without this pattern, badge flickers out instead of fading

#### [Pattern] Decoupled temporal state management using Map<featureId, AgentPhaseData> separate from primary AgentNodeData structure (2026-02-23)
- **Problem solved:** Tracking real-time phase events (phase-completed, phase-entered, tool-use, progress) from WebSocket subscriptions while rendering agent nodes
- **Why this works:** Prevents cascading re-renders of parent components when phase events fire. Keeps WebSocket event handling isolated and independently testable. Parent doesn't re-render on every phase change.
- **Trade-offs:** Requires merging two data sources during render (agent node + phase map) vs simpler single-source-of-truth. Gained: testable event handling, avoided cascading re-renders.

### Added progressPct field to AgentPhaseData but deferred progress bar rendering to future feature (2026-02-23)
- **Context:** Feature scope creep risk: could implement progress bar in this PR but chose to structure infrastructure without rendering
- **Why:** Separates data infrastructure (field exists, WebSocket event wiring complete) from UI rendering (not implemented yet). Allows future feature to reuse this work without rearchitecting.
- **Rejected:** Implementing full progress bar visualization now - scope bloat. Also omitting progressPct field entirely - would require future refactor to add it.
- **Trade-offs:** Added 'dead code' field that doesn't render yet. Risk: field never gets implemented and becomes technical debt. Benefit: clear migration path for future feature.
- **Breaking if changed:** If progressPct field is removed, future progress bar feature must reconstruct the WebSocket event wiring from scratch.

### Extended existing PipelineState interface with optional phaseDurations and toolExecutions fields rather than creating separate AnalyticsPipelineState subtype. (2026-02-23)
- **Context:** Analytics telemetry (phase timings, tool execution metadata) is new data that belongs on PipelineState. Choice: modify existing type vs create new type hierarchy.
- **Why:** Optional fields maintain backward compatibility - existing code creating PipelineState doesn't require changes. Avoids type proliferation and casting. Gradual adoption model.
- **Rejected:** Creating AnalyticsPipelineState extends PipelineState with required fields forces all analytics consumers to type-narrow, breaking any code that just uses base PipelineState.
- **Trade-offs:** Optional fields require null-checks when accessed, but allow features without analytics data to coexist with those that have it. No mass refactoring required.
- **Breaking if changed:** Making fields required forces migration of all PipelineState instantiation sites. Creating subtypes breaks code expecting base type. Optional is only backward-compatible approach.

### Implemented mean, median, p95 percentile calculations manually without adding a statistics library dependency. (2026-02-23)
- **Context:** Analytics service must compute distribution statistics on phase duration arrays. Could import lodash, simple-statistics, or similar library.
- **Why:** Calculations are straightforward (sort for median, loop for mean, index for p95) - not complex enough to justify library dependency. Reduces bundle size and transitive dependency graph.
- **Rejected:** Library approach trades simplicity for maintenance burden when calculations are only ~15 lines of code. Library adds indirect dependencies that must be kept updated.
- **Trade-offs:** More code to test and maintain in-house, but enables easy customization (changing p95 to p99, adding p50, etc.). Manual approach is easier to reason about than black-box library.
- **Breaking if changed:** If you refactor to use a library, must ensure it's available in runtime (not dev-only). If you switch libraries, must verify same percentile calculation logic. Manual code is self-contained and doesn't break on transitive updates.

### Close button location is verified via hierarchical selector within panel container (`panelContainer.locator('button[aria-label...]')`). Button must be semantically contained within panel element. (2026-02-23)
- **Context:** Ensuring close button is discoverable and properly scoped to analytics panel
- **Why:** Container-scoped selectors prevent accidental button scope creep and ensure proper component encapsulation. Makes refactoring safer.
- **Rejected:** Could use page-level selector for button, but loses encapsulation guarantees
- **Trade-offs:** Stricter scoping is more maintainable but less flexible. Refactoring panel markup must preserve container relationship.
- **Breaking if changed:** If close button moves outside panel container (moved to parent or different tree), selector breaks. Tests would fail before users notice broken close action.

#### [Gotcha] Dedup state must be set AFTER validation checks, not before (2026-02-24)
- **Situation:** Original bug: processedProjects.add() was called before checking if ceremonies were enabled, causing phantom 'already processed' states when ceremonies were disabled
- **Root cause:** Setting dedup guards before validation creates a semantic gap: the project is marked as 'processed' even though the feature didn't actually run. This masks downstream failures and makes retry logic fail silently
- **How to avoid:** Requires more careful sequencing of operations, but prevents false negatives in retry mechanisms

### Dedup key format (${projectPath}:${projectSlug}) is implicitly part of the public API contract (2026-02-24)
- **Context:** clearProcessedProject() accepts projectPath and projectSlug separately, then internally constructs the dedup key using string interpolation
- **Why:** Once a method is public, its implementation details (key format) become contract details. Consistency between internal dedup logic and public method signature ensures the public method actually works as intended
- **Rejected:** Hiding the key format from callers or using different formats internally vs externally (would break retry logic)
- **Trade-offs:** Public method reveals internal key generation pattern, but ensures correctness
- **Breaking if changed:** If dedup key format changes (e.g., to use ':' separator differently), the public method becomes ineffective or breaks

#### [Gotcha] Default configuration values are behavioral contracts, not just implementation details (2026-02-24)
- **Situation:** Changing DEFAULT_CEREMONY_SETTINGS.enabled from false to true is a breaking change in system behavior despite being a 'default' config
- **Root cause:** Default values set expectations about what features are active out-of-the-box. Changing defaults affects every deployment that hasn't explicitly configured the setting, making it a breaking change in practice
- **How to avoid:** Enables ceremonies by default but changes behavior for all existing deployments without explicit opt-in

### Retry functionality implemented via event re-emission rather than direct ceremony logic invocation (2026-02-24)
- **Context:** POST /api/ceremonies/retry endpoint needed to allow retrying failed ceremonies without duplicating ceremony execution logic
- **Why:** Leverages existing event-driven architecture where ceremony service already listens to project:completed events. This reuses the full ceremony pipeline rather than reimplementing state transitions.
- **Rejected:** Direct invocation of ceremony methods would duplicate logic and bypass existing validation/state management in the event handler
- **Trade-offs:** Simpler implementation and guaranteed consistency with normal ceremony flow, but retry behavior is implicit in event system rather than explicit
- **Breaking if changed:** If ceremony service stops listening to project:completed events or changes that listener's behavior, retry becomes unreliable

#### [Pattern] Partial success semantics for batched Discord messages: Operation succeeds if ANY message succeeds, not if ALL succeed. Counter only increments on partial or full success. (2026-02-24)
- **Problem solved:** Discord has 2000 char limit, so content is split into multiple messages. Need to determine when batch operation is 'successful'.
- **Why this works:** Resilience: Avoid losing data/ceremony credit if one chunk fails. Better observability than all-or-nothing semantics. Reflects real-world expectation that partial delivery is still valuable.
- **Trade-offs:** Easier: More lenient behavior, less data loss. Harder: Counter represents 'at least partial delivery', not 'guaranteed full delivery'. Harder to troubleshoot which chunk failed.

#### [Gotcha] Shared discordPostFailures counter for 7 different ceremony types. All failure types increment same counter rather than type-specific failure counters. (2026-02-24)
- **Situation:** Different ceremony types (epicKickoff, standup, milestoneRetro, etc.) can fail independently. With one shared failure counter, can't tell which ceremony type fails most.
- **Root cause:** Simpler observability: One counter to monitor rather than 7. Signals 'we have discord problems' without distinguishing ceremony type. Focused on 'did platform stay up' not 'which ceremonies failed'.
- **How to avoid:** Easier: One number to monitor. Harder: Can't see which ceremony types are failing. Harder: Need logs to correlate failure types to ceremonies.

#### [Pattern] Local anySuccess flag accumulates across loop iterations before committing state changes. Decision to increment counter is separated from decision to emit each message. (2026-02-24)
- **Problem solved:** Emitting multiple messages in a loop, need to update state based on aggregate result, not individual message results.
- **Why this works:** Clean separation: Loop handles emission, flag accumulates, single if-block handles state commitment. Makes it impossible to update state if loop exits early or fails.
- **Trade-offs:** Easier: Single point where state changes (easier to audit, debug, add transactions). Harder: Need to maintain local variable across loop. Harder: If structure is more verbose.

#### [Gotcha] HTTP client resolved via getHttpApiClient() inside queryFn rather than direct import at hook initialization (2026-02-24)
- **Situation:** useCeremonyStatus hook needed to call ceremonies.status() API method
- **Root cause:** Direct httpApiClient import likely caused initialization/context timing issues in React Query hook execution context. Calling getHttpApiClient() defers resolution to query execution time when client is properly initialized
- **How to avoid:** Adds function call overhead but ensures client is ready when queryFn executes; makes dependency injection implicit rather than explicit

#### [Pattern] Hierarchical query key structure: queryKeys.ceremonies.status() enables cache invalidation at multiple levels (2026-02-24)
- **Problem solved:** Query key design for React Query caching and invalidation
- **Why this works:** Allows invalidating all ceremony-related queries via queryKeys.ceremonies, or specific status queries via queryKeys.ceremonies.status(). Scales to multiple ceremony endpoints
- **Trade-offs:** More complex key structure adds minimal overhead but provides powerful cache control. Requires discipline in other code to use same hierarchy

### Build-time conditional provider wrapping: PersistQueryClientProvider (web) vs QueryClientProvider (Electron) selected via VITE_SKIP_ELECTRON environment variable (2026-02-24)
- **Context:** Needed IndexedDB persistence in web but not Electron to avoid IDB overhead in electron-builder packages
- **Why:** Environment variables are resolved at Vite build time, not runtime. This allows different provider configurations to be bundled for web vs Electron, eliminating dead code and avoiding IDB initialization in Electron entirely
- **Rejected:** Runtime feature flag check using Electron API existence or window.process - would still bundle IDB code and init logic, paying overhead cost in all builds
- **Trade-offs:** Web and Electron bundles are truly different (build-time split), but requires separate build targets and can't dynamically switch at runtime. Upside: no runtime overhead in Electron, cleaner bundle.
- **Breaking if changed:** Removing the VITE_SKIP_ELECTRON check would cause Electron builds to attempt IndexedDB initialization, potentially failing on sandboxed filesystem contexts or bloating the app package

#### [Gotcha] Zustand persist middleware only hydrates store on first component import/mount, not during app initialization (2026-02-24)
- **Situation:** Test expected `automaker-ui-cache` localStorage key to exist after root component renders, but the Zustand store definition alone doesn't trigger hydration - requires actual component usage
- **Root cause:** Zustand is lazy: store.getState() on an uninitialized persist store returns default state. Middleware hooks only run when component calls useUICacheStore() hook or explicit store.getState() access happens. This matches lazy evaluation pattern across React ecosystem.
- **How to avoid:** Store initialization is implicit and deferred, making timing harder to reason about, but eliminates unnecessary hydration for unused stores. Testing requires awareness that localStorage writes happen on first component mount, not earlier.

#### [Pattern] Dual-storage strategy: localStorage for UI state config + IndexedDB for React Query cache (2026-02-24)
- **Problem solved:** UI state (sidebar toggle, current project, column order) is small/fast to access; React Query cache can be large and async-heavy
- **Why this works:** localStorage is sync, small (<5MB), suitable for small config state. IndexedDB is async, large (50MB+), better for bulk query results. Using both matches storage capability to data type and access pattern.
- **Trade-offs:** More complex (2 storage layers), but each optimized for its use case. localStorage provides sync access for UI (no render delays), IDB provides capacity for query cache without bloating main store.

### Implemented two-layer defense: (1) SDK log level configuration to reduce overall noise, (2) Prompt seeding script to eliminate root cause of 'Prompt not found' errors. (2026-02-24)
- **Context:** SDK limitation prevents complete error suppression via configuration alone. Could have chosen single approach.
- **Why:** Root cause analysis revealed that preventing the error condition (seeding prompts) is the only way to eliminate console.error logs. Configuration alone provides value for other SDK logs (DEBUG/INFO/WARN) as defense-in-depth.
- **Rejected:** Single approach of only configuring log levels (leaves console.error errors visible); single approach of only seeding without log config (leaves other SDK noise)
- **Trade-offs:** More implementation complexity (two mechanisms) but comprehensive solution that addresses both symptoms and root cause. Makes setup requirements explicit.
- **Breaking if changed:** If prompt seeding is not performed during initialization, the errors still appear. This creates a behavioral contract: seeding is now mandatory for clean logs, not optional.

#### [Pattern] Used dynamic import with try-catch to configure Langfuse SDK, relying on @langfuse/core as a transitive dependency via @langfuse/otel, without adding it as a direct dependency. (2026-02-24)
- **Problem solved:** @langfuse/core is only available as a transitive dependency (not directly listed in package.json). Could have added it as explicit dependency or skipped SDK configuration.
- **Why this works:** Graceful degradation pattern: SDK configuration is 'nice-to-have' not 'required'. If @langfuse/core becomes unavailable, the application continues working without the optimized log level. Avoids unnecessary direct dependency on implementation detail of Langfuse's dependency tree.
- **Trade-offs:** More defensive code (try-catch wrapping) vs. lighter dependency tree. Configuration is optional/best-effort rather than guaranteed. Silent failure if transitive dependency is removed.

#### [Pattern] Documented external SDK limitation (Langfuse issue #6482) in code comments and developer documentation to explain why log suppression alone cannot solve the problem. (2026-02-24)
- **Problem solved:** Solution requires both seed script and log configuration. Without understanding why, future developers might attempt to remove seeding or replace it with pure log suppression.
- **Why this works:** Prevents 'obvious but wrong' approaches by making the SDK limitation explicit. Establishes that this is a known upstream limitation, not a local implementation failure.
- **Trade-offs:** Requires maintaining references to external issues that may change, but prevents recurring implementation discussions and attempted 'fixes' that won't work.

#### [Gotcha] Silent race condition from dual independent intake paths for same external event. LinearIntakeBridge and SignalIntakeService both process Linear webhook events asynchronously, but only one had deduplication logic initially. (2026-02-24)
- **Situation:** When Linear issue moves to 'In Progress', both webhook path (LinearIntakeBridge) and signal intake path (SignalIntakeService) trigger independently, each creating a feature without knowledge of the other.
- **Root cause:** System evolved to have multiple intake mechanisms over time. Each path works correctly in isolation, so the bug only manifests when both paths are active. Developers may assume one path is 'primary' and dedup is handled there.
- **How to avoid:** Multiple intake paths provide redundancy and reliability but require careful coordination at each entry point. More paths = more places to maintain dedup logic.

#### [Pattern] Distributed deduplication pattern: when multiple independent intake mechanisms exist for same data source, deduplication logic must exist at each entry point, not centralized. (2026-02-24)
- **Problem solved:** Only LinearIntakeBridge had findByLinearIssueId check; SignalIntakeService (different intake path for same source) didn't, despite both creating features from same Linear issues.
- **Why this works:** Each intake path may fire independently or in any order. No guarantee which path wins the race. Centralizing dedup creates single point of failure and path-specific coordination problems. Each path must be defensive.
- **Trade-offs:** More dedup code to maintain and keep synchronized vs. reliable deduplication regardless of which path processes the event first. Code duplication acceptable for architectural resilience.

#### [Gotcha] Async event handlers for same external event create invisible coupling. Both webhook and signal intake handlers fire asynchronously without mutual awareness, creating race conditions that manifest as business logic bugs (duplicates). (2026-02-24)
- **Situation:** Single Linear webhook triggers both LinearIntakeBridge.handleIntake() and IntegrationService→SignalIntakeService path independently, both running in parallel.
- **Root cause:** Event-driven architecture doesn't enforce serial ordering of handlers. Async processing means both handlers start work before either finishes. Neither handler knows about the other.
- **How to avoid:** Parallel handlers are fast and provide redundancy but require careful dedup at each handler. Serial handlers avoid races but are slower and add coupling.

#### [Gotcha] Initially added better-sqlite3 to libs/types/package.json but should only be in root package.json since types packages must not have runtime dependencies (2026-02-24)
- **Situation:** Confusion about dependency ownership in monorepo structure - types library is meant for TypeScript type exports only
- **Root cause:** Separating types from runtime code prevents circular dependencies, allows types to be consumed by any package without pulling in database drivers. Types packages export type definitions, not executable code.
- **How to avoid:** Gains: Clean separation of concerns, types can be installed without runtime dependencies. Losses: Need to manage dependencies in correct package

#### [Gotcha] Fallback operators in disjunctive conditions create implicit permission pathways. The nullish coalescing operator (??) in `(feature.planSpec?.tasksCompleted ?? 0)` allowed stale planSpec data on terminal-status features to bypass the intended logic guard. (2026-02-24)
- **Situation:** Features with status='done' but planSpec.tasksCompleted < planSpec.tasksTotal were incorrectly eligible for re-execution. The OR condition allowed any feature with an approved planSpec to pass through regardless of status.
- **Root cause:** In systems using `condition1 OR (data.property ?? default)`, the fallback to default creates a state where invalid entities can pass through if the data property exists with certain values. The status guard alone is insufficient.
- **How to avoid:** Explicit status exclusions add verbosity but prevent silent failures from stale data. Alternative of removing planSpec checks entirely would have broken the backlog-with-approved-plan fallback.

#### [Pattern] Terminal state metadata staleness pattern: When features transition to terminal states (done, verified), their associated metadata (planSpec) is not invalidated/cleaned, creating a risk that stale metadata will influence eligibility logic in subsequent operations. (2026-02-24)
- **Problem solved:** The bug manifested because planSpec could exist on done/verified features with tasksCompleted != tasksTotal, even though those features should never be eligible for auto-mode regardless of plan completion state.
- **Why this works:** Cleaning up associated metadata on state transitions is often deferred. Systems using multiple data sources (status field + planSpec object) must protect against metadata outliving its validity.
- **Trade-offs:** Defensive guards in eligibility logic are safer for backward compatibility with existing data but require developers to remember terminal states need special handling everywhere such metadata is checked.

### Using explicit exclusion (blacklist of terminal statuses) rather than explicit inclusion (whitelist of allowed statuses) in OR-based eligibility logic when adding safety guards. (2026-02-24)
- **Context:** The fix added status guards to the planSpec fallback condition by excluding terminal states rather than creating an allowedStatuses array.
- **Why:** In a disjunctive eligibility check with multiple branches, adding new conditions via OR means new invalid cases can emerge if you only include known-good cases. Explicit exclusion of known-bad cases is more maintainable for the 'backlog OR (planSpec.approved AND ...) pattern because new statuses added to the system should naturally fall through unless explicitly allowed.
- **Rejected:** Using `const ELIGIBLE_STATUSES = ['backlog']; if (!ELIGIBLE_STATUSES.includes(status) && planSpec.approved)...` - this inverts the logic and is harder to reason about in a disjunctive context.
- **Trade-offs:** Explicit exclusion list is verbose (5 negation checks) but creates a clear firewall preventing unknown/future statuses from falling through. Inclusion would be more concise but risky for extensibility.
- **Breaking if changed:** If new feature statuses are added (e.g., 'archived', 'cancelled') without adding them to the exclusion list, those features would incorrectly become eligible for auto-mode execution if they have approved planSpecs.

### Rebase failures are non-blocking with graceful degradation - agents continue execution on stale base instead of failing (2026-02-24)
- **Context:** Agent execution must rebase onto latest origin/main, but network/merge conflicts can prevent this
- **Why:** Ensures agent execution resilience. A failed rebase is worse than executing on stale code (which still works). Preserves availability over consistency.
- **Rejected:** Make rebase blocking - fail agent execution if rebase fails. This would improve consistency but reduce availability and cause cascading failures.
- **Trade-offs:** Gained: High availability and resilience. Lost: Strict consistency guarantee - agents may execute against outdated code when rebase fails.
- **Breaking if changed:** If changed to blocking: Agents will fail when merge conflicts exist instead of proceeding, causing outages during periods of rapid main merges.

#### [Pattern] Rebase integrated at 3 execution points (executeFeature, executePipelineStep, followUpFeature) rather than single entry point (2026-02-24)
- **Problem solved:** Multiple independent code paths trigger agent execution with different calling conventions
- **Why this works:** Indicates execution paths don't converge at a common parent. Adding rebase at a single higher point would miss some paths. Three touchpoints guarantee all executions rebase regardless of entry point.
- **Trade-offs:** Gained: Coverage of all paths. Lost: Code duplication (rebase logic appears 3 times). Maintenance burden if rebase logic changes.

#### [Pattern] Detect merge conflicts specifically and abort rebase cleanly rather than treating all failures the same (2026-02-24)
- **Problem solved:** Rebase can fail due to conflicts (merge required) or other reasons (network, permissions, etc)
- **Why this works:** Conflicts are recoverable and expected during parallel development. Distinguishing them from hard failures allows proper logging and monitoring. Aborting cleans up worktree state automatically.
- **Trade-offs:** Gained: Operational visibility into conflict frequency. Lost: Slightly more complex error handling code.

#### [Pattern] Use emoji indicators (⚠️, ✓) and context tags in logs for quick visual parsing of rebase outcomes during agent execution (2026-02-24)
- **Problem solved:** Rebase happens silently during agent execution in background processes/logs
- **Why this works:** Non-blocking rebase means failures don't stop execution but become silent risks. Emoji + clear messages enable ops/developers to scan logs quickly for rebase health. Indicates this is expected to fail sometimes in production.
- **Trade-offs:** Gained: Operational observability. Lost: Slightly more verbose logs. Assumes ops/developers actively monitor logs for rebase messages.

### Used programmatic image generation with Sharp's SVG compositing instead of pre-created static images or design-tool exports (2026-02-24)
- **Context:** Need to generate branded 1200x630px OG images for 5 landing pages with consistent styling and easy regeneration capability
- **Why:** Programmatic approach ensures version control (images tracked in git), reproducibility, consistency guarantees, and eliminates manual regeneration burden when branding changes. SVG overlays separate design logic from visual assets
- **Rejected:** Pre-creating in design tools (not version controlled, manual updates), batch optimization tools (requires manual image creation), or static assets (hard to update)
- **Trade-offs:** Requires thinking about design in code and learning Sharp API, but eliminates design tool dependency and ensures regeneration is trivial
- **Breaking if changed:** If switched to manual/design-tool approach, consistency breaks, regeneration becomes forgotten chore, and git history loses image evolution

#### [Pattern] Designed image generation script as idempotent - safe to run multiple times, regenerating all images from scratch rather than incremental updates (2026-02-24)
- **Problem solved:** Script must be safe for CI/CD pipelines and repeated development runs without side effects or partial state
- **Why this works:** Idempotency guarantees consistency regardless of execution count. Prevents stale images, partial updates, or version mismatches. Critical for automated systems where script might be interrupted or restarted
- **Trade-offs:** Slight inefficiency regenerating unchanged images, but infinite predictability and maintainability

### Static landing pages deployed directly to Cloudflare Pages with no build step, using Tailwind CDN for styling (2026-02-24)
- **Context:** Creating standalone landing page for mythxengine.com domain
- **Why:** Eliminates deployment complexity and build toolchain overhead. Each landing page is independent and can be deployed instantly without requiring a CI/CD build step. Cloudflare Pages serves static files directly.
- **Rejected:** Building with webpack/vite, maintaining shared component library, monorepo deployment
- **Trade-offs:** Easier: instant deployment, zero build failures, low maintenance. Harder: no code optimization, no asset bundling, potential duplication across landing pages if many exist
- **Breaking if changed:** If landing pages ever need dynamic rendering, server-side compilation, or optimized assets, this approach prevents scaling to those requirements

#### [Pattern] Infrastructure changes require parallel documentation updates: landing page addition triggers updates to both deployment.md (custom domains table) and landing-pages.md (sites table) (2026-02-24)
- **Problem solved:** Creating mythxengine landing page required updating two documentation files in addition to creating deployment artifacts
- **Why this works:** Single source of truth for operational knowledge. When manual Cloudflare steps are required (domain registration, DNS, SSL setup), documentation becomes the runbook. Keeping docs synchronized with infrastructure prevents confusion and deployment failures.
- **Trade-offs:** Easier: anyone can follow the documented steps without reading code. Harder: requires discipline to keep docs in sync with changes

### Landing pages are deployed to independent Cloudflare Pages projects with separate custom domains, rather than as routes within a monolithic site (2026-02-24)
- **Context:** Setting up mythxengine.com as a separate landing page alongside other brand sites
- **Why:** Each domain has independent deployment lifecycle, DNS settings, SSL certificates, and analytics tracking. Separation prevents one domain's configuration from affecting others. Allows different teams/stakeholders to manage different domains independently.
- **Rejected:** Deploying all landing pages under a single domain with routing (e.g., mythxengine.com routes within main site), shared Cloudflare project
- **Trade-offs:** Easier: independent scalability, separate analytics per domain, no routing complexity. Harder: more Cloudflare projects to manage, potential duplication of static HTML patterns
- **Breaking if changed:** If mythxengine needs to be a subdirectory of a parent domain rather than a standalone domain, the entire deployment architecture would need to change

#### [Pattern] Comprehensive setup guide documents all manual infrastructure steps that code cannot automate (domain registration, DNS configuration, Cloudflare Pages project creation, custom domain assignment, SSL verification) (2026-02-24)
- **Problem solved:** mythxengine.com deployment requires external service configuration that cannot be scripted in this codebase
- **Why this works:** Manual steps are a common point of failure and knowledge silos. Explicit documentation with step-by-step instructions ensures consistency, enables others to replicate setup, and serves as runbook for troubleshooting. Critical when infrastructure lives outside version control.
- **Trade-offs:** Easier: new developers can self-serve setup, reduced tribal knowledge. Harder: documentation must be maintained and kept accurate as Cloudflare UI evolves

### Use afterSign hook for notarization, not afterPack. Notarization must occur after code signing completes but before DMG artifact is created. (2026-02-24)
- **Context:** electron-builder provides multiple hook points in build pipeline (afterSign, afterPack, afterBuild). Notarization timing is critical.
- **Why:** Apple's notarization service requires a signed application bundle as input. Notarization must complete before final distribution artifact (DMG) is created, ensuring users receive notarized code.
- **Rejected:** afterPack - would attempt notarization after DMG creation, potentially on wrong artifact; afterBuild - would run before signing exists
- **Trade-offs:** afterSign is earlier in pipeline so more build steps occur after notarization, but guarantees atomicity
- **Breaking if changed:** Wrong hook placement causes notarization to skip or operate on incorrect artifact, breaking macOS security chain

#### [Pattern] Gracefully skip notarization when credentials absent (dev mode) but throw error if notarization actually fails (CI mode). Enables dual-mode operation. (2026-02-24)
- **Problem solved:** notarize.js checks for APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID environment variables and conditionally skips
- **Why this works:** Supports two distinct workflows: (1) local development without Apple credentials, (2) CI builds that fail loudly on credential misconfiguration. Alternative (always require credentials) would block all local development.
- **Trade-offs:** Silent skipping in absence of credentials could mask configuration issues, mitigated by console logging and error throwing on actual notarization failures

### Code signing implementation is prerequisite for electron-updater auto-updates on macOS. Without signature, macOS Gatekeeper blocks app updates. (2026-02-24)
- **Context:** Feature prepares infrastructure for future auto-update capability that currently exists only on Windows
- **Why:** macOS Gatekeeper validates code signatures before allowing app execution. Unsigned binaries from remote sources are blocked as security risk. This unblocks the entire cross-platform auto-update feature.
- **Rejected:** Deferring code signing until auto-update implementation phase - would require re-signing all past releases and rework
- **Trade-offs:** Adds 1-5 minutes per macOS build (notarization network latency), but unlocks critical security/UX feature
- **Breaking if changed:** Without code signing, auto-updater cannot function reliably on macOS as Gatekeeper will reject unsigned remote updates

#### [Pattern] electron-builder automatically detects signing method (traditional vs Azure) based on environment variables rather than requiring separate build configurations (2026-02-24)
- **Problem solved:** Supporting both EV certificates and Azure Trusted Signing requires different credential handling and API calls
- **Why this works:** Single build configuration that auto-detects credentials eliminates duplicate build logic and allows seamless switching between methods based on available secrets. electron-builder's detection is built-in.
- **Trade-offs:** Requires clear environment variable naming conventions so developers understand which method is active, but eliminates complexity of parallel build paths

#### [Pattern] Placing code signing documentation in docs/dev/ rather than end-user docs signals this is a developer/ops concern, not a user-facing feature (2026-02-24)
- **Problem solved:** Documentation could go in general docs, docs/dev, or docs/ops directories with different visibility implications
- **Why this works:** Code signing is an implementation detail for developers building and releasing the app, not a feature that users configure. Placing in dev docs ensures relevant audience finds it while keeping user docs focused on app usage.
- **Trade-offs:** Requires developers to look in dev docs, but prevents end-user confusion about signing requirements

#### [Gotcha] Feature description requested actual gameplay recording (content creation), but task was assigned to a code repository. Developer couldn't execute the literal requirement—an AI agent cannot record gameplay or create video/GIF files. (2026-02-24)
- **Situation:** Task: 'Record gameplay demo video/GIFs for marketing' in protoLabs/Automaker codebase (not the actual MythxEngine game)
- **Root cause:** Requirements were vague about scope. Feature title sounded like a code task but was actually a content creation task. This fundamental mismatch only surfaced after investigation.
- **How to avoid:** Pivoting to infrastructure-first (landing pages, directory structure, documentation) meant delivering something useful (the scaffolding) rather than failing at the impossible task. However, it doesn't deliver the actual marketing content.

#### [Pattern] When task requirements are ambiguous (content vs. code vs. infrastructure), use evidence-based investigation: grep the codebase, read specification files, check project boundaries, verify what actually exists versus what's referenced. Only propose solutions based on findings, not assumptions. (2026-02-24)
- **Problem solved:** Developer could have assumed MythxEngine code existed in repo, or immediately claimed task was impossible. Instead, systematically searched before proposing alternatives.
- **Why this works:** Prevents false conclusions and builds credibility with stakeholders by showing due diligence. Concrete evidence (found MythxEngine mentioned in docs, not in code) supports the proposed pivot to infrastructure.
- **Trade-offs:** Takes more time upfront (investigation) but prevents rework and wrong deliverables later. Builds trust by demonstrating understanding before proposing scope changes.

#### [Gotcha] MythxEngine is referenced in product documentation (docs/landing-pages.md) as 'shipped by protoLabs' but has no implementation in this codebase. Creates false impression that all required context exists locally. (2026-02-24)
- **Situation:** Feature task mentions MythxEngine without clarifying it's a separate product. Searching for it found only references, not actual code.
- **Root cause:** Cross-product references in shared documentation can obscure project boundaries. Developers may assume all mentioned products are within scope of current repo.
- **How to avoid:** Explicit documentation of 'shipped product' (external) vs. 'in-development feature' (internal) adds clarity but requires maintenance. Worth the cost.

### Form placed inline on page with #notify anchor, linked from hero CTA via href='#notify', rather than opening modal or navigating to separate page. (2026-02-24)
- **Context:** Directing traffic from hero section CTA to email capture form
- **Why:** Anchor navigation keeps user on familiar page context, maintains scroll position awareness, reduces friction (no page load), improves perceived performance
- **Rejected:** Modal popup - would interrupt page reading; separate form page - requires navigation, slower, breaks continuity
- **Trade-offs:** Simpler UX but form must compete with other page content for attention; anchor scroll is slower than instant focus than modal
- **Breaking if changed:** If form ID changes from 'notify' or anchor is removed, hero CTA becomes broken link with no fallback.

#### [Pattern] Analytics tracking uses feature detection (if window.umami) rather than requiring Umami to be loaded. Form works with or without analytics. (2026-02-24)
- **Problem solved:** Tracking waitlist signups while maintaining form reliability
- **Why this works:** Analytics service may load slowly or fail; form functionality shouldn't depend on non-critical infrastructure
- **Trade-offs:** Graceful degradation means occasional untracked signups if analytics is unavailable, but form always works

### Static HTML sites deployed independently to Cloudflare Pages, one project per domain, from dedicated subdirectories in site/ (2026-02-24)
- **Context:** Setting up mythxengine.com landing page following established protoLabs patterns
- **Why:** Static HTML eliminates build complexity (direct CDN deployment), Cloudflare Pages offers automatic git-connected deploys with 30-60s turnaround. Separate projects per domain provide independent caching, DNS, SSL, and rollback strategies—critical when managing multiple portfolio landing pages
- **Rejected:** Monorepo with single multi-tenant Cloudflare project using routing; SSR/framework-based approach requiring build step
- **Trade-offs:** Simpler deployment pipeline and instant propagation vs. multiple infrastructure projects to manage and coordinate DNS across domains
- **Breaking if changed:** Changing to single project requires rearchitecting Cloudflare Pages configuration, DNS routing logic, and CI/CD triggers; changing to build-based approach introduces deployment latency and build failure risks

#### [Pattern] Comprehensive infrastructure setup guide (13 sections, 213 lines) documenting all manual steps with verification checklist, despite code being ready immediately (2026-02-24)
- **Problem solved:** Landing page HTML complete but actual deployment requires manual Cloudflare/DNS configuration outside of git repository
- **Why this works:** Manual infrastructure tasks are error-prone and non-repeatable without documentation. Comprehensive guide reduces support burden, enables others to replicate setup, and makes troubleshooting deterministic. Verification checklist prevents incomplete deployments passing as successful
- **Trade-offs:** Heavy upfront documentation burden gains reproducible, supportable infrastructure setup; alternative approaches either lose reproducibility or add operational overhead

### Landing page explicitly links back to protoLabs.studio and references protoLabs methodology in branding and content (2026-02-24)
- **Context:** MythXEngine positioned as portfolio proof-of-concept using protoLabs approach, not as independent product
- **Why:** Establishes brand hierarchy and establishes MythXEngine as demonstration of protoLabs capabilities rather than standalone offering. Backlinks improve SEO for protoLabs domain and clarify business relationship to users
- **Rejected:** Standalone branding with no protoLabs attribution; footer mention only without navigation linkage
- **Trade-offs:** Gains clear brand relationship and SEO benefits for parent domain; risks positioning MythXEngine as less-important demo vs. core protoLabs offering
- **Breaking if changed:** Removing protoLabs links severs the portfolio relationship and loses SEO linkjuice flow back to protoLabs domain

### Rejected Vercel despite feature name, chose Railway/Fly.io/Render instead due to WebSocket and long-lived process requirements (terminal/PTY operations) (2026-02-24)
- **Context:** Feature spec mentioned 'Vercel or similar' but application architecture requires WebSocket support and long-running Express servers with PTY operations
- **Why:** Vercel's serverless model with limited WebSocket support and request timeouts cannot handle the application's real-time terminal interaction needs. These platforms allow long-lived connections and background processes
- **Rejected:** Vercel would have required significant application refactoring to remove WebSocket/PTY terminal features or splitting those features to a separate backend service
- **Trade-offs:** More deployment flexibility across three platforms vs simplified single-platform deployment. Each platform requires different config syntax and has different pricing models
- **Breaking if changed:** If application requirements change to remove WebSocket/PTY needs, Vercel becomes viable again and offers simpler deployment. Current choice locks architecture to these three platforms

#### [Pattern] Implementation required zero application code changes - all deployment requirements were addressed through configuration files (YAML, TOML, Markdown). Existing codebase already fully supports containerization (2026-02-24)
- **Problem solved:** Feature scope was 'set up web app on hosted deployment platforms' but application architecture already enabled this capability
- **Why this works:** The Express application, database abstraction, and environment variable configuration were already designed for containerized deployment. No architectural gaps required closing - only providing deployment recipes and documentation
- **Trade-offs:** Simpler implementation with no code risk, but reveals that platform support was already implicit in the architecture. May indicate deployment documentation was previously missing rather than capability gap

#### [Gotcha] Dependency resolution logic duplicated across 3+ locations: main resolver functions (areDependenciesSatisfied, getBlockingDependencies, getBlockingDependenciesFromMap) AND inline copy in auto-mode-service.ts. Changes must be synced everywhere. (2026-02-24)
- **Situation:** Updated 'review' status filtering in resolver.ts but also had to update auto-mode-service.ts inline copy to keep behavior consistent
- **Root cause:** Monorepo services sometimes have inline copies of shared logic for historical reasons or perceived performance benefits, breaking single-source-of-truth
- **How to avoid:** Local clarity and context independence vs maintainability risk; fewer lines of code vs higher chance of drift between implementations

### Status 'review' does NOT count as dependency-satisfied. Features in review are still blocking downstream dependencies even though verification is in progress. (2026-02-24)
- **Context:** Changed satisfiedStatuses to only include 'verified'/'done' statuses, explicitly excluding 'review' status from the satisfied list
- **Why:** Features under review can still be modified or rejected; depending on them would create false confidence that work can proceed when foundational changes might still happen
- **Rejected:** Treating 'review' as satisfied (allowing downstream work to proceed) - creates hidden dependency on unstable features
- **Trade-offs:** More conservative scheduling (more things block longer) vs more resilient feature pipelines (fewer broken dependencies); stricter requirements vs lower rework
- **Breaking if changed:** Any feature depending on another feature in 'review' status will now correctly report as blocked; code relying on 'review' being satisfied will see different readiness signals

### Used afterSign hook (not afterPack) for notarization, allowing coexistence with existing afterPack hook for native module rebuilding (2026-02-24)
- **Context:** Multiple build hooks needed at different lifecycle stages: native modules rebuild at pack time, notarization must occur after code signing but before DMG creation
- **Why:** afterSign executes at the correct sequencing point - after code signing but before package creation. This maintains separation of concerns while allowing both hooks to compose in the build pipeline without interference
- **Rejected:** Could have modified existing afterPack hook for notarization, but would require restructuring native module rebuild logic and create timing conflicts
- **Trade-offs:** Multiple hooks add pipeline complexity but preserve independent concerns and allow future independent updates to each hook
- **Breaking if changed:** If moved to afterPack, notarization would occur too late in lifecycle when binary is in wrong format/location for Apple's notarization service

#### [Pattern] Notarization script implements asymmetric credential handling: gracefully skips when env vars missing (local dev), but throws error to fail CI build if credentials misconfigured (2026-02-24)
- **Problem solved:** Need to support both local unsigned development builds and authenticated CI/CD without requiring developers to have Apple credentials locally
- **Why this works:** Single runtime check separates concerns: local dev skips gracefully (no credentials needed), while CI fails-fast if credentials are misconfigured (prevents silent failures). Avoids forcing local credential setup or complex configuration branching
- **Trade-offs:** Adds conditional logic in notarization script but eliminates credentials as a blocker for local development while maintaining safety in CI

#### [Gotcha] Developer ID certificates expire after 5 years with no automatic renewal, requiring 6-month advance renewal planning to prevent production CI failures (2026-02-24)
- **Situation:** Automated code signing pipeline depends on long-lived credentials with fixed expiration dates
- **Root cause:** This is an invisible gotcha because code signing works perfectly until the moment it expires, then all CI/CD builds fail simultaneously. Apple's certificate policy doesn't auto-renew, creating a hard deadline that's easy to miss
- **How to avoid:** Requires manual process and calendar reminders, but allows long-term automation without other interventions

### Code signing identified as hard prerequisite for electron-updater functionality - auto-updates fail on macOS without code signing because Gatekeeper blocks unsigned binaries (2026-02-24)
- **Context:** Feature architecture required sequencing code signing before electron-updater implementation could begin
- **Why:** macOS Gatekeeper enforces code signing as a system-level policy that silently blocks auto-updates for unsigned applications. This creates a hard dependency, not optional optimization
- **Rejected:** Attempting to implement electron-updater without code signing (silent failures, user updates blocked by OS)
- **Trade-offs:** Adds upfront work to implement code signing, but unblocks downstream features like auto-updates
- **Breaking if changed:** Without code signing, electron-updater fails silently or users receive Gatekeeper warnings, making auto-updates non-functional

### ensureCleanWorktree() is called before updateFeatureStatus() regardless of whether finalStatus is 'verified' or 'waiting_approval' (2026-02-24)
- **Context:** Both automated (verified) and manual review (waiting_approval) paths transition state, but only verified was initially assumed to need cleanup
- **Why:** Ensures agent progress is persisted before ANY state transition, preventing loss of work in the manual approval path. Treats cleanup as a precondition for state stability, not just for verified states.
- **Rejected:** Only calling on verified path would be simpler but would leave uncommitted changes in the manual review queue, potentially losing agent progress during manual iteration
- **Trade-offs:** Slightly more database writes/commit operations, but guarantees consistency across all terminal states. Prevents silent loss of agent work.
- **Breaking if changed:** If removed, manual review workflows lose uncommitted agent changes. The waiting_approval path would accumulate technical debt.

#### [Pattern] Guard uses 'determine state → stabilize → persist' pattern: finalStatus is computed, THEN ensureCleanWorktree() is called, THEN updateFeatureStatus() writes to system (2026-02-24)
- **Problem solved:** Three distinct operations that could fail independently, but are ordered to minimize damage if intermediate steps fail
- **Why this works:** Separates business logic (what should the next state be?) from infrastructure concerns (ensure clean repo). If cleanup fails, status hasn't been corrupted in the database.
- **Trade-offs:** Adds complexity of maintaining an intermediate state variable (finalStatus), but provides ordering guarantees for fault tolerance

### ensureCleanWorktree() is called at 4 separate sites in auto-mode-service.ts rather than centralized in a wrapper around updateFeatureStatus() (2026-02-24)
- **Context:** Multiple execution paths (main path, edge case handler, resume handler, follow-up handler) all reach updateFeatureStatus('verified')
- **Why:** Each site has distinct context and execution semantics. Direct calls make the dependency explicit at each verification point, reducing risk of future sites forgetting the guard.
- **Rejected:** Wrapping updateFeatureStatus() would centralize cleanup but would require higher-order function manipulation and might catch 'waiting_approval' calls incorrectly
- **Trade-offs:** Code duplication (4 import uses, 4 function calls) vs maintainability. Distributed calls make intent clear locally but require remembering to add the guard to new sites.
- **Breaking if changed:** If a 5th verification point is added without the guard call, that path silently bypasses the uncommitted changes protection

#### [Pattern] Environment variable presence detection for feature selection (WIN_CSC_LINK vs AZURE_KEY_VAULT_* vs unsigned builds) (2026-02-24)
- **Problem solved:** Need to support three different signing flows without branching logic or config changes
- **Why this works:** electron-builder automatically detects method based on what env vars exist. Single binary/config works in all environments.
- **Trade-offs:** Implicit behavior requires good documentation; harder to debug which method is active

#### [Pattern] Allow unsigned builds when certificates not present (graceful degradation for local development) (2026-02-24)
- **Problem solved:** Developers need to build and test locally without certificate setup; production builds require signing
- **Why this works:** Unblocks developer workflow; unsigned installers show warnings but still work; signing is enforced only in CI/CD
- **Trade-offs:** Easier local development but requires discipline to ensure CI/CD always signs

#### [Gotcha] External product references (MythXEngine as separate portfolio product) entering code pipeline creates coupling and scope confusion. Tasks that depend on running external systems should have clear component boundaries or be routed to those systems' repos. (2026-02-24)
- **Situation:** Feature references MythXEngine gameplay recording - a separate product not in this codebase - but task was filed as code feature
- **Root cause:** External product dependencies create hidden blockers: availability issues, version management, maintenance burden across product boundaries
- **How to avoid:** Stricter boundary enforcement prevents feature bloat but requires upfront routing/triage; loose boundaries allow more flexible workflows but accumulate unmaintainable cross-product coupling

#### [Gotcha] Automated task intake from external systems (Linear Signal Intake) without category validation allows non-code tasks into development pipeline. 'Signal Intake' state has no filtering layer. (2026-02-24)
- **Situation:** Feature came through Linear integration marked 'Signal Intake' without upstream classification that this is content creation, not code
- **Root cause:** Unfiltered signal capture creates noise; content/marketing tasks require different tools, skills, and workflows than code tasks
- **How to avoid:** Pre-filtering in Linear integration (or between Linear→dev pipeline) costs setup but prevents wasted developer time; post-filtering (developer discovers scope mismatch) is cheaper initially but accumulates pipeline waste

### Non-blocking fire-and-forget background worker: `void this.runBackgroundHype()` chains after embeddings complete but doesn't await. No error handling or completion signal at call site. (2026-02-24)
- **Context:** Need to process generated questions asynchronously without blocking main embedding workflow
- **Why:** Prevents blocking synchronous API responses while embeddings are being processed. Keeps response latency low for the triggering request.
- **Rejected:** Await pattern would block caller until all HyPE processing completes; queue system would require external service
- **Trade-offs:** Faster response times but silent failures. Errors in HyPE worker won't bubble up to requestor. Must add explicit monitoring/logging.
- **Breaking if changed:** If changed to await, callers must wait for HyPE completion; if removed, no HyPE processing happens

#### [Pattern] RRF merge gracefully degrades based on available embeddings: uses 'hybrid_hype' if HyPE embeddings exist, falls back to 'hybrid' if only direct embeddings exist, and 'bm25' as ultimate fallback (2026-02-24)
- **Problem solved:** Extending 2-mode to 3-mode RRF merge while handling incomplete embedding data across database
- **Why this works:** Prevents search failures when pre-computed embeddings are missing; enables gradual rollout of HyPE without requiring complete data regeneration
- **Trade-offs:** Complexity in mode selection logic gains operational flexibility; harder to predict which algorithm will execute

#### [Gotcha] HyPE embeddings already pre-computed and stored in `chunks.hype_embeddings` column from prior feature; this implementation repurposes existing data rather than adding new embedding generation (2026-02-24)
- **Situation:** Implementing retrieval using HyPE embeddings for first time
- **Root cause:** Embeddings were stored but not yet used for retrieval—discovering existing infrastructure enables feature with zero new data pipeline work
- **How to avoid:** Leveraging existing data structure becomes obvious after investigation but hidden before; reduces feature scope significantly

### Triple-mode RRF uses equal weights (k=60) for all three signals (BM25, direct cosine, HyPE cosine) as starting point, with `/api/knowledge/eval-stats` endpoint designed to support future weight tuning based on production data (2026-02-24)
- **Context:** Choosing initial fusion weights without offline evaluation results
- **Why:** Equal weights provide symmetry and neutrality; eval stats endpoint creates measurement infrastructure for data-driven optimization rather than guessing
- **Rejected:** Could have tuned weights empirically offline, but that's duplicating work eval-stats is designed to capture in production
- **Trade-offs:** Equal weights may be suboptimal initially but enable principled tuning later; simplicity of implementation gains ability to measure real-world performance
- **Breaking if changed:** If you hardcode weights instead of making them tunable, you lose ability to improve based on eval-stats data; if eval-stats endpoint is removed, the optimization path disappears

### Kept public methods in KnowledgeStoreService that delegate to KnowledgeIngestionService rather than moving them entirely (2026-02-24)
- **Context:** Refactoring to extract ingestion concerns while maintaining backward compatibility
- **Why:** Zero breaking changes - existing clients calling knowledgeStoreService.ingestReflections() continue working without modification
- **Rejected:** Removing methods from KnowledgeStoreService entirely and forcing clients to use KnowledgeIngestionService directly
- **Trade-offs:** Cleaner client migration vs. maintaining forwarding methods; less code in KnowledgeStoreService vs. need to coordinate state across two classes (projectPath tracking)
- **Breaking if changed:** Removing the delegation methods breaks any client code calling these methods on KnowledgeStoreService. The forwarding layer is the only thing preventing a breaking change.

#### [Pattern] Database instance is passed to KnowledgeIngestionService methods as parameters rather than owned by the service (2026-02-24)
- **Problem solved:** Extracted service needs access to database for persistence but shouldn't own the connection lifecycle
- **Why this works:** Maintains transactional control and prevents multiple DB connections. Service methods operate within caller's transaction context, making composition safer
- **Trade-offs:** Service is stateless for persistence (testable) but has mixed responsibility - owns projectPath state while receiving DB as parameter; less autonomous but more composable with different transaction contexts

#### [Gotcha] Both KnowledgeStoreService and KnowledgeIngestionService track projectPath state independently, with the pattern checking `if (this.projectPath !== projectPath)` to re-initialize (2026-02-24)
- **Situation:** Supporting multiple concurrent requests to different projects with long-lived service instances
- **Root cause:** Reusing service instance across requests saves instantiation cost, but implicit state changes are a coupling point
- **How to avoid:** Cheaper instances vs. hidden state mutation; single initialize call vs. scattered logic checking if reinitialization is needed; the idempotency check masks bugs where request A and B operate on different projects

#### [Pattern] runBackgroundEmbedding() and runBackgroundHype() extracted together with ingestReflections/AgentOutputs as internal workers of the ingestion pipeline (2026-02-24)
- **Problem solved:** These private methods are part of the post-ingest processing - they don't ingest data directly but process it after ingestion
- **Why this works:** They form an implicit pipeline: ingest → embed → apply-hype. Extracting them together with ingest methods keeps the processing logic together, preventing split pipeline logic between services
- **Trade-offs:** Cohesive ingestion service logic vs. blurring the line between 'ingest' (read files) and 'process' (generate embeddings); easier to modify pipeline when together vs. harder to reuse embedding without ingestion

#### [Gotcha] compactCategory() is included in KnowledgeIngestionService even though it's called during post-processing, not during ingestion proper (2026-02-24)
- **Situation:** Category files can grow oversized when many chunks are indexed, requiring compaction via Haiku LLM
- **Root cause:** It's part of the embedding/processing workflow that follows ingestion, so it travels with the extraction boundary. It modifies data that was just ingested
- **How to avoid:** Single service owns full ingestion→embedding→compaction workflow vs. the semantic boundary between 'ingest' (file I/O) and 'compact' (LLM processing) is blurred

#### [Pattern] 800-line documentation constraint forced architectural clarity through scarcity. Initial memory-system.md was 981 lines (22% over), required consolidation of debugging sections and API references into quick-reference tables. (2026-02-24)
- **Problem solved:** docs-standard.md requirement of <800 lines per file. Memory-system.md exceeded this and needed refactoring.
- **Why this works:** Line count limits prevent over-documentation and force prioritization. Condensing 981→650 lines improved structure: moved verbose examples to separate sections, consolidated related content, created decision trees instead of prose.
- **Trade-offs:** Constraint made docs harder to write initially but easier to maintain. Readers get focused context without excessive depth. Easier to update single file than coordinating multiple docs.

### Documented rejected alternatives (e.g., 'Why not Pinecone? Why not LangChain chunking?') alongside positive choices in rag-techniques.md. (2026-02-24)
- **Context:** rag-techniques.md included evaluation matrices and 'Why not X?' sections for alternative RAG approaches (Pinecone, chunking strategies, dense embeddings, etc.).
- **Why:** Future developers will inevitably ask 'why this approach?'. Answering preemptively in the docs reduces context-switching and prevents re-evaluation of already-evaluated alternatives. This is meta-documentation: documenting the decision space, not just the decision.
- **Rejected:** Could document only the chosen approach (knowledge-hive.md does this at high level), but this leaves decision reasoning implicit and scattered across past discussions/PRs.
- **Trade-offs:** Longer docs but saves dev time by preventing repeated 'why not?' investigations. Creates single source of truth for design reasoning. Risk: must update when contexts change (e.g., if Pinecone becomes viable due to requirements change).
- **Breaking if changed:** Removing this section would make architecture decisions invisible to new developers, increasing risk of unauthorized refactors based on incomplete information.

#### [Pattern] Hybrid diagram strategy: ASCII art for simple flows (write pipeline), Mermaid for complex data dependencies (retrieval pipeline with multiple pathways and decision nodes). (2026-02-24)
- **Problem solved:** knowledge-hive.md uses ASCII diagram for write pipeline (linear), Mermaid diagram for retrieval pipeline (branching, multiple stages, styled components).
- **Why this works:** ASCII excels at showing simple sequential steps inline with prose. Mermaid excels at showing decision points, branching, and multi-layer dependencies with styling. Choosing per-diagram avoids forcing all diagrams into one tool's constraints.
- **Trade-offs:** Hybrid approach requires developers to know both tools. ASCII stays readable in raw markdown. Mermaid offers styling and automatic layout. Maintenance: if rendering breaks, affects subset not all diagrams.

#### [Pattern] Cross-document relative linking (./knowledge-hive, ./rag-techniques, ./memory-system) creates a cohesive knowledge graph within docs. Each document stands alone but explicitly references related topics. (2026-02-24)
- **Problem solved:** Three documentation files placed in docs/dev/ with internal references using relative paths rather than creating one monolithic file or isolated docs.
- **Why this works:** Relative links remain valid if documentation directory structure changes. Splitting into three focused docs (architecture, techniques, operations) reduces cognitive load per reader while relative links enable discoverability. Avoids the monolith problem (single 1900-line file = harder to navigate) and the fragmentation problem (multiple files with no connections).
- **Trade-offs:** Relative linking requires knowing directory structure. More files to maintain. Readers must click through for full context. But: each doc is focused, faster to load, easier to reason about single responsibility.

#### [Gotcha] Initial memory-system.md exceeded 800-line constraint by 23% (981 lines) despite planning. Refactoring required collapsing multiple debugging sections into a single reference table and deferring API details to cross-reference. (2026-02-24)
- **Situation:** Documentation constraint from docs-standard.md was underestimated. Memory system has many edge cases and debugging scenarios that naturally expand documentation.
- **Root cause:** Root cause: Wrote comprehensively first, then constrained. Should have outlined to estimate line count before drafting. Memory system (write pipeline, deduplication, compaction, pruning, API, debugging) has more subsystems than knowledge-hive.md or rag-techniques.md, making it harder to stay under 800 lines.
- **How to avoid:** Refactoring improved focus (debugging now via quick-reference + SQL query examples rather than verbose explanations). Removed redundancy with knowledge-hive.md API section. Trade-off: less hand-holding for debugging—readers must read more carefully.

#### [Pattern] Auto-discovery of documentation via generateSidebar() in docs/.vitepress/config.mts. No manual sidebar configuration needed—files are indexed automatically based on directory structure and naming conventions. (2026-02-24)
- **Problem solved:** Docs automatically appear in VitePress sidebar without edits to config files. Mentioned in notes: 'docs auto-appear in the sidebar via generateSidebar().'
- **Why this works:** Reduces maintenance burden—adding a new doc (docs/dev/new-topic.md) makes it appear in sidebar immediately. Prevents fork-bomb of sidebar config that grows with docs. Relies on file naming convention (kebab-case) and directory structure (docs/dev/) to drive discoverability.
- **Trade-offs:** Auto-discovery trades control for scalability. If you want custom sidebar ordering or nested grouping, you need to override generateSidebar(). Most docs benefit from alphabetical/directory-based ordering.

### Compaction threshold: 50,000 tokens per category file. Triggered on-demand via POST /api/knowledge/compact when file exceeds this size. (2026-02-24)
- **Context:** memory-system.md documents that Knowledge Hive compacts oversized files at 50k token threshold (roughly 200KB of text).
- **Why:** 50k tokens is a balance point: (1) Large enough to allow natural growth (e.g., patterns.md will contain hundreds of patterns), (2) Small enough to keep reindexing fast (50k tokens in all-MiniLM-L6-v2 = ~100ms), (3) Prevents single file from dominating memory/search latency. Default avoids constant compactions (token count fluctuates).
- **Rejected:** Could compact on every write (prevents bloat but constant reindexing overhead). Could use higher threshold (fewer compactions but slower searches as files grow). Could use lower threshold (more compactions, more fragmentation across files).
- **Trade-offs:** Threshold requires monitoring file growth and manual compaction API calls. But: prevents pathological behavior where a category file grows to millions of tokens. Lazy compaction (on-demand) means developers choose when to pay the reindex cost.
- **Breaking if changed:** Removing compaction entirely allows unbounded file growth → search slowdown. Setting threshold too low causes constant reindexing churn. Setting too high causes single files to dominate memory/latency.

#### [Pattern] Background worker runs AFTER embedding completion, not in parallel - sequential chaining of knowledge ingestion stages (2026-02-24)
- **Problem solved:** HyPE worker depends on embeddings existing for each chunk; running both simultaneously would create race conditions
- **Why this works:** Maintains dependency chain: file ingestion → embeddings → HyPE queries. Non-blocking async prevents main thread stalls while respecting data dependencies
- **Trade-offs:** Slower end-to-end ingestion (sequential stages) but guaranteed data integrity and no race conditions

### Extract KnowledgeIngestionService from KnowledgeStoreService - move embedding and HyPE workers to dedicated service (reduced KnowledgeStoreService from 1253→835 lines) (2026-02-24)
- **Context:** Original service had 3 responsibilities: storage operations, file ingestion, and async workers (embeddings + HyPE)
- **Why:** Separation of concerns - KnowledgeStoreService becomes focused on data access layer; ingestion logic isolated from storage logic. Easier testing and maintenance
- **Rejected:** Keep workers in KnowledgeStoreService (single large class handling too many concerns); create separate IngestionWorker (adds another class for same coupling)
- **Trade-offs:** More files to maintain but each has single responsibility; initialization flow more complex (KnowledgeStoreService must notify KnowledgeIngestionService on completion)
- **Breaking if changed:** Reversing refactor would break initialization dependency chain; tests would need rewritten; caller would need to manage both service instances

### Triple-mode fusion using Reciprocal Rank Fusion (RRF) to merge three independent ranking signals (BM25, direct cosine, HyPE cosine) with equal weights and k=60 parameter (2026-02-24)
- **Context:** Combining heterogeneous retrieval signals from full-text search and two embedding spaces
- **Why:** RRF combines complementary ranking functions without requiring explicit weight tuning. Each signal (lexical, semantic direct, semantic from query-embedding-to-query-embedding) provides different relevance perspectives. k=60 parameter controls the decay curve for rank positions.
- **Rejected:** Simple weighted average of similarity scores (loses information from rank order), using only highest-performing signal (loses complementary signals), explicit weight tuning (requires offline analysis cycle)
- **Trade-offs:** RRF is parameter-free and principled but assumes equal importance of all three signals. Equal weights may be suboptimal - future tuning based on eval stats could improve relevance.
- **Breaking if changed:** Removing any of the three ranking sources breaks the fusion entirely; changing k parameter changes relative contribution of lower-ranked results

#### [Pattern] Log rotation strategy: rotate at 10,000 entries while keeping most recent 5,000 entries (2026-02-24)
- **Problem solved:** Preventing unbounded log file growth while maintaining sufficient historical data for offline analysis
- **Why this works:** The 2x threshold (rotate at 10k, keep 5k) prevents logs from consuming unlimited disk while ensuring enough data exists for statistical significance. Rotating at upper threshold rather than fixed size gives better batching efficiency.
- **Trade-offs:** Keeps 5k most recent entries only; analyses can't look beyond ~5k searches backward. Trade space savings for recency bias in analysis window.

#### [Gotcha] Equal weighting (1:1:1) assumption for BM25:direct:HyPE in RRF merge encodes assumption that all three signals contribute equally to relevance (2026-02-24)
- **Situation:** No prior empirical data on relative effectiveness of lexical vs direct embedding vs HyPE embedding retrieval
- **Root cause:** Equal weights are principled starting point when no data exists. However, this is an assumption that different retrieval modalities have equal predictive power for relevance.
- **How to avoid:** Simplicity and no tuning overhead vs suboptimal relevance if signals have different actual effectiveness. The eval stats endpoint exists to measure this.

### Runtime mode selection (hybrid_hype → hybrid → bm25) based on actual embedding availability at search time (2026-02-24)
- **Context:** System must function when embeddings are partially or fully unavailable
- **Why:** Graceful degradation prevents search service failure when optional features fail. Embedding availability is runtime-dependent (model availability, cache state), so checking at search time is more reliable than pre-flight checks.
- **Rejected:** Fail-fast at startup if embeddings unavailable (breaks search entirely), require explicit mode configuration (rigid, doesn't adapt)
- **Trade-offs:** Mode can vary per-search (observable in retrieval_mode field); requires code paths for all three modes. Simpler than strict mode configuration.
- **Breaking if changed:** Removing any fallback level (e.g., removing BM25 fallback) breaks searches when embeddings unavailable. Changing selection logic affects which mode is used for given corpus state.

#### [Gotcha] Embeddings loaded from two separate sources: embeddings table (direct cosine) and chunks.hype_embeddings column (HyPE cosine) (2026-02-24)
- **Situation:** Query-to-document embedding stored separately from pre-computed HyPE (query-embedding-to-query-embedding) embeddings
- **Root cause:** Different embedding types have different lifecycles: direct embeddings are computed at ingestion, HyPE embeddings are pre-computed from direct embeddings. Separate storage mirrors this logical separation.
- **How to avoid:** Schema clarity (type separation) requires loading from multiple sources. Root cause: embeddings are computed at different times with different inputs.

### Used composition with facade pattern: KnowledgeStoreService delegates to KnowledgeSearchService rather than simple extraction with caller updates (2026-02-24)
- **Context:** Extracting 200+ lines of search logic from monolithic service into dedicated service
- **Why:** Preserves backward compatibility without 'hacks' - all existing callers work unchanged. Enables gradual migration path if future refactoring needed. Follows stated greenfield principle of preserving interface naturally.
- **Rejected:** Direct extraction requiring all callers (routes, lead-engineer-service, auto-mode-service) to be updated to new service
- **Trade-offs:** Slightly more code (one delegation layer) but eliminates coordination cost across 3+ call sites and risk of missing a caller. Enables future modularization without breaking changes.
- **Breaking if changed:** If facade delegation is removed and KnowledgeSearchService methods are directly called, all consumers must be updated in coordinated change. With facade, services can migrate independently.

#### [Pattern] KnowledgeSearchService remains stateless - database connection passed at call time rather than stored in constructor (2026-02-24)
- **Problem solved:** Separating search concerns from knowledge store storage/initialization concerns
- **Why this works:** Keeps search service testable without mocking database lifecycle. Allows same service instance to work with different database connections. Prevents long-lived connections being held in search layer.
- **Trade-offs:** Requires passing db parameter on every search call (minor friction) but enables true separation of concerns and easier unit testing without integration setup

### Service supports project path switching via re-initialization: if projectPath differs from initialized path, calls initialize(newPath) at search time (2026-02-24)
- **Context:** Multi-project environment where same service instance might search different projects sequentially
- **Why:** Single service instance can handle switching between projects without creating new instances. More convenient than factory pattern or connection pooling.
- **Rejected:** Require creating new service instance per project; or throw error if project mismatch detected
- **Trade-offs:** Simplifies caller code (no instance management) but adds latency when switching projects (reinitializes database). Assumes reinitialize is fast enough for interactive use.
- **Breaking if changed:** If project switching is removed and service becomes single-project-only, multi-project scenarios would require significant caller refactoring. Current design keeps this flexible.

### Created dedicated KnowledgeEmbeddingOrchestrator service to own embedding lifecycle end-to-end (table creation, HyPE processing, status tracking, hybrid retrieval) (2026-02-24)
- **Context:** KnowledgeStoreService had mixed responsibilities: chunk storage/search AND embedding operations. These have different lifecycle patterns and trigger different background jobs.
- **Why:** Embedding operations (async HyPE processing, background job management, embedding table schema) require different lifecycle management than synchronous search operations. Embedding status queries and hybrid retrieval are embedding concerns, not general search concerns.
- **Rejected:** Could have kept everything in KnowledgeStoreService but then chunk/embedding changes would be entangled, making it harder to reason about which operations affect which data structures
- **Trade-offs:** Gained: cleaner separation, independent testability, easier to modify embedding without affecting search. Lost: slightly more file complexity, requires orchestrator as dependency in search methods
- **Breaking if changed:** If orchestrator is removed, HyPE background jobs, embedding status tracking, and hybrid retrieval all stop working. Search method can no longer delegate embedding operations.

### Hybrid retrieval logic (RRF/Reciprocal Rank Fusion merging, ~200 lines) extracted as orchestrator responsibility, not search responsibility (2026-02-24)
- **Context:** KnowledgeStoreService.search() was handling both pure BM25 results and hybrid result merging logic together
- **Why:** Hybrid retrieval is specifically about merging BM25 + embedding results. This is an embedding orchestration concern, not a general search concern. Keeps search method focused on the retrieval mechanism, orchestrator handles result fusion.
- **Rejected:** Could have kept it in search() but then adding new search modes (embedding-only, BM25-only) would require modifying search logic rather than orchestrator selection logic
- **Trade-offs:** Gained: search() becomes dumber/simpler, orchestrator is clear integration point for different retrieval modes. Lost: requires delegating back to orchestrator after getting results
- **Breaking if changed:** Pure search implementation cannot perform hybrid result merging directly. Must go through orchestrator's applyHybridRetrieval(). Any code depending on search method handling all merging breaks.

### Evaluation logging (~130 lines) moved to orchestrator as embedding-specific concern, not general search concern (2026-02-24)
- **Context:** getEvalStats() and logEvaluation() tracked which retrieval mode was used (BM25, embedding, hybrid). Was tightly coupled to search implementation.
- **Why:** Evaluation metrics are meaningless for pure BM25 search (no retrieval mode to track). They only matter when embedding system is involved. This is orchestrator's domain.
- **Rejected:** Could have kept evaluation in KnowledgeStoreService but then it would be tracking state about embedding operations from outside the embedding service, violating encapsulation
- **Trade-offs:** Gained: clear ownership, evaluation only exists where it makes sense. Lost: evaluation is not available for non-embedding searches without duplicating logic
- **Breaking if changed:** Code accessing eval stats through search service breaks. Must go through orchestrator. If you add non-embedding retrieval modes later, evaluation won't automatically track them.

### Maintained KnowledgeStoreService as public API while delegating to KnowledgeIngestionService internally, rather than replacing the service entirely (2026-02-24)
- **Context:** Extracting 413 lines of ingestion logic from a monolithic service while ensuring existing consumers remain unaffected
- **Why:** Eliminates cascading changes across all consuming code. Zero breaking changes means routes, tests, and other services continue working without modification. Achieves modularization incrementally without coordination overhead.
- **Rejected:** Making KnowledgeIngestionService the primary service and deprecating KnowledgeStoreService would require updating all consumers (routes, tests, other services). Or extracting without delegation facade, requiring API changes everywhere.
- **Trade-offs:** Added indirection layer (one extra method call per delegation) but gained decoupling and maintainability. Code volume shift from store-service (66%) to ingestion-service (413 lines) signals cleaner separation.
- **Breaking if changed:** Removing the delegation pattern and forcing consumers to import KnowledgeIngestionService directly would require updating all call sites. Removing KnowledgeStoreService entirely would break any code expecting its original interface.

#### [Pattern] Created dedicated ingestion routes (ingest.ts) alongside the extracted service, establishing explicit API boundaries rather than implicit through methods (2026-02-24)
- **Problem solved:** Service extraction could have left routes unchanged, but deliberately created route-level abstraction
- **Why this works:** Routes define the actual contract/API surface area. By extracting them alongside the service, it clarifies that ingestion is a bounded context with specific entry points. Prevents accidental coupling to internal methods.
- **Trade-offs:** Slight increase in file count (added ingest.ts) but massive gain in clarity. Makes ingestion functionality discoverable and independently testable at the HTTP layer.

### Used quantitative metrics (250-line reduction target, achieved 413) as acceptance criteria rather than qualitative 'feels modular' (2026-02-24)
- **Context:** Service modularization is often evaluated subjectively; used concrete line-count reduction as measurable goal
- **Why:** Line count provides objective proof of extraction. Overshooting the target (165% of goal) demonstrates thorough extraction, not just moving a few methods. Harder to game or argue about.
- **Rejected:** Subjective criteria like 'service should be smaller' or 'code should be more maintainable' lack objective verification and allow partial implementations to pass.
- **Trade-offs:** Line count is crude metric (doesn't account for complexity), but it's concrete and verifiable. The overshoot (413 vs 250 target) signals confidence the extraction was comprehensive.
- **Breaking if changed:** Without this metric, acceptance becomes opinion-based. A 50-line extraction could claim success despite leaving 80% of logic in original service. The target ensures meaningful refactoring occurred.

#### [Pattern] Member variable pattern for KnowledgeIngestionService within KnowledgeStoreService enables lazy delegation while maintaining single responsibility (2026-02-24)
- **Problem solved:** Could have composed the services via constructor injection, factory patterns, or service locator; chose simple member variable
- **Why this works:** Member variable is simplest form of composition. Avoids overhead of factory/locator patterns. Clear ownership: store-service owns and controls ingestion-service lifecycle. Easier to test and understand dependency flow.
- **Trade-offs:** Member variable approach is tightly bound but straightforward. Easier to understand than injected patterns, but harder to swap implementations for testing. The simple gain outweighs testing flexibility here since ingestion logic is relatively stable.

### Documentation split into three focused files (knowledge-hive.md, rag-techniques.md, memory-system.md) rather than single monolithic document (2026-02-24)
- **Context:** Creating comprehensive architecture documentation for RAG system
- **Why:** Separates concerns: system overview vs technique decisions vs operational procedures. Enables clearer navigation and maintenance of distinct knowledge domains. Each file can evolve independently without tangling unrelated documentation.
- **Rejected:** Single 1500+ line architecture.md file covering all topics together
- **Trade-offs:** Easier: modular updates, focused reading paths. Harder: maintaining cross-file consistency, requires deliberate link structure.
- **Breaking if changed:** If consolidated to single file, navigating to specific concerns becomes harder; future technique changes would need scrolling through unrelated content to find the right section.

#### [Pattern] Each RAG technique choice explicitly documented with rejection rationale (e.g., why header-based chunking over fixed-size, why @xenova/transformers over native bindings, why HyPE over HyDE, why RRF over weighted sum) (2026-02-24)
- **Problem solved:** Building RAG system with multiple viable technique alternatives at each layer
- **Why this works:** Creates permanent architectural decision record. Prevents future developers from re-litigating already-decided tradeoffs. Rationale documentation prevents silent assumptions from calcifying into 'that's just how we do it'.
- **Trade-offs:** Easier: future maintainers understand constraints and can spot when assumptions change. Harder: requires discipline to document non-obvious decisions upfront.

### SQLite with FTS5 used as native vector store rather than external purpose-built vector database, with corpus size as deciding constraint (2026-02-24)
- **Context:** Choosing storage layer for embedding vectors in knowledge system
- **Why:** Corpus size constraint (knowledge.db stores chunked documentation, not massive external data) makes SQLite viable. Avoids operational complexity of managing separate database. Simplifies deployment in Electron/PWA environments.
- **Rejected:** Pinecone, Weaviate, or other purpose-built vector DBs
- **Trade-offs:** Easier: single database, no network calls, self-contained backups. Harder: less optimization for vector operations, scaling to millions of vectors would hit limitations.
- **Breaking if changed:** If corpus grows to millions of embeddings or sub-millisecond latency becomes requirement, architectural change to external vector DB becomes necessary - tight coupling to SQLite in retrieval layer.

#### [Pattern] HyPE query expansion documented as having 'zero runtime cost' - generates synthetic queries during embedding phase, not during retrieval (2026-02-24)
- **Problem solved:** Comparing HyDE (generate on-the-fly) vs HyPE (pre-computed synthetic embeddings) for query expansion
- **Why this works:** Shifts computational cost to write-time (embedding phase) rather than read-time (retrieval queries). For knowledge systems with stable corpus and frequent reads, this improves latency. The 'zero runtime cost' framing reveals optimization philosophy: pre-computation trades storage for retrieval speed.
- **Trade-offs:** Easier: fast retrieval queries. Harder: storage overhead for synthetic embeddings; changes to query generation strategy require re-embedding entire corpus.

### Documentation discovery from directory structure without sidebar manifest file, suggesting auto-discovery pattern for docs navigation (2026-02-24)
- **Context:** Creating docs/dev/ section documentation with expectation of automatic inclusion in site navigation
- **Why:** Auto-discovery from filesystem reduces configuration debt and makes documentation placement self-documenting. Directory structure IS the manifest.
- **Rejected:** Manual sidebar.json or docs.config.js registration required for each new doc
- **Trade-offs:** Easier: add file, documentation appears; directory structure visible in source control. Harder: can't customize ordering, navigation hierarchy follows filesystem exactly.
- **Breaking if changed:** If documentation framework is upgraded or changed to require manual registration, existing docs would disappear from navigation until re-registered.

### Line count limit (800 lines max per docs-standard.md) enforced for documentation files to maintain readability and focus (2026-02-24)
- **Context:** Creating three documentation files totaling 1740 lines (652, 439, 649 lines each, all under 800)
- **Why:** Prevents documentation from becoming navigation hell. 800-line limit forces deliberate scope boundaries and readability. Correlates with cognitive load - documentation beyond this length requires reader to maintain too much context.
- **Rejected:** No limit or higher limit (e.g., 2000 lines) allowing consolidation
- **Trade-offs:** Easier: readers can focus. Harder: requires cross-document navigation for complete picture, authors must resist scope creep.
- **Breaking if changed:** If future architecture changes need substantial documentation, adding to existing files would violate standard, forcing creation of new docs and potential documentation fragmentation.

#### [Pattern] Continue-on-error pattern: individual chunk LLM failures don't halt entire worker; silently skips that chunk and logs with progress every 10 items (2026-02-24)
- **Problem solved:** Background worker processes hundreds of chunks; one bad response shouldn't block all progress
- **Why this works:** Resilience: improves availability; avoids retry complexity; ensures forward progress even with occasional LLM failures
- **Trade-offs:** Gained robustness/uptime; lost visibility into which chunks lack hype_embeddings (silent failures); no automatic retry recovery

### HyPE worker executes sequentially AFTER embedding worker completes (dependency chain), not in parallel or standalone (2026-02-24)
- **Context:** Two background ingestion tasks: embeddings + question generation; both needed for chunk search optimization
- **Why:** Ensures logical precondition: HyPE requires chunks to have embeddings first; simple sequential model is easier to reason about
- **Rejected:** Parallel execution with fallback; HyPE as independent scheduled job; merged into single ingestion step
- **Trade-offs:** Simpler logic gained; but creates hard dependency: if embeddings fail, HyPE never runs (no independent recovery); doubles perceived ingestion time
- **Breaking if changed:** If embedding worker is disabled/fails, HyPE silently doesn't run; switching to parallel requires handling race conditions and partial states

#### [Gotcha] Feature toggle `hypeEnabled` disables future HyPE generation but does NOT remove or clean up existing hype_embeddings in database (2026-02-24)
- **Situation:** Configuration allows turning HyPE on/off; toggle state unclear when OFF
- **Root cause:** Simpler to implement: just skip the worker; cleanup logic complex (orphaned embeddings, idempotency); toggle is on/off flag not state manager
- **How to avoid:** Implementation simplicity gained; but creates ambiguity: when hypeEnabled=false, is data stale? should retrieval use it? state becomes implicit

### Hardcoded generation of exactly 3 questions per chunk; not parameterized or configurable (2026-02-24)
- **Context:** Question diversity and retrieval coverage; decision on redundancy level
- **Why:** Simple constant; presumably empirically chosen as sweet spot between coverage and cost
- **Rejected:** Configurable parameter; dynamic based on chunk size; single question; five questions
- **Trade-offs:** Simplicity and predictable cost; but inflexible if use cases need more diverse queries (search quality becomes architectural limit)
- **Breaking if changed:** If operational needs change (need finer coverage), requires code change not config; if benchmarking shows 2 questions sufficient, still paying for 3

### Replaced working directory heuristic with explicit project configuration scan from settingsService for crash recovery session discovery (2026-02-24)
- **Context:** Multi-project environments where crash recovery sessions could exist in any project, not just the one where LE was started
- **Why:** Working directory is unreliable in crash scenarios - user might have been in project A but LE restarted in project B. Explicit configuration covers all known projects and is deterministic
- **Rejected:** Filesystem scanning (too slow, discovers unrelated projects), environment variables (not scalable), continuing to use single cwd (original approach - misses sessions)
- **Trade-offs:** Requires projects to be registered in settings service, but gains multi-project coverage and deterministic behavior. More complex dependency tree.
- **Breaking if changed:** If a project is not in settings, its sessions won't be discovered even if they exist on disk. Configuration drift becomes a failure mode.

#### [Pattern] Multi-level fallback chain: configured projects → process.cwd() if unconfigured → process.cwd() on error (2026-02-24)
- **Problem solved:** Crash recovery is critical path - cannot fail even if settings service is broken or returns empty config
- **Why this works:** Defensive programming for resilience. Each level provides a safety net: explicit config, then working directory heuristic, then error recovery.
- **Trade-offs:** More code paths to test, but guarantees service always restores sessions from somewhere. Hides misconfiguration - user might not realize missing projects.

#### [Gotcha] Pattern matching order (first-match-wins) is critical to correctness but implicit and undocumented. Pattern ordering must follow specificity principle: more specific patterns before general ones. (2026-02-24)
- **Situation:** FailureClassifierService executes 11 matchers sequentially. Patterns for 'timeout' (transient) and 'network error' (transient) could overlap; order determines classification.
- **Root cause:** First-match prevents backtracking, keeping logic simple and predictable. But this makes ordering a silent requirement—no explicit priority mechanism.
- **How to avoid:** Code is simple and fast. Dangerous to refactor—reordering patterns silently changes behavior for edge cases. Adding overlapping patterns breaks existing classifications without test visibility.

### Synchronous, pure pattern-matching classifier instead of async LLM or ML-based classification. (2026-02-24)
- **Context:** Recovery strategies are hardcoded in patterns, no external ML model or API call. Confidence scores are synthetic (0.8-0.95), not probabilistic.
- **Why:** Eliminates non-determinism, latency, and external dependencies. Every failure is classifiable offline. Pure functions enable embedding directly in hot-path code (EscalateProcessor).
- **Rejected:** Async LLM: high accuracy but introduces latency, cost, rate limits, non-determinism. ML classifier: requires labeled training data, retraining pipeline. Rules engine DSL: more flexible but harder to reason about.
- **Trade-offs:** Gains: reliability, speed, simplicity, offline-capability. Loses: accuracy for novel failure modes, adaptability without redeployment. Patterns become domain knowledge that must be manually maintained.
- **Breaking if changed:** If failure diversity exceeds pattern coverage, classification accuracy degrades and unknown category grows. No learning loop to auto-improve patterns. Manual pattern updates required for new tools/frameworks.

#### [Pattern] Recovery strategies are tightly mapped to FailureCategory patterns, embedding tactical recovery in the classifier itself. (2026-02-24)
- **Problem solved:** FailureAnalysis includes both category and recoveryStrategy. Each pattern matcher returns a strategy (e.g., rate_limit → exponential_backoff). Strategies are union type from shared @protolabsai/types.
- **Why this works:** Keeps failure diagnosis and recovery strategy coupled—if a failure is rate-limited, retry with backoff is the correct recovery. Single source of truth per failure type prevents strategy mismatches.
- **Trade-offs:** Simpler code (diagnosis + strategy together). Harder to evolve strategies independently. RecoveryStrategy changes require classifier updates. Strategy becomes an implementation detail of the classifier.

#### [Gotcha] Confidence scores (0.8-0.95 for patterns, 0.5 for unknown) are synthetic, not Bayesian—they don't represent actual error rates or misclassification probability. (2026-02-24)
- **Situation:** Downstream consumers may assume confidence score correlates to classification accuracy, but it's arbitrary: all matching patterns get 0.8-0.95, unmatched gets 0.5, regardless of pattern quality or false-positive rate.
- **Root cause:** Synthetic scores are simple to assign without data. High confidence for patterns encourages escalation; 0.5 for unknown preserves optionality. Intent is signaling, not accuracy metrics.
- **How to avoid:** Easy to assign without data vs misleading if consumers interpret as accuracy. Good for alerting logic vs bad for learning or auditing. Simpler than Bayesian scoring vs loses information about pattern quality.

### Pattern-based classification (regex + rule matching) instead of ML/LLM for failure analysis (2026-02-24)
- **Context:** Building an 'intelligence' service for failure analysis - most would assume ML-based approach
- **Why:** Deterministic results, zero-latency (no network), no external dependencies, fully auditable pattern logic, easy to test each category in isolation
- **Rejected:** LLM-based classification - requires async calls, external API, non-deterministic outputs, harder to debug why a failure was classified incorrectly
- **Trade-offs:** High reliability and speed vs limited semantic understanding; manual pattern maintenance required as error messages evolve
- **Breaking if changed:** If error messages change significantly or new unpredictable failure modes emerge, patterns become stale and classification accuracy drops - would require migration to ML

### Purely synchronous service design (no async, no await) despite being called from event-driven escalation flow (2026-02-24)
- **Context:** EscalateProcessor calls classify() during escalation event handling
- **Why:** Guarantees immediate result needed for synchronous decision logic (whether to escalate); prevents async callback complexity; keeps service stateless and testable
- **Rejected:** Async classify() with promise/callback - would require event handler to become async, changes propagation up the call chain, harder to guarantee classification happens before escalation event fires
- **Trade-offs:** Simple blocking calls easier to reason about vs potential for blocking event loop if classification ever becomes expensive (though current pattern matching is O(n) where n=11 patterns)
- **Breaking if changed:** If future requirements need real-time LLM assistance or external API calls, service architecture must be redesigned to async/promise-based

### Classification happens at escalation time (late binding), not at initial failure detection (2026-02-24)
- **Context:** classify() only called in EscalateProcessor when deciding to escalate, not during initial failure handling
- **Why:** Only classify failures that might escalate (reduces waste), keeps early failure handlers lightweight, context at escalation time is richer (retry count available)
- **Rejected:** Early classification at failure time - would classify all failures even transient ones that recover, adds latency to critical path, retry count unknown
- **Trade-offs:** Reduces wasted classification computation vs loses opportunity for early failure pattern detection and alerting
- **Breaking if changed:** If future feature needs failure classification immediately at detection time (e.g., for metrics/dashboards), would duplicate classification logic or refactor to classify on every failure

#### [Pattern] Confidence scoring uses different ranges for known (0.8-0.95) vs unknown (0.5) categories to encode epistemic uncertainty (2026-02-24)
- **Problem solved:** Pattern matches have high confidence; unmatchable errors have lower confidence, communicated via number not categorical flag
- **Why this works:** Downstream code can use confidence as threshold for decision-making (e.g., only auto-retry if confidence > 0.8); avoids separate 'is_confident' boolean field
- **Trade-offs:** Numeric score is richer signal but requires downstream consumers understand scoring ranges (implicit contract)

### Service instantiated directly in EscalateProcessor (not via DI container, not singleton) (2026-02-24)
- **Context:** Each EscalateProcessor instance gets own FailureClassifierService instance
- **Why:** Stateless service so no benefits to singleton; avoids DI setup complexity; each instance is cheap to create (just method definitions); isolation aids testing
- **Rejected:** Singleton pattern or DI injection - adds infrastructure, doesn't add value for stateless service
- **Trade-offs:** Simple direct instantiation vs loses opportunity to swap implementations (though unlikely given pattern-matching approach is baked in)
- **Breaking if changed:** If needed to add caching or state to classifier (e.g., pattern performance metrics), direct instantiation becomes problematic and requires refactor to singleton/DI

### Fire-and-forget async trajectory persistence (save() returns void immediately, write happens asynchronously in background) (2026-02-24)
- **Context:** TrajectoryStoreService persists execution trajectories to filesystem without blocking state machine flow
- **Why:** Decouples trajectory recording from critical path execution; trajectory data is observational, not required for feature state progression
- **Rejected:** Awaiting trajectory save (would add I/O latency to every state transition); throwing errors (would crash state machine on file write failures)
- **Trade-offs:** Gains: Fast execution, resilient to storage failures. Loses: Durability guarantees, error visibility - file write failures are silently logged
- **Breaking if changed:** If trajectory data becomes required for correctness (e.g., for automated rollback decisions), entire flow changes from non-blocking to blocking

#### [Gotcha] Auto-increment attempt numbering uses filesystem scanning (scan existing attempt-{N}.json files to determine next number) rather than persistent counter (2026-02-24)
- **Situation:** Trajectory files stored at .automaker/trajectory/{featureId}/attempt-{N}.json with N auto-incremented per call
- **Root cause:** Avoids need for external counter (database, shared state). Filesystem is already the storage location.
- **How to avoid:** Gains: Simple, self-contained implementation. Loses: Directory I/O overhead per save(), race condition window if multiple processes write simultaneously

### StateContext extended with startedAt and stateTransitions fields for trajectory data collection rather than creating separate trajectory tracking object (2026-02-24)
- **Context:** State machine context evolved to carry timing and transition history used by TrajectoryStoreService.save()
- **Why:** Single object holding all state reduces context-passing complexity and coordination points; trajectory is inherent to state progression
- **Rejected:** Separate TrajectoryCollector object passed alongside StateContext (would require coordinating two objects). Event listener pattern (adds coupling between state machine and observer).
- **Trade-offs:** Gains: Simple, co-located data. Loses: StateContext becomes responsible for non-state concerns (timing, trajectory schema compatibility)
- **Breaking if changed:** StateContext schema changes require TrajectoryStoreService review; trajectory requirements drive StateContext evolution

### Consolidated hooks from separate hooks.json into plugin.json, making hooks part of the plugin distribution payload rather than requiring per-project configuration (2026-02-24)
- **Context:** Plugin format needed to support shipping hooks with MCP servers. Previously hooks were in separate hooks.json requiring manual setup in each project.
- **Why:** Single source of truth for plugin configuration. Plugins automatically distribute hooks to all consuming projects on update without requiring separate configuration management.
- **Rejected:** Keep hooks.json separate for modularity - rejected because it requires manual per-project configuration and doesn't achieve the goal of making hooks 'ship with plugin'
- **Trade-offs:** Simpler distribution and maintenance (+) vs larger plugin.json file and tighter coupling of plugin definition to runtime behavior (-)
- **Breaking if changed:** Projects with custom hooks.json will lose their hooks unless migrated into plugin.json format. The plugin.json field addition is non-breaking for existing installations without hooks.

#### [Pattern] Hook execution model uses command-based execution (bash scripts) rather than direct function references or module imports, enabling plugin-agnostic hook dispatch from Claude Code runtime (2026-02-24)
- **Problem solved:** Claude Code runtime needs to invoke hooks from plugins without loading plugin code directly. Shell command execution provides isolation and extensibility.
- **Why this works:** Bash script invocation is process-isolated, doesn't require plugin code in Claude Code memory, and can be implemented consistently across different plugin types. Scripts can be in any language.
- **Trade-offs:** Process isolation and language-agnostic (+) vs subprocess overhead and harder debugging (-)

#### [Gotcha] Naming conflict between PenVector (2D point type) and PenVector (node type) in discriminated union. Resolved by renaming node type to PenVectorGraphic. (2026-02-24)
- **Situation:** Creating a discriminated union of node types while also defining primitive types for coordinates/vectors
- **Root cause:** Discriminated unions require unique identifiers for type discrimination. Having duplicate names causes ambiguous exports and type conflicts.
- **How to avoid:** More deliberate naming (PenVectorGraphic) is longer but prevents silent collisions; clearer intent but adds verbosity

### PenFill implemented as discriminated union with three variants (solid, gradient, image) rather than single interface with optional fields (2026-02-24)
- **Context:** Supporting multiple fill types with different property sets (solid has color; gradient has stops; image has ref)
- **Why:** Discriminated union prevents invalid combinations (e.g., gradient fill with imageRef) through TypeScript's type narrowing
- **Rejected:** Alternative: Single interface with optional fields (fillType + optional color/gradient/imageRef) loses type safety
- **Trade-offs:** More verbose type definitions; gains type-safe property access (no need for narrowing before accessing fill-specific props)
- **Breaking if changed:** Changing to optional-field approach removes compile-time guarantees; accessing wrong properties becomes possible at runtime

### Parser separated into discrete modules: parser (deserialization), traversal (graph navigation), variables (token resolution) (2026-02-24)
- **Context:** Could have been implemented as single monolithic parser module
- **Why:** Enables independent evolution of concerns - parser can be upgraded without touching traversal logic; variables resolution logic is isolated for reuse in other contexts (e.g., code generation, validation)
- **Rejected:** Single monolithic PenParser class with all methods - would create tight coupling between parsing, navigation, and resolution
- **Trade-offs:** Easier: Testing individual concerns, extending one module without risk; Harder: Requires understanding dependencies between modules, more files to maintain
- **Breaking if changed:** If consolidated into single module, would lose ability to use traversal utilities independently or swap variable resolution strategies

### Component instances use ID references instead of embedding component definition inline (2026-02-24)
- **Context:** PEN file format design - could embed full component definition in every instance
- **Why:** File size optimization - design file with 20 button instances referencing single Button component definition is much smaller than 20 copies of same definition; standard practice in design file formats
- **Rejected:** Inline component definitions - would bloat file size by factor of component_count-1 for each component type
- **Trade-offs:** Easier: Smaller file size, faster parsing; Harder: Requires reference resolution mechanism, circular ref checks, handling missing refs
- **Breaking if changed:** If changed to inline definitions, parser doesn't need resolveRef, but file format becomes larger and updating component definition requires finding all instances

### Used host.docker.internal:3008 to reach Automaker server from Prometheus container instead of Docker network linking (2026-02-25)
- **Context:** Prometheus container needs to scrape metrics from host-running Automaker server on port 3008
- **Why:** host.docker.internal is DNS name that resolves to host IP from inside container; simplest approach when app runs outside Docker without requiring custom bridge networks or host network mode
- **Rejected:** Docker bridge network (would require app to join monitoring network), host network mode (reduces container isolation), localhost (fails - container localhost ≠ host localhost)
- **Trade-offs:** Simpler setup vs reduced network flexibility; works across platforms (Mac/Linux/Windows) vs platform-specific solutions
- **Breaking if changed:** If changed to localhost or removed port mapping, Prometheus loses access to metrics endpoint; deployment on systems without host.docker.internal support would fail

#### [Pattern] Prometheus configured to scrape 3 separate targets: application metrics, node-exporter system metrics, and self-monitoring - not just application metrics (2026-02-25)
- **Problem solved:** Observability stack needs visibility into both application behavior and infrastructure health
- **Why this works:** Separating targets enforces single-responsibility; allows independent alerting/dashboarding on infrastructure vs application concerns; self-scraping enables Prometheus uptime monitoring
- **Trade-offs:** More complex scrape config vs better separation of concerns; separate targets enable independent failure domains

#### [Pattern] Grafana datasource auto-provisioned via external provisioning file (monitoring/grafana/provisioning/datasources/prometheus.yml) instead of manual UI configuration (2026-02-25)
- **Problem solved:** Grafana needs to know about Prometheus datasource on startup
- **Why this works:** Provisioning files make infrastructure immutable and version-controllable; eliminates manual post-deploy configuration step; stack can be recreated identically from files alone
- **Trade-offs:** Extra file/directory structure vs reproducibility and IaC; harder to discover vs easier to automate

#### [Gotcha] Prometheus scrapes specific endpoint /api/metrics/prometheus on Automaker server - requires server implementation and version compatibility (2026-02-25)
- **Situation:** Stack documentation says 'existing /api/metrics/prometheus endpoint is already implemented' - but this creates hard dependency
- **Root cause:** Prometheus requires specific metrics format (OpenMetrics/Prometheus text format); cannot use arbitrary JSON endpoints without custom exporters
- **How to avoid:** Tight coupling to server implementation vs simpler Prometheus config

### Grafana port remapped to 3010 instead of standard internal port 3000 (2026-02-25)
- **Context:** Docker port mapping decision for external access
- **Why:** Avoids port conflicts with potential dev services already using 3000 (React apps, etc.); indicates intentional port allocation strategy in deployment environment
- **Rejected:** Using standard 3000 (risks conflicts with other services), using random port (harder to remember and document)
- **Trade-offs:** Non-standard port slightly harder to remember vs eliminates common port conflicts
- **Breaking if changed:** If changed back to 3000, external access must change; documentation and scripts become invalid; developers must know to use :3010 not :3000

#### [Pattern] Configuration managed via external YAML/INI files mounted into containers rather than environment variables in docker-compose (2026-02-25)
- **Problem solved:** Complex configurations (Prometheus scrape jobs, Grafana auth settings) need to be managed and versioned
- **Why this works:** YAML/INI files preserve structure and comments better than flattened env vars; easier to diff/version control complex configs; external files enable secrets injection without modifying docker-compose
- **Trade-offs:** More files to manage vs better readability, version control, and security (can use .gitignore on sensitive files)

#### [Pattern] Using Promtail relabel_configs to extract Docker metadata (container_name, service, compose_project) as Loki labels rather than parsing log content or relying on application instrumentation (2026-02-25)
- **Problem solved:** Making logs searchable by meaningful identifiers without modifying application code or parsing log lines
- **Why this works:** Prometheus relabel syntax allows powerful extraction from Docker service discovery API; decouples infrastructure concerns from application logic; labels become immutable at ingestion time for efficient indexing
- **Trade-offs:** Centralized, scalable label management vs requires understanding Prometheus relabel syntax; fixed label cardinality from start

### Configuring two separate Promtail Docker scrape jobs: one filtered to compose project containers, one collecting from all Docker containers (2026-02-25)
- **Context:** Handling mixed deployment scenarios with both compose-managed and potentially standalone containers
- **Why:** Compose-filtered job provides logical application-level isolation; all-containers job acts as safety net for non-compose workloads; allows selective relabeling strategies per job
- **Rejected:** Single catch-all job for all containers; single compose-only job that misses non-compose containers
- **Trade-offs:** Flexibility and coverage vs potential for duplicate log ingestion if filters overlap; added configuration complexity
- **Breaking if changed:** Removing either job reduces scope coverage; duplicates would inflate retention period impact and costs

### Resolver function passed as parameter through style utilities instead of accessing PenThemeContext directly within utils (2026-02-25)
- **Context:** Need to resolve theme variables in style-utils.ts functions (colorToCSS, fillToCSS, strokeToCSS) while keeping utilities pure and testable
- **Why:** Dependency injection pattern keeps utilities decoupled from React Context, enables testing utils without mocking context, and maintains single responsibility
- **Rejected:** Direct context access in utils via useContext hook would couple utils to React and make unit testing impossible
- **Trade-offs:** Easier to test style utilities but requires threading resolver through multiple function calls; more explicit dependencies
- **Breaking if changed:** Removing resolver parameter causes all variable tokens ($--variable-name) to pass through unresolved, rendering literal strings instead of computed values

#### [Gotcha] Variable resolution falls back to default value when no theme-specific value exists, but silently succeeds if default is also missing (2026-02-25)
- **Situation:** resolveVariable() function has no error handling for missing defaults; returns undefined without indicating resolution failure
- **Root cause:** Graceful degradation approach avoids crashes, but makes bugs harder to catch—unresolved variables render as actual values rather than throwing
- **How to avoid:** Robust against incomplete data but unresolved variable bugs become silent failures only visible in visual inspection

### Theme selections not persisted to localStorage; context value resets on page refresh (2026-02-25)
- **Context:** Users switch themes via context state, which lives only in component memory during current session
- **Why:** Scope boundary decision—feature focused on rendering system, not UX workflow; avoids adding state persistence complexity
- **Rejected:** localStorage persistence would remember user selections but adds sync complexity and storage API dependency
- **Trade-offs:** Simpler implementation but users lose theme preference on navigation; future feature would require refactoring
- **Breaking if changed:** Adding persistence later requires state sync between context updates and localStorage, plus handling stale data scenarios

#### [Pattern] PenThemeProvider uses render props pattern with React context instead of exposing useContext hook only (2026-02-25)
- **Problem solved:** Components need theme context value AND a way to update theme selections while maintaining composition
- **Why this works:** Render props gives consumers explicit control over what gets rendered; avoids HOC wrapper hell; keeps theme logic centralized while allowing flexible UI layer
- **Trade-offs:** More boilerplate in consumers (render function callback) but enables theme logic to be isolated and testable independently of component tree

#### [Pattern] Dashboard provisioning via YAML config + JSON definitions instead of manual Grafana UI configuration (2026-02-25)
- **Problem solved:** Dashboards must be reproducible across deployments and persist in version control
- **Why this works:** Enables Infrastructure as Code, GitOps workflows, and eliminates manual configuration drift. Provisioning ensures dashboards auto-load on Grafana startup without user intervention.
- **Trade-offs:** Added complexity of maintaining separate provisioning YAML + JSON structures, but gained complete reproducibility and elimination of configuration drift

#### [Pattern] Dashboard-level templating variables (time_range) instead of hardcoded time ranges in individual panels (2026-02-25)
- **Problem solved:** Users need to filter dashboard data across multiple panels simultaneously without editing dashboard configuration
- **Why this works:** Dashboard variables propagate to all panels sharing that variable, enabling single-click time range changes across the entire dashboard. Alternative (per-panel configuration) would require users to edit each panel individually.
- **Trade-offs:** Adds JSON complexity to dashboard structure but dramatically improves operational usability and user experience

### Dashboards defined assuming Prometheus datasource with UID 'prometheus' exists, without enforcing or validating this dependency at provisioning time (2026-02-25)
- **Context:** Dashboards reference specific datasource UID in all panel queries but don't validate the datasource exists
- **Why:** Loose coupling allows dashboard provisioning independent of datasource setup. Tighter coupling would require orchestrated initialization sequence. Grafana can provision dashboards before datasources are created (though they'll appear empty).
- **Rejected:** Fail-fast validation that datasource exists (creates ordering dependency, complicates deployment)
- **Trade-offs:** Looser coupling enables flexible deployment, but datasource misconfiguration silently fails with empty dashboards
- **Breaking if changed:** If Prometheus datasource UID changes or datasource name differs, all dashboard queries fail silently without showing datasource error.

#### [Gotcha] Dashboards can be successfully provisioned before their required Prometheus metrics are instrumented in the application code (2026-02-25)
- **Situation:** Dashboard configurations reference metrics like automaker_deploys_total, automaker_agents_active that may not exist yet in Prometheus
- **Root cause:** Grafana doesn't validate metric existence at dashboard load time. This loose coupling allows config-driven development but creates potential for silent data absence.
- **How to avoid:** Enables parallel development of monitoring infrastructure and metrics instrumentation, but causes confusing 'empty dashboard' state until metrics are emitted

#### [Pattern] UID-based semantic naming convention for dashboards (automaker-*) instead of auto-generated GUIDs (2026-02-25)
- **Problem solved:** Grafana dashboards need stable, identifiable UIDs across deployments for linking and dashboard relationships
- **Why this works:** Semantic UIDs survive dashboard reimports/reprovisioning and enable reliable linking between dashboards. Auto-generated UIDs change with each reimport, breaking saved links.
- **Trade-offs:** Requires manual UID planning but provides stable dashboard identity across deployments

#### [Pattern] Real-time state tracking via push-based gauge updates at 7 collection mutation points (add/remove from runningFeatures map) vs calculated from counters (2026-02-25)
- **Problem solved:** Could have incremented a counter on agent start and decremented on agent end, then calculated active count = start_total - end_total
- **Why this works:** Gauge updated at mutation time gives accurate real-time snapshot of concurrent agent activity. Counter approach would require query-time calculation and lose precision on agent lifecycle events.
- **Trade-offs:** More frequent metric updates (7 points) but accurate real-time concurrency visibility on dashboards; alternative would trade update overhead for stale data

### Used recursive findNodeById tree traversal instead of pre-indexing nodes in store (2026-02-25)
- **Context:** Need to locate selected node by ID anywhere in nested PEN document tree to display properties
- **Why:** PEN documents are small UI editor trees (typically <1000 nodes). O(n) search is negligible. Pre-indexing adds memory overhead and requires maintaining index on every document mutation.
- **Rejected:** Pre-building ID->node Map on document load would be O(1) lookup but requires index maintenance complexity
- **Trade-offs:** Slightly slower search (microseconds) vs significantly simpler code and less state to manage. Scales poorly above ~10k nodes.
- **Breaking if changed:** If document trees grow to 100k+ nodes, performance degrades. If tree structure changes, search logic must adapt.

#### [Pattern] Selection state auto-clears when switching files to prevent stale references to nodes no longer in document (2026-02-25)
- **Problem solved:** User selects node in File A, then switches to File B. Selected node ID no longer exists in new document.
- **Why this works:** Prevents inspector from showing properties for a node that doesn't exist in current view. Maintains consistency between selection state and visible content.
- **Trade-offs:** Less selection persistence vs data consistency. Users must reselect after file switch but always see valid data.

#### [Gotcha] Datasource UID must match exactly between alert rules and datasource provisioning. Alert rules reference datasourceUid internally, not datasource names. (2026-02-25)
- **Situation:** Alert rules define Prometheus queries with a datasourceUid field that must match the UID assigned in provisioning/datasources/prometheus.yml
- **Root cause:** Grafana stores datasource references by internal UUID. If UUIDs don't match, alerts silently fail without error messages.
- **How to avoid:** UUID coupling makes config less readable but ensures deterministic datasource binding across environments

### Notification policies use matchers (severity = critical/warning) to route alerts to different batch windows, not separate contact points per severity (2026-02-25)
- **Context:** Need to send critical alerts immediately (0s wait) and batch warnings every 5 minutes (30s wait, 5m interval) without duplicate notifications
- **Why:** Matchers in notification policies are the Grafana unified alerting native pattern. Single contact point (Discord) with routing logic is more maintainable than multiple contact points.
- **Rejected:** Alternative: Create separate contact points and manual rules for each severity. Would be more flexible but harder to modify routing logic later.
- **Trade-offs:** Centralized routing in policies is easier to modify and audit. Less flexible for complex multi-dimensional routing (though that can be added via additional matchers).
- **Breaking if changed:** If matchers are removed or naming changes, all alerts route to default policy. Removing severity-based routing loses batching strategy entirely.

### Critical alerts configured with 0s group_wait and 1m repeat interval vs warnings with 30s group_wait and 5m interval to balance responsiveness with notification fatigue (2026-02-25)
- **Context:** Grafana alert grouping window (group_wait) determines how long to wait before sending first notification, repeat interval controls how often to re-notify
- **Why:** 0s for critical means immediate Discord notification (maximizes MTTR), 30s for warnings allows grouping multiple related alerts into single message (reduces noise)
- **Rejected:** Uniform batching (e.g., all 5m): Would reduce critical alert latency. Uniform immediate (e.g., all 0s): Would cause Discord spam for warning storms.
- **Trade-offs:** Immediate critical notification means faster response but potential for alert fatigue if too many criticals. Batched warnings reduce noise at cost of up to 5m detection delay.
- **Breaking if changed:** Setting critical group_wait to > 0 introduces alert latency that could impact incident response. Removing batching for warnings causes Discord notification storms.

#### [Pattern] Grouped alerting by alertname + severity in notification policies reduces Discord notification volume for correlated failures (e.g., multiple disk mount points failing simultaneously) (2026-02-25)
- **Problem solved:** Alert rules configured to fire independently; notification policy groups related alerts to prevent notification explosion during cascading failures
- **Why this works:** When infrastructure degrades, multiple alerts often fire simultaneously (e.g., CPU spike → disk thrashing → memory pressure). Grouping by alertname ensures single Discord message per alert type per severity level.
- **Trade-offs:** Grouping reduces notification noise and makes Discord channel readable. Trade-off: Requires checking Grafana UI to see individual alert instances within the group.

#### [Pattern] Group components using name prefix with '/' delimiter (e.g., 'Button/Primary' → 'Button' group) instead of explicit group metadata (2026-02-25)
- **Problem solved:** Need hierarchical component organization without requiring additional properties on every node
- **Why this works:** Leverages existing naming convention in design systems for automatic hierarchy; zero metadata overhead; scales as components are added
- **Trade-offs:** Automatic convenience and clean UI vs. strict naming discipline requirement and inability to reorganize without renaming

### Mark reusable components with optional boolean flag (reusable?: boolean) on PenNodeBase instead of maintaining separate component registry (2026-02-25)
- **Context:** Need to identify which nodes can be instantiated as library components without external configuration
- **Why:** Single source of truth - metadata lives with node; enables any node to opt-in without ceremony; no synchronization required between node tree and registry
- **Rejected:** Separate registry - would require manual registration, duplicate storage, and out-of-sync risk when nodes are deleted or moved
- **Trade-offs:** Simpler, decentralized design vs. inability to externally mark nodes as reusable without modifying the document
- **Breaking if changed:** Removing the flag means losing component-level reusability control; switching to registry would require migrating all marked nodes and complex tree scanning logic

### Separate webhook routes outside /api/* paths to avoid authentication middleware (2026-02-25)
- **Context:** Grafana webhooks must be unauthenticated. Initial attempt put alerts at /api/alerts which failed because API routes had auth middleware applied.
- **Why:** Webhook services like Grafana cannot provide credentials in their outbound HTTP requests. Mixing webhooks with authenticated API routes creates a permission model conflict where valid webhooks get rejected.
- **Rejected:** Conditional auth middleware to whitelist webhook paths, or embedding API key requirements in webhook URLs (less secure)
- **Trade-offs:** Requires separate route files and mounting points (slightly more code organization) but prevents hard-to-debug authentication failures. Cleaner permission model.
- **Breaking if changed:** Moving webhooks back under /api/* will cause Grafana (and other webhook services) to receive 401/403 responses and fail silently to POST alerts.

### Use simple exact title matching for deduplication instead of fingerprint hashing (2026-02-25)
- **Context:** Multiple Grafana alert firing events for the same underlying condition could create multiple Linear issues. Needed deduplication strategy.
- **Why:** MVP speed - exact matching is trivial to implement (single Linear search API call). Described as 'simple but effective'. Fingerprint hashing would require additional logic to normalize alert data.
- **Rejected:** Fingerprint-based deduplication using MD5 of normalized alert state (more robust but adds complexity and requires determining which fields constitute uniqueness)
- **Trade-offs:** Simple implementation now vs. false negative risk later. Will create duplicate issues if alert name changes slightly (e.g., 'HighCPU_prod' vs 'HighCPU_prod_instance2'). Production may need fingerprinting.
- **Breaking if changed:** Deduplication stops working if alert names are variations on same condition. Also fails if same issue is resolved+recreated - exact title match won't find the closed issue.

#### [Pattern] Graceful degradation for optional services - Discord notifications are non-blocking relative to Linear issue creation (2026-02-25)
- **Problem solved:** Implementation creates Linear issues and posts Discord notifications. Discord service might be unavailable or unconfigured.
- **Why this works:** Core functionality (bug tracking) should not depend on secondary notification channel. Prevents cascading failures where one missing integration blocks the entire pipeline.
- **Trade-offs:** Issues get created even if Discord is down (good). Operator might miss notifications but issue is still tracked (acceptable). Code must handle missing Discord gracefully with proper null checks.

#### [Pattern] Defensive quality gates prevent low-quality output generation by refusing to create content.md when antagonistic review scores fall below threshold (75%), rather than generating and filtering afterward. (2026-02-25)
- **Problem solved:** Content pipeline completes end-to-end but produces zero output files because research scores consistently fail at ~10%. This appears to be a failure but is actually the quality gate system working as designed.
- **Why this works:** Prevents propagation of low-quality content downstream. A refused generation is better than silently releasing substandard content. The architectural choice is: fail-safe (don't generate) not fail-open (generate and flag).
- **Trade-offs:** Upside: Guarantees output quality meets threshold. Downside: Debugging why content wasn't generated requires checking quality scores in Langfuse, not checking for missing files. Visibility requires trace inspection, not artifact inspection.

#### [Pattern] Fail-forward with draft fallback: save research findings as draft content even when quality gates fail, providing debugging artifacts and visibility into why gates failed. (2026-02-25)
- **Problem solved:** Research fallback code saves research results to content.md when antagonistic review fails (added to content-flow-service.ts:715-737). Requires server restart to activate. All 5 test runs completed without crashing despite quality failures.
- **Why this works:** When quality gates block content generation, you lose visibility into whether the block was due to poor input (sparse research) or a genuine quality issue. Draft artifacts let you inspect research findings and decide if threshold is miscalibrated.
- **Trade-offs:** Upside: Debugging surface area (you can see what research produced 10% score). Downside: Draft files may be mistaken for real output if visibility is poor. Requires documentation that draft ≠ final.

### Configurable pass threshold (PASS_THRESHOLD=75%) for quality gates, allowing tuning without code changes. Log notes this should be adjusted based on quality requirements. (2026-02-25)
- **Context:** The 75% threshold blocks all test runs. Implementation recommends adjusting based on 'quality requirements' but doesn't specify what happens if you lower to 50% or raise to 90%.
- **Why:** Different topics have different quality requirements. Content about complex architecture needs higher threshold than tutorial content. Configuration allows operators to tune without deploying.
- **Rejected:** Alternative: Hardcode threshold. Rejected because it forces code changes and redeployment for threshold adjustments. Alternative: Use dynamic thresholds per topic (config file per topic). Rejected as over-engineered.
- **Trade-offs:** Upside: Operators can tune without involving developers. Downside: No guidance on how to choose threshold. Too high = no content ever passes. Too low = low-quality content passes.
- **Breaking if changed:** If threshold config is missing or set to 0%, all runs will fail (threshold unreachable) or all will pass (threshold meaningless). The configuration is critical to the feature working correctly but has no validation.

### GitHub Release v0.4.0 created manually via gh CLI before npm publishing was possible, decoupling release artifacts from npm registry availability (2026-02-25)
- **Context:** NPM_TOKEN not configured in GitHub Secrets, blocking automated changeset workflow. Developer needed to demonstrate completeness of release without waiting for npm authentication.
- **Why:** Releasing is multi-phase: (1) versioning/tagging/release artifact creation, (2) npm publishing. Decoupling these prevents external infrastructure dependencies from blocking visibility of what was released. Release notes can document blockers without affecting the release artifact itself.
- **Rejected:** Waiting for NPM_TOKEN configuration before creating any release artifact would delay feedback and treat npm publishing as mandatory for release visibility rather than a separate post-release step.
- **Trade-offs:** Easier: Clear separation between 'what was released' (tag + GitHub release) vs 'where it's published' (npm). Harder: Requires communicating to users that packages are tagged but not yet on npm.
- **Breaking if changed:** If releases are required to include working npm links before publication, this decoupling becomes impossible. Tightly coupling release to npm availability delays release communication.

### Release notes explicitly document NPM_TOKEN blocker for npm publishing, providing clear handoff point rather than silent failure or workaround (2026-02-25)
- **Context:** Packages are at v0.4.0, GitHub release exists, but npm publishing is blocked. Stakeholders need to understand why packages aren't on npm registry.
- **Why:** Explicit communication of blockers (1) prevents support load from 'why can't I install the package?', (2) makes it clear this is external dependency (secrets management), not code issue, (3) provides clear next steps for resolution.
- **Rejected:** Silent failure (workflow fails, no communication) creates confusion. Workaround (upload to custom registry) adds technical debt. Retrying indefinitely burns CI minutes.
- **Trade-offs:** Easier: stakeholders understand status and why. Harder: must document infrastructure setup alongside feature completion.
- **Breaking if changed:** If this communication is removed, release appears incomplete/broken to end users. If blocker isn't documented, developers waste time debugging missing npm token instead of configuring it.

#### [Pattern] Feature stops at external infrastructure requirement (NPM_TOKEN configuration) rather than expanding scope to include secret management or workarounds (2026-02-25)
- **Problem solved:** Implementation is feature-complete (versioning, tagging, release notes) but blocked on GitHub Secrets configuration which is outside the feature boundary
- **Why this works:** Clear scope boundaries prevent scope creep and technical debt. NPM_TOKEN management is (1) repository-wide infrastructure, not feature-specific, (2) requires human security review (who can publish?), (3) one-time setup that enables many releases.
- **Trade-offs:** Cleaner architecture: security setup is separated from release mechanics. Slight friction: handoff requires human action (Josh configures secret).

#### [Pattern] Defined SanitizationViolation, SanitizationResult, and SanitizationSeverity interfaces locally in sanitize.ts rather than in @protolabsai/types package, despite types being the centralized interface repository. (2026-02-25)
- **Problem solved:** Creating reusable sanitization library that exports both functions and types
- **Why this works:** If types were imported from @protolabsai/types and types re-exported, it would create a circular dependency: types imports from utils for normalization, utils imports from types for interfaces. Local definitions break the cycle while keeping the library self-contained.
- **Trade-offs:** Slight duplication if other packages need these interfaces (they'd have to import from utils instead of types), but eliminates circular dependency overhead and keeps sanitization library dependency-free

### Feature count logic explicitly aligns with generate-changelog.mjs: same cutoff date (CUTOFF_DATE 2026-02-04), same categorization (feature-category commits), same git log parsing logic. (2026-02-25)
- **Context:** Two independent scripts (changelog generator and stats generator) both need to count 'features shipped'. Without alignment, they can report different numbers.
- **Why:** Data consistency. Users see 'X features' in changelog and 'X features' in stats.json. Mismatch erodes confidence. Shared logic also reduces copy-paste bugs.
- **Rejected:** Loading feature count from Automaker board directly (would miss features not yet migrated to board). Or: querying database (introduces coupling, fragility).
- **Trade-offs:** Stats script now depends on git log format conventions (feature-category syntax). Easy to break if someone changes commit message format. But git history is immutable, so it's the authoritative source.
- **Breaking if changed:** If feature count logic diverges, changelog and stats report different numbers. Users notice inconsistency. Single source of truth is compromised.

#### [Pattern] Data-driven static site: JSON files (roadmap.json, stats.json, changelog.json) are single source of truth; mjs scripts perform git analysis and inject data into HTML templates, creating derived artifacts that are version-controlled. (2026-02-25)
- **Problem solved:** Roadmap and changelog are public marketing pages that must stay in sync with git history and project state without manual updates.
- **Why this works:** Decouples data from presentation; makes content reproducible and git-trackable; prevents manual HTML drift; git-analysis scripts are deterministic.
- **Trade-offs:** Benefit: reproducible, version-controlled, queryable data. Cost: requires running generation scripts; HTML is derived not editable; hidden dependency chain between scripts.

### JSON data-only changes (no TypeScript code) are valid and complete even when npm run build:server fails with unrelated TypeScript errors. Data generation pipeline is decoupled from code compilation. (2026-02-25)
- **Context:** Feature modified 5 JSON files; npm run build:server failed on secure-fs.ts (unrelated). Feature was still considered complete.
- **Why:** stats:generate is a standalone Node script that doesn't depend on TypeScript compilation. JSON has no compilation step. Separates data concerns from code concerns.
- **Rejected:** Could block all changes on full build success, but that gates valid data work with irrelevant code errors.
- **Trade-offs:** Benefit: unblock data-only work from code issues. Risk: developers may miss that code errors exist. Requires discipline: knowing which features are data-only vs. code-dependent.
- **Breaking if changed:** If project later mandates 'all PRs must have passing build', this pattern breaks. Would need different gating (only check code files, not data files) or fix the underlying build error.

#### [Pattern] Trust classification uses layered precedence: explicit storedTier (if provided) overrides source-based classification. Source classification itself is tiered: mcp/internal=4, ui=3, api/github=1, unknown=0. This creates an explicit-before-implicit hierarchy for trust decisions. (2026-02-25)
- **Problem solved:** Needed to support both automatic trust inference from feature source AND manual trust grants that override automatic classification
- **Why this works:** Security principle: explicit trust decisions must not be bypassed by implicit source classification. An admin-granted tier should always take precedence over where the feature came from. Allows gradual trust escalation while maintaining override capability.
- **Trade-offs:** Adds parameter complexity to classifyTrust(), but ensures security model is unambiguous. Explicit tier > source classification > default creates clear decision tree.

### Service accepts dataDir in constructor (passed from environment/config), stores data to '{dataDir}/trust-tiers.json'. Does not hardcode paths. Consistent with SettingsService and existing service patterns. (2026-02-25)
- **Context:** Different deployment environments need different data directories. Dev uses local, staging uses mounted volume, Electron uses app data directory, etc.
- **Why:** Constructor injection of dataDir makes the service testable (can pass test directory) and portable (works anywhere dataDir is mounted). Avoids hardcoding assumptions about file locations.
- **Rejected:** Hardcoding path like `~/.automaker/trust-tiers.json` (breaks in containerized/Electron deployments). Reading from env var at module load time (creates side effects).
- **Trade-offs:** Requires dataDir to be known at service instantiation time. But pays for flexibility across deployment contexts. Slightly more boilerplate in service instantiation code, but massive payoff in portability.
- **Breaking if changed:** If code assumes dataDir is always /home/user/.automaker, running in Electron or Docker container breaks. If code changes dataDir after instantiation, the service won't see it.

#### [Pattern] Signal deduplication uses polymorphic keys: GitHub/Linear/Discord/MCP signals deduplicate by (source, authorID); UI/MCP HTTP signals deduplicate by (source, timestamp). No universal deduplication strategy. (2026-02-25)
- **Problem solved:** signal-intake-service must prevent duplicate processing but different signal sources have different lifecycle expectations.
- **Why this works:** Integrations (GitHub, Linear, Discord) originate from users (authorID is stable); UI/MCP are requests (timestamp is the unique marker). Conflating these causes either false duplicates or missed deduplication.
- **Trade-offs:** Polymorphic keys require understanding each source's semantics but prevent business logic errors. Adds code complexity.

### content-flow-service does NOT validate input parameters upfront (e.g., non-empty topics, valid format enum). Validation happens implicitly during async LangGraph execution, errors bubble as failed flow states. (2026-02-25)
- **Context:** Service architecture separates parameter acceptance from parameter validation; allows async execution to handle constraints.
- **Why:** Defers validation cost to execution time. Invalid parameters don't fail fast but instead fail during workflow execution, which may be asynchronous anyway. Tests reflect actual behavior (no upfront rejection).
- **Rejected:** Upfront validation with thrown exceptions for invalid parameters; would require explicit error handling in callers and test assertions on error responses.
- **Trade-offs:** Caller doesn't get immediate feedback on invalid parameters; errors appear during execution. But execution may handle some 'invalid' inputs gracefully.
- **Breaking if changed:** If upfront validation is added (e.g., `if (!topics || topics.length === 0) throw`), all callers must expect synchronous errors. Current code assumes all results are async flow states.

### Resolution chain returns single source string (settings|env|git), not aggregated availability of all sources (2026-02-25)
- **Context:** User requests identity and receives { userName, source } rather than { settings?: x, env?: y, git?: z }
- **Why:** Simpler API response; matches conventional identity patterns (single authoritative source); client doesn't need source metadata
- **Rejected:** Multi-value response { settings?: value, env?: value, git?: value, resolvedSource: 'settings' } with full visibility into all sources
- **Trade-offs:** Lean API contract vs lost introspection capability; client can't detect which sources are available
- **Breaking if changed:** If code needs to know 'settings unavailable, fell back to git', must call service internals or add new API field

#### [Pattern] Validation logic placed in routes layer, not in service; HTTP concerns (empty strings, type checking) separated from business logic (2026-02-25)
- **Problem solved:** POST /api/user/identity validates userName before calling userIdentityService.setUserName()
- **Why this works:** Routes handle transport-layer concerns (HTTP semantics); service owns persistence logic only
- **Trade-offs:** Routes are dumb wrappers (easy to test, obvious HTTP mapping) vs validation can't be reused if service called via other transport (gRPC, pubsub)

#### [Pattern] Service instantiation order in index.ts strictly enforced: dependencies created before service, service created before routes registered (2026-02-25)
- **Problem solved:** UserIdentityService created after SettingsService, then routes registered; order is implicit, not enforced by compiler
- **Why this works:** Dependency injection pattern requires explicit constructor dependencies; no DI container auto-resolves
- **Trade-offs:** Explicit order is clear to readers vs fragile to refactoring (easy to accidentally reverse order)

#### [Gotcha] Backend API endpoints `/api/user/identity` assumed but not implemented. Feature built to spec but non-functional without backend work. (2026-02-25)
- **Situation:** UI implementation completed with http-api-client calls to endpoints that don't exist on server. Build passes, but feature cannot execute.
- **Root cause:** Feature scope unclear about backend/frontend boundary. UI developer proceeded with API contract assumptions that weren't validated.
- **How to avoid:** UI is clean and complete, but dependency assumption creates hard blocker. Discovered late (after build), not during planning.

#### [Gotcha] Feature title 'auto-assign me' but implementation is actually task FILTERING, not assignment. 'My Tasks' button filters tasks where assignee matches userIdentity. (2026-02-25)
- **Situation:** Requirement unclear: is this assigning features to the current user, or filtering a pre-existing board? Implementation chose filtering.
- **Root cause:** Root cause: feature title uses 'assign' but board UI doesn't have assignment logic. Button is filter button in header. Requirement scope mismatch.
- **How to avoid:** Filtering is simpler (no backend mutation), works with any feature that has assignee data. But title misleads into thinking this is assignment UX.

### Per-request QuarantineService instantiation vs singleton pattern. QuarantineService is instantiated in route handler with request-specific projectPath, while TrustTierService remains a singleton initialized at startup with DATA_DIR. (2026-02-25)
- **Context:** Feature creation pipeline needs to validate submissions against project-specific quarantine rules (file paths stored at {projectPath}/.automaker/quarantine/), but trust tier classification is global.
- **Why:** Services requiring request-scoped data (projectPath) cannot be singletons without context-bleeding across concurrent requests. Singleton architecture with parameter-passing at creation time breaks when parameter varies per request.
- **Rejected:** Making QuarantineService a singleton and passing projectPath on each method call would work but violates single responsibility (init should define scope). Alternative: store projectPath on instance via setter (thread-safety issue in concurrent requests).
- **Trade-offs:** Per-request instantiation creates slight GC pressure per request vs cleaner architectural separation. Singleton TrustTierService is more efficient but only works because trust classification doesn't vary by request context.
- **Breaking if changed:** If QuarantineService became a singleton initialized at startup, concurrent requests would overwrite projectPath, causing one project's validation to use another's quarantine config. Results in security bypass and cross-project data leakage.

#### [Gotcha] TypeScript optional fields in QuarantineEntry type (stage and violations can be undefined) require explicit casting when returning HTTP 422 response. Type system doesn't guarantee these fields are present in all code paths. (2026-02-25)
- **Situation:** QuarantineEntry has optional stage and violations fields. create.ts needs to return these in HTTP 422 body. Compiler doesn't enforce non-null guarantee.
- **Root cause:** QuarantineEntry type allows stage/violations to be undefined (accommodates different use cases). HTTP 422 response shape expects these fields. Gap between type definition and API contract.
- **How to avoid:** Explicit casting documents that HTTP endpoint guarantees these fields (unlike internal service). Adds type safety at call site. Cost: boilerplate cast code.

#### [Pattern] Three-layer model alias system: CLAUDE_CANONICAL_MAP (full IDs like claude-opus-4-6), CLAUDE_MODEL_MAP (short aliases like opus→claude-opus-4-6), DEFAULT_MODELS (fallback). resolveModelString() normalizes all input formats to canonical. (2026-02-25)
- **Problem solved:** Model string resolution needs to handle user-friendly aliases, prefixed variants, and full model IDs from different sources
- **Why this works:** Centralizes model ID management; single source of truth when Anthropic updates model versions; different code paths can use different input formats without reimplementing resolver logic
- **Trade-offs:** Added complexity of maintaining 3 related maps, but eliminated model ID duplication across codebase. Cost is consistency risk if maps drift.

#### [Gotcha] In monorepos, workspace package build order matters: dependency packages must rebuild before consuming packages. libs/types must build before libs/model-resolver, or resolver gets stale types. (2026-02-25)
- **Situation:** Attempted to rebuild only model-resolver; it loaded old CLAUDE_MODEL_MAP from stale types dist. Only worked after rebuilding types first.
- **Root cause:** npm workspace resolution loads from dist files in node_modules symlinks. If types dist is older than types source, resolver gets wrong constants.
- **How to avoid:** Build order adds serialization cost but ensures correctness. Could be automated with proper tsup/tsc dependency declarations in workspace.

#### [Pattern] Shared packages (libs/types) must export model IDs as static constants, not via process.env, because code is used in browser (UI) where process is undefined. (2026-02-25)
- **Problem solved:** libs/types is consumed by both server and UI. Browser code can't access process.env.
- **Why this works:** Prevents runtime crash in browser: 'TypeError: process is undefined'. Constants are bundled by Vite.
- **Trade-offs:** Model IDs are baked into dist at build time, making runtime updates impossible. Mitigated by rebuilding on model change (infrequent).

### Route registered as factory function createDocsRoutes() rather than inline registration (2026-02-25)
- **Context:** Following established codebase patterns while enabling modularity
- **Why:** Factory pattern allows routes to be (1) tested in isolation without full server, (2) reused across multiple app instances, (3) potentially configured with injected dependencies. Matches existing codebase convention of Xxx/createXxxRoutes().
- **Rejected:** Direct app.use(router) at module level - tightly couples routes to server initialization, harder to test
- **Trade-offs:** One extra function call to create router vs direct registration. Gain testability and modularity.
- **Breaking if changed:** If routes are inlined directly into index.ts instead of returned from factory, tests can't import createDocsRoutes() separately, and circular dependencies may form if routes need to be shared across server instances.
### GitHub-hosted runners for smoke tests, but self-hosted Linux runner retained for builds. Different tool for different job type (2026-02-25)
- **Context:** Could use self-hosted for consistency (one infrastructure pattern) or GitHub-hosted for consistency (one runner type)
- **Why:** GitHub-hosted provides clean, consistent environment for tests (no state accumulation). Self-hosted needed for builds because: complex build dependencies, caching requirements, longer execution time amortization. Smoke tests are stateless; builds are not
- **Rejected:** All GitHub-hosted (tests too slow/expensive), or all self-hosted (tests have environmental entropy)
- **Trade-offs:** Operational complexity of two runner types, but each type is optimized for its workload. Tests get clean environment; builds get fast caching
- **Breaking if changed:** Moving tests to self-hosted would expose them to previous build artifacts causing flaky environment-dependent failures

#### [Pattern] Commit compiled CSS to repository but regenerate in GitHub Actions - hybrid approach to generated files (2026-02-25)
- **Problem solved:** CSS is generated from config/source (Tailwind) but needed to be available for deployment
- **Why this works:** Committed CSS ensures: (1) deployment doesn't require build step on server, (2) git history shows what was deployed, (3) works in environments without Node/build tools. GitHub Actions regeneration ensures: (1) source of truth is config, (2) accidental manual edits get overwritten, (3) deploy always uses current config.
- **Trade-offs:** Slightly larger repo (33KB CSS file) but fast deployments without build. Hybrid approach combines benefits of both worlds.

### Created `@protolabsai/error-tracking` wrapper package instead of direct Sentry integration throughout codebase (2026-02-25)
- **Context:** Abstraction layer over `@sentry/node` and `@sentry/electron` to provide unified API across server and Electron contexts
- **Why:** Decouples application code from Sentry vendor; allows swapping error tracking provider (e.g., from Sentry to PostHog, DataDog) without changing app code everywhere. Single point of configuration and privacy enforcement
- **Rejected:** Importing Sentry directly in every module that needs error tracking (tight coupling, vendor lock-in, inconsistent privacy controls)
- **Trade-offs:** Extra package/indirection adds small performance cost but provides flexibility and consistent privacy enforcement across entire app
- **Breaking if changed:** Without this wrapper, changing error tracking providers requires updating dozens of import statements and error handling patterns across codebase

### Context set once per request/transaction, inherited by all subsequent errors in that scope via `setFeatureContext()` and `setSessionContext()` (2026-02-25)
- **Context:** Attaching feature ID, session ID, and execution metadata to errors without manual inclusion in every capture call
- **Why:** Avoids repetitive context passing; errors automatically know which feature/session they belong to. Follows distributed tracing principle where context propagates through execution
- **Rejected:** Passing context as argument to every `captureException()` call (verbose, error-prone if context not passed, harder to add new context later)
- **Trade-offs:** Automatic context inheritance is cleaner but requires careful context management in async/concurrent scenarios - context can leak between unrelated requests if not properly isolated
- **Breaking if changed:** If context is not cleared between requests in a request pool, errors from request A will be tagged with context from request B

### Progressive disclosure: README shows overview + links to detailed docs, not all content inline (2026-02-25)
- **Context:** Project has complex architecture (13 shared packages, monorepo structure, multiple apps, integration requirements) that exceeds README readability
- **Why:** Different users have different needs - some want quick overview, others want architecture details. Progressive disclosure serves both without overwhelming single document. Keeps README under usable length while supporting deep exploration
- **Rejected:** Inline all architecture/contributing details (creates unmaintainable 3000+ line README). Separate architecture doc without README overview (users don't know it exists)
- **Trade-offs:** Users must click for details instead of finding everything in one place. But enables maintainability and caters to scanning vs deep reading behaviors
- **Breaking if changed:** Without external documentation structure, README becomes dumping ground for all complexity. Architecture details require dedicated documentation with proper structure and versioning


### Recovery happens synchronously immediately after agent completes, not async/background. State transitions reflect recovery status before any downstream processing. (2026-02-25)
- **Context:** Post-agent workflow needs to detect uncommitted work and recover or signal failure to prevent infinite retry loops in ExecuteProcessor
- **Why:** Immediate synchronous recovery ensures feature state is authoritative after agent completion. Downstream services (lead-engineer-service) can rely on state reflecting actual recovery status without eventual consistency windows.
- **Rejected:** Async background recovery with background job - would create window where ExecuteProcessor doesn't know if recovery succeeded or failed, requiring different escalation logic
- **Trade-offs:** Request latency increased by recovery time, but state consistency guarantees are strong. Alternative async approach would be faster but require eventual consistency handling.
- **Breaking if changed:** If moved to async, ExecuteProcessor's blocked-state check becomes unreliable; retries would resume on git failures because state doesn't reflect recovery status yet

#### [Pattern] Feature.status='blocked' used as circuit breaker to prevent ExecuteProcessor retries when git/network failures occur, instead of throwing exceptions (2026-02-25)
- **Problem solved:** ExecuteProcessor would retry indefinitely on transient failures if not told to escalate instead. Need to distinguish git failures (don't retry) from agent failures (might retry).
- **Why this works:** State is more expressive than exceptions for long-running workflows: the 'blocked' state encodes 'this failure is infrastructure-related, escalate instead of retrying'. State persists across request boundaries and is queryable.
- **Trade-offs:** Adds state coupling (ExecuteProcessor must know about 'blocked' status) but enables clean separation: recovery service doesn't know about retry logic, retry logic doesn't know about recovery details

#### [Pattern] Service returns structured result; caller owns state updates and event emission. worktree-recovery-service returns data without touching feature state; auto-mode-service handles state transitions. (2026-02-25)
- **Problem solved:** Need to decouple pure git recovery logic from business state machine while ensuring consistent state updates
- **Why this works:** Enables unit testing git logic independently (mock-based, fast, deterministic) while keeping state machine transitions observable and testable separately. Caller coordination point is explicit.
- **Trade-offs:** Adds layer of indirection and requires caller to handle result-to-state mapping, but gains testability and separation of concerns. Risk if caller forgets to update state.

### Prettier formatting failures are non-fatal during recovery; code still commits and pushes even if prettier fails, while git operation failures (commit, push) are fatal (2026-02-25)
- **Context:** Recovery pipeline: prettier → git add → git commit → git push. Need to distinguish which failures should abort vs continue
- **Why:** Hierarchical failure criticality: git operations are infrastructure-critical (if they fail, recovery objectively failed), formatting is aesthetic (code is still functional). Non-fatal prettier failure signals 'imperfect recovery, needs review' rather than 'recovery impossible'.
- **Rejected:** Fail hard on any error - would require code to pass formatting before recovery succeeds, making recovery fragile. Continue silently on git failures - would hide actual failures.
- **Trade-offs:** Code pushed without formatting guarantees, but recovery succeeds more often. Relies on PR review to catch formatting issues. More forgiving to agent code quality.
- **Breaking if changed:** If prettier failures become fatal, recovery requires agent code to be pre-formatted. If git failures become non-fatal, feature could be marked recovered when push actually failed.

#### [Pattern] Early return paths in auto-mode-service: if recovered→update to review+emit completed; if detected-but-failed→update to blocked+emit error. Prevents further processing on recovery outcomes. (2026-02-25)
- **Problem solved:** After recovery attempt, different states require different downstream behaviors. Can't use same path for both success and failure.
- **Why this works:** Guard clause pattern ensures each recovery state has dedicated handling. Prevents silent failures where recovery fails but feature continues as if nothing happened. Each path is explicit: recovered features skip to review, blocked features escalate.
- **Trade-offs:** More explicit code paths but less concise. Clearer intent: each path represents a distinct feature state with distinct downstream implications.

### Ownership metadata stamped as invisible HTML comment in PR body: `<!-- automaker:owner instance=X team=Y created=Z -->`. Not plain text. (2026-02-25)
- **Context:** Embedding instance/team/timestamp metadata in PR body for multi-instance coordination while keeping PR display clean
- **Why:** HTML comments are invisible in rendered markdown but easily parseable as plain text. Metadata doesn't clutter the PR display or get confused with PR description content.
- **Rejected:** Plain text format (readable but clutters PR), custom markdown formatting (might conflict with user content), separate metadata store (adds external dependency and consistency issues)
- **Trade-offs:** Human-invisible but mechanically parseable. Metadata lives in PR body (survives API calls, no separate DB needed) but requires correct parsing logic.
- **Breaking if changed:** If format changes (tag name, field order, delimiter), parsing logic breaks. Requires coordinated rollout when changing format.

#### [Gotcha] Complex dynamic import type inference (`InstanceType<Awaited<typeof import(...)>>`) hiding redundant re-imports of already-imported classes (2026-02-25)
- **Situation:** ProjectPlanningService was dynamically imported with a complex generic type, even though the class could be imported statically
- **Root cause:** Dynamic imports were likely initially added for tree-shaking or lazy-loading, but singleton services that are always needed don't benefit from this complexity
- **How to avoid:** Static imports are simpler to read but remove potential for lazy-loading; dynamic imports offer lazy-loading but add significant type inference overhead

#### [Pattern] Type casting as a refactoring signal: `as unknown as ServiceContainer` cast was removed when underlying structural issues were fixed (2026-02-25)
- **Problem solved:** Original code had `return {...} as unknown as ServiceContainer` indicating the object shape didn't match the interface
- **Why this works:** Type casts bypass type safety; when a cast becomes necessary, it signals the structure is wrong rather than the types being incompatible
- **Trade-offs:** Requires identifying and removing structural mismatches (harder upfront) but eliminates hidden type debt

#### [Pattern] Singleton services imported separately, then `.initialize()` called with dependency container in a two-phase pattern (2026-02-25)
- **Problem solved:** Services like `linearSyncService` and `changelogService` are imported from singletons module, then initialized with event emitters and cross-service references
- **Why this works:** Avoids circular dependency issues (singletons are initialized elsewhere); allows services to wire event hooks after all services exist
- **Trade-offs:** Requires coordination: singletons must be initialized first, then `.initialize()` called in services.ts; reduces single-point-of-construction clarity

### Removed redundant dynamic imports when classes were already statically available, consolidating to single source of truth per class (2026-02-25)
- **Context:** Multiple `await import()` calls for same classes (ContextFidelityService, ProjectPlanningService, etc.) when static imports already existed
- **Why:** Reduces import overhead, simplifies type inference, single source of truth - static imports are evaluated once at module load
- **Rejected:** Keeping dynamic imports for consistency with legacy patterns - but this added unnecessary indirection
- **Trade-offs:** Single static import per class is simpler but removes ability to lazy-load per-call; startup time slightly improved
- **Breaking if changed:** Code that relied on lazy-loading behavior (e.g., optional features loaded only on demand) would be affected

### Optional dependency injection via setter on LeadEngineerService (setAgentFactory) rather than constructor injection (2026-02-26)
- **Context:** GtmReviewProcessor needs agentFactoryService to create Cindi agent, but this should be optional - service works without it by falling back to standard ReviewProcessor
- **Why:** Setter-based injection allows graceful degradation and runtime toggling. Constructor injection would require updating all instantiation sites and force all tests to provide a mock. Enables feature to be optional without architectural changes.
- **Rejected:** Constructor injection - more strict, fails fast, but breaks all existing callers and prevents runtime toggling of the feature
- **Trade-offs:** Less compile-time safety (no failure if agentFactoryService is never set) vs ability to deploy feature independently; easier testing vs less obvious dependency
- **Breaking if changed:** If refactored to constructor injection, all LeadEngineerService instantiation sites must be updated and optional behavior is lost

#### [Pattern] Feature type discrimination (featureType === 'content') as router to conditionally register state processor at runtime (2026-02-26)
- **Problem solved:** Different feature types (code vs content) need different REVIEW processors, but FeatureStateMachine is shared for both
- **Why this works:** Avoids conditional logic inside base ReviewProcessor; enables feature-specific processors without modifying core state machine. Clean separation of concerns.
- **Trade-offs:** More files/code but better encapsulation; requires featureType to be reliable contract between domain and routing logic

#### [Pattern] Agent Factory Service with named templates (createFromTemplate('cindi', ...)) as abstraction layer for agent construction (2026-02-26)
- **Problem solved:** GtmReviewProcessor needs to create Cindi agent but shouldn't hard-code agent construction logic
- **Why this works:** Decouples processor from agent instantiation details; enables agents to be registered/updated without processor changes; single source of truth for template configuration
- **Trade-offs:** One more indirection/service dependency vs ability to manage agents as registry; requires runtime template lookup vs simpler direct construction

#### [Pattern] State context as inter-state data carrier - feedback from failed review (score < 75) stored in ctx.reviewFeedback for EXECUTE phase visibility (2026-02-26)
- **Problem solved:** When Cindi score is low, human needs to see the feedback in next phase (EXECUTE), but phases are decoupled
- **Why this works:** StateContext is the shared mutable state across transitions; passing feedback via context avoids creating new return type for ReviewProcessor and keeps each processor focused on its output
- **Trade-offs:** Implicit data flow via context (easier short-term) vs explicit contracts; less coupling vs harder to trace data flow

#### [Gotcha] TypeScript Package ID deduplication causes false 'member not found' errors in git worktrees with shared node_modules. When a transitive dependency (e.g., @protolabsai/utils) imports an older version of a local workspace package (@protolabsai/types@0.4.0), TypeScript deduplicates by Package ID and reuses the first loaded instance, hiding new exports added in the worktree. (2026-02-26)
- **Situation:** Worktree shares node_modules with main branch. Main branch has types@0.4.0 without TrajectoryFact; worktree added TrajectoryFact but TypeScript still reported 'member not found'.
- **Root cause:** TypeScript's deduplication strategy assumes the same Package ID always refers to the same exports, which breaks when a workspace package is modified in a worktree but the main branch's cached node_modules version is stale.
- **How to avoid:** Shared node_modules saves ~30% disk space and faster installs, but requires careful coordination: rebuilding main branch's dist/ (gitignored) to sync TypeScript's package cache across worktrees.

#### [Pattern] Use `void` + `.catch()` for fire-and-forget async operations in critical paths (e.g., agent execution completion). Do not `await` or return the Promise, to prevent blocking the caller. (2026-02-26)
- **Problem solved:** FactStoreService.extractAndSave() is called after successful agent completion. Blocking the caller would delay returning the agent result to the user.
- **Why this works:** Fire-and-forget async allows the async operation to run in the background without blocking synchronous request completion. `.catch()` prevents unhandled rejection errors from crashing the process.
- **Trade-offs:** Non-blocking improves UX latency, but error handling is implicit and silent—errors are logged but never returned to caller. Requires robust error logging inside the async function.

### Use the main branch's gitignored dist/ as the source of truth for TypeScript compilation in worktrees, rather than creating worktree-specific builds. Copy only .ts source files to main branch, rebuild dist/, then revert source to HEAD. (2026-02-26)
- **Context:** Need to fix TypeScript's Package ID deduplication issue without modifying tracked main branch files or creating worktree-specific node_modules.
- **Why:** Gitignored dist/ is not tracked, so rebuilding it doesn't contaminate the main branch's git state. This allows the main branch's dist/ to reflect the worktree's new types, fixing TypeScript's package cache for both copies simultaneously.
- **Rejected:** Creating worktree-specific node_modules would be cleaner but uses significantly more disk space. Committing dist/ to main branch would pollute git history with build artifacts.
- **Trade-offs:** Rebuilding dist/ must happen every time the worktree modifies exported types, adding a synchronization step. But it avoids disk bloat and keeps git clean.
- **Breaking if changed:** If dist/ is gitignored and not rebuilt, the main branch's TypeScript checks will fail for new exports. If dist/ is committed to git, merging the feature branch becomes conflict-prone.

#### [Pattern] /approve and /reject command detection requires explicit hasPendingApproval() guard to scope detection only to gates in progress, not generic approval keywords elsewhere in Linear comments (2026-02-27)
- **Problem solved:** LinearCommentService already routes generic 'approval' keywords to LinearApprovalBridge for new feature creation. New gate approval commands use identical keywords but different workflow.
- **Why this works:** Without scoping guard, any /approve in any Linear comment would trigger gate logic. Guard prevents false positives and hijacking unrelated workflows. Explicit state-based routing is safer than implicit context inference.
- **Trade-offs:** Adds runtime guard check (cheap) but requires maintaining pending approval state. Makes workflow intent explicit rather than implicit.

### Expose LinearCommentService via getCommentService() getter on parent LinearSyncService to enable handler composition without exposing internal service details (2026-02-27)
- **Context:** LinearChannelHandler needs LinearCommentService instance to inject itself into comment routing. Service is private encapsulation detail of LinearSyncService.
- **Why:** Enables clean composition: handler receives only what it needs (comment service) rather than entire parent service. Alternative of passing LinearSyncService creates unnecessary coupling to sync logic.
- **Rejected:** Could pass entire LinearSyncService and handler extracts commentService internally. Rejected because it couples handler to sync service contract and makes dependencies implicit.
- **Trade-offs:** Creates new stable API contract (getCommentService must never be removed). Requires modifying file outside feature's explicit scope (linear-sync-service.ts). Benefit: clean separation of concerns.
- **Breaking if changed:** Removing getCommentService() breaks wiring.ts instantiation. Changing what it returns breaks handler initialization.

#### [Pattern] Implement stateful pending approval tracking (Map<featureId, PendingApproval>) to enable correct command routing rather than implicit context inference (2026-02-27)
- **Problem solved:** System needs to distinguish 'this gate is pending approval' from 'feature was just created' or 'other workflow' to route /approve/reject correctly.
- **Why this works:** Explicit state enables precise routing without false positives. State serves a validation/routing purpose (prevents incorrect command interpretation), not just information storage. Cleaner than trying to infer intent from feature metadata.
- **Trade-offs:** Adds in-memory state (acceptable for short-lived gates) and requires cleanup discipline (state must clear on resolution). Benefit: deterministic, testable routing logic.

#### [Gotcha] Feature required modifying linear-sync-service.ts (not in original scope) to expose getCommentService() and setChannelHandler() methods for wiring (2026-02-27)
- **Situation:** Implementation discovered that composing the handler required changes to an external file (LinearSyncService) to expose its private comment service.
- **Root cause:** LinearSyncService encapsulates LinearCommentService, making it inaccessible for dependency injection. No way to pass it to handler without modifying parent service.
- **How to avoid:** Minimal changes (two simple getter/setter methods) but reveals scope creep. Document these additions as required for LinearChannelHandler integration.

#### [Pattern] Implement UIChannelHandler no-op fallback when linearIssueId is absent, allowing graceful degradation for non-Linear features (2026-02-27)
- **Problem solved:** Some features are created via UI, not Linear, so have no linearIssueId. Gate approval still works but comments don't post to Linear.
- **Why this works:** Ensures robustness: all features support gate holds regardless of source. Handler interface abstracts this difference. Prevents special-case logic throughout codebase.
- **Trade-offs:** Silent failure for non-Linear features (no error, no comment). Benefits: clean abstraction, no caller logic needed.

### Environment variables for git hooks must be set via the `env` object in execAsync/execFileAsync, not as shell command prefixes (2026-02-27)
- **Context:** Setting HUSKY=0 to disable Husky hook execution in worktree commits
- **Why:** The env object parameter ensures proper isolation and consistent behavior across different execution contexts (especially worktrees where shell behavior diverges from standard repos)
- **Rejected:** Shell-based prefix approach: `HUSKY=0 git commit` in the command string itself
- **Trade-offs:** env object is more verbose but more reliable; shell prefix is simpler syntactically but fails in worktree contexts
- **Breaking if changed:** Switching back to shell prefix will cause hook execution to fail in worktrees because the variable won't propagate correctly

#### [Pattern] Git commit operations from multiple code paths must all synchronize the same hook-disabling environment variable (HUSKY=0) (2026-02-27)
- **Problem solved:** Three separate execution paths make commits: worktree-guard.ts, git-workflow-service.ts, and create-pr route in common.ts
- **Why this works:** Any git commit path that misses HUSKY=0 will trigger hook failures; the inconsistency propagates as silent failures in specific workflows
- **Trade-offs:** Distributed pattern is less refactorable but requires less code reorganization; the trade-off is higher maintenance cost when adding new commit paths

### Deleted entire changeset-release.yml workflow file rather than disabling npm publish step within it (2026-02-28)
- **Context:** Two workflows (changeset-release and auto-release) competing for ownership of release pipeline stages, causing duplicate/conflicting operations
- **Why:** Complete removal eliminates ambiguity, prevents accidental re-enablement later, makes ownership explicit in codebase
- **Rejected:** Alternative: disable npm publish via conditional (if: false) or comment—leaves dead code and invites confusion about which workflow controls releases
- **Trade-offs:** Cleaner ownership model vs harder to understand intent from git blame alone without commit message context
- **Breaking if changed:** Any scripts or metrics dashboards directly referencing .github/workflows/changeset-release.yml will fail; rollback requires git revert + manual re-enablement

#### [Pattern] Consolidate competing pipeline components into single-owner workflow model—auto-release.yml owns: version bump → tag → GitHub Release → platform builds (2026-02-28)
- **Problem solved:** Multiple tools handling different release stages created coordination bugs and race conditions
- **Why this works:** Single source of truth eliminates duplicate logic, makes failure modes deterministic, simplifies troubleshooting when releases fail
- **Trade-offs:** Clearer mental model and easier debugging vs tighter coupling—if auto-release.yml breaks, entire pipeline fails with no fallback

### Critical changes to release pipeline merged through dev branch (dev → staging → main) instead of direct main PR (2026-02-28)
- **Context:** Workflow consolidation is a breaking change to release tooling; feature branch needed to show merge path through staged environments
- **Why:** Staging maturity model ensures release-critical changes are tested upstream before reaching main/production; protects stable release branch from untested tooling changes
- **Rejected:** Direct PR to main would merge faster but introduces untested workflow changes directly into stable release branch
- **Trade-offs:** Slower merge time vs critical risk reduction—prevents release-pipeline-breaking changes from reaching main without verification
- **Breaking if changed:** If skipped and PR'd directly to main, broken workflow change locks all releases until fix can be deployed

### ProviderFactory.getProviderForModel() routes model-to-provider mapping as a single point of extensibility rather than inline switch/pattern matching in the adapter (2026-03-01)
- **Context:** Adapter needed to instantiate LangChain models based on PhaseModelEntry type, multiple provider types possible (Claude, OpenAI, Groq, etc.)
- **Why:** Separates adapter concern (type/option bridging) from provider concern (model→implementation mapping). New providers only require factory changes, not adapter changes.
- **Rejected:** Direct instantiation (tightly couples adapter to all providers) or switch statement in adapter (mixes concerns, not DRY if used elsewhere)
- **Trade-offs:** Extensibility gained; hidden coupling created—adding a provider requires knowing factory interface exists and modifying it. Provider selection logic not visible in adapter.
- **Breaking if changed:** If factory interface changes or is removed, all consumers break. Adding new provider types requires factory modification (not optional).

### @langchain/core declared as peer dependency rather than regular or dev dependency (2026-03-01)
- **Context:** Adapter wraps LangChain types (BaseChatModel). Package consuming this library likely also uses LangChain directly.
- **Why:** Peer dependency ensures single instance of LangChain across consumer's dependency tree. Prevents version conflicts when app uses multiple LangChain-based packages. Consumer controls version match.
- **Rejected:** Regular dependency (ensures version is installed but risks duplication/conflicts) or bundled (tight coupling, larger bundle, version mismatch with consumer's LangChain)
- **Trade-offs:** Consumer must install @langchain/core themselves (less batteries-included) but gets flexibility and avoids version hell. Library can't guarantee it works with all versions.
- **Breaking if changed:** If consumer doesn't install @langchain/core or installs incompatible version, adapter breaks at runtime with unclear error. Requires careful docs and peer version constraints.

#### [Pattern] I/O Deduplication via Preloading: HealthMonitorService passes already-loaded features array to checkOrphanedFeatures() instead of calling FeatureLoader.getAll() again (2026-03-01)
- **Problem solved:** checkProjectHealth() already calls features = getAll() early in the cycle. Rather than load again in detectOrphanedFeatures(), the result is threaded through the call hierarchy
- **Why this works:** getAll() is expensive (disk I/O). Calling it twice per health check cycle wastes resources. Preloading forces intentional coordination between services
- **Trade-offs:** Simpler call signatures vs. forcing caller to manage preload state and thread it through. Harder to use FeatureLoader.detectOrphanedFeatures() as a standalone utility without preloading first

### Orphaned feature detection placed in FeatureLoader service, not HealthMonitorService (2026-03-01)
- **Context:** Could have implemented detectOrphanedFeatures() as a private method entirely within HealthMonitorService, keeping all health check logic in one place
- **Why:** FeatureLoader owns all concerns about features and branch state. HealthMonitorService owns health issue aggregation. Keeps responsibilities separated and allows FeatureLoader.detectOrphanedFeatures() to be tested independently and reused elsewhere
- **Rejected:** Implementing branch detection logic directly in HealthMonitorService or as a standalone utility function
- **Trade-offs:** Easier to test detection independently, but creates cross-service dependency. If FeatureLoader is removed/refactored, HealthMonitorService breaks
- **Breaking if changed:** Any refactoring of FeatureLoader.detectOrphanedFeatures() signature changes both FeatureLoader.ts and HealthMonitorService.ts contract simultaneously

### Orphaned features set `autoRemediable: false` intentionally. No auto-deletion of features with missing branches (2026-03-01)
- **Context:** Spec requested detection only. Could delete features automatically when branch is gone, but that's destructive without explicit user intent
- **Why:** Features are project state. Auto-deletion risks data loss if branch is temporarily unavailable (network, fetch not run, user rebasing). Safer to report and let user decide
- **Rejected:** Setting `autoRemediable: true` and adding a remediation function that deletes the feature or clears branchName
- **Trade-offs:** Users must manually clean up vs. automatic cleanup. Extensible later: comment says 'any future remediation action can be wired in separately'
- **Breaking if changed:** If auto-remediation is later enabled, health check becomes a mutating operation, changing project state without audit trail

#### [Pattern] Use Set deduplication for ordered candidate lookup loops to prevent redundant system calls (2026-03-04)
- **Problem solved:** resolveIntegrationBranch iterates through branch candidates [prBaseBranch, 'main', 'master'] and calls `git rev-parse --verify` for each
- **Why this works:** When prBaseBranch is already 'main', the candidates become ['main', 'main', 'master']. Without deduplication, git is called twice for 'main', wasting I/O. Set deduplication reduces candidates to ['main', 'master'].
- **Trade-offs:** Tiny code overhead (one Set construction) eliminates worst-case I/O duplication. Safe because Set preserves insertion order in JS.

#### [Pattern] Validate existence of configuration values via system calls before using them (git rev-parse --verify pattern) (2026-03-04)
- **Problem solved:** resolveIntegrationBranch doesn't assume prBaseBranch exists in repo; it verifies each candidate with `git rev-parse --verify branch`
- **Why this works:** A repo might have 'dev' in settings but no 'dev' branch locally (e.g., fresh clone, incomplete setup). Calling functions downstream that assume the branch exists would fail cryptically. Fail-fast validation prevents this.
- **Trade-offs:** Each resolveIntegrationBranch call costs 1-3 git verifications (acceptable for scheduled maintenance task). Eliminates entire class of downstream errors.

### Preserve hardcoded main/master in skip lists even when prBaseBranch is different (e.g., 'dev') (2026-03-04)
- **Context:** detectStaleWorktrees filters out integration branch and 'main'/'master'. When prBaseBranch='dev', the filter skips both 'dev' and 'main'.
- **Why:** Defensive posture: prevents accidental deletion of worktrees for canonical branches even if they aren't the configured integration branch. 'main' and 'master' are special in git culture and shouldn't be auto-removed.
- **Rejected:** Could skip 'main'/'master' and only preserve prBaseBranch. Simpler rule but risky if 'main' is a release branch that shouldn't have worktrees.
- **Trade-offs:** Slightly more conservative (never deletes main/master worktrees). Trade safety for reduced cleanup coverage, acceptable for maintenance.
- **Breaking if changed:** Removing main/master from skip list means worktrees on canonical branches could be auto-deleted, breaking release workflows

#### [Pattern] Order candidate fallbacks by configuration priority, then well-known defaults (2026-03-04)
- **Problem solved:** Branch resolution candidates ordered as [configuredBranch, 'main', 'master'] — prioritizes prBaseBranch over canonical branches
- **Why this works:** Respects project-specific configuration first, then falls back to industry standards if config doesn't exist. Matches principle: custom settings > defaults.
- **Trade-offs:** Prioritizing config means projects using 'develop', 'trunk', 'release', etc. get correct behavior. Loses implicit knowledge that 'main' is 'probably right'.

### Project uses 'dev' as default integration branch (prBaseBranch), not 'main' (2026-03-04)
- **Context:** DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch is 'dev'. Maintenance tasks now respect this, checking dev → main → master.
- **Why:** This project uses 'feature/* → dev → staging → main' workflow. Dev is the primary integration branch, not main. Settings accurately reflect team workflow.
- **Rejected:** Could use 'main' as default like most projects. Would require custom branch settings everywhere.
- **Trade-offs:** Explicit workflow documentation means one less implicit assumption. Maintenance code is now workflow-aware.
- **Breaking if changed:** Changing DEFAULT_GIT_WORKFLOW_SETTINGS.prBaseBranch would alter which branch is preferred for stale worktree and merge detection

#### [Pattern] One-shot alerting using Set<string> (alertedMissingChecks) to prevent duplicate alerts on 60-second poll cycles. Alert fires once per tracking session, cleared on cleanup/stop. (2026-03-04)
- **Problem solved:** detectMissingCIChecks() runs every 60 seconds in pollAllPRs(). Without deduplication, same missing check would alert every cycle, causing spam.
- **Why this works:** Prevents alert fatigue while maintaining detection guarantees. Set provides O(1) lookup and auto-dedup semantics.
- **Trade-offs:** Adds state management (Set), requires lifecycle coordination (clear on cleanup). Simpler than timestamp-based dedup but requires explicit cleanup.

### Missing CI check detection uses internal `pr:missing-ci-checks` event consumed by PR Maintainer agent, rather than new HTTP API endpoint. Event payload includes `possibleCauses[]` with diagnostic hints. (2026-03-04)
- **Context:** PR Maintainer agent already subscribes to PR feedback events. Detection result is only meaningful to this agent, not external systems.
- **Why:** Scope discipline: no new surface area. Reuses existing event-driven consumption pattern. Diagnostic hints (trigger config, branch mismatch) allow agent to act without re-fetching/re-diagnosing.
- **Rejected:** Alternative: new HTTP endpoint (external visibility coupling); agent queries on demand (extra latency, loses subscription guarantee); raw event + agent self-diagnoses (agent bloat).
- **Trade-offs:** Tighter coupling to one agent; simpler API surface; diagnostic hints prevent duplication. Event-driven is slower than on-demand query but aligns with polling architecture.
- **Breaking if changed:** Creating HTTP endpoint means maintaining external contract; removing possibleCauses means agent must recompute diagnostics.

### MISSING_CI_CHECK_THRESHOLD configurable via environment variable (default 30 minutes). Not hardcoded. (2026-03-04)
- **Context:** 30 minutes is reasonable for production (CI slowness windows, infrastructure delays). Dev/test needs faster feedback (5-10 min). Different repos may have different tolerance.
- **Why:** Operational flexibility without code change. Default is sensible for majority case. Env var is standard pattern for config.
- **Rejected:** Alternative: hardcoded 30 min (inflexible for dev, can't tune per deployment); database config (unnecessary complexity); feature flag (overkill).
- **Trade-offs:** Env var adds one extra layer of settings mgmt. Makes threshold transparent and debuggable.
- **Breaking if changed:** Hardcoding removes ability to tune without redeployment. No breaking change from feature perspective, but ops friction increases.

#### [Pattern] PR details (base branch, head SHA) fetched fresh on each poll via `gh pr view`, not cached. Required status checks also fetched fresh, not cached. (2026-03-04)
- **Problem solved:** PR base branch or required checks can change mid-flight (rare, but possible if branch protection rules updated or PR rebased). Stale cache would miss these changes.
- **Why this works:** Correctness over performance. Cache invalidation is hard; polling frequency (60s) makes fresh fetch acceptable. GitHub CLI and API have internal caching.
- **Trade-offs:** Extra API calls per poll. Guarantees correctness. GitHub's own caching reduces actual latency.

### AvaConfig uses MCPServerConfig (richer type with id, enabled, tools metadata) but execution layer expects AgentConfig['mcpServers'] (minimal type with name, type, command, args, env, url, headers). Conversion and filtering happens in index.ts at routing layer, not at config load or tool invocation. (2026-03-04)
- **Context:** MCP servers can be defined at project level (with full MCPServerConfig) or Ava level (same type). Both must be injected into inner agents via execute_dynamic_agent, which expects AgentConfig['mcpServers'] format.
- **Why:** MCPServerConfig has enabled flag and metadata (tools, description, toolsLastFetched) that come from provider settings UI. The Agent SDK only needs name, type, command, args, env, url, headers — the minimal executable spec. Filtering disabled servers at conversion time prevents them from running even if mistakenly passed.
- **Rejected:** Could have extended AgentConfig['mcpServers'] type to accept MCPServerConfig fields, but that would clutter the execution API with configuration concerns. Could have filtered in ava-tools.ts, but keeping conversion in routing layer (index.ts) keeps tool code pure.
- **Trade-offs:** Conversion logic in one place (index.ts) makes it easy to verify all servers are filtered/mapped consistently. Downside: if another code path needs avaMcpServers, it bypasses this and gets unfiltered servers.
- **Breaking if changed:** If conversion logic is removed or skipped, disabled servers would attempt to execute and type mismatch errors occur. If filtering moves to ava-tools.ts, index.ts must pass unfiltered array, making filtering intent non-obvious.

### Filtering of enabled MCP servers happens at conversion point in index.ts (routing layer), not in loadAvaConfig (config layer) or ava-tools.ts (tool layer). (2026-03-04)
- **Context:** avaMcpServers must be filtered to exclude disabled servers before passing to execute_dynamic_agent. Question: where should this logic live?
- **Why:** Config layer should be neutral — it just loads and merges config. Routing layer (index.ts) is aware of execution context and can make policy decisions (e.g., 'only enabled servers run'). Keeps ava-tools.ts pure — it doesn't need to know about enabled/disabled semantics.
- **Rejected:** Could filter in loadAvaConfig, but that's config layer business, not filtering. Could filter in ava-tools.ts, but that's buried inside tool code and less discoverable.
- **Trade-offs:** Single conversion point makes audit trail clear. If routing logic changes (e.g., 'allow all servers including disabled'), it's obvious where to change. Downside: any other code needing avaMcpServers would have to reimplement filtering or call through index.ts.
- **Breaking if changed:** If filtering moves to ava-tools.ts and index.ts starts passing unfiltered array, the intent becomes implicit rather than explicit. If filtering is removed entirely, disabled servers execute.

#### [Pattern] Dependency Inversion: FeatureScheduler depends on PipelineRunner interface that its caller (AutoModeService) implements, rather than FeatureScheduler being self-contained (2026-03-05)
- **Problem solved:** Extracting scheduling logic from AutoModeService while maintaining tight coupling would limit reusability and testability
- **Why this works:** This inversion allows FeatureScheduler to be scheduler-only (what to run, when, order) while AutoModeService handles execution (how to run, circuit-breaker, cleanup). Enables different pipeline implementations and clean unit testing of scheduler in isolation.
- **Trade-offs:** Gained: Reusability, testability, separation of concerns. Lost: Some indirection in understanding the control flow (must trace through interface calls).

### Created new service file (feature-scheduler.ts) for 1145-line FeatureScheduler class instead of keeping in auto-mode-service.ts (2026-03-05)
- **Context:** Refactored auto-mode-service.ts by extracting 1015 lines into new file, demonstrating existing separation was clear enough for file boundary
- **Why:** Scheduling (what/when/order to run features) is logically separate from execution (actually running them, error handling, cleanup). Separate file makes this boundary explicit and allows FeatureScheduler reuse by future services.
- **Rejected:** Alternative: Keep in same file with tight class organization. Rejected because 2000+ line file becomes hard to navigate, and reusability is lost.
- **Trade-offs:** Gained: Reusability, reduced class size, explicit concern boundary. Lost: Must trace between two files to understand full flow, additional import complexity.
- **Breaking if changed:** If scheduler moves back into auto-mode-service or its responsibility expands elsewhere without interface abstraction, reusability advantage is lost and duplication risk increases.

#### [Gotcha] Fire-and-forget ledger load creates race condition: `loadLedger()` is not awaited in `initialize()`, so ledger Set pre-population races with incoming events. Tests must use `await setTimeout(100)` before firing events to let ledger load complete. (2026-03-07)
- **Situation:** Completion detector needs to restore dedup state on restart, but service initialization must not block waiting for I/O.
- **Root cause:** Non-blocking initialization avoids service startup delays; async load happens concurrently with service becoming available.
- **How to avoid:** Faster service startup vs. test brittleness and race condition between ledger load and first events. Runtime behavior is correct (eventually consistent) but tests must be aware of timing.

#### [Pattern] Ledger file acts as stateless durability layer separate from in-memory Sets: JSONL is append-only source of truth for recovery, Sets are runtime cache for performance. Cold start reads ledger into Sets, warm restart skips duplicate events using Sets. (2026-03-07)
- **Problem solved:** Need dedup across restarts without blocking service with every event write, but must recover state after crashes.
- **Why this works:** Ledger provides durable recovery log; Sets provide O(1) runtime dedup. Separation of concerns: ledger doesn't need to be queried for events (append-only), Sets don't need to be durable (rebuilt from ledger).
- **Trade-offs:** Two sources of truth must stay in sync (slight complexity) but clean separation between durable log and runtime cache; ledger append is fire-and-forget (fast) but requires eventual consistency.

#### [Pattern] Silent graceful degradation when `dataDir` is null/missing: all ledger operations (load, append) silently skip, service continues without persistence. Ledger is optional feature, not hard requirement. (2026-03-07)
- **Problem solved:** Service runs in multiple contexts: production (needs durability), tests (don't care about durability), ephemeral deployments (no persistent storage).
- **Why this works:** Avoids conditional logic throughout codebase and error handling burden. Ledger is optimization (prevents duplicate work) not correctness requirement.
- **Trade-offs:** Simpler deployment story (dataDir optional) vs. subtle bugs if caller expects durability but doesn't provide dataDir. Silent failure is convenient but less explicit.

#### [Pattern] Milestone components can be fully implemented and tested without route integration, enabling parallel feature development and composition later (2026-03-07)
- **Problem solved:** ProjectSettingsPanel component built and tested but not yet wired into any route; will be composed by Project Page Hub feature later
- **Why this works:** Decouples component development from integration work; allows team to work on reusable pieces independently while larger feature set coordinates composition
- **Trade-offs:** Easier: component testing, parallel development. Harder: tracking unmounted components, avoiding duplication of similar components (separate ProjectSettingsView exists with ProjectWebhooksSection)

#### [Pattern] Fire-and-forget persistence in ceremony integration: artifact saves use `void ...catch(...)` so failures don't block ceremony delivery (2026-03-07)
- **Problem solved:** CeremonyService calls saveArtifact for milestone_retro and project_retro reports, but these operations must not block ceremony completion
- **Why this works:** Prioritizes ceremony workflow availability over artifact persistence guarantees. Ceremonies are critical path, artifacts are best-effort.
- **Trade-offs:** Gain: ceremonies complete even if artifact service fails. Lose: potential data loss if artifact writes fail silently. Risk: inconsistency between ceremony completion and persistence.

### Artifact storage in `.automaker/projects/` filesystem hierarchy instead of relational database (2026-03-07)
- **Context:** Ceremony reports and project artifacts need durable storage with project-scoped isolation
- **Why:** Filesystem storage is Git-friendly (can be committed, diffed), requires no schema migration, and aligns with project-local artifact model. Lower coupling to database layer.
- **Rejected:** SQL database (adds migration burden, not version-controllable), S3/cloud storage (adds external dependency, latency), in-memory cache (not durable)
- **Trade-offs:** Gain: version control integration, no DB schema, local development friendly. Lose: querying more complex, file limits at scale, no ACID transactions across artifacts.
- **Breaking if changed:** Moving to database requires migration strategy for existing artifacts, changes backup/restore procedures, adds runtime dependency. Changing path structure breaks artifact discovery.

#### [Pattern] Type-based artifact organization: artifacts stored in subdirectories by `ArtifactType` (e.g., `artifacts/milestone_retro/`, `artifacts/project_retro/`) (2026-03-07)
- **Problem solved:** Multiple ceremony types produce different artifact structures; need to distinguish and query by artifact category
- **Why this works:** Enables future filtering by type in listArtifacts, allows type-specific validation logic, keeps artifacts grouped for human inspection
- **Trade-offs:** Gain: type-specific querying, organized directory structure, room for type-specific handlers. Lose: deeper path traversal, more directories to manage.

#### [Pattern] Dual-layer flow system: ceremonies use a FlowRegistry (singleton) with stub factories for registration + dispatch, while actual execution is event-driven inside CeremonyService (2026-03-07)
- **Problem solved:** Automation service needs to find and dispatch flows, but ceremony flows have complex event-driven behavior
- **Why this works:** Decouples automation dispatch layer from ceremony execution logic. Registry provides a stable contract for automation to find flows by ID without knowing ceremony implementation details. Stub factories prevent coupling between dispatch and actual ceremony event handling.
- **Trade-offs:** Easier: Multiple ceremony types without modifying dispatch logic. Harder: Two-layer indirection adds conceptual complexity; developers must understand both registration and execution paths

### Ceremony flows registered as stub factories in FlowRegistry during CeremonyService.initialize(), not at module load time or lazy-loaded on-demand (2026-03-07)
- **Context:** Flows must be discoverable by automation dispatch layer but CeremonyService orchestrates their actual execution
- **Why:** Initialization timing ensures registry is populated before any dispatch attempts. Early registration (vs lazy) prevents 'Flow not registered' errors at runtime. Stub factories (vs actual handlers) keep the registry lightweight and prevent double-execution.
- **Rejected:** Module-level registration would pollute global scope. Lazy registration would risk not-found errors during dispatch. Full handler registration would execute flows twice (once via registry, once via service).
- **Trade-offs:** Requires explicit initialize() call (easy to miss). Prevents accidental invocation. Clear initialization order makes lifecycle explicit.
- **Breaking if changed:** If flows aren't registered before dispatch, automation layer throws 'Flow not registered' error. If registered with real handlers instead of stubs, ceremonies execute twice (once via registry dispatch, once via event handler)

### Description sourced independently from package.json/README rather than reusing RepoResearchResult data (2026-03-07)
- **Context:** generateSpecMd() needs both project name (from research) and description (also could come from research)
- **Why:** Ensures fresh description data at generation time rather than relying on potentially stale research snapshot
- **Rejected:** Reusing description from RepoResearchResult object would be simpler and require fewer file reads
- **Trade-offs:** Extra I/O overhead (fs.readFile package.json, README parsing) vs guarantees description accuracy and recency
- **Breaking if changed:** If description is later added to RepoResearchResult and this function switches to using it, spec.md descriptions will become stale when research is cached

### Key dependencies listed from root package.json only, not aggregated from workspace packages (2026-03-07)
- **Context:** Monorepo setup with multiple packages, but spec.md should show 'key' dependencies
- **Why:** Keeps spec.md summary focused and readable; root deps typically represent main project direction
- **Rejected:** Aggregating all workspace deps would be more comprehensive but produce unwieldy list
- **Trade-offs:** Simplified output but loses visibility into package-specific critical dependencies; spec.md becomes incomplete reference for monorepo
- **Breaking if changed:** If spec.md is later used as dependency manifest or CI source-of-truth, workspace-only critical deps will be invisible

### Tech stack detection via dependency presence (e.g., checking package.json for 'react', 'postgres') rather than user input or heuristics (2026-03-07)
- **Context:** spec.md must show tech stack without manual configuration or asking user
- **Why:** Dependencies are source-of-truth; if it's installed, it's part of the stack
- **Rejected:** File/config analysis heuristics (detecting .ts files → TypeScript) would be fragile; user input adds friction
- **Trade-offs:** Dependency-based is reliable but requires standard package names (react vs preact, pg vs mysql); misses unlisted critical tools
- **Breaking if changed:** If project uses non-standard package naming or pre-installed tools (global Node, system postgres), stack detection fails silently

#### [Pattern] Architecture section auto-switches between monorepo package listing and single-package directory structure based on research data (2026-03-07)
- **Problem solved:** Same spec.md function must handle both monorepo and single-package projects with appropriate structure
- **Why this works:** Avoids separate code paths or manual template selection; single function adapts output
- **Trade-offs:** More complex conditional logic but unified API and no user configuration needed; harder to customize per project type

#### [Pattern] Used fs.access() with try/catch (error-as-signal) instead of fs.existsSync() to check if spec.md already exists before writing (2026-03-07)
- **Problem solved:** Non-overwrite guard prevents clobbering user-edited spec.md files during project setup
- **Why this works:** fs.access() avoids a separate syscall and integrates naturally with permission checks; treat missing file as expected exception case rather than explicit query
- **Trade-offs:** More performant (single syscall vs dedicated existence check), but less obvious intent; race condition possible between check and write if concurrent calls occur

### Architecture section generates different content based on monorepo detection: lists workspace packages with path+type for monorepos, but lists top-level directories for single-package repos (2026-03-07)
- **Context:** RepoResearchResult already distinguishes monorepo structure, but presentation must match project topology to be useful
- **Why:** Context-aware visualization helps users understand their actual project shape. Monorepo users need package inventory; single-package users need directory structure. Same research data, different views.
- **Rejected:** Uniform architecture section (always show packages or always show directories) would be simpler but confusing for one topology type
- **Trade-offs:** More complex code path (conditional logic), but significantly better UX and spec.md clarity. Requires testing both paths.
- **Breaking if changed:** If both paths are forced to single format, single-package repos would show empty/useless package list; monorepos would lose package boundary clarity.

#### [Pattern] TODO placeholders marked as HTML comments (<!-- TODO: Product Goals -->...) rather than markdown admonitions, markdown footnotes, or code comments (2026-03-07)
- **Problem solved:** Need to clearly separate auto-generated boilerplate from sections requiring user input, while keeping spec.md valid markdown
- **Why this works:** HTML comments are valid in markdown, invisible in rendered output, but searchable and preservable in raw files. Allows spec.md to be shared/published even before TODOs filled. Users can visually scan rendered spec.md and know it's incomplete.
- **Trade-offs:** Very clean in rendered output, but requires raw file view to see TODOs and fill them. Could benefit from IDE plugin/tooling to highlight.

### Key dependencies truncated to first 15 from root package.json, excluding devDependencies, sorted by inclusion order (2026-03-07)
- **Context:** spec.md should highlight essential runtime dependencies, not entire manifest. Too many details defeats purpose of summary.
- **Why:** 15 entries is pragmatic limit for readability in spec.md. Runtime deps more relevant to architecture than dev tooling (which is listed separately in Tech Stack). Preserves mention order (hint of importance).
- **Rejected:** All deps would clutter spec; devDeps would confuse readers about actual runtime. Alphabetical sort would lose priority signal.
- **Trade-offs:** Very clean summary, but 'key' judgment made automatically without semantic understanding. Project with 20 important prod deps has 5 cut off; project with 5 padded to 15.
- **Breaking if changed:** If limit removed or raised significantly, spec.md becomes unwieldy. If devDependencies included, spec pollution increases (e.g. 'prettier', 'eslint' listed as key deps).

#### [Pattern] Thin orchestration CLI layer delegates heavy lifting to create-protolab package via re-exports (2026-03-07)
- **Problem solved:** Need to provide both programmatic and CLI interfaces for repo scanning and gap analysis
- **Why this works:** Separating concerns enables reuse across multiple consumption patterns (CLI, web UI, CI/CD) and prevents duplicating complex analysis logic. CLI stays focused on interaction patterns (arg parsing, spinners, output formatting).
- **Trade-offs:** Requires maintaining two packages but enables flexible reuse; setup-cli becomes thinner and more maintainable

#### [Pattern] Dry-run mode executes full analysis pipeline without persisting any files to disk (2026-03-07)
- **Problem solved:** Users need to preview setup results before committing changes to their repository
- **Why this works:** Safe preview mode reduces friction for first-time users and enables non-interactive validation workflows. Lets users understand repo gaps before generating scaffolding.
- **Trade-offs:** Adds pipeline complexity (threading dry-run flag through services) but dramatically improves safety and user confidence

### Generated gap report placed in .automaker/gap-report.html (inside scaffolded project structure, not temp/ephemeral location) (2026-03-07)
- **Context:** CLI generates HTML gap analysis report alongside proto.config.yaml and other setup artifacts
- **Why:** Placing report inside .automaker/ (version-controlled with the proto-lab) makes it discoverable, persistent, and part of the project's audit trail. Creates single source of truth for setup analysis.
- **Rejected:** Writing to temp directory, project root, or separate reports folder would disconnect analysis from project metadata
- **Trade-offs:** Adds files to .automaker/ but ensures analysis results are versionable and discoverable within project structure
- **Breaking if changed:** If moved elsewhere, users lose easy access to analysis history and gap audit trail with their proto-lab config

### Created separate `ava-channel-store.ts` (append-only) instead of extending existing `chat-store` (bidirectional) (2026-03-08)
- **Context:** Ava channel is fundamentally different: messages from multiple instances, broadcast stream, no two-way conversation pattern
- **Why:** Append-only and bidirectional chat have conflicting update semantics. Separate stores prevent conditional logic pollution and enable independent scaling/caching strategies
- **Rejected:** Extend chat-store with mode flags and conditional append logic; would couple incompatible interaction patterns and complicate both stores
- **Trade-offs:** More files to maintain, but each store is simpler and has clearer responsibility boundaries
- **Breaking if changed:** Merging stores back would require rewriting all update logic to handle both patterns simultaneously; keyboard shortcuts and state persistence would break

#### [Pattern] Component extraction (`ask-ava-tab.tsx`) before tab composition; each tab is an independent component (2026-03-08)
- **Problem solved:** Two-tab layout could be implemented with complex conditionals in parent, or with clean component abstraction
- **Why this works:** Independent components enable isolated testing, clear responsibility (each tab owns its own header controls), and easier future feature additions per tab
- **Trade-offs:** Slightly more files, but chat-overlay-content.tsx is now a clean composition layer (6 lines per tab) instead of 200+ line conditionals

### Two-part fix: (1) enhanced observability of unclassified failures via warn-level logging with raw reason text, (2) added missing pattern for 'agent escalation' scenarios. Not pattern-only fix. (2026-03-09)
- **Context:** Recurring 'unknown' failures were silently dropped with no diagnostics, AND a common failure reason (agent escalation) lacked a matching pattern, causing it to fall through to unknown.
- **Why:** Silent drops make pattern gaps invisible in production. By upgrading unclassified failures to warn-level (visible in production logs), operators can spot new patterns to classify. This creates a sustainable feedback loop rather than reactive pattern additions.
- **Rejected:** Single-pattern approach (just add 'agent escalation' pattern) would leave the observability gap. Operators wouldn't know what other unknown failures they're missing in production.
- **Trade-offs:** More log volume at warn level, but necessary trade-off for pattern discovery and system health. Alternative of high-volume warn logs vs missing patterns in the dark.
- **Breaking if changed:** If you remove the warn-level logging of unclassified failures, you lose visibility into what patterns need to be added next. System becomes opaque to new failure modes.

#### [Pattern] Pure function rule evaluation on immutable world state (LeadWorldState) that returns side-effect actions (LeadRuleAction[]) as a separate layer (2026-03-09)
- **Problem solved:** Lead Engineer service needs to evaluate rules on every inbound event without direct state mutations
- **Why this works:** Separates read logic from write logic. Rules are pure, testable, and deterministic. Executor applies actions independently, enabling async and retry semantics.
- **Trade-offs:** Cleaner architecture and testability vs. additional layer of indirection and requirement to keep world state fresh

### Internal state machine (FeatureState) with 8 states (INTAKE→PLAN→EXECUTE→REVIEW→MERGE→DEPLOY→VERIFY→DONE) vs. simplified public board status with 6 states (2026-03-09)
- **Context:** Need to track detailed execution lifecycle internally while presenting clean status to users and integrating with Authority System
- **Why:** Rich internal state enables fine-grained control and observability; simplified public states reduce cognitive load and support multiple domain models (board, authority system, user experience)
- **Rejected:** Single unified state machine would require either 8-state board (UI complexity) or loss of internal context (operational blindness)
- **Trade-offs:** Richer operational semantics vs. complexity of status translation layer and risk of inconsistency between internal and external representations
- **Breaking if changed:** Authority System integration relies on status mapping; missing translation layer causes sync failures

#### [Gotcha] Type-layer documentation (feature.ts, lead-engineer.ts type definitions) drifts behind service-layer documentation (ava-chat-system.md, distributed-sync.md) (2026-03-09)
- **Situation:** Review of 15 recently-changed files showed service implementations well-documented but their type contracts were not
- **Root cause:** Service documentation is closer to visible behavior and user impact; type documentation requires intentional effort to keep synchronized. Types are implementation detail less visible to reviewers.
- **How to avoid:** Type-layer less visible in docs = harder onboarding for new developers; harder to understand contracts before diving into code

#### [Pattern] Rolling 200-entry circular buffer log of rule evaluations in LeadEngineerSession (ruleLog) for operational observability (2026-03-09)
- **Problem solved:** Need to track rule decisions over time without unbounded memory growth in long-running session
- **Why this works:** Fixed-size log prevents memory leaks in continuous operation; 200 entries provides recent history for debugging without requiring persistent storage
- **Trade-offs:** Observability window is limited to last 200 evaluations; old decisions are permanently lost; insufficient for long-term audit trails

### PhaseHandoff verdict system (APPROVE/WARN/BLOCK) explicitly gates pipeline progression instead of implicit state logic (2026-03-09)
- **Context:** End of each Lead Engineer phase needs quality gates that prevent advancement if conditions aren't met
- **Why:** Explicit verdicts are declarative and unambiguous; BLOCK prevents data corruption by requiring human intervention; WARN allows best-effort progression with visibility
- **Rejected:** Implicit progression based on feature state alone would be silent and could advance broken work to next phase
- **Trade-offs:** BLOCK is hard gate—if issued incorrectly, entire feature pipeline halts (operational friction); WARN requires process to track and handle warnings
- **Breaking if changed:** BLOCK verdict must be cleared explicitly; system could deadlock if verdict logic is buggy and always returns BLOCK

#### [Gotcha] Snapshot types (LeadFeatureSnapshot, LeadAgentSnapshot, LeadPRSnapshot, LeadMilestoneSnapshot) must be kept in sync with their source entity types as they evolve (2026-03-09)
- **Situation:** World state contains snapshots that rule evaluation depends on; source entities (Feature, Agent, PR, Milestone) may change over time
- **Root cause:** Snapshots are immutable inputs to pure rule functions; stale snapshots cause rules to miss critical state changes or make decisions on outdated data
- **How to avoid:** Deterministic rule evaluation vs. snapshot staleness; must rebuild world state frequently to stay current

#### [Pattern] Hook-driven state management for tool approvals: pendingSubagentApprovals, approveSubagentTool, denySubagentTool were already implemented in useChatSession (handling SSE events, state lifecycle, action handlers). Feature completion involved only UI integration, no new hook code needed. (2026-03-09)
- **Problem solved:** Expected to build approval UI against new state management; discovered existing hook already owned the entire flow.
- **Why this works:** When architecture separates concerns correctly (hook manages data/actions, component renders), UI additions become thin integration layers. Indicates approvals were designed with streaming/hooks from inception.
- **Trade-offs:** Easier: pure presentational component. Harder: understand hook implementation first before building UI.

#### [Pattern] Reactive state binding: component renders exactly what useChatSession provides, no local state duplication, no optimistic updates. Approval card presence = array length > 0. (2026-03-09)
- **Problem solved:** Could have implemented local state to track visibility, animated removal, or local confirmation before calling action handlers.
- **Why this works:** Single source of truth (hook) prevents stale state, race conditions, and sync bugs. SSE event adds approval → hook updates → component re-renders. Action (approve/deny) → hook removes → card vanishes. Pure data flow.
- **Trade-offs:** Easier: no state sync bugs. Harder: no local control over visibility/animation timing.

#### [Pattern] Dual-file memory convention: pattern.md vs patterns.md and gotcha.md vs gotchas.md are intentionally separate files with different frontmatter tags ([pattern] vs [patterns], [gotcha] vs [gotchas]) loaded in different semantic contexts by the memory system. (2026-03-09)
- **Problem solved:** Documentation review task encountered two files with similar names but different purposes, which appeared to be duplicates at first glance.
- **Why this works:** Allows fine-grained context routing—agents can load specific file variants based on semantic relevance without hardcoding file paths. Enables polymorph loading of contextually appropriate knowledge.
- **Trade-offs:** More complex file structure (+cognitive load) but enables semantic routing (-coupling to file paths, +contextual precision)

### Large monolithic architecture.md (571 KB) is maintained as single source-of-truth rather than split into focused subdocuments. (2026-03-09)
- **Context:** Architecture documentation is comprehensive and large, covering multiple disparate architectural topics in one file.
- **Why:** Centralized reference ensures architectural coherence and single source of truth for agents querying architecture context. Splitting would create coordination problem.
- **Rejected:** Split into subdocuments (e.g., architecture-services.md, architecture-database.md, architecture-api.md) would improve discoverability but fragment the authoritative source.
- **Trade-offs:** Single large file is harder to navigate for specific topics (+fragmentation risk if split) but stronger coherence (+discoverability if indexed)
- **Breaking if changed:** Splitting architecture.md would require updating all references in memory system and agent context routing; agents expecting monolithic architecture reference would receive partial knowledge.

### WaitingTimer component uses `Date.now()` inside a 1-second `useEffect` interval to calculate elapsed seconds from `receivedAt` (ISO timestamp), rather than incrementing a local counter. (2026-03-09)
- **Context:** UI needs to show 'Waiting 5s...' live counter that ticks up as user waits for tool approval.
- **Why:** Date.now() approach is resilient to missed renders (if effect doesn't fire exactly on 1s boundary) and guarantees monotonic time progression. Counter increments could skip or go backwards if React suspends/resumes rendering.
- **Rejected:** Local counter: `useState` + `setInterval` incrementing 0→1→2... is simpler but vulnerable to React batching/suspension. Could also pass elapsed time from parent, but that couples the timer to parent lifecycle.
- **Trade-offs:** Date.now() = slightly more CPU (datetime math per interval) but more robust. Counter = simpler logic but fragile to React internals. Given this is a UI element with <100 instances, the robustness win outweighs the trivial CPU cost.
- **Breaking if changed:** If you switch to a simple counter without re-architecting how it's initialized/synced with parent state, the timer could fall behind real time, showing 'Waiting 3s...' when the user has actually been waiting 5s+.

### Use intentionally lower confidence scoring (0.75 vs standard) for broad-keyword escalation patterns ('needs human input', 'ambiguous') to avoid false positives. (2026-03-09)
- **Context:** Agent escalation pattern detection must distinguish between retry-able failures and true escalations using broad linguistic keywords.
- **Why:** False positives (classifying a retry-able failure as non-retryable escalation) break the retry system entirely. False negatives (some escalations slip through) are less damaging—unclassified cases surface in warn logs for pattern refinement.
- **Rejected:** High confidence threshold (would produce false positives and block retries); perfect precision (impossible with broad keywords without heavy context analysis).
- **Trade-offs:** Easier: avoids breaking the retry mechanism. Harder: accepts imperfect recall and requires gradual pattern tightening over time via logging.
- **Breaking if changed:** Raising confidence threshold causes false positives that misclassify retryable failures as escalations, blocking the retry system and cascading into agent failures.

#### [Pattern] Document architectural patterns and gotchas in `.automaker/memory/` files (git-tracked, agent-loaded). Commit messages describe *what* changed; memory files explain *why* and capture non-obvious patterns. (2026-03-09)
- **Problem solved:** Feature changed `libs/ui/src/ai/code-block.tsx` to add `isStreaming` prop, but the pattern wasn't documented—only the code and commit message existed.
- **Why this works:** Agents need to understand not just what code does but why it's structured that way. Memory files serve as architectural decision records for future implementations. Without them, similar mistakes repeat.
- **Trade-offs:** Easier: agents have context on architectural patterns. Harder: requires discipline to document alongside code changes.

### Category filtering splits responsibility: server decides protocol/non-protocol inclusion (via includeProtocol parameter to fetchMessages), client decides category visibility (Set<ProtocolCategory> membership checks). Critically, protocol messages with bracket tags not in CATEGORY_TAG_MAP return null from getProtocolCategory and are never filtered—they remain visible regardless of chip selection state. (2026-03-09)
- **Context:** Messages are heterogeneous (protocol with brackets + human text). Protocol messages need fine-grained filtering by 5 categories, but the bracket tag schema may evolve. Server needs to optimize data transfer; client needs instant filter responsiveness.
- **Why:** Separating server (coarse) and client (fine) filtering avoids round-trips for every chip toggle (responsiveness). Unknown tags fail-open (remain visible) to prevent silent data loss if new bracket formats are added server-side before client is updated. This is defensive: an unknown tag from a future protocol version won't disappear.
- **Rejected:** Alternative: Server sends category metadata alongside messages (but then toggling chips requires a fetchMessages round-trip per toggle, breaking responsiveness). Alternative: Unknown tags assigned to 'Other' category (but then filtering is fragile—semantics of unknown tags are undefined).
- **Trade-offs:** Instant UX (no server latency for chip toggles) vs. incomplete filtering (unknown tags always visible, polluting filtered views if tag schema evolves). Bandwidth not saved by category filtering (you still fetch full protocol messages to the client, then filter locally).
- **Breaking if changed:** If you move category filtering to server, add a categories parameter to fetchMessages—you'll need to handle partial selection ('show only Heartbeat') by round-tripping to server. If you start hiding unknown tags instead of passing them through, future protocol extensions will silently drop messages with new bracket types until the UI catches up.

### Domain services use dedicated *.module.ts files for initialization rather than being instantiated in central createServices(). AvaChannelReactorService is instantiated in ava-channel-reactor.module.ts, which reads hivemind config and feature flags before conditional creation. (2026-03-09)
- **Context:** Service requires config-driven initialization and should only instantiate if feature flags are enabled. Centralizing this in createServices() would require the generic container to know about all domain-specific startup logic.
- **Why:** Keeps domain-specific initialization encapsulated and allows conditional instantiation based on configuration. Prevents the main container from becoming a god object.
- **Rejected:** Centralizing all service instantiation in createServices() - would force the generic container to depend on all domain configs and feature flags, violating separation of concerns.
- **Trade-offs:** Distributed initialization (more files to search through) but better encapsulation (each domain manages its own startup). Discovering all wiring requires checking both createServices() and *.module.ts files.
- **Breaking if changed:** If you audit service wiring and assume createServices() is the complete picture, you'll miss domain module instantiations. Services may be wired in multiple locations.

### All spawn operation safety mechanisms (circuit breaker: 3 failures → open, hourly cap: 3/hour, error deduplication) are encapsulated in ReactiveSpawnerService rather than distributed across middleware. (2026-03-09)
- **Context:** Multiple constraints needed to prevent spawn session storms: preventing concurrent duplicates, enforcing hourly limits, tracking failure patterns, and opening circuit after repeated failures.
- **Why:** These are all related to spawn operation safety and use shared state (failure counters, session cache, error hash tracking). Keeping them together prevents inconsistencies and makes the safety rules clear in one place.
- **Rejected:** Separate middleware/interceptors for each concern - would require coordinating state across multiple services and make the safety rules implicit and scattered.
- **Trade-offs:** Single point of failure for all spawn safety (if ReactiveSpawnerService fails, all safety mechanisms fail), but easier to test, reason about, and modify safety rules.
- **Breaking if changed:** If you need to change spawn safety logic (e.g., increase hourly cap to 5), you must touch ReactiveSpawnerService. No way to override individual safety mechanisms independently.

#### [Gotcha] Service wiring is not centralized in a single file. Dependency injection happens both in createServices() AND in domain-specific *.module.ts files. Initial audit missed the module files because only createServices() was checked. (2026-03-09)
- **Situation:** Auditing service wiring to verify ReactiveSpawnerService was properly injected. Checked services.ts and found most wiring, but the actual AvaChannelReactorService → ReactiveSpawnerService wiring lives in ava-channel-reactor.module.ts.
- **Root cause:** Each domain (ava-channel-reactor, fleet-scheduler, etc.) manages its own service initialization through a module pattern. This keeps domain dependencies close to domain logic and allows conditional instantiation.
- **How to avoid:** Distributed wiring (harder to find) but better domain encapsulation (each domain controls its own startup). Requires knowing to look for *.module.ts files.

### Use merge commits (--merge) for all environment promotions instead of squash commits (--squash) (2026-03-09)
- **Context:** Three-branch promotion flow where code flows feature/* → dev → staging → main, requiring multiple sequential merges across environments
- **Why:** Preserving DAG (directed acyclic graph) ancestry prevents 'conflict storms' on subsequent promotions. When you squash at each promotion, downstream merges accumulate unresolved conflicts from all squashed commits, causing exponential merge friction
- **Rejected:** Squash commits - creates linear history but causes merge conflict compounding when same code flows through multiple promotion stages
- **Trade-offs:** Merge commits preserve full ancestry (easier conflict resolution, clearer audit trail) but create more verbose git history. The operational stability of promotions outweighs history verbosity
- **Breaking if changed:** Switching to squash strategy breaks subsequent promotions by creating conflict storms that require manual resolution at each stage

#### [Gotcha] Branch protection requires the exact job name 'source-branch' in GitHub Actions workflow to recognize it as a status check for PRs (2026-03-09)
- **Situation:** promotion-check.yml job naming scheme for enforcing which branches can PR to which environment branches
- **Root cause:** GitHub Actions expects this specific naming convention to expose the workflow result as a mergeable status check in branch protection rules
- **How to avoid:** Constrains job naming but ensures GitHub properly integrates the enforcement; renaming is a one-line change with immediate breaking effect

#### [Pattern] Include bootstrap exception and recovery branch patterns (e.g., chore/promote-staging-main-*) in promotion checks (2026-03-09)
- **Problem solved:** Protecting main/staging from direct merges while still allowing repository initialization and recovery from DAG divergence edge cases
- **Why this works:** Pure enforcement creates operational dead-ends: can't bootstrap empty repo with full protection, and complex merge scenarios can break the promotion chain permanently. Exceptions solve this without weakening the model
- **Trade-offs:** Adds code paths to maintenance surface but prevents operational catastrophes. Recovery branches are rarely used but critical when needed

### Environment-pinned blocking: main only accepts from staging, staging only accepts from dev or promote/*, feature branches merge to dev (2026-03-09)
- **Context:** Enforcing a strict promotion pipeline where code must flow through lower environments before reaching production
- **Why:** Directionality guarantee: code must pass through dev (testing) and staging (production-like) before reaching main. Prevents accidental direct commits, forces testing, and maintains artifact lineage
- **Rejected:** Single main branch with all features, or looser rules allowing feature→staging→main shortcuts - breaks the guarantee that all code sees staging conditions
- **Trade-offs:** Strict flow adds promotion overhead but eliminates classes of deployment bugs (untested code, staging-specific failures). Operationally discoverable path replaces ad-hoc merge decisions
- **Breaking if changed:** Loosening any directional constraint re-introduces risk of code reaching production without passing through lower-environment validation

### Three-tier build command pattern: `build` (full monorepo), `build:packages` (specific workspaces with --filter), `build:libs` (shared deps only). Top-level delegates to turbo, but granular commands bypass it. (2026-03-09)
- **Context:** Monorepo with 15 shared libraries, multiple packages, and apps. Developers need different build scopes depending on workflow.
- **Why:** Balances full reproducibility (turbo for CI) vs developer velocity (filtered builds for local iteration). Allows engineer to rebuild only changed dependencies without full monorepo pipeline.
- **Rejected:** Single `turbo run build` command only, or separate npm scripts per-workspace. Single turbo forces full rebuild; separate scripts lose dependency graph awareness.
- **Trade-offs:** More commands to learn (+complexity) vs faster local builds and CI caching (-developer friction). Pre-built packages in node_modules enable working on single package without rebuilding world.
- **Breaking if changed:** Removing `build:packages/build:libs` forces engineers to rebuild entire monorepo on every change (hours vs minutes). Removing turbo delegation loses caching and determinism in CI.

#### [Pattern] Upstream dependency orchestration: `build` task has `"dependsOn": ["^build"]`, meaning 'build my dependencies first, then me.' This creates a directed acyclic graph (DAG) that turbo executes in topological order. (2026-03-09)
- **Problem solved:** Monorepo with shared libraries (@automaker/types, @automaker/utils) that multiple packages and apps depend on. Without orchestration, a package's build could run before its dependency is ready.
- **Why this works:** Declarative dependency graph is more maintainable than imperative build scripts. Turbo can parallelize builds across independent paths in DAG (e.g., build @automaker/types and @automaker/ui in parallel if they don't depend on each other).
- **Trade-offs:** Declarative is self-documenting (+) but requires understanding DAG model (-). Turbo automatically finds shortest critical path for parallelization (+).

### Global `"outputs": ["dist/**"]` in turbo.json root, not per-package. All tasks output to same pattern; turbo caches and hashes this directory for all workspaces. (2026-03-09)
- **Context:** 15 shared libraries + 3 packages + 2 apps, each with their own build output directory. Configuring outputs in each would require 20 separate turbo.json files or root duplication.
- **Why:** DRY principle. Single source of truth for output semantics. Consistent hashing/caching across all builds.
- **Rejected:** Per-package turbo configs in each workspace (npm workspaces support this). Creates 20 config files, inconsistency when outputs change, and turbo loses monorepo-wide cache visibility.
- **Trade-offs:** Simpler (+) but assumes all builds output to `dist/`. If a package uses different output dir (e.g., `build/`), turbo won't cache it and you lose benefits.
- **Breaking if changed:** If one package changes output to `build/` without updating root turbo.json, that package's output won't be cached. Silent performance regression (no error message).

#### [Gotcha] Feature was mostly pre-implemented in the worktree before manual changes. Only gap: root `package.json` `build` script still used `npm run build:packages && npm run build --workspace=apps/ui` instead of delegating to `turbo run build`. (2026-03-09)
- **Situation:** Investigation revealed `turbo.json` already existed with all pipelines configured. No need to build from scratch.
- **Root cause:** Real-world projects evolve incrementally. Infrastructure tooling (turbo) was added in earlier sprint; root scripts were overlooked in the final delegation step.
- **How to avoid:** Small, focused change (+) but required understanding existing state first (-). Reduced risk of breaking working config (++).

#### [Pattern] Message regeneration state tracked by pendingBranchOrigId (the original message ID being regenerated), not a boolean isRegenerating flag. Shimmer/loading state is per-message, not global. (2026-03-09)
- **Problem solved:** Chat UI needs to handle multiple messages in a conversation, each potentially having regeneration in flight.
- **Why this works:** Allows per-message regeneration tracking; multiple messages can be in different states (one regenerating, others showing results, etc.). Enables shimmer loader to appear at the correct message position.
- **Trade-offs:** Requires managing message ID → regeneration state mapping; more complex state shape vs simpler boolean. Pays off when handling multi-message conversations.

#### [Pattern] Branch state (branchMap, currentBranchIndex) lifted to ChatOverlayContent level (5 layers above ChatMessage), not stored locally in ChatMessage. (2026-03-09)
- **Problem solved:** Need to persist user's branch selection and handle multiple regenerations across a conversation without losing navigation context on re-renders.
- **Why this works:** ChatMessage and ChatMessageList can re-render without losing branch selection state. Conversation-level state enables consistent navigation across all messages. Avoids state thrashing when new branches arrive.
- **Trade-offs:** Requires prop drilling 5 layers deep vs using Context API. More verbose but explicit data flow; easier to trace dependencies.

#### [Pattern] Prop drilling pattern: callbacks and state passed through 5 layers (ChatOverlayContent → AskAvaTab → ChatMessageList → ChatMessage → MessageActions/MessageBranches) instead of Context API. (2026-03-09)
- **Problem solved:** Data and callbacks need to reach deeply nested UI components from the state holder.
- **Why this works:** Explicit, traceable data flow. Every prop dependency is visible in the component signature. Code review can see exactly what data each component needs.
- **Trade-offs:** Verbose (boilerplate in intermediate components) vs cleaner prop lists. Adding a new prop requires updating all 5 layers. Trade-off favors transparency over conciseness.

### WebSocket event subscription (`subagent:tool-approval-request`) drives approval state rather than polling or direct endpoint calls (2026-03-09)
- **Context:** Need to reflect server approval requests in real-time on client without user refresh or action
- **Why:** Event-driven keeps UI reactive to server state changes with zero polling overhead; events are already part of chat infrastructure
- **Rejected:** Polling /api/chat/pending-approvals every N seconds (resource waste, latency spike on approval); manual refresh button (requires user action, defeats real-time purpose)
- **Trade-offs:** Requires WebSocket connection to stay open; if event stream disconnects, new approvals won't arrive until reconnect; gains: instant updates, no polling overhead
- **Breaking if changed:** If WebSocket is closed/disabled, approval requests will never appear client-side even though they exist server-side

### selectedCategories uses Set<ProtocolCategory> instead of Array or object map (2026-03-09)
- **Context:** Filtering protocol messages by category during render loop (potentially hundreds of messages)
- **Why:** Set provides O(1) membership checks ('set.has(category)') in filter predicate vs O(n) array.includes(). In tight render loops with many messages, this scales better.
- **Rejected:** Array<string> or Record<string, boolean> map - both require linear search or object property access overhead
- **Trade-offs:** Set is unfamiliar to some developers (less common pattern in React components). Slightly more cognitive load vs simple boolean flags.
- **Breaking if changed:** If changed to Array or plain object, filtering performance degrades linearly as category count grows. At 5+ categories with high message volume, perceptible slowdown possible.

### Filter state stored locally in component (useState) rather than global store or URL params (2026-03-09)
- **Context:** selectedCategories managed only in ava-channel-tab.tsx component, no Redux/Zustand/URL state
- **Why:** Filter state is view-scoped (never needed outside this component). Local state reduces boilerplate, avoids unnecessary coupling to global store, simpler to reason about.
- **Rejected:** Redux store (overkill for local state, adds middleware/action complexity) | URL params (lose filter on navigation, not product requirement)
- **Trade-offs:** Simpler code and faster development. Cannot persist across page reloads or share state with other components. If product later needs 'save my filter preferences', requires migration to store + persistence layer.
- **Breaking if changed:** If feature expands to show user's filter preferences across sessions, or other components need to read/set filters, entire state architecture must move to global store.

#### [Pattern] Service wiring uses dedicated module file (ava-channel-reactor.module.ts) instead of flat instantiation in services.ts (2026-03-09)
- **Problem solved:** ReactiveSpawnerService must be instantiated and injected into AvaChannelReactorService with complex initialization logic
- **Why this works:** Module pattern encapsulates initialization complexity, enables reusability, improves testability via isolated module tests, and maintains single responsibility
- **Trade-offs:** One additional file to navigate, but clearer separation of concerns and module can be tested independently

#### [Pattern] Two-layer resilience: per-category circuit breaker (3 failures + 5min cooldown) PLUS hourly quota (max 3 sessions/hour with reset) (2026-03-09)
- **Problem solved:** Service spawns reactive workflows; needs protection against both immediate cascading failures AND gradual resource exhaustion
- **Why this works:** Circuit breaker catches failure bursts in the moment (per category acknowledges different failure patterns per message type); hourly quota prevents slow resource drain over time. Together they handle both temporal dimensions of failure.
- **Trade-offs:** More complex configuration and mental model, but resilience against distinct failure modes is clearer

### WorkIntakeService uses pull-based phase claiming — phases are the coordination unit, features are local execution artifacts (2026-03-09)
- **Context:** Multi-instance setups need to divide work without cross-instance feature conflicts. Previous approach synced features via CRDT, which caused every instance to see every other instance's work.
- **Why:** Pull model: each instance reads shared project docs (via Automerge), claims phases by writing to the shared doc, then creates LOCAL features. Features never leave the instance. The CRDT resolves simultaneous claims via last-writer-wins + 200ms verify read pattern. Stale claims (from crashed instances) are reclaimed via peer presence tracking.
- **Rejected:** Feature CRDT sync — caused cross-project contamination, foreign features, and cascade conflicts when multiple projects shared the same sync server. Pull model eliminates the problem at the source.
- **Trade-offs:** Pull model requires tick-based polling (default 30s) instead of push events, adding up to 30s latency before an instance picks up newly available phases. Acceptable trade-off for conflict-free coordination.
- **Breaking if changed:** If feature sync is re-enabled alongside work intake, instances will see each other's features and may try to claim/execute the same phases twice. Guard: features should never enter the CRDT sync event list.


### Unified rendering path (ReactMarkdown) instead of dual paths (marked+DOMPurify for completed, ReactMarkdown for streaming) (2026-03-09)
- **Context:** ChatMessageMarkdown had two separate render branches: streaming messages used ReactMarkdown with custom components; completed messages used marked.parse() + DOMPurify.sanitize() + dangerouslySetInnerHTML, bypassing all custom renderers
- **Why:** Single render path eliminates maintenance burden of dual logic, ensures feature parity (CodeBlock copy button, link styling, table components, citations) across all message states, and reduces test surface area
- **Rejected:** Keeping dual paths for perceived performance benefit of avoiding React reconciliation on completed messages. This optimization proved unnecessary because useMemo(processedContent) + stable plugin arrays already prevent re-renders
- **Trade-offs:** Simpler codebase and unified behavior vs. one additional React reconciliation on message completion (unmeasurable perf impact in practice due to memoization)
- **Breaking if changed:** Removing this unification would require re-implementing custom renderers (CodeBlock, link, table, citation handlers) for the static HTML path or accepting feature degradation in completed messages

#### [Gotcha] Only 2 of 4 target files needed changes; other 2 (`chat-message-markdown.tsx`, `code-block.tsx`) were already using semantic tokens (2026-03-09)
- **Situation:** Feature titled 'Markdown Styling Audit' but chat-message-markdown was already compliant, suggesting either: (a) incomplete initial scope analysis, or (b) selective component maturity
- **Root cause:** Different parts of codebase are at different design system adoption levels; some components migrated previously, others not
- **How to avoid:** Efficient (avoids rework) but creates maintenance burden — no central record of which components are semantic-token compliant vs hardcoded. Risk of re-auditing same files.

#### [Pattern] Side-effect module registration: inline-form-card is imported in ask-ava-tab.tsx purely to trigger registration of the AskUserFormCard as a full-card renderer. Registration happens on import, not on demand. (2026-03-09)
- **Problem solved:** Need to register custom renderer for request_user_input tool without hard-coding it in core tool-invocation-part.tsx
- **Why this works:** Modular design: each feature self-registers, avoiding centralized tool-specific imports. Enables extensibility—new tools add custom rendering by just importing their card component.
- **Trade-offs:** Clean separation of concerns vs. implicit coupling via import statements. If the import is removed, rendering silently degrades to default (no error). Discovery requires reading ask-ava-tab.tsx imports.

### Full-card renderer registry override mechanism: registerFullCard(toolName, Component) allows any tool to opt-in to custom full-screen rendering, checked before standard collapsible card path in tool-invocation-part.tsx. (2026-03-09)
- **Context:** Ask_user needs custom form rendering that doesn't fit the standard collapsible card pattern; this needs to work without modifying the core tool coordinator.
- **Why:** Extensibility via registry pattern. Avoids tool-specific conditionals in shared coordinator code. New tools can provide full-card rendering without core changes. Clear API contract: if a tool registers a full-card renderer, it owns the entire rendering.
- **Rejected:** Adding tool-specific if/else in tool-invocation-part.tsx (poor separation, scales poorly). Using a context or global state for full-card rendering (less explicit, harder to trace data flow).
- **Trade-offs:** More infrastructure code (registerFullCard, getFullCard, hasFullCard methods) but infinite extensibility. Renderers are optional—tools fall back to default if not registered.
- **Breaking if changed:** Removing the full-card registry check causes all custom full-card renderers to fall back to collapsible cards. If ask_user is registered as full-card but the registry check is gone, forms render incorrectly.

### Polling-based response matching (2s intervals) chosen over event-driven subscription for inter-instance messaging (2026-03-09)
- **Context:** Tool needs to wait for response from another Ava instance and return it to caller
- **Why:** Simpler implementation, avoids WebSocket complexity, matches existing codebase patterns for tool design
- **Rejected:** Real-time event subscription / WebSocket listener approach — would require new pub/sub infrastructure
- **Trade-offs:** Polling is less efficient and reactive (2s latency floor, constant checking overhead) but avoids infrastructure complexity. Resource cost vs architectural simplicity.
- **Breaking if changed:** Switching to event-driven requires refactoring poll loop to listener registration, risking tool cancellation/cleanup race conditions

#### [Pattern] Out-of-band UUID correlation IDs embedded in message content strings for distributed request-response matching (2026-03-09)
- **Problem solved:** Need to match asynchronous responses from unknown instances back to specific tool invocations across the network
- **Why this works:** Simple, requires no central ID registry or broker. Leverages existing string-based message format. Each invocation gets unique ID.
- **Trade-offs:** String-based matching in content is duck-typed (convention-over-schema). Fragile if target instance formats response differently or omits correlation ID. No validation.

#### [Pattern] Deadline-based timeout calculation (`deadline = sentAt.getTime() + timeoutMs`) vs counter/iteration-based limits (2026-03-09)
- **Problem solved:** Tool must timeout after configurable duration while polling in loop
- **Why this works:** Deadline is invariant to poll frequency — ensures timeout is measured from request creation, not from first poll. Robust against timing skew.
- **Trade-offs:** Deadline requires Date math but is decoupled from loop implementation. More robust, slightly more overhead.

### Tool registered inside `if (config.avaChannel && services.avaChannelService)` guard block, giving it closure access to avaChannel (2026-03-09)
- **Context:** Tool requires avaChannel APIs to function; must not be exposed when avaChannel is unavailable
- **Why:** Conditional registration ensures tool only exists when dependencies are present. No null-checks needed inside tool. Avoids runtime errors.
- **Rejected:** Registering unconditionally + null-checking inside tool — would create unusable tool in disabled avaChannel configs
- **Trade-offs:** Closure-based access is convenient but creates tight implicit coupling. Tool is not self-documenting about its dependency.
- **Breaking if changed:** If guard is removed or condition changes, tool execution fails immediately with undefined access errors

#### [Pattern] Timestamp-based ordering (`new Date(m.timestamp).getTime() > sentAt.getTime()`) to ensure response is newer than request (2026-03-09)
- **Problem solved:** Polling may receive multiple messages; must distinguish new responses from old cached/replayed messages
- **Why this works:** Temporal ordering prevents false positives from old messages. Ensures causality: response must come after request.
- **Trade-offs:** Requires accurate server timestamps. Clock skew or out-of-order delivery could cause valid responses to be rejected.

### Intent metadata (`intent: 'request', expectsResponse: true`) passed to `postMessage()` to signal RPC-style interaction pattern (2026-03-09)
- **Context:** Tool sends structured backchannel message; receiver must know it should respond
- **Why:** Metadata makes intent explicit. Allows receiver to distinguish one-way messages from RPC-style request-response. Enables routing logic.
- **Rejected:** Convention-based routing on message format (e.g., [message_instance] prefix) — less flexible, harder to extend to other RPC patterns
- **Trade-offs:** Metadata adds clarity but requires receiver implementation to check `expectsResponse` flag and respond accordingly. Convention is implicit.
- **Breaking if changed:** If metadata is ignored by receiver, no response is sent and tool always times out

#### [Pattern] Request-scoped data (sessionId) threaded through function parameter chain rather than stored in service closure or middleware context (2026-03-09)
- **Problem solved:** chatSessionId flows: HTTP request → buildAvaTools(sessionId) → watch_pr tool → PRWatcherService.addWatch(sessionId). Could have been stored in services object or middleware.
- **Why this works:** Explicit parameter passing makes dependencies visible and testable. Tools can be inspected/tested without reverse-engineering where sessionId originated.
- **Trade-offs:** More plumbing code, but tool contracts self-document required context. Easier to test in isolation.

### Service dependencies (agentService, leadEngineerService, autoModeService) threaded through route factory function rather than accessed globally or via context (2026-03-10)
- **Context:** routes.ts needed to pass 3 service instances into createProjectPmRoutes() to support PM tool implementations
- **Why:** Explicit dependency injection enables testability, makes dependency graph visible, prevents service singletons from becoming hidden globals that are hard to mock
- **Rejected:** Could have exported services globally or stored in app.locals context, but that would make test isolation harder and hide coupling
- **Trade-offs:** Requires all callers of createProjectPmRoutes() to know about these services (more explicit), but gains dependency clarity and test isolation
- **Breaking if changed:** Adding a new PM tool that needs a service but the route factory wasn't passed that service will fail silently until runtime; refactoring the factory signature becomes a contract breach

#### [Pattern] PM config structure mirrors ava-config pattern: per-group enable/disable toggles stored at {projectPath}/.automaker/pm-config.json with DEFAULT_PM_CONFIG providing defaults (2026-03-10)
- **Problem solved:** 39 PM tools organized into 8 groups; needed way to selectively enable/disable tool categories per-project without code changes
- **Why this works:** Mirrors existing ava-config pattern establishes consistency across platform. Per-group toggles (not per-tool) reduce config surface area while still giving users meaningful control. Filesystem storage at .automaker/ makes config project-local and git-trackable
- **Trade-offs:** Per-group toggles are coarse-grained (can't disable individual tools), but that's likely intentional—tool groups are usable units. Filesystem storage is simple but requires explicit load/save calls

#### [Pattern] Tool grouping strategy: 8 groups (boardRead, boardWrite, agentControl, prWorkflow, orchestration, contextFiles, leadEngineer, projectMgmt) with per-group enable/disable, not individual tool toggles (2026-03-10)
- **Problem solved:** 39 tools needed organization for discoverability and selective activation
- **Why this works:** Groups are semantic units that represent capabilities (board operations, agent control, etc.). Per-group toggles reduce cognitive load on users—'disable agent control' is simpler than disabling 5 individual agent tools. Mirrors the structure of PM workflows
- **Trade-offs:** Coarse toggles mean you can't use some tools from a group while disabling others. But groups map to user mental models (agent operations are distinct from board operations)

### PM tools use projectSlug from route params, not from authenticated user context or session—tool actions are project-scoped, not user-scoped (2026-03-10)
- **Context:** Tool implementations like get_board_summary, create_feature all use projectSlug; no user-specific filtering on top of project scope
- **Why:** Project is the boundary of authority for PM tools. User authentication ensures they have access to /api/projects/:projectSlug, but once authenticated, all PM tools operate on that project. Simpler mental model than layering user permissions on top
- **Rejected:** Could have user roles + per-tool permission checks (more granular, but complex), could scope tools to user's assigned features (loses board-wide visibility)
- **Trade-offs:** Simpler authorization (project access = all PM tool access), but means no per-tool permissions within a project. All-or-nothing project access
- **Breaking if changed:** If per-tool permissions are added later (e.g., only some users can delete features), entire tool surface needs a permission layer; if user context becomes required for auditing, tool signatures change

#### [Pattern] Deep-merge pattern in loadAvaConfig: user overrides merge into full default config rather than replacing it, preserving all default tool groups unless explicitly overridden (2026-03-10)
- **Problem solved:** Default disables ~10 tool groups, but users need to selectively enable specific tools without listing all 20 groups or modifying code
- **Why this works:** Absence of a key in user config doesn't reset it—all defaults persist. Selective override is more forgiving than replacement semantics and produces simpler user configs
- **Trade-offs:** Gained: minimal user config files (only overrides needed), defaults always present. Lost: full config not visible in user file alone; implicit behavior harder to audit

### System architecture infrastructure details (CRDT, fleet scheduler, heartbeat intervals, Discord channel ID tables) were removed from LLM prompt entirely (~35% of content). Prompt now focuses only on user-facing behavior and capabilities. (2026-03-10)
- **Context:** Original prompt mixed implementation internals with behavioral guidance, causing bloat that pushed token count too high.
- **Why:** LLM system prompts should guide behavior, not document infrastructure. Ava operates through APIs and events, not by knowing internal coordination mechanisms. Infrastructure knowledge doesn't improve decision-making and competes for token budget with actionable guidance.
- **Rejected:** Keep infrastructure as 'context' for completeness; move to separate documentation only when token budget is critical.
- **Trade-offs:** Simpler, more focused prompt vs. complete picture of system internals. Infrastructure changes no longer require prompt updates, reducing maintenance burden.
- **Breaking if changed:** If Ava needs to make decisions based on fleet state or CRDT consistency, this knowledge would be needed. However, current architecture routes such decisions through APIs, not through Ava's awareness.

### Established explicit delegation boundary: delegate PROJECT-SPECIFIC work (status queries, feature creation, implementation plans on single projects) to PM; own CROSS-PROJECT decisions (coordination, sequencing, strategic audits, game plans). (2026-03-10)
- **Context:** Previous prompt had minimal guidance on when to delegate vs. handle directly, creating ambiguity in routing decisions.
- **Why:** Clear scope boundaries improve routing consistency and prevent scope creep. Separates data ownership (PM owns project details) from strategic coordination (Ava owns cross-project judgment). Mirrors organizational structure where each PM is domain expert for their project.
- **Rejected:** Implicit delegation through examples only (too vague for consistent LLM behavior); Ava owns all decisions (loses PM agency, creates bottleneck); Ava delegates everything (loses strategic role).
- **Trade-offs:** More deterministic behavior, cleaner separation of concerns vs. requires async coordination between Ava and multiple PMs, increases communication complexity.
- **Breaking if changed:** If this boundary shifts (e.g., Ava should own project-level implementation decisions), delegation logic throughout the system breaks. Requires re-tuning all downstream features that depend on this boundary.

#### [Pattern] Explicit delegation patterns table (signal → action) maps observable cues (question phrasing, scenario type) to specific routing decisions. Example: 'What's happening on [project]?' → delegate_to_pm; 'Audit all projects' → loop delegate_to_pm per project, synthesize cross-project view. (2026-03-10)
- **Problem solved:** Previous guidance was implicit: only statement 'What Ava Does Directly' without concrete examples of when the opposite (delegation) applies.
- **Why this works:** LLMs benefit from explicit pattern matching. A table of signals makes the decision boundary learnable and reproducible. Teaching by example (this scenario → this tool) is more reliable than abstract rules.
- **Trade-offs:** More prescriptive and consistent behavior vs. less flexibility for edge cases; table must be updated as new patterns emerge.

#### [Pattern] Dual-layer storage pattern: server URL override stored in BOTH localStorage (persistence) and app-store state (reactivity). Changes to one trigger updates to the other via setServerUrlOverride(). (2026-03-10)
- **Problem solved:** Need to preserve user's URL choice across page reloads while also updating UI reactively when override changes
- **Why this works:** localStorage alone is inert; app-state alone loses on refresh. Dual storage decouples persistence from UI reactivity.
- **Trade-offs:** More complex sync logic, but guarantees both behaviors work correctly

#### [Gotcha] HTTP client invalidation requires calling reconnect() on existing singleton THEN replacing it with fresh instance. Just updating state doesn't terminate stale connections. (2026-03-10)
- **Situation:** When server URL override changes, old HTTP client still connected to previous server, WebSocket still active to old endpoint
- **Root cause:** HTTP clients cache TCP connections and WebSocket maintains live connection state. These don't auto-reset on config change.
- **How to avoid:** More overhead (explicit reconnection), but ensures clean cutover to new server with no stale connections

#### [Pattern] Recent URLs list: deduplicated, capped at 10, persisted to localStorage. Maintains user's history of tried servers without bloat. (2026-03-10)
- **Problem solved:** Users switching between multiple server URLs; want quick access to recent choices without unlimited growth
- **Why this works:** Dedup prevents confusion (duplicate entries in dropdown); cap at 10 prevents localStorage runaway (~500 bytes per entry × 10 = 5KB); persistence survives sessions
- **Trade-offs:** Oldest entries eventually drop off; must re-add if you switch back to very old server

### Fallback chain for getServerUrl(): localStorage override → Electron cached URL → VITE_SERVER_URL env var → relative URL. Order matters: most specific/recent first, then deployment config, then sensible default. (2026-03-10)
- **Context:** Determining server URL in headless client that can run in web, Electron, or remote scenarios
- **Why:** Allows runtime override (localStorage) to take precedence over static config, while Electron cache bridges gap when URL not explicitly passed. Progressive fallback ensures always working URL.
- **Rejected:** Alternative: env var only - would prevent runtime switching. Alternative: all sources equal priority - would create non-deterministic behavior.
- **Trade-offs:** Order makes some sources 'win' silently; harder to debug which source is active. But enables flexible deployment (web, Electron, remote client).
- **Breaking if changed:** Changing order (e.g., env var first) means static config overrides user runtime choice - defeats runtime switching feature. Removing localStorage check breaks entire override capability.

#### [Pattern] Dual client invalidation pattern: setServerUrlOverride() calls both invalidateHttpClient() (recreates HTTP singleton) AND httpApiClientInstance.reconnect() (closes/reopens WebSocket). Both transports invalidated atomically. (2026-03-10)
- **Problem solved:** Ensuring client stays consistent when server URL changes at runtime
- **Why this works:** HTTP client may cache responses in memory. WebSocket maintains persistent connection state. If only HTTP invalidated, stale WS goes to old server. If only WS invalidated, HTTP client still cached. Dual invalidation enforces clean state across both layers.
- **Trade-offs:** More expensive (closes connections, clears caches), but guarantees no data inconsistency. Alternative of lazy reconnection would risk serving stale cached data.

#### [Pattern] HTTP client as singleton with invalidation function (invalidateHttpClient) rather than creating new instance on each call. Invalidation clears cache and recreates singleton. (2026-03-10)
- **Problem solved:** Managing HTTP client lifecycle when server URL can change at runtime
- **Why this works:** Singleton avoids constant re-creation overhead. Invalidation ensures stale cached responses don't persist after server change. Balances performance (reuse) with correctness (fresh on override).
- **Trade-offs:** Invalidation adds complexity (must remember to call it). Singleton improves performance but creates implicit dependency on invalidation call.

### localStorage-first override pattern: setServerUrlOverride() persists to localStorage key 'automaker:serverUrlOverride'. getServerUrl() checks localStorage before env vars. Survives page reloads and app restarts. (2026-03-10)
- **Context:** Allowing user to switch server URL at runtime without environment variable redeployment
- **Why:** localStorage is persistent across sessions but mutable at runtime. Enables dev/testing workflows (e.g., switch between staging/prod servers without redeploy). Env var is immutable per deployment.
- **Rejected:** Memory-only override: lost on page reload, bad UX. Session storage: lost on browser close. Env var only: requires redeployment to switch, blocks dev workflows.
- **Trade-offs:** Persistent storage means stale overrides can linger if user doesn't clear. Hard-coded key 'automaker:serverUrlOverride' means no migration path if key changes.
- **Breaking if changed:** Removing localStorage check: runtime switching disappears, dev workflows blocked. Changing localStorage key: old overrides become orphaned, no automatic migration.

#### [Gotcha] Electron-specific fallback in getServerUrl() caches URL from Electron IPC. Web and headless clients skip this. Creates two different code paths for 'where is the server'. (2026-03-10)
- **Situation:** Supporting Electron desktop app where server URL may be determined at runtime via IPC, but web clients have no such mechanism
- **Root cause:** Electron app runs server locally but renderer process (web bundle) doesn't know URL directly - needs IPC to ask main process. Web doesn't have main process, so URL comes from env/override.
- **How to avoid:** Desktop and web clients have different initialization requirements. Complicates testing (need to mock Electron fallback on web). Makes client code less portable.

#### [Pattern] Reactive watch effect on serverUrlOverride state: when changed, triggers chain of (invalidateHttpClient → reconnect WebSocket) then adds URL to recentServerUrls. Single state change triggers coordinated invalidation across all layers. (2026-03-10)
- **Problem solved:** Keeping multiple client instances and caches in sync when server changes
- **Why this works:** Effect pattern ensures invalidation happens automatically whenever state changes. Removes manual error-prone coordination. Centralizes server-change logic in one place (the effect).
- **Trade-offs:** Effect can hide where invalidation happens (implicit). If effect breaks, entire feature silently fails. More declarative but less explicit than manual calls.

### URL validation 'Phase 5: Polish' item: validate URL format before storing in override or recentServerUrls. Validation prevents invalid URLs from being persisted and later causing reconnection failures. (2026-03-10)
- **Context:** Protecting against user error (typos) or programmatic mistakes when setting server override
- **Why:** Invalid URL stored locally causes cascading failures later (reconnect fails silently, hard to debug). Validation at input catches errors immediately while context is clear.
- **Rejected:** Lazy validation (only when reconnecting): error message appears later, harder to trace to original setServerUrl call. No validation: localStorage polluted with garbage URLs.
- **Trade-offs:** Validation function needs URL parser (adds logic). Rejects invalid URLs which might be intentional (for testing). Error feedback must be clear.
- **Breaking if changed:** Removing validation: allows invalid URLs to persist in localStorage, causing obscure failures later. Bad URLs survive app restart, hard to recover from.

#### [Pattern] HTTP client invalidation (`invalidateHttpClient()`) used as a reconnection trigger when server URL changes. The action calls this method to force connection reset without explicit URL parameter passing. (2026-03-10)
- **Problem solved:** When user changes server URL via `setServerUrlOverride()`, both HTTP and WebSocket connections must reconnect to the new address.
- **Why this works:** Decouples URL change logic from client recreation. The client handles its own state invalidation/reset, making the pattern reusable for other invalidation triggers. Avoids passing URL through multiple layers.
- **Trade-offs:** Elegant separation of concerns, but creates hidden dependency: if HTTP client doesn't properly handle invalidation (doesn't recreate WebSocket), feature silently fails. Gotcha is that the failure mode is not obvious—users won't see errors, just stale connections.

#### [Pattern] Recent URLs stored with deduplication and size limit (max 10). When `setServerUrlOverride()` is called, new URL is added to front of array, duplicates removed, array truncated to 10. (2026-03-10)
- **Problem solved:** UX pattern: show user a history of servers they've recently switched to, enable quick re-selection without typing.
- **Why this works:** Small, bounded history prevents unbounded growth while keeping common case (switch between 3-5 servers) instant. Deduplication avoids cluttering the list with repeated entries.
- **Trade-offs:** Logic is straightforward but order-dependent: deduplication must happen before truncation. If someone adds this pattern elsewhere, they must remember this order.

#### [Pattern] Configuration changes that invalidate connections use two-step pattern: invalidateHttpClient() then reconnect(). Not just reconnect(). (2026-03-10)
- **Problem solved:** When server URL override is set at runtime, WebSocket connection to old server becomes stale and causes silent failures if not properly cleaned
- **Why this works:** invalidateHttpClient() removes old client instance from state. Only then does reconnect() create fresh connection. Sequential ensures old connection doesn't persist alongside new one, preventing resource leaks and state inconsistency from conflicting message handlers on both connections.
- **Trade-offs:** Two-step explicit API is clear but verbose. Synchronous ordering prevents bugs but limits any future parallelization.

### Server URL determination centralized in getServerUrl() function, checks runtime override before returning default. Not scattered at call sites. (2026-03-10)
- **Context:** Could implement override logic at every location that needs server URL, or create single authoritative function
- **Why:** Single source of truth: all call sites inherit override behavior automatically. Reduces bug surface from conditional-check misses. New code using getServerUrl() doesn't need knowledge of override mechanism.
- **Rejected:** Conditional checks at each call site (maintenance burden, easy to forget, inconsistent behavior across codebase)
- **Trade-offs:** Requires disciplined use of getServerUrl() function. If code caches result at init time, runtime override changes are invisible.
- **Breaking if changed:** If caller caches getServerUrl() result instead of calling repeatedly, they bypass override mechanism completely.

#### [Pattern] Recent server URLs stored in localStorage with max 10 entries, deduplicated on add (remove old occurrence before prepend), not appended. (2026-03-10)
- **Problem solved:** User needs quick access to previously-used servers, but localStorage is bounded (5-10MB) and array can grow unbounded
- **Why this works:** Dedup-on-add (prepend new, remove old occurrence) preserves recency order and prevents duplicates with single O(n) operation (n max 10). Bounded size prevents storage exhaustion.
- **Trade-offs:** O(n) dedup operation per add, but n capped at 10. List always reflects most-recently-used order.

#### [Gotcha] setServerUrlOverride() must explicitly call invalidateHttpClient() to trigger WebSocket reconnection—this is not automatic (2026-03-10)
- **Situation:** Changing server URL requires both updating state AND closing/reconnecting the WebSocket to the new server
- **Root cause:** State management (app-store) and I/O concerns (WebSocket reconnection) are separated. Store doesn't own HTTP client lifecycle, so it can't auto-reconnect. Explicit call required to bridge these layers
- **How to avoid:** Explicit is easier to understand and debug (see exactly where reconnect happens) but easy to miss when refactoring. If someone adds another setServerUrlOverride call without invalidateHttpClient(), old WebSocket persists while HTTP client uses new URL—inconsistent connection state, hard to debug

#### [Pattern] HTTP client singleton invalidation triggers WebSocket reconnection via `invalidateHttpClient()` which calls `httpApiClientInstance.reconnect()` before replacing singleton (2026-03-10)
- **Problem solved:** When server URL override is set, both HTTP and WebSocket connections must reconnect to new URL
- **Why this works:** Centralizes connection lifecycle management. Single invalidation point ensures both protocols resync atomically rather than having separate reconnect paths
- **Trade-offs:** Easier: coupled lifecycle prevents partial reconnection. Harder: HTTP client must own WebSocket lifecycle awareness

#### [Pattern] Server-to-client events in HITL tools must use broadcast() not emit() to reach WebSocket clients in the UI (2026-03-10)
- **Problem solved:** Building a user input request feature in a HITL tool that needs to notify WebSocket clients of events
- **Why this works:** emit() only fires server-side EventEmitter listeners; broadcast() pushes events to all connected WebSocket clients. UI consumption requires broadcast.
- **Trade-offs:** broadcast() adds network I/O for every client; emit() is lighter but only reaches internal listeners. Trade off latency/bandwidth for UI responsiveness.

#### [Pattern] UI client maintains deliberately narrowed EventType union (subset of server-side types) to express which events the UI actually consumes (2026-03-10)
- **Problem solved:** The UI's base-http-client.ts defines its own EventType union rather than importing the full server-side union from libs/types/src/event.ts
- **Why this works:** Provides explicit intent boundary: makes it clear which server events the UI cares about, reduces surface area of event handling code, and documents the UI→server contract
- **Trade-offs:** Clarity and intent gained; synchronization burden introduced - developers must update two separate type definitions when adding events the UI needs

### EventType is defined locally in base-http-client.ts rather than exported from libs/types, creating a synchronization point that must be manually maintained (2026-03-10)
- **Context:** Server-side event.ts already defined 'chat:user-input-request' and its EventPayloadMap entry, but the UI client's separate EventType union missed it
- **Why:** Separation allows UI to narrow the scope, but creates coordination risk: developers adding server events must remember to propagate to UI type definition
- **Rejected:** Exporting EventType from libs/types for direct import - this removes the coordination burden but loses the narrowing intent and makes it unclear which events UI actually uses
- **Trade-offs:** Current approach: explicit intent, clear narrow scope; cost is dual maintenance and risk of drift
- **Breaking if changed:** If EventType moves to libs/types export, the UI no longer documents its event consumption contract; if removed entirely, no type safety on event dispatch

### Multi-layer fallback chain in getServerUrl(): localStorage override → Electron IPC → env var → defaults. localStorage checked first, giving it highest priority. (2026-03-10)
- **Context:** Need to support server URL override in multiple runtime contexts: Electron app, development, production
- **Why:** localStorage first allows runtime override without rebuild; Electron IPC supports desktop context; env var handles build-time config; defaults handle fallback cases
- **Rejected:** Single source of truth (env var only) would require rebuilds for URL changes; environment alone couldn't support Electron context
- **Trade-offs:** Multiple code paths increase test surface area, but provides maximum flexibility for different deployment contexts
- **Breaking if changed:** Removing localStorage check breaks runtime URL override capability entirely; order matters—changing it changes precedence hierarchy

#### [Gotcha] invalidateHttpClient() method name is misleading—it triggers both HTTP client cache invalidation AND WebSocket reconnection. Setting serverUrlOverride requires both transports to reconnect. (2026-03-10)
- **Situation:** User changes server URL override at runtime; both HTTP requests and WebSocket must point to new server
- **Root cause:** If only HTTP is invalidated but WebSocket stays connected to old server, you get split-brain state (requests go to new server, events come from old server)
- **How to avoid:** Tight coupling between concerns ensures consistency but obscures the full scope of what 'invalidate' does

#### [Pattern] Watch-mode development requires 'build:packages' only (tsx handles TS runtime compilation at execution time). Headless/production requires 'build:server' (full tsc compile to dist/ directory). Different execution models necessitate different build strategies. (2026-03-10)
- **Problem solved:** dev:headless implements production-mode server startup that runs locally. Requires pre-compiled JavaScript in dist/, unlike watch-mode which uses tsx for runtime compilation.
- **Why this works:** tsx enables hot-reload and live development iteration. Headless mode uses plain 'node dist/index.js' which requires pre-compiled output. These are two fundamentally different execution models with incompatible build requirements.
- **Trade-offs:** Multiple build commands increase cognitive overhead and configuration complexity, but avoid unnecessary tsc compilation and keep runtime TS compilation isolated to dev

#### [Gotcha] Identically-named services in different architectural layers (auto-mode/lead-engineer-service.ts vs services/lead-engineer-service.ts) create silent removal and refactoring hazards. Team had to explicitly verify no import collisions before deletion. (2026-03-10)
- **Situation:** Removed lead-engineer files from auto-mode/ subdirectory while live lead-engineer-service exists at services/ level. Same domain concept, similar naming across layers.
- **Root cause:** Multi-layer architecture naturally reuses domain names (lead-engineer), but this creates disambiguation burden during refactoring. Easy to accidentally delete wrong file or miss cross-layer imports.
- **How to avoid:** Current naming is semantically clear but risky during maintenance. Renaming adds churn but removes ambiguity. Team chose clarity over safety.

#### [Pattern] Parallel architecture supersession via no-op method stubs: methods like resetFailureTracking() and recordSuccess() retain signatures but empty bodies. Old callers work; new coordinator handles real state. (2026-03-10)
- **Problem solved:** Legacy global failure-tracking pattern (this.config, consecutiveFailures) superseded by per-project AutoLoopCoordinator. Can't delete methods immediately due to call-site coupling.
- **Why this works:** Enables gradual migration without rewriting all callers at once. Maintains API contract during architecture transition. Reduces refactoring risk.
- **Trade-offs:** Easier migration path, but no-op stubs can hide future bugs if someone calls them expecting side effects. Dead code remains (just hidden).

### Inlined CONSECUTIVE_FAILURE_THRESHOLD constant (2) directly into active code signalShouldPauseForProject() rather than keeping constant when deleting its parent file. (2026-03-10)
- **Context:** Constant defined in deleted auto-mode/lead-engineer-rules.ts but used in active method. Had to decide: extract constant or inline value.
- **Why:** Inlining acknowledges the constant was never meant to be configurable—it's an implementation detail of the old pattern. Avoids creating orphaned constants. New per-project coordinator will define its own thresholds.
- **Rejected:** Extract constant to a legacy-constants file. Adds indirection for a single value; suggests false reusability.
- **Trade-offs:** Inlined values are less DRY and harder to change globally, but avoid creating false architecture (orphaned constants). Signals intentionality: this is not a knob, it's a fixed value.
- **Breaking if changed:** If code needs to change the threshold, it must now find the inlined `2` rather than a named constant. Makes threshold less discoverable.

#### [Gotcha] Removing fallback delegation changes behavior silently. trackFailureAndCheckPauseForProject(undefined) now returns false (no per-project state) instead of delegating to removed global trackFailureAndCheckPause(). (2026-03-10)
- **Situation:** Active method had fallback: if per-project coordinator state missing, use global method. Deletion removes fallback, forcing explicit false return.
- **Root cause:** Global fallback was safety net for edge case (no per-project state). Removal assumes coordinator always exists. Per-project pattern is now mandatory.
- **How to avoid:** Silent return false is cleaner (no exceptions) but could mask coordinator initialization bugs. Forces confidence in coordinator's per-project coverage.

### Migrated from class state mutation (this.config) to parameter injection in runAutoLoop(projectPath, maxConcurrency). Avoids mutable instance state in async loop. (2026-03-10)
- **Context:** runAutoLoop was reading this.config.projectPath and this.config.maxConcurrency. These values set once at start, never updated, but held as mutable state.
- **Why:** State mutation in async loops creates race conditions and debugging complexity. Parameters are immutable, clear data flow. Aligns with functional style and per-project coordinator pattern.
- **Rejected:** Keep this.config but make it readonly/private. Still allows aliasing and indirect mutation; parameters are more explicit.
- **Trade-offs:** Parameter injection requires updating call sites (startAutoLoop→runAutoLoop). More argument passing, but clearer intent. Better testability (no mock config setup).
- **Breaking if changed:** If code modifies this.config mid-loop expecting effects on runAutoLoop, those effects are gone. Removes implicit state coupling.