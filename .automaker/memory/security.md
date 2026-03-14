---
tags: [security]
summary: security implementation decisions and patterns
relevantTo: [security]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 84
  referenced: 24
  successfulFeatures: 24
---
<!-- domain: Security | Auth guards, input validation, secure file operations, HMAC verification -->

# security

### Explicitly filtering to only resolve threads authored by known bots, leaving human review threads untouched (2026-02-10)

- **Context:** Automating thread resolution without human involvement — what prevents accidentally removing human feedback?
- **Why:** Human review threads could contain critical feedback or legal requirements. By white-listing only known bot accounts, we ensure human reviewers' threads are always preserved. Case-insensitive matching catches both `coderabbitai` and `CodeRabbitAI` variants.
- **Rejected:** Resolve all threads (risks losing human feedback), resolve based on thread content pattern (too fragile).
- **Breaking if changed:** If filtering is removed, human reviewer feedback could be accidentally marked resolved — compliance/feedback loss risk.

### EM agent uses configured mergeStrategy from gitWorkflow settings (squash/merge/rebase), not hardcoded strategy (2026-02-10)

- **Context:** Different teams have different merge policies. Strategy should be configurable per project.
- **Why:** Projects have existing branch protection rulesets and commit history standards. Respecting configured strategy avoids conflicts with existing policies.
- **Breaking if changed:** If strategy is hardcoded, teams using non-squash strategies see unexpected commit history. May break CI checks downstream.

#### [Pattern] Defense-in-depth for critical platform limitations: dual-layer guards (service-level + API-level) + agent prompt warnings. (2026-02-10)

- **Problem solved:** Single point of failure in worktree deletion could break entire user sessions.
- **Why this works:** Multiple layers ensure the constraint is enforced regardless of code path: automated cleanup (service guard), manual deletion via UI (API guard), and agent awareness (prompt warnings). If one layer fails, others catch it.
- **Trade-offs:** Adds complexity but prevents catastrophic failure mode (broken sessions).

#### [Pattern] Multi-layer safety checks before destructive operations: merge status verification → working directory state → current branch protection → force-only after all pass (2026-02-10)

- **Problem solved:** Auto-cleanup of stale worktrees and branches needs to prevent accidental data loss while operating autonomously.
- **Why this works:** Single-layer checks can race or miss edge cases. Merge status alone doesn't guarantee safety if worktree has uncommitted work or is currently active.
- **Trade-offs:** More code and function calls per cleanup, but provides complete safety guarantee.

#### [Gotcha] Git worktree cannot be deleted while it is the current working directory in any process (2026-02-10)

- **Situation:** Attempting to cleanup worktrees from within a subprocess that might have cd'ed into the worktree path.
- **Root cause:** OS prevents directory deletion while it's in use by a process. In Claude Code: if you `cd` into a worktree then try to delete it, the shell persists the broken CWD and all subsequent commands fail.
- **How to avoid:** Verify worktree is not current directory before any removal attempt.

### Scoped tool set for Frank (7 tools) vs full agent toolkit (20+) (2026-02-12)

- **Context:** Frank spawned automatically on critical health events. Restricting tools to diagnosis-only set.
- **Why:** Auto-spawned agents on system events are higher risk — no operator review before execution. Scoped tools prevent accidental/malicious scope creep (deleting branches, committing code). Frank's role is diagnostic (read logs, check health, post findings), not remediation.
- **Breaking if changed:** If full toolkit is granted, Frank could accidentally delete features, commit breaking changes, or spam Discord during a diagnosis loop.

#### [Gotcha] Shebang must be LF-only (\n) not CRLF (\r\n) on mixed-OS teams or git autocrlf=true repos (2026-02-13)

- **Situation:** If file written with CRLF, shebang becomes `#!/usr/bin/env node\r` which doesn't match, and chmod +x doesn't help.
- **Root cause:** OS kernel interprets shebang line literally. \r breaks the magic number detection. Git's autocrlf setting can silently convert on Windows checkout.
- **How to avoid:** Use .gitattributes to force LF for executable scripts: `*.ts text eol=lf`.

### Mock API functions return hardcoded data instead of reading sensitive project info from disk during demonstration phase (2026-02-13)

