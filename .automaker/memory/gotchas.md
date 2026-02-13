---
tags: [gotchas]
summary: gotchas implementation decisions and patterns
relevantTo: [gotchas]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 119
  referenced: 46
  successfulFeatures: 46
---
# gotchas

#### [Gotcha] .gitignore negative patterns require parent directory to be unignored first, or the negative rule is ineffective (2026-02-10)
- **Situation:** When adding `!.automaker/features/**/feature.json` to gitignore, if `.automaker/` or `.automaker/features/` is already ignored by a parent rule, the negative pattern won't work because git stops traversing ignored directories
- **Root cause:** Git's .gitignore matching is ordered and evaluates per-directory. Once a directory is marked ignored, git never enters it to check nested negative patterns. This is a common source of 'why isn't my ! pattern working' failures
- **How to avoid:** Pattern requires careful layering: positive ignore rule for directory, THEN negative unignore for specific files inside. More verbose but predictable

#### [Gotcha] Best-effort error handling in resolver - thread resolution failures don't block merge attempts (2026-02-10)
- **Situation:** Resolver runs after CI but before merge. If GraphQL mutation fails, should the entire merge be aborted?
- **Root cause:** Thread resolution is a convenience optimization, not a critical path requirement. If the resolver fails (network issue, API change, etc.), the merge should still proceed. Aborting the merge for a thread resolution failure creates unnecessary blockers. Logging the warning allows operators to investigate without stopping automation.
- **How to avoid:** Easier: resilient automation that doesn't fail cascadingly. Harder: operators might not notice if thread resolution silently fails repeatedly

#### [Gotcha] Resolver only resolves UNRESOLVED threads - already-resolved threads are skipped (2026-02-10)
- **Situation:** When fetching thread list, some threads may already be marked as resolved by humans
- **Root cause:** Avoids unnecessary API calls and prevents re-resolving threads that humans intentionally resolved. Respects explicit human actions.
- **How to avoid:** Easier: respects prior resolutions, efficient. Harder: requires state check before mutation

#### [Gotcha] Git whitelist rules don't override directory exclusions in git add operations. The `.gitignore` file had `!.automaker/features/**/feature.json` whitelisting feature.json, but git operations used `git add -A -- ':!.automaker/'` which explicitly excluded the entire directory. Result: files were whitelisted in .gitignore but never actually staged due to directory-level exclusion in the add command. (2026-02-10)
- **Situation:** Team attempted to git-track feature.json files for recovery after accidental deletion incidents. Created whitelist rule in .gitignore but later discovered files weren't actually being tracked despite the whitelist.
- **Root cause:** Git's pathspec exclusions in `git add` operate independently of .gitignore rules. Directory-level exclusions take precedence over file-level inclusions when both are present.
- **How to avoid:** Whitelist rule created false sense of safety (looked like tracking was enabled) but provided no actual protection. This confusion delayed root cause analysis of the Feb 10 data loss incident.

#### [Gotcha] Whitelist rules in .gitignore don't work after upstream directory is already gitignored. Pattern: if `.automaker/` is in .gitignore, then `!.automaker/features/**/feature.json` has no effect because git has already stopped scanning that directory tree. (2026-02-10)
- **Situation:** The .gitignore file contained both `/.automaker/` (directory ignore) and `!.automaker/features/**/feature.json` (attempted whitelist). Team expected the whitelist to re-include feature.json files, but it was ineffective due to directory-level ignore taking precedence.
- **Root cause:** .gitignore processing is top-down and directory-based. Once a directory is marked ignored, .gitignore stops scanning its contents. Whitelists can only work within directories that are NOT already ignored.
- **How to avoid:** Keeping both rules created confusion (looked like tracking was enabled). Removing directory-level ignore would expose all `.automaker/` files to potential accidental commits. Best solution: remove the whitelist, rely on directory-level ignore + external backups.

