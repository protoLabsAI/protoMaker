---
tags: [ux]
summary: ux implementation decisions and patterns
relevantTo: [ux]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# ux

#### [Pattern] Each starter kit has two complementary onboarding mechanisms: (1) a features array that populates actionable board items, and (2) a context function that generates `.automaker/CONTEXT.md` with reference documentation. (2026-03-15)
- **Problem solved:** AI Agent App starter provides both getAiAgentAppStarterContext() (static reference guide) and AI_AGENT_APP_FEATURES (5 task items) rather than one or the other.
- **Why this works:** Users need both *what to do next* (features/tasks) and *how things work* (context/reference). Features drive action; context reduces cognitive load when learning structure.
- **Trade-offs:** Requires maintaining two separate pieces of metadata per starter (features + context), but creates complete onboarding experience vs partial