- **Context:** CLI needed realistic output for testing without actually scanning real repositories or exposing secrets from .env files.
- **Why:** Hardcoded mock data prevents accidental reads of .env, credentials, or private git history during CLI development. Keeps security layer at API boundary (server reads files, CLI receives sanitized JSON).
- **Breaking if changed:** If mock functions are replaced with real fs reads without proper sanitization, CLI could dump env vars, private keys, or git history to stdout in JSON output.

#### [Pattern] Path traversal validation using path.resolve() comparison against project root before any file operations (2026-02-13)

- **Problem solved:** Prevent ../../../ attacks when processing user-provided paths or template-based file references.
- **Why this works:** Resolving to absolute path and validating it starts with project root catches all escape attempts. Applied BEFORE any fs.readdir/stat calls.
- **Trade-offs:** Requires stat() call per path (small I/O cost) but prevents catastrophic information disclosure.

#### [Pattern] Template variable validation extracts ALL {{variables}} before rendering, validates against source object structure (2026-02-13)

- **Problem solved:** Templates reference variables like {{discord.categoryId}} that might not exist at render time, causing undefined substitutions and silent failures.
- **Why this works:** Pre-flight validation catches missing variables before template rendering. Prevents undefined values in rendered output which downstream code might misinterpret.
- **Trade-offs:** Requires object schema walk to validate nested variables, but catches 100% of missing vars.

### Pre-flight write permission check on target path before any setup begins (2026-02-13)

- **Context:** Setup creates directories, git repos, and modifies files. If permissions denied midway, partial state leaks.
- **Why:** Fail-fast on permission issues before any side effects. Prevents partial setup on user error.
- **Breaking if changed:** If permission check removed, setup proceeds and fails partway through; rollback must clean up leaked state.

### Credentials passed through environment variables (AWS_REGION, GROQ_API_KEY, etc.) rather than config files or constructor parameters (2026-02-13)

- **Context:** Three providers with different credential types: API keys, AWS credentials, localhost URL.
- **Why:** Environment variable pattern is standard for secrets, never persisted in code/config, easy for CI/CD.
- **Breaking if changed:** If providers switch to config file or parameter-based credentials, deployment scripts must be updated, and risk of secret leakage increases significantly.

#### [Gotcha] HMAC-SHA256 signature verification requires raw body access BEFORE Express JSON parsing middleware consumes the stream (2026-02-23)

- **Situation:** Express middleware chain normally parses JSON automatically. Signature verification needs the original bytes to recompute HMAC. Without raw body, signature verification always fails.
- **Root cause:** HMAC is computed over the exact byte sequence. Once parsed and re-stringified, whitespace/key ordering changes invalidate the hash.
- **How to avoid:** Custom middleware captures raw buffer before JSON parsing: `express.raw({ type: 'application/json' })` on the webhook route.

### Used crypto.timingSafeEqual() for HMAC comparison instead of simple string equality (2026-02-23)

- **Context:** Comparing computed HMAC digest with provided signature in HTTP header.
- **Why:** Prevents timing attacks where attacker measures response latency to infer correct signature byte-by-byte. Standard equality (===) short-circuits early on mismatch, leaking information about correct prefix length.
- **Rejected:** Simple === comparison (exploitable via timing attacks).
- **Breaking if changed:** Switching to standard equality makes signature verification vulnerable to timing side-channel attacks that can recover the secret key.

#### [Pattern] OAuth CSRF protection using state parameter stored in in-memory Map with 10-minute expiration. States auto-cleanup on each callback. Single-instance solution; production multi-instance deployments require Redis or database. (2026-02-22)

- **Problem solved:** CSRF attacks on OAuth redirect can trick users into authorizing attacker's client. State parameter prevents this.
- **Why this works:** State parameter is OAuth 2.0 standard (RFC 6749). In-memory Map is simplest implementation for single instance. 10-minute window is long enough for OAuth flow but short enough to prevent state reuse.
- **Trade-offs:** In-memory state is fast and simple but loses state across process restarts and doesn't scale to multiple servers.


