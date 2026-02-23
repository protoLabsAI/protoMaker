---
tags: [security]
summary: security implementation decisions and patterns
relevantTo: [security]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 29
  referenced: 17
  successfulFeatures: 17
---
# security

### Explicitly filtering to only resolve threads authored by known bots, leaving human review threads untouched (2026-02-10)
- **Context:** Automating thread resolution without human involvement - what prevents accidentally removing human feedback?
- **Why:** Human review threads could contain critical feedback or legal requirements (e.g., compliance checkoff). By white-listing only known bot accounts, we ensure human reviewers' threads are always preserved. Case-insensitive bot name matching catches both `coderabbitai` and `CodeRabbitAI` variants.
- **Rejected:** Resolve all threads - risks losing human feedback. Resolve based on thread content pattern - too fragile, could misidentify
- **Trade-offs:** Easier: safe by default, human threads always preserved. Harder: requires maintaining bot whitelist
- **Breaking if changed:** If filtering is removed, human reviewer feedback could be accidentally marked resolved - creates compliance/feedback loss risk

### EM agent uses configured mergeStrategy from gitWorkflow settings (squash/merge/rebase), not hardcoded strategy (2026-02-10)
- **Context:** Different teams have different merge policies. Monorepo squash, microservices merge, etc. Strategy should be configurable per project.
- **Why:** Projects have existing branch protection rulesets and commit history standards. Respecting configured strategy avoids conflicts with existing policies and unexpected history shapes.
- **Rejected:** Alternative: Hardcode squash strategy (mentioned in memory as preferred). Breaks projects using merge-commit strategy, creates inconsistent commit history.
- **Trade-offs:** Easier: Respects existing project policies. Harder: Strategy must be set up correctly in settings before merge works.
- **Breaking if changed:** If strategy is hardcoded, teams using non-squash strategies see unexpected commit history. PR merge succeeds but violates team commit policy, potentially breaking CI checks downstream.

#### [Pattern] Defense-in-depth for critical platform limitations: dual-layer guards (service-level + API-level) + agent prompt warnings. (2026-02-10)
- **Problem solved:** Single point of failure in worktree deletion could break entire user sessions. Need redundancy.
- **Why this works:** Multiple layers ensure the constraint is enforced regardless of code path: automated cleanup (service guard), manual deletion via UI (API guard), and agent awareness (prompt warnings). If one layer fails, others catch it.
- **Trade-offs:** Adds complexity and slight performance overhead (multiple checks), but prevents catastrophic failure mode (broken sessions). Cost is trivial compared to value.

#### [Pattern] Multi-layer safety checks before destructive operations: merge status verification → working directory state → current branch protection → force-only after all pass (2026-02-10)
- **Problem solved:** Auto-cleanup of stale worktrees and branches needs to prevent accidental data loss while operating autonomously without human approval
- **Why this works:** Single-layer checks can race or miss edge cases. Merge status alone doesn't guarantee safety if worktree has uncommitted work or is currently active. Layered approach catches all combinations of unsafe states
- **Trade-offs:** More code and function calls per cleanup, but provides complete safety guarantee. Performance cost is negligible (milliseconds) vs. risk of data loss

#### [Gotcha] Git worktree cannot be deleted while it is the current working directory in any process, even if that process will exit immediately after (2026-02-10)
- **Situation:** Attempting to cleanup worktrees from within a subprocess that might have cd'ed into the worktree path
- **Root cause:** Git worktree directory becomes locked by the process that owns the CWD. Operating system prevents directory deletion while it's in use by a process. In Claude Code specifically, if you `cd` into a worktree then try to delete it, the shell persists the broken CWD and all subsequent commands fail
- **How to avoid:** Must verify worktree is not current directory before any removal attempt. Adds runtime check but prevents silent failures and shell corruption

### Scoped tool set for Frank (7 tools) vs full agent toolkit (20+) (2026-02-12)
- **Context:** Frank spawned automatically on critical health. Restricting tools to diagnosis-only set.
- **Why:** Auto-spawned agents on system events are higher risk - no operator review before execution. Scoped tools prevent accidental/malicious scope creep (e.g., deleting branches, modifying Linear, committing code). Frank's role is diagnostic (read logs, check health, post findings), not remediation.
- **Rejected:** Alternative: Give Frank full toolkit like manual agents. Rejected because: (1) unreviewed agent shouldn't have write access to critical systems, (2) diagnosis doesn't require branch creation/feature management, (3) establishes security precedent for future auto-spawned agents
- **Trade-offs:** Gained: blast radius limited if Frank makes errors. Lost: Frank can't auto-remediate (e.g., rollback bad feature, disable agent)
- **Breaking if changed:** If full toolkit granted: Frank could accidentally delete features, commit breaking changes, or spam Discord during diagnosis loop

