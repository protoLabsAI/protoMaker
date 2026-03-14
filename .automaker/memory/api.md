---
tags: [api]
summary: api implementation decisions and patterns
relevantTo: [api]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 521
  referenced: 132
  successfulFeatures: 132
---
<!-- domain: API Design & Integration | GitHub GraphQL, REST endpoints, HTTP client patterns -->

# api

### Using GitHub GraphQL API with resolveReviewThread mutation rather than REST API for thread resolution (2026-02-10)

- **Context:** Need to fetch thread list and resolve threads programmatically.
- **Why:** GraphQL provides single query to fetch all thread data with author info (needed to filter bots). Native `resolveReviewThread` mutation is more reliable than constructing REST endpoints. Better performance than N+1 REST calls.
- **Rejected:** REST API — no single endpoint for bulk thread operations. Would require multiple sequential calls and manual pagination.
- **Breaking if changed:** If switched back to REST API, would need to restructure as multiple sequential calls and handle pagination manually.

### mergePR() call passes waitForCI: true by default (from settings), causing merge to block until CI checks complete (2026-02-10)

- **Context:** Merge should only happen when CI passes. GitHub branch protection requires status checks to pass before merge.
- **Why:** Avoids race condition where merge executes before CI finishes. GitHub API rejects merge if checks pending.
- **Breaking if changed:** If waitForCI is hardcoded false, merge frequently fails due to pending checks. Features marked blocked incorrectly (timing issue, not a real block).

### Use 409 Conflict for 'cannot delete worktree because agent is running' rather than 400 or 403 (2026-02-10)

- **Context:** DELETE /api/worktree/delete route needs to distinguish between invalid input vs. resource conflict.
- **Why:** 409 Conflict semantically matches the situation: request is valid but cannot be processed due to conflict with existing state (running agent). 400 suggests malformed request. 403 suggests permission denied.
- **Rejected:** 400 Bad Request (wrong — request IS well-formed), 403 Forbidden (wrong — not a permission issue).
- **Breaking if changed:** Clients that check for '!= 409' to allow deletion will incorrectly skip safety check if code changes to use different status code.

### DiscordBotService.sendToChannel() returns boolean for success/failure rather than throwing exceptions (2026-02-12)

- **Context:** Hookable event system where Discord failure shouldn't block event processing. User-configured hooks are best-effort notifications.
- **Why:** Returning boolean for known failure states (channel not found, permissions) allows callers to decide response. Throwing only on unexpected errors preserves the distinction.
- **Breaking if changed:** If changed to throw on every failure, event processing could crash if Discord is unreachable. If changed to never throw, unexpected errors become silent.

### System prompt prepended (not replaced) when a role-specific prompt is provided to AgentService (2026-02-12, updated 2026-03-11)

- **Context:** AgentService accepts an optional systemPrompt override alongside the base session prompt. Role prompts from `@protolabsai/prompts` are prepended rather than replacing the base prompt. (Note: the dynamic AgentTemplate/RoleRegistryService system was removed in commit 2a1563ca — role prompts are now hardcoded functions in `libs/prompts/src/agents/`.)
- **Why:** Prepending preserves existing system prompt semantics while adding role directives. Allows role context to augment, not override. Backward compatible.
- **Breaking if changed:** If changed to replacement, role-based agent executions would lose the original system prompt, breaking agents that rely on base directives.

#### [Gotcha] API method names are inconsistent across query hooks — getAll() vs list() vs status(). Must review existing hooks before implementing new data fetching to avoid using non-existent methods. (2026-02-12)

- **Situation:** Initially attempted to use api.features.list() and api.autoMode.getRunningAgents() which don't exist.
- **Root cause:** Codebase has organic growth with different naming conventions across different API endpoints. No centralized API spec or TypeScript types enforce consistency.
- **How to avoid:** Examine existing use-\*.ts hook files before implementing new API calls.

### Error handling in data fetching throws Error when API result.success is false, rather than returning error state directly (2026-02-12)