#### [Pattern] CORS policy controlled by runtime config flag 'hivemindEnabled'. When true, middleware sets Access-Control-Allow-Origin: *. When false, restrictive CORS (same-origin only). (2026-03-11)
- **Problem solved:** Default: app runs single-origin. Hivemind mode: same app instance accessed from multiple origins (multi-client scenario).
- **Why this works:** Standard single-origin CORS sufficient for normal use. Hivemind requires cross-origin access; feature gate prevents accidental exposure.
- **Trade-offs:** Runtime flexibility + explicit feature gate vs. security gap risk if flag accidentally enabled without understanding implications

#### [Pattern] CORS allowAllOrigins flag is conditional on hivemind.enabled, creating a dev-only CORS policy. Production never enables permissive CORS unless hivemind feature is active. (2026-03-11)
- **Problem solved:** Balancing developer convenience in local testing with production security lockdown
- **Why this works:** hivemind is explicit development feature; tying CORS to it ensures CORS exposure is never accidental in production. Fail-secure default.
- **Trade-offs:** Gained: Impossible to accidentally expose permissive CORS in production. Lost: CORS availability is implicit in feature flag, adds discovery burden

### Conditional CORS: setupMiddleware() accepts allowAllOrigins parameter, set to true only when hivemind is enabled (2026-03-11)
- **Context:** Hivemind (multi-peer mesh) requires Access-Control-Allow-Origin: * for cross-peer requests. Single-node deployment should restrict CORS.
- **Why:** CORS policy should match deployment topology. Hivemind peers communicate directly, so need permissive CORS. Single-node is isolated behind reverse proxy, so restrictive CORS is safer. Configuration-driven behavior avoids hardcoding policy.
- **Rejected:** Always allow all origins - security issue. Always restrict origins - breaks hivemind mesh communication.
- **Trade-offs:** Deployment must correctly set hivemind config flag. If misconfigured (e.g., CORS enabled in single-node mode), security posture is weakened.
- **Breaking if changed:** If allowAllOrigins parameter is removed and hardcoded to false, hivemind deployments will fail with CORS errors. If hardcoded to true, single-node deployments lose CORS protection.

#### [Gotcha] SDK cwd is a hint, not a fence. Node.js doesn't enforce working directory restrictions; agents can always use absolute paths to write anywhere on the filesystem. (2026-03-11)
- **Situation:** Original implementation only validated workDir at startup. Agents in worktrees bypassed this by using absolute paths in file operations.
- **Root cause:** Node's fs APIs don't restrict operations based on process.cwd(). The cwd is informational only, useful for relative path resolution but provides no security boundary.
- **How to avoid:** Requires runtime validation on every tool execution (PreToolUse hook) rather than one-time startup check. Small performance cost for critical security.

### Implemented worktree path validation as a PreToolUse hook that intercepts ALL tool calls (Write, Edit, Bash, etc.) rather than patching individual tool implementations. (2026-03-11)
- **Context:** Needed to prevent agents from writing outside worktree boundaries across multiple tool types and execution contexts.
- **Why:** Hook-based approach centralizes security logic, applies uniformly to all tools, and validates at actual execution time (not just startup). Single point of enforcement.
- **Rejected:** 1) Patching each tool individually (fragile, easy to miss one). 2) Modifying SDK cwd enforcement (not feasible, external dep). 3) Startup-only validation (proven insufficient).
- **Trade-offs:** Centralized hook validates every execution (small overhead) but prevents bypasses across tool types. Trade computational cost for confidence in security boundary.
- **Breaking if changed:** If hook is bypassed or disabled, all tool-based isolation breaks. Agents gain unrestricted filesystem access despite worktree setup.

#### [Gotcha] File-path-based guards are insufficient. Agents can bypass write restrictions using Bash with `git -C /path/to/main`, `cp src dst`, `mv src dst`, or shell redirections. (2026-03-11)
- **Situation:** Initial fix blocked direct Write/Edit calls but agents could still manipulate files via Bash commands to the main repo.
- **Root cause:** Bash commands operate on the full filesystem; relative paths in Bash resolve against cwd, but absolute paths or `git -C` override cwd entirely. Command composition adds complexity.
- **How to avoid:** Guard must parse and validate Bash command patterns (more complex) but catches more bypass vectors. Regex patterns on command args vs security completeness.

