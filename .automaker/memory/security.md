---
tags: [security]
summary: security implementation decisions and patterns
relevantTo: [security]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 73
  referenced: 21
  successfulFeatures: 21
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

### Missing GITHUB_TOKEN results in silent skip with warning log, not error/exception throw (2026-02-23)
- **Context:** Service checks for GITHUB_TOKEN and returns {success: false, error: 'GITHUB_TOKEN not configured'} rather than throwing
- **Why:** Graceful degradation - prompts can sync if token exists, skip if not. Prevents deployment failures if token is optional in some environments. Caller can check result.success to decide behavior.
- **Rejected:** Throwing error on missing token - would require try/catch in all callers, would fail deployments where prompt sync is optional
- **Trade-offs:** Caller must check result.success rather than catching exceptions - slightly more verbose but prevents silent failures. Server continues running even if prompts can't sync.
- **Breaking if changed:** Changing to throw on missing token would require updating all callsites to handle exception. Current return-result pattern allows optional/degraded operation.

#### [Gotcha] Environment variables split across TWO separate .env files with different purposes and locations: project root .env (dev server) vs plugin .env (MCP server). Each file sources different auth tokens and API keys for different systems. (2026-02-23)
- **Situation:** CLAUDE.md memory states 'Two .env files are the ONLY sources of truth' but the implementation only updated apps/server/.env.example, not the plugin .env location
- **Root cause:** Separation of concerns: dev server needs ANTHROPIC_API_KEY, DISCORD_TOKEN, LINEAR_API_TOKEN; plugin needs DISCORD_BOT_TOKEN, LINEAR_API_KEY, AUTOMAKER_API_KEY. Different authentication scopes and deployment contexts.
- **How to avoid:** Easier: Clear separation of dev vs plugin concerns. Harder: Users must manage two .env files; secrets scattered across locations; plugin .env not documented in this feature

#### [Gotcha] LANGFUSE_WEBHOOK_SECRET was added but there's no documented webhook verification logic in the codebase to validate this secret. Variable exists in .env.example but the consuming code (webhook handler) may not be implemented yet. (2026-02-23)
- **Situation:** Feature added env var to docs but implementation feature itself may be incomplete - webhook verification is a security-critical path that cannot be assumed to exist just because the env var is documented
- **Root cause:** Security principle: never document a secret variable without ensuring it's actually validated in code. Documenting LANGFUSE_WEBHOOK_SECRET without a webhook handler creates a false sense of security - developers will set it thinking they're protected, but if the handler doesn't verify it, the env var is useless.
- **How to avoid:** If webhook verification code doesn't exist: developers waste time setting LANGFUSE_WEBHOOK_SECRET (false sense of security). If verification code exists but wasn't documented: this feature is incomplete.

#### [Gotcha] Path validation middleware in POST /api/ceremonies/retry rejects temporary paths not under ALLOWED_ROOT_DIRECTORY, breaking Playwright tests (2026-02-24)
- **Situation:** Tests attempted to use temporary paths created by test framework, which fail path validation intended to prevent path traversal attacks
- **Root cause:** Middleware validates all file paths against allowed root to prevent security issues. This is correct security posture but creates a hard constraint on what paths endpoints accept.
- **How to avoid:** Gain security constraint enforcement, lose ability to test with arbitrary paths. Production usage limited to paths under ALLOWED_ROOT_DIRECTORY.

#### [Pattern] Conditional feature detection for optional dependencies: `if (window.umami)` before calling analytics. (2026-02-24)
- **Problem solved:** Analytics library (Umami) may not be loaded or available in all environments
- **Why this works:** Gracefully handles missing optional dependencies without blocking form submission or throwing errors
- **Trade-offs:** Silent graceful degradation vs. no visibility into missing analytics setup

#### [Gotcha] ESLint flat config syntax requires /* global require, exports, process, console */ instead of /* eslint-env node */ for CommonJS files (2026-02-24)
- **Situation:** Notarize.js ESLint validation failed with flat config until globals were explicitly declared
- **Root cause:** ESLint flat config (newer specification) changed how execution environments are specified - env comments are no longer supported, requiring explicit global declarations instead
- **How to avoid:** More verbose declarations, but makes runtime dependencies explicit and clearer for readers

#### [Gotcha] com.apple.security.cs.allow-jit entitlement is mandatory for Electron. Without it, app crashes at runtime even if successfully signed and notarized. (2026-02-24)
- **Situation:** Hardened runtime entitlements must be configured to enable macOS code signing
- **Root cause:** Electron's V8 JavaScript engine requires JIT compilation to function. Hardened runtime sandbox disables JIT by default, making this entitlement non-negotiable for app execution.
- **How to avoid:** JIT entitlement slightly weakens hardened runtime security model but is functionally required

