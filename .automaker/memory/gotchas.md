---
tags: [gotchas]
summary: gotchas implementation decisions and patterns
relevantTo: [gotchas]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 181
  referenced: 81
  successfulFeatures: 81
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

#### [Gotcha] BaseProvider.constructor calls this.getName() before subclass constructor sets required instance variables, causing method to access undefined properties (2026-02-13)
- **Situation:** TracedProvider constructor calls super() which triggers BaseProvider.constructor, which immediately calls this.getName() - but TracedProvider.wrapped hasn't been set yet
- **Root cause:** JavaScript constructor execution order: super() runs to completion before subclass constructor body executes. Virtual method dispatch calls overridden method during parent construction.
- **How to avoid:** Defensive null-coalescing (this.wrapped?.getName() || 'traced') is verbose but required. Alternative would be factory pattern to avoid calling constructor logic.

#### [Gotcha] LangGraph's `ConditionalEdgeFunction` type signature requires checking source node name, but state-only routing functions don't have source context (2026-02-13)
- **Situation:** Initial router implementations assumed state-only routing. LangGraph's edge routing provides both state AND source node metadata.
- **Root cause:** The source node context enables more sophisticated routing patterns (e.g., 'from A go to B, from C go to D'). State-only routers are simpler but limited.
- **How to avoid:** Router functions are slightly more complex (must accept and handle optional source param), but enable context-aware routing.

#### [Gotcha] LangGraph's setEntryPoint and addEdge methods require type assertions despite being public API methods (2026-02-13)
- **Situation:** TypeScript compilation failed with 'Property does not exist' errors on StateGraph instance methods
- **Root cause:** LangGraph's type definitions use generic overloads that don't properly expose these methods on the StateGraph instance type. The methods exist at runtime but are hidden by TypeScript's type system.
- **How to avoid:** Type assertions disable type safety at these call sites, but methods are stable LangGraph API. Alternative would be wrapping StateGraph in typed facade class.

#### [Gotcha] Workspace dependency references must use explicit version numbers, not workspace:* protocol in certain contexts (2026-02-13)
- **Situation:** Initial npm resolution failed when @automaker/flows tried to reference @automaker/types using workspace protocol
- **Root cause:** LangGraph build/compilation process may not resolve workspace protocol correctly in some monorepo configurations. Explicit version numbers force npm resolution to use published versions or local copies consistently.
- **How to avoid:** Explicit versions slightly decouple from monorepo's version management - requires manual sync. But gained immediate stability and avoided monorepo-wide configuration changes.

#### [Gotcha] Documentation length limit (800 lines) forced pruning of verbose examples without losing critical implementation details (2026-02-14)
- **Situation:** Initial draft with full 3-example section was 950+ lines; needed to fit acceptance criteria while maintaining completeness
- **Root cause:** Docs need examples for clarity but also need to be maintainable; verbose examples with extensive comments become stale as code evolves. Concise examples with cross-references to actual source is more maintainable
- **How to avoid:** Easier: docs stay synchronized with codebase. Harder: readers need to flip between doc and source code for full understanding

#### [Gotcha] Skipping relations for dependency features without linearIssueId yet, relying on eventual consistency (2026-02-14)
- **Situation:** When syncing feature dependencies, dependent features may not have been synced to Linear yet, so no issueId exists
- **Root cause:** Rather than fail the entire operation or queue retries, gracefully skip and log - the relation will be created when that feature is eventually synced and its dependencies are re-evaluated
- **How to avoid:** Simpler immediate implementation but relies on idempotent eventual consistency; relations may appear out of order temporally but will eventually be complete

#### [Gotcha] Linear relations API structure nests related issue ID under relatedIssue.id, not directly in the relation object (2026-02-14)
- **Situation:** When fetching relations from Linear GraphQL, the response structure has relations.nodes[].relatedIssue?.id, requiring safe navigation.
- **Root cause:** Linear's schema separates the relation metadata (type, id) from the related entity reference, likely for schema normalization.
- **How to avoid:** Safer: Optional chaining prevents crashes. Harder: Less obvious that relatedIssue could be missing.

#### [Gotcha] Feature type uses error?: string field, not errorMessage (2026-02-14)
- **Situation:** Initial implementation tried to access f.errorMessage for blocked features, caused TypeScript compilation failure
- **Root cause:** Feature interface design choice - 'error' is the semantic field name for error messages in blocked state
- **How to avoid:** Correct field name ensures consistency with Feature type contract, but requires knowing the interface definition

#### [Gotcha] Timeout handling in Linear API calls needs explicit configuration rather than relying on defaults (2026-02-14)
- **Situation:** GraphQL mutations to Linear could hang or timeout, affecting ceremony execution
- **Root cause:** Linear API has specific performance characteristics and network conditions may vary. Explicit timeout prevents ceremonies from stalling indefinitely waiting for Linear responses
- **How to avoid:** Adds operational tuning parameter, but prevents blocking ceremonies on slow Linear API

#### [Gotcha] LangGraph conditional edges with quality gates create implicit loops - must set max_iterations to prevent infinite review cycles (2026-02-14)
- **Situation:** Implemented review-quality node with approve/revise routing. Without max_iterations, a single revision request could loop indefinitely.
- **Root cause:** The quality gate uses `conditional_edges` to route back to generateReport if revision needed. Without iteration limits, this becomes unbounded. The state graph doesn't automatically prevent looping.
- **How to avoid:** Adding max_iterations limits review quality (can't endlessly refine). But prevents hang/timeout. Need to balance thoroughness vs practicality.