### Created explicit exception for `.automaker/features/` directory. Server-side operations can write here regardless of worktree; guard validates only the directory prefix, not filename. (2026-03-11)
- **Context:** Server needs to write feature/PR data to a known location. Can't restrict server output to worktree; must carve out escape hatch.
- **Why:** Server (not agent) controls what gets written to `.automaker/features/`. Agent can't inject arbitrary paths there; server builds the path. Restricting by directory prefix (not full path) is sufficient.
- **Rejected:** Blocking all writes outside worktree (breaks server-side output). Allowing all writes to `.automaker/` (too broad, invites abuse).
- **Trade-offs:** Reduced security isolation for convenience of server-side operations. Mitigated by server (not agent) controlling the full filepath; agent only provides content.
- **Breaking if changed:** If exception is removed, server can't write feature metadata anywhere, breaking feature creation workflow. If exception is widened to more directories, introduces bypass vectors.

#### [Pattern] Guard returns blocking decision with actionable error message (e.g., 'use worktree path instead of main repo path') rather than silent denial or generic error. (2026-03-11)
- **Problem solved:** Agents need guidance to self-correct when guard blocks a tool call. Silent failures lead to confusion and retry loops.
- **Why this works:** Actionable errors teach agents the constraint (worktree isolation exists) and show the correct path to use. Reduces adversarial feel, aids agent learning.
- **Trade-offs:** More verbose error messages but improve agent behavior and transparency. Could leak internal path info but guard's purpose is visible anyway.

#### [Pattern] description field is required in SlashCommandSummary type, enabling null-check-free filtering (2026-03-11)
- **Problem solved:** Filter logic iterates description without defensive null checks
- **Why this works:** Type system enforces description always exists; reduces boilerplate and risk of null-reference bugs in filter predicate
- **Trade-offs:** Cleaner code vs tight API contract coupling; if description becomes optional later, all filter code breaks silently (no TS error if not careful with narrowing)

#### [Gotcha] CORS allowing all origins is gated by hivemindEnabled feature flag, not explicitly validated in middleware (2026-03-11)
- **Situation:** Server URL override enables multi-origin scenarios (single app, multiple servers). CORS config must match architecture.
- **Root cause:** hivemindEnabled implies distributed multi-origin setup where CORS must be open. Without hivemind flag, app is single-origin and should restrict CORS. Coupling to proto.config.yaml makes this implicit.
- **How to avoid:** Feature-flag gating hides the CORS decision in config—easy to miss when reviewing middleware code. Prevents accidental open CORS in single-origin deployments.

### CORS wildcard (Access-Control-Allow-Origin: *) gated by process.env.HIVEMIND_ENABLED flag, not enabled by default (2026-03-11)
- **Context:** Headless server needs to accept cross-origin requests from remote clients, but wildcard CORS is a security risk in normal operation
- **Why:** HIVEMIND_ENABLED is an operational mode flag. Wildcard CORS only enabled when system is explicitly configured for it. Prevents accidental exposure.
- **Rejected:** Always enable CORS, or require explicit CORS_ORIGIN config per client - too risky or inflexible
- **Trade-offs:** Env flag coupling (operational mode affects security policy). Simple implementation but creates implicit coupling between features.
- **Breaking if changed:** Removing the flag check exposes API to any origin indefinitely. Leaving flag false when hivemind needed breaks remote client connectivity.

### CORS `allowAllOrigins` feature gated behind `hivemind.enabled` config flag, not hardcoded or always-on (2026-03-11)
- **Context:** Server requires permissive CORS for certain features, but should not expose all origins by default
- **Why:** Ties security-relevant setting to product feature lifecycle. When hivemind is disabled, CORS restrictions apply automatically.
- **Rejected:** Hardcoded allowAllOrigins=true (security risk); environment variable (harder to audit feature dependencies)
- **Trade-offs:** Gained: security boundary tied to product feature; lost: flexibility if CORS needed independent of hivemind
- **Breaking if changed:** Removing feature flag coupling means CORS config must be maintained separately, risking desync where feature is enabled but CORS isn't