#### [Gotcha] RFC 3161 timestamping is mandatory for Windows code signatures to remain valid after certificate expiration (2026-02-24)
- **Situation:** Without timestamping, signed executables become untrusted when the signing certificate expires, forcing all users to obtain a new signed version
- **Root cause:** The signature validity is bound to the certificate lifetime unless decoupled via RFC 3161 timestamp from a trusted authority. This is how Windows validates that a signature was valid at the time of signing.
- **How to avoid:** Requires network access during build to RFC 3161 server (adds ~1-2 seconds), but ensures signature validity persists for years after certificate renewal

#### [Gotcha] SmartScreen warnings show immediately for EV certificates but standard certificates require building reputation over time with Microsoft (2026-02-24)
- **Situation:** New certificates (even standard ones) trigger SmartScreen warnings until Windows gains statistical confidence that the certificate is legitimate
- **Root cause:** Microsoft uses machine learning on certificate reputation and installer telemetry. EV certificates have already passed expensive validation, so they're trusted immediately. Standard certificates are seen as unknown publishers.
- **How to avoid:** EV certificates cost 2-4x more (~$200-400/year) but eliminate SmartScreen immediately. Standard certificates cost less but require weeks/months of reputation building.

#### [Gotcha] Certificate subject name must match exactly what's configured in electron-builder or Windows will reject the signature during installation (2026-02-24)
- **Situation:** During the build, electron-builder validates the certificate CN/subject name matches `certificateSubjectName` configuration
- **Root cause:** This explicit matching prevents accidentally signing with the wrong certificate (e.g., test cert instead of production cert). Mismatch causes vague errors.
- **How to avoid:** Requires maintaining exact string (e.g., 'protoLabs Studio'), but prevents signing with wrong certificate

### Azure Trusted Signing selected as the lower-cost primary option (~$10/month) with traditional EV certificates as fallback option (2026-02-24)
- **Context:** Two viable Windows code signing approaches with different cost/setup/trust profiles
- **Why:** Azure Trusted Signing reduces annual infrastructure cost from $200-400 to ~$120, eliminates need for physical hardware tokens, and integrates with Azure Key Vault. Supporting both allows cost-conscious teams to choose Azure while high-security teams can use EV.
- **Rejected:** EV-only approach is more expensive; Azure-only approach excludes teams who already own EV certificates
- **Trade-offs:** Supporting both adds minor config complexity (env var detection), but maximizes flexibility and cost efficiency
- **Breaking if changed:** Removing Azure support would force teams to buy EV certificates; removing EV support would lock out existing cert investments

### Selected MIT License specifically to avoid copyleft restrictions and ensure compatibility with commercial use cases and future SaaS offerings (2026-02-24)
- **Context:** Choosing between MIT, Apache 2.0, GPL, and other licenses
- **Why:** MIT is permissive, doesn't restrict proprietary forks, and is compatible with all major dependencies (Anthropic SDK, Express, React, Electron). Enables future business models without license conflicts.
- **Rejected:** GPL/LGPL (would require reciprocal licensing and restrict proprietary derivatives), strict Apache 2.0 (more restrictive patent provisions)
- **Trade-offs:** Maximum permissiveness and business flexibility at cost of weaker attribution guarantees for forks
- **Breaking if changed:** Switching to GPL-licensed core dependencies or changing license to GPL creates incompatibility with current MIT dependencies

#### [Pattern] Deferred legal compliance (ToS, Privacy Policy) based on deployment model rather than implementing upfront (2026-02-24)
- **Problem solved:** Project currently self-hosted/local, but may become SaaS in future
- **Why this works:** ToS and Privacy Policy only required for hosted versions with user data collection. Self-hosted installation has different legal posture. Documented requirements with conditional checklist.
- **Trade-offs:** Deferred work reduces current burden but requires documentation that compliance is product-model-dependent

### No license headers in source files; relying on centralized LICENSE file + git history for authorship (2026-02-24)
- **Context:** Many open source projects add license boilerplate to every source file
- **Why:** MIT license with centralized LICENSE file is legally sufficient. Git history provides authorship tracking. Reduces code clutter and boilerplate without losing legal protection.
- **Rejected:** Per-file license headers (common in GPL projects due to stricter requirements), embedded license text
- **Trade-offs:** Cleaner code without boilerplate vs less explicit per-file licensing information
- **Breaking if changed:** If future corporate policy requires per-file license headers or if adding GPL-licensed components, headers become necessary and would require bulk addition

#### [Pattern] Implemented license audit mechanism (license-checker tool) with recommendation for CI/CD enforcement (2026-02-24)
- **Problem solved:** Multiple dependencies with varying licenses; risk of accidentally adding incompatible licenses
- **Why this works:** Prevents license drift - developers can inadvertently add GPL/LGPL dependencies without noticing. Automated CI/CD checks catch this before merge.
- **Trade-offs:** Requires CI/CD setup but prevents expensive license conflicts discovered late in development

