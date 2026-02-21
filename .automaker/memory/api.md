---
tags: [api]
summary: api implementation decisions and patterns
relevantTo: [api]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 65
  referenced: 39
  successfulFeatures: 39
---
# api

### Using GitHub GraphQL API with resolveReviewThread mutation rather than REST API for thread resolution (2026-02-10)
- **Context:** Need to fetch thread list and resolve threads programmatically
- **Why:** GraphQL provides single query to fetch all thread data with author info (needed to filter bots). Native `resolveReviewThread` mutation is more reliable than trying to construct REST endpoints. Better performance than N+1 REST calls (fetch all threads, then resolve each one)
- **Rejected:** REST API - no single endpoint for bulk thread operations. Would require: fetch threads via REST, filter locally, then resolve each via separate REST call
- **Trade-offs:** Easier: single round-trip, native mutation. Harder: requires GraphQL query knowledge, `gh api` graphql syntax
- **Breaking if changed:** If switched back to REST API, would need to restructure as multiple sequential calls and handle pagination manually

### mergePR() call passes waitForCI: true by default (from settings), causing merge to block until CI checks complete (2026-02-10)
- **Context:** Merge should only happen when CI passes. GitHub branch protection requires status checks to pass before merge. Implementation needed to respect pending checks.
- **Why:** Avoids race condition where merge executes before CI finish. GitHub API will reject merge if checks aren't done - blocking the caller. waitForCI:true polls GitHub and waits.
- **Rejected:** Alternative: Always merge immediately without waiting. GitHub API rejects the request if checks pending. Merge fails, feature gets marked blocked, retry needed.
- **Trade-offs:** Easier: Single mergePR() call handles complete flow. Harder: Blocks until CI completes (could be minutes), increases EM agent execution time.
- **Breaking if changed:** If waitForCI is hardcoded false, merge frequently fails due to pending checks. Features marked blocked incorrectly (not a real block, just timing). Retry logic becomes mandatory.

### Use 409 Conflict for 'cannot delete worktree because agent is running' rather than 400 Bad Request or 403 Forbidden. (2026-02-10)
- **Context:** DELETE /api/worktree/delete route needed to distinguish between invalid input vs. resource conflict.
- **Why:** 409 Conflict semantically matches the situation: client request is valid but cannot be processed because of a conflict with existing state (running agent). 400 suggests malformed request. 403 suggests permission denied. 409 is RFC-correct for 'operation conflicts with current state'.
- **Rejected:** 400 Bad Request - wrong because the request IS well-formed. 403 Forbidden - wrong because it's not a permission issue, it's a state conflict. 423 Locked - less common, doesn't convey the reason clearly.
- **Trade-offs:** Client must understand 409 semantics to handle it properly (current state conflict, not client error). More precise HTTP semantics = better for API consumers and debugging.
- **Breaking if changed:** Clients that check for 'not 409' to allow deletion will incorrectly skip safety check if code changes to use different status code.

#### [Gotcha] DiscordBotService.sendToChannel() returns boolean, not DiscordOperationResult. Error handling requires wrapping the method or adding explicit error logging. (2026-02-12)
- **Situation:** Replacing discordService.sendMessage() (which returned detailed DiscordOperationResult with status, error, attempt info) with discordBotService.sendToChannel() (which returns simple boolean) loses detailed error information.
- **Root cause:** DiscordBotService is simpler and more focused - it either sends or doesn't. The complexity of DiscordOperationResult was more relevant for the stub service's retry logic.
- **How to avoid:** Simpler return value and cleaner call sites, but less visibility into why Discord posting failed. Mitigation: Any failures are logged inside DiscordBotService, not in the caller.

#### [Pattern] Flattened payload shapes (extract nested values to top level) improve handler clarity and reduce destructuring complexity (2026-02-12)
- **Problem solved:** Original payload had messages: [{content, attachments, timestamp}]. New payload has content directly at top level. Handler only needs content, so nesting was unnecessary.
- **Why this works:** Simpler handler code, clearer intent, less defensive programming needed. Also matches what agent-discord-router actually needs (just the string content).
- **Trade-offs:** Flattened payload = less flexibility if multiple message formats needed in future, but Discord thread messages are always single-message events anyway. Gained simplicity, lost generality (acceptable trade here).

### DiscordBotService.sendToChannel() returns boolean for success/failure rather than throwing exceptions. EventHookService handles false returns by logging warning but not throwing. (2026-02-12)
- **Context:** Hookable event system where Discord failure shouldn't block event processing. User-configured hooks are best-effort notifications.
- **Why:** Returning boolean for known failure states (channel not found, bot lacks permissions) allows callers to decide response. Throwing only on unexpected errors (network failure, service crash) preserves the distinction.
- **Rejected:** Throwing on all failures (including permission denied) would require try-catch everywhere and could crash event loops. Always throwing makes Discord optional by requiring every caller to handle Discord.
- **Trade-offs:** Boolean returns require explicit null checks but allow graceful degradation. Exception-based errors are harder to ignore accidentally, but force coupling to Discord error handling.
- **Breaking if changed:** If behavior changes to throw on every failure, event processing could crash if Discord is unreachable. If behavior changes to never throw, unexpected errors (service crash) become silent and undetectable.

#### [Pattern] useAgentTemplates hook returns { data, isLoading, error } tuple pattern typical of React Query, enabling conditional rendering of loading/error/success states (2026-02-12)
- **Problem solved:** Component needed to fetch agent templates asynchronously and handle async states in UI
- **Why this works:** React Query pattern separates concerns: hook handles data fetching and caching, component handles UI states. isLoading and error flags enable straightforward conditional rendering without promise handling in JSX.
- **Trade-offs:** Easier: automatic caching, built-in error handling, less boilerplate. Harder: adds React Query dependency, hook behavior less obvious than simple useState.

### System prompt prepended (not replaced) when role template provided (2026-02-12)
- **Context:** AgentTemplate includes systemPrompt; AgentService already had a systemPrompt parameter for the base send operation
- **Why:** Prepending preserves existing system prompt semantics while adding template directives on top. Allows templates to augment, not override. Backward compatible—code without templates still uses original system prompt unchanged.
- **Rejected:** Replacing system prompt entirely: Would break existing send calls that rely on the original system prompt. Would require templates to include all base directives.
- **Trade-offs:** Easier: zero breaking changes; templates become pure additions. Harder: order of prompt concatenation matters; template directives evaluated before base directives (priority handling not explicit)
- **Breaking if changed:** If changed to replacement, all role-based agent executions would lose the original system prompt, breaking agents that rely on base directives. Would require deprecation period and migration guide.

