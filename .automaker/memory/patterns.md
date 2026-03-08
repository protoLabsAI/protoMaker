---
tags: [patterns]
summary: patterns implementation decisions and patterns
relevantTo: [patterns]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 51
  referenced: 18
  successfulFeatures: 18
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