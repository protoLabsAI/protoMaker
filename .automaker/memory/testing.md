---
tags: [testing]
summary: testing implementation decisions and patterns
relevantTo: [testing]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 11
  referenced: 7
  successfulFeatures: 7
---
# testing

#### [Pattern] Test .gitignore patterns by creating actual files and running `git check-ignore`, then verify via integration test that the file appears in `git status` (2026-02-10)
- **Problem solved:** Pattern syntax errors in .gitignore are silent—git simply ignores files you intended to track, and this only surfaces when you notice git status doesn't show expected files
- **Why this works:** .gitignore validation requires two layers: (1) syntax correctness via `git check-ignore`, (2) intent correctness via `git status`. Syntax can be right but pattern logic wrong (e.g., parent directory ignored). Only integration test proves the actual behavior
- **Trade-offs:** Requires full integration test (create actual files, run git commands) vs cheaper unit tests. Cost is minimal for critical paths like version control rules

#### [Gotcha] Unit tests for EM agent merge functionality pass because they mock githubMergeService.mergePR(). Real merge against live GitHub API would fail without valid repo context. (2026-02-10)
- **Situation:** Test suite creates temporary test directories without actual git repos or GitHub credentials. Actual merge would require real repo + GitHub auth.
- **Root cause:** Unit tests verify control flow (that mergePR is called with right args, audit events emitted). Integration tests would verify actual GitHub merge. Different testing layers.
- **How to avoid:** Easier: Catch implementation bugs early without real GitHub. Harder: Doesn't verify actual GitHub API behavior (permissions, branch protection, API changes).

#### [Gotcha] Full integration tests for git worktree operations require real filesystem operations, making them slow and fragile. Documentation-focused tests verify implementation structure instead. (2026-02-10)
- **Situation:** Wanted to verify the safety guard works end-to-end but realized integration tests would need to actually create git repos, worktrees, and simulate agent state.
- **Root cause:** Documentation tests verify the implementation exists and is wired correctly, which catches most issues. Full E2E tests would be slower and add complexity. The actual runtime behavior is already covered by existing tests in other components.
- **How to avoid:** Tests are more about documenting *why* the safety guard exists (platform limitation) than testing *that* it works. This is acceptable because the wiring is straightforward and integration behavior can be verified manually.

#### [Gotcha] Playwright test initially failed because TypeScript compilation succeeded but dev server wasn't running new code (2026-02-10)
- **Situation:** Built code without restarting server; test ran against stale server logic
- **Root cause:** Dev server caches compiled code in memory. Restart required to pick up new task registration.
- **How to avoid:** Faster iteration (no restart per build) vs risk of testing stale code. Dev discipline: restart after structural changes.

#### [Gotcha] WorldStateMonitor tests require `null as any` for githubChecker parameter because the service is instantiated with optional dependencies (2026-02-10)
- **Situation:** Writing tests for drift detection without needing a real GitHub API client
- **Root cause:** WorldStateMonitor constructor accepts githubChecker for optional GitHub state checks. Passing null disables those checks. Tests don't need GitHub integration—only testing drift detection logic
- **How to avoid:** Using `null as any` is pragmatic but hides optional dependencies from type system. Code is more resilient than it appears (services gracefully handle null deps)

#### [Gotcha] Private method testing via `(service as any)` type assertion hides real contract violations - tests passed but implementation details were untested (2026-02-10)
- **Situation:** Unit tests used type assertions to access private methods buildFeedbackPrompt and processReviewStatus, creating illusion of coverage without testing actual public behavior
- **Root cause:** Private methods aren't directly testable from outside the service. Type assertions bypass TypeScript's visibility checks but don't create real test contracts
- **How to avoid:** Easier: can write unit tests without refactoring code. Harder: tests don't verify public API contracts; if implementation changes without changing method signature, tests still pass; real bugs in public behavior go undetected

#### [Gotcha] Event emission tests must verify BOTH presence and ordering of events - a single check for 'health:check-completed' existing won't catch missing 'health:issue-detected' events (2026-02-12)
- **Situation:** Simple test that only verifies 'health:check-completed' exists would pass even if the 'health:issue-detected' emission was never added
- **Root cause:** Event-driven systems are easy to test incompletely. The success of downstream behavior (health:check-completed) doesn't guarantee all intermediate events fired. Must test the event stream sequence, not just endpoints.
- **How to avoid:** More comprehensive tests = more test code, but catches off-by-one event sequence bugs that integration tests might miss