#### [Gotcha] Test data creation with `createFeatures(path, count)` always starts from index 0, overwriting previous features instead of appending (2026-02-10)
- **Situation:** Multi-step verification test needed to create initial features, delete some to trigger breach detection, then add new features to verify recovery. Second `createFeatures()` call wiped the test's work
- **Root cause:** Test helper was designed for single-use setup, not incremental feature creation. Function has no index offset parameter
- **How to avoid:** Inline manual feature creation in test is more verbose but makes the test's data flow explicit. Reveals that test helpers shouldn't be reused for mutation scenarios without offset tracking

#### [Gotcha] Claude Code Bash tool permanently breaks if its CWD is deleted while running. This is a platform-level limitation, not a bug in Automaker. (2026-02-10)
- **Situation:** Worktree deletion during agent execution could delete the directory the Bash tool is in, causing all future Bash calls to fail with 'CWD no longer exists'.
- **Root cause:** The Bash tool maintains a persistent shell session per user session. If CWD is deleted, the shell cannot function. This persists for the entire Claude Code session - no recovery possible without restart.
- **How to avoid:** Workarounds add complexity (dual-layer safety checks + agent prompt warnings) but are necessary to maintain stability. The investment is justified because the alternative is broken user sessions.

#### [Gotcha] Git worktree checkout in test setup breaks subsequent operations: `git checkout -b` then `git worktree add` to same branch fails because branch is already checked out in main working tree (2026-02-10)
- **Situation:** Writing verification tests for worktree cleanup functionality
- **Root cause:** Git prevents checking out the same branch in multiple worktrees simultaneously. The test initially checked out the branch in main repo, then tried to create a worktree for that same checked-out branch
- **How to avoid:** Correct pattern: create branch without checkout (`git branch feature/name`) then create worktree. Takes same time but requires understanding git's worktree model

#### [Gotcha] MAX_PR_ITERATIONS constant must be kept in sync across PRFeedbackService and EM agent - discovered mismatch during implementation (2026-02-10)
- **Situation:** PRFeedbackService limits iterations to 2, but EM agent had different limit, causing inconsistent escalation behavior
- **Root cause:** Two separate services independently track the same business rule. Without synchronization, they make contradictory decisions about when to escalate
- **How to avoid:** Easier: quick fix (update one number in two places). Harder: creates maintenance burden - anyone changing max iterations must remember both locations, risk of drift over time

#### [Gotcha] CJS files compiled to .js extension are misinterpreted as ESM when package.json declares type:module. Must rename to .cjs extension post-compilation (2026-02-13)
- **Situation:** Initial build had dist-cjs/index.js - npm would treat it as ESM despite CommonJS compilation
- **Root cause:** Node.js extension resolution: .js is assumed to match package.json type field. .cjs always forces CommonJS regardless of package type
- **How to avoid:** Added find+rename postbuild step complexity, but eliminates silent runtime module errors for CJS consumers

#### [Gotcha] Line-count comparison (677 lines identical) is insufficient verification of byte-identical behavior - must also diff function bodies to catch logic drift from imports/whitespace changes (2026-02-13)
- **Situation:** Initial verification only checked that server version and extracted version had same line count, but didn't verify function logic was truly identical
- **Root cause:** Import rewriting and formatting during extraction could silently change logic while keeping line count same. Function body comparison (diff on lines 25-677) catches these changes
- **How to avoid:** Extra verification step (diff) adds confidence but increases verification time

#### [Gotcha] Nested packages directory structure caused import path confusion - created packages/create-protolab/packages/ instead of correctly placing files in packages/create-protolab/src/ (2026-02-13)
- **Situation:** During initial implementation, file structure was created with incorrect nesting (packages/create-protolab/packages/create-protolab/...) instead of the expected monorepo pattern
- **Root cause:** Unclear mental model of the monorepo structure. The package name @automaker/create-protolab led to confusion about where files should live vs. where imports come from
- **How to avoid:** Caught early through verification testing which tried to import and immediately failed, forcing correction. Manual test-first approach prevented committing broken code