---
tags: [testing]
summary: testing implementation decisions and patterns
relevantTo: [testing]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 98
  referenced: 28
  successfulFeatures: 28
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

#### [Gotcha] Playwright tests can't run against worktree code because dev server serves main repo, not worktree branch. Test infrastructure doesn't support per-worktree dev servers. (2026-03-13)

- **Situation:** Attempted to verify dialog functionality with Playwright. Tests reused main repo dev server instead of worktree code.
- **Root cause:** Dev server configured with fixed paths (main repo). Worktrees are isolated git copies but share same dev server infrastructure.
- **How to avoid:** Gain: single dev server reduces resource overhead. Loss: can't test worktree changes in isolation without running separate server or static analysis.

#### [Gotcha] Turbo build cache was replaying old results. Direct tsc invocation (tsc --noEmit) was needed to verify type changes, bypassing the cached build. (2026-03-13)

- **Situation:** After code edits, npm run build:server returned cached results without recompiling the changed file.
- **Root cause:** Turbo aggressively caches task outputs. Incremental changes don't trigger cache invalidation if task hash hasn't changed fundamentally.
- **How to avoid:** Using tsc directly is faster for validation but doesn't test the full build pipeline (bundling, optimization). Full build catches more issues but is slower.

#### [Pattern] For setInterval-based logic, use vi.useFakeTimers() + vi.advanceTimersByTime() instead of real setTimeout waits. This eliminates timing flakiness and makes tests deterministic and fast. (2026-03-13)

- **Problem solved:** Original test used 3-second real-time polling with timeout checks, which is flaky due to OS scheduling variance. New test uses fake timers to advance exact intervals.
- **Why this works:** Fake timers decouple test execution from wall-clock time, making interval-based logic testable without false negatives from CPU contention or slow CI runners. Tests also run sub-millisecond.
- **Trade-offs:** Fake timers require wrapping in try/finally to restore real timers, but guarantee determinism and speed. Trade manual timer management for robustness.

#### [Gotcha] Pre-existing tests accessed result?.name on MatchResult type that actually returns { agent, confidence }. Type assertions were not validated — tests were accessing non-existent properties without type errors. (2026-03-13)

- **Situation:** 6 tests in matchFeature suite failed because they checked result?.name instead of result?.agent.name. This indicates test code drifted from the actual API.
- **Root cause:** Tests were likely written before the MatchResult type was formalized, or type checking was bypassed (possible loose tsconfig or missing type validation in test setup). Property access on union/object types wasn't caught at test time.
- **How to avoid:** Fixing tests revealed the actual type contract. Cost is finding and fixing 6 test assertions; benefit is ensuring tests validate the real API.

#### [Gotcha] Keyword matching scoring includes indirect matches. The test expected confidence ≈0.545 (18/33) but actual was 0.697 (23/33) because 'component' keyword in the agent description also contributed to the match signal. (2026-03-13)

- **Situation:** Multi-signal keyword matching test miscalculated expected score by omitting a matching signal that was actually present in the agent description.
- **Root cause:** Keyword matching is cumulative across multiple signal sources (agent name, description, extends). Test assertion only counted primary signals and missed secondary keyword contributions.
- **How to avoid:** Fixing test assertion requires understanding all signal sources. Cost is careful scoring audit; benefit is accurate confidence calibration.

#### [Pattern] Use TypeScript compilation as verification gate instead of Playwright for scaffolding phases with no runnable app (2026-03-15)

- **Problem solved:** Phase 1 creates static CSS/TSX template files. No app server, no DOM, no browser runtime available for end-to-end tests.
- **Why this works:** Pragmatic verification matching project phase constraints. TypeScript catches structural errors (type safety, exports, imports). Playwright requires running application, which doesn't exist until later phases.
- **Trade-offs:** Catches fewer bugs (no runtime logic) but appropriate for token scope. Full E2E testing happens when app shell exists in later phases.

