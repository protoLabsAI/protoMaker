---
tags: [architecture]
summary: architecture implementation decisions and patterns
relevantTo: [architecture]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 4
  referenced: 3
  successfulFeatures: 3
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

### Backward-compatible type re-exports in app-store.ts during gradual slice extraction (2026-02-13)
- **Context:** 4,268-line monolithic store split into 5 domain slices. 173 files import from app-store; only 7 critical components updated to use new slices directly.
- **Why:** Allows extraction to proceed without forcing immediate updates across entire codebase. Eliminates cascading import failures that would block feature completion. Enables incremental migration of components as they're modified for other reasons.
- **Rejected:** Force-update all 173 imports immediately (blocks feature until complete), or extract without re-exports (breaks all downstream code, cascading failures)
- **Trade-offs:** Short-term: re-exports mask unused imports, minor performance cost from indirection. Long-term: creates debt—components don't know which slice to import from. Mitigation: incremental cleanup optional, not blocking.
- **Breaking if changed:** If re-exports removed without updating imports, 166 files fail to build. Re-exports ARE the migration bridge—removing prematurely breaks the codebase.

#### [Gotcha] Keyboard shortcut utility functions (parseShortcut, formatShortcut) required relocation from app-store to settings-store (2026-02-13)
- **Situation:** These utilities were originally in app-store.ts. When extracting settings-store.ts, extracting the state was simple but utilities remained orphaned in the original file. Components importing from app-store for utilities only caused unnecessary coupling.
- **Root cause:** Utilities should live in the same file as the state that uses them. This prevents circular dependencies and co-locates related logic. Components should import utilities from settings-store, not app-store.
- **How to avoid:** Easier: utilities and state co-located, clear import path. Harder: required identifying all utility usage and updating imports.

#### [Pattern] Extraction order: largest domain first (terminal-store ~1000 lines), then medium (ai-models, worktree), then small (settings, chat). No persist middleware on any slice. (2026-02-13)
- **Problem solved:** 5 stores extracted from monolith. No localStorage persistence, settings sync via API (use-settings-sync.ts). All stores use basic Zustand `create()` without persist.
- **Why this works:** Extracting largest slice first maximizes lines-of-code reduction early, validates extraction pattern, reduces final app-store size faster. No persist middleware because settings are already synced server-side; persisting would create sync conflicts and stale state problems.
- **Trade-offs:** Benefit: Extracted terminal first validated entire pattern before investing in 4 more slices. Cost: No offline capability, but API sync is source of truth. If persist were added, would need conflict resolution logic.

### Stopped final reduction at 3,414 lines for app-store.ts instead of continuing to <1,000 lines target (2026-02-13)
- **Context:** Initial goal: reduce app-store from 4,268 to <1,000 lines. Extracted 5 slices (1,000 + 500 + 800 + 600 + 250 = 3,150 lines). Final app-store: 3,414 lines (still ~80% oversized vs 1,000 target).
- **Why:** Remaining 3,414 lines are tightly coupled: projects, features/kanban, board backgrounds, pipeline config. Further extraction would require architectural refactoring of how projects/features relate to global app state. Cost-benefit unfavorable: complexity introduced > value gained for current codebase.
- **Rejected:** Continue extracting project-store, features-store, board-store (requires refactoring project/feature initialization, board subscriptions, and app-wide state coherence. High breaking risk, diminishing returns)
- **Trade-offs:** Benefit: 20% reduction achieved, clear domain slices established, pattern validated. Cost: app-store still large. Remaining work is optional/incremental. Team can improve incrementally without blocking.
- **Breaking if changed:** If remaining state were forcibly extracted without refactoring initialization order and project-wide state bindings, projects would fail to load and board updates would break. The remaining 3,414 lines represent tight coupling that's OK to preserve until a clearer architectural need emerges.

#### [Gotcha] Component import scope underestimated: 173 files import from app-store, but only 7 critical files actually use extracted functionality directly (2026-02-13)
- **Situation:** Initial assumption: updating all 173 imports is necessary. Reality: most imports are for re-exported types or unrelated state. Only components actively using extracted state (TerminalPanel, ChatHistory, WorktreePanel, KeyboardMap, etc.) needed updates.
- **Root cause:** Many imports are for types that didn't move, or for state that remained in app-store. Re-exports satisfy those imports. Forcing updates to 173 files would create churn without benefit.
- **How to avoid:** Current: 7 updates required, 166 still use re-exports. Benefit: reduced scope, lower risk. Cost: re-exports create mild technical debt (should migrate as components are touched).

