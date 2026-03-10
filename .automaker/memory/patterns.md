---
tags: [patterns]
summary: patterns implementation decisions and patterns
relevantTo: [patterns]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 65
  referenced: 21
  successfulFeatures: 21
---
# patterns

#### [Pattern] Calendar event signal classification using keyword matching with fallback routing: Check for marketing keywords (campaign, content, social, analytics) → GTM track; engineering keywords (sprint, deployment, bug) → Ops track; default to Ops. All events classified, no drop-through. (2026-02-22)

- **Problem solved:** Need to automatically route calendar events to appropriate teams without manual setup. Which classification method?
- **Why this works:** Keyword matching is O(1) per event, requires no ML model or training data, works with any calendar. Fallback ensures no events are unrouted (robustness). Simple for users to understand.
- **Trade-offs:** Keyword matching sometimes misclassifies (e.g., 'campaign management sprint' matches both), but fallback ensures it goes somewhere. All events routed even if imperfectly.

#### [Pattern] Matcher-based conditional hook execution allows same hook array to dispatch different behaviors based on context (e.g., SessionStart has separate matchers for 'compact', 'startup', 'resume' modes) (2026-02-24)

- **Problem solved:** Plugins need hooks that behave differently depending on session state, tool type, or MCP method invoked. Matcher field enables context-aware routing without hardcoding in hook scripts.
- **Why this works:** Reduces code duplication and provides declarative routing. Different session contexts (compact, startup, resume) can trigger different initialization sequences without needing conditional logic in bash scripts.
- **Trade-offs:** Declarative matchers are easier to understand and modify (+) but add complexity to hook schema and require matcher implementation in Claude Code runtime (-)

#### [Pattern] Skeleton-first approach: auto-generates structure with explicit TODO markers, not complete specification (2026-03-07)

- **Problem solved:** generateSpecMd must produce useful output without access to product/business context
- **Why this works:** Acknowledges that product goals, target users, workflows cannot be reliably auto-generated without hallucination risk
- **Trade-offs:** More friction for user (must fill TODOs) but prevents confidence in incorrect auto-generated product specification

#### [Pattern] Intentionally lower confidence scoring (0.75 vs standard) for broad-keyword patterns ('needs human input', 'ambiguous', 'cannot proceed') to avoid false positives. Accept imperfect recall to prevent misclassification. (2026-03-09)

- **Problem solved:** The new 'agent escalation' pattern covers common escalation phrases that are linguistically broader than specific failure modes. Using high confidence would create false positives misclassifying other failures.
- **Why this works:** False positives (classifying a retry-able failure as non-retryable escalation) cause more damage than false negatives (some escalations slip through to unknown). Lower confidence + high recall on unclassified logging allows gradual pattern tightening.
- **Trade-offs:** Some real agent escalations may still be classified as unknown initially, but they'll surface in the warn logs for pattern refinement. Avoids breaking the retry system with false escalations.

#### [Pattern] Execution gate in ExecuteProcessor checks 3 system health signals (review queue depth, error budget, CI saturation) before launching a feature agent. Returns feature to BACKLOG if any check fails. Gate enabled via `workflow.executionGate` setting. (2026-03-10)

- **Problem solved:** Auto-mode was launching feature agents even when the system was overloaded (review queue saturated, high CI failure rate, pending CI runs piled up). This wasted compute and worsened the health problem.
- **Why this works:** All 3 checks are non-fatal (wrapped in try/catch) — if a check throws, the feature proceeds. Gate logic lives entirely in `runExecutionGate()` and is toggled via project settings. Settings override defaults (`errorBudgetThreshold`, `errorBudgetWindow`, `maxPendingReviews`, `maxPendingCiRuns`).
- **Trade-offs:** Gate adds latency to each execute cycle (3 async checks). Accepted: failures are caught and non-blocking. Feature goes to BACKLOG (not ESCALATE) when blocked — it re-queues rather than alerting humans.

#### [Pattern] Portfolio gate in SignalIntakeService evaluates incoming signals with 3 checks: capacity (>50 active features → defer), duplication (cosine similarity >0.6 → block), architectural-signal error budget (>30% fail rate → defer). Gate enabled via `settings.portfolioGate`. (2026-03-10)

- **Problem solved:** Signal intake was creating features without regard for backlog depth, near-duplicate ideas, or system stability. Board filled up with duplicate/low-value items during unstable periods.
- **Why this works:** Three-outcome gate (allow/block/defer) maps to distinct actions: block creates a `status: 'blocked'` feature for human review; defer pushes to `deferredQueue` for later retry; allow proceeds normally. Architectural signals (keywords: architecture, infrastructure, migration, refactor, platform, framework) are specifically gated by error budget to prevent destabilizing changes during failures.
- **Trade-offs:** Similarity check requires embedding comparison (potential latency). `deferredQueue` is in-memory — deferred signals are lost on server restart. Capacity threshold (50) and similarity threshold (0.6) are hardcoded constants, not yet user-configurable.

#### [Pattern] Gate expensive render-time operations (syntax highlighting, heavy transforms) behind an `isStreaming` prop to prevent thrashing during token delivery. Apply the operation only on completion. (2026-03-09)

- **Problem solved:** Streaming AI responses deliver tokens incrementally. Any useEffect that depends on `code`/`content` will re-fire on every token, making expensive operations (Prism.js, markdown parsing, diff computation) thrash the renderer.
- **Why this works:** The rendered output during streaming doesn't need to be perfect — users are watching text appear. Deferred enhancement (apply Prism once streaming completes) keeps the UI responsive during delivery and produces the same final result.
- **Trade-offs:** Easier: eliminates render thrashing, smooth streaming UX. Harder: requires threading `isStreaming` prop down to leaf display components. Pattern: add `isStreaming?: boolean` to component props, skip expensive effect when true, re-run effect when `isStreaming` transitions to `false`.
