---
tags: [gotchas]
summary: gotchas implementation decisions and patterns
relevantTo: [gotchas]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 1
  referenced: 0
  successfulFeatures: 0
---
# gotchas

#### [Gotcha] .gitignore negative patterns require parent directory to be unignored first, or the negative rule is ineffective (2026-02-10)
- **Situation:** When adding `!.automaker/features/**/feature.json` to gitignore, if `.automaker/` or `.automaker/features/` is already ignored by a parent rule, the negative pattern won't work because git stops traversing ignored directories
- **Root cause:** Git's .gitignore matching is ordered and evaluates per-directory. Once a directory is marked ignored, git never enters it to check nested negative patterns. This is a common source of 'why isn't my ! pattern working' failures
- **How to avoid:** Pattern requires careful layering: positive ignore rule for directory, THEN negative unignore for specific files inside. More verbose but predictable