#### [Gotcha] Shebang must be LF-only (\n) not CRLF (\r\n) on mixed-OS teams or git autocrlf=true repos (2026-02-13)
- **Situation:** If file written with CRLF, shebang becomes '#!/usr/bin/env node\r' which doesn't match, and chmod +x doesn't help
- **Root cause:** OS kernel interprets shebang line literally. \r breaks the magic number detection. Git's autocrlf setting can silently convert on Windows checkout
- **How to avoid:** Easier: LF default on most systems. Harder: Windows teams need .gitattributes or core.safecrlf=warn setup, hidden failure mode

### Mock API functions return hardcoded gap analysis data instead of reading sensitive project info from disk during demonstration phase (2026-02-13)
- **Context:** CLI needed realistic output for testing without actually scanning real repositories or exposing secrets from .env files during demo/development
- **Why:** Hardcoded mock data prevents accidental reads of .env, credentials, or private git history during CLI development. Real implementation will read from files/git safely. Keeps security layer at API boundary (server reads files, CLI receives sanitized JSON)
- **Rejected:** Alternative: Read actual repository structure during development. Risks exposing secrets if error handling is incomplete. Also creates coupling between CLI and filesystem that breaks in CI/CD
- **Trade-offs:** Easier: Development safety, portable tests. Harder: Mock data must be maintained, may diverge from real output format
- **Breaking if changed:** If mock functions are replaced with real fs reads without proper sanitization, CLI could dump env vars, private keys, or git history to stdout in JSON output

#### [Gotcha] YAML template files with placeholder syntax like {{packageManager}} fail Prettier pre-commit validation because placeholders are invalid YAML. Must add template directories to .prettierignore to prevent formatting attempts. (2026-02-13)
- **Situation:** CI workflow template files contained {{packageManager}} placeholders for runtime interpolation. Pre-commit hook ran Prettier on all files including templates, failing on invalid syntax.
- **Root cause:** Prettier validates syntax during pre-commit. Template files are not valid YAML/JSON until placeholders are interpolated, so they must be excluded from formatting.
- **How to avoid:** Adding to .prettierignore prevents syntax validation on templates (minor risk) but enables fast iteration on template syntax. Templates must be manually validated.

#### [Gotcha] Phase logs entire error from GitHub API (via gh cli) to stdout without sanitizing, but GitHub auth tokens are typically in gh CLI cache not in command output (2026-02-13)
- **Situation:** createBranchProtectionRuleset catches and logs gh CLI stderr, but GitHub error responses may contain sensitive data
- **Root cause:** gh CLI is already authenticated via ~/.gh-hosts.yml cache, so command output shouldn't contain raw tokens. Logging errors helps with debugging
- **How to avoid:** Good visibility into failures; risk if GitHub starts returning request bodies or other context in error messages

### Pre-flight write permission check on target path before any setup begins (2026-02-13)
- **Context:** Setup creates directories, git repos, and modifies files. If permissions denied midway, partial state leaks.
- **Why:** Fail-fast on permission issues before any side effects. Prevents partial setup on user error (wrong target directory, insufficient permissions).
- **Rejected:** Just-in-time permission checks (check when needed) - would fail mid-setup, leaving partial state to rollback
- **Trade-offs:** Easier: clear error upfront, no rollback needed. Harder: requires upfront filesystem access verification.
- **Breaking if changed:** If permission check removed, setup proceeds and fails partway through. Rollback must clean up leaked state. Cost of re-implementing is high.

### Cross-platform bd CLI detection using which/where rather than hardcoded paths or shell aliases (2026-02-13)
- **Context:** bd CLI location varies: /usr/local/bin/bd, ~/.cargo/bin/bd (Rust binary), Windows paths differ. Need to know if bd is available before running init
- **Why:** which/where is the portable standard - respects PATH, handles aliases, works on all POSIX systems and Windows. Matches how shell would resolve the command
- **Rejected:** Hardcoded /usr/local/bin/bd fails for users with custom installations. Checking process.platform and mapping paths is fragile and incomplete
- **Trade-offs:** which/where requires shelling out but is reliable. Try-catch on execSync handles 'not found' (exit code 1) gracefully
- **Breaking if changed:** If which/where behavior changes (unlikely) or if bd is intentionally on PATH but not executable, detection fails. Real-world impact minimal - PATH manipulation is user error