### License link in website footer points to GitHub LICENSE file (external) rather than embedding license text (2026-02-24)
- **Context:** Making license discoverable on public website
- **Why:** Single source of truth - ensures website license always matches actual LICENSE file in repo. GitHub link is authoritative and versioned.
- **Rejected:** Embedding full license text (requires syncing when license changes), showing license only in repo (low discoverability for users)
- **Trade-offs:** Requires GitHub to be reachable; ensures accuracy and reduces maintenance burden of dual documentation
- **Breaking if changed:** If GitHub hosting changes or links restructure, website link breaks; need to maintain link integrity

#### [Gotcha] Email validation relies only on HTML5 client-side validation (type='email', required attributes). No server-side validation before sending to Buttondown. (2026-02-24)
- **Situation:** Protecting against invalid email submissions
- **Root cause:** Static HTML landing page with no backend; form sends directly to Buttondown API
- **How to avoid:** Reduces backend complexity but allows malformed emails to reach Buttondown; spam/invalid emails still counted as signups

#### [Pattern] Analytics integration uses placeholder token (REPLACE_WITH_WEBSITE_ID) left in deployed HTML, requiring manual post-deploy configuration step (2026-02-24)
- **Problem solved:** Umami analytics setup requires creating website in external dashboard before getting tracking ID
- **Why this works:** Tracking ID cannot be generated pre-deployment; hardcoding wrong/generic ID would silently fail. Placeholder prevents accidental deployments without analytics, forcing explicit configuration step that confirms infrastructure setup was actually completed
- **Trade-offs:** Clear explicit requirement gains higher likelihood of proper setup vs. requires manual step post-deploy that could be forgotten

#### [Pattern] Persistent volumes explicitly configured in all platform deployment configs to prevent data loss on container restarts, with security headers and CORS at deployment level (2026-02-24)
- **Problem solved:** Stateless container deployments would lose all user data and session information on pod restart without persistent storage configuration
- **Why this works:** Ephemeral container filesystems are temporary by design. Explicit volume mounting in deployment configs ensures data survives container lifecycle events. Security at deployment level provides defense-in-depth rather than relying solely on application code
- **Trade-offs:** Explicit persistent volume configuration adds storage infrastructure complexity and cost, but guarantees data durability. Deployment-level security is more maintainable but less flexible than application-level configuration

#### [Gotcha] com.apple.security.cs.allow-jit entitlement is mandatory for Electron apps - without it the app crashes at runtime despite successful code signing and notarization (2026-02-24)
- **Situation:** Hardened runtime restricts JIT compilation by default for security, but Electron's V8 engine requires JIT for runtime performance
- **Root cause:** This coupling between hardened runtime policy and V8 implementation is non-obvious: failure mode is runtime crash (not signature validation failure), masking the root cause and making debugging difficult
- **How to avoid:** Enabling JIT slightly weakens hardened runtime protections but is acceptable tradeoff for functional Electron applications

### Used GitHub Actions secrets for credential passing (CSC_LINK base64 encoded certificate plus APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID) rather than alternative credential stores (2026-02-24)
- **Context:** CI/CD requires secure automated credential passing for code signing while avoiding repository secrets exposure
- **Why:** GitHub secrets are encrypted at rest, masked in logs, and provide native integration with Actions. Base64 encoding certificates is electron-builder's standard for passing binary data via environment variables - not using this standard would require custom encoding/decoding
- **Rejected:** Repository-stored credentials (insecure), local developer credentials (non-reproducible CI), separate credential vaults (operational complexity)
- **Trade-offs:** Requires managing 5 separate secrets (more configuration) vs monolithic credential approach, but achieves proper separation and auditability
- **Breaking if changed:** Wrong credential format (e.g., incorrect base64 encoding, missing app-specific password) causes silent notarization failures in CI, not fast feedback

#### [Pattern] Uses 'git add -A' (all changes including deletions) rather than selective staging, with conventional commit format 'chore: auto-commit' (2026-02-24)
- **Problem solved:** Agent-generated work includes new files, modifications, and potentially deletions that must be captured in one atomic commit
- **Why this works:** Captures complete state without whitelist/blacklist of file types. Conventional commit format makes intent transparent in git history for auditing and tooling.
- **Trade-offs:** Less granular control over what gets committed (could stage unintended files), but ensures no agent progress is left uncommitted

#### [Gotcha] RFC 3161 timestamping is CRITICAL for long-term signature validity. Signatures expire with the certificate unless timestamped. (2026-02-24)
- **Situation:** Developers might assume a signed executable stays valid forever. Without timestamping, signed apps become 'untrusted' when certificate expires.
- **Root cause:** Timestamps are permanent proof of when signature was made. Microsoft respects timestamp validity after cert expiration.
- **How to avoid:** Adds one more required dependency (RFC 3161 server) but ensures long-term trust

