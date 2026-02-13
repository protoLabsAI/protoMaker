---
tags: [api]
summary: api implementation decisions and patterns
relevantTo: [api]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 22
  referenced: 13
  successfulFeatures: 13
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