#### [Pattern] Path traversal validation using path.resolve() comparison against project root before any file operations (2026-02-13)
- **Problem solved:** Filesystem validator needed to prevent ../../../ attacks when processing user-provided paths or template-based file references.
- **Why this works:** Path traversal is a classic attack vector. Resolving to absolute path and validating it starts with project root catches all escape attempts. Applied BEFORE any fs.readdir/stat calls.
- **Trade-offs:** Requires stat() call per path (small I/O cost) but prevents catastrophic information disclosure. Worth the overhead.

#### [Pattern] Template variable validation extracts ALL {{variables}} before rendering, validates against source object structure (2026-02-13)
- **Problem solved:** Templates reference variables like {{discord.categoryId}} that might not exist at render time, causing undefined substitutions and silent failures.
- **Why this works:** Pre-flight validation catches missing variables before template rendering. Prevents undefined values in rendered output which downstream code might misinterpret.
- **Trade-offs:** Requires object schema walk to validate nested variables (discord.categoryId), but catches 100% of missing vars. Slightly slower on large templates, much safer.

#### [Pattern] Filesystem validator checks for reserved Windows names (CON, PRN, AUX, etc) and enforces path length limits even on Unix systems (2026-02-13)
- **Problem solved:** Paths might be persisted to Windows machines or synced across platforms. Runtime path validation should prevent platform-specific issues.
- **Why this works:** Reserved names cause failures when paths are shared or migrated. Path length limits prevent filesystem errors on FAT32/NTFS. Platform-agnostic validation is defensive.
- **Trade-offs:** Stricter validation everywhere, but prevents cross-platform sync issues. Some valid Unix paths (CON.txt) rejected, acceptable trade for safety.

### Store Discord channel IDs and webhook ID in plaintext within protolab.config, not encrypted or remote (2026-02-13)
- **Context:** Persisting Discord channel and webhook metadata after creation for later phase access
- **Why:** protolab.config is already checked into git (or used as local config); Discord IDs are non-sensitive (guild/channel IDs are public in Discord); webhook IDs can be rotated
- **Rejected:** Encrypt config (adds complexity), store remotely (requires backend), environment variables (not persistent across CLI invocations)
- **Trade-offs:** Easier: simple file persistence. Harder: webhook secret leakage risk if config uploaded to public repo
- **Breaking if changed:** If webhook IDs become sensitive (Discord changes security model), all existing configs are exposed

#### [Gotcha] Provider name validation uses exhaustive string literal union (as const) rather than regex or allowlist check (2026-02-13)
- **Situation:** Config could specify arbitrary provider names that don't exist in factory
- **Root cause:** TypeScript ensures all provider names in config match exact set of supported providers at compile time. Runtime validation via Zod ensures malformed configs caught immediately. 'as const' enables exhaustive type checking.
- **How to avoid:** Easier: single source of truth in type. Harder: adding new provider requires updating both type and Zod schema.

### Credentials passed through environment variables (AWS_REGION, GROQ_API_KEY, etc.) rather than config files or constructor parameters (2026-02-13)
- **Context:** Three providers with different credential types: API keys, AWS credentials, localhost URL
- **Why:** Environment variable pattern is standard for secrets, never persisted in code/config, easy for CI/CD, works across package boundaries without passing credentials through function signatures
- **Rejected:** Config files would risk accidental commits. Constructor parameters would leak credentials in logs and error messages. Hardcoding would be explicit security risk
- **Trade-offs:** Requires environment setup overhead, but keeps code completely credential-free. Harder to debug credential issues locally
- **Breaking if changed:** If providers switch to config file or parameter-based credentials, deployment scripts must be updated, and risk of secret leakage increases significantly

#### [Gotcha] Examples explicitly avoid handling real API keys in version control but need to document safe patterns for users (2026-02-13)
- **Situation:** Documentation must show how to handle secrets properly without leaking them
- **Root cause:** API keys in examples create supply-chain risk. Users who copy examples directly inherit the security practices shown.
- **How to avoid:** Examples are less 'complete' (missing actual API calls) but safer. Documentation burden shifted to explaining .env patterns clearly.