#### [Gotcha] HTTP API client method signature updates must maintain backward compatibility - adding optional parameters (role?, maxTurns?, systemPromptOverride?) to existing methods (send, queueAdd) requires all callers to be updated or will have stale signatures (2026-02-12)
- **Situation:** Adding new parameters to HTTP client queueAdd method revealed it was missing from TypeScript type definitions entirely despite being implemented
- **Root cause:** HTTP client methods are consumed by multiple UI components and hooks. Changing signature without optional parameters would break all existing calls. Optional parameters allow gradual adoption.
- **How to avoid:** Optional parameters keep API surface small but increase method complexity. Callers must know which parameters are actually used by the backend.

#### [Gotcha] API method names are inconsistent across query hooks - getAll() vs list() vs status(). Must review existing hooks before implementing new data fetching to avoid using non-existent methods. (2026-02-12)
- **Situation:** Initially attempted to use api.features.list() and api.autoMode.getRunningAgents() which don't exist. Only discovered correct method names by examining use-features.ts and use-running-agents.ts.
- **Root cause:** Codebase has organic growth with different naming conventions across different API endpoints. No centralized API spec or TypeScript types enforce consistency.
- **How to avoid:** Each new integration requires archeological review of existing code. Safer against typos than if we guessed, but slower onboarding.

### Error handling in data fetching throws Error when API result.success is false, rather than returning error state directly. Query system catches and exposes via error property. (2026-02-12)
- **Context:** React Query's useQuery automatically wraps thrown errors in query.error state. Could have handled errors inside queryFn or deferred to component.
- **Why:** Consistent with React Query patterns - framework handles error state management. Component doesn't need to handle different error formats.
- **Rejected:** Returning { data: null, error: result.error } from queryFn. Would duplicate error handling logic.
- **Trade-offs:** Errors are automatically serialized by React Query. If error needs domain-specific transformation before display, it happens in component not hook.
- **Breaking if changed:** If error throwing is replaced with return values, error state in components becomes undefined and errors are silently ignored.

### Preserved exact function signature and return type; no wrapper functions or API changes (2026-02-13)
- **Context:** Could have added convenience methods like researchRepoSync(), added caching layer, added filtering options, or wrapped return in { success, data, error } envelope
- **Why:** Original function signature is already clean and works. Adding convenience layers now prevents future use cases (someone might need raw sync version). Single Responsibility: researchRepo() does one thing. Callers handle async/await themselves. No feature creep
- **Rejected:** Adding convenience wrappers felt tempting but unnecessary - async/await is standard JS, caching is caller's concern, filtering can be applied post-research. Envelope pattern adds one layer of indirection with no benefit for this use case
- **Trade-offs:** Stricter API means less hand-holding for callers, but forces good async practices. Simpler to test, explain, maintain. Harder to add later-stage filtering without changes
- **Breaking if changed:** If signature changes, all callers break. Staying with original signature means any future convenience features need new functions (researchRepoWithCache, etc.) not modifications to original

#### [Pattern] interpolateTemplate handles missing variables by returning empty string, not throwing (2026-02-13)
- **Problem solved:** Template rendering in CLI scaffolding where missing vars are common during development
- **Why this works:** Silent degradation (empty string) prevents cascading CLI failures; throwing would force every template usage to handle errors explicitly
- **Trade-offs:** Easier to debug later with empty values showing in output vs failing fast; requires test coverage to catch missing variables

### Path argument positional + optional flags (commander style) instead of subcommands or config files (2026-02-13)
- **Context:** CLI needs flexible invocation: `create-protolab` (current dir), `create-protolab /path`, `create-protolab /path --yes --dry-run`
- **Why:** Commander's operand pattern matches Unix conventions (curl, git, npm). Positional path stays semantic. Flags are discoverable via --help. No config file parsing delays startup
- **Rejected:** Subcommand style (create-protolab init /path) adds verb layer unnecessarily. Config file approach requires I/O before execution starts
- **Trade-offs:** Easier: familiar to Unix users, one command entry point. Harder: --help output must be clear, --skip value parsing requires manual validation
- **Breaking if changed:** Changing path from positional to flag (--path) breaks existing scripts relying on positional syntax

#### [Pattern] JSON output mode (--json) emits compact object, not streaming newline-delimited JSON (2026-02-13)
- **Problem solved:** CLI returns single result (success/error/config), not event stream
- **Why this works:** JSON.stringify(obj) is simpler for single operations. NDJSON pattern used for event streams where each line is independent. Single output means parent process gets complete picture in one parse
- **Trade-offs:** Easier: simple JSON.parse(stdout). Harder: can't stream large results, must wait for full completion

#### [Gotcha] JSON output mode must be completely non-interactive (no prompts, no spinners, pure stdout) to work in CI/CD pipelines and automation contexts (2026-02-13)
- **Situation:** Created --json flag to support machine-readable output, but initial implementation accidentally mixed in prompt logic when --json was set
- **Root cause:** CI/CD pipelines and automation tools expect deterministic stdout they can parse. Any interactive prompt causes `await` to hang indefinitely. Spinners add ANSI codes that break JSON parsing. The flow must be: parse args → execute logic → output JSON → exit
- **How to avoid:** Easier: Automation, logging, cross-platform CI. Harder: Must duplicate execution paths (interactive vs JSON), test both code paths

#### [Gotcha] Automaker server connectivity check must happen LATE in validation pipeline, not early (2026-02-13)
- **Situation:** CLI checks Automaker server availability. Initial placement was early (right after environment checks).
- **Root cause:** Automaker server may not be running yet. Checking early produces false-positive FATAL errors. Checking late (before CI/CD phase) is better: if server down, only that phase fails (RECOVERABLE), user can retry after starting server.
- **How to avoid:** Easier: fail fast if server down. Harder: server failure is late-stage (already completed earlier phases). Mitigation: graceful degradation in CI/CD phase if server unreachable.

