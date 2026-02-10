---
tags: [architecture]
summary: architecture implementation decisions and patterns
relevantTo: [architecture]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 1
  referenced: 1
  successfulFeatures: 1
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