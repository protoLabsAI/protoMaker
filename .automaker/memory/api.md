---
tags: [api]
summary: api implementation decisions and patterns
relevantTo: [api]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 577
  referenced: 170
  successfulFeatures: 170
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

- **Situation:** Express matches routes in registration order. Sub-routers like /lifecycle catch all /lifecycle/\* requests if registered first.
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

#### [Gotcha] Service method getResolvedCapabilities() has an undocumented constraint: it only searches the project manifest. Its name suggests it 'resolves' all agent capabilities, but internally calls getAgent() which has this manifest-only limitation. (2026-03-13)

- **Situation:** Caller at route layer assumed the method would return capabilities for any agent that listAgents() could find, but that assumption violated for synthetic agents.
- **Root cause:** Method naming is optimistic ('Resolved') without surfacing the implementation detail of what sources it searches. No type or error signal distinguishes manifest hits from manifest misses.
- **How to avoid:** Current approach has simpler signature but hides important contract details. Explicit approach would be noisier but prevent assumptions about coverage.

### Made \_builtIn an optional, API-layer-only field on ProjectAgent type. Never appears in user-authored manifests. Explicitly documented in JSDoc. (2026-03-13)

- **Context:** Need to track whether an agent is built-in (system-provided) vs. user-defined, but this should not be an editable field in user manifests.
- **Why:** Separates concerns: type documents reality and responsibility boundary. API layer is responsible for populating this flag when returning built-in agents. Users should never attempt to set this field. Using an optional field signals 'computed by API, not by user'.
- **Rejected:** Making it required or allowing it in user manifests would blur the line between 'what the system considers built-in' (API responsibility) and 'what the user claims is built-in' (user action). Rejected putting it in manifest parsing logic.
- **Trade-offs:** Optional field means implicit contract that API must set it; no compile-time enforcement. Gains clarity about responsibility boundaries at cost of runtime discipline.
- **Breaking if changed:** If this field is removed, the type loses ability to explicitly track built-in status at the API boundary. Code would revert to unsafe casts like 'as unknown as ProjectAgent[]' to satisfy the type system.

### Exposed confidence as a sibling field to agent in API response ({agent, confidence}) instead of nesting it (agent.confidence or {agent: {..., confidence}}). (2026-03-13)

- **Context:** The routes/agents.ts endpoint needed to reflect the new MatchResult structure when returning the match result to clients.
- **Why:** Flat structure makes confidence discoverable in API schema documentation and easier for clients to destructure. Separating agent and confidence fields mirrors the internal MatchResult type structure, reducing impedance mismatch.
- **Rejected:** Nested under agent object (agent.confidence) - couples confidence lifecycle to agent object, harder to version separately. Alternative: confidence as optional field on agent at call-site (agent?.confidence ?? null) - less explicit about what changed in the API.
- **Trade-offs:** Slightly flatter API surface (one more top-level field), but clearer separation of concerns between agent identity and quality metric.
- **Breaking if changed:** Clients expecting agent to be a bare ProjectAgent object with no confidence field will work (no field removed), but new clients expect separate confidence field to exist.

#### [Pattern] Error boundaries at both ToolRegistry level and individual tool execution level; defineSharedTool and adapter calls never throw, always return structured ToolResult<TOutput> with error envelope (2026-03-15)

- **Problem solved:** Adapters must work reliably in async production environments (MCP servers, LangGraph workflows, Express handlers) where exceptions crash entire process or workflow
- **Why this works:** Predictable error handling guarantees caller always receives structured response (success | error), never surprise exceptions. Enables retry logic, error recovery, and audit logging at call sites without try/catch nesting. Critical for long-running services.
- **Trade-offs:** Callers must check ToolResult.error field instead of catching exceptions. More verbose at call site. Improved reliability: no crashed processes, errors logged in structured format, easier to route errors to observability systems (Langfuse, DataDog).

#### [Pattern] ToolRegistry wraps tools in Anthropic format conversion layer (toAnthropicTool, getAnthropicTools) instead of storing tools in Anthropic format directly (2026-03-15)