#### [Gotcha] Discord and GitHub API rate limit detection built into validators, not caller. Validators return rate-limit-aware errors with retry hints. (2026-02-13)
- **Situation:** External APIs return 429 responses during high load. Early attempts caught these in calling code scattered across services.
- **Root cause:** Rate limits are API behavior, not business logic. Centralizing detection in the validator ensures consistent handling everywhere validators are used. Prevents repeated 429 calls.
- **How to avoid:** Validators become slightly heavier (detect 429 headers, embed retry-after logic) but callers become much simpler. Trade complexity up for consistency.

### Discord and GitHub validators are separate modules, not unified under single API validator interface (2026-02-13)
- **Context:** Both APIs return similar error structures (rate limits, validation errors) but have different response schemas for success cases.
- **Why:** Unified interface would require lowest-common-denominator response type. Separate modules preserve API-specific details (Discord webhook fields vs GitHub rulesets) and future-proof for API-specific features.
- **Rejected:** Single validateExternalAPI(provider, response) would force each API's responses into generic structure, losing type information.
- **Trade-offs:** Code duplication in rate-limit detection logic, but each validator knows its API's actual response shape. Callers must import correct validator.
- **Breaking if changed:** Combining validators later would require defining shared interface and refactoring 427+ lines of validator logic. Worth avoiding until real code reuse appears.

### Use fetch API for Discord REST integration instead of axios/node-fetch library (2026-02-13)
- **Context:** Implementing Discord phase for create-protolab CLI with API calls to Discord's REST endpoints
- **Why:** Node.js 18+ has native fetch support; reduces external dependencies for a CLI tool that must be lightweight and portable
- **Rejected:** axios (heavier) or dedicated discord.js library (runtime dependency bloat for CLI)
- **Trade-offs:** Easier: fewer deps, smaller bundle. Harder: manual JSON parsing, no built-in retry logic, requires manual type assertions for fetch responses
- **Breaking if changed:** If target Node version drops below 18, fetch becomes unavailable and implementation fails completely

#### [Gotcha] Discord rate limiting (429) requires retry-after header parsing AND exponential backoff fallback (2026-02-13)
- **Situation:** Initial implementation only checked for retry-after header; discovered in testing that missing header still causes 429s on rapid requests
- **Root cause:** Discord's rate limiting is endpoint-specific and bucket-based. retry-after header is not always present on 429 responses, only on some. Exponential backoff (2^attempt) serves as safety net.
- **How to avoid:** Easier: single retry strategy works in all cases. Harder: more complex backoff logic, slower recovery on missing header

#### [Pattern] Return status objects {success: boolean, error?: string, data?: T} from phase functions instead of throwing (2026-02-13)
- **Problem solved:** Discord phase needs to gracefully handle missing credentials (skip phase if no bot token) and API failures (rate limits, invalid guild)
- **Why this works:** CLI workflows need to continue through failed phases (e.g., create project even if Discord setup fails). Throwing exceptions halts the pipeline; status objects allow caller to decide retry/skip/abort logic.
- **Trade-offs:** Easier: caller controls error handling strategy. Harder: every caller must check success flag (verbose error handling)