#### [Gotcha] Type assertions in gatherBoardContext were removed in favor of trusting upstream types (e.g., changed from `(transitions[i] as { to?: string }).to` to `transitions[i].to`) (2026-03-13)
- **Situation:** statusHistory array elements could be untyped or partially typed; defensive casting hid potential type definition gaps
- **Root cause:** Cleaner code; but introduces assumption that statusHistory is properly typed elsewhere
- **How to avoid:** Cleaner code maintenance; runtime errors if statusHistory typing is incomplete; easier to spot type bugs when they surface

#### [Pattern] Conditional prompt inclusion to avoid poisoning empty/malformed research findings (2026-03-13)
- **Problem solved:** Research findings conditionally appended to prompt: `${researchFindings ? ... : ''}`
- **Why this works:** Prevents empty research section from appearing in prompt (cleaner output); silent failure on missing file avoids error cascading
- **Trade-offs:** Optional becomes truly optional (graceful), but loses visibility into missing research; no feedback on file corruption

### promptFile path is resolved relative to projectPath using path.join(), read via secureFs (not arbitrary fs). No validation that promptFile stays within projectPath. (2026-03-13)
- **Context:** Role configuration files live inside the project directory structure. Path could theoretically escape via ../../../etc/passwd if not controlled.
- **Why:** secureFs.readFile is a sandboxed wrapper that prevents arbitrary file system access. Using projectPath as root is the natural containment.
- **Rejected:** Could explicitly validate that resolved path is within projectPath before reading, but secureFs is already the sandbox.
- **Trade-offs:** Relying on secureFs sandbox vs explicit path validation. Current approach assumes secureFs is sufficient; validation would be defense-in-depth.
- **Breaking if changed:** If secureFs.readFile is replaced with raw fs.readFile, path traversal becomes possible. If projectPath is set incorrectly, role files could become inaccessible or wrong files could be read.

### Replaced exec() with execFile() to construct gh CLI commands - exec() interpolates the entire command string through a shell (interpreting backticks, $(), etc.), while execFile() passes arguments as an array where shell metacharacters are literal bytes (2026-03-14)
- **Context:** Epic titles containing backticks or $(rm -rf /) were being executed as shell code because exec() passes the full command string to /bin/sh -c
- **Why:** execFile() invokes the OS-level execve() directly with argv array - the shell never sees the data, so metacharacters have no special meaning. This is a security boundary: user data → argument array → OS syscall, not user data → string interpolation → shell → OS
- **Rejected:** Could have escaped quotes and backticks more thoroughly in the string, but escaping is incomplete (hard to get right for all shell metacharacters) and masks the real problem
- **Trade-offs:** execFile() requires argument arrays instead of string concatenation (more verbose but safer); removed the body.replace(/"/g, '\\\"') hack entirely since execFile arguments skip shell processing
- **Breaking if changed:** Reverting to exec() + string interpolation reintroduces the injection vulnerability; incomplete escaping in the old code is evidence this approach is fragile

#### [Pattern] Test shell injection prevention by asserting dangerous strings appear as literal array elements in the captured execFile args, not by executing actual dangerous commands (2026-03-14)
- **Problem solved:** Need to verify that $(rm -rf /), backticks, and backslashes in epic titles don't get evaluated
- **Why this works:** The vulnerability is in the command construction mechanism (shell interpolation), not in downstream execution - verify the args array never gets through a shell. Testing literal safety (args[titleIndex + 1].includes('$(rm -rf /)')) is safer than testing safe execution.
- **Trade-offs:** Test is white-box (inspects internal args array), not black-box (tests behavior), but it directly validates the security boundary

#### [Gotcha] The original body.replace(/"/g, '\\\"') escaping was a partial mitigation of the shell injection vulnerability, not a complete fix - escaping is fragile because shell metacharacters include backticks, $(), >, |, etc., not just quotes (2026-03-14)
- **Situation:** Code had escaping logic but still vulnerable to backtick and $() injection in epic titles
- **Root cause:** Shell injection isn't just about quote escaping; you must escape backticks, $(), all expansion syntax. It's hard to enumerate all dangerous patterns. The only secure approach is to not use a shell at all (execFile with args array).
- **How to avoid:** Removing escaping entirely (not using a shell) is simpler and fundamentally safer than trying to escape correctly