#### [Gotcha] SmartScreen reputation system treats EV certificates (immediate trust) and standard certificates (requires reputation building) differently. Azure Trusted Signing has immediate trust. (2026-02-24)
- **Situation:** Teams often choose cheapest certificate option without realizing SmartScreen warnings will persist for months on standard certs
- **Root cause:** Microsoft trusts EV certs and Microsoft's own signing infrastructure (Azure). Standard certs need reputation signals.
- **How to avoid:** EV certs cost 20-40x more but work immediately; Azure Trusted Signing is cheap but requires Azure knowledge

### Explicit certificateSubjectName configuration rather than auto-detection from certificate (2026-02-24)
- **Context:** Subject name must match certificate or signing fails, but failure happens late in build process
- **Why:** Explicit config allows verification before expensive CI/CD run; early validation catches mismatches
- **Rejected:** Auto-detect subject name from certificate at signing time (delays error detection)
- **Trade-offs:** Requires manual config but fails fast; auto-detect would be simpler but errors are harder to diagnose
- **Breaking if changed:** If configured subject name doesn't match certificate, entire build fails at signing step

#### [Gotcha] License headers are NOT required in source files for MIT licensed projects when using a centralized LICENSE file and git history for attribution (2026-02-24)
- **Situation:** Many developers reflexively add license headers to every file, assuming it's a legal requirement
- **Root cause:** MIT license doesn't require per-file headers; git history provides sufficient attribution; centralized LICENSE file is legally sufficient
- **How to avoid:** Saves boilerplate but relies on developers/users finding the LICENSE file; git history visibility matters for attribution

#### [Gotcha] Terms of Service and Privacy Policy requirements are deployment-model dependent: only needed for hosted/SaaS versions, not self-hosted software (2026-02-24)
- **Situation:** Many early-stage projects add legal docs prematurely, creating maintenance burden before they're legally required
- **Root cause:** TOS/Privacy Policy obligations derive from SaaS regulations (data handling, service availability); self-hosted installations have no such obligations
- **How to avoid:** Deferred work reduces initial overhead but creates work later when pivoting to hosted model; better to plan ahead with requirements documented

### License information distributed across three channels: LICENSE file (GitHub/git), package.json metadata (npm), website footer link (user visibility) (2026-02-24)
- **Context:** Single source of truth for licensing inadequate - different distribution channels and audiences need different formats
- **Why:** npm registry consumers need package.json metadata; GitHub users need LICENSE file; web visitors need visible link; each channel has different discovery patterns
- **Rejected:** Centralizing in one location would miss distribution channels or be inconvenient for different audiences
- **Trade-offs:** Requires maintaining information in three places vs. single source; each channel has appropriate format for its ecosystem
- **Breaking if changed:** Removing any channel: npm loses required metadata, GitHub loses standard compliance location, web loses user-facing transparency

#### [Pattern] Comprehensive licensing documentation (licensing.md) serves dual purpose: audit trail of decisions AND implementation guide for future compliance work (2026-02-24)
- **Problem solved:** Compliance decisions are often informal or lost; dependency reviews require systematic approach; future contributors need context
- **Why this works:** Documentation-driven compliance makes decisions discoverable, auditable, and repeatable; includes checklist and CI/CD recommendations for automation
- **Trade-offs:** Upfront documentation effort pays dividends for audits, contributor onboarding, regulatory review, and decision reversibility

### Dependency license compatibility tracked via matrix (MIT/Apache compatible groups) to prevent copyleft contamination of MIT-licensed project (2026-02-24)
- **Context:** MIT project depending on GPL library creates derivative work under GPL - defeats MIT's permissive licensing
- **Why:** Compatibility analysis is systematic; matrix is auditable and extensible; catch copyleft issues before they propagate
- **Rejected:** Listing licenses without analyzing compatibility; trusting developers to spot issues
- **Trade-offs:** Requires systematic review overhead but prevents subtle license contamination that's hard to detect later
- **Breaking if changed:** Missing compatibility check could result in GPL dependency requiring full codebase release under GPL, completely changing project licensing

### Grafana configured with anonymous read-only access (Viewer role) instead of requiring authentication (2026-02-25)
- **Context:** Need to balance dashboard accessibility with security
- **Why:** Viewer role provides granular access control (read-only); anonymous access removes barrier to viewing dashboards without requiring credential distribution; assumes dashboards don't expose sensitive data
- **Rejected:** Admin-only access (less accessible), fully open with edit permissions (security risk), authentication-only (operational overhead)
- **Trade-offs:** Lower friction for users vs potential exposure if dashboards contain sensitive metrics
- **Breaking if changed:** If Viewer role is removed or auth.anonymous disabled, all access requires credentials; requires admin password management if changed to auth-only model

#### [Gotcha] Ingestion rate limits (10MB/s, 20MB burst) in Loki silently drop excess logs without alerting operator when limits are exceeded (2026-02-25)
- **Situation:** Protecting Loki server from being overwhelmed by log traffic from noisy containers
- **Root cause:** Ingestion limits provide QoS and prevent single container from consuming all resources; but failure mode is silent data loss rather than explicit error
- **How to avoid:** System stability vs debugging difficulty when logs mysteriously disappear; dropped logs are not typically logged

