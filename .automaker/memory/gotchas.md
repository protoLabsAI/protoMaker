---
tags: [gotchas]
summary: gotchas implementation decisions and patterns
relevantTo: [gotchas]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 285
  referenced: 146
  successfulFeatures: 146
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

#### [Gotcha] TipTap packages installed at monorepo root node_modules (v2.27.2 latest) rather than workspace-scoped, following npm workspace hoisting rules. (2026-02-15)
- **Situation:** Attempted to install TipTap but packages didn't appear in node_modules/@tiptap initially. Later discovered they were installed in root (../..) not in apps/ui/node_modules.
- **Root cause:** npm workspaces use symlink hoisting: dependencies listed in workspace package.json are resolved from workspace root node_modules, not individual workspace. This is by design to avoid duplication across workspaces.
- **How to avoid:** Root hoisting means one copy of TipTap shared across entire monorepo (good: saves disk/memory). Risk: if two workspaces need different TipTap versions, hoisting forces a choice (usually latest wins). Debugging requires understanding ../.../node_modules path navigation.

#### [Gotcha] File path confusion: created files in nested apps/ui/apps/ui/src structure before realizing working directory was already apps/ui. (2026-02-15)
- **Situation:** Mistakenly copied files to wrong location, then corrected course by checking pwd and file listing.
- **Root cause:** Initial uncertainty about Bash context (pwd). Assumed needs to create full path structure.
- **How to avoid:** Extra file copy operation, but caught and fixed during implementation rather than in review.

#### [Gotcha] Error state structure assumed to have message, stack, type, timestamp properties based on JavaScript error patterns, but actual CopilotKit error structure may vary (2026-02-15)
- **Situation:** CopilotKit agent state stores errors with unknown shape; component accesses error properties without knowing definitive structure
- **Root cause:** No TypeScript interface definition available for CopilotKit error objects; reasonable inference from standard error patterns
- **How to avoid:** Defensive null checks and optional chaining prevent crashes but silently hide error details if structure differs from assumption

#### [Gotcha] WebSocket event subscription must be established on component mount and cleaned up on unmount to prevent memory leaks and duplicate handlers when overlay route is revisited (2026-02-17)
- **Situation:** Activity feed uses http-api-client.subscribeToEvents() via WebSocket. If subscription is not cleaned up, revisiting the overlay route creates multiple listeners for the same event, each updating separate ring buffers
- **Root cause:** Browser component lifecycle: mount creates subscription, unmount must unsubscribe. Without cleanup, browser tab accumulates handlers (each adding to memory) and each route revisit multiplies active subscriptions
- **How to avoid:** Requires proper React useEffect cleanup vs simpler no-cleanup code. Cleanup is mandatory for any WebSocket/event subscription pattern

#### [Gotcha] Playwright browser installation requires specific system dependencies that may not exist in some environments; TEST_REUSE_SERVER flag allows tests to run against existing dev server (2026-02-18)
- **Situation:** Initial test attempt failed because Playwright browsers weren't installed and environment lacked required dependencies
- **Root cause:** Playwright bundles Chromium/Firefox/WebKit which require glibc and other system libraries. TEST_REUSE_SERVER allows CI/testing in restricted environments by reusing running instance
- **How to avoid:** Reusing server makes tests faster and environment-agnostic but requires coordination that server is running; less isolated than full Playwright setup

#### [Gotcha] Package.json exports map must exactly match tsup entry points for all export paths to work (2026-02-18)
- **Situation:** Multiple export paths declared (./atoms, ./molecules, ./organisms, ./lib, root) but only some had corresponding tsup entries during development
- **Root cause:** tsup generates a separate chunk for each entry point. If an entry point is declared in package.json exports but missing from tsup entry array, no JavaScript file is generated. The TypeScript declaration file may exist (if dts generation happens), but the .js file is missing, causing 'module not found' at runtime.
- **How to avoid:** Requires discipline to keep two configuration sources in sync, but catches mismatches at build time rather than at runtime in production

#### [Gotcha] CSS imports in monorepos must use relative paths at runtime, not package imports, despite package.json exports being configured (2026-02-18)
- **Situation:** Added `./themes.css` export to libs/ui/package.json for API completeness, but actual imports in apps/ui still use relative paths (../../../../libs/ui/src/themes/themes.css)
- **Root cause:** Tailwind CSS content scanner and Vite CSS import resolution don't honor package.json exports for CSS files. They treat CSS imports as file paths, not module specifiers. Package imports work for JS but not CSS in build tools.
- **How to avoid:** Relative paths are fragile and verbose but work reliably. Package imports are clean but break silently (file not found). Chose paths that work over APIs that fail.

#### [Gotcha] Duplicate nested directory path (libs/ui/libs/ui/) in worktree test file creation due to incorrect write context (2026-02-18)
- **Situation:** Test file generated during verification landed in doubly-nested path, indicating lost context about working directory during file write operation
- **Root cause:** Agent context drift: CWD was within worktree subdirectory; relative path construction didn't anchor properly; Write tool used relative paths without verification
- **How to avoid:** Required manual diagnosis via glob search and path repair; lesson reinforces requirement to always use absolute paths in worktrees

