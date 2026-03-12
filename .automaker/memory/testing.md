---
tags: [testing]
summary: testing implementation decisions and patterns
relevantTo: [testing]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 90
  referenced: 27
  successfulFeatures: 27
---

<!-- domain: Testing Patterns | Unit test patterns, integration test strategies, test isolation -->

# testing

#### [Pattern] Test .gitignore patterns by creating actual files and running `git check-ignore`, then verify via integration test that the file appears in `git status` (2026-02-10)

- **Problem solved:** Pattern syntax errors in .gitignore are silent — git simply ignores files you intended to track, and this only surfaces when you notice git status doesn't show expected files.
- **Why this works:** .gitignore validation requires two layers: (1) syntax correctness via `git check-ignore`, (2) intent correctness via `git status`. Syntax can be right but pattern logic wrong (e.g., parent directory ignored). Only integration test proves the actual behavior.
- **Trade-offs:** Requires full integration test (create actual files, run git commands) vs cheaper unit tests. Cost is minimal for critical paths like version control rules.

#### [Gotcha] Playwright test initially failed because TypeScript compilation succeeded but dev server wasn't running new code (2026-02-10)

- **Situation:** Built code without restarting server; test ran against stale server logic.
- **Root cause:** Dev server caches compiled code in memory. Restart required to pick up new task registration.
- **How to avoid:** Dev discipline: restart after structural changes.

#### [Gotcha] Event emission tests must verify BOTH presence and ordering of events — a single check for 'health:check-completed' existing won't catch missing 'health:issue-detected' events (2026-02-12)

- **Situation:** Simple test that only verifies 'health:check-completed' exists would pass even if the 'health:issue-detected' emission was never added.
- **Root cause:** Event-driven systems are easy to test incompletely. The success of downstream behavior doesn't guarantee all intermediate events fired. Must test the event stream sequence, not just endpoints.
- **How to avoid:** More comprehensive tests = more test code, but catches off-by-one event sequence bugs that integration tests might miss.

#### [Pattern] Use event spy callbacks to capture and filter multiple event types, then verify ordering with index comparisons (2026-02-12)

- **Problem solved:** Need to verify that multiple events fire in a specific order in a single test run.
- **Why this works:** Callback spy captures full event stream with timing. Filtering by event type + index comparison is clearer than trying to count events or use timestamps.
- **Trade-offs:** More complex test (array filtering, index math) vs simpler individual event tests, but catches real bugs.

#### [Gotcha] Playwright E2E tests skipped due to existing server instance conflict — test environment assumes no running server, but dev environment typically has one running (2026-02-12)

- **Situation:** Attempted to run Playwright verification tests in development environment where server was already running on the port tests expected.
- **Root cause:** Port conflicts cause test framework to fail during setup.
- **How to avoid:** Use TEST_REUSE_SERVER env var to target already-running instance, or use isolated ports in test config.

#### [Gotcha] npm pack --dry-run outputs file list to stderr, not stdout. Test assertions on execSync output must capture both or redirect stderr to stdout with 2>&1 (2026-02-13)

- **Situation:** Initial test was checking output variable for tarball file list — found nothing because output was empty.
- **Root cause:** npm pack writes the summary/file listing to stderr by design, keeping stdout clean for piping the actual tarball.
- **How to avoid:** Use `{ stdio: ['pipe', 'pipe', 'pipe'] }` in execSync options and concatenate stderr into assertions.

#### [Gotcha] Root vitest config interferes with package-level tests in monorepo. Must create local vitest.config.ts at package level to isolate test environment. (2026-02-13)

- **Situation:** Tests in packages were inheriting root vitest configuration which had incompatible globals and environment settings.
- **Root cause:** Monorepo packages need isolated test configs. Root config may include workspace-wide settings (like globals: true) that conflict with individual package requirements.
- **How to avoid:** Each package maintains its own vitest.config.ts — slight duplication but gains isolation.