#### [Pattern] Provisioning directory mounted as read-only (:ro) in docker-compose despite being provisioned into container (2026-02-25)
- **Problem solved:** Grafana receives pre-configured dashboards that should not be modified at runtime
- **Why this works:** Prevents Grafana from accidentally or maliciously modifying its own provisioning configuration. Enforces separation between infrastructure configuration (external, version-controlled) and runtime state (container-internal).
- **Trade-offs:** Slightly more secure but means Grafana UI edits don't persist (users must modify source JSON, not UI, for changes to stick)

#### [Gotcha] Zero-width characters (U+200B-U+2060) and directional overrides (U+202A-U+2069) are invisible to humans but can be used for homograph attacks, code injection hiding, and social engineering. They must be explicitly stripped during normalization. (2026-02-25)
- **Situation:** Implementing normalizeUnicode to sanitize user input for LLM processing
- **Root cause:** Invisible Unicode can pass visual review but execute malicious intent. Stripping these prevents a class of attacks that Unicode normalization alone doesn't catch.
- **How to avoid:** Slightly more aggressive sanitization (removes legitimate uses of these chars like ZWNJ in typography) but security-first approach is justified for LLM input

### Used curated character-by-character homoglyph mapping (Cyrillic-to-Latin replacements) instead of Unicode property detection or algorithmic homoglyph discovery. (2026-02-25)
- **Context:** Implementing normalizeUnicode to detect lookalike characters that could bypass visual inspection
- **Why:** Homoglyph attacks are intent-driven—specific characters chosen by an attacker to look identical. A curated, explicit map is auditable and maintainable. Algorithmic approaches (Unicode confusables) either miss targeted attacks or have excessive false positives.
- **Rejected:** Using Unicode.Confusable property (misses targeted Cyrillic attacks), machine learning classifier (non-deterministic, hard to audit), or algorithmic similarity detection (too broad, destroys legitimate text)
- **Trade-offs:** Requires ongoing curation as new homoglyph attacks are discovered (maintenance burden), but provides exact control and zero false positives on mapped characters. Can't detect unknown homoglyph pairs until explicitly added.
- **Breaking if changed:** If the homoglyph map is removed or simplified, targeted visual attacks using Cyrillic/Latin confusion become viable again. Callers relying on confidence that all homoglyphs are caught would get false negatives.

### Used pattern-based prompt injection detection with severity levels ('warn' vs 'block') instead of probabilistic/ML or regex whitelisting approaches. (2026-02-25)
- **Context:** Implementing detectPromptInjection to catch common prompt manipulation attempts
- **Why:** Pattern-based detection is deterministic, auditable, and doesn't require training data or external models. Severity levels allow callers to choose whether to reject ('block') or alert ('warn') on suspicious patterns, giving flexibility without being overly restrictive.
- **Rejected:** ML-based detection (non-deterministic, hard to audit, requires training data), regex-based whitelist of safe inputs (too restrictive, breaks legitimate uses), simple keyword matching without context (high false positives)
- **Trade-offs:** Misses novel/obfuscated injection patterns unknown at implementation time, but catches the common, well-known attacks with zero false positives. Requires updating patterns as new attack vectors emerge.
- **Breaking if changed:** If patterns are removed or made too generic, the detector becomes either useless or creates unacceptable false positives. The severity classification must remain—removal forces callers to either block all violations or ignore all.

### Sanitization utilities library has zero external dependencies, using only built-in JavaScript/TypeScript features. (2026-02-25)
- **Context:** Creating a foundational security utility used across the codebase (utils package that other packages depend on)
- **Why:** Security-critical code at a low level of the dependency graph should minimize supply chain risk. Every external dependency is a potential attack surface and licensing liability. Built-in features are auditable and stable across Node/TypeScript versions.
- **Rejected:** Using dedicated sanitization libraries (xss, sanitize-html, etc.), Unicode libraries (unidecode ports), or regex helpers (escapeRegExp from lodash)
- **Trade-offs:** Slightly more verbose code (manual regex patterns, explicit character mappings), but eliminates transitive dependencies and keeps the library lightweight for bundling. Forced to maintain homoglyph map and injection patterns explicitly.
- **Breaking if changed:** If dependencies are added, it changes the surface area for supply chain attacks and increases bundle size for consuming code. The library would no longer be self-contained and portable.

### Set suspicious line length threshold at 2000 characters for sanitizeMarkdownForLLM, with a 'warn' severity classification. (2026-02-25)
- **Context:** Detecting potential prompt injection or context window attacks in Markdown before feeding to LLM
- **Why:** LLM context windows are typically 4K-100K tokens, and 2000 chars is a reasonable heuristic for 'unusually dense input that might be an attack pattern or data exfiltration attempt.' 'Warn' severity (not 'block') allows legitimate long-form content while flagging for review.
- **Rejected:** No line length limit (misses some context flooding attacks), lower threshold like 500 chars (too many false positives on normal code blocks), 'block' severity (breaks legitimate use cases), per-window-size tuning (adds complexity)
- **Trade-offs:** May not catch all context flooding attacks, but avoids rejecting legitimate long paragraphs. Callers can inspect 'warn' violations and decide if content is legitimate.
- **Breaking if changed:** If threshold is removed, context flooding attacks become easier. If threshold is lowered to 500, legitimate code blocks and long lists get flagged. If changed to 'block', legitimate users get rejected.

