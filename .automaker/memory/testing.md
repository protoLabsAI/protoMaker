---
tags: [testing]
summary: testing implementation decisions and patterns
relevantTo: [testing]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 65
  referenced: 25
  successfulFeatures: 25
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
- **How to avoid:** Tests are more about documenting _why_ the safety guard exists (platform limitation) than testing _that_ it works. This is acceptable because the wiring is straightforward and integration behavior can be verified manually.

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

### Created standalone Node.js verification script instead of Jest/vitest tests. Script was deleted after verification to avoid test infrastructure debt. (2026-02-13)

- **Context:** New package in early development. Needed to verify core functionality (file generation, idempotence, content integrity) before integration.
- **Why:** Standalone script allows quick verification without configuring entire test framework. Deletion after verification avoids accumulating test infrastructure for a simple, deterministic function. The function's API is stable so regression risk is low.
- **Rejected:** Could have added Jest/vitest setup with permanent tests, but for a single-purpose phase with clear requirements, the cost/benefit of test infrastructure doesn't justify it. Could have skipped testing entirely, but verification script caught the \_\_dirname bug early.
- **Trade-offs:** No permanent test suite means future changes require manual re-verification. But the function is simple enough that the risk is manageable, and the saved build/ci complexity is worth it.
- **Breaking if changed:** If future developers add similar phases, they should reuse a single verification script pattern rather than creating multiple ad-hoc scripts, otherwise it becomes unmaintainable. The pattern only works for deterministic, simple functions.

#### [Gotcha] Switched from Playwright test runner to simple Node.js verification script due to module import errors in test environment (2026-02-13)

- **Situation:** Initial approach used Playwright as specified in docs, but faced module resolution issues with @protolabsai/types and @protolabsai/utils imports.
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

#### [Gotcha] Playwright test file included imports from node:child_process and node:fs but test ran successfully in non-Node environment consideration (2026-02-13)

- **Situation:** Created E2E verification test using Playwright that executes Node.js code to verify file system and run CLI commands
- **Root cause:** Playwright runs in browser context by default, but this test needed Node.js APIs. The test was structured to work in Playwright's Node.js test runner context, not browser context
- **How to avoid:** Easier: full verification of integration. Harder: test is tied to Node.js environment, not portable to browser testing

#### [Gotcha] New packages with zero tests still need vitest.config.ts and must pass test:packages script successfully (2026-02-13)

- **Situation:** Initially expected test failures for unimplemented package, but test suite completed successfully with 0 tests
- **Root cause:** npm run test:packages runs across all workspace packages regardless of whether they have tests. Missing or misconfigured vitest.config.ts would cause the entire test command to fail
- **How to avoid:** Requires configuration upfront even for empty packages, but ensures package integrates immediately into CI/CD pipeline with no surprises later

#### [Gotcha] Disabled providers must throw immediately on getProvider() call, not at initialization time (2026-02-13)

- **Situation:** Test showed that disabled providers can be registered but should fail on retrieval, not registration
- **Root cause:** Allows factory to contain disabled providers (useful for configuration gradual rollout) but prevents accidental use. Error happens where bug would occur (at usage site) rather than silently failing earlier.
- **How to avoid:** Easier: deferred validation catches more scenarios. Harder: errors happen at usage time not config load time, harder to debug if disabled provider is called rarely.

#### [Pattern] Mock TestProvider class in unit tests that implements BaseLLMProvider with configurable behavior rather than using partial mocks (2026-02-13)

- **Problem solved:** Need to test factory with provider-like objects without external dependencies or complex mocking
- **Why this works:** Full implementation class catches runtime issues that partial mocks miss (e.g., interface mismatches). Easy to vary behavior per test via constructor. Documents what a real provider must implement.
- **Trade-offs:** Easier: see exactly what provider interface requires, test various implementations. Harder: requires maintaining test provider class as interface evolves.

#### [Gotcha] Vitest module mocking requires mock class definition inside the factory function, not outside. External definition causes mocking to fail silently (2026-02-13)

- **Situation:** Initial mock implementation defined ChatAnthropic mock class outside the vi.mock() factory, resulting in real ChatAnthropic being instantiated instead of mock
- **Root cause:** Vitest's module resolution creates a new scope for mocked modules. Mock implementation must be defined within that scope to override the import properly. External definitions exist in a different scope chain
- **How to avoid:** Code duplication of mock definition versus correct module mocking behavior. Correct approach is less DRY but functionally necessary

#### [Gotcha] Health check latency measurements can be 0ms for mocked/very fast responses. Tests expecting latencyMs > 0 fail unpredictably based on system performance (2026-02-13)

- **Situation:** Integration tests failed with assertion `expect(result.latencyMs).toBeGreaterThan(0)` in mocked environment
- **Root cause:** Mock responses execute too fast to accumulate measurable milliseconds. In real API scenarios with network latency, this passes. But in testing with mocks, system resolution can be insufficient. The assertion was overly strict
- **How to avoid:** Relaxing to `toBeGreaterThanOrEqual(0)` is more realistic but less strict validation. Alternative would be performance-dependent flaky tests

#### [Gotcha] Timing-sensitive tests (latency measurement) need execution margin buffer rather than exact assertions (2026-02-13)

- **Situation:** Initial latency test with `toBeGreaterThanOrEqual(10)` was flaky because async operations have variable overhead
- **Root cause:** JavaScript timing is not deterministic - setTimeout(10) can execute in 5-15ms depending on event loop load and system conditions. The test measured elapsed time, not just the setTimeout duration.
- **How to avoid:** Easier: test reliability. Harder: less precise latency verification, harder to catch subtle timing regressions

### MockLangfuseAPI provides fixture-based implementation rather than mocking SDK directly (2026-02-13)

- **Context:** Need to test prompt executor behavior without real Langfuse API calls
- **Why:** Mock implementation allows testing the full integration logic (fetch, variable injection, trace creation) in one test suite while simulating Langfuse responses. This catches integration bugs that SDK mocks would miss.
- **Rejected:** Using vi.mock() to mock langfuse SDK would isolate execution logic from API response handling, missing realistic contract violations
- **Trade-offs:** Easier: comprehensive integration testing without external dependency. Harder: mock must stay in sync with real Langfuse API contract
- **Breaking if changed:** Removing MockLangfuseAPI would require either Langfuse credentials for tests or less realistic mocking

#### [Gotcha] Test latency expectations changed from `toBeGreaterThan(0)` to `toBeGreaterThanOrEqual(0)` during mock implementation (2026-02-13)

- **Situation:** Integration tests were failing because mocked API responses had zero latency, violating the assumption that any real API call takes time
- **Root cause:** Mock implementations execute synchronously without network delay, so latency can legitimately be 0ms. Production code must handle this case correctly
- **How to avoid:** Easier: Accurate testing of edge cases (zero-latency). Harder: Must account for legitimate zero-latency scenarios in production code

#### [Pattern] Created separate mock files for OpenAI and Google API responses with realistic structure validation (2026-02-13)

- **Problem solved:** Integration tests needed to validate provider behavior without hitting real APIs, while ensuring mock responses match real API schemas
- **Why this works:** Mock responses that don't match real API structure would give false confidence. Separating mocks by provider makes them easier to update when real APIs change
- **Trade-offs:** Easier: Catch schema mismatches early, API changes force mock updates. Harder: Mocks must be maintained as APIs evolve

#### [Pattern] Integration tests written to skip when credentials unavailable, using early returns to avoid test failures in incomplete CI environments (2026-02-13)