- **Problem solved:** Tools are stored in an internal format (defineSharedTool shape) and converted on-demand to Anthropic SDK format
- **Why this works:** Decouples tool definitions from Anthropic SDK specifics. Registry is AI-model-agnostic; conversion layer adapts to whichever SDK is needed. Allows tools to be reused with OpenAI, Anthropic, custom APIs.
- **Trade-offs:** Clean architecture and reusability. Cost: extra conversion step on every tool invocation; need to maintain two schemas.

#### [Gotcha] Type names changed between major versions: CoreMessage → ModelMessage. This is a breaking change that requires code updates but is silent (no runtime error until used). (2026-03-15)

- **Situation:** Upgrading from ai v4 to v6 and @ai-sdk/anthropic v1 to v3
- **Root cause:** Type renames are compiler-caught but invisible at runtime. Easy to miss if you only scan error logs.
- **How to avoid:** Requires careful code review of type signatures; catches errors early via typecheck

### Tool definitions require `inputSchema` (not `parameters`) in v6+. This is a property name change in the tool() factory function. (2026-03-15)

- **Context:** Migrating tool definitions to match new AI SDK API contract
- **Why:** Semantic clarity: inputSchema better describes what the property is (a Zod schema defining inputs). Parameters is ambiguous.
- **Rejected:** Keeping `parameters` property name from v4
- **Trade-offs:** More explicit intent; requires boilerplate updates across all tool definitions; tooling can auto-migrate
- **Breaking if changed:** Tools defined with `parameters` will silently fail—no compile error, but the property is ignored at runtime, causing tool execution failures

### Coordinate dependency version bumps: ai@^6, @ai-sdk/anthropic@^3, zod@^4 must align. Cannot upgrade ai alone. (2026-03-15)

- **Context:** Moving to Vercel AI SDK v6 which has breaking changes across multiple packages
- **Why:** Type definitions in ai depend on @ai-sdk/anthropic and zod versions. Mismatches cause type errors even if packages are installed.
- **Rejected:** Upgrading ai@^6 without bumping @ai-sdk/anthropic (would fail at typecheck)
- **Trade-offs:** Requires coordinated testing across multiple packages; safer than piecemeal upgrades because you catch type mismatches early
- **Breaking if changed:** Mismatched versions cause cryptic TypeScript errors like 'type ToolResult is not assignable to type ToolResult' (same name, different shape from different package versions)

#### [Pattern] Async-generator wrapper for `wrapProviderWithTracing` enables transparent streaming support that promise-only wrappers cannot achieve (2026-03-15)

- **Problem solved:** LLM providers return async iterables (for streaming). Middleware must intercept tokens without buffering entire response.
- **Why this works:** Async generators allow yielding each token as it arrives while capturing metadata. Promise wrappers would require buffering entire response before completion, defeating streaming benefits. This pattern preserves the streaming contract.
- **Trade-offs:** Async-generator syntax is less familiar than promises, but enables correct streaming behavior. Slightly higher cognitive load for maintenance.

### Use Set<string> for tracking confirmation-required tool names instead of Map<name, tool> or boolean flags on tool objects (2026-03-15)

- **Context:** Need fast membership test (toolRequiresConfirmation(name)) and listing (getConfirmationRequiredTools()) of confirmation gates
- **Why:** Set provides O(1) lookups via has() and clear intent (this is a membership set, not a store). No need to re-store the tool object. Prevents duplicates automatically.
- **Rejected:** Map<string, Tool> stores redundant data; boolean flags on tools require scanning all tools; array requires O(n) lookup
- **Trade-offs:** Simple and fast but creates coupling: registerTool() must be the _only_ way to register confirmation requirements, else tracking desynchronizes
- **Breaking if changed:** If tools are registered outside registerTool(), confirmation flags won't be tracked in the Set, causing inconsistent behavior

#### [Pattern] broadcastProgress() is a no-op when no WS server running (clients.size === 0 short-circuit) (2026-03-15)

- **Problem solved:** Tools must work whether sideband is enabled or not; chat must never depend on WS availability
- **Why this works:** Makes sideband truly optional: tool code calls emit/broadcast unconditionally, infrastructure silently ignores when offline. No conditional logic needed in tools or routes. Ensures backward compatibility.
- **Trade-offs:** Silent failure easier to debug than optional checks scattered across tools; cost is one null check per broadcast

#### [Pattern] Call flush() at end of tool execute() to guarantee final progress message delivery before tool result reaches model (2026-03-15)