#### [Pattern] Environment variable AUTOMAKER_API_URL with localhost fallback (process.env.AUTOMAKER_API_URL || 'http://localhost:3001'). Enables local development without env setup while supporting multiple deployment environments. (2026-02-25)
- **Problem solved:** Stats script runs in multiple contexts: local dev (no env vars), CI/CD (env vars configured), deployed (might be different URL).
- **Why this works:** Reduces friction for local development (works out of box if server on default port). Supports staging/production (via env var). Single code path for all environments.
- **Trade-offs:** Relies on convention (server on localhost:3001 in dev). If dev sets up server differently, must use env var. But convention is well-established.

#### [Pattern] Event-specific fork protection strategies: pull_request events require explicit fork checks (github.event.pull_request.head.repo.full_name == github.repository), but push and release events have implicit fork protection since only maintainers can trigger them. (2026-02-25)
- **Problem solved:** GitHub Actions workflows triggered by different events have different vulnerability profiles when using self-hosted runners.
- **Why this works:** pull_request events can be triggered from forks with user-controlled code and metadata. push and release events are inherently restricted to maintainers. Treating them identically wastes security checks and complicates guards.
- **Trade-offs:** Event-specific logic is more complex but more precise. Simpler to audit and understand the actual vulnerability profile of each event.

#### [Gotcha] String processing from PR metadata (title, body, description) in shell scripts requires fork protection even in events that seem safe (pull_request: [closed]). Fork-controlled PR metadata can contain shell injection payloads. (2026-02-25)
- **Situation:** linear-sync.yml processes PR title/body in bash scripts. Initial assessment: 'safe' because it only triggers on pull_request:closed. Actual risk: PR metadata is under fork control and can be weaponized.
- **Root cause:** PR metadata fields are completely controlled by fork submitters. Even in bash scripts that don't directly execute user code, string interpolation into commands is vulnerable to injection. Examples: `PR_TITLE='$(malicious_command)'`
- **How to avoid:** Adding fork checks to linear-sync.yml adds 1 line of guard logic. Alternative: avoid processing PR metadata entirely (much larger refactor). The guard is minimal cost for high security value.

#### [Pattern] Permissions hierarchy: Workflow-level permissions: read-all with job-level elevation only where needed (e.g., contents:write, pull-requests:write for release jobs). Creates explicit security boundaries and makes privilege requirements auditable. (2026-02-25)
- **Problem solved:** GitHub Actions workflows can declare permissions at workflow level (applies to all jobs) or job level (override for specific jobs). Many workflows use a single blanket permission.
- **Why this works:** Setting minimal at workflow level means jobs without elevated permissions automatically fail safe. Job-level elevation makes it explicit which jobs need write access. Easier to audit and harder to accidentally leak permissions.
- **Trade-offs:** More verbose YAML but much clearer security model. Debugging permission errors requires checking both levels, but this is a feature—forces explicit thinking about what each job needs.

### Explicit fork checks (if: github.event.pull_request.head.repo.full_name == github.repository) instead of pull_request_target event. Trades automatic fork isolation for explicit, auditable guards. (2026-02-25)
- **Context:** GitHub Actions provides pull_request_target event which runs workflow code from main branch even when triggered by fork PRs. Alternative approach is pull_request event with explicit fork checks.
- **Why:** pull_request_target is opaque and harder to audit—developers don't see 'what is being protected' in the workflow file. Explicit fork checks make the security model visible and auditable. Also avoids the complexity of pull_request_target (requires separate fetch of PR code if needed).
- **Rejected:** Using pull_request_target event (automatic fork isolation but less auditable), or using pull_request without any fork checks (vulnerable)
- **Trade-offs:** Explicit checks require manual maintenance of the fork-detection logic. pull_request_target would be automatic but less visible. Current approach wins on auditability and clarity.
- **Breaking if changed:** Removing the explicit fork check guard but keeping pull_request event would expose self-hosted runners to fork PR code execution. Using pull_request_target without understanding its security properties can lead to credential leaks (secrets are available in pull_request_target but isolated from PR code).