#### [Gotcha] Bulk import updates via task agents missed relative imports (../ui/markdown) that weren't part of standard aliased import patterns (2026-02-18)
- **Situation:** After moving components and running bulk import updates with aliases (@protolabs/ui/molecules), two files (memory-view.tsx, context-view.tsx) still had old relative imports (from '../ui/markdown'). These weren't caught by the import replacement because they used a different pattern than the task expected.
- **Root cause:** Automated bulk updates use regex patterns that match common import styles. Relative imports vary widely and may not match the exact pattern. Manual post-verification of grep results catches patterns the automation missed.
- **How to avoid:** Added manual verification step (grep for old import paths) increases refactoring time but ensures complete migration. Prevents runtime errors from missed imports.

#### [Gotcha] Storybook addon version incompatibility: Removing one problematic addon (addon-a11y) doesn't prevent cascading failures in other addons. The root cause (version mismatch at the monorepo level) persists, breaking remaining addons that depend on the same internal APIs. (2026-02-18)
- **Situation:** Removed addon-a11y to eliminate addon-highlight dependency (which was throwing 'No matching export' error). After npm install, Storybook still failed with 'Missing ./internal/theming' from @storybook/blocks. This suggests the problem wasn't addon-a11y—it was the version mismatch itself.
- **Root cause:** All Storybook addons depend on internal APIs that changed between v8 and v10. Removing one addon doesn't update the hoisted Storybook version—it remains v10.2.8 from apps/ui, breaking any addon trying to use v8.x internal APIs.
- **How to avoid:** Removing addons buys time but hides the real problem. Eventually, you run out of addons to remove. Fixing the root cause (version alignment) is more effort upfront but prevents cascading failures.