### Session ID comes from URL path parameter (:sessionId), enabling session-scoped permission checking at routing layer (2026-02-18)
- **Context:** Multiple users/sessions could potentially access the API, need to ensure users only modify ideas in their own sessions
- **Why:** URL-path session ID makes authorization middleware simple: check if authenticated user owns the session from the URL before reaching route handler. Prevents entire classes of privilege escalation bugs.
- **Rejected:** Could extract session from JWT/auth context only, but would require business logic inside handlers to validate session ownership, creating authorization bypass opportunities
- **Trade-offs:** URL parameter is visible in logs and browser history (but session ID itself isn't sensitive), but provides explicit authorization checkpoints
- **Breaking if changed:** If sessions become cross-user shareable, the assumption that URL sessionId = owner identity breaks, requiring additional permission checks inside handlers

#### [Pattern] Repository field in package.json with monorepo directory path ("directory": "libs/ui") enables npm audit and tooling to resolve vulnerabilities to correct source location in monorepo (2026-02-18)
- **Problem solved:** Monorepo packages without explicit directory path confuse npm tooling about where the source code actually lives
- **Why this works:** npm audit, GitHub dependency tracking, and third-party supply-chain tools use repository.directory to map published packages back to source. Without it, tools report vulnerabilities against wrong path or fail to cross-reference.
- **Trade-offs:** Explicit directory adds 1-2 lines to package.json but gives complete supply-chain visibility. Cost is negligible, benefit is infrastructure-level.

#### [Pattern] OAuth CSRF protection using state parameter stored in in-memory JavaScript Map with 10-minute expiration. States auto-cleanup on each callback. Noted as single-instance solution; production multi-instance deployments require Redis or database. (2026-02-22)
- **Problem solved:** CSRF attacks on OAuth redirect can trick users into authorizing attacker's client. State parameter prevents this by validating request source.
- **Why this works:** State parameter is OAuth 2.0 standard (RFC 6749). In-memory Map is simplest implementation for single instance. 10-minute window is long enough for OAuth flow but short enough to prevent state reuse.
- **Trade-offs:** In-memory state is fast and simple but loses state across process restarts and doesn't scale to multiple servers. Redis/database adds latency but enables horizontal scaling.

#### [Gotcha] HMAC-SHA256 signature verification requires raw body access BEFORE Express JSON parsing middleware consumes the stream (2026-02-23)
- **Situation:** Express middleware chain normally parses JSON automatically. Signature verification needs the original bytes to recompute HMAC. Without raw body, signature verification always fails.
- **Root cause:** HMAC is computed over the exact byte sequence. Once parsed and re-stringified, whitespace/key ordering changes invalidate the hash. Must capture raw buffer at stream entry point.
- **How to avoid:** Custom middleware adds complexity but is unavoidable for security. Adds minimal overhead (one stream capture per request). Alternative: require clients send signature in request body instead of header (weaker security posture).

### Used crypto.timingSafeEqual() for HMAC comparison instead of simple string equality (2026-02-23)
- **Context:** Comparing computed HMAC digest with provided signature in HTTP header
- **Why:** Prevents timing attacks where attacker measures response latency to infer correct signature byte-by-byte. Standard equality (===) short-circuits early on mismatch, leaking information about correct prefix length.
- **Rejected:** Simple === comparison (exploitable to timing attacks), or custom constant-time comparison logic (reinventing wheel, error-prone)
- **Trade-offs:** timingSafeEqual() requires both inputs to be same length - forces digest comparison to fail fast if lengths differ, then safe comparison on valid-length pairs. Minimal performance impact for string comparison scale.
- **Breaking if changed:** Switching to standard equality makes signature verification vulnerable to timing side-channel attacks that can recover the secret key

### Webhook secret stored in environment variable (LANGFUSE_WEBHOOK_SECRET) loaded at runtime, not hardcoded (2026-02-23)
- **Context:** Secret needed to verify HMAC signatures from Langfuse. Could be hardcoded, hardcoded-per-env, or env-var.
- **Why:** Environment variable allows different secrets per deployment (dev/staging/prod) without code changes. Prevents accidental secret leakage in version control.
- **Rejected:** Hardcoding secret (leaks in git history), or reading from secrets file at startup (requires file distribution, more complex deployment)
- **Trade-offs:** Env var approach requires deploy process to inject secret - adds deployment step but is industry standard. If env var is missing, verification fails safely (returns 401).
- **Breaking if changed:** Removing env var loading will cause HMAC verification to fail with undefined secret, rejecting all valid webhooks

### Webhook signature verification uses HMAC-SHA256 with `x-langfuse-signature` header, but header name is assumed without documentation verification (2026-02-23)
- **Context:** Signature verification prevents spoofed webhooks from external sources. Implementation follows Linear webhook pattern but Langfuse header name was not cross-referenced against official docs
- **Why:** Pattern consistency with existing Linear webhook (uses same HMAC approach). Security requirement for webhook authenticity.
- **Rejected:** Skipping signature verification entirely - leaves endpoint open to spoofed events. Using documented/verified header name per vendor docs would be more reliable.
- **Trade-offs:** Pro: Prevents spoofed webhooks. Con: Incorrect header name means all webhooks fail verification silently (only logged, not returned to caller).
- **Breaking if changed:** If header name is wrong, webhook signature check always fails. Events are silently dropped (logged but processed). Discovering this requires monitoring logs, not API feedback.