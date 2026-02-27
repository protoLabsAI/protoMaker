---
tags: [api]
summary: api implementation decisions and patterns
relevantTo: [api]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 183
  referenced: 74
  successfulFeatures: 74
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
- **Rejected:** Requiring `import { LangfuseClient } from '@protolabs-ai/observability/dist/langfuse/client'` exposes internal structure
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

#### [Gotcha] TwitchSuggestion type already exists in @protolabs-ai/types, but no API endpoint exists to fetch suggestions — ChatResponseHandler.readSuggestions() currently returns empty array (2026-02-17)
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

#### [Pattern] OpusClip requires video URLs, not file uploads. Solution: temporary routes (`POST /api/stream-pipeline/temp/:filename`) that serve MP4 to OpusClip, then auto-delete after download. (2026-02-22)
- **Problem solved:** OpusClip REST API accepts `videoUrl` parameter only. Need secure, temporary access to MP4 without permanent hosting infrastructure.
- **Why this works:** Temporary routes avoid external storage (S3/CDN), provide access control (auto-expiring), and enable cleanup. OpusClip can fetch from any URL.
- **Trade-offs:** No external storage setup needed vs. requires timeout logic and cleanup handling if OpusClip fails to download (orphaned files).

### Backward compatibility maintained for Twitch by keeping existing JSONL file persistence while simultaneously adding new `signal:received` event emission. (2026-02-22)
- **Context:** Twitch service already persists data to JSONL files. Need to integrate with new signal monitoring pipeline without breaking existing integrations.
- **Why:** Prevents breaking changes to any downstream code that depends on JSONL files. Allows gradual migration to signal-based pipeline. Reduces scope of this feature by not requiring migration of existing code.
- **Rejected:** Replace JSONL with signals only - would break any code reading JSONL files; Migrate all data - would require separate data migration feature.
- **Trade-offs:** Data duplication (same data in JSONL and as events) increases complexity and storage, but provides safe incremental migration path. Extra code paths in Twitch service to maintain both formats.
- **Breaking if changed:** If JSONL persistence is removed, any downstream code parsing those files breaks. If signal emission is removed, signal pipeline has missing data. If formats diverge, they become out of sync.

#### [Pattern] Created handler abstraction layer that calls /social/* endpoints even though those endpoints don't exist yet (2026-02-22)
- **Problem solved:** Building MCP tools for social platforms but actual API layer not implemented; endpoints are placeholder
- **Why this works:** Decouples tool definitions from endpoint implementation details. If endpoint paths/structure changes later, only handlers change not all 20 tools
- **Trade-offs:** Added abstraction layer costs implementation time now but enables future flexibility. Creates false assumption that endpoints exist (incomplete feature)

### Signal classification for Google Calendar events uses keyword matching on event title to route to 'gtm' (marketing keywords) or 'ops' (engineering keywords, default). (2026-02-22)
- **Context:** Need to automatically classify calendar events without explicit API metadata or requiring manual tagging.
- **Why:** Event titles are always available without additional API calls. Keywords like 'sprint', 'campaign', 'deployment' are reliable signals of domain.
- **Rejected:** Metadata from calendar description (requires extra API call); explicit labels (manual work); event type/attendee analysis (fragile).
- **Trade-offs:** Simple and fast, but fragile—depends on consistent naming conventions. Poorly named events (e.g., 'Meeting') default to 'ops' incorrectly.
- **Breaking if changed:** Removing keyword routing requires alternative classification mechanism or manual event tagging. Changing keyword set changes business routing behavior.

#### [Pattern] Webhook payload validation via runtime parser function (parseLangfuseWebhookPayload) separate from TypeScript interface (2026-02-23)
- **Problem solved:** TypeScript types don't exist at runtime. JSON from Langfuse could be any shape. Need to validate structure before processing.
- **Why this works:** Decouples type definition (compile-time) from validation logic (runtime). Parser explicitly checks each field type and presence, returning null on any violation. Prevents invalid payloads from silently failing downstream.
- **Trade-offs:** Adds ~30 lines of validation code but provides strong guarantees. Testable in isolation (12 dedicated tests). Makes validation rules explicit and auditable.