#### [Gotcha] Storybook build output directory must be explicitly specified in npm scripts, not just in storybook config, for CI/CD reproducibility (2026-02-18)
- **Situation:** Feature required configuring Storybook to build into a predictable location for CI verification. The default storybook build behavior outputs to storybook-static/, but this wasn't explicit in the script.
- **Root cause:** CI workflows that reference the output directory need the location to be declared in the script itself. Relying only on Storybook config defaults makes the contract between package.json scripts and CI workflows implicit and fragile. Explicit --output-dir flag makes the contract visible to anyone reading the script.
- **How to avoid:** More verbose script declaration but gains explicit visibility. The flag is idempotent (specifying --output-dir storybook-static when that's already the default is harmless).

#### [Gotcha] .npmignore whitelist approach: `*` (exclude all) followed by `!path/**` (include specific) is required for monorepo packages to avoid accidentally including source files when exports reference src/ (2026-02-18)
- **Situation:** Initial .npmignore excluded src/ globally, but package.json exports included ./src/themes/themes.css. Standard exclude patterns would have prevented themes from being packaged while still leaking other src/ files.
- **Root cause:** npm's .npmignore matching is line-order dependent. Blacklist approach (exclude src/, then include src/themes/) fails because the first match wins. Whitelist approach (exclude *, then include dist/ and src/themes/) guarantees only intended paths are packaged.
- **How to avoid:** Whitelist is more explicit but requires maintaining the include list as exports change. Easier to verify what's shipped (npm pack --dry-run shows exactly what publishes). Harder to onboard new developers who expect standard .gitignore semantics.

#### [Gotcha] TypeScript build cache in tsup creates stale bundled config files that prevent type updates from being recognized. Clearing `tsup.config.bundled_*.mjs` files resolves phantom type errors. (2026-02-19)
- **Situation:** After renaming EscalationSource enum value, build failed with 'does not provide an export named' errors even though dist/index.d.ts was correct. Rebuilding individual packages didn't help.
- **Root cause:** tsup caches bundled config files with timestamps. When types change, the cache isn't invalidated automatically, causing tsc to read stale .d.ts files from previous bundles.
- **How to avoid:** Clearing cache solves the problem instantly vs full rebuilds taking 90+ seconds. Risk: may lose other tsup optimizations briefly, but they rebuild automatically.

#### [Gotcha] activeWorkflows counter must decrement in all exit paths, including early returns when no changes exist (2026-02-19)
- **Situation:** Git workflow operations increment activeWorkflows counter at start. If operation returns early without changes, must still decrement or counter drifts
- **Root cause:** Counter represents currently-executing workflows. If incremented but never decremented (due to early exit), counter becomes permanently inflated and status reports incorrect active workflow count
- **How to avoid:** Requires careful counter management at every exit point, but accurately reflects true active state

#### [Gotcha] Build process returned exit code 1 despite successful compilation, making it unclear if changes broke anything (2026-02-19)
- **Situation:** npm run build output showed warnings about circular dependencies and exit code 1, but actual build artifacts were generated
- **Root cause:** Circular dependency warnings in the build system cause non-zero exit code even when compilation succeeds. This is a pre-existing project configuration issue, not caused by the changes
- **How to avoid:** Had to verify via git diff and manual code inspection rather than relying on build exit code as success signal

#### [Gotcha] React Flow library generates ResizeObserver warnings and WebSocket environment errors that must be explicitly filtered from console assertions to prevent false test failures (2026-02-21)
- **Situation:** Naive approach of capturing all console.error() calls causes tests to fail on library-generated warnings unrelated to application code
- **Root cause:** React Flow uses ResizeObserver for internal layout calculations which triggers warnings in test/CI sandboxes. WebSocket connections in test environments generate spurious errors. Capturing all errors assumes application should be warning-free, but third-party libraries may not comply.
- **How to avoid:** Must maintain list of known warnings (fragile to library updates) but prevents flaky tests; adds cognitive load to test interpretation

#### [Gotcha] File watcher detects MKV immediately when OBS creates it, but file is still being written. Solution: wait 5 seconds for file size stabilization before triggering remux. (2026-02-22)
- **Situation:** `fs.watch()` fires on file creation event, but OBS output buffering means file is incomplete. Processing incomplete MKV causes corrupt MP4.
- **Root cause:** Empirical 5-second threshold accounts for OBS buffer flush behavior. Avoids platform-specific file locking checks. Simple and reliable for this specific use case.
- **How to avoid:** Automatic and reliable stabilization vs. 5-second artificial delay (non-critical since remux is fast relative to streaming duration).

### Accepted pre-existing TypeScript build error in @automaker/platform package (p-limit import issue) as acceptable since feature only creates static HTML files (2026-02-22)
- **Context:** Build verification encountered compilation error in unrelated package, but feature doesn't depend on it
- **Why:** Feature has zero dependency on broken package, proceeding unblocks delivery, fixing unrelated errors is scope creep, static HTML files can be deployed regardless
- **Rejected:** Fixing the build error (scope creep); blocking feature on unrelated issues
- **Trade-offs:** Faster feature delivery; leaves technical debt in codebase; hides fragility in build system
- **Breaking if changed:** If feature requirements change and now require the broken package, hidden debt becomes visible crisis; if someone tries to build entire monorepo, they hit the error and must debug it; if CI/CD fails on build, teams can't easily distinguish feature-related failures from pre-existing ones

#### [Gotcha] Package build verification strategy shifted to isolated package builds when upstream platform package had pre-existing TypeScript errors, masking potential integration issues (2026-02-22)
- **Situation:** npm run build:packages failed on platform package import errors unrelated to social tools feature
- **Root cause:** Isolated build (libs/tools, apps/server) faster feedback and clear scope, but can't verify cross-package integration or type compatibility with platform package
- **How to avoid:** Unblocked feature verification and identified that tools package itself compiles cleanly, but may have missed integration bugs with types package

#### [Gotcha] TypeScript incremental compilation cache can report 'no exported member' errors even when types are correctly built and exported in dist files (2026-02-22)
- **Situation:** SignalCounts type showed compilation error in server even though grep verified it was present in libs/types/dist/index.d.ts
- **Root cause:** TypeScript's incremental cache stores stale references from previous compilation state; resolves on worktree merge or IDE restart
- **How to avoid:** Delayed developer feedback but doesn't block builds; confusing to troubleshoot without understanding cache behavior

#### [Gotcha] Map iteration in TypeScript requires Array.from() wrapper to avoid downlevelIteration TypeScript compiler errors, particularly when iterating over Map entries for token scopes. (2026-02-22)
- **Situation:** Using `for (const [key, value] of map.entries())` directly causes compilation failures in certain TypeScript configurations.
- **Root cause:** TypeScript downlevelIteration flag affects how iterators are compiled; older target compatibility (ES2015) requires explicit iterator protocol. Array.from() forces concrete array creation.
- **How to avoid:** Array.from() adds minor performance overhead (creates array copy) but ensures consistent compilation across configurations.

#### [Gotcha] Raw request body access via `(req as any).rawBody` is non-standard and depends on middleware configuration (2026-02-23)
- **Situation:** Signature verification requires original request bytes, not parsed JSON. Implementation uses `(req as any).rawBody` which is added by a middleware, not Express built-in.
- **Root cause:** Express doesn't preserve raw body after parsing. Custom middleware must capture it before JSON parsing. Type cast needed because TypeScript doesn't know about custom middleware properties.
- **How to avoid:** Pro: Cryptographically secure signature verification. Con: Depends on middleware that may not exist in all environments (breaks silently if middleware missing).

#### [Gotcha] Async processing errors are logged but don't affect webhook response status - silent failures possible (2026-02-23)
- **Situation:** Webhook responds with 200 immediately, then processes async. If sync fails later, only logs capture the error.
- **Root cause:** Responding immediately is required for webhook reliability. But consequence is async errors can't be returned to caller.
- **How to avoid:** Pro: Webhook won't timeout or crash. Con: Errors in sync service, GitHub API, or prompt retrieval don't propagate to caller; requires log monitoring to detect issues.