### Moved domain-specific components to `components/shared/` or view-specific directories BEFORE updating imports, allowing Git to track moves as renames rather than delete+add operations (2026-02-13)
- **Context:** Refactoring 23 domain-specific components out of the shadcn/ui-compliant `components/ui/` directory
- **Why:** Git rename detection requires the file to exist at the new location before the old reference is removed from imports. Doing this in reverse (updating imports first) causes Git to see deletions, losing history and causing merge conflicts in concurrent branches.
- **Rejected:** Update all imports first, then move files. This causes Git to treat moves as delete+add, losing blame history and making cherry-picks/rebases harder.
- **Trade-offs:** Must coordinate file moves across 23 files with import updates across 73+ files. Easier to track as renames (good for history) but requires two-phase refactoring (move first, then import-hunt).
- **Breaking if changed:** Changing the order (imports before moves) breaks Git history tracking and complicates future rebases/cherry-picks into feature branches that reference the old locations.

#### [Gotcha] Two moved components (`hotkey-button.tsx`, `git-diff-panel.tsx`) had relative imports to other UI primitives (`../button`, `../card`). These broke when moved to `components/shared/` because the relative path no longer resolves. (2026-02-13)
- **Situation:** Automated `sed` replacement of import paths from `@/components/ui/*` didn't catch internal relative imports within component files
- **Root cause:** The search strategy (`grep -r "from '@/components/ui/"`) only found absolute imports in consuming code, not relative imports within the component files themselves. Components written to live in one directory structure reference siblings via relative paths.
- **How to avoid:** Relative imports keep interdependencies explicit locally but break during refactoring. Absolute imports are refactor-safe but create circular dependency risks if not carefully managed.

### Organized moved components by usage pattern: shared components (used by 2+ views) to `components/shared/`, view-specific components to `components/views/{view-name}/components/` (2026-02-13)
- **Context:** 23 domain-specific components were intermingled with true UI primitives in `components/ui/`
- **Why:** Separates concerns: primitives are reusable, framework-agnostic, theme-aware. Shared domain components are business logic with shared state. View-specific components are tightly coupled to one feature. This hierarchy makes dependencies explicit and prevents accidental coupling.
- **Rejected:** Flat structure (keep all in one shared directory). Unclear from imports whether a component is view-specific or reusable. Makes it harder to enforce dependency direction (view-specific shouldn't depend on primitives directly).
- **Trade-offs:** More directory nesting increases friction for import paths but improves discoverability. Clear from import path whether you're using a primitive or domain component. Prevents the original problem (domain logic leaking into the UI primitive library).
- **Breaking if changed:** If all components stay in `components/ui/`, the shadcn/ui compliance is lost and the directory becomes a dumping ground. Dependencies become implicit, making refactoring and testing harder. Future developers won't know which components are safe to modify.

#### [Gotcha] Barrel exports (index.ts files) in `components/shared/` and `components/views/board-view/components/` were not automatically created during file moves. Imports needed explicit export statements added to new index.ts files. (2026-02-13)
- **Situation:** Moving components to new directories left those directories without barrel exports, so consumers had to use full file paths instead of cleaner directory imports
- **Root cause:** File moves (git mv) don't create index.ts files. The export structure is a separate concern from the physical file location. Without explicitly adding exports, consumers get long import paths and lose the organizational abstraction.
- **How to avoid:** Adding barrel exports requires manual curation (deciding what's public) but enables cleaner consumer imports. Trade-off: a few lines in index.ts for many cleaner imports across 73+ files.

#### [Pattern] Used `find` + `sed` with escaped path separators and context patterns to bulk-replace 73 import statements across the codebase in a single operation per component move (2026-02-13)
- **Problem solved:** Each of 23 components needed imports updated across 73+ files. Manual find-and-replace would be error-prone and time-consuming.
- **Why this works:** Automated bulk replacement ensures consistency and catches all references (vs manual search missing some). Using context patterns (e.g., `from '@/components/ui/log-viewer'`) reduces false positives from substring matches.
- **Trade-offs:** Requires careful regex escaping and testing each sed command, but eliminates human error at scale. One sed per component is fast (~1-2s) vs finding and clicking through 73 replacements in editor.