#### [Pattern] SHA-pinned actions with version comments (e.g., @abc123def...40chars # v4) enable supply chain attack prevention while maintaining semantic versioning context. Comment serves as audit trail of what action version was intended. (2026-02-25)
- **Problem solved:** GitHub actions can be referenced by tag (e.g., actions/checkout@v4) which is convenient but mutable, or by full commit SHA (immutable but opaque).
- **Why this works:** Tags can be moved by action maintainers (intentionally or via compromise). Full SHAs are immutable and prevent malicious action maintainers from injecting code into existing version tags. Comments document intent and make it easier to track when a deliberate action upgrade occurred vs. when a SHA became stale.
- **Trade-offs:** More verbose, requires occasional pinning updates. But updates are explicit and auditable (commit message shows 'upgraded actions/checkout to v4.2.0'). Vulnerability surface reduced significantly.

#### [Pattern] Layered repository validation: combining fork check + explicit repository name check + event type check + merge status check creates multiple layers of defense. Each layer catches different attack vectors independently. (2026-02-25)
- **Problem solved:** The implementation checks: (1) github.event.pull_request.head.repo.full_name == github.repository (fork check), (2) github.repository == 'protoLabsAI/protoMaker' (explicit repo name), (3) github.event.pull_request.merged == true (merge status), (4) different checks for different event types.
- **Why this works:** No single check is bulletproof. Fork check prevents fork attacks but doesn't verify this is the correct repo. Repo name check prevents workflows running in mirrors/forks of the codebase. Merge status check prevents accidental processing of open PRs. Layering makes exploitation harder—attacker would need to bypass multiple independent validations.
- **Trade-offs:** More verbose guard logic (2-3 if conditions). But defense-in-depth is worth the verbosity for self-hosted runner workflows where compromise is costly.

### Trust tier bypass logic embedded in QuarantineService.Gate stage (returns early if tier >= 3) rather than checked in create route handler before calling quarantine. (2026-02-25)
- **Context:** Three sources with different trust levels: api-key (tier 1, full validation), ui-session (tier 3, bypass), mcp/internal (tier 4, bypass). Need to conditionally validate based on tier.
- **Why:** Centralizing bypass logic in the validation service creates complete audit trail (quarantine entry marks stage='Gate', violations empty, status='bypassed') vs bypassing before validation (no audit record). Maintains separation of concerns: handler doesn't need to know about validation rules.
- **Rejected:** Check tier in handler with `if (tier >= 3) { return create(feature) }`. This skips validation entirely and loses audit trail of who submitted what and why it was bypassed. Complicates future security audits.
- **Trade-offs:** All submissions create quarantine entries (even bypassed ones) → more disk I/O. Benefit: complete submission history. Handler code simpler: always call quarantine, don't conditionally skip.
- **Breaking if changed:** If bypass check moved to handler, bypassed features would have no quarantine entry record. Future 'show me all submissions from API keys' queries fail. Audit trail becomes incomplete, security forensics impossible.

### Save quarantine-processed content (title/description from outcome) to feature, not raw request input. Example: save outcome.entry.title instead of req.body.feature.title. (2026-02-25)
- **Context:** QuarantineService sanitizes content (removes prompts, normalizes unicode, escapes HTML). Raw input may contain injection vectors that sanitization removes.
- **Why:** Ensures stored feature data matches what passed validation. If raw input stored, sanitization becomes theater (database contains unsanitized content). Prevents subtle bugs where UI renders sanitized content but database serves raw content on next load.
- **Rejected:** Store raw input and sanitize on render. Problem: race condition between storage and query. Other services query features without going through render pipeline and see unsanitized content. Distributed sanitization is unreliable.
- **Trade-offs:** Data loss: normalization may truncate or collapse content. Benefit: guaranteed consistency between validation and storage. Worth the trade-off for security-critical data.
- **Breaking if changed:** If raw input stored instead of sanitized: sanitization bypass via feature.json download (auth to get raw data). Content injection attacks succeed if downstream code trusts database without re-sanitizing.

#### [Pattern] Organize security utility tests by threat class, not just code structure. Utilities grouped by attack vector: Unicode attacks (normalizeUnicode), content injection (sanitizeMarkdownForLLM), LLM-specific attacks (detectPromptInjection), path manipulation (validateFilePaths). (2026-02-25)
- **Problem solved:** 19 tests across 4 sanitization utilities required systematic test design to ensure threat coverage
- **Why this works:** Threat-based organization makes coverage gaps visible and maps to actual security risk model rather than just code coverage
- **Trade-offs:** Requires upfront threat modeling, but provides clearer verification that all attack classes are handled

### Security violation severity levels (block vs warn) embedded in sanitization utilities. Different violations warrant different risk tolerance—some hard-fail execution, others log warnings for investigation. (2026-02-25)
- **Context:** Multiple types of security violations in LLM context (prompt injection, path traversal, XSS) have different impact profiles
- **Why:** Not all security risks are equally critical in the same context. Injected script tags may warrant block; zero-width Unicode characters warrant warn.
- **Rejected:** Treating all violations as hard failures or warnings uniformly
- **Trade-offs:** Adds state to security functions but enables nuanced policy enforcement without code changes
- **Breaking if changed:** Removing severity levels collapses risk categories—downstream code can't differentiate response strategy

