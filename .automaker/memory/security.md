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