- **Problem solved:** Progress updates are rate-limited; tool completes and returns result to model potentially before last update sent
- **Why this works:** Rate limiting creates a pending event that fires after the window. If tool returns before window expires, client never sees final progress. flush() forces it out immediately. Ensures causal ordering: progress → result.
- **Trade-offs:** Adds explicit call at end of every long-running tool (small friction), but guarantees correct ordering without blocking

#### [Gotcha] AI SDK v6 TypedToolResult uses 'output' field, not 'result'. This is a breaking API change from earlier versions. (2026-03-15)

- **Situation:** Mapping tool results from streamText callback in chat.ts failed TypeScript checks with field mismatch
- **Root cause:** AI SDK v6 standardized on 'output' field name across tool result types. Field mapping must match the actual SDK contract.
- **How to avoid:** Requires version-specific awareness; field rename helps consistency but breaks compatibility

### Cost estimation uses hardcoded pricing table for Claude, GPT-4o, and Gemini instead of dynamic pricing lookup. (2026-03-15)

- **Context:** Trace viewer needs to display estimated cost per step but pricing data is subject to change
- **Why:** Hardcoding simplifies template and works offline; pricing changes are infrequent enough for template context
- **Rejected:** API call to pricing service (adds latency, requires network); reading from config file (adds file dependency)
- **Trade-offs:** Pricing becomes stale as models/rates change; requires manual code updates; but zero runtime dependency
- **Breaking if changed:** New models not in table show $0 cost; old pricing in code misleads about actual spend

#### [Pattern] Bridge toolCallId (from AI SDK message format) to toolName (from tool definition) via useMemo memoization over messages array (2026-03-15)

- **Problem solved:** Progress events are keyed by toolName, but ChatMessage/ToolInvocationPart receives toolCallId. Need to match them for getToolProgressLabel callback.
- **Why this works:** Avoids rebuilding the mapping on every render. useMemo ensures stable reference when messages array is same object. Mapping changes only when messages actually change.
- **Trade-offs:** Gains: memoized stable reference, single rebuild per message change. Loses: if messages array is truncated or replaced, tool calls disappear from mapping → progress becomes undefined.

### Treat the exported TypeScript file (graph.ts) as the authoritative representation of the flow, not the in-memory visual graph state (2026-03-15)

- **Context:** The flow builder can save the graph to localStorage and export it as downloadable TypeScript. These can diverge if users edit locally but don't export.
- **Why:** The generated code is the runtime artifact users actually run. If visual state ≠ exported code, users run something they didn't design. Making the export authoritative enforces a 'design → export → deploy' workflow and ensures the generated code is always in sync with what users intend to run.
- **Rejected:** Treating localStorage as authoritative and regenerating exports on demand inverts control — the visual state becomes the source of truth, exports become ephemeral, and there's no single reference.
- **Trade-offs:** Users must export to persist their work to code. Unsaved edits in localStorage are lost if not exported. The workflow is more explicit but less automatic.
- **Breaking if changed:** Removing export capability eliminates the tool's purpose (code generation). Treating visual state as authoritative creates ambiguity about which representation is canonical.

### The expand() function intentionally returns a plain string, not a ModelMessage or message array. This string is prepended to the system prompt rather than modifying the messages array. The API endpoint returns only {name, description}, not expand logic. (2026-03-15)