### Path traversal protection uses normalize() then relative() to validate paths stay within docs/internal/, not simple string checks like startsWith('..') or includes('..') (2026-02-25)
- **Context:** Blocking path traversal attacks in file serving API
- **Why:** normalize() resolves edge cases like mid-path '../' sequences that string checks miss. relative(docDir, join(docDir, path)) guarantees the result doesn't start with '..' only if normalized path never escapes. Double validation is defensive.
- **Rejected:** Simple checks: if(path.includes('..')) or if(!path.startsWith('/')) - these fail on paths like 'docs/../../../.env' which normalize to '../../../.env'
- **Trade-offs:** More code and two function calls per request vs false sense of security from naive checks. Worth the cost for file serving.
- **Breaking if changed:** Removing normalize() allows paths like 'docs/../../.env' to bypass relative() check. Removing relative() check allows any path that doesn't contain raw '..' (e.g., after normalization).
#### [Pattern] Privacy controls implemented in `beforeSend` hook before transmission, not post-capture - emails, API keys, tokens scrubbed at source (2026-02-25)
- **Problem solved:** Sensitive PII redaction for GDPR compliance with explicit user opt-in
- **Why this works:** Data cannot be recalled after transmission; privacy must be enforced at the last moment before sending. `beforeSend` is the final gate before Sentry receives data
- **Trade-offs:** More complex initialization logic but guarantees sensitive data never leaves the application

### Default `enabled: false` for error tracking in settings - explicit user opt-in required, no automatic data transmission (2026-02-25)
- **Context:** GDPR compliance and privacy-respecting default behavior
- **Why:** Privacy-by-default: users must make conscious choice to enable monitoring. Opposite of opt-out (more ethical, legally safer). Data doesn't flow without explicit consent
- **Rejected:** Default `enabled: true` with opt-out option (assumes consent, requires users to find and disable, risky legally)
- **Trade-offs:** Reduced telemetry coverage initially (only opt-in users tracked) but better user trust and legal compliance
- **Breaking if changed:** If default changes to `enabled: true`, the app starts transmitting error data without user knowledge - GDPR violation


#### [Gotcha] New child_process.exec() call introduced without timeout or resource limits. Promisified exec can hang indefinitely on a frozen git process (2026-03-01)
- **Situation:** detectOrphanedFeatures() iterates features and runs `git rev-parse` for each. If git process hangs (network issue, repo corruption, FUSE filesystem), health check blocks indefinitely and may starve event loop
- **Root cause:** Pattern mirrors existing health-monitor-service.ts usage of exec, but exec() was chosen for simplicity over execFile(). No timeout wrapper was added
- **How to avoid:** Simpler code vs. robustness. Current approach safe in known-good repos but unsafe in edge cases (hung git, slow NFS, corrupted index)

### Discord webhook URL validation enforces HTTPS protocol; rejects HTTP even if URL structure is otherwise valid (2026-03-07)
- **Context:** Webhook URLs containing sensitive tokens being stored per-project and tested via HTTP POST
- **Why:** HTTP exposes credentials in plaintext over network; HTTPS is non-negotiable for any credential-bearing URL
- **Rejected:** Permitting HTTP with warning; this would leave the door open to misconfiguration
- **Trade-offs:** Easier: cleaner regex, fewer valid cases to handle. Harder: users on internal test Discord instances must use HTTPS
- **Breaking if changed:** Removing HTTPS enforcement opens credential exposure vector; users could accidentally store unencrypted webhook tokens

#### [Pattern] Non-overwrite guard using try { await fs.access() } catch { /* write */ } pattern prevents accidental spec.md deletion (2026-03-07)
- **Problem solved:** Setup route needs to write spec.md but user may have hand-edited it after auto-generation
- **Why this works:** Safe-by-default: assumes user edits are valuable and shouldn't be destroyed by re-running setup
- **Trade-offs:** Users cannot easily regenerate spec.md if they want to reset; requires manual file deletion

### spec.md written to project root (visible, user-editable) rather than .automaker/ (hidden config). Includes auto-generated header note indicating manual fill-in needed. (2026-03-07)
- **Context:** spec.md is hybrid artifact: auto-generated skeleton + user-written content (goals, workflows, constraints). Needs to be discovered and edited.
- **Why:** Spec documents are typically public, root-level project artifacts. Visibility encourages adoption. User discovers and edits spec.md naturally alongside code. Header note clarifies what's machine vs. human content.
- **Rejected:** Hiding in .automaker/ would protect from accidental edits but reduce discoverability and obscure project intent docs
- **Trade-offs:** High visibility and accessibility, but creates maintenance question: if research re-runs and user edited spec.md, changes are NOT reflected (non-overwrite guard prevents it). Users must manually merge.
- **Breaking if changed:** If moved to .automaker/, spec.md becomes harder to find and edit; requires explicit CI/CD step to surface it. If overwrite behavior changes, user edits silently lost.