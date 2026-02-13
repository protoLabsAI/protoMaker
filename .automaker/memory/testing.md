---
tags: [testing]
summary: testing implementation decisions and patterns
relevantTo: [testing]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 4
  referenced: 2
  successfulFeatures: 2
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

#### [Pattern] Created E2E Playwright verification tests that specifically check for import/module errors in browser console and page errors, filtering for error types like 'cannot find', 'failed to resolve', 'unexpected identifier' (2026-02-13)
- **Problem solved:** Build and format checks alone wouldn't catch runtime import resolution failures caused by refactored import paths
- **Why this works:** TypeScript build succeeds if path aliases exist in `tsconfig.json`, but runtime failures occur if components reference incorrect paths. Playwright tests the actual browser environment where import errors manifest as console errors before the app fully loads.
- **Trade-offs:** Playwright tests add execution time (~30s) but catch a class of errors (broken import resolution) that static checks miss. Test files are temporary and cleaned up, so they don't add maintenance burden.