- **Context:** Commands need to influence model behavior. Two approaches: (1) modify the messages array directly, or (2) modify the system prompt. API needs to tell client what commands exist.
- **Why:** System prompt expansion is simpler and more general — it works regardless of existing system content. Returning plain string from expand() keeps commands decoupled from message format changes. API returns metadata only because expand() functions are not JSON-serializable and represent server-side logic.
- **Rejected:** Inserting commands as a message object in the array (breaks if there's existing system context), or sending expand() logic to client (unmaintainable, leaks server logic).
- **Trade-offs:** Commands can only add instructions, not modify conversation state or message structure. This is simpler but less flexible for complex transformations.
- **Breaking if changed:** If commands need to modify message order, filter messages, or add new messages, this architecture breaks and needs redesign to use message array modification instead.

### Unrecognized placeholders preserved as {{key}} instead of stripped or throwing error (2026-03-15)

- **Context:** Template interpolation in PromptRegistry.createPromptFromTemplate()
- **Why:** Supports partial interpolation workflows and makes mistakes visible (missing variable shows up as {{unknown}} rather than silently disappearing)
- **Rejected:** Strip unknown placeholders — loses debugging signal. Throw error on unknown placeholder — breaks partial interpolation
- **Trade-offs:** Easier: debugging, flexible workflows. Harder: no compile-time check that all placeholders are provided
- **Breaking if changed:** If changed to strip, partial templates become silent failures; if changed to throw, any missing variable breaks the entire build

#### [Pattern] PromptBuilder uses priority-based section ordering (ascending) rather than insertion order (2026-03-15)

- **Problem solved:** Composing multi-section prompts where order matters (ROLE before TASK before CONTEXT)
- **Why this works:** Declarative composition: caller doesn't need to remember insertion order; priority is explicit and independent of addSection() call sequence. Easier to extend (add new sections without reordering code)
- **Trade-offs:** Easier: refactor-safe, declarative. Harder: must understand priority semantics; two sections can't have same priority without tiebreaker

### AgentRole interface has optional `defaultModel` field instead of required model selection (2026-03-15)

- **Context:** Some roles need model overrides, others can use server defaults. Chat route must propagate role systemPrompt to API call
- **Why:** Reduces coupling: not all roles need to dictate model choice. Allows server to have a sensible default while roles focus on system prompt definition. Simpler common case
- **Rejected:** Required defaultModel field (forces every role to specify model, increases verbosity); no model field at all (removes role-specific model flexibility)
- **Trade-offs:** Simpler role definitions, but chat handler must have fallback logic: `role.defaultModel ?? resolvedModelId`. Creates optional responsibility in consumer code
- **Breaking if changed:** If chat handler doesn't implement the fallback pattern, undefined defaultModel values will break. Contract is implicit, not enforced by types

### Both `GET /api/roles` (list) and `GET /api/roles/:id` (get-by-id) endpoints implemented, following traces.ts pattern (2026-03-15)

- **Context:** Feature spec emphasized list endpoint; `:id` endpoint included 'for free' by following existing pattern
- **Why:** List endpoint enables UI role dropdowns (all roles at once). Individual endpoint enables direct role fetching by ID without client-side filtering. Mirrors established API pattern in codebase
- **Rejected:** List-only endpoint (requires client to parse entire list to find one); no list endpoint (forces separate lookups)
- **Trade-offs:** Slightly more code but cleaner separation of concerns. Client code is simpler: can either list all roles or fetch one by ID independently
- **Breaking if changed:** If `:id` endpoint is removed, client code that calls `GET /api/roles/code-reviewer` will 404. Clients may have hard-coded ID endpoints for specific roles

### Extract variables from both YAML frontmatter AND inline {{placeholder}} patterns; merge both sources (2026-03-15)

- **Context:** Prompts need both declarative metadata (model, version) and dynamic placeholders within template text
- **Why:** Frontmatter handles structured config (model type, constraints); inline {{var}} allows natural template syntax within content. Dual sources let templates be both self-documenting and machine-readable.
- **Rejected:** Frontmatter only (loses template clarity); inline only (loses structured metadata)
- **Trade-offs:** Gained: flexibility in where metadata lives, templates are self-describing. Cost: must handle conflicts/precedence; variable discovery requires parsing both frontmatter and content
- **Breaking if changed:** Removing inline extraction forces all metadata into frontmatter (less readable); removing frontmatter loses structured config

#### [Pattern] SSE streaming response parsing with '0:' delta prefix convention for multi-chunk messages (2026-03-15)

- **Problem solved:** Chat test area streams responses; must handle partial tokens arriving as separate SSE events
- **Why this works:** SSE sends data events; '0:' prefix signals this is a token delta (vs control message). Allows multiplexing different message types over same stream.
- **Trade-offs:** Gained: compact format, easy streaming integration. Cost: must document prefix convention; parser needs two-level parsing (SSE envelope + prefix convention)

### Documentation for Claude Code/Desktop connection embedded in JSDoc header of index.ts rather than in separate README, because scope constraints limited files to src/index.ts and package.json only (2026-03-15)

- **Context:** Feature scope prevented creating documentation files, but users need to know how to configure their MCP client settings
- **Why:** JSDoc placement ensures documentation appears exactly where developers will look (hovering over imports/server initialization) and stays in-sync with code
- **Rejected:** Creating a README would exceed scope; no separate docs file means connection config lives nowhere accessible
- **Trade-offs:** Non-standard doc location (+harder to discover) but docs are discoverable via IDE hover and guaranteed to stay synchronized (+maintainability)
- **Breaking if changed:** If docs are moved to separate file and JSDoc removed, users relying on IDE tooltips or grep-ing the code would lose the connection instructions

#### [Pattern] Complete environment variable matrix including optional provider integrations (OPENAI_API_KEY, GOOGLE_API_KEY alongside ANTHROPIC_API_KEY) (2026-03-15)

- **Problem solved:** Starter template documents multi-model support but users can't discover it if env var options aren't enumerated
- **Why this works:** Optional env vars are invisible features — users who don't see them documented never realize they can swap providers
- **Trade-offs:** Slightly longer env vars table but eliminates a class of discovery problems

#### [Pattern] resolveVariable accepts optional VariableResolver callback instead of requiring React context or global state. Defers variable resolution logic to caller. (2026-03-15)

- **Problem solved:** Style utilities need to resolve $--variable references, but can't depend on UI layer (React context) without circular dependency
- **Why this works:** Inversion of control: parser stays independent, caller injects resolver at usage boundary. Enables both Node.js usage and browser-side context injection.
- **Trade-offs:** More flexible but requires caller to understand variable resolution semantics. Easier to test (mock resolver) but more boilerplate in practice.

#### [Pattern] Package name uses @@PROJECT_NAME-pen placeholder convention for starter kit customization. Find-replace during setup to project-specific name (e.g., my-design-system-pen). (2026-03-15)

- **Problem solved:** Starter kit needs to be forkable and namespaced to user's project without manual refactoring
- **Why this works:** Token replacement avoids hardcoded names, enables one-command setup, preserves semantic meaning. @@ prefix makes it visually distinct and grep-safe.
- **Trade-offs:** Find-replace is manual but explicit. Avoids automation overhead for one-time setup.

### Package.json exports configured as granular subpaths: `./css-generator`, `./html-generator`. Consumers import only what they need. (2026-03-15)

- **Context:** Enabling tree-shaking and reducing bundle size for consumers using only one generator
- **Why:** Named exports with conditional subpath entry points let bundlers eliminate unused code. Reduces final bundle if consumer only needs CSS or only needs HTML generation.
- **Rejected:** Single main entry point re-exporting all generators. Default export with side-effects.
- **Trade-offs:** Consumers must know exact subpath names (less discoverable), but bundlers can fully tree-shake unused generators
- **Breaking if changed:** Removing subpath exports forces bundlers to include all generators even if only one is used—bundle size increases for selective consumers

### Bidirectional path ↔ CSS-var converters (pathToCSSVar + cssVarToPath) instead of unidirectional (2026-03-15)

- **Context:** System must convert between dot-notation paths (color.brand.primary) and CSS variable names (--color-brand-primary) in both directions
- **Why:** Enables round-trip validation (convert → inverse → original and assert equality); supports reverse lookups (CSS var → path for validation); avoids forcing consumers to choose which direction to optimize for
- **Rejected:** Unidirectional only — consumers would build parallel reverse maps or implement lossy reverse conversion themselves
- **Trade-offs:** Two small functions (minor code cost) but enables validation patterns and better ergonomics
- **Breaking if changed:** Removing reverse converter forces consumers to maintain parallel lookup structures or lose ability to validate token resolution

### Semantic token naming: `--color-{role}-{variant}` (e.g., `--color-primary`, `--color-primary-foreground`, `--color-primary-hover`). Variants derive from semantic meaning, not shade numbers. (2026-03-15)

- **Context:** Design system must provide tokens that components use without knowing underlying colors. Components need role + variant to reference correct token.
- **Why:** Semantic naming decouples component styling from color implementation. Component says 'use primary color' not 'use shade 500'. Enables theme switching. Variants (foreground, hover, active) match component interaction patterns.
- **Rejected:** Shade-based naming `--color-violet-500` (couples component to color, theme switching harder). Flat palette `--color-0, --color-1, ...` (no semantic meaning).
- **Trade-offs:** More tokens (~49) but far more maintainable. Component code is clearer (`bg-primary` vs `bg-violet-500`). Theme switching is one config change.
- **Breaking if changed:** Changing token structure breaks all component selectors. Renaming variants requires component refactor. This is the API contract of the design system.

#### [Gotcha] Scaffold route validation list can become stale in documentation when new kit types are added. The allowlist is enforced server-side but memory/docs cite the list explicitly. (2026-03-15)

- **Situation:** ai-agent-app was added to validation list in PR #2651, but memory entry still cited old list ['docs','portfolio','general','my-kit'].
- **Root cause:** Hardcoding validation list in docs creates a single-source-of-truth problem. The real list lives in code; docs/memory are secondary sources that drift.
- **How to avoid:** Explicit list in docs is clear but requires synchronization when new kits are added. Code-reference requires jumping to source but stays current.

#### [Pattern] Markdown-based code block parsing (=== FILE: <name>.tsx === + ` ` delimiters) as contract between Claude system prompt and refinement parser (2026-03-15)

- **Problem solved:** Claude must return refined components in a machine-readable format that the refine() method can extract and write back to disk
- **Why this works:** Markdown is Claude-native and human-readable. Format is defined in the system prompt (`implement.md`), making the contract explicit and auditable
- **Trade-offs:** Easier: prompt controls format, parser is simple regex. Harder: fragile if Claude drifts format; no validation that file block contains valid code

### Chosen inline mock audit pattern in a11y-agent.ts; deleted separate a11y-audit-bridge.ts file. Mock code lives directly in agent alongside agentic tools. (2026-03-15)

- **Context:** Initial design had bridge abstraction for mock axe audit; later consolidated to inline pattern
- **Why:** Inline pattern reduces indirection, keeps agent self-contained, simpler mental model for consumers. Bridge file added complexity without reuse benefit.
- **Rejected:** Keep bridge file abstraction — cleaner separation but unnecessary indirection if mock only used by agent
- **Trade-offs:** Less modular but more maintainable. Agent is now single read-through unit.
- **Breaking if changed:** If mock audit needs reuse in other packages, would require extracting back to bridge file or new package

#### [Pattern] Include CSS variable resolution in contrast checking tools — resolve variable references against generated token map before calculating contrast ratios (2026-03-15)

- **Problem solved:** Agent tools must reason about actual visual properties; unresolved CSS variables are opaque to contrast calculation
- **Why this works:** WCAG contrast is calculated on resolved colors; agent must verify that variable-based color pairs meet standards when resolved at runtime
- **Trade-offs:** Requires maintaining token map in tool memory but enables agent to catch contrast failures that only appear in resolved theme contexts

#### [Pattern] Category auto-inference from component name using regex patterns (e.g., Button→atom, CardFooter→molecule, PageLayout→page) with explicit override option (2026-03-15)

- **Problem solved:** populateFromGenerated() needs to infer atomic category for auto-registered components without caller specifying it
- **Why this works:** Reduces boilerplate in bulk registration (codegen workflow). Naming conventions already encode intent; reuse that signal.
- **Trade-offs:** Convenience in 80% case vs maintenance burden if naming conventions drift. Must document inference rules as first-class constraints.

### Duplicate registration silently returns false/skipped rather than throwing error (2026-03-15)

- **Context:** register() and registerMany() APIs need to handle re-registration scenarios (e.g., loading multiple config files, retry workflows)
- **Why:** Makes bulk operations idempotent. Caller can safely merge multiple component sources without guarding against duplicates.
- **Rejected:** Throw on duplicate (defensive but fails entire batch operation), or overwrite silently (data loss risk)
- **Trade-offs:** Idempotent and composable vs obscures intent—caller must actively check return value to know if registration succeeded
- **Breaking if changed:** Callers expecting exceptions for duplicates will not detect failed registrations. Requires explicit `if (!added)` checks in production code.

#### [Gotcha] Tag search uses AND logic (component must have ALL specified tags), not OR (2026-03-15)

- **Situation:** search({ tags: ['interactive', 'navigation'] }) filters for components tagged with both, not either
- **Root cause:** Enables precise multi-attribute filtering for specific component combinations (e.g., interactive widgets + navigation use only)
- **How to avoid:** More expressive queries but counter-intuitive—most developers expect OR by default