- **Context:** React Query's useQuery automatically wraps thrown errors in query.error state.
- **Why:** Consistent with React Query patterns — framework handles error state management. Component doesn't need to handle different error formats.
- **Breaking if changed:** If error throwing is replaced with return values, error state in components becomes undefined and errors are silently ignored.

### Preserved exact function signature and return type on extracted pure functions — no convenience wrappers or API envelope (2026-02-13)

- **Context:** Could have added convenience methods like researchRepoSync(), caching layer, filtering options, or { success, data, error } envelope.
- **Why:** Original function signature is already clean. Adding convenience layers now prevents future use cases. Single Responsibility: one function does one thing. Callers handle async/await themselves.
- **Breaking if changed:** If signature changes, all callers break. Future convenience features need new functions (researchRepoWithCache, etc.) not modifications to original.

#### [Gotcha] JSON output mode must be completely non-interactive (no prompts, no spinners, pure stdout) to work in CI/CD pipelines and automation contexts (2026-02-13)

- **Situation:** Created --json flag but initial implementation accidentally mixed in prompt logic when --json was set.
- **Root cause:** CI/CD pipelines and automation tools expect deterministic stdout they can parse. Any interactive prompt causes await to hang indefinitely. Spinners add ANSI codes that break JSON parsing.
- **How to avoid:** Explicit code path check: `if (options.json) { /* skip all interactive UX */ }`.

#### [Gotcha] Automaker server connectivity check must happen LATE in validation pipeline, not early (2026-02-13)

- **Situation:** CLI checks Automaker server availability. Initial placement was early (right after environment checks).
- **Root cause:** Automaker server may not be running yet. Checking early produces false-positive FATAL errors. Checking late (before CI/CD phase): if server down, only that phase fails (RECOVERABLE).
- **How to avoid:** Structure CLI phases so server-dependent steps are late, after local environment validation completes.

#### [Gotcha] Discord rate limiting (429) requires retry-after header parsing AND exponential backoff fallback (2026-02-13)

- **Situation:** Initial implementation only checked for retry-after header; discovered that missing header still causes 429s on rapid requests.
- **Root cause:** Discord's rate limiting is endpoint-specific and bucket-based. retry-after header is not always present on 429 responses.
- **How to avoid:** Always implement both: `retry-after` header parsing + exponential backoff (2^attempt) as safety net.

#### [Pattern] Return status objects {success: boolean, error?: string, data?: T} from phase functions instead of throwing (2026-02-13)

- **Problem solved:** CLI workflows need to continue through failed phases (e.g., create project even if Discord setup fails).
- **Why this works:** Throwing exceptions halts the pipeline; status objects allow caller to decide retry/skip/abort logic.
- **Trade-offs:** Every caller must check success flag (verbose), but caller controls error handling strategy.

### Prompt for guild ID interactively when not provided, rather than making it a required flag (2026-02-13)

- **Context:** Discord phase accepts --guild-id flag but also prompts user if missing; creates dual-path UX.
- **Why:** Balances CLI flexibility (automation via --guild-id) with usability (interactive discovery for new users).
- **Breaking if changed:** Removing interactive prompt breaks manual users; removing flag breaks automation.

#### [Pattern] Each provider implements graceful credential validation with clear error messages and installation URLs, allowing tests and CLI tools to skip functionality rather than hard-fail (2026-02-13)

- **Problem solved:** Three providers with different credential requirements: Groq (API key), Ollama (running service), Bedrock (AWS credentials + region).
- **Why this works:** Prevents hard failures in CI/local dev when optional providers aren't configured. Users can choose to configure only providers they need.
- **Trade-offs:** Tests must explicitly check for 'skipped' status rather than assuming availability.

#### [Gotcha] GitHub API pagination: listing PR review threads returns max 100 items per page. PRs with >100 threads silently drop threads without pagination (2026-02-10)