#### [Gotcha] Test imports required migration to kebab-case module paths (registry.js, define-tool.js, mcp-adapter.js, express-adapter.js) after tools package refactoring (2026-03-15)

- **Situation:** Build output or export map changed module naming convention; tests had to be updated in lockstep
- **Root cause:** Tools package build/export map likely changed to kebab-case (common convention for npm packages). Tests importing tools must match the actual export paths.
- **How to avoid:** Consistent naming convention across package. Cost: all consumers must update imports; easy to miss and cause test failures.

#### [Gotcha] TypeScript/tsx module resolution in template packages walks up to parent node_modules even though npm install can't run in template (2026-03-15)

- **Situation:** Verification test ran via tsx from within package; package has @@PROJECT_NAME placeholders so npm install fails; but ws and @types/ws are needed
- **Root cause:** Node.js module resolution doesn't just look in ./node_modules; it traverses up to parent/node_modules/… until found. In monorepo worktree, parent node_modules inherits from root. tsx leverages this same traversal. Breaks the assumption that template packages are isolated.
- **How to avoid:** Test runs successfully using parent deps (realistic for actual usage), but surprising that package without node_modules can import; decouples test environment from package environment slightly

#### [Pattern] Cannot directly run `npm install` or test templates containing @@PROJECT_NAME placeholders. Validate template correctness via file structure verification + verifying main server still builds, not by attempting template scaffolding. (2026-03-15)

- **Problem solved:** Template contains placeholder that's substituted during actual user scaffolding, but template directory itself cannot be executed
- **Why this works:** Placeholder replacement happens at scaffolding time via copy+sed, not within template directory. Attempting npm install in template with @@PROJECT_NAME in package.json fails. Structural validation (files exist, contain expected patterns) + dependency impact testing (main server build) catches issues without false failures.
- **Trade-offs:** Requires more sophisticated validation scripts; cannot test full npm install flow in template directory; removes false blockers; higher confidence that scaffolded instances will work

#### [Gotcha] Playwright E2E verification skipped because packages/app has no Vite entry point (no main.tsx, index.html). Library code (store, hook) is TypeScript-verified but not integration-tested. (2026-03-15)

- **Situation:** Feature builds store + hook as library code, but app skeleton lacks entry point to launch and test persistence/API flow.
- **Root cause:** Incremental feature development: store + hook delivered this phase, full app wiring (Vite entry, server routes) in next phase. Store/hook are library patterns, not standalone app code.
- **How to avoid:** TS verification high confidence for library code; E2E verification deferred. Acceptance criteria 'sessions persist' and 'model flows through' validated next phase when full app boots.

#### [Pattern] Verify template artifacts via structural inspection (file existence, export signatures, API patterns) instead of runtime tests when the template environment can't be directly executed in the build context (2026-03-15)

- **Problem solved:** The ai-agent-app starter kit is a template in the monorepo. It depends on @xyflow/react which isn't installed during template generation. Direct Playwright testing is impossible without 'npm install' at template load time.
- **Why this works:** Templates can't run in their source location due to uninstalled peer dependencies. A Node.js verification script inspects 25 export signatures and API patterns instead. This catches structural/contract violations without runtime overhead and works entirely in the build environment.
- **Trade-offs:** Structural checks are fast and environment-agnostic but catch only API contract violations, not runtime logic bugs or integration issues.

#### [Pattern] Verification via TypeScript compilation: create a temporary .ts file that imports and exercises all public APIs, compile with --noEmit to type-check the entire surface, then delete. No test runner needed. (2026-03-15)

- **Problem solved:** First smoke test for a new library before committing, ensuring all exported types and functions are correctly typed and wired
- **Why this works:** TypeScript's type checker catches real usage errors that documentation review misses; immediate feedback without test infrastructure overhead; forces functions to actually be called with correct signatures
- **Trade-offs:** Requires cleanup (delete **verify**.ts) but guarantees zero compilation errors in real consumer code paths