### Prompt for guild ID interactively when not provided, rather than making it a required flag (2026-02-13)
- **Context:** Discord phase accepts --guild-id flag but also prompts user if missing; creates dual-path UX
- **Why:** Balances CLI flexibility (automation via --guild-id) with usability (interactive discovery for new users who don't know guild ID)
- **Rejected:** Require --guild-id only (poor UX for new users), prompt every time (breaks automation)
- **Trade-offs:** Easier: works in both automated and interactive contexts. Harder: two code paths increase testing burden
- **Breaking if changed:** If interactive prompt is removed, automated deployments break unless flag is explicitly set; if flag is removed, automation breaks

### getModelForCategory() returns first matching model instead of collection, combined with supportsCategory() to check availability (2026-02-13)
- **Context:** Provider can support multiple models per category, but most callers want a single model to use
- **Why:** Single model return is simpler for callers (common case: 'get me the fast model'). Two-part API (check support, then get model) handles edge cases without returning null or throwing.
- **Rejected:** Return array of models (forces callers to pick); throw if category not found (no way to check first)
- **Trade-offs:** Easier: 90% of use cases get simple string return. Harder: callers must check supportsCategory() before calling to avoid throwing.
- **Breaking if changed:** If getModelForCategory() returned arrays, callers couldn't use direct string assignments. If it returned null instead of throwing, silent failures become possible.

#### [Pattern] Variable injection uses regex pattern `{{VARIABLE_NAME}}` with intentional preservation of undefined variables rather than throwing errors (2026-02-13)
- **Problem solved:** Need to inject dynamic values into prompt templates while debugging missing variables
- **Why this works:** Preserving unmatched `{{placeholders}}` in output reveals to users which variables were not provided, enabling easier debugging. This is better than silent substitution or throwing errors.
- **Trade-offs:** Easier: debugging and graceful degradation. Harder: prompts may contain invalid placeholders if not caught in tests

#### [Pattern] Each provider implements graceful credential validation with clear error messages and installation URLs, allowing tests and CLI tools to skip functionality rather than hard-fail (2026-02-13)
- **Problem solved:** Three providers with different credential requirements: Groq (API key), Ollama (running service), Bedrock (AWS credentials + region)
- **Why this works:** Prevents hard failures in CI/local dev when optional providers aren't configured. Users can choose to configure only providers they need. Tests use this to skip gracefully
- **Trade-offs:** Silent failure in some cases requires good observability - documented in README. Tests must explicitly check for 'skipped' status rather than assuming availability

#### [Pattern] Examples use remote branch inspection to understand undocumented provider API before writing docs (2026-02-13)
- **Problem solved:** Provider implementation was in parallel branches not yet merged; risk of documenting wrong API surface
- **Why this works:** Ensures examples and documentation match actual implementation rather than assumptions. Prevents shipping docs for nonexistent methods or incorrect signatures.
- **Trade-offs:** Required exploration of unmerged code. Once merged, documentation becomes source of truth and doesn't need to be re-verified.

### Cache key composition uses tuple of (name, version, label) instead of single string key (2026-02-13)
- **Context:** Same prompt can have multiple versions and labels (e.g., 'production' vs 'staging' variants)
- **Why:** Prevents cache collisions where fetching prompt v1 with label 'prod' would overwrite v2 with label 'staging'. Each variant is semantically different and should be cached separately.
- **Rejected:** Single string key with concatenation (e.g., 'prompt-v1-prod') would work but is harder to invalidate selectively and easier to create accidental collisions
- **Trade-offs:** Slightly more complex cache key logic but enables precise invalidation via `invalidateByName()` which clears all versions of a prompt
- **Breaking if changed:** If cache keys were flattened to strings and code relied on pattern matching for invalidation, selective clearing would break

### Version pinning supports both explicit version numbers AND semantic labels (e.g., 'production', 'staging') (2026-02-13)
- **Context:** Applications need flexibility to either lock to specific versions for consistency or track labeled variants for flexibility
- **Why:** Labels decouple application code from version numbers - can update 'production' label to point to new version without redeploying app. Numbers provide certainty. Both patterns needed in practice.
- **Rejected:** Only numbers would require code changes to upgrade; only labels would prevent rollback to specific tested versions
- **Trade-offs:** More API surface but provides two complementary caching strategies. Cache keys must distinguish between version and label lookups.
- **Breaking if changed:** If label support were removed, any app using labels for prod/staging separation would need redeployment to change prompt versions

#### [Pattern] Implemented router composition via `combineRoutersAnd()` and `combineRoutersOr()` rather than single monolithic router (2026-02-13)
- **Problem solved:** Complex routing logic often needs to combine multiple conditions (e.g., check field A AND field B). Single router functions would require nested conditionals.
- **Why this works:** Composable routers enable reusable routing logic and easier testing of individual conditions. Combinators allow orthogonal composition without explosion of router types.
- **Trade-offs:** Slightly more verbose for simple cases, but complex routing becomes testable and composable. Enables middleware-like patterns.

#### [Pattern] Provided both `createStateAnnotation()` wrapper AND direct Zod schema patterns to give flexibility for simple vs complex state needs (2026-02-13)
- **Problem solved:** Some graphs need just simple state, others need validation. Forcing all state through annotation helpers would be overly prescriptive.
- **Why this works:** The wrapper provides type inference and reducer binding for common case. Zod schemas work directly for users who don't need the helpers. Layered API allows gradual adoption.
- **Trade-offs:** Two ways to define state means users must learn both patterns, but each pattern fits its use case naturally.

#### [Pattern] SDK methods (createSpan, createScore) accept Options type objects instead of individual parameters (2026-02-13)
- **Problem solved:** LangfuseClient expands with more optional configuration parameters over time
- **Why this works:** Options objects provide forward compatibility. New optional fields can be added to CreateSpanOptions without breaking existing code. Individual parameters would require method overloading or deprecated signatures.
- **Trade-offs:** Slightly more verbose at call site (easier evolution, more configuration flexibility), but clearer intent than positional args

### Exporting all public types from src/index.ts rather than requiring users to import from submodules (2026-02-13)
- **Context:** Users need LangfuseClient, CreateSpanOptions, CreateScoreOptions, and other types for TypeScript support
- **Why:** Single import point reduces cognitive load and prevents users from importing from internal implementation details (langfuse/client, langfuse/types). Enables internal refactoring without breaking imports.
- **Rejected:** Requiring `import { LangfuseClient } from '@automaker/observability/dist/langfuse/client'` exposes internal structure
- **Trade-offs:** Central barrel export is easier to use (one source of truth), requires explicit re-exports (minor maintenance overhead)
- **Breaking if changed:** If index.ts stops re-exporting types, any code importing from it breaks. Users must be aware of public API guarantees.

#### [Gotcha] LangGraph stream() returns async generator that TypeScript couldn't properly type; switched to invoke() + getState() pattern for HITL interrupt detection (2026-02-14)
- **Situation:** Attempted to iterate over stream() output to detect when flow reached interrupt gates, but type inference failed for async iteration
- **Root cause:** invoke() returns the final state synchronously and getState() explicitly retrieves current state with interrupt info. More explicit control flow for detecting and handling HITL gates
- **How to avoid:** Easier: Type safety and explicit state access. Harder: Can't consume partial results during execution, must wait for completion or interrupt

#### [Pattern] Export formats (markdown, frontmatter-md, jsonl, hf-dataset) configured as separate output pipeline stages rather than conditional transforms at end (2026-02-14)
- **Problem solved:** Need to support 4 different serialization formats for same content across different use cases (docs, training data, HuggingFace)
- **Why this works:** Pipeline stages keep format logic decoupled and composable. Each format knows how to serialize its own data without conditional branching
- **Trade-offs:** Easier: Add formats without touching core logic. Harder: Need format handlers to be discoverable/registered, adds abstraction layer

#### [Gotcha] Verification script checks for exact phrase matching (case-sensitive) for 'key concepts' like '7-phase', 'antagonistic review', 'bucket brigade' but these appear in documentation with variations in capitalization (2026-02-14)
- **Situation:** Verification warnings appeared for concepts that were actually present but with different casing (e.g., 'Bucket brigade' vs 'bucket brigade')
- **Root cause:** Root cause is documentation using proper noun capitalization (standard English) while verification assumed lowercase. This reveals that 'key concepts' are domain terms that deserve consistent naming
- **How to avoid:** Strict verification caught something valuable - the need to standardize how domain terms are capitalized throughout documentation. The warnings forced explicit checking rather than silent acceptance

#### [Gotcha] compilePrompt() from prompt-loader returns a CompiledPrompt object with metadata (.prompt property contains actual string), not a raw string. Must access .prompt property to get template text. (2026-02-14)
- **Situation:** Initial implementation passed CompiledPrompt object directly to LLM, which expected string template.
- **Root cause:** The prompt loader design preserves metadata about prompts (source, compilation details) for debugging and tracing. This enables better observability at the cost of an extra property access.
- **How to avoid:** Extra property access needed, but enables prompt versioning, source tracking, and better error messages when prompts fail.

### Switched from markdown report format to structured XML output in fact-checker.md prompt (2026-02-14)
- **Context:** LLM responses must be parsed programmatically. Needed machine-readable format for finding extraction.
- **Why:** XML tags are unambiguous delimiters that survive whitespace variations and LLM formatting quirks. Easier to parse reliably with `extractAllTags()` than markdown. Reduced token cost from ~263 to ~100 lines.
- **Rejected:** Keeping markdown format - would require fragile string matching or regex for extraction. JSON output - adds escaping complexity and LLM tends to mangle nested quotes.
- **Trade-offs:** XML is more verbose in prompt but more reliable in parsing. Structured format better than freeform text but less human-readable.
- **Breaking if changed:** If parser expects markdown format and prompt returns XML, all findings fail to extract silently (parsing returns empty array)

#### [Gotcha] XML parser requires careful enum validation - `extractRequiredEnum()` vs optional `extractTag()` distinction (2026-02-14)
- **Situation:** Parsing severity field from XML. Needed to distinguish between required vs optional findings fields.
- **Root cause:** Missing severity should be error (finding is malformed), but missing suggestion is acceptable (finding still valid). Type safety catches invalid severity values.
- **How to avoid:** Stricter validation catches malformed LLM output but requires explicit error handling for each required field.

### Duplicate detection via existingRelatedIds lookup before calling createIssueRelation (2026-02-14)
- **Context:** Relations may be created multiple times if sync operations are retried or re-run
- **Why:** Prevents API errors from duplicate creation attempts; Linear API may reject duplicate relations or require checking existence first
- **Rejected:** Try/catch on API error - relies on API error messages; no pre-check - assumes idempotency of API
- **Trade-offs:** Extra getIssueRelations() call adds API overhead but prevents failed creation attempts and incorrect duplicate counts
- **Breaking if changed:** Removing duplicate detection will cause API failures on retries and confuse metrics about what was actually created vs attempted

### Filtering Linear relations by specific types ('blocks', 'blocked', 'relatedTo') rather than syncing all relation types (2026-02-14)
- **Context:** Linear's relations API returns many relation types, but only dependency-semantic ones should map to Automaker dependencies.
- **Why:** Automaker features use 'dependencies' as a directed list, while Linear relations include semantic types like 'duplicates', 'relates', etc. Filtering ensures semantic correctness - only blocking/blocked/related relations represent actual dependencies.
- **Rejected:** Syncing all relation types would pollute dependencies with non-dependency relations, making dependency tracking meaningless.
- **Trade-offs:** Easier: Clean semantic mapping. Harder: Requires knowledge of which Linear relation types map to dependencies (requires domain knowledge).
- **Breaking if changed:** If filtering is removed or expanded to include unrelated types like 'duplicates', the dependencies list loses meaning and becomes cluttered.

#### [Gotcha] ReviewState type includes 'NONE' sentinel value, but GitHub API payload contains actual state (APPROVED, CHANGES_REQUESTED, COMMENTED). Mixing these causes type errors. (2026-02-14)
- **Situation:** Initial implementation compared currentReviewState (ReviewState | 'NONE') directly in payload, but payload interface expects only valid GitHub states
- **Root cause:** Need type-safe comparison while also representing 'no review' state, but GitHub API responses don't include 'NONE'. Must use type guard on latestReview existence.
- **How to avoid:** Using latestReview directly in payload is simpler than conditional type narrowing but requires null-safety check first

#### [Pattern] Only emit events when state actually changes (detected via cache comparison), with cache population on first check without emission (2026-02-14)
- **Problem solved:** PR checks polling could trigger events on every cycle even if nothing changed, flooding downstream systems
- **Why this works:** Prevents duplicate event storms and ensures each event represents a real transition. First check populates cache as baseline so subsequent changes are detectable.
- **Trade-offs:** Requires maintaining state cache but prevents wasted processing in event listeners

#### [Gotcha] EventEmitter API uses emit(type, payload) signature, not emitEvent({type, data}) wrapper pattern (2026-02-14)
- **Situation:** Initial implementation used ctx.events.emitEvent({type, data}) pattern which failed at runtime despite type checking
- **Root cause:** The actual EventEmitter API is simpler and the wrapper pattern was incorrectly assumed from context
- **How to avoid:** Direct emit() is simpler but loses the explicit event structure wrapping. Had to learn actual API by searching codebase

### POST /api/linear/sync-dependencies returns detailed per-relationship status (created/skipped/error) rather than just aggregate counts (2026-02-14)
- **Context:** Endpoint needed to communicate why some dependencies weren't synced
- **Why:** Detailed status array enables debugging of sync failures - user can see exactly which dependencies were skipped and why (missing linearIssueId, dependency not in project, etc). This is crucial for troubleshooting partial sync failures
- **Rejected:** Simpler alternative: return only summary counts {total, created, skipped, errors} but this loses visibility into which specific relationships failed
- **Trade-offs:** Larger response payload vs much better debuggability. Payload size negligible unless syncing thousands of relations
- **Breaking if changed:** If detailed array is removed, consumers lose ability to identify why specific dependencies weren't synced and can't implement retry logic

### Progress converted from 0-100 percentage to Linear's 0-1 decimal scale at the API boundary, not in business logic (2026-02-14)
- **Context:** Automaker stores progress as percentage (0-100), Linear GraphQL API expects decimal (0.0-1.0)
- **Why:** Keeps business logic scale-agnostic. Conversion at API boundary is 'external format adaptation', making it clear this is a Linear API quirk not core domain logic. Easier to test internally
- **Rejected:** Converting in core calculation would mix API concerns into business logic. Harder to reuse calculation for other outputs
- **Trade-offs:** One more place to check/maintain the conversion formula. Clearer intent—anyone modifying LinearMCPClient immediately sees the scale difference
- **Breaking if changed:** Moving conversion elsewhere would require updating all progress callers. If forgotten, sends 75 to Linear expecting 0.75—progress suddenly appears as 7500%

### Export both createStatusReportFlow() and executeStatusReport() from the main module - flow factory + convenience executor (2026-02-14)
- **Context:** Consumers might want just the flow object (for advanced customization) or the simple execution path (for quick reports)
- **Why:** Two common use cases: (1) Get flow object to customize nodes/edges before execution, (2) Just execute with minimal setup. Exporting both serves both audiences without forcing unnecessary abstraction.
- **Rejected:** Only exporting the flow - forces users to write boilerplate execution code. Only exporting executor - prevents customization.
- **Trade-offs:** Adds two exports instead of one. But eliminates duplicated initialization code across callers.
- **Breaking if changed:** If the underlying StateGraph changes, both exports might need updates. The executor hides state graph details, so it must be kept in sync with flow structure.

#### [Pattern] New endpoint added via Express Router composition instead of single exported route handler (2026-02-15)
- **Problem solved:** Existing pattern was `createCopilotKitEndpoint()` returning single router/endpoint. Now need both `/workflows` metadata endpoint AND the existing CopilotKit runtime endpoint from same logical module.
- **Why this works:** Express Router allows multiple endpoint handlers under same prefix. Avoids duplicating auth middleware or creating separate route files. Maintains cohesion - all copilotkit routes in one module.
- **Trade-offs:** Easier: single logical mount point, shared auth. Harder: callers must understand router composition pattern, not immediately obvious that `createCopilotKitEndpoint()` now returns composite router.

#### [Gotcha] Workflow metadata uses hardcoded `supportedModels: ['haiku', 'sonnet', 'opus']` for all workflows - no per-workflow model filtering (2026-02-15)
- **Situation:** Future workflows may only support specific models (e.g., content-pipeline might require opus). Currently all three workflows list identical models.
- **Root cause:** Simplest initial implementation - all agents are Claude, all support same models. No visibility into model requirements yet.
- **How to avoid:** Easier: predictable, static. Harder: frontend cannot warn user when selecting workflow+model combo that won't work.

#### [Gotcha] CopilotKit exports useAgentContext hook, not useCopilotReadable. Feature specs may reference older/incorrect hook names. Always verify against actual package exports. (2026-02-15)
- **Situation:** Feature description mentioned useCopilotReadable but @copilotkitnext/react package only exports useAgentContext for context injection.
- **Root cause:** CopilotKit API evolved. Documentation/specs can lag behind actual implementation. Direct source inspection prevents wasted implementation time.
- **How to avoid:** Takes extra 5min to verify exports, saves hours of debugging non-existent APIs.

### Interrupt payload includes both structured review data (reviewResult with dimensions/scores/verdicts) AND rendered content for display, rather than just one or the other (2026-02-15)
- **Context:** HITL nodes need to communicate review findings to CopilotKit AG-UI while also showing the actual content being reviewed
- **Why:** Human reviewers need both the analytic review breakdown (why it was flagged) AND the actual content (what to approve/reject). CopilotKit sidebar displays the full payload; redundancy is feature, not waste.
- **Rejected:** Including only reviewResult (no content) would force sidebar to request content separately; including only content (no review) would hide the reasoning for the interrupt
- **Trade-offs:** Larger payload per interrupt, but eliminates round-trip to fetch context and provides complete decision context to human
- **Breaking if changed:** If content is removed from payload, human loses critical context for approval decision; if reviewResult is removed, human sees content but not why it was flagged

### Model passed via X-Copilotkit-Model HTTP header rather than as CopilotKit AG-UI runtime property (2026-02-15)
- **Context:** CopilotKit SDK doesn't expose a clean TypeScript API for per-request model override via runtime properties, despite AG-UI protocol supporting it in theory
- **Why:** Headers are simpler to implement, require no modifications to CopilotKit SDK, and can be read server-side immediately. Avoids dependency on CopilotKit SDK improvements
- **Rejected:** Alternative was to implement model override via AG-UI protocol properties once CopilotKit TypeScript API matures, but this blocks feature implementation on external SDK changes
- **Trade-offs:** Header approach is pragmatic short-term solution but creates technical debt. Server must parse headers instead of receiving strongly-typed model config. Future AG-UI API improvements could obsolete this pattern
- **Breaking if changed:** Server-side getModelFromRequest() relies on header presence. If header is omitted, code falls back to defaults silently. Should add validation to catch missing model headers in requests

#### [Gotcha] @copilotkitnext/react does not expose UseAgentUpdate.OnInterrupt. Interrupt data flows through agent state mutations (state.interrupt, state.waitingForInput) instead. (2026-02-15)
- **Situation:** Attempted to subscribe to interrupt events directly via CopilotKit's documented interrupt API. API does not exist in the current version.
- **Root cause:** CopilotKit AG-UI protocol uses state-driven communication rather than event-driven for interrupts. Monitoring state changes is the only available surface.
- **How to avoid:** State-based polling is less explicit than event-driven, requires watching for state mutations rather than subscribing to named events. More brittle if internal state shape changes.

#### [Gotcha] Resume implementation uses agent.sendMessage() with type-casted any, exact AG-UI protocol for resuming from interrupts is undocumented. (2026-02-15)
- **Situation:** CopilotKit/LangGraph interrupt resume mechanism not exposed in public API docs. Implemented placeholder that may not match actual protocol.
- **Root cause:** Best guess based on available APIs. sendMessage() is known to exist and accepts messages. Typed as any to allow runtime protocol adaptation.
- **How to avoid:** Gains: Feature doesn't silently fail to resume. Loses: May send wrong message format to agent, requiring debugging against real LangGraph flow.

#### [Gotcha] LangGraph interrupt/resume with CopilotKit: when resolve() is called from frontend with updated state, the graph automatically resumes at the exact node where it interrupted. State updates are merged, not replaced. (2026-02-15)
- **Situation:** Initial assumption was that graph would skip the HITL node and resume downstream. Actually, the HITL node runs again with the new state, allowing it to validate/process edits before continuing.
- **Root cause:** LangGraph by design re-enters the interrupted node with merged state. This is a feature: it gives the HITL node a chance to validate and apply edits before the flow continues. The alternative (skip HITL node) would bypass crucial validation.
- **How to avoid:** Easier: validation/edit handling happens in the same HITL node code. Harder: must account for the HITL node running twice (once to interrupt, once to resume with edits).

#### [Gotcha] CopilotKit AG-UI interrupt protocol expects resolve() callback to receive decision payload, not boolean confirmation (2026-02-15)
- **Situation:** Initial assumption was interrupt resolution = approve/reject boolean. Actual protocol requires passing decision object back to graph.
- **Root cause:** Agent needs to process decisions (merge targets, corrections, specific entity IDs). Simple boolean loses this context.
- **How to avoid:** Richer payload enables complex workflows but requires careful serialization. Type safety becomes critical.

### MCP tool array is manually defined with switch statement handler instead of using automated discovery/adapter pattern. Each tool requires explicit registration in packages/mcp-server/src/index.ts. (2026-02-17)
- **Context:** Three new MCP tools (twitch_list_suggestions, twitch_build_suggestion, twitch_create_poll) needed to be exposed to Claude Code and agents
- **Why:** Explicit registration is deterministic and type-safe. Avoids reflection/convention-over-config complexity. Error handling is localized to each tool.
- **Rejected:** Automated discovery (scan domains/twitch/ for tools) - would create implicit coupling and harder to debug MCP registration failures. Generic adapter - would reduce type safety.
- **Trade-offs:** More boilerplate (3 switch cases + 3 tool definitions) but every tool is visible and traceable. Future tool additions are explicit and reviewable.
- **Breaking if changed:** If tool is defined but not added to switch statement, it's silently unavailable to Claude - hard to debug. If tool is in switch but not in array, MCP server rejects the call.

### POST /api/twitch/suggestions/:id/build creates Automaker board feature directly instead of just approving suggestion. Approval and feature creation are fused into one operation. (2026-02-17)
- **Context:** Twitch suggestions need to become features on the Automaker board. Could be two operations (approve → then auto-create) or one (approve-and-create).
- **Why:** Fusing into one operation reduces API surface and user interaction. No intermediate 'approved' state that blocks feature creation. Josh can go directly from suggestion to board without extra steps.
- **Rejected:** Separate approve and auto-create endpoints - would require Josh to call both or would create race condition where suggestion is approved but feature not created.
- **Trade-offs:** One operation is faster but less flexible. Can't approve without creating feature. But given use case (Twitch polls are final), this is acceptable.
- **Breaking if changed:** If approval and creation are ever decoupled (e.g., approve now, create later), this endpoint becomes misleading.

#### [Gotcha] TwitchSuggestion type already exists in @automaker/types, but no API endpoint exists to fetch suggestions — ChatResponseHandler.readSuggestions() currently returns empty array (2026-02-17)
- **Situation:** Suggestion queue component and chat `!queue` command both need to display suggestions, but the data model exists while the data transport does not
- **Root cause:** Type was defined during initial Twitch feature planning (types are infrastructure), but the HTTP endpoint to serialize/transmit suggestions was not implemented. This is a common gap: types built first, implementation deferred
- **How to avoid:** Suggestions display 'empty state' currently. Once endpoint is added, queue and chat command will work automatically because types are already aligned

#### [Gotcha] Edit endpoint requires statePatch as request body parameter (JSON object), while refire endpoint accepts no body - inconsistent parameter sources between POST endpoints (2026-02-18)
- **Situation:** Designing two similar mutation endpoints with different semantic requirements - refire is stateless node execution, edit is node state modification
- **Root cause:** Refire only needs node identity (from URL), but edit needs the specific state changes to apply. Using request body for edit provides structured validation of state patch schema.
- **How to avoid:** Endpoint API clarity at cost of inconsistent parameter handling. Clients must understand that some POST endpoints take body, others don't.

#### [Pattern] Status code strategy: 400 for validation errors (missing/invalid statePatch), 500 for session not found, 200 for success - mixing client vs server error codes (2026-02-18)
- **Problem solved:** Error handling in endpoints needs to distinguish between request format problems vs. runtime/data lookup problems
- **Why this works:** 400 indicates client provided invalid data (recoverable with different input). 500 for session-not-found indicates server state problem (session should exist). This matches HTTP semantics.
- **Trade-offs:** 400/500 split is semantically clear but differs from strict REST conventions. Makes error handling straightforward for clients.

#### [Gotcha] No dedicated listSessions endpoint exists; sessions must be derived from ideas via conversationId (2026-02-18)
- **Situation:** Expected direct sessions API but discovered ideation design exposes sessions implicitly through idea relationships
- **Root cause:** Design choice to normalize sessions through ideas prevents session orphaning and maintains data consistency
- **How to avoid:** Eliminates redundant data but requires deriving sessions on client (simple with unique() extraction). Future-proofs against stale session state.

#### [Gotcha] TanStack Router search params require Zod schema validation and useSearch hook, not direct URL parsing (2026-02-18)
- **Situation:** Implementing ?tab=ideas and ?tab=system URL deep linking for tab state
- **Root cause:** Router maintains type-safe search params through validation schema; useSearch provides reactivity without manual listeners; prevents mismatches between URL and component state
- **How to avoid:** Requires schema definition but gains type safety, automatic validation, and router integration; search params are auto-persistent to URL

#### [Pattern] Using data-testid attributes with multiple fallback selectors in test queries to handle UI changes gracefully (2026-02-18)
- **Problem solved:** Test file used selectors like `[data-testid="nav-ideas"], a[href*="/ideas"]` to find elements
- **Why this works:** Provides flexibility when UI implementation details change. If data-testid is removed, the href-based selector still works. If styling changes the tag type, the selector still finds it. Makes tests resilient to cosmetic refactors
- **Trade-offs:** Query is more complex to read but more maintainable long-term. Slightly slower selector resolution but negligible in tests

#### [Pattern] Theme utility design uses DOM manipulation (document.documentElement) rather than return-value approach, matching existing shadcn theme pattern (2026-02-18)
- **Problem solved:** Existing apps/ui theme implementation applies CSS classes directly to html element; new utility functions must integrate with this established pattern
- **Why this works:** applyTheme() mutates document.documentElement.classList; detectPreferredTheme() reads system prefers-color-scheme via matchMedia. This matches Tailwind/shadcn convention where themes are applied globally via class names on root element
- **Trade-offs:** Direct DOM manipulation is easier to integrate with existing code but couples utility to browser environment; makes testing require jsdom; prevents use in server contexts (e.g., getServerSideProps)

#### [Pattern] 19 story files created via agent automation shows successful code generation pattern: each story file is 30-50 lines with consistent structure (Meta + Default export + variant exports), enabling reliable bulk creation (2026-02-18)
- **Problem solved:** Agent created 25 story files without manual review of each one. Quality variance between files was minimal.
- **Why this works:** Each story follows identical structure: (1) import Component, (2) define Meta with autodocs tag, (3) export Default with template, (4) export variant stories using CSF3. This regularity allows agents to generate valid code without human validation.
- **Trade-offs:** Consistency is high (all stories follow same pattern) but individual stories may lack sophistication (e.g., complex interaction demos). Trade-off is acceptable for coverage—sophisticated stories can be added later.

#### [Pattern] Enum-based escalation routing: `EscalationSource` enum value determines which service/channel handles the signal. Renaming source types (crew_escalation → lead_engineer_escalation) is safe because routing logic reads the enum, not string literals. (2026-02-19)
- **Problem solved:** Three different files (lead-engineer-service, discord-channel-escalation, github-issue-channel) reference the same escalation source value to route signals. Needed to rename without breaking escalation flow.
- **Why this works:** Enum-based routing decouples the semantic name (what caused the escalation) from the routing implementation (which service handles it). The name can change (reflects business logic evolution) while routing stays intact because consumers compare enum values, not strings.
- **Trade-offs:** Requires coordinating the rename across 3+ files for consistency. But enum-based approach forces all references to be type-checked, preventing accidental mismatches that would happen with string literals.

### Added serverTime field alongside existing timestamp field rather than replacing it (2026-02-19)
- **Context:** Health endpoint already had a timestamp field returning ISO 8601 format; feature explicitly requested serverTime field addition
- **Why:** Explicit requirement to add field implies maintaining backward compatibility and not modifying existing fields. Clients consuming timestamp field should not break
- **Rejected:** Could have renamed timestamp to serverTime, but would be a breaking change for existing consumers
- **Trade-offs:** Response payload slightly larger with duplicate similar fields; clearer backward compatibility vs potential consumer confusion about two timestamp fields
- **Breaking if changed:** If either timestamp or serverTime field is removed, API consumers relying on either field would break

#### [Pattern] Graph definitions include dual metadata: structural (nodes, edges, entryPoint) and semantic (features, useCase) (2026-02-19)
- **Problem solved:** Single /api/engine/flows endpoint needed to serve both system consumers (need exact node/edge structure) and human consumers (need to understand purpose)
- **Why this works:** Structural metadata (nodes, edges) enables programmatic graph traversal and execution planning. Semantic metadata (features=['sequential', 'stateful', 'checkpointing'], useCase) enables discovery and appropriate routing decisions. Separating them allows different clients to use different subsets.
- **Trade-offs:** More verbose schema but enables both programmatic routing and human discovery. Adds validation burden to ensure features list stays in sync with actual graph capabilities.

#### [Gotcha] WebSocket event subscriptions use apiClient.subscribeToEvents((type, payload) => {}) pattern, not traditional .on(eventName) pub/sub (2026-02-19)
- **Situation:** Implementing real-time node highlighting required subscribing to feature:progress events for currentNode and completedNodes updates
- **Root cause:** This is the established pattern in the codebase's event system. The subscribeToEvents handler receives all events with type discrimination, allowing single listener for multiple event types.
- **How to avoid:** Easier: single unified event listener. Harder: must manually type-guard the payload based on event type string.

### Exported `SignalIntakeStatus` TypeScript interface as part of service API contract (2026-02-19)
- **Context:** Engine routes consume service status and return it via HTTP API; route consumers need type safety
- **Why:** Named interface at service layer allows API consumers to import and type-check against the contract without re-declaring shape. Reduces version skew between service and consumers
- **Rejected:** Inline type in route handler (e.g., `{ active: boolean; ... }`) would scatter type definition across codebase; anonymous object types don't provide a single source of truth
- **Trade-offs:** Adds one extra export from service module, but eliminates need for separate DTO/API types in route layer. Single schema definition vs multiple scattered definitions
- **Breaking if changed:** If interface is removed or shape changes without version, all consumers importing it will have compilation errors (good for catching breaking changes early)

### GitWorkflowStatus interface exposes both activeWorkflows (counter) and recentOperations (array) separately instead of aggregated metrics (2026-02-19)
- **Context:** Engine status endpoint needs to report workflow state to frontend. Could expose raw components or pre-computed statistics
- **Why:** Separating data model from presentation allows frontend to compute different statistics (e.g., success rate, most common operation) without round-tripping. Raw operation records provide full context including error messages
- **Rejected:** Pre-computed success rate/failure rate (inflexible if frontend needs different metrics), or operation-only without active count (loses real-time workflow visibility)
- **Trade-offs:** Frontend has more responsibility for data interpretation, but gains flexibility. Slightly larger JSON payload but includes error details necessary for debugging
- **Breaking if changed:** Removing recentOperations array loses error context from failed operations. Removing activeWorkflows loses visibility into how many workflows are currently executing

### Require removal of type definitions in three distinct locations (type union, status handler case, icon mapping) when deprecating an EngineServiceId, rather than consolidating into a single definition. (2026-02-19)
- **Context:** Removing 'signal-intake' required changes in types.ts, use-flow-graph-data.ts, and engine-service-node.tsx. Each location independently references the EngineServiceId without centralizing the definition.
- **Why:** Each location serves a different concern: the type definition validates the domain, the status handler implements service-specific logic, the icon mapping provides UI presentation. Separating them allows each concern to evolve independently.
- **Rejected:** Could have created a centralized ServiceRegistry constant that maps EngineServiceId to handlers and icons, requiring only one place to update. This would be DRY but loses the benefit of local, concern-specific logic.
- **Trade-offs:** More files to update during deprecation (higher maintenance cost) but each file remains focused and easier to understand. Centralization would reduce sync points but increase coupling between unrelated concerns.
- **Breaking if changed:** If any of the three locations is missed during removal, TypeScript won't catch it as a sync issue. The icon mapping missing 'signal-intake' wouldn't cause a compile error - it would just fail at runtime when rendering. The separate locations require manual discipline to keep in sync.

### Add projectPath as optional parameter to usePipelineTracker hook instead of deriving it from context (2026-02-19)
- **Context:** Hook needed to accept projectPath while maintaining backward compatibility with code that didn't pass it
- **Why:** Makes data dependency explicit in the hook signature. Prevents the hook from implicitly reading context where it might not exist. Follows React best practice of explicit over implicit dependencies
- **Rejected:** Alternative: Always read projectPath from currentProject context. This creates hidden dependency and makes the hook less testable
- **Trade-offs:** Slightly more verbose at call sites (one additional parameter). Gains: explicit dependency, easier testing, clearer data flow
- **Breaking if changed:** If removed, hook loses ability to fetch data without relying on context, making it untestable in isolation

#### [Gotcha] Response shape must exactly match the previous hardcoded data structure, even with new real data source (2026-02-19)
- **Situation:** The service returns `SignalIntakeStatus` interface, but the API response still maps to the original shape clients expect
- **Root cause:** Backwards compatibility. Changing the response shape would break existing clients consuming `/api/engine/status`. The summary notes 'Existing API shape preserved (backwards compatible)'
- **How to avoid:** The interface wraps data in a specific shape, requiring careful field mapping even though the underlying data structure changed