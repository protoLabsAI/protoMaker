# Gotchas

Common pitfalls and operational hazards discovered during development. Each entry documents the situation, root cause, and how to avoid it.

## Git & Worktrees

### .gitignore negative patterns require parent directory to be unignored first

If `.automaker/` is ignored by a parent rule, then `!.automaker/features/**/feature.json` has no effect. Git stops traversing ignored directories before evaluating negative patterns.

**Fix:** Layer rules carefully — positive ignore for directory, THEN negative unignore for specific files inside. Or rely on directory-level ignore + external backups.

### Git worktree checkout breaks branch operations

`git checkout -b feature-name` then `git worktree add` to the same branch fails because the branch is already checked out. Git prevents checking out the same branch in multiple worktrees simultaneously.

**Fix:** Create branch without checkout (`git branch feature/name`) then create worktree for it.

### Claude Code Bash CWD breaks permanently if directory is deleted

If you `cd` into a worktree path and then delete that worktree, Bash permanently breaks for the session. The shell maintains a persistent CWD — if that directory is deleted, all subsequent commands fail with `ENOENT`.

**Fix:** Always use `git -C <worktree-path>` or absolute paths. Never `cd` into worktree directories.

### Git whitelist rules don't override explicit pathspec exclusions

`.gitignore` had `!.automaker/features/**/feature.json` whitelisting, but `git add -A -- ':!.automaker/'` explicitly excluded the entire directory. The pathspec exclusion wins.

**Fix:** Understand that `git add` pathspec exclusions operate independently of `.gitignore` rules. Don't mix both mechanisms for the same paths.

## Testing

### Dev server must be restarted after structural changes

TypeScript compilation succeeds but the dev server caches compiled code in memory. Tests run against stale server logic unless the server is restarted.

### Playwright E2E tests conflict with running dev server

Test environment assumes no running server. Port conflicts cause test framework to fail during setup. Cannot run E2E tests without stopping the dev server first.

### Private method testing via type assertions hides contract violations

`(service as any).privateMethod()` bypasses TypeScript visibility checks but doesn't create real test contracts. If implementation changes, tests still pass even when behavior is wrong. Test the public API instead.

### Test data helpers designed for single-use can't handle incremental scenarios

`createFeatures(path, count)` always starts from index 0, overwriting previous features. Multi-step tests that create, modify, then add more features get unexpected overwrites.

**Fix:** Inline manual feature creation in tests when mutation order matters.

## API & Services

### DiscordBotService returns boolean, not detailed result objects

`sendToChannel()` returns simple `true/false`, losing the detailed error information that `DiscordOperationResult` provided. Failures are logged inside the service, not visible to callers.

### API method names are inconsistent across hooks

`getAll()` vs `list()` vs `status()` — no centralized API spec enforces consistency. Each new integration requires reviewing existing hooks to find the correct method name.

### HTTP client signature updates must maintain backward compatibility

Adding optional parameters (`role?`, `maxTurns?`) to existing methods requires all callers to be updated. Missing TypeScript type definitions cause silent failures.

## Build & CI

### CJS files need .cjs extension when package.json declares type:module

`.js` files are assumed to match the `type` field in package.json. CommonJS files compiled as `.js` in an ESM package are misinterpreted. Rename to `.cjs` post-compilation.

### process.env in shared packages crashes browser

`@automaker/types` is imported by both server and UI. Any `process.env` access at module import time crashes in the browser where `process` is undefined. Guard with `typeof process !== 'undefined'`.

### shell: bash works cross-platform in CI

bash is available on ubuntu, macOS, and Windows (via Git Bash). Using platform-native shells requires different syntax per OS. `shell: bash` in GitHub Actions eliminates script branching.

## Agent Operations

### MAX_PR_ITERATIONS must be synced across services

PRFeedbackService and EM agent independently track the same business rule. Without synchronization, they make contradictory decisions about when to escalate.

### Thread resolution failures shouldn't block merge attempts

Thread resolution is a convenience optimization, not a critical path requirement. If the GraphQL mutation fails, the merge should still proceed. Aborting creates unnecessary blockers.

### Resolver only processes unresolved threads

Already-resolved threads are skipped to avoid unnecessary API calls and to respect explicit human actions.