#### [Gotcha] WCAG contrast calculation must convert Oklch→linear sRGB→luminance per spec. Direct use of oklch.l value produces incorrect contrast ratios that pass tests but fail real-world WCAG validation. (2026-03-15)

- **Situation:** Implementation of WCAG AA/AAA compliance checking requires computing relative luminance of foreground and background colors.
- **Root cause:** WCAG 2.1 spec defines luminance in relative to D65 illuminant over linear sRGB, not in the oklch lightness dimension. oklch.l approximates perceived lightness but is not the same as relative luminance.
- **How to avoid:** Correct implementation adds conversion overhead (3 matrix multiplications per color), but ensures compliance. Simplified approach would fail when ratios are close to threshold (14:1 vs 15:1).

#### [Pattern] Story metadata (argTypes, variants) stored as JavaScript objects in CSF files, parsed and used to auto-generate prop controls UI at runtime (2026-03-15)

- **Problem solved:** Prop editor needs to know what controls to render (text input, toggle, color picker, range, select) for each story without hardcoding a prop list.
- **Why this works:** Declarative metadata (argTypes) is standard CSF pattern. Parsing it at runtime means prop controls are always in sync with story definition—no duplication. Reduces boilerplate for story authors.
- **Trade-offs:** Easier: story author writes argTypes once, controls appear. Harder: story author must know argTypes schema and be disciplined; invalid argTypes config silently renders broken controls.

#### [Pattern] Temporary Playwright test file created, verified to pass (5/5 tests), then deleted after verification (2026-03-15)

- **Problem solved:** Feature involved new DocsRoute component; needed verification before merging, but tests aren't meant to be permanent
- **Why this works:** Playwright tests validate runtime behavior (route renders, sidebar visible, props table shows, navigation works) in real browser context. Deletion keeps repo clean - tests were for one-time verification, not regression prevention
- **Trade-offs:** Easier: clean git history, no test maintenance. Harder: no ongoing regression protection; if someone refactors DocsRoute later, no test safety net

#### [Pattern] Feature verified using Playwright tests run against actual Vite dev server (port 5190). Tests checked real rendered output: sidebar text, admin page content, route navigation. (2026-03-15)

- **Problem solved:** Verifying TinaCMS integration before merge, ensuring all 5 routes work end-to-end
- **Why this works:** Real integration test against actual running app catches rendering, routing, timing issues that unit tests miss. Confirms Vite bundling works.
- **Trade-offs:** Slower than unit tests, requires server lifecycle management, harder to debug failures; but much higher confidence

#### [Gotcha] Playwright test execution required NODE_PATH=/path/to/root/node_modules to resolve @playwright/test correctly (2026-03-15)

- **Situation:** Temporary verification tests created in worktree subdirectory to validate components render
- **Root cause:** Playwright module installed at monorepo root, not in design-system package. Default Node resolution doesn't traverse up to root node_modules.
- **How to avoid:** Gains: discovered NODE_PATH workaround for monorepo testing. Loses: time debugging module resolution.

#### [Pattern] Temporary Playwright tests created, executed against live Vite dev server, then deleted post-verification (2026-03-15)

- **Problem solved:** Need lightweight component verification without adding persistent test infrastructure to starter template
- **Why this works:** Avoids committing test files to template. Quick validation of component rendering. Leaves template clean for users. Tests run in real browser environment.
- **Trade-offs:** Gains: quick validation, clean template. Loses: no persistent regression tests, verification is manual/one-time.

### TypeScript type-check gate (tsc --noEmit) inserted immediately after code generation, before refinement loop begins (2026-03-15)

- **Context:** Generated React components from .pen codegen need verification before being fed to Claude for refinement
- **Why:** Catches structural/type errors in generated code early. Invalid TypeScript can confuse Claude's refinement loop or waste iterations. Fail-fast approach prevents garbage-in-garbage-out
- **Rejected:** Skipping type check and letting refinement handle all errors would require Claude to diagnose and fix type issues, wasting tokens and iterations
- **Trade-offs:** Easier: generated code guaranteed to be valid TypeScript before refinement. Harder: requires tsc as a build dependency and adds latency
- **Breaking if changed:** If you remove this gate, generated code with type errors enters refinement loop, reducing reliability of output and increasing iteration costs