#### [Pattern] Use event spy callbacks to capture and filter multiple event types, then verify ordering with index comparisons (2026-02-12)
- **Problem solved:** Need to verify that multiple events fire in a specific order (health:issue-detected before health:check-completed) in a single test run
- **Why this works:** Callback spy captures full event stream with timing. Filtering by event type (call[0]) + index comparison is clearer than trying to count events or use event timestamps.
- **Trade-offs:** More complex test (array filtering, index math) vs simpler individual event tests, but catches real bugs

#### [Pattern] Template verification tests check for specific content keywords in systemPrompt strings rather than exact matches. Tests assert presence of identifiers like 'Ava Loveland', 'GTM', 'protoLabs' rather than full prompt text (2026-02-12)
- **Problem solved:** Needed to verify systemPrompt fields exist and have appropriate content without brittle tests that break on minor prompt wording changes
- **Why this works:** Keyword-based assertions are robust to prompt refinements. If someone rewrites the prompt but keeps the core concepts (Ava's role, GTM focus), tests still pass. Exact string matching would break on every prompt edit
- **Trade-offs:** Keyword matching is less strict (could miss some issues) but more maintainable. Tests document 'what matters' about each prompt (identity, domain) rather than 'exact wording'

#### [Gotcha] Verification script checked for implementation correctness using regex patterns on source code, but this approach cannot catch runtime logic errors (e.g., rate limit calculation off-by-one, async race conditions in postToDiscordWithRateLimit) (2026-02-12)
- **Situation:** Created a TypeScript verification script to confirm all 10 required implementation points existed and compiled, marking feature 'verified'
- **Root cause:** Fast feedback without spinning up full test infrastructure. Regex verification is 95% accurate for 'did the developer write the right code structure'
- **How to avoid:** Regex verification is fast and scales, but misses: Off-by-one errors in Date.now() comparisons, async race where two concurrent notifications slip through the Map check, Discord API failures. A real test would catch these. For critical paths like notification delivery, the gap is real

#### [Gotcha] Build succeeded with circular dependency warnings already present—didn't surface new issues from role parameter additions (2026-02-12)
- **Situation:** npm run build completed with exit code 0 despite warnings about circular dependencies in existing code
- **Root cause:** Circular dependency warnings don't block compilation in TypeScript/webpack configuration. They indicate code smell but don't prevent runtime execution. This feature didn't introduce new circularity—it only added new parameters to existing call chains.
- **How to avoid:** Easier: faster iteration, no refactoring of legacy circular dependencies. Harder: could mask underlying architectural issues in existing codebase; warnings accumulate

#### [Gotcha] Playwright E2E tests skipped due to existing server instance conflict - test environment assumes no running server, but dev environment typically has one running (2026-02-12)
- **Situation:** Attempted to run Playwright verification tests in development environment where server was already running on the port tests expected
- **Root cause:** Port conflicts cause test framework to fail during setup. Tests need isolated environment or must target already-running instance.
- **How to avoid:** Skipping E2E tests saves time in dev flow but loses integration verification. Build-only verification (TypeScript compilation) is sufficient for type safety but doesn't verify hook behavior.

#### [Gotcha] File-based verification test that reads source code instead of running runtime checks creates brittleness (2026-02-12)
- **Situation:** Created Playwright test that uses fs.readFileSync() to verify interface definitions and prop usage patterns rather than rendering components
- **Root cause:** Playwright doesn't easily support type-checking verification; webpack/dev-server wasn't running a headless browser instance. File-reading felt faster than spinning up a test server
- **How to avoid:** Test passes as long as string patterns exist in source, but doesn't verify actual runtime behavior (component renders correctly, props flow through, no destructuring issues). Catches syntax errors but misses logic errors. Later integration tests will catch real issues

#### [Gotcha] Playwright e2e tests cannot run with dev server already running on ports 3000-3010. Attempting to run tests kills dev server or fails with port conflict. (2026-02-12)
- **Situation:** Wanted to verify ProjectHealthCard in e2e tests but dev server was actively running. Could not run test harness without stopping dev server first.
- **Root cause:** Playwright test runner spawns its own server on the same ports. No port negotiation or parallel test mode for dev environment.
- **How to avoid:** Manual testing against dev server + verification that component builds/types correctly becomes proxy for e2e coverage. Trade off automated e2e for faster iteration during development.

#### [Gotcha] Playwright E2E tests for dashboard features are brittle and impractical due to complex state management timing issues (store hydration from settings API, currentProject state only set after navigation, dashboard's dual purpose as selector vs viewer) (2026-02-12)
- **Situation:** Attempted to write automated tests for the event feed integration feature, encountered timing issues with state synchronization across navigation flows
- **Root cause:** The dashboard state depends on settings API hydration and project selection navigation - both asynchronous with non-deterministic timing. Testing requires coordinating multiple async operations.
- **How to avoid:** Manual testing documentation is faster to write and maintain than E2E tests, but provides no regression detection. Trade-off favors rapid MVP iteration over coverage.

#### [Pattern] Manual verification documentation as primary acceptance criteria instead of automated E2E tests for complex state-dependent features (2026-02-12)
- **Problem solved:** Feature involves multiple async state dependencies (settings hydration, project selection, event stream) that make deterministic E2E tests difficult
- **Why this works:** Manual testing is pragmatic for MVP features with complex state coordination. Well-documented manual steps are fast to execute and provide human validation. Avoids creating brittle tests that fail due to timing races.
- **Trade-offs:** No regression detection after changes vs faster iteration and lower test maintenance burden. Suitable for internal tools or rapidly evolving features.

#### [Gotcha] File path resolution in test suite requires correct relative paths from test location through monorepo structure (2026-02-12)
- **Situation:** Verification test initially used `../../types/src/settings.ts` which failed. Correct path from `apps/web/tests/` is `../../../libs/types/src/settings.ts`
- **Root cause:** Monorepo structure: `apps/` and `libs/` are siblings at same depth. Tests in `apps/web/tests/` must traverse up 3 levels to reach workspace root, then into libs.
- **How to avoid:** Relative paths are fragile (-) but portable across machines (+). Test setup simplicity achieved at path fragility cost.

#### [Gotcha] npm pack --dry-run outputs file list to stderr, not stdout. Test assertions on execSync output must capture both or redirect stderr to stdout with 2>&1 (2026-02-13)
- **Situation:** Initial test was checking output variable for tarball file list - found nothing because output was empty
- **Root cause:** npm pack writes the summary/file listing to stderr by design, keeping stdout clean for piping the actual tarball
- **How to avoid:** Required test adjustment, but matches actual npm pack behavior. stderr redirection is standard practice for capturing full command output

#### [Pattern] Synchronization comment + manual/CI-based verification for multi-location type definitions (2026-02-13)
- **Problem solved:** Two identical copies of 256-line interface definition that must stay synchronized but have no programmatic link
- **Why this works:** Sync comment serves as (1) documentation for developers to remember both files exist, (2) anchor point for potential CI check that diffs both files. Pure comment doesn't enforce anything but creates visibility
- **Trade-offs:** Relies on developer discipline or CI check to catch drift. Comment is lightweight and non-intrusive

#### [Gotcha] runCmd must return Promise<{code, stdout, stderr}> structure even for sync commands (2026-02-13)
- **Situation:** Creating universal CLI helper that abstracts child process execution
- **Root cause:** Promises force async/await consistency in calling code (no mixed sync/await); returning structured object (not just stdout) enables exit code checking and error diagnostics
- **How to avoid:** Always async means slight overhead even for fast commands, but enables timeout/cancellation; structured return requires field access vs string interpolation

#### [Pattern] Used hardcoded test data (mockResearch) with pre-calculated expected results (19 gaps for minimal config, 0 gaps for full compliance) to verify function produces identical output to server version (2026-02-13)
- **Problem solved:** Need to prove extracted function produces byte-identical results without running full server integration tests
- **Why this works:** Gap checks are deterministic - same input always produces same output. Hardcoded expectations document what 'correct' behavior looks like and catch regressions immediately if gap checks are modified
- **Trade-offs:** Test brittleness if gap checks intentionally change (requires test update). Clarity gain: tests document the exact gap count expectations for different project configurations

#### [Gotcha] Playwright file-system tests verified template files exist and contain placeholders by reading from dist/ after build (2026-02-13)
- **Situation:** Needed to verify postbuild script actually copied files and they contain {{variable}} placeholders
- **Root cause:** File existence + content checks are the only way to verify postbuild worked. Running tests post-build ensures dist/templates/ is already populated. Tests must run INSIDE the package directory (join(process.cwd(), 'packages/create-protolab')) to resolve paths correctly.
- **How to avoid:** Easier: Catches real integration failures. Harder: Tests are integration tests (slower, require full build), fragile to path changes

#### [Gotcha] Pure synchronous data transformation function has no UI or integration points, making Playwright tests inapplicable. Unit tests would test the algorithm, not integration (2026-02-13)
- **Situation:** Feature was extracted as a pure function; initial expectation was to create Playwright test, but the function has no UI surface or side effects to verify through browser automation
- **Root cause:** Playwright tests DOM/user interactions. This function transforms data structures. Testing it requires input/output assertions on data, not browser events. Unit tests (Jest, Vitest) are the correct tool
- **How to avoid:** Easier: correct test tool selection. Harder: recognizing that not all code needs E2E testing; pure functions benefit from unit tests instead

#### [Gotcha] Verification tests use Playwright (intended for E2E) instead of Vitest (unit tests) but are actually unit tests (2026-02-13)
- **Situation:** Temporary verification test was written to validate template system before committing, but was created with Playwright instead of Vitest which is the project's unit test framework
- **Root cause:** Likely developer convenience - Playwright was fresh in mind or available. Worked fine for the temporary test but added unnecessary dependency
- **How to avoid:** Pro: Test ran successfully and was deleted after verification. Con: Added 60-100MB Playwright install that wasn't needed for unit testing

#### [Pattern] Inline verification test (verify-cli.test.mjs) as single-file ES module rather than Jest/Vitest integration (2026-02-13)
- **Problem solved:** Need to verify CLI from shell spawn perspective (exit codes, stdio capture, arg parsing) without npm test infrastructure overhead
- **Why this works:** Node spawn child process testing requires stdio piping that Jest mocks might hide. Single ES module avoids build/transpile delays during dev. Spawns real CLI process = tests actual binary behavior not test framework behavior
- **Trade-offs:** Easier: fast iteration, accurate exit code testing, no framework noise. Harder: manual assertion library, no snapshot testing, must clean up after itself

#### [Pattern] Verification script that tests directory structure, file content, and idempotency in sequence before cleanup (2026-02-13)
- **Problem solved:** Init phase creates critical infrastructure — incorrect structure or content breaks downstream agents and templates
- **Why this works:** Manual verification script caught TypeScript config issue before PR. The script creates a temp directory, runs init, checks all directories exist, validates file content (checks for key phrases like '# test-project' and 'TypeScript'), runs init again to test idempotency, then cleans up. This catches: missing directories, empty files, wrong template fragments, and idempotency failures.
- **Trade-offs:** Verification script is one-time use (not in test suite), but it's executable documentation. Found real bugs that automated tests might miss. Trade-off: manual maintenance if init logic changes.

#### [Pattern] Created executable CLI test that validates both JSON structure AND compliant/gap item field requirements using property-level assertions (2026-02-13)
- **Problem solved:** Gap analysis returns complex nested objects (gaps[], compliant[], summary). Frontend and downstream consumers need guaranteed field presence, not just type correctness
- **Why this works:** Testing JSON.parse() alone proves output is valid JSON but doesn't catch missing fields—a gap object without 'effort' will parse fine but crash frontends trying to access gap.effort. Property-level assertions (expect(gap).toHaveProperty('effort')) catch schema regressions early
- **Trade-offs:** Easier: Clear error messages when fields missing ('expected gap to have property effort'). Harder: Test is verbose (6 nested assertions per gap item), must update tests if schema changes

#### [Gotcha] Root vitest config interferes with package-level tests in monorepo. Must create local vitest.config.ts at package level to isolate test environment. (2026-02-13)
- **Situation:** Tests in packages/create-protolab were inheriting root vitest configuration which had incompatible globals and environment settings, causing test failures.
- **Root cause:** Monorepo packages need isolated test configs. Root config may include workspace-wide settings (like globals: true) that conflict with individual package requirements. Package-level configs take precedence in vitest.
- **How to avoid:** Each package now maintains its own vitest.config.ts (slight duplication) but gains isolation. Test runs are faster and more reliable per-package.

#### [Pattern] Tests verify both file creation AND correct variable interpolation per package manager. Each test covers: directory structure, all 4 workflows, package manager placeholder replacement, correct setup action presence/absence. (2026-02-13)
- **Problem solved:** CI phase has multiple dimensions of correctness: directory structure, file count, content accuracy, and conditional logic (setup actions).
- **Why this works:** Single-dimension tests miss entire classes of bugs. Testing placeholder replacement catches errors in regex/interpolation logic. Testing conditional setup actions (bun without pnpm/action-setup) catches logic errors in conditions.
- **Trade-offs:** Multi-dimensional tests are more complex to write but catch more bugs. Adding 4 package manager variations increases test count but provides confidence across all supported scenarios.

### Verification test uses execSync to check TypeScript compilation and Node.js syntax validation rather than runtime execution (2026-02-13)
- **Context:** Need to validate branch-protection.ts compiles and produces valid JavaScript without actually calling GitHub API
- **Why:** execSync('node -c') validates syntax without importing/executing; avoids dependency on gh CLI or GitHub auth during test. Tests assertions about file structure and compilation, not behavior
- **Rejected:** Importing the module directly (would fail if gh CLI missing), mocking GitHub API (too heavy for syntax validation), only checking TS source (misses tsc errors)
- **Trade-offs:** Doesn't test actual phase execution logic; but that requires gh CLI auth which shouldn't be a test dependency. Syntax validation catches most implementation bugs anyway
- **Breaking if changed:** If phase adds top-level gh CLI calls (e.g., 'which gh' at import time), node -c validation will fail and hide the real problem

#### [Gotcha] Manual verification required for CLI tools because automated testing of setup/teardown is fragile (2026-02-13)
- **Situation:** No automated test suite written. Implementation verified through manual test execution.
- **Root cause:** Setup tools are inherently fragile to automate: they create real files, git repos, and network calls. Playwright designed for web UI, not CLI. Mock-based tests lose coverage of actual file I/O errors. Real setup requires real environment.
- **How to avoid:** Easier: manual verification catches real-world issues (permission errors, missing git, etc.). Harder: not reproducible in CI/CD (requires real environment setup).

#### [Pattern] Used temporary directory + cleanup pattern for verification test rather than mocking bd CLI or requiring bd to be installed (2026-02-13)
- **Problem solved:** Function directly executes system commands (bd init, which bd) and modifies filesystem (.beads/ directory). Can't unit test in isolation
- **Why this works:** Integration testing with real filesystem catches actual failure modes (bd CLI missing, permissions, YAML parsing). Mock-based tests would pass but fail in production. Temporary directory ensures no pollution of actual projects
- **Trade-offs:** Slower test but higher confidence. Test requires cleanup discipline. Test depends on runtime environment (bd CLI availability)

### Created standalone Node.js verification script instead of Jest/vitest tests. Script was deleted after verification to avoid test infrastructure debt. (2026-02-13)
- **Context:** New package in early development. Needed to verify core functionality (file generation, idempotence, content integrity) before integration.
- **Why:** Standalone script allows quick verification without configuring entire test framework. Deletion after verification avoids accumulating test infrastructure for a simple, deterministic function. The function's API is stable so regression risk is low.
- **Rejected:** Could have added Jest/vitest setup with permanent tests, but for a single-purpose phase with clear requirements, the cost/benefit of test infrastructure doesn't justify it. Could have skipped testing entirely, but verification script caught the __dirname bug early.
- **Trade-offs:** No permanent test suite means future changes require manual re-verification. But the function is simple enough that the risk is manageable, and the saved build/ci complexity is worth it.
- **Breaking if changed:** If future developers add similar phases, they should reuse a single verification script pattern rather than creating multiple ad-hoc scripts, otherwise it becomes unmaintainable. The pattern only works for deterministic, simple functions.

#### [Gotcha] Switched from Playwright test runner to simple Node.js verification script due to module import errors in test environment (2026-02-13)
- **Situation:** Initial approach used Playwright as specified in docs, but faced module resolution issues with @automaker/types and @automaker/utils imports.
- **Root cause:** Playwright is designed for E2E browser testing. For pure TypeScript library validation, Node.js runtime is simpler and has correct module resolution via tsconfig. Avoids webpack/bundler complexity.
- **How to avoid:** Lost browser automation capability (not needed here) but gained faster test execution and simpler debugging. Pure logic doesn't benefit from Playwright.

### Create Node.js verification script instead of Playwright test for API module validation (2026-02-13)
- **Context:** Feature requires verification but is Discord REST API integration (not browser automation), yet test framework defaults to Playwright
- **Why:** Playwright is for browser automation; testing API modules with it is a category error. Module verification (imports, function signatures, error handling) is better served by direct Node.js script with mock env vars
- **Rejected:** Force Playwright test (semantic mismatch), skip verification (risk undetected regressions)
- **Trade-offs:** Easier: direct testing of function behavior without browser overhead. Harder: can't test actual Discord API calls without real credentials/guild
- **Breaking if changed:** If verification script is deleted, no automated check that module exports are valid; future refactors may silently break imports

#### [Gotcha] Shell echo with complex multiline code strings causes quoting and escaping failures in dynamically generated test files. Using fs.writeFileSync instead eliminates shell injection risk and syntax errors. (2026-02-13)
- **Situation:** Initial attempt to create test files using execSync with echo command failed due to shell escaping issues when code contained quotes, newlines, and special characters.
- **Root cause:** Shell commands require careful escaping and have limited string handling. fs.writeFileSync writes raw content directly without interpretation, making it safer for code generation.
- **How to avoid:** Requires async/await in test functions, but gains reliability and readability. The minor async overhead is negligible vs the stability gain.

#### [Pattern] Integration tests for npm packages must test the complete packaging lifecycle: build → npm pack → extract tarball → npm install in temp directory → import/execute. Each stage is critical to validate. (2026-02-13)
- **Problem solved:** Simply testing import after build doesn't validate that npm pack includes all necessary files, or that the published package will work when installed elsewhere.
- **Why this works:** npm pack can silently exclude files due to .npmignore, missing package.json exports fields, or incorrect build output. Only testing the full published package reveals these issues before release.
- **Trade-offs:** Integration tests are slower (npm install adds 5-15s per test) but catch production issues impossible to find in unit tests.

### Test fixture must mirror real-world repository structure (package.json with type field, src/ directory with .ts files, README) rather than minimal stub. Gap analysis tests validate against fixture expecting realistic structure. (2026-02-13)
- **Context:** Early fixture was too minimal. Gap analysis tests then validated against a structure that didn't match what users would actually encounter, making tests less useful.
- **Why:** Gap analysis is designed to audit real repositories and recommend missing best practices. Testing against minimal fixtures doesn't validate that recommendations work for realistic projects.
- **Rejected:** Minimal fixtures with just package.json - these pass trivially and don't exercise the gap analysis logic that matters most.
- **Trade-offs:** Fixture setup is more complex, but tests now validate meaningful real-world scenarios. The fixture serves as documentation of expected repository structure.
- **Breaking if changed:** If fixture structure changes, gap analysis recommendations might break in ways that wouldn't be caught.

#### [Gotcha] npm pack from monorepo requires built dist/ with correct exports. If build:packages hasn't run or dist/ is stale, npm pack includes source files instead of compiled output, causing module import failures in tests. (2026-02-13)
- **Situation:** Tests sometimes passed and sometimes failed depending on whether dist/ was current. This non-determinism was hard to debug.
- **Root cause:** npm pack reads package.json exports field and includes whatever files are referenced. If exports point to dist/index.js but dist/ is outdated, npm pack includes source .ts files which can't be imported directly.
- **How to avoid:** Each test run requires rebuild (5-10s overhead), but guarantees tests reflect actual published package. Alternative is flaky non-deterministic tests.

### Separate temp directory cleanup into afterAll hook (OS-level cleanup) rather than manual cleanup in each test. Prevents stale test directories from accumulating and isolates test pollution. (2026-02-13)
- **Context:** Manual cleanup in each test could be skipped if test fails, leaving temp directories. Also increases individual test code size.
- **Why:** Centralized cleanup in afterAll is guaranteed to run exactly once after all tests complete, regardless of pass/fail. It's also the conventional Jest/Vitest pattern.
- **Rejected:** Per-test cleanup with try/finally - increases boilerplate in each test and makes tests harder to read.
- **Trade-offs:** Slightly delays test completion but ensures no orphaned temp directories. Makes test code cleaner and side effects more obvious.
- **Breaking if changed:** If afterAll cleanup is removed, test runs accumulate temp directories in OS temp space, eventually causing disk space issues or subsequent test failures due to path conflicts.

#### [Pattern] Integration tests for dual-format packages (ESM and CJS) require separate test directories with different package.json type fields and require/import syntax. Each format's behavior is unpredictable in cross-format contexts. (2026-02-13)
- **Problem solved:** Single test directory can't reliably test both formats because Node's module resolution caches decisions based on type field and directory state.
- **Why this works:** Node.js treats .mjs and .cjs files differently depending on parent directory's package.json type field. Testing both requires isolated contexts to prevent cache pollution.
- **Trade-offs:** Test code is slightly more verbose (two separate test blocks) but guarantees each format is validated in its correct context.

### Matrix exclusion strategy: explicitly excluded yarn on Windows to reduce CI combinations from 27 to 24 while maintaining coverage (2026-02-13)
- **Context:** Creating comprehensive cross-platform CI matrix for Node.js package manager compatibility (3 OS × 3 Node versions × 3 package managers = 27 combinations)
- **Why:** Yarn has known Windows compatibility issues and creates redundant coverage when npm is already tested on Windows. Reduces CI cost/time without meaningful loss of test coverage.
- **Rejected:** Full Cartesian product (27 combinations) - unnecessarily expensive; single-OS matrix - insufficient cross-platform validation
- **Trade-offs:** Reduces CI runtime by ~11% but introduces risk if Windows-specific yarn issue surfaces post-publish. Acceptable risk given yarn's declining market share.
- **Breaking if changed:** If Windows yarn support becomes critical requirement, must regenerate matrix. CI won't catch Windows-yarn edge cases until added back.

#### [Gotcha] Package manager detection via lockfile presence is order-dependent and brittle when multiple lockfiles exist (2026-02-13)
- **Situation:** Implemented detection as: pnpm-lock.yaml → pnpm, else yarn.lock → yarn, else npm. Fixtures created with single lockfile each to avoid ambiguity.
- **Root cause:** Simple, deterministic detection without adding npm/pnpm/yarn CLI invocations. Avoids dependency on tool availability during detection phase.
- **How to avoid:** Fast and simple but fails silently if fixture has multiple lockfiles. Real-world repos sometimes have legacy lockfiles.

#### [Pattern] Conditional CI steps using matrix variables (`if: matrix.package-manager == 'npm'`) to route fixture tests through correct package manager (2026-02-13)
- **Problem solved:** Need to run same fixture suite but with different install/run commands depending on package manager (npm install vs pnpm install vs yarn install)
- **Why this works:** Avoids creating separate fixture per package manager or duplicating test logic. Single fixture definition tested by all three managers. GitHub Actions matrix variables enable clean branching.
- **Trade-offs:** Conditional steps add ~3 extra lines per operation but eliminate fixture duplication. More readable than nested shell conditionals.

### Minimal but complete fixtures: each includes package.json + lockfile + at least one source file, no external dependencies (2026-02-13)
- **Context:** Balancing fixture realism (must detect real package manager signals) vs CI speed (minimize install time on 24 matrix combinations)
- **Why:** Lightweight fixtures reduce CI wall-clock time from ~8min to ~3min per combination. Lockfile presence is sufficient to validate detection logic. Adding dependencies adds no test value.
- **Rejected:** Heavy fixtures with real dependencies - 10x slower; fixture-less testing - misses real-world lockfile signals; mocked lockfiles - doesn't validate actual tool behavior
- **Trade-offs:** Fixtures don't validate that install actually works with real dependencies, but that's npm/pnpm/yarn's responsibility. Detection + basic file creation is sufficient for this tool's scope.
- **Breaking if changed:** If tool logic changes to parse lockfile content (e.g., monorepo detection), current minimal fixtures become insufficient and must be expanded.

#### [Pattern] Integration tests validate external behavior (file creation, CLI execution) rather than internal methods, using actual fixture repos as test subjects (2026-02-13)
- **Problem solved:** Testing package detection and project scaffolding tool that must work across package managers and platforms
- **Why this works:** External behavior is what end users care about. Mocking package managers is fragile - unit tests would pass but real `npm install` could fail differently. Real fixtures validate actual tool behavior.
- **Trade-offs:** Slower test execution (spins up real fs operations) but catches real-world failures. Higher fidelity = higher confidence in tool reliability.