#### [Gotcha] Langfuse webhook signature uses HMAC-SHA256 over raw body, not over stringified JSON or specific fields (2026-02-23)
- **Situation:** Initial assumption was that signature might be over specific JSON fields or a canonical representation. Testing revealed Langfuse uses raw POST body bytes.
- **Root cause:** Langfuse webhook implementation (external service) computes HMAC over the exact bytes sent in the HTTP body. Any preprocessing or field reordering breaks signature verification.
- **How to avoid:** Using raw body is more robust but requires explicit buffer capture. Canonical representations would be fragile (JSON spec doesn't guarantee key ordering).

#### [Pattern] Label-based filtering allows runtime control over which prompts trigger sync without code deployment (2026-02-23)
- **Problem solved:** Langfuse webhook receives all prompt version events. Implementation filters by presence of `LANGFUSE_WEBHOOK_LABEL` in prompt's labels array.
- **Why this works:** Webhook may fire for many prompt versions (staging, dev, experimental). Only production prompts need syncing to GitHub. Label filtering is declarative (data-driven) not code-driven.
- **Trade-offs:** Pro: Configurable at runtime via prompt labels in Langfuse UI. Con: Requires discipline to properly tag prompts; silent filtering if misconfigured (no error feedback).

#### [Gotcha] Prompt name in Langfuse uses dot-notation (e.g., 'autoMode.planningLite') which maps to file path structure (prompts/autoMode/planningLite.txt). Parsing must handle this convention explicitly. (2026-02-23)
- **Situation:** Webhook receives `event.data.name` as single string. Must convert to category/key structure for GitHub file path. Convention is not documented in webhook payload schema.
- **Root cause:** Langfuse prompt naming is semantic and reflects app domain (category.feature). File structure mirrors this for maintainability. Parsing at webhook boundary makes sync logic cleaner and prevents string format assumptions from leaking into service.
- **How to avoid:** Easier: single split on '.' is trivial and deterministic. Harder: convention is implicit - must discover by reading test data or integration docs. Risk: future prompts with dots in category/key name will break parser.

#### [Gotcha] GitHub repository_dispatch requires exact event type string (e.g., 'langfuse-prompt-update') and CI must subscribe to that specific type (2026-02-23)
- **Situation:** Repository dispatch event fires but CI workflow won't trigger unless workflow file has matching `on.repository_dispatch.types: ['langfuse-prompt-update']`
- **Root cause:** GitHub's repository_dispatch filtering is strict - generic 'dispatch' events don't trigger workflow. Each event type must be explicitly listed in workflow definition.
- **How to avoid:** Requires coordination between backend (event type) and CI config (workflow trigger). Typo in either breaks everything. Benefits: explicit intent, security (CI decides what events trigger it).

#### [Pattern] AgentService.sendMessage() accepts optional featureContext parameter. Tool tracking only activates when featureContext is provided; absent context is a graceful no-op. (2026-02-23)
- **Problem solved:** Agent service needs to work in two modes: standalone chat (no feature tracking) and pipeline-aware (full observability). Without this pattern, would need two separate service classes.
- **Why this works:** Enables single service to serve multiple contexts without duplication. Standalone callers don't pay cost of feature awareness. Feature-aware callers opt-in by passing context.
- **Trade-offs:** Easier code reuse and flexibility. Downside: callers must remember to pass featureContext, or observability silently fails. No compiler error if omitted.

### Phase information in tool execution record comes from optional featureContext.phase parameter provided by caller, not automatically tracked from pipeline state. (2026-02-23)
- **Context:** Tool executions need to know which pipeline phase they occurred in, but agent service has no direct access to pipeline orchestrator state.
- **Why:** Decouples agent service from pipeline state management. Caller (auto-mode, pipeline orchestrator) knows current phase and can provide it.
- **Rejected:** Alternative: pass entire pipeline state to agent service. This couples agent service to pipeline internals and becomes brittle.
- **Trade-offs:** Simpler agent service, but caller must maintain phase correctly. If phase is stale or wrong, tool executions are attributed to wrong phase with no validation.
- **Breaking if changed:** If caller provides incorrect phase, observability is silently broken (tools attributed to wrong phase). No consistency check between featureContext.phase and pipeline's actual phase.

### Unified WebSocket event payload with optional durationMs field: start events omit durationMs, completion events include it with timestamp (2026-02-23)
- **Context:** Need to signal both tool start (for badge appearance) and completion (for fade trigger) in same event stream
- **Why:** Single event type reduces event schema complexity and server-side branching. Listeners must check presence of durationMs to differentiate, but this is explicit
- **Rejected:** Could use separate feature:tool-start and feature:tool-complete events, but doubles event volume and requires more subscription logic
- **Trade-offs:** Simpler event volume but shifts responsibility to consumers (check durationMs). Prevents accidental double-subscription bugs but requires defensive coding
- **Breaking if changed:** If listener assumes all tool events have durationMs, completion detection breaks silently and badges never fade out. Type narrowing is essential

#### [Pattern] Return valid empty response structure (not 404/500/null) when queried analytics data doesn't exist: {phaseAverages: {}, slowestTools: [], retryTrends: [], totalFeaturesAnalyzed: 0}. (2026-02-23)
- **Problem solved:** When a project has no completed features, API could error out, return null, or return empty structure. Must decide whether 'no data' is an error condition or valid response.
- **Why this works:** Clients always receive same response shape, eliminating shape-checking conditionals and null-guard code. Error responses reserved for actual failures (invalid projectPath). Treat 'empty dataset' as valid state, not error state.
- **Trade-offs:** Slightly more verbose response size, but eliminates defensive programming in clients. Empty arrays are safe for iteration (clients never need 'if (data)' checks).

#### [Pattern] Public API for clearing internal dedup state becomes necessary when retry mechanisms exist (2026-02-24)
- **Problem solved:** clearProcessedProject() method was added as public, implying external systems need to manage the dedup guard
- **Why this works:** Dedup guards create persistent internal state. Retry mechanisms require the ability to reset this state, so it cannot remain purely internal. The alternative (internal-only reset) would couple retry logic to the service
- **Trade-offs:** Exposes implementation detail but enables loose coupling for retry mechanisms

### Unified CeremonyService.getStatus() method consolidates separate getStatus() and getReflectionStatus() methods into single call (2026-02-24)
- **Context:** Multiple status endpoints needed ceremony and reflection state, requiring two separate service calls
- **Why:** Eliminates redundant queries and simplifies the interface - callers get all state in one call. Ceremony and reflection state are always needed together in practice.
- **Rejected:** Keeping separate methods would maintain separation of concerns but increase call sites and risk inconsistency if calls aren't paired
- **Trade-offs:** Easier/faster (single call) but all callers receive all fields even if they only need some. More data passed around than strictly necessary.
- **Breaking if changed:** Code expecting separate getStatus() and getReflectionStatus() methods will fail; any logic relying on lazy evaluation of reflection status will change

### emitDiscordEvent returns Promise<boolean> with validation-level failures returning false rather than throwing. Precondition checks (undefined channelId) happen inside the method. (2026-02-24)
- **Context:** Method had implicit failure modes (Discord not configured, missing emitter, invalid channelId) that went undetected. Callers couldn't distinguish success from failure.
- **Why:** Signal failures to callers via return value instead of exceptions, enabling graceful degradation. Pushes validation responsibility to the method that knows its requirements.
- **Rejected:** Throw exceptions (would crash ceremony service); Return error objects (more complex caller logic); Validate at caller level (scattered validation, missed cases)
- **Trade-offs:** Easier: Non-throwing failures allow ceremony service to stay up. Harder: Callers must check return value. Harder: Lost error details in return value.
- **Breaking if changed:** Exception-based error handlers expecting throws. Code that ignores return value will silently skip counter increments. Code that assumed all events emit will have different behavior.

#### [Pattern] Endpoint returns placeholder value (discordPostFailures: 0) for fields not yet tracked in service layer (2026-02-24)
- **Problem solved:** Added GET /api/ceremonies/status endpoint but actual Discord failure tracking not yet implemented in ceremonyService
- **Why this works:** Prevents breaking API changes later when tracking is added. Clients can rely on field existing; implementation can be added without changing schema. Signals forward intent in codebase
- **Trade-offs:** API has unused fields now; future work extends implementation not interface. Slightly misleading (0 doesn't mean no failures, could mean not tracked)

### Return `success: false` with detailed error message when PR remains OPEN after merge command, rather than returning `success: true` with `autoMergeEnabled` flag (2026-02-24)
- **Context:** Distinguishing between truly merged PRs vs auto-merge-pending PRs in the API response
- **Why:** Callers expect `success: true` to mean 'work is done and landed' - returning true for OPEN PRs creates false confidence. Conservative approach prevents downstream callers from treating pending merges as completed work.
- **Rejected:** Optimistic approach: return `{ success: true, autoMergeEnabled: true, checksPending: true }` - exposes internal state but invites misinterpretation that PR is landed
- **Trade-offs:** Conservative approach forces callers to handle `success: false` cases, but ensures correct semantic meaning. Optimistic approach is more informative but semantically confusing.
- **Breaking if changed:** If changed to optimistic success=true for OPEN PRs, callers that check success flag alone (ignoring metadata) would incorrectly assume PR is merged, causing bugs in downstream workflows

#### [Pattern] Implemented getStats() as first-class public method on KnowledgeStoreService returning comprehensive metrics (counts, sizes, breakdown by type) (2026-02-24)
- **Problem solved:** Knowledge store is new foundational component - needs observability from the start
- **Why this works:** Statistics method provides debugging visibility, monitors store health, enables quota enforcement, allows informed decisions about store performance. First-class API method (not buried in logs) signals its importance.
- **Trade-offs:** Gains: Observable, testable, discoverable interface for store metrics. Losses: Small overhead to calculate stats on request (could be mitigated with caching)

#### [Gotcha] Twitter requires both og:image AND twitter:image meta tags despite og:image being standard, because Twitter's parser checks for twitter:image first for backward compatibility (2026-02-24)
- **Situation:** Adding social sharing support across multiple platforms
- **Root cause:** Twitter's card parser has legacy behavior of checking twitter:image first and only falling back to og:image if missing. Providing both ensures compatibility across crawler versions
- **How to avoid:** Minor HTML duplication but guarantees Twitter cards render correctly across all client versions

#### [Gotcha] Buttondown API requires fetch with mode: 'no-cors', which prevents reading response body. Success is inferred from promise resolution, not from HTTP response content. (2026-02-24)
- **Situation:** Third-party email service integration to external API endpoint
- **Root cause:** Buttondown API does not set CORS headers properly, forcing no-cors mode as the only option to submit from browser
- **How to avoid:** Simplicity of direct client-side submission vs. inability to validate actual API response content

#### [Gotcha] Buttondown API requires fetch with mode: 'no-cors', which prevents reading response body. Success must be inferred from promise resolution rather than HTTP status codes. (2026-02-24)
- **Situation:** Integrating with Buttondown email service for email capture
- **Root cause:** Buttondown's CORS policy blocks standard fetch; no-cors mode allows request but sacrifices response inspection
- **How to avoid:** Simpler client implementation but cannot distinguish between genuine success and network completion; harder to detect real failures

#### [Gotcha] Buttondown requires specific FormData fields (embed=1, tag=launch-list) beyond just the email address. These hidden fields control email categorization and campaign tracking. (2026-02-24)
- **Situation:** Sending email to Buttondown's embed-subscribe endpoint
- **Root cause:** Buttondown's API design uses these fields to organize incoming emails into lists and track signup source
- **How to avoid:** Tightly coupled to Buttondown's API contract; changing email provider requires rewriting submission logic

#### [Pattern] Accessibility features (skip link, semantic HTML, ARIA labels, main landmark) implemented as standard pattern across all landing pages, not optional (2026-02-24)
- **Problem solved:** Creating consistent landing page following existing protoLabs patterns
- **Why this works:** Accessibility as standard ensures WCAG compliance across portfolio without page-by-page decisions. Improves SEO (semantic HTML), user experience, and legal risk mitigation. Skip link and main landmark are quick wins enabling keyboard users
- **Trade-offs:** Small implementation cost gains compliance and inclusivity across entire portfolio; consistent pattern is easier to audit

#### [Pattern] Defensive regex parsing of LLM output: `/[\[\s\S]*\]/` extracts JSON arrays even when wrapped in markdown code blocks. Claude wraps JSON in triple backticks despite being told to return only JSON. (2026-02-24)
- **Problem solved:** Haiku generation prompt says 'return only a JSON array' but LLM often wraps it in markdown code fences anyway
- **Why this works:** LLM output is inherently unpredictable despite instruction clarity. This pattern handles common deviations without failing the entire operation.
- **Trade-offs:** Regex makes parsing robust but less strict; if malformed JSON exists outside brackets, it passes through silently

#### [Pattern] Exposing `retrieval_mode` in API response enables production observability of which fusion algorithm executed for each search (2026-02-24)
- **Problem solved:** Supporting three retrieval modes with fallback logic that makes actual execution mode non-obvious from request alone
- **Why this works:** Allows tracking HyPE adoption rates, comparing result quality across modes, and correlating algorithm choice with query characteristics in production logs
- **Trade-offs:** Exposing internal detail enables better observability; creates surface area for client code to depend on specific mode values

### All ingest route handlers validate projectPath before calling service methods and return 400 Bad Request if missing (2026-02-24)
- **Context:** Service methods throw errors if called without initialization, which requires projectPath to be set
- **Why:** Creates an explicit precondition check in the API layer, giving clients clear 400 error vs. generic 500 from service layer; prevents invalid state propagation into service
- **Rejected:** Let service handle validation - simpler route code but worse client UX (500 instead of 400); no validation - service errors become the contract
- **Trade-offs:** Duplicate validation (routes + service initialization) vs. clear API contracts; more defensive but more code in handlers
- **Breaking if changed:** Without the 400 validation, clients get error messages from the service layer which are less actionable and could expose implementation details

### Separate /api/knowledge/eval-stats endpoint for aggregate retrieval statistics rather than embedding stats in search response (2026-02-24)
- **Context:** Need observability into retrieval mode effectiveness without bloating every search response
- **Why:** Separation of concerns: each search response is optimized for latency (minimal payload), while eval stats are for analytical consumption. Keeping stats out of search payload avoids overhead on hot path.
- **Rejected:** Include stats in search response (bloats every query response), compute stats on-demand (expensive to aggregate large logs)
- **Trade-offs:** Stats are aggregate (lose per-search breakdown), requires separate endpoint call. Enables efficient monitoring while keeping search path lean.
- **Breaking if changed:** If stats endpoint is removed, lose visibility into retrieval mode distribution and effectiveness metrics

### PenVariable.values uses Record<string, unknown> instead of strongly-typed theme variants (2026-02-24)
- **Context:** Supporting theme-dependent variable values that can be colors, dimensions, or other types
- **Why:** Flexibility to store any value type per theme without complex generic constraints; matches pattern used in design tools
- **Rejected:** Alternative: PenVariableValues<T> generic would provide type safety but requires complex type arithmetic for multi-type variables
- **Trade-offs:** Gains flexibility and simpler consumer API; loses type safety requiring runtime validation when accessing values
- **Breaking if changed:** Changing to strongly-typed values would require all consumers to implement type guards or TypeScript overloads

#### [Pattern] traverseNodes uses visitor callback pattern rather than returning materialized node arrays (2026-02-24)
- **Problem solved:** Large design files (88+ nodes) with potential for many more in enterprise usage
- **Why this works:** Callback pattern allows streaming-like behavior - processes nodes as encountered without loading full tree into memory; enables early termination without wasted iteration
- **Trade-offs:** Easier: Memory efficient, composable; Harder: Cannot reuse same traversal result multiple times, requires understanding callback semantics

### resolveVariable requires explicit theme/variables context parameters rather than baking them into parser (2026-02-24)
- **Context:** Variables use $--prefix syntax that resolves differently per theme variant
- **Why:** Design system variables are context-dependent - same variable might resolve to different color in light vs dark theme; keeps parser stateless and allows resolving same document under different themes without re-parsing
- **Rejected:** Storing theme on parser instance or in document metadata - would require re-parsing to switch themes
- **Trade-offs:** Easier: Flexibility, testability; Harder: Caller must manage theme context and pass it correctly
- **Breaking if changed:** If theme was baked into document, couldn't generate multiple theme variants from single parsed file without re-parsing

### VariableResolver type imported from @protolabs-ai/types rather than defined inline in style-utils.ts (2026-02-25)
- **Context:** Style utilities need to accept a resolver function with specific signature for theme variable resolution
- **Why:** Centralized type definition ensures consistency across the codebase; changes to resolver contract stay synchronized across all consumers
- **Rejected:** Inline types or use 'any' would avoid the import but creates risk of signature drift between utils and context
- **Trade-offs:** Requires monorepo type coordination but prevents silent breaking changes when resolver signature evolves
- **Breaking if changed:** If types are changed in @protolabs-ai/types without updating callers, style-utils become type-incompatible at compile time (safe failure)

#### [Gotcha] Environment variable interpolation in Grafana provisioned configs uses ${VAR_NAME} syntax, not $VAR_NAME or ${VAR_NAME} as bash/Docker (2026-02-25)
- **Situation:** Discord webhook URL stored in DISCORD_WEBHOOK_INFRA environment variable, referenced in contactpoints.yml as ${DISCORD_WEBHOOK_INFRA}
- **Root cause:** Grafana's provisioning system has its own variable interpolation layer separate from container runtime
- **How to avoid:** ${VAR_NAME} syntax is Grafana-specific knowledge required. Benefit is that provisioning works consistently across deployment methods (K8s, Docker, manual).

### Discord contact point template uses Go template syntax ({{ .GroupLabels.alertname }}) for message formatting, not Jinja or other template engines (2026-02-25)
- **Context:** Alert messages need dynamic content: alert name, severity, dashboard links, timestamps - all embedded in single Discord message template
- **Why:** Grafana unified alerting standardized on Go templates for all message templates. Using Go templates ensures consistency across contact point types (Discord, email, webhook).
- **Rejected:** Custom Go template in webhook handler: Would require separate service, more infrastructure, harder to version control
- **Trade-offs:** Go templates provide full expression power within Grafana. Benefit is templates are version-controlled with alerting config. Cost is Go template syntax is less intuitive than other template languages.
- **Breaking if changed:** If someone uses Jinja syntax or other template language, template rendering fails silently and generic message gets sent to Discord instead of formatted alert details.

#### [Gotcha] Linear API requires team-specific label IDs that aren't easily discoverable without additional API calls (2026-02-25)
- **Situation:** Attempted to apply labels to created Linear issues using label names. Discovered Linear only accepts label IDs, which require querying the team's labels endpoint first.
- **Root cause:** Linear labels are team-scoped resources. The API doesn't support name-based label lookups - you must know the ID beforehand or query the labels list.
- **How to avoid:** Simplified to text-based label hints in issue description. Trade structured label filtering/querying capability for reduced API calls and complexity. Production may need to query labels upfront and cache.

### Used two-tier severity classification ('warn' vs 'block') for violations instead of numeric scores (0-10) or detailed enum with many levels. (2026-02-25)
- **Context:** Defining violation severity to help callers decide whether to reject or log
- **Why:** Binary severity simplifies decision-making: 'block' violations should always be rejected (safety boundary), 'warn' violations are suspicious but might be legitimate (audit trail). More granular scoring (numeric 0-10) doesn't add value—callers still need a cutoff threshold and reasoning becomes arbitrary.
- **Rejected:** Numeric severity scale 0-10 (arbitrary thresholds, hard to explain), five-tier enum (too many levels, unclear practical difference between levels), boolean strict flag (loses severity information for logging)
- **Trade-offs:** Less expressive than granular scales, but decisions are binary and easy to reason about. Callers can't tune sensitivity precisely, but the library isn't designed for that—it's a gatekeeper.
- **Breaking if changed:** If severity is removed (treating all violations equally), callers lose the ability to distinguish critical security issues from suspicious patterns. If expanded to many levels, callers must decide which thresholds to enforce, reinventing the binary decision the library should provide.

#### [Pattern] Two-tier API fallback during endpoint migration: tries new fetchMetrics() with dual endpoints (/api/metrics/summary + /api/langfuse/costs), falls back to legacy getLedgerStats() if unavailable, returns null gracefully if all fail. (2026-02-25)
- **Problem solved:** Transitioning from legacy metrics API to new Langfuse-backed cost tracking without breaking existing stats generation.
- **Why this works:** Decouples stats script deployment from server API readiness. Server may not have new endpoints implemented yet, or Langfuse may not be configured. Script must work in all states.
- **Trade-offs:** Code complexity increases (3 codepaths), but deployment flexibility increases. No forced coordination between server and stats script releases.

### Two separate API endpoints for cost metrics: /api/metrics/summary (aggregated stats) and /api/langfuse/costs (detailed breakdown by model). Both queried, results merged into stats object. (2026-02-25)
- **Context:** Server now supports Langfuse integration for cost tracking. Stats need both summary (totalCost, avgCostPerFeature) and detailed breakdown (costByModel).
- **Why:** Separation of concerns. Summary endpoint fast + cacheable (aggregated). Langfuse endpoint may be slower (queries external service). Kept separate to allow independent caching/optimization.
- **Rejected:** Single /api/metrics endpoint returning all stats. Would couple update frequency and cause one slow query to block both paths.
- **Trade-offs:** Scripts must orchestrate two API calls (slight complexity). Endpoints must be kept in sync (schema contract). But each can be tuned independently.
- **Breaking if changed:** Removing Langfuse endpoint means costByModel is unavailable. Removing summary endpoint means primary cost fields become unavailable. Both should degrade separately.

### Consistent response envelope: success boolean + error/data fields in all responses, no bare object returns (2026-02-25)
- **Context:** GET returns { success: true, userName, source }; POST returns { success: true, userName, source }; errors return { success: false, error }
- **Why:** Predictable client handling; client can check .success before reading .userName or .error
- **Rejected:** Bare responses (return object on success, throw on error; status code only indicates outcome)
- **Trade-offs:** Explicit success field adds 1 byte per response vs eliminates need for status-code-only parsing; enables middleware success tracking
- **Breaking if changed:** If client code checks response.userName directly without .success guard, will fail on error responses (error field is string, not object)

### Identity stored as simple string in app-store instead of user object or session structure. Endpoints are `/api/user/identity` (GET/POST). (2026-02-25)
- **Context:** Needed to persist user's name for 'My Tasks' filter. Could be full user profile, JWT claim, or just string.
- **Why:** String is simplest schema, easy to compare in filter logic (`assignee === userIdentity`). Reduces payload size. Works for 'name-based' filtering.
- **Rejected:** Full user object: overkill, harder to serialize. JWT/session claim: requires auth system (out of scope). localStorage only: loses cloud sync.
- **Trade-offs:** String is lightweight but doesn't scale if features need user ID, email, permissions. Filter logic must handle case sensitivity and exact matches.
- **Breaking if changed:** If later needing user ID or other fields, must migrate stored string to object structure. Existing string identities need schema upgrade.

### Uses query parameter /file?path= instead of path parameter /file/:filename for path traversal validation control (2026-02-25)
- **Context:** Choosing between REST conventions and security simplicity in file serving endpoint
- **Why:** Query params are not auto-decoded by Express before handler runs, keeping raw string available for validation. Path params are decoded first, which means validation must account for encoded traversal attempts (e.g., %2e%2e%2f). Query string gives a cleaner validation point.
- **Rejected:** Path param /file/:filename - would require validating after Express URL-decodes :filename, adding complexity for double-encoding attacks
- **Trade-offs:** Less 'RESTful' by query param convention, but simpler security model. Trade-off favors security correctness.
- **Breaking if changed:** If changed to path param, must validate decoded :filename, not raw request. Encoded traversal attacks become possible if validation runs before decoding.

#### [Pattern] Title extraction with H1 heading fallback to filename slug - extracts from markdown H1 if present, falls back to derived filename if missing (2026-02-25)
- **Problem solved:** Generating human-readable document titles for list endpoint and UI display
- **Why this works:** Solves two UX problems: (1) documents with H1 headings get proper titles, (2) documents without H1 don't cause errors or empty titles. Regex-based extraction is lighter than parsing AST. Fallback to filename slug is always available.
- **Trade-offs:** More complex logic (regex + fallback) vs simpler single-source logic. Better UX wins the trade-off.

### Returns 400 (Bad Request) for path traversal attempts, 404 (Not Found) for missing files (2026-02-25)
- **Context:** Distinguishing between request validation failure and resource not found in error responses
- **Why:** 400 signals the client sent a malformed/invalid request (traversal attempt fails validation). 404 signals the request was valid but resource doesn't exist. This semantic distinction matters for client error handling and logging.
- **Rejected:** Always return 404 for both cases - hides validation failures, makes debugging harder. Return 403 for traversal - semantically wrong, 403 is for permission denied, not request validation.
- **Trade-offs:** More precise semantics vs simpler implementation (could return 404 for everything). Precision helps with monitoring and client-side error recovery.
- **Breaking if changed:** If changed to always 404, clients cannot distinguish attacks from legitimate missing files. Monitoring/alerting on 400s helps detect traversal attempts.