### Use TypeScript compilation (npx tsc --noEmit exit code 0) as verification gate for starter kit templates instead of Playwright/UI testing (2026-03-15)

- **Context:** Starter kit templates are not running applications — no browser UI to test with Playwright
- **Why:** TypeScript verification is the appropriate artifact-level verification for code templates; catches structural errors at definition time rather than runtime
- **Rejected:** Playwright testing requires running application (starter kit templates don't); manual testing is not scalable
- **Trade-offs:** Catches type errors early but doesn't verify runtime behavior when template is instantiated and used in actual projects
- **Breaking if changed:** Removing TypeScript verification would allow type errors to ship in templates, deferring errors to when developers use the template

#### [Pattern] Round-trip validation (ComponentDef → XCL → ComponentDef, verify equality) caught two asymmetric codec bugs before ship. 28 Playwright tests across 6 component types verified 100% fidelity. (2026-03-15)

- **Problem solved:** Serializer and deserializer are separate codepaths. Each could silently lose data in one direction (e.g., serialize drops field, deserialize ignores it).
- **Why this works:** Asymmetric bugs are hard to spot: one direction works, other direction seems to work but loses data. Round-trip testing forces both paths to be tested together. Catches lossy serialization.
- **Trade-offs:** More test code required (need to compare deep object structures after round-trip). More coverage: catches codec asymmetries that separate tests miss.


#### [Pattern] Git pre-commit hooks enforce correct file paths (caught attempt to write docs to main repo instead of worktree) (2026-03-15)
- **Problem solved:** Developer path selection error was automatically blocked by hook before being committed
- **Why this works:** Filesystem path validation in hooks is layered safety mechanism - more reliable than guidelines or code review alone; prevents organizational/maintenance issues from wrong paths
- **Trade-offs:** Automatic enforcement prevents mistakes but adds tooling complexity and can cause friction if overly strict or misconfigured

#### [Gotcha] vi.runAllTimersAsync() with fake timers causes infinite loops when testing repeating intervals (setInterval). Use vi.advanceTimersToNextTimer() + flushPromises() instead. (2026-03-15)
- **Situation:** Unit tests for interval task registration were hanging/failing due to timer advancement strategy with repeating intervals
- **Root cause:** vi.runAllTimersAsync() recursively fires all pending timers until the 10000-timer limit is reached; with repeating intervals, this creates infinite recursion. vi.advanceTimersToNextTimer() advances only to the next scheduled timer, allowing controlled test flow for intervals.
- **How to avoid:** More verbose test setup (flushPromises helper) but reliable, predictable interval testing; allows testing pause/resume logic that wouldn't work with runAllTimersAsync

#### [Pattern] Use internal interface (IntervalTask) to wrap native setInterval with metadata tracking (lastRun, duration, failureCount, executionCount). Store wrapped tasks in Map keyed by ID. (2026-03-15)
- **Problem solved:** Need to track execution metrics for interval tasks while maintaining ability to clear handles on pause/destroy
- **Why this works:** setInterval returns a primitive handle that can't store metadata; wrapping in interface allows co-location of handle + metrics. Map by ID enables O(1) lookup for pause/resume/metrics operations.
- **Trade-offs:** More memory per task (wrapper object) but unified data structure; enables atomic pause/resume of all task properties together

#### [Gotcha] Test strategy must shift when intervals are externalized: vi.useFakeTimers() + vi.advanceTimersByTime() no longer works because setInterval is gone. Tests must call service.tick() directly. (2026-03-15)
- **Situation:** agent-manifest-service.test.ts relied on fake timers to trigger setInterval callbacks. Migration removed setInterval, breaking the test's timing mechanism.
- **Root cause:** No setInterval means no fake timer hooks to advance. Direct tick() call is the new contract. Tests lose ability to verify actual interval cadence.
- **How to avoid:** Easier: direct method calls, no fake timer setup. Harder: can't verify interval timing/cadence from test level; timing verification moves entirely to scheduler's domain.

#### [Pattern] Test suite explicitly verifies event emission (timer:paused, timer:resumed) for every state transition, not just response codes, ensuring event-driven architecture actually works in practice. (2026-03-15)
- **Problem solved:** Event-driven synchronization is critical to system correctness but can silently fail if events don't emit
- **Why this works:** Response code tests are insufficient; events are invisible in happy-path testing. Explicit event verification catches missing event emissions early. Tests should reflect architecture guarantees.
- **Trade-offs:** Tests are more verbose but catch real failures. Couples tests to event system. Requires mock/spy setup.

#### [Pattern] Field preservation tests verify all original fields (description, color, type, recurrence itself) are copied to expanded instances (2026-03-15)
- **Problem solved:** Easy to accidentally lose fields when cloning objects during expansion
- **Why this works:** Catches silent data loss bugs where expansion omits fields. Instance must be identical to parent except for id and date
- **Trade-offs:** Comprehensive but verbose test. Guarantees instances are complete objects. Cost: need to update test whenever new event fields are added

#### [Gotcha] SQLite operations complete within the same millisecond when executed in rapid succession. Tests checking timestamp-based ordering (updated_at) will fail with non-deterministic results because both records receive identical ISO timestamps. (2026-03-16)
- **Situation:** Test 'listConversations returns all in recency order' failed because createConversation(A) and createConversation(B) executed too fast to produce different updated_at values.
- **Root cause:** SQLite uses system time for timestamps. In tests, operations are CPU-bound and hit the same clock tick. Attempting to fix via updateConversation() or createMessage() still hits the same millisecond.
- **How to avoid:** Using vi.useFakeTimers() makes tests deterministic and readable but requires manual time manipulation in test setup. Real-world operations (human-paced) naturally spread across different timestamps.

#### [Gotcha] Package-local vitest.config.ts required to prevent root workspace config from interfering with package tests (2026-03-16)
- **Situation:** Context-engine package tests failed when inheriting root vitest.workspace.ts config
- **Root cause:** Root workspace config defines global settings (environment, globals) that don't apply to individual packages. Package needs to override (name, globals: true, environment: 'node', coverage thresholds).
- **How to avoid:** Local config duplication vs. ability to run tests with correct environment. Monorepo testing trade-off: explicit per-package config >  implicit inheritance.

#### [Pattern] Test matrix covers positive case (agent-assigned picked up), negative case (human-assigned skipped), edge case (undefined picked up), and mixed scenario (all three together). Semantics are verified, not just existence. (2026-03-16)
- **Problem solved:** Filtering logic has subtle semantics: undefined and 'agent' behave the same way (eligible), but any other string value (human name) is skipped. Easy to misunderstand if not tested explicitly.
- **Why this works:** Semantic behavior (not just code path) needs test coverage. Tests serve as executable documentation of field value meanings. Catches off-by-one mistakes in string comparisons or truthiness checks.
- **Trade-offs:** Comprehensive test matrix takes more lines, but captures intent clearly. Minimal tests would miss the undefined=='agent' semantic equivalence.

#### [Pattern] Library-Only Verification via TypeScript Compilation: No Playwright tests for library packages; verify via DTS + ESM build success and type checking (2026-03-16)
- **Problem solved:** Context-engine is pure library (no UI). Decision: what verification is sufficient?
- **Why this works:** Compilation catches structural errors, export correctness, type mismatches. Runtime behavior tested by consumers (e.g., agent packages that import this). Avoids test duplication.
- **Trade-offs:** Faster CI for libraries; Runtime errors in non-type-caught paths only found by consumers. Requires strong consumer integration tests.