- **Situation:** GraphQL query fetches review threads with `first: 100`. PRs with >100 threads lose threads beyond the page limit.
- **Root cause:** GitHub GraphQL requires explicit cursor-based pagination. There's no way to fetch all items without implementing pagination loop.
- **How to avoid:** For most PRs, 100 threads is sufficient. Add `pageInfo { hasNextPage, endCursor }` to query and implement pagination loop if thread count regularly exceeds 100.

#### [Pattern] getServerUrl() implements strict precedence: localStorage override > cached value > environment variable. The precedence order is non-configurable and critical. (2026-03-11)

- **Problem solved:** Resolving multiple server URL sources with different specificity levels
- **Why this works:** Precedence chain implements proper specificity: user intent (override) > transient state (cache) > static config (env). Prevents static config from shadowing user choice.
- **Trade-offs:** Gained: Clean override semantics without code changes. Lost: Hidden state machine - source of truth is precedence-dependent, complicates debugging

#### [Pattern] Activation deactivates on any space in input (`!input.includes(' ')`), limiting to single-word search queries (2026-03-11)

- **Problem solved:** Need simple rule to detect slash-command mode vs regular text input
- **Why this works:** Simple binary check; avoids complex command parsing logic. Prevents confusion between `/command arg1 arg2` (command execution) vs `/quer` (autocomplete search)
- **Trade-offs:** Simpler activation logic vs limited search capability (can't search multi-word command names like 'Create New File'); clear UX boundary

#### [Gotcha] Case-insensitive filtering requires toLowerCase() on both query and field, but natural include() is case-sensitive (2026-03-11)

- **Situation:** Spec requires 'case-insensitive substring match' but naive implementation would use case-sensitive includes()
- **Root cause:** JavaScript's includes() is case-sensitive; case-insensitive search requires normalizing both sides to same case
- **How to avoid:** toLowerCase() on every filter call is cheap; adds minimal complexity; regex alternative more powerful but harder to read and maintain

#### [Pattern] getServerUrl() uses explicit precedence chain: override → env var → window.location.origin, not boolean flags or computed defaults (2026-03-11)

- **Problem solved:** Multiple sources of server URL truth: user selection (override), deployment config (env), browser location. Need predictable resolution.
- **Why this works:** Explicit chain makes precedence obvious and testable. User's explicit choice wins, deployment config is fallback, browser is last resort.
- **Trade-offs:** Flat chain is less DRY than config object, but more readable and harder to get wrong

### Hook result mapped through normalizer before passing to ChatInput: extracts {name, description, source, argHint} only (2026-03-11)

- **Context:** useSlashCommands returns SlashCommand with internal structure; ChatInput receives UseSlashCommandsResult with normalized subset
- **Why:** Decouples ChatInput from hook's internal structure. ChatInput only needs to know what it displays (name, description, etc.). If hook internals change, ChatInput remains unaffected. Contract is explicit via UseSlashCommandsResult type.
- **Rejected:** Passing raw hook commands directly to ChatInput; exporting full SlashCommand type through the boundary
- **Trade-offs:** One-line map() adds minimal overhead, but enforces encapsulation. Prevents accidental coupling to hook internals. Adding new display property requires explicit map update (good: catches intent).
- **Breaking if changed:** Removing the map and passing raw commands tightly couples ChatInput to hook's SlashCommand shape. Hook refactors could break ChatInput unexpectedly.

### Renamed CrdtFeatureEvent to CrdtSyncWireMessage to match semantic meaning (type carries all wire messages: project events, settings events, etc., not just feature events) (2026-03-12)

- **Context:** Type was used for generic wire message transport, but name incorrectly suggested it only carried feature events
- **Why:** Accurate type names prevent future developer confusion about what the type represents; mis-named types lead to incorrect assumptions and bugs
- **Rejected:** Keeping name CrdtFeatureEvent and adding a clarifying JSDoc comment (less effective for IDE autocomplete and code reading)
- **Trade-offs:** Small refactoring effort in crdt-sync-service and exports; caught by TypeScript at compile time so no runtime risk
- **Breaking if changed:** External consumers of the exported CrdtSyncWireMessage type must update imports (hard breaking change at type boundary)

### Preserved PROTO_HIVE_INSTANCE_ID env var with semantic redirect: now sets protolab.instanceId instead of hive.instanceId. No removal of the env var. (2026-03-12)

- **Context:** Env var still referenced in deployments/scripts; removing it would break existing workflows
- **Why:** Backward compatibility with production deployments that set PROTO_HIVE_INSTANCE_ID; maintains external contracts while internally consolidating identity resolution
- **Rejected:** Remove env var entirely (breaks existing deployments); add parallel env var (confusing, multiple sources of truth)
- **Trade-offs:** Easier upgrade path for existing deployments; adds one indirect mapping in applyEnvOverrides() but self-documents intent
- **Breaking if changed:** If code checks specifically for hive.instanceId being set, it will see undefined; but if code just reads instanceId from anywhere, the env var still works via protolab

### Unauthenticated observability endpoints (health, logs, metrics) should be registered before auth middleware within the main router (createHealthRoutes), not as separate unprotected routes, to keep semantically-related endpoints colocated (2026-03-12)

- **Context:** MCP tool needs to call /api/health/log-path without credentials for debugging when auth might be broken; needed to decide placement within routing structure
- **Why:** Observability must work even when auth is broken (you need to read logs to debug auth problems); createHealthRoutes() is semantically correct place for system-level endpoints; keeps health-related logic together
- **Rejected:** Could create separate /api/unauth/ prefix (less semantic, splits system concerns); could require auth (defeats purpose of log-reading tool for debugging)
- **Trade-offs:** Unauthenticated endpoints expand attack surface slightly, but gain is significant (self-diagnostics always work); middleware ordering becomes important implementation detail
- **Breaking if changed:** If someone adds auth middleware before health route registration, tool breaks even when server is up

#### [Gotcha] Must use events.broadcast() not events.emit() to trigger remote sync via event bridge (2026-03-12)

- **Situation:** Categories route broadcasts 'categories:updated' to trigger local file write AND cross-instance propagation
- **Root cause:** setRemoteBroadcaster only intercepts broadcast() calls; emit() would only trigger local listeners and skip remote forwarding
- **How to avoid:** broadcast() adds indirection/naming confusion; gained deterministic remote propagation without explicit socket code

#### [Pattern] Callback injection pattern: functions accept optional callback types (MemoryStatsCrdtWriter, MemoryStatsAggregateReader) instead of requiring CRDT store injection. Existing callers work unchanged; new callers opt-in. (2026-03-12)

- **Problem solved:** Adding CRDT tracking to memory-loader utilities without breaking existing code paths. Need backwards compatibility in monorepo with many call sites.
- **Why this works:** Gradual adoption: callers like auto-mode-service can pass callbacks when available; other callers (existing, or those without CRDT context) don't pass them. No big-bang refactoring.
- **Trade-offs:** Optional callbacks: low friction adoption vs caller must know to pass them to get CRDT benefit. Type-safe callback params vs implicit dependency.


#### [Gotcha] getResearchMdPath duplicates getResearchFilePath functionality — both return identical path (.automaker/projects/{slug}/research.md). Two functions, one return value. (2026-03-13)
- **Situation:** Added getResearchMdPath as a 'more descriptive name' for research path access, but identical function already exists as getResearchFilePath.
- **Root cause:** Unclear naming convention or API design — suggests ambiguity about which function callers should use going forward.
- **How to avoid:** Easier to find via both names (discoverability) but harder to maintain — both must be updated if path convention changes. Creates decision fatigue for API consumers.

#### [Gotcha] Research route must be registered BEFORE the lifecycle sub-router in Express. Registering after the sub-router causes Express to match the sub-router first and the specific route never executes. (2026-03-13)
- **Situation:** Express matches routes in registration order. Sub-routers like /lifecycle catch all /lifecycle/* requests if registered first.
- **Root cause:** Express routing is sequential. More specific routes must come before less specific ones (sub-routers). Reverse order means POST /lifecycle/research gets caught by router.use('/lifecycle', ...) handler.
- **How to avoid:** Easier: clear route priority. Harder: route registration order becomes a hidden dependency.

#### [Pattern] Establish projectSlug as the canonical key for locating project-scoped research artifacts (2026-03-13)
- **Problem solved:** Research.md lookup gated on feature.projectSlug existence; path resolution via getResearchFilePath(projectPath, projectSlug)
- **Why this works:** Creates a simple 1:1 convention for artifact discovery; avoids ID-based lookups or dynamic path resolution
- **Trade-offs:** Slug-based is human-readable and versioning-stable, but assumes research always co-located with project; refactoring if research moves to centralized store

#### [Gotcha] POST /api/projects/lifecycle/initiate returns localSlug (not project.slug) for post-creation navigation. Returns field name is non-intuitive. (2026-03-13)
- **Situation:** Navigation after project creation requires the new project's path. Endpoint documentation/naming unclear about return value.
- **Root cause:** Server-side design choice - localSlug is auto-generated from title. Full project slug may not be available yet or requires additional processing.
- **How to avoid:** Gain: unique URL-safe identifier immediately available. Loss: developer must discover localSlug vs slug distinction.

#### [Pattern] Event enrichment pattern: TimelineEvent interface extended with optional ceremony-specific fields (`ceremonyLabel?`, `artifactUrl?`) rather than creating separate ceremony event type. (2026-03-13)
- **Problem solved:** Need to add ceremony-specific metadata (labels, artifact URLs) to timeline events without fragmenting event type system.
- **Why this works:** Single TimelineEvent type for all timeline entries. Optional fields make it extensible for future enrichment without creating subtype explosion.
- **Trade-offs:** TimelineEvent becomes less semantically pure but more pragmatic. UI must handle optional fields, but avoids discriminated union complexity.

#### [Gotcha] Fields with code-level defaults (e.g., empty string) should be marked Optional in API documentation, not Required. Technical optionality (has default) takes precedence over semantic intent (logically important). (2026-03-14)
- **Situation:** `description` field defaulted to empty string in code but was documented as Required
- **Root cause:** Documentation documents actual API contract, not developer intent. Readers use Required/Optional to determine if they must provide a value; code defaults override that choice.
- **How to avoid:** More honest docs are less prescriptive; accepts that optional fields may be important conceptually but aren't enforced

#### [Gotcha] Algorithmic behavior (confidence normalization formula: `rawScore / (rawScore + 10)`) was implemented in ExecutionService but never surfaced in API documentation, making the scoring system behavior opaque to API consumers. (2026-03-14)
- **Situation:** The `/api/agents/match` endpoint returns a confidence score, but the formula that produces asymptotic confidence values (never reaching 1.0) was code-only knowledge.
- **Root cause:** Implementation details and mathematical algorithms are often not explicitly translated to API contracts, treating them as internal concerns rather than contractual guarantees.
- **How to avoid:** Faster implementation (algorithm details are internal) vs. predictable API behavior (users understand confidence ceilings and can reason about scoring).

#### [Pattern] Required reading implementation code (agents.ts, execution-service.ts, feature-scheduler.ts) to discover actual API response schemas because documentation had drifted. This indicates a code-as-source-of-truth pattern rather than docs-first contracts. (2026-03-14)
- **Problem solved:** Three response schema gaps (missing `confidence`, missing `projectPath`, undocumented `routingSuggestion` shape) were discovered by comparing code output against docs.
- **Why this works:** API behavior evolves incrementally during feature work; documentation updates are separate tasks, so drift accumulates over time.
- **Trade-offs:** Faster iteration without doc-first overhead vs. higher confidence that docs match implementation. Currently trading correctness for velocity.

### New optional fields (`projectPath`, `confidence`) were added to existing API responses without explicit versioning or deprecation markers. Clients cannot determine if a field is guaranteed to exist or conditionally added. (2026-03-14)
- **Context:** The `/api/agents/list` gained `projectPath` and `/api/agents/match` gained `confidence`, but without API versioning (e.g., `/v2/`) or response schema versioning.
- **Why:** Backwards compatibility is maintained (old clients ignore new fields); requires no migration burden. Pragmatic choice for rapid iteration.
- **Rejected:** API versioning (`/api/v2/agents/match`) or explicit schema versioning (responses include `_schema: '2024-03'`) would make field presence contracts explicit.
- **Trade-offs:** Simpler deployment (no versioning overhead) vs. clarity (clients can't know if fields are required or optional without reading code).
- **Breaking if changed:** Clients using strict schema validation or depending on absence of fields (e.g., `Object.keys() === ['success', 'agent']`) would break silently when fields are added.

#### [Pattern] Response includes 'via' field showing resolution strategy per feature (milestoneSlug, epicMilestoneSlug, alreadySet, or skipped) (2026-03-14)
- **Problem solved:** Multiple resolution paths exist. Clients/ops need to audit which strategy worked for each feature to debug wrong resolutions
- **Why this works:** Transparency enables post-hoc validation, debugging, and audit trails. If a feature resolves to wrong project, 'via' immediately shows which strategy was used
- **Trade-offs:** Easier: debug and audit. Harder: response more verbose; clients must understand multi-strategy logic

#### [Gotcha] `updateProjectSettings(Partial<ProjectSettings>)` does shallow merge, but nested `workflow` object requires deep merge. Manually destructuring and casting `as ProjectSettings['workflow']` is required to preserve sibling properties in agentConfig. (2026-03-14)
- **Situation:** Attempted direct nested object spread in updateProjectSettings call. TypeScript complained because partial merge doesn't capture full type constraints of nested object.
- **Root cause:** Shallow merge API is simpler and faster than deep merge, but callers must handle nested updates themselves. Cast signals type safety at the point of merge, not in the API.
- **How to avoid:** Shallow merge keeps API simple and predictable; callers explicitly control merge depth. Extra destructuring code per nested update.

#### [Pattern] Implemented fallback chain for agent prompt resolution: manifest `promptFile` > settings `rolePromptOverrides` > none. Fallback evaluated at execution time in `loadRolePromptPrefix()`, not at config time. (2026-03-14)
- **Problem solved:** Unifying two competing systems (manifest-defined prompts, settings-defined overrides) without breaking either source
- **Why this works:** Manifest has single source of truth; overrides allow runtime customization without code changes. Checking manifest first preserves intent of code; fallback to settings enables local experimentation. Evaluated at execution time allows settings changes without restart.
- **Trade-offs:** Runtime lookup cost; flexible override capability. Layered precedence may confuse when both exist (which one wins?).

#### [Pattern] UI already sends `projectPath` as a query parameter to the timeline endpoint, enabling the fallback to load features without requiring client-side changes. (2026-03-14)
- **Problem solved:** Feature implementation discovered UI was already structured correctly.
- **Why this works:** Indicates the original API design was extensible—endpoint accepted parameters for future use. Enables this fallback to work as a pure backend change.
- **Trade-offs:** Good forward design at cost of carrying unused parameters early. Paid off here.

### Wrap the `git diff --name-only --diff-filter=U` capture in try/catch rather than letting failures propagate. Conflicting file capture is best-effort and non-critical to the happy path. (2026-03-14)
- **Context:** If git diff fails for any reason during conflict handling, the code should still successfully abort the merge and transition to blocked state.
- **Why:** Conflict handling is already in an error path. If the operation to capture which files conflicted fails, that shouldn't prevent us from safely aborting and blocking the feature. Best-effort data enrichment shouldn't break the core operation.
- **Rejected:** Alternative: Let git diff exceptions propagate and crash the feature transition. Rejected: would make the system fragile to unexpected git states.
- **Trade-offs:** Easier: robust error handling. Harder: developers might not see which files conflicted if git diff fails (though the conflict itself is still blocked).
- **Breaking if changed:** Removing the try/catch would make a git diff failure during conflict handling crash the entire feature execution, leaving the system in an undefined state.