#### [Pattern] Tests verify both file creation AND correct variable interpolation per package manager. Each test covers: directory structure, all workflows, package manager placeholder replacement, setup action presence/absence. (2026-02-13)

- **Problem solved:** CI phase has multiple dimensions of correctness: directory structure, file count, content accuracy, and conditional logic.
- **Why this works:** Single-dimension tests miss entire classes of bugs. Testing placeholder replacement catches errors in regex/interpolation logic.
- **Trade-offs:** Multi-dimensional tests are more complex to write but catch more bugs.

### Verification test uses execSync to check TypeScript compilation and Node.js syntax validation rather than runtime execution (2026-02-13)

- **Context:** Need to validate branch-protection.ts compiles and produces valid JavaScript without actually calling GitHub API.
- **Why:** execSync('node -c') validates syntax without importing/executing; avoids dependency on gh CLI or GitHub auth during test.
- **Rejected:** Importing the module directly (would fail if gh CLI missing), mocking GitHub API (too heavy for syntax validation).
- **Breaking if changed:** If phase adds top-level gh CLI calls at import time, node -c validation will fail and hide the real problem.

#### [Pattern] Integration tests for npm packages must test the complete packaging lifecycle: build → npm pack → extract tarball → npm install in temp directory → import/execute. Each stage is critical to validate. (2026-02-13)

- **Problem solved:** Simply testing import after build doesn't validate that npm pack includes all necessary files, or that the published package will work when installed elsewhere.
- **Why this works:** npm pack can silently exclude files due to .npmignore, missing package.json exports fields, or incorrect build output. Only testing the full published package reveals these issues before release.
- **Trade-offs:** Integration tests are slower (npm install adds 5-15s per test) but catch production issues impossible to find in unit tests.

#### [Pattern] Separate temp directory cleanup into afterAll hook rather than manual cleanup in each test. Prevents stale test directories from accumulating and isolates test pollution. (2026-02-13)

- **Why:** Centralized cleanup in afterAll is guaranteed to run once after all tests complete, regardless of pass/fail.
- **Breaking if changed:** If afterAll cleanup is removed, test runs accumulate temp directories in OS temp space, eventually causing disk space issues or path conflicts.

#### [Pattern] Integration tests for dual-format packages (ESM and CJS) require separate test directories with different package.json type fields and require/import syntax. (2026-02-13)

- **Problem solved:** Single test directory can't reliably test both formats because Node's module resolution caches decisions based on type field and directory state.
- **Why this works:** Node.js treats .mjs and .cjs files differently depending on parent directory's package.json type field. Testing both requires isolated contexts to prevent cache pollution.
- **Trade-offs:** Two separate test blocks, but guarantees each format is validated in its correct context.

#### [Gotcha] Vitest `afterAll` must be imported from 'vitest', not assumed globally. Missing import causes silent test hang at teardown. (2026-02-18)

- **Situation:** afterAll cleanup hook appeared to run but test process hung indefinitely after all assertions passed.
- **Root cause:** Without explicit import, afterAll falls through to global scope (undefined), effectively becoming a no-op. The test runner waits for cleanup hooks that never complete.
- **How to avoid:** Always import { describe, it, expect, beforeAll, afterAll, vi } explicitly from 'vitest'. Never rely on global injection.

#### [Pattern] Mock mode via AUTOMAKER_MOCK_AGENT=true bypasses real agent execution for CI testing without requiring Claude API credentials. (2026-02-22)

- **Problem solved:** CI needs to test agent orchestration code without real API calls or API keys.
- **Why this works:** Mock agent immediately completes with success response. Tests verify orchestration logic (state transitions, event emission, worktree lifecycle) without testing the Claude API itself.
- **Trade-offs:** Mock doesn't test actual agent behavior, but agent behavior is tested separately via Claude API integration tests.

#### [Gotcha] TypeScript path aliases in tests require both tsconfig paths AND vitest resolve.alias configuration — one without the other silently breaks imports. (2026-02-25)