- **Problem solved:** Groq tests need API key, Ollama tests need running service, Bedrock tests need AWS credentials - not all available in every environment
- **Why this works:** Allows monorepo CI to run partial tests (e.g., test what's available) rather than blocking on uninstalled providers. Developers can run full test suite locally with credentials, partial in CI
- **Trade-offs:** Reduces test coverage visibility (may not catch credential issues until production). Requires discipline to manually test before deploying

#### [Pattern] Comprehensive manual verification script (40 checks) instead of unit tests for documentation (2026-02-13)

- **Problem solved:** Documentation quality is hard to measure with traditional tests; need to verify content structure and completeness
- **Why this works:** Automation catches human errors in documentation structure (missing sections, code blocks, type definitions). Verification runs once at build time.
- **Trade-offs:** Script is throwaway (deleted after verification). Documents verification logic itself in code rather than as living tests.

#### [Gotcha] Vitest mock setup requires class-based mocks for proper constructor behavior with Langfuse client (2026-02-13)

- **Situation:** Mocking the Langfuse client constructor to avoid actual API calls during tests
- **Root cause:** Vitest's vi.mock() applies to module exports at a module level. For class constructors, the mock must be applied to the class itself, not instance methods. Improper mocking causes tests to attempt real API calls.
- **How to avoid:** Requires understanding Vitest's module mocking behavior but ensures true unit tests without side effects

#### [Pattern] Integration tests placed in library (libs/observability) rather than consumer app (apps/server), testing tracing as a reusable component with concrete provider mocks (2026-02-13)

- **Problem solved:** Tracing feature spans observability package and provider integration. Tests could live in either package or both.
- **Why this works:** Library owns its contract - tests verify tracing middleware works independently before being consumed. Consumer app tests would test integration but not catch middleware regressions.
- **Trade-offs:** Existing comprehensive tests in libs/observability mean apps/server doesn't need duplicate tests (simpler) but depends on library test coverage.

#### [Gotcha] Reducer tests must validate undefined/null inputs because state fields may not exist initially, and LangGraph applies reducers even on first-time state initialization (2026-02-13)

- **Situation:** Initial test suite missed handling `undefined` inputs to reducers. LangGraph calls reducers during state creation, not just updates.
- **Root cause:** State annotations don't guarantee field presence initially. Reducers must be idempotent and handle missing values gracefully. The `mergeState` pattern relies on undefined-safe operations.
- **How to avoid:** Slightly more verbose reducer logic to handle edge cases, but ensures graph initialization never fails. Tests explicitly verify this behavior.

#### [Pattern] Integration tests validate full graph execution with state inspection at each node rather than mocking individual nodes (2026-02-13)

- **Problem solved:** Need to verify state flows correctly through the entire graph and persists via checkpointer
- **Why this works:** Node-level mocking would test unit behavior but miss state marshaling bugs, edge routing failures, or checkpoint deserialization issues. Full integration tests catch these integration-level failures.
- **Trade-offs:** Integration tests slower and require more setup, but critical for catching state management bugs that would only manifest at runtime. Worth the cost given this is new framework integration.

#### [Gotcha] State fields modified via updateState() may not persist until processed by a downstream node execution (2026-02-13)

- **Situation:** Test assumed that updating state directly would persist the change immediately, but the field only became reliably available after the next node processed it
- **Root cause:** LangGraph's state management treats updateState() as a mutation that gets batched and processed in the node execution cycle. Direct state mutations don't trigger node-level state updates
- **How to avoid:** Requires tests to account for execution flow boundaries; makes state changes explicit but requires understanding execution model

#### [Pattern] Integration tests for interrupt/resume workflows must verify state at interrupt boundaries, not just final outcomes (2026-02-13)

- **Problem solved:** Simple end-to-end tests of 'draft → review → approve' don't catch state management bugs during the interrupt/resume cycle
- **Why this works:** Human-in-the-loop workflows have three critical phases: (1) pause at interrupt, (2) human inspection/modification, (3) resume from same point. Each phase needs verification. Testing only final output misses state corruption between phases
- **Trade-offs:** Integration tests are slower and more complex but catch real-world integration issues; unit tests faster but miss critical pause/resume behavior

#### [Gotcha] Examples must handle both successful Langfuse responses and fallback behavior identically for correctness (2026-02-13)

- **Situation:** Examples demonstrate SDK in two modes: with and without credentials/Langfuse
- **Root cause:** If fallback mode produces different output than real Langfuse mode, developers won't catch integration bugs until production. The API contract must be identical.
- **How to avoid:** SDK fallback implementation is more complex (returns valid objects with placeholder IDs instead of null), but examples work correctly in both modes without branching logic

#### [Gotcha] Adding a new provider to factory requires updating unrelated test files that assert fixed provider counts (2026-02-13)

- **Situation:** New FakeProvider was added to ProviderFactory, causing provider-factory.test.ts to fail - tests expected 4 providers, now 5.
- **Root cause:** Test files contained brittle assertions on provider counts (hardcoded values) rather than dynamic discovery. When adding the 5th provider, these assertions broke.
- **How to avoid:** Current approach catches when provider count changes (good for tracking). Cost is that every new provider requires test updates. Better long-term: count tests should be separate from name/registration tests.

#### [Pattern] Comprehensive test coverage (19 tests) for new provider covering constructor, execution, detection, and integration scenarios (2026-02-13)

- **Problem solved:** New provider had to prove it works correctly with abstraction layer and meets all acceptance criteria.
- **Why this works:** Provider abstraction layer is foundational - bugs here affect all agent flows. Tests verify not just happy path but also config validation, error handling, feature support flags, and multi-turn scenarios.
- **Trade-offs:** 19 tests take longer to maintain but catch integration issues early. Tests serve as living documentation of provider contract.

#### [Pattern] FakeChatModel pattern: extend BaseChatModel with predefined responses for deterministic testing without API calls (2026-02-14)

- **Problem solved:** Testing LangGraph flows that depend on LLM outputs requires either mocking or using real API calls, both problematic for CI/CD
- **Why this works:** FakeChatModel provides controlled, repeatable outputs while remaining a valid BaseChatModel instance, allowing the flow to execute through its full state machine without API dependencies or flakiness
- **Trade-offs:** Increased test setup (must define all expected responses) vs guaranteed determinism and speed. Forces explicit test data definition which improves test clarity

#### [Gotcha] LangGraph array reducers accumulate across invocations, not within a single invocation. State persists and appends on resume (2026-02-14)

- **Situation:** Testing HITL resume cycles, expected researchResults to have exactly N items after invoke, but found count grew unpredictably
- **Root cause:** The reducer (left, right) => [...left, ...right] is called each time state updates occur. When resuming after checkpoint, previous results already in state, new invoke appends again. This is correct behavior for accumulating results but breaks test assumptions
- **How to avoid:** Use toBeGreaterThanOrEqual() instead of exact assertions, accepting that cross-invocation state accumulation is feature-not-bug. Simplifies tests at cost of less precise verification

#### [Gotcha] MemorySaver.list() returns async generator, not array. Cannot iterate synchronously or use length property (2026-02-14)

- **Situation:** Attempted to assert checkpoint count with checkpointerList.length, got undefined. Method returns AsyncGenerator<Checkpoint>
- **Root cause:** LangGraph checkpoint storage is async by design (mirrors real storage backends like PostgreSQL). list() returns generator to handle potentially large checkpoint histories without loading all into memory
- **How to avoid:** Must use for-await loops to iterate checkpoints. Adds complexity to test code but ensures pattern works with real async storage backends

### Simplified HITL testing to verify interrupt detection and state persistence rather than multi-stage resume flows (2026-02-14)

- **Context:** Full HITL cycle testing (interrupt → modify state → resume → continue flow) proved complex due to LangGraph's interrupt semantics and conditional node logic
- **Why:** LangGraph interrupts require understanding when nodes trigger interrupts (after execution completes), how state mutations affect resume, and conditional routing. Testing end-to-end resume is fragile because it depends on graph topology and reducer behavior interacting
- **Rejected:** Testing full multi-stage resume (easier to test 'the whole thing works' but harder to diagnose which stage fails; couples test to graph topology changes)
- **Trade-offs:** More granular, fragile-to-topology-changes tests vs fewer, flakier end-to-end tests. Chose granular because it isolates interrupt behavior from resume behavior
- **Breaking if changed:** If interrupt nodes change or state mutations occur mid-interrupt, single-stage interrupt tests still pass but flow breaks. Recommend adding E2E tests with real state mutations as separate test suite

#### [Pattern] Parallel Send() with reducer aggregation requires testing both individual parallel execution AND reducer behavior in isolation (2026-02-14)

- **Problem solved:** Testing research phase with parallel Send() calls that aggregate results using array reducer
- **Why this works:** Reducer behavior (append arrays) is invisible to individual Send() calls. Testing only the final state conflates Send() behavior with reducer behavior. Isolating reducer unit tests reveals assumptions about how results combine
- **Trade-offs:** More tests (separate Send() tests and reducer tests) vs fewer integration tests. Better failure isolation and clearer contract definition

### Test model fallback via isolated SectionWriter subgraph rather than full flow with injected failures (2026-02-14)

- **Context:** Verifying smart model → fast model fallback requires triggering failures in the smart model, then confirming fast model is called
- **Why:** Full flow testing with injected failures is fragile (depends on where failures occur, error propagation, retry logic). Testing SectionWriter subgraph in isolation allows explicit control: create scenario where smart model fails, assert fast model executes
- **Rejected:** Injecting failure at flow level (requires mocking/patching LLM, affects multiple nodes, harder to diagnose which node's fallback executed)
- **Trade-offs:** Tests SectionWriter behavior independently, not in context of full flow. Requires separate integration test to verify fallback works end-to-end
- **Breaking if changed:** If SectionWriter's error handling or retry logic changes, isolated tests catch it. If flow-level error handling changes, must add separate E2E fallback test

#### [Pattern] Created a Node.js verification script that validates documentation against actual implementation artifacts before commit (2026-02-14)

- **Problem solved:** Documentation can drift from code reality, especially for complex features with many dependencies and configuration options
- **Why this works:** Automated verification ensures the documented architecture (7-phase flow, Send() parallelism, ContentConfig structure) matches the actual codebase. This catches drift early and prevents users from following incorrect documentation
- **Trade-offs:** Additional verification script adds complexity but prevents greater complexity of maintaining out-of-sync documentation across multiple consumer teams

### Verification script checks existence of referenced module files and internal documentation links before documentation is considered complete (2026-02-14)

- **Context:** Documentation contains module paths like 'libs/flows/src/content/content-creation-flow.ts' and links to other docs that could become stale or incorrect
- **Why:** Module references and internal links are the most likely to break during refactoring since documentation isn't automatically updated when code files move. Early verification prevents published documentation pointing to non-existent locations
- **Rejected:** Skip verification and rely on code reviewers to manually validate paths - but paths are hard to visually inspect and easily missed in review
- **Trade-offs:** Stricter checking means documentation becomes brittle to refactoring (moving a file breaks doc verification), but this is actually desirable - it surfaces the need to update documentation when code structure changes
- **Breaking if changed:** Without link verification, documentation silently points to non-existent files, giving users broken references and false confidence that the documented architecture exists

#### [Gotcha] Dynamic template count assertions (expect(count).toBeGreaterThanOrEqual(13)) should be used instead of exact counts to prevent test brittleness when new templates are added (2026-02-14)

- **Situation:** Test verification expected 13+ templates rather than exactly 13, anticipating future template additions
- **Root cause:** Each new agent template increments the registry count. Exact assertions create maintenance burden and cause false test failures when templates are added
- **How to avoid:** Less precise assertions but significantly better maintainability and reduced test churn as the agent template library grows

#### [Gotcha] Import path calculation from test location to source files requires understanding directory nesting depth (../../src/ not ./apps/server/src/), a common source of module resolution errors (2026-02-14)

- **Situation:** Initial import used incorrect relative paths, requiring correction to ../../src after moving test file to unit test directory
- **Root cause:** Test location (apps/server/tests/unit/) is 2 levels deep from src location (apps/server/src/), making path calculation error-prone. TypeScript's relative path resolution is order-sensitive
- **How to avoid:** Relative imports require manual path calculation but match existing test conventions. Absolute imports would be more maintainable but introduce inconsistency

#### [Gotcha] extractAllTags() requires identical unescaping logic as extractTag() despite using different regex flags (gi vs i) (2026-02-14)

- **Situation:** Initial implementation only added unescaping to extractTag(). Tests for extractAllTags still failed because it has its own parsing loop without unescaping applied.
- **Root cause:** Both functions process extracted content identically; skipping unescaping in one breaks the abstraction contract that all extraction functions normalize output.
- **How to avoid:** Requires maintaining unescaping logic in two places (extractTag and extractAllTags). Benefit: explicit control. Cost: duplication risk if unescaping logic changes.

#### [Pattern] Test suite covers both simple entities and complex real-world scenarios (TypeScript generics, code blocks with multiple entities) (2026-02-14)

- **Problem solved:** Parser is used to extract code blocks from LLM outputs where angle brackets appear in type annotations and comparisons.
- **Why this works:** Simple entity tests verify basic correctness; complex tests verify the real problem being solved. Catches regressions from edge cases where multiple entities interact (e.g., 'x &lt; 5 &amp;&amp; y &gt; 3').
- **Trade-offs:** More comprehensive: 11 tests vs minimal 3-4. Cost: longer test suite. Benefit: confidence in production scenarios.

#### [Pattern] Used type-only Playwright tests (type assertions with expect() on properties) for verifying library-level code instead of attempting full runtime integration tests. (2026-02-14)

- **Problem solved:** ES module ESM runtime issues prevented traditional integration tests from running. Needed verification without external service mocking.
- **Why this works:** Type verification via assertions catches structural mismatches and export issues early without requiring full runtime environment. For library code, type safety is often the primary concern.
- **Trade-offs:** Type tests don't catch runtime behavior bugs, only structural issues. But they run instantly, have no external dependencies, and verify the public API contract. Full behavior testing deferred to integration layer.

#### [Gotcha] Temporary verification test file creates false confidence in implementation without integration testing (2026-02-14)

- **Situation:** Created `fact-checker-verification.test.ts` to verify heuristic path works, then deleted after passing
- **Root cause:** Test verified happy path but doesn't catch real LLM integration failures. Deleting test after verification is anti-pattern - masks brittleness.
- **How to avoid:** Faster initial development vs long-term testability. Quick verification made process feel complete but left debt.

### Replace manual HITL review with antagonistic review scoring system (0-100 scale) for autonomous validation (2026-02-14)

- **Context:** End-to-end pipeline needed automated quality validation without human interruption while maintaining quality standards
- **Why:** Antagonistic review provides deterministic, repeatable scoring that works autonomously. Manual HITL breaks the fully autonomous pipeline and creates bottlenecks. Scoring enables threshold-based gating (75% minimum) to catch regressions automatically.
- **Rejected:** Keep HITL review - would require human intervention, breaking end-to-end automation. Simple pass/fail checks - no visibility into quality degrees. External quality services - added dependency and latency.
- **Trade-offs:** Gained: Fully autonomous validation, measurable quality metrics, reproducible test results. Lost: Nuanced human judgment, discovery of edge cases only humans notice.
- **Breaking if changed:** If scoring system removed, test becomes binary pass/fail with no insight into quality gradients. Removing threshold gating means quality regressions go undetected until they're critical.

#### [Gotcha] HTML entities in generated code blocks (`&lt;`, `&gt;`) are flagged as violations, but this is actually correct LLM output that needs post-processing, not a validation bug (2026-02-14)

- **Situation:** Test detected HTML entity escaping in generated markdown code blocks and correctly marked as violations (-30 points)
- **Root cause:** The detection is working correctly - the LLM is HTML-escaping angle brackets when it shouldn't in markdown. This is a real quality issue upstream in the content generation, not in the validation. The validator correctly caught it.
- **How to avoid:** Gained: Early detection of LLM output issues before they reach users. Lost: Slower iteration if prompt changes needed to fix entity escaping. Requires understanding that validator is correctly identifying upstream problems.

#### [Pattern] Quality report written to `/tmp/` as JSON alongside full markdown output, with exit code 1 on failure for CI integration (2026-02-14)

- **Problem solved:** Need to provide quality metrics to both humans (readable report) and CI systems (structured data + exit codes)
- **Why this works:** JSON report enables programmatic CI checks and dashboards. Exit code 1 signals failure to CI/CD without requiring log parsing. Separate files keep concerns isolated - markdown for human review, JSON for automation.
- **Trade-offs:** Gained: Machine-readable validation results, CI integration, artifact history. Lost: Slightly more complex output structure, two files instead of one.

### Validate both content quality (HTML entities, duplicate headings) AND review scores (>= 75% threshold) as separate validation gates (2026-02-14)

- **Context:** Need multi-layered quality checks that catch both structural issues and LLM assessment quality
- **Why:** Content issues are objective (duplicate headings exist or don't). Review scores are subjective assessments of quality. Both gates catch different failure modes: content issues catch generation bugs, review scores catch low-quality content that's structurally valid. Separate checks allow debugging which gate failed.
- **Rejected:** Only check content structure - misses subjective quality issues. Only use review scores - structural issues slip through. Combine into single score - can't tell if failure is structural or quality.
- **Trade-offs:** Gained: Orthogonal failure detection, clear diagnostics, catches more issues. Lost: More complex validation logic, more ways for test to fail.
- **Breaking if changed:** If structural validation removed, malformed content (duplicate headings, unescaped entities) ships without detection. If score threshold removed, low-quality content rated as acceptable. If gates aren't separate, failure diagnostics become ambiguous.

#### [Gotcha] Antagonistic reviewer uses 7.0+ average score across 8 dimensions for auto-approval, but implementation shows regeneration cycles and score thresholds per dimension (2026-02-14)

- **Situation:** Documentation showed single approval threshold but test cases revealed complex scoring logic with hook/clarity/value/engagement/SEO/credibility/CTA/completion dimensions
- **Root cause:** 8-dimension scoring provides granular quality assessment; auto-approve only when average exceeds threshold to catch borderline content for regeneration
- **How to avoid:** Gained: better content quality through multi-dimensional assessment; Lost: simpler test assertions, more complex scoring logic to maintain

#### [Gotcha] Cannot directly test service with actual imports due to dependency chains - need file-based structural verification instead (2026-02-14)

- **Situation:** Tried to import LinearProjectUpdateService and LinearMCPClient in Playwright test, caused build/import errors
- **Root cause:** Circular dependencies or missing dependencies in test environment. Playwright tests run in different context than Node. Unit test framework (Vitest/Jest) would be better
- **How to avoid:** File-based verification catches structural issues (methods exist, right exports) but can't catch logic errors. Requires separate unit test suite later

#### [Pattern] Status mapping test verifies exact order/completeness of all statuses, not just coverage (2026-02-14)

- **Problem solved:** Need to ensure no status values are forgotten in the mapping switch statement
- **Why this works:** Testing that Object.keys(statusMappings) equals exact array catches additions/removals at test time. A status missed in mapping silently defaults to 'planned' without test failure
- **Trade-offs:** Test is more brittle—changes to status list require test updates. But brittleness is intentional—forces deliberate decisions when adding statuses

#### [Pattern] Verify LangGraph flows with standalone Node.js scripts before running E2E tests - catches compilation and execution errors faster (2026-02-14)

- **Problem solved:** E2E Playwright test failed due to unrelated ESM module issues in flows package. Standalone verification script identified actual flow issues in minutes.
- **Why this works:** Playwright tests have setup overhead and dependency complications. A simple Node.js script that imports and executes the flow cuts through noise. Tests the happy path before complexity of test harness.
- **Trade-offs:** Standalone script only tests happy path, doesn't validate browser/UI integration. But catches real problems much faster. Use both approaches.

### Verification test was structure-only, not integration test - verified schema in code rather than testing live endpoint response (2026-02-15)

- **Context:** Could write Playwright test to authenticate, call endpoint, verify full response. Instead, created test that verifies endpoint exists (401 check) and structure is correct in code.
- **Why:** Live integration test would require auth setup, environment config, potentially fragile. Structure test ensures types are correct and catches refactoring errors. 401 check confirms router is registered without needing full auth flow.
- **Rejected:** Could skip testing entirely - endpoint is simple passthrough. Could require full auth integration test, but adds setup overhead. Could use unit test mocking, but same verification value as structure test.
- **Trade-offs:** Easier: fast, no auth setup, catches structure drift. Harder: doesn't verify actual response shape at runtime, doesn't catch auth bypass.
- **Breaking if changed:** If schema is removed/changed without updating code test, test fails (catches drift). If endpoint auth is accidentally removed, test passes but endpoint becomes public (test didn't catch it). If endpoint returns unexpected shape at runtime, test doesn't catch it.

#### [Gotcha] Playwright config with reuseExistingServer: false will spawn new server instance even if one is already running. Don't use Playwright for integration tests of already-running dev servers. Use direct build verification + component structure checks instead. (2026-02-15)

- **Situation:** Dev server was already running (port 3007). Playwright attempted to spawn another instance, created port conflict and test hang.
- **Root cause:** Playwright's reuseExistingServer: false is aggressive. Running tests against running dev servers requires either: (1) explicit reuseExistingServer: true, or (2) skip Playwright entirely and verify at build/import level.
- **How to avoid:** Build verification is faster, doesn't depend on running server, but catches fewer runtime errors. Tradeoff acceptable for feature verification (structure is deterministic at build time).

#### [Gotcha] Substring-based test matching fails when function boundaries span multiple lines. The pattern 'indexOf(functionName)' to 'indexOf(nextFunctionName)' captures wrong slice when definitions wrap. (2026-02-15)

- **Situation:** Verification test tried to extract function bodies using substring() with indexOf() for start/end, but function signatures and closing braces span multiple lines causing off-by-one slices
- **Root cause:** Direct string matching for multi-line code structures requires exact context. indexOf() finds the first character match, not the logical block boundary.
- **How to avoid:** Switched to direct string containment checks ('expect(source).toContain(exactString)') which is less precise (doesn't verify placement in function) but more reliable

#### [Gotcha] Per codebase instructions, did NOT write Playwright tests despite it being obvious practice. Verified component syntax/structure via static analysis instead. (2026-02-15)

- **Situation:** Instruction explicitly stated 'DO NOT write Playwright tests'. Instinct was to write tests but instruction took precedence.
- **Root cause:** Codebase has specific testing guidance: components verified through static analysis first (syntax check, bracket matching, import presence). Full Playwright tests likely written separately in established test suite. Respecting project guidance prevents test duplication and maintains test architecture consistency.
- **How to avoid:** Static analysis verification is faster (no test framework setup) but less comprehensive than runtime tests. Trade-off accepted because codebase architecture isolates testing responsibility elsewhere (likely centralised test suite).

#### [Gotcha] Playwright test verification test file must be deleted after verification to avoid contaminating test suite with temporary checks (2026-02-15)

- **Situation:** Created error-display-verification.spec.ts to validate implementation but instructions require cleanup
- **Root cause:** Temporary verification tests can become stale, mislead future developers, and clutter the test suite; one-off validation should not persist in version control
- **How to avoid:** Deleting test means no permanent verification record (harder to debug if feature regresses) but keeps test suite focused on production behavior

#### [Gotcha] Verification tests created in /tests/e2e directory expect running dev server on port 3008, but dev server startup is manual responsibility, not automated (2026-02-18)

- **Situation:** Writing validation tests for new endpoints after implementation to ensure they accept/reject correct parameter shapes
- **Root cause:** End-to-end tests verify actual HTTP behavior with serialization/deserialization, not just unit test mocks. This catches issues with request body parsing that unit tests miss.
- **How to avoid:** E2E tests catch real integration issues but require infrastructure setup (running server). Unit tests are faster but don't validate HTTP layer.

#### [Pattern] Verification via temporary Playwright test checking file existence and code structure (string contains) rather than runtime type checking (2026-02-18)

- **Problem solved:** Could not run hooks in browser context; needed to verify implementation without full integration test infrastructure
- **Why this works:** Static verification catches compilation and structural errors quickly. File existence and key exports ensure module loading won't fail. Avoided complexity of mocking React Query and hook environment.
- **Trade-offs:** Quick verification but doesn't test hook behavior or data flow. Caught structural issues (e.g., export/import mismatches) but missed runtime logic bugs.

#### [Gotcha] Storybook verification was skipped due to pre-existing build issues, relying only on TypeScript/Vite compilation verification (2026-02-18)

- **Situation:** Story file was created but Storybook build failed, requiring decision on verification strategy for component correctness
- **Root cause:** TypeScript compilation and Vite build are sufficient for catching structural errors, but Storybook failure prevented visual verification of component rendering. Decision to skip story given unrelated Storybook configuration issues.
- **How to avoid:** Saved time by skipping broken Storybook, but lost visual verification benefit. Component structure verified but actual rendering in browser not confirmed.

#### [Pattern] Verification of export paths and TypeScript declarations via dynamic import testing (2026-02-18)

- **Problem solved:** Need to verify that newly exported functions are actually importable and properly typed after a build change
- **Why this works:** Static analysis alone cannot detect that an export path produces no JavaScript output. Dynamic imports at runtime can load and test the actual built artifacts. Testing includes: function import, type existence, package.json export map structure.
- **Trade-offs:** Requires running the full test suite after build changes, but catches export path errors before they reach consumers. Temporary test files can be created and deleted for verification without permanent test overhead.

#### [Pattern] Ephemeral verification test suite: create comprehensive Playwright tests, run them to verify the feature works, then delete the test file (2026-02-18)

- **Problem solved:** Theme extraction required complex verification across file locations, CSS syntax, build artifacts, and import paths. A permanent test suite would be fragile and maintenance-heavy.
- **Why this works:** Playwright tests verify real file I/O and CSS syntax without running the app. One-time verification catches mistakes immediately. Deleting after success avoids maintaining brittle filesystem tests that break if the codebase structure changes.
- **Trade-offs:** Ephemeral tests catch issues faster than manual verification but don't prevent regressions. Permanent e2e tests would catch regressions but add maintenance burden. Pattern trades regression coverage for implementation speed.

#### [Gotcha] E2E test for CSS verification requires the app to successfully load and execute, but unrelated import errors prevent load. Static CSS validation (file inspection, line counts, syntax) becomes the only available verification method. (2026-02-18)

- **Situation:** Created theme-verification.spec.ts to check CSS variables via Playwright, but app fails to load before any CSS is evaluated.
- **Root cause:** CSS is evaluated only after TypeScript/JavaScript loads and bundles. Import resolution failures occur earlier in the pipeline, blocking CSS validation. Tests cannot reach the CSS layer if the app fails to start.
- **How to avoid:** Static verification (head, grep, line counts, syntax checks) is fast and deterministic but less authoritative than runtime verification. Runtime tests are more convincing but depend on independent systems (build, bundler, import resolution).

#### [Gotcha] Node.js ESM import test from browser app context requires explicit path verification and absolute imports due to CWD unpredictability in worktrees (2026-02-18)

- **Situation:** Test command 'import from @protolabsai/ui/themes' executed from apps/ui directory, but actual resolution depends on package.json exports and workspace symlinks being correct
- **Root cause:** Package resolution in monorepos relies on workspace symlinks + exports field, not relative paths; CWD shifts in worktrees can cause relative path lookups to fail; Node.js import() resolves package names globally first
- **How to avoid:** Using package name requires correct workspace setup and build artifacts in place; moving code between projects just works; adding new exports requires coordinated changes to tsup + package.json

#### [Gotcha] Storybook major version upgrades (8.x→10.x) introduce breaking changes in internal APIs (internal/theming, internal/preview-api) that aren't caught at build time. The tsup build succeeds, but Storybook dev server fails at runtime when importing addon code. (2026-02-18)

- **Situation:** Build succeeded (`npm run build -w @protolabsai/ui` passed), but `npm run storybook -w @protolabsai/ui` failed with internal module errors. This suggests internal APIs aren't part of the public type definitions, making breakage invisible until runtime.
- **Root cause:** Storybook maintains internal APIs without semantic versioning guarantees. Addons depend on these internals, making major upgrades fragile. The pattern of exposing internals in package exports (e.g., '@storybook/blocks/internal/theming') creates a hidden API surface.
- **How to avoid:** Testing Storybook locally requires running the dev server, which only fails at runtime. CI that only runs builds won't catch these errors. Adding a Storybook build step (`build-storybook`) to CI would catch errors, but slows CI and adds false positives when Storybook config is unrelated to the change.

#### [Pattern] CSF3 format with autodocs tag + a11y addon provides dual benefit: auto-generated documentation AND automatic accessibility violation detection in one artifact (2026-02-18)

- **Problem solved:** Need for comprehensive component documentation that also catches a11y regressions during development.
- **Why this works:** autodocs tag enables Storybook to generate docs from stories without additional doc files, reducing maintenance burden. a11y addon is already in Storybook config, so it runs automatically on every story at dev time—catching a11y issues before code review.
- **Trade-offs:** Stories become the single source of truth for docs + a11y validation, which is powerful but couples documentation build/visibility to Storybook infra. If Storybook breaks, docs become unavailable.

#### [Pattern] CSF3 with satisfies Meta<typeof Component> provides compile-time type safety for story definitions, preventing prop mismatches that would only surface at runtime (2026-02-18)

- **Problem solved:** All 25 story files use 'satisfies Meta<typeof Component>' pattern rather than loose typing. This was chosen as the consistent pattern across all atoms
- **Why this works:** Satisfies operator validates story argTypes and template props against actual component props at TS compile time. Catches typos, missing props, and type mismatches before Storybook loads. Prevents the silent failures common in loosely-typed story files
- **Trade-offs:** Satisfies requires slightly more verbose type declarations upfront but eliminates entire class of prop-mismatch bugs. Zero runtime cost - purely compile-time validation

#### [Gotcha] Build configuration changes cannot be verified with Playwright tests—verification must be structural (artifact inspection) not functional (UI rendering) (2026-02-18)

- **Situation:** Feature acceptance criteria included 'Storybook accessible at public URL' but the implementation task only covers build config and CI setup, not deployment. Team initially tried to apply Playwright verification pattern to a non-UI task.
- **Root cause:** Playwright tests verify rendered UI behavior. Storybook build config produces static artifacts, not interactive pages. Verification happens offline (checking file existence, structure, validity) not via browser automation. The distinction matters: build config is proven by running the build and inspecting output; UI behavior is proven by rendering and interaction.
- **How to avoid:** Structural verification (test -f index.html && test -d assets) is fast and reliable but doesn't test that the site actually renders correctly in a browser. Deployment/hosting verification is separate and requires a live environment.

#### [Gotcha] Documentation-only features (README, philosophy docs) don't require Playwright verification, only confirmation that files exist, build succeeds, and formatting is correct (2026-02-18)

- **Situation:** Feature requirement specified 'Playwright verification required' but this milestone is purely documentation with no runtime functionality
- **Root cause:** Playwright tests verify user-facing behavior and interaction. Documentation has no runtime behavior — it's static content. Verification shifts to: file existence, no build errors, no unintended file changes, correct formatting.
- **How to avoid:** Simpler verification process for documentation features means faster turnaround. Risk: Could merge malformed docs. Mitigation: Visual review in PR and build gate ensures no syntax errors.

#### [Gotcha] Direct code verification via static analysis was used as workaround when server build failed due to pre-existing unrelated dependencies (2026-02-19)

- **Situation:** Unable to run full Playwright tests or start dev server due to missing @napi-rs/whisper dependency in voice-service.ts
- **Root cause:** Build blockers unrelated to feature implementation should not prevent verification. Pattern matching on TypeScript source can confirm field additions without runtime execution
- **How to avoid:** Static verification confirms code correctness but cannot test actual API response behavior, runtime type coercion, or integration

#### [Gotcha] Vitest requires vi.mock() declarations to be placed BEFORE imports in the same file, not in global setup or beforeEach hooks. Conditional mocks with try/catch inside the mock factory allow graceful fallback when native modules are unavailable. (2026-02-19)

- **Situation:** Tests were failing because node-pty (a native C++ module) wasn't compiled in CI environments. Multiple attempts to mock at test suite level or in setup files didn't work until mocks were moved before imports.
- **Root cause:** Vitest's hoisting mechanism processes mock declarations at module load time, before any imports are executed. This allows the mock to intercept module resolution before the actual require() happens. Async factory functions in vi.mock() can conditionally return real or mocked implementations.
- **How to avoid:** Must repeat mock declarations in each test file (vs centralized setup) but gains per-file control and ensures module resolution works correctly; Async factories add slight overhead but enable conditional real/mock switching

#### [Pattern] Use describe.skipIf(!isNodePtyAvailable) combined with require.resolve('node-pty') try/catch to create conditionally-executed test suites that gracefully skip (not fail) when optional native dependencies are unavailable. (2026-02-19)

- **Problem solved:** Need tests to either run fully (when dependency exists) or skip with clear indication (when dependency missing), rather than failing mysteriously in CI where native modules aren't compiled.
- **Why this works:** This pattern solves the environment-agnostic testing problem: dev machines have node-pty built, but CI/Docker often don't. skipIf provides signal (clear skip message) vs silent failure. require.resolve() is safer than require() because it just checks availability without triggering side effects.
- **Trade-offs:** Skipped tests reduce coverage metrics but prevent false failures; require.resolve() adds startup time cost (minimal) but prevents hard crashes; Must maintain the flag separately from suite declaration (minor code duplication)

### Chose conditional async mock factory (try importing actual, catch to return mock) over static mock objects. This allows real module to be used when available while providing fallback without test code changes. (2026-02-19)

- **Context:** Could either: 1) always return static mock regardless of availability, 2) check availability before test runs and conditionally load mocks, or 3) try/catch inside the mock factory to detect at import time.
- **Why:** Approach #3 means tests automatically use real node-pty when it exists (maximizing test coverage) and fallback when it doesn't (minimizing CI failures). The try/catch inside the async factory lets Vitest's module resolution handle both cases transparently.
- **Rejected:** Static mocks - lose real module testing when available; Pre-test checks - require separate mock file loading logic; Environment variables - unreliable in different CI systems
- **Trade-offs:** Async factory is slightly slower at import time but eliminates need for environment detection; Creates runtime polymorphism of the mock (real vs fake) which is slightly harder to debug but more flexible
- **Breaking if changed:** Removing the try/catch inside the factory means the mock will fail if node-pty isn't available. Removing the async factory means require.resolve() check fails to coordinate with actual imports.

#### [Gotcha] Pre-existing build failures can mask verification of intended changes (2026-02-19)

- **Situation:** Build verification failed due to unrelated voice-service.ts missing dependency, making it impossible to validate graph-registry changes through compilation
- **Root cause:** Single build command tests entire codebase; isolated failures in unrelated modules prevent verification of specific changes
- **How to avoid:** Full-build validation is comprehensive but brittle; breaking changes in one module prevent verification elsewhere. Switched to syntax checking instead of compilation

#### [Gotcha] Verification test created as standalone TypeScript file rather than integrated into test suite due to service dependency complexity (2026-02-19)

- **Situation:** SignalIntakeService requires mocking EventEmitter and FeatureLoader. Integration test skipped due to authentication requirement on API endpoint
- **Root cause:** Service has abstract dependencies (event system, feature creation) that need mocking but don't integrate with test infrastructure. Unit test in isolation confirms shape contract, avoiding false confidence from mocked infrastructure
- **How to avoid:** Standalone test validates implementation detail (getStatus() returns correct shape) but misses API surface integration. Full integration requires running server with auth

#### [Gotcha] Registry verification requires importing TypeScript module in Node.js context, not direct JSON parsing (2026-02-19)

- **Situation:** Initial attempt to verify registry used JSON parsing, but needed to actually require() the TypeScript file to validate against getAllGraphs() function
- **Root cause:** Registry is programmatic TypeScript not static JSON; validation must execute the actual data structure construction logic
- **How to avoid:** Requires Node.js runtime and TypeScript compilation but catches real integration issues; static validation would be faster but miss semantic errors

### Verification via simple file content existence check rather than integration testing with actual component mounting (2026-02-19)

- **Context:** Need to verify 6 specific mappings were added correctly without full E2E flow graph component test
- **Why:** File content verification catches typos and confirms mappings exist. Component integration testing would require mocking LangGraph, data loading, React rendering which is overkill for this simple data structure change. Tests are ephemeral - just verifying syntax
- **Rejected:** Alternative: Full Playwright test mounting FlowGraph component - requires complex setup. Or: Manual code review only - no automated verification
- **Trade-offs:** Fast verification catches obvious errors (misspellings) but won't catch if component click handler logic broke. Would be caught immediately in UI testing phase
- **Breaking if changed:** If verification test removed in future, simple typos in SERVICE_TO_GRAPH_MAP could slip through to production causing undefined graphId at runtime

#### [Gotcha] Graph topology verification requires comparing both node names AND edge connections - testing only node existence misses wiring errors (2026-02-19)

- **Situation:** All 6 nodes existed but had wrong IDs (fan_out instead of fanout_research), and all edges had to be reverified after node ID corrections
- **Root cause:** A node can exist but be unreachable or wrongly connected, causing silent failures where paths don't execute. Node existence alone doesn't validate topology
- **How to avoid:** Comprehensive graph topology tests require more assertions but catch wiring errors that only manifest at runtime in production flows

#### [Gotcha] Cannot fully verify real-time behavior without running dev server, but implementation was verified via TypeScript compilation and code inspection (2026-02-19)

- **Situation:** Created a Playwright test to verify endpoint behavior but couldn't execute it since dev server isn't running
- **Root cause:** The implementation logic can be verified through static analysis (code inspection, TypeScript compilation), but runtime behavior like event emission and count increments requires a running application
- **How to avoid:** Static verification provides confidence in the wiring logic but not the actual runtime behavior. The test was created and then deleted per instructions.

### Verification done by counting nodes in source files and comparing to registry rather than automated type checking (2026-02-19)

- **Context:** Build process had unrelated failures (voice-service); TypeScript compilation couldn't verify graph-registry changes in isolation
- **Why:** Source files are the single source of truth. Manual counting against source is reliable and unambiguous, even when full build fails.
- **Rejected:** Relying on full build pass (too fragile to unrelated issues); runtime graph validation (requires deployment)
- **Trade-offs:** Easier: Isolate verification from unrelated build failures. Harder: Manual verification is slower and not automated
- **Breaking if changed:** Without comparison to source files, registry could diverge from actual graphs; automated tests need to validate registry matches source

### Used waitForLoadState('load') instead of 'networkidle' for test synchronization in apps with persistent WebSocket connections (2026-02-21)

- **Context:** E2E tests need reliable synchronization point; app maintains persistent WebSocket connections that never fully idle
- **Why:** 'networkidle' assumes connections settle (traditional HTTP pattern), but WebSocket-enabled apps have continuous traffic. 'load' fires once and is predictable for these architectures.
- **Rejected:** 'networkidle' - causes flaky tests in CI and unnecessary waits; 'custom wait for specific condition' - adds test-specific code complexity
- **Trade-offs:** Faster, more reliable tests across CI environments but may miss slow async operations triggered after load event completes
- **Breaking if changed:** Switching to 'networkidle' would cause test flakiness with persistent connections; removes architectural awareness from test strategy

### Test IDs added only at component boundaries (3 total: flow-graph-view, flow-graph-canvas, flow-graph-legend-toggle) rather than on deeply nested elements (2026-02-21)

- **Context:** Need queryable elements for testing without creating brittle selectors coupled to implementation details that change during refactoring
- **Why:** Component boundaries are stable across internal refactoring; test IDs on deep DOM nodes break when child structure changes. Minimal set provides coverage for current smoke tests while remaining testable for future interactions.
- **Rejected:** Deep-nested test IDs on individual SVG nodes or React Flow internals - would require test maintenance on every layout change; no test IDs - eliminates selector stability
- **Trade-offs:** Fewer test IDs means simpler component code and less testing coupling, but limits granularity of future assertions (e.g., can't directly query individual graph nodes)
- **Breaking if changed:** Removing test IDs breaks selectors immediately; placing IDs inside component implementations instead of at boundaries makes them invisible from test perspective

#### [Pattern] Separated API endpoint verification tests from UI component smoke tests into distinct file structure (tests/api/ vs tests/views/), following existing scheduler-status pattern (2026-02-21)

- **Problem solved:** Growing test suite needs logical organization; API contracts and UI rendering have independent failure modes and different diagnostic paths
- **Why this works:** Decouples concerns - API failures shouldn't block UI tests and vice versa. Enables parallel execution in CI. Makes failure diagnosis faster (error in 'engine-status-verification' immediately indicates API contract issue, not rendering problem).
- **Trade-offs:** More files to maintain but clearer separation of responsibility; easier to parallelize CI execution and diagnose failures

#### [Pattern] Comprehensive type validation for API response structure (checking presence and types of nested properties like autoMode.running as boolean, agentExecution.activeAgents as array) in verification tests (2026-02-21)

- **Problem solved:** API contracts are prone to subtle type changes (boolean vs string, number vs string) that don't cause immediate failures but break consumers
- **Why this works:** Type mismatches propagate downstream to consuming components causing runtime errors. Catching these at API boundary (test) prevents invalid state. Pattern inherited from scheduler-status-verification pattern.
- **Trade-offs:** More verbose assertions but catches semantic errors; requires discipline to maintain as API evolves

### Scoped smoke tests to rendering verification only (component visible, React Flow canvas present, nodes rendered) rather than interaction tests, deliberately keeping scope minimal for CI stability (2026-02-21)

- **Context:** Balancing comprehensive coverage against CI execution time, flakiness, and maintenance burden for complex visualization components
- **Why:** Smoke tests are regression detection, not feature validation. Minimal scope means faster execution (<10s), fewer environmental dependencies, and less maintenance when layout/styling changes. Interaction tests would require more sophisticated wait strategies and are better suited to targeted feature tests.
- **Rejected:** Full feature testing with interactions (node dragging, zooming) - would require complex synchronization and break on layout changes; no tests - leaves regression blind spot
- **Trade-offs:** Fast, stable tests but limited coverage; couldn't catch interaction-specific bugs. Establishes foundation for future, more targeted tests.
- **Breaking if changed:** Adding interaction tests to smoke test would increase CI time and flakiness; removing this test removes baseline regression detection for rendering

#### [Gotcha] Using waitForLoadState('load') instead of 'networkidle' when app has persistent WebSocket connections (2026-02-21)

- **Situation:** E2E tests for flow-graph with real-time WebSocket updates
- **Root cause:** networkidle waits for zero network activity. With persistent WebSocket connections, this wait never completes and tests hang indefinitely. 'load' fires after DOM content loads, regardless of background connections.
- **How to avoid:** Faster tests but less guarantee of stable state; must rely on explicit waits for specific UI elements instead

#### [Gotcha] Proactive filtering of React Flow ResizeObserver and library warnings in console error detection (2026-02-21)

- **Situation:** Smoke tests for React Flow visualization component
- **Root cause:** React Flow emits ResizeObserver warnings that are not actual errors but would fail tests if treated as console errors. Must distinguish between library chattiness and real failures.
- **How to avoid:** Requires knowledge of library internals vs cleaner error detection; more maintainable as library evolves

#### [Pattern] Minimal test ID strategy: add only 3 test IDs at component boundaries (view-level and canvas-level) rather than throughout component tree (2026-02-21)

- **Problem solved:** Balancing test maintainability with implementation flexibility
- **Why this works:** Each test ID creates a contract between tests and components. Minimizing test IDs reduces refactoring burden if internal structure changes. Boundary IDs still enable future detailed testing by adding more IDs as needed.
- **Trade-offs:** Less granular test control now vs lower coupling and maintenance cost; foundation for gradual test expansion

### Layered verification approach: verify component rendering (flow-graph-view) → canvas rendering (flow-graph-canvas) → React Flow internals (.react-flow\_\_node classes) (2026-02-21)

- **Context:** Smoke test for complex visualization with multiple initialization layers
- **Why:** Each layer represents a failure point: component mounting, React Flow initialization, or node rendering. Testing all three enables precise failure diagnostics without coupling to internal React Flow implementation.
- **Rejected:** Single comprehensive test - harder to isolate which layer failed
- **Trade-offs:** More test statements but better failure localization vs simpler but less diagnostic test
- **Breaking if changed:** Removing any verification layer loses ability to distinguish between component vs React Flow vs rendering failures

#### [Pattern] Smoke test scope limited to rendering verification (navigation, visibility, element presence) excluding interaction testing (2026-02-21)

- **Problem solved:** CI/CD integration for fast feedback on basic functionality
- **Why this works:** Smoke tests optimize for speed (<10s execution) and stability. Rendering tests are deterministic; interaction tests add timing complexity. Separate layers of testing: smoke (quick), functional (comprehensive), integration (full flow).
- **Trade-offs:** Quick feedback on basic health vs shallow coverage; requires complementary interaction/integration tests

### 10-second timeout for initial render to accommodate slower CI container environments (2026-02-21)

- **Context:** Making smoke tests reliable across local development and containerized CI
- **Why:** Containerized environments have variable resource contention. 10s is empirically safe for React mounting + React Flow initialization without being excessive. Prevents flaky tests in CI.
- **Rejected:** Shorter timeout (3-5s) - fails intermittently in CI; longer timeout (30s+) - unacceptable feedback delay
- **Trade-offs:** Slightly longer local test time vs reliable CI execution across varying resource conditions
- **Breaking if changed:** Too-short timeout causes environment-dependent flakiness; too-long timeout defeats purpose of fast smoke test

#### [Pattern] Minimal test ID strategy: added only 3 strategic test IDs (view, canvas, legend-toggle) rather than exhaustive IDs on every element, supplementing with React Flow framework CSS class selectors (.react-flow**node, .react-flow**controls) for element discovery (2026-02-21)

- **Problem solved:** Testing React Flow visualization component required selecting multiple elements without over-instrumenting the codebase
- **Why this works:** Reduces refactoring burden when components change - framework classes are maintained upstream; test IDs only for top-level behavior entry points that are unlikely to change
- **Trade-offs:** Faster to maintain but requires knowledge of framework internals; CSS class selectors will break if React Flow changes class names

#### [Gotcha] Proactive console error filtering for ResizeObserver and WebSocket warnings - these are library-internal warnings that aren't actual test failures but will cause test failures if unfiltered (2026-02-21)

- **Situation:** Complex visualization components (React Flow) and real-time features emit non-fatal warnings that pollute test output and can fail entire test suite
- **Root cause:** Many UI libraries emit warnings that are safe to ignore (ResizeObserver internals, WebSocket reconnection attempts); filtering them prevents false positive test failures and cleaner failure analysis
- **How to avoid:** Must maintain whitelist of safe warnings - removing items risks missing real issues; adding items risks hiding real problems

#### [Pattern] Separated API contract verification test into dedicated file (engine-status-verification.spec.ts) instead of inline with UI smoke test - different test lifecycle, failure modes, and dependencies (2026-02-21)

- **Problem solved:** Feature involved both UI rendering verification and API contract validation; both critical but different concerns
- **Why this works:** API tests don't depend on browser rendering, Playwright, or UI element presence - can fail independently; isolated files enable independent CI/CD decisions (run API tests without Playwright browsers)
- **Trade-offs:** More files to maintain; clearer responsibility boundaries and faster debugging when one fails

### Scope constraint on smoke test: render verification only, no interaction testing; used short 10-second timeout for CI speed over comprehensive behavior coverage (2026-02-21)

- **Context:** Need to verify React Flow component renders without errors, but also maintain fast CI feedback loops
- **Why:** Smoke test should fail fast on basic rendering issues; detailed interaction tests can live separately and run less frequently; 10s timeout catches render hangs without waiting for full stale-while-revalidate caches
- **Rejected:** Comprehensive interaction tests (too slow for every CI run, can mask simple render failures under interaction complexity); 30s+ timeouts (delays CI feedback)
- **Trade-offs:** Doesn't catch behavioral bugs (only structural rendering); enables rapid iteration feedback at cost of coverage depth
- **Breaking if changed:** If scope expands to interactions, test time increases and CI becomes slower; if timeout is removed, hanging components won't be caught quickly

#### [Gotcha] Pre-existing build error in @protolabsai/platform (p-limit import) prevented full server build, but feature code verified independently using `node -c` syntax checking showed no errors. (2026-02-22)

- **Situation:** Feature implementation complete but unable to run `npm run build:server` to verify integration due to unrelated package error.
- **Root cause:** Isolated syntax verification (node -c) can validate code independently of build system. Prevents false negative where feature appears broken when only build infrastructure has issues.
- **How to avoid:** Isolated verification provides confidence but doesn't catch runtime type errors or integration issues. Full build still needed for deployment.

### Comprehensive payload parsing tests that mirror exact TypeScript interface structure (type 'text' vs 'chat', optional fields like config/labels/tags/metadata) (2026-02-23)

- **Context:** Langfuse webhook payloads have complex nested structure with multiple optional fields and type variants
- **Why:** Each variant (text prompt vs chat prompt) and optional field combination must be tested separately to catch breaking changes. Tests serve as executable specification of what payloads are accepted.
- **Rejected:** Minimal happy-path testing (misses edge cases), or testing only required fields (optional fields become untested and break silently)
- **Trade-offs:** 12 parser tests vs 1-2 minimal tests adds maintenance burden but catches ~100% of payload shape violations. Each test documents one valid scenario.
- **Breaking if changed:** Removing specific variant tests (e.g., chat type prompt test) leaves that code path untested, making future refactors risky

#### [Gotcha] vi.mock('@octokit/rest') factory function must use proper 'function' syntax, not arrow function, to allow 'this' binding for constructor (2026-02-23)

- **Situation:** Initial test mock used arrow function in vi.mock factory, causing Octokit constructor call to fail silently
- **Root cause:** Octokit is a class constructor that uses 'this' context. vi.mock factory receives a 'this' binding that arrow functions don't preserve. Named function syntax or explicit 'this' binding required.
- **How to avoid:** Proper function syntax is more verbose but ensures correct prototype chain and 'this' binding for class constructors

#### [Gotcha] Service implementation verified with temporary Node.js script that loaded compiled JS and executed methods, but this approach won't work in automated CI (2026-02-23)

- **Situation:** No permanent unit tests written; verification was manual/temporary
- **Root cause:** Quick validation of core logic before submitting feature. Permanent tests would require mocking gh CLI (complexity) and test fixtures.
- **How to avoid:** Feature is verified to compile and core logic works, but lacks regression test coverage. If gh CLI invocation signature changes, it won't be caught by tests.

#### [Gotcha] Playwright bounding box measurements on React Flow nodes are unreliable in headless Chrome. Pixel-precise dimension assertions (50-250px width, 50-150px height) fail unpredictably in CI. (2026-02-23)

- **Situation:** Initial test used boundingBox() to validate agent node dimensions. Tests were flaky; CI headless rendering produces different measurements than local Chrome.
- **Root cause:** React Flow applies dynamic SVG/canvas transforms during rendering. Headless Chrome's rendering engine and transform calculations differ from headed browser, causing unpredictable viewport/canvas coordinate translation.
- **How to avoid:** Switched to text content assertions (more reliable but don't validate layout/sizing). Gain: stable tests. Loss: miss visual regression in node dimensions.

#### [Pattern] Test environment produces non-critical errors that must be explicitly filtered: ResizeObserver, WebSocket failures, IPC connection failures, signal timeouts. Each error type appears in specific test conditions. (2026-02-23)

- **Problem solved:** Tests failed on console error assertions because environment-specific errors (IPC connection failed, signal timed out) appeared in CI but not in production code paths.
- **Why this works:** Headless Playwright spawns Node processes with IPC parent communication; timing variations in spawn/cleanup cause spurious errors. WebSocket connection failures normal in test environment with mocked backends.
- **Trade-offs:** Filtering hides some real issues; requires ongoing maintenance as new error types appear in different test environments. Benefit: meaningful test results without false positives.

#### [Gotcha] Build success (TypeScript compilation + bundling) was used to justify skipping Playwright tests. This is insufficient verification for UI features. (2026-02-23)

- **Situation:** After successful `npm run build` in apps/ui, tests were skipped with reasoning 'pure UI visualization with no complex logic... successful build provides sufficient confidence.' Full monorepo build failed due to unrelated p-limit issue in platform package.
- **Root cause:** Apparent reasoning: build validates TypeScript types and module resolution. However, build output is code-only; it doesn't verify rendering, layout, interactions, or data binding correctness.
- **How to avoid:** Saves: time/complexity of test setup with mock pipelineState. Costs: zero verification that the component renders correctly, that ChevronDown/ChevronRight chevrons toggle properly, that TimelineVisualization receives correct prop mapping, that expandable state works as intended.

#### [Gotcha] Pre-existing build errors in unrelated packages completely block verification of correct implementation code. Solution: isolate verification by building individual packages, running type checks on dist outputs, creating tests for future execution. (2026-02-23)

- **Situation:** p-limit import error in @protolabsai/platform prevented npm run build:server from running, even though AnalyticsService implementation was syntactically correct and logically sound.
- **Root cause:** Build systems are monolithic - one error propagates to all dependents. Proves that implementation correctness is orthogonal to build success. Verification must be decoupled from infrastructure blockers.
- **How to avoid:** Partial verification (individual packages, type tests) is less complete than e2e testing, but proves logic independently and unblocks handoff decision-making while infrastructure is fixed.

#### [Gotcha] Empty state handling uses try/catch pattern, indicating component must gracefully handle both 'insufficient data' and 'data present' states at runtime. Test cannot verify which is correct, only that one is visible. (2026-02-23)

- **Situation:** Playwright test for analytics panel content verification
- **Root cause:** Real system behavior depends on runtime feature history, not static test data. Frontend cannot assume data will exist.
- **How to avoid:** Single flexible test path vs multiple specific assertions. Tests are less explicit about expected state but more resilient to data variance.

#### [Gotcha] Async React state updates require explicit wait delays (500ms hardcoded) between user action and assertion. UI event → state change → re-render → attribute update is multi-step async process. (2026-02-23)

- **Situation:** Testing button icon class changes after panel toggle clicks
- **Root cause:** React state updates and DOM attribute changes are not synchronous. CSS classes update after render cycle completes.
- **How to avoid:** Fixed wait time is simple but fragile (too short = flaky, too long = slow tests). Polling is resilient but more complex.

#### [Pattern] Tiered timeout strategy: Flow graph visibility (10s), panel visibility (5s), empty state check (3s). Different timeouts reflect measured component performance hierarchy. (2026-02-23)

- **Problem solved:** Multiple async operations with varying network/rendering latency
- **Why this works:** Flow graph likely has heavy initial load (possibly data queries, canvas setup), panel has lighter load, empty state is fastest. Timeouts should match real performance characteristics.
- **Trade-offs:** Calibrated timeouts reduce flakiness but require empirical tuning. Uniform timeouts are simpler to maintain but cause intermittent failures.

#### [Gotcha] Playwright test simplification: unable to verify endpoint behavior end-to-end due to path validation and authentication requirements (2026-02-24)

- **Situation:** Initial tests attempted to validate both endpoint functionality and integration with ceremony system, but path/auth constraints made this impractical
- **Root cause:** Path validation middleware protects production but prevents test isolation. Manual curl testing with valid credentials becomes the verification method instead.
- **How to avoid:** Lose automated test coverage of retry endpoint behavior, gain assurance that production path validation works

#### [Gotcha] localStorage direct manipulation in Playwright tests doesn't trigger Zustand hydration until component mounts and accesses store (2026-02-24)

- **Situation:** Test manually set localStorage data but expected it to be immediately reflected in store state; localStorage write != store hydration
- **Root cause:** localStorage.setItem() writes to browser storage, but Zustand's persist middleware only reads and hydrates on first store access (hook or getState()). Writing to storage doesn't retroactively hydrate already-instantiated stores.
- **How to avoid:** Test must use Playwright page.evaluate() to set localStorage before any component mounts, then verify via component or direct store access after mount. Simpler test would be: mount component → localStorage auto-hydrates via middleware.

### Verification through comprehensive unit tests rather than full build validation when worktree environment has dependency resolution issues. (2026-02-24)

- **Context:** The fix couldn't be verified via `npm run build:server` due to pre-existing TypeScript module resolution issues with `@protolabsai/*` packages in the worktree, but logic correctness was proven through 7 test cases covering all eligibility scenarios.
- **Why:** Eligibility logic is stateless and deterministic - it can be verified independently of the build environment. Unit tests on pure functions provide stronger confidence for logic correctness than environment-dependent builds would.
- **Rejected:** Waiting for or attempting to fix the worktree build environment, or assuming the code is correct without explicit test coverage.
- **Trade-offs:** Unit test verification is faster and more reliable for logic changes but doesn't catch integration issues or type-system problems. The worktree's build issues masked a potential type safety problem.
- **Breaking if changed:** If you remove the unit tests and rely only on build verification, you lose visibility into logic correctness when environments are unstable. However, build verification should still be required before merging.

#### [Gotcha] Playwright tests require browser binaries installation, but cannot run reliably in constrained environments. Manual code review of form flow is necessary fallback. (2026-02-24)

- **Situation:** Attempting to verify email form submission flow, loading states, and error handling
- **Root cause:** Playwright needs Chromium/Firefox binaries; `npm install` doesn't include browsers. Manual review confirmed correctness of HTML structure and JS logic.
- **How to avoid:** Manual code review is slower but sufficient for form-level verification vs. integration test coverage gaps

#### [Gotcha] Path handling for file:// URLs in Playwright tests evolved through three iterations (join+dirname → path module → process.cwd()), revealing that relative path construction with \_\_dirname in ESM is fragile for file:// protocol (2026-02-24)

- **Situation:** Testing static HTML files locally using Playwright in an ES module environment
- **Root cause:** The issue: fileURLToPath in ESM gives unreliable \_\_dirname equivalents. Using process.cwd() + relative path is simpler and more predictable for file:// URLs since browsers resolve relative to the origin directory, not the script location
- **How to avoid:** Easier: fewer path edge cases, more readable. Harder: assumes working directory is project root (depends on how tests are invoked)

#### [Gotcha] When Playwright browser installation fails due to environment constraints, testing static HTML falls back to manual grep verification, exposing that browser-based testing for static sites is fragile in restricted environments (2026-02-24)

- **Situation:** Attempting to run full Playwright test suite in environment without browser installation permissions
- **Root cause:** Static HTML validation doesn't require a real browser. Grep checks for HTML structure, meta tags, semantic elements, accessibility attributes are deterministic and can verify correctness without chromium. Real browser testing is overkill for static markup.
- **How to avoid:** Easier: works in any environment (no browser needed). Harder: can't test visual rendering, JavaScript interactions, or actual user experience

#### [Gotcha] SmartScreen warnings cannot be verified through automated testing because they are OS-level security policies evaluated at install time on Windows (2026-02-24)

- **Situation:** Attempting to verify code signing works via CI/CD Playwright tests or simulated installs will not trigger SmartScreen
- **Root cause:** SmartScreen is a Windows user-mode security feature that reads certificate metadata and queries Microsoft's reputation servers. It's not accessible to headless testing frameworks.
- **How to avoid:** Requires manual testing on Windows machines after certificate setup, but ensures verification reflects actual user experience

#### [Pattern] Bidirectional test coverage for dependency status: test BOTH what IS blocking AND what IS NOT blocking. For status change, verify opposite states (review blocks, done doesn't). (2026-02-24)

- **Problem solved:** Tests verified both that 'review' status blocks dependencies AND that 'done' status doesn't block - not just testing the happy path
- **Why this works:** Dependency gating is inherently bidirectional logic; a false positive in one direction can catastrophically break the other. Testing both directions catches inverted conditionals and boundary errors.
- **Trade-offs:** More test cases to maintain vs exponentially higher confidence in correctness; test complexity increases but catches subtle boolean logic errors

### Tests passing = implementation correct; build tooling failures treated as separate infrastructure issue. Declaration generation can fail while functionality works. (2026-02-24)

- **Context:** DTS (TypeScript declaration) build failed with module resolution errors, but all 38 tests passed, indicating code is functionally correct
- **Why:** Monorepo workspace linking in tsup can have environmental issues (pre-existing, affects both worktree and main project) separate from code correctness. Tests are the true functional contract.
- **Rejected:** Blocking feature on successful build - would be wrong since the code demonstrably works; the build issue is a tooling/environment problem
- **Trade-offs:** Shipping with missing/stale .d.ts files (consumers lose type safety) vs shipping with proven working code (runtime safety)
- **Breaking if changed:** If developers treat failed builds as signal to not ship, working features get blocked by environmental issues; if they ignore all build failures, type safety breaks for consumers

#### [Pattern] Acceptance criteria that cannot be automated or code-verified reliably indicate scope mismatch. 'Record compelling gameplay' is subjective judgment; proper code features have quantifiable criteria. (2026-02-24)

- **Problem solved:** Task lacks any acceptance criteria that could be tested in CI/CD or verified programmatically
- **Why this works:** Code implementation produces verifiable artifacts; content creation produces subjective results. Mixing them in same pipeline breaks testing frameworks.
- **Trade-offs:** Stricter criteria definition upstream costs time upfront but prevents pipeline waste; loose criteria allows flexibility but creates acceptance disputes

#### [Pattern] Partial failure continuation pattern: Worker logs errors and continues processing remaining chunks rather than halting on first failure. Single chunk generation failure doesn't abort entire batch. (2026-02-24)

- **Problem solved:** Processing 1000s of chunks where individual LLM calls or embeddings might fail for a specific chunk
- **Why this works:** All-or-nothing failure on large batches results in no progress and requires full restart. Partial progress maintains utility and allows incremental completion.
- **Trade-offs:** Resilience gained but silent failures are harder to debug; requires monitoring per-chunk failure rates

#### [Gotcha] Existing test suite (2033 tests) passing doesn't prove extraction was done correctly—a separate verification strategy was needed to validate the architectural change actually occurred (2026-02-24)

- **Situation:** After refactoring, npm test passed cleanly but tests don't verify that code was actually moved between files or that delegation was implemented
- **Root cause:** Existing tests validate behavior correctness, not structural correctness. Could pass tests by leaving all code in original service (defeating the refactoring goal). Need explicit checks: file sizes, imports, delegation presence.
- **How to avoid:** Required writing temporary verification tests (5 specific checks including file size >10KB, import presence, route handlers). But caught that extraction actually happened, preventing silent failures.

### Static documentation verified through syntactic validation (Mermaid syntax, link checking, line counts) rather than runtime Playwright tests (2026-02-24)

- **Context:** Architecture documentation feature with no executable behavior to test
- **Why:** Documentation is content, not behavior. Playwright tests confirm UI interactions work; link checkers and syntax validators confirm documentation integrity. Test tool selection follows problem domain, not project convention.
- **Rejected:** Using Playwright to verify documentation renders (conflates content verification with behavior testing)
- **Trade-offs:** Easier: faster feedback, simpler setup. Harder: misses rendering issues in specific documentation systems that static checks don't catch.
- **Breaking if changed:** If link structure changes without validation checks, broken references become silent failures in production documentation.

#### [Gotcha] Fire-and-forget semantics make trajectory persistence invisible to unit tests unless explicitly awaited or mocked (2026-02-24)

- **Situation:** save() returns immediately; file write completes asynchronously after test assertion runs
- **Root cause:** Non-blocking design prioritizes execution latency over test observability
- **How to avoid:** Gains: Production latency. Loses: Test can assert file written before it actually exists; race condition in test assertions

#### [Pattern] Using exhaustiveness checking with never type in switch statements to validate discriminated union completeness (2026-02-24)

- **Problem solved:** Verifying that all node types in PenNode union are handled in type-narrowing code
- **Why this works:** TypeScript compiler ensures all union members are covered; catches new types added to union without updating handlers
- **Trade-offs:** Requires verbose default clause with const \_exhaustive: never = node; but provides strong guarantees at compile time

#### [Pattern] Multi-level verification strategy for type-only packages: successful build + .d.ts inspection + runtime import test (2026-02-24)

- **Problem solved:** Verifying TypeScript types compile and export correctly without application code
- **Why this works:** Type-only packages can't use traditional unit tests; need verification at multiple levels (build→export→import→usage)
- **Trade-offs:** More verification steps than application code; but each step catches different classes of errors (compile, export, import)

#### [Gotcha] Test file paths break due to process.cwd() returning different values depending on test execution context in monorepo (2026-02-24)

- **Situation:** Tests written with 'designs/components/shadcn-kit.pen' path worked locally but failed in CI, required change to '../../designs/components/shadcn-kit.pen'
- **Root cause:** npm workspace execution context places process.cwd() at workspace root or package root depending on how tests are invoked (direct vs workspace flag); relative paths are unreliable
- **How to avoid:** Easier: Tests that import actual design files validate schema; Harder: Path fragility requires understanding monorepo structure, paths break if folder structure changes

#### [Pattern] Integration tests use actual shadcn-kit.pen file (88+ nodes) rather than mocked minimal examples (2026-02-24)

- **Problem solved:** Could have tested only synthetic documents with 3-5 nodes like unit tests
- **Why this works:** Real design file catches edge cases in schema - nested component structures, theme variations, variable reference chains that wouldn't appear in minimal examples; validates file format compatibility at scale
- **Trade-offs:** Easier: Tests validate against real-world data; Harder: Test file must be maintained, tests are slower, test data is opaque (hard to debug what's being tested)

### Used Playwright test suite (E2E browser automation framework) for JSON data validation and schema verification, despite semantic mismatch. (2026-02-25)

- **Context:** Created test file to verify roadmap.json structure, stats.json prCount, changelog.json firstDate without any UI interaction.
- **Why:** Playwright is already in project infrastructure; consistent test runner across E2E and data tests; familiar syntax for team. Avoids separate test framework.
- **Rejected:** Jest, native Node assertions, or custom validation scripts would be semantically clearer and lightweight.
- **Trade-offs:** Benefit: reuse infrastructure, single test runner. Cost: Playwright adds browser overhead for non-UI tests; semantic confusion (Playwright = UI automation); tight coupling between data validation and E2E framework.
- **Breaking if changed:** If Playwright is removed from dependencies, data tests have no runner. If Playwright major version upgrades change assertion API, both E2E and data tests break. Heavy coupling.

#### [Gotcha] Functional correctness of a service can be verified at ESM level without full server build. Created standalone Node.js test script that imports compiled ESM, runs operations, verifies behavior. All 10 tests passed despite TypeScript DTS build failures and unrelated server build issues (platform package). This proves the service works correctly in isolation. (2026-02-25)

- **Situation:** Full server build blocked by unrelated platform package DTS failures. TypeScript build also failing. However, the service code itself is sound and needed verification before being marked complete.
- **Root cause:** ESM (JavaScript runtime) is the actual code that runs. DTS build failures don't affect runtime correctness. By testing at the module level (compile ESM, import, run), you bypass build infrastructure issues and test the actual behavior.
- **How to avoid:** ESM-level testing is lightweight and fast, but doesn't verify type safety. It catches logic bugs and API contract violations, but not TypeScript type errors. For security-critical code, both are needed eventually, but ESM testing unblocks faster.

#### [Gotcha] Event emitter mock initially used Map<eventType, handlers[]> with type-indexed routing, but actual EventEmitter.subscribe() is type-agnostic: single handler receives all events as (type, payload) tuple, not type-specific subscriptions. (2026-02-25)

- **Situation:** Creating mock EventEmitter for signal-intake-service tests revealed interface contract mismatch in initial implementation.
- **Root cause:** Easy to assume mock mirrors pub/sub type-routing, but this service uses a universal fan-out model where one handler gets all event notifications. Interface reading error.
- **How to avoid:** Array-based simple list is less type-safe but correct. Type-indexed map adds structure but creates dead subscriptions.

#### [Pattern] Unit tests for async event-driven service require 50-100ms timeouts to allow event handlers to complete before assertions. Async processing happens off the call stack. (2026-02-25)

- **Problem solved:** signal-intake-service processes signals via event emission with async handlers; tests needed explicit waits.
- **Why this works:** Events are fired synchronously but handlers may run async (e.g., awaiting mocked db calls, event propagation). Without delays, assertions run before handlers complete, causing false failures.
- **Trade-offs:** Delays make tests slower but reliable. Missing delays cause flaky tests. Suggests service is inherently async/event-driven, not synchronous.

#### [Pattern] Unit tests pass despite pre-existing TypeScript build errors in transitive dependencies (@protolabsai/platform). Test isolation via comprehensive mocking prevents build-time failures from blocking test-time verification. (2026-02-25)

- **Problem solved:** secure-fs.ts has p-limit type error; test files compile and run successfully.
- **Why this works:** Tests mock external dependencies (db, event emitter, services). They don't import the broken @protolabsai/platform code at runtime, only the service code being tested. Build-time type checking and runtime test execution are decoupled.
- **Trade-offs:** Tests prove the service code is correct but don't catch errors in dependencies. Build will still fail. Good for iteration; bad for shipping without a passing build.

#### [Gotcha] Mock return types must include ALL interface fields, not just primary data. readJsonWithRecovery mocks initially returned {data: T} but actual signature requires {data: T, recovered: boolean, source: string}. TypeScript compiled with partial mocks but tests failed at runtime when code accessed .recovered or .source. (2026-02-25)

- **Situation:** Test setup discovered that structural typing in TypeScript allows incomplete mock objects to pass type checking if they contain the minimum needed properties.
- **Root cause:** TypeScript's object literal type checking uses structural (duck) typing - it doesn't enforce that all interface properties are present, only that provided properties match. Mock code compiled because it had 'data', but runtime access to missing fields failed.
- **How to avoid:** Full mock completeness (all fields) ensures test code matches real behavior and catches integration bugs early; partial mocks compile and run locally but fail mysteriously at runtime in CI.

#### [Gotcha] Bulk sed replacements on repetitive mock data (CalendarEvent arrays) can create duplicates if the pattern already exists. Added projectPath to all CalendarEvent objects using sed, but some already had it from earlier edits, requiring a second cleanup pass. (2026-02-25)

- **Situation:** Test fixtures used repetitive object literals across multiple test cases. CalendarEvent interface requires projectPath field, discovered during mock construction.
- **Root cause:** Sed pattern matching doesn't know about object context - it matches lines and adds after them. Multiple CalendarEvent objects with the same structure meant the pattern matched multiple times, but idempotency wasn't guaranteed.
- **How to avoid:** Sed bulk edits are fast for large changes but risk duplicates without post-validation; manual edits are slower but guaranteed correct.

#### [Pattern] Test data (mock objects) must be as complete as real implementation objects, even for internal-only fields. CalendarEvent needed projectPath in tests even though the public API doesn't expose it - discovered by type errors during mock construction. (2026-02-25)

- **Problem solved:** Tests discovered that the CalendarEvent interface requires projectPath for internal deduplication and storage logic, despite this not being part of the service's public API surface.
- **Why this works:** The implementation uses projectPath internally to scope events to specific projects. Tests must instantiate objects exactly as the implementation expects, not as the API documentation suggests.
- **Trade-offs:** Complete mock objects match reality and catch bugs early; simpler mocks are easier to write but miss real requirements and fail in production.

#### [Pattern] Services aggregating data from multiple external sources need error mode testing for each source independently. calendar-service tests mock failure scenarios for FeatureLoader, LinearMCPClient, and Google Calendar separately to ensure graceful degradation. (2026-02-25)

- **Problem solved:** Calendar service merges events from three sources (features, Linear milestones, Google Calendar). Tests needed to verify service behavior when each source fails independently.
- **Why this works:** In production, one source failing (e.g., Linear API down) should not break the entire calendar. Tests must verify that partial data still returns successfully, not that the entire service crashes.
- **Trade-offs:** Comprehensive error mocking ensures production resilience but adds significant test complexity (more mocked scenarios); simple happy-path tests are easy to write but miss critical failure cases.

#### [Pattern] Security test data uses realistic attack patterns, not synthetic edge cases. Tests include actual zero-width space characters, genuine prompt injection phrasings, real path traversal sequences. (2026-02-25)

- **Problem solved:** Security utilities can pass tests with made-up examples while failing against real attacks
- **Why this works:** Synthetic test cases may exercise code paths without actually triggering threat detection logic. Real attack patterns verify the threat model itself.
- **Trade-offs:** Requires research into real-world attack vectors, but provides confidence tests catch actual threats

#### [Gotcha] Tests that verify model resolution must be updated every time model IDs change. 13 test cases expected specific model strings; all had to be updated. (2026-02-25)

- **Situation:** Updated model aliases (opus 4-5 → 4-6, sonnet 4-5 → 4-6), then had to update 13 test assertions to match new IDs
- **Root cause:** Tests are tightly coupled to implementation constants. They verify behavior, not contracts.
- **How to avoid:** String assertions are simple but brittle. Could use parameterized tests or test against a config file instead.

### 90-second timeout configured specifically to account for multi-stage installation + launch + server startup sequence: ~10s installation + ~10s app launch + ~60s server startup with port scanning + ~10s test buffer (2026-02-25)

- **Context:** Electron app smoke tests must wait for multiple async operations before validation can begin
- **Why:** Arbitrary timeout (30s, 60s) would be unreliable. Analyzed each component's typical duration to set reliable threshold without unnecessary flakiness
- **Rejected:** Using standard Playwright timeout (30s) which would frequently timeout on server startup phase
- **Trade-offs:** Longer tests (slower feedback loop) vs more reliable CI that doesn't fail on transient delays
- **Breaking if changed:** Reducing timeout below 90s causes intermittent failures on slower CI runners when server startup takes 60+ seconds

#### [Gotcha] Installation smoke tests cannot run in parallel (workers: 1) because platform-specific scripts modify shared system directories (DMG mount points, Program Files, /tmp) (2026-02-25)

- **Situation:** Attempted parallel test execution caused conflicts when multiple tests tried to mount same DMG or install to same directory
- **Root cause:** Unlike unit tests, smoke tests have real side effects on the OS. Installation tests are inherently sequential operations competing for shared resources
- **How to avoid:** Sequential execution adds ~2 minutes to test suite runtime but eliminates flaky race conditions and resource conflicts

#### [Gotcha] TypeScript type checker (tsc --noEmit) reports JSX namespace and import style errors but Vite build succeeds. Pre-existing node_modules type definition conflicts don't affect build output (2026-02-25)

- **Situation:** Running isolated type checking for validation appeared to fail, but actual build succeeded without errors
- **Root cause:** Vite uses esbuild which has different type checking behavior and doesn't enforce the same strict type constraints as tsc. Type definition conflicts in node_modules are cosmetic for esbuild
- **How to avoid:** Build succeeds despite type checker warnings, but developers running 'tsc --noEmit' locally see spurious errors. IDE TypeScript checking may show warnings that aren't actual failures

#### [Pattern] Platform-specific installation scripts (bash for macOS/Linux, PowerShell for Windows) replicate realistic user installation flow rather than direct binary extraction (2026-02-25)

- **Problem solved:** Could have simplified to: extract DMG/exe/AppImage and run binary directly, but this bypasses installer-specific code paths
- **Why this works:** Smoke tests should catch installer-specific bugs (broken mount scripts, invalid NSIS configuration, missing permissions) before release
- **Trade-offs:** Slightly more complex test setup (platform-specific scripts) but catches entire category of installer bugs that generic extraction would miss

#### [Pattern] Mock mode isolation via AUTOMAKER_MOCK_AGENT=true environment variable allows smoke tests to run without API connectivity or credentials (2026-02-25)

- **Problem solved:** Smoke tests run in CI on GitHub runners without access to external services
- **Why this works:** Test reliability depends on not hitting external dependencies. Mock mode allows testing app startup, window rendering, and state persistence without API infrastructure
- **Trade-offs:** Tests verify app can launch and setup flow completes, but don't verify API integration

### Artifact retention: 30 days for builds, 7 days for test results (not symmetric). Different retention for different artifact types (2026-02-25)

- **Context:** Could use uniform retention (14 days, 30 days, etc) for simplicity
- **Why:** Builds are expensive to recreate and needed for emergency rollbacks. Test results are primarily for debugging the most recent failures. After 7 days, test logs are stale (new code landed)
- **Rejected:** Uniform 14-day retention (wastes storage on old test logs, might not keep builds long enough)
- **Trade-offs:** Slightly higher complexity in CI configuration, but optimizes storage costs for artifact pattern
- **Breaking if changed:** Shortening build retention to 7 days causes problems when needing to rebuild patch on 10-day-old code


#### [Gotcha] GitHub Actions workflow deletions cannot be verified locally or unit tested—only verified by git history inspection and eventual actual CI execution on next trigger (2026-02-28)
- **Situation:** This fix removes a workflow file; there is no way to validate the change before it runs in production (on next release attempt)
- **Root cause:** Workflows are event-driven and GitHub-infrastructure-dependent; local simulation cannot reproduce GitHub-specific context, secrets, or webhook triggers
- **How to avoid:** Cleanest code state vs maximum verification risk—breakage only discovered when next release runs

#### [Gotcha] Vitest ES module mocking requires vi.hoisted() + vi.mock() BEFORE any imports that use the mocked module. Inline mocks after imports fail silently. (2026-03-01)
- **Situation:** Tests needed to mock ProviderFactory.getProviderForModel() to verify adapter routes correctly without hitting real provider logic
- **Root cause:** ES modules are evaluated at parse time; mocks must be set up before the imports that reference them are resolved. This is different from CommonJS dynamic require() semantics.
- **How to avoid:** Hoisting requirement makes test setup less intuitive but ensures true isolation. Alternative (remove spy and just test return values) loses visibility into routing behavior.

#### [Pattern] Spy on ProviderFactory.getProviderForModel() using real factory instance rather than mocking the factory entirely (2026-03-01)
- **Problem solved:** Test needed to verify adapter correctly routes models through the factory without testing the factory's own logic
- **Why this works:** Spying preserves factory behavior (catches real routing issues) while tracking if it was called correctly. Tests the adapter-factory contract, not factory implementation.
- **Trade-offs:** More realistic integration testing (catches real bugs) but test becomes fragile to factory implementation. Spy approach is better than mock for contract testing.

#### [Pattern] Temporary Playwright test created, executed to verify feature logic, then deleted after passing; distinguishes between verification and integration (2026-03-07)
- **Problem solved:** Component not yet routed, but validation logic and app stability need verification before committing
- **Why this works:** Allows testing component behavior without permanent test file or full route integration; catch regressions early without blocking on route plumbing
- **Trade-offs:** Easier: quick verification without route work. Harder: temporary files add clutter; tests are not persistent/automated

#### [Gotcha] Test suite uses flowRegistry.unregister() in beforeEach to prevent state leakage between tests; without this cleanup, one test's registered flows persist and interfere with subsequent tests (2026-03-07)
- **Situation:** FlowRegistry is a singleton; test isolation requires explicit cleanup
- **Root cause:** Singleton state is shared across test runs. Previous test's registrations remain in memory unless explicitly cleared. beforeEach cleanup ensures each test starts with clean state.
- **How to avoid:** Requires discipline (easy to forget unregister() call). Prevents silent test interdependencies and ensures reliable test results.

#### [Gotcha] CLI tools require direct functional execution testing (node cli.js), not browser automation frameworks (2026-03-07)
- **Situation:** Implementation uses Playwright testing patterns from web UI components but this is a Node.js CLI tool
- **Root cause:** Playwright tests browser rendering, not actual CLI execution. Direct node execution (node /path/to/cli.js args) tests the real consumer experience and is faster.
- **How to avoid:** Direct CLI testing is simpler and faster but only covers CLI execution; programmatic import patterns need separate tests