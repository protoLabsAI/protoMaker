---
tags: [testing]
summary: testing implementation decisions and patterns
relevantTo: [testing]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 3
  referenced: 1
  successfulFeatures: 1
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