- **Situation:** After adding @/ path alias to tsconfig, tests importing @/lib/foo failed at runtime despite TypeScript compiling cleanly.
- **Root cause:** Vitest uses its own module resolver that doesn't read tsconfig.paths by default. Both must be configured independently.
- **How to avoid:** When adding path aliases to tsconfig, immediately add matching entry to vitest.config.ts resolve.alias.

#### [Pattern] Inline object stubs (not vi.mock) for interface-driven test coverage: Tests create inline implementations of BriefingWorldStateProvider, PMWorldStateBuilder, LeadEngineerWorldStateProvider to avoid mock complexity and preserve interface contract visibility. (2026-03-11)

- **Problem solved:** Integration tests verify data flow through three layers with failure scenarios. Code is heavily interface-driven with multiple collaboration points.
- **Why this works:** Inline stubs make interface contracts explicit in test code and provide fine-grained control over each layer's behavior independently. Mock libraries abstract away the contract.
- **Trade-offs:** More test setup boilerplate but better visibility. Easier to debug stub behavior. Less 'magic' in test infrastructure.

#### [Gotcha] applyRemoteChanges integration tests existed and compiled, but were dead code — never ran in CI/normal workflows, hid design evolution. (2026-03-12)

- **Situation:** Tests for abandoned features tend to rot while still compiling, creating false sense of coverage.
- **Root cause:** When feature-sync model was abandoned, tests weren't marked as deprecated or removed. They became invisible maintenance debt.
- **How to avoid:** Removing tests forces test suite to shrink and stay current. But loses historical documentation of why sync model existed.

#### [Pattern] Updated all 6 instance-identity resolution tests before removing code. Tests validate new resolution order and precedence rules with clear, single-concern test cases. (2026-03-12)

- **Problem solved:** Refactoring identity resolution — need confidence that new path works and captures all precedence scenarios
- **Why this works:** Tests serve as both validation and living documentation of resolution hierarchy; updating them first validates assumptions before code changes; makes the intent of precedence explicit
- **Trade-offs:** Unit tests are fast and deterministic; captures all edge cases (env override, registry miss, etc.) in one place; future changes to identity resolution are protected

#### [Pattern] When fixing stale data issues, test plan must explicitly verify freshness (last-modified time), not just 'can read file', to catch scenarios where fix reads different (but still stale) file (2026-03-12)

- **Problem solved:** Original bug was invisible during normal use (tool still returned _a_ log file, just wrong one); test plan called out 'lines from currently-running server's log (last-modified seconds ago, not 12 hours ago)'
- **Why this works:** Stale data bugs can masquerade as working if you only test for 'file exists' or 'can parse content'; explicit freshness check catches the actual problem being fixed
- **Trade-offs:** Requires more context-aware testing (know what freshness should be), but catches the real bug instead of false positives

#### [Pattern] Integration tests disable CRDT (no proto.config.yaml) to keep state on disk rather than in Automerge docs. This sidesteps the inconsistency where updatePhaseClaim writes to disk but getProject reads from doc. (2026-03-12)

- **Problem solved:** Services can write to disk (updatePhaseClaim) or read from doc (getProject), causing test flakiness if both operate on different state stores
- **Why this works:** Automerge document sync between instances adds complexity; disk-only state is deterministic for testing. Core CRDT logic is still tested via event propagation simulation.
- **Trade-offs:** Simpler, faster tests vs. not testing actual Automerge document consistency. Compensated by testing event wiring (EventBus → persistRemoteProject) which is the sync mechanism.

#### [Pattern] Unit tests verified broadcast() calls using Jest mocks and actual Express server on ephemeral port (2026-03-12)

- **Problem solved:** Route code needed verification that categories:updated events are broadcast correctly and files persist
- **Why this works:** Mock events.broadcast() to verify correct event signatures; real Express server to verify HTTP behavior and file I/O together without stubbing filesystem
- **Trade-offs:** Gained confidence in integration between routes and events; test setup more complex than pure unit tests
