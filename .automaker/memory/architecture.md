---
tags: [architecture]
summary: architecture implementation decisions and patterns
relevantTo: [architecture]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# architecture

### Chose to version-control feature.json (immutable disaster recovery) while keeping agent-output.md and images ignored (mutable runtime artifacts) (2026-02-10)
- **Context:** Post-incident analysis: .automaker/features/ directory was completely wiped during 9+ agent crash. Feature.json contains permanent state (feature definitions), while agent-output.md and images are ephemeral logs/scratch space
- **Why:** Clear separation of concerns: track immutable schema/state (feature.json), ignore mutable runtime output. This creates a survivable backup mechanism without cluttering git history with logfiles
- **Rejected:** Alternative 1: Track everything (git bloat, merge conflicts from concurrent agent runs). Alternative 2: Track nothing (accepted disaster loss). Alternative 3: External backup system (adds complexity, duplication with git)
- **Trade-offs:** Accept occasional merge conflicts on feature.json (rare, when same feature modified simultaneously) in exchange for automatic disaster recovery via git history
- **Breaking if changed:** If feature.json changes from immutable schema to mutable runtime state, version control becomes a liability (constant merge conflicts, stale history)

### Used `**/` greedy wildcard in .gitignore pattern (`!.automaker/features/**/feature.json`) instead of single-level glob (`!.automaker/features/*/feature.json`) (2026-02-10)
- **Context:** Current feature storage is single-level (.automaker/features/{featureId}/feature.json), but future structure might nest deeper
- **Why:** Future-proofing: if feature structure evolves to multi-level nesting (e.g., .automaker/features/{category}/{featureId}/feature.json), single-level glob breaks silently. Greedy `**` handles both current and future shapes
- **Rejected:** Single-level `*/` pattern (less future-proof, requires .gitignore update if structure changes)
- **Trade-offs:** Greedy `**` is slightly more permissive (would match deeply nested files) but this is acceptable because feature.json is the only tracked file in that subtree. Added ~3 characters of complexity for zero fragility
- **Breaking if changed:** If someone enforces strict directory structure and later changes it, single-level glob breaks and features stop being tracked until .gitignore is fixed