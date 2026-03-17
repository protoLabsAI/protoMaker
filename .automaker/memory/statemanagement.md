---
tags: [statemanagement]
summary: state_management implementation decisions and patterns
relevantTo: [statemanagement]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 10
  referenced: 9
  successfulFeatures: 9
---
# state_management

#### [Pattern] All state mutations from drag-drop must be wrapped in createRefNode → updateDocument(content, true) pattern to integrate with undo/redo system (2026-03-16)
- **Problem solved:** undo/redo support works by calling updateDocument with second parameter true, which adds mutation to history stack
- **Why this works:** Prevents duplicating undo logic; centralizes state mutation through updateDocument ensures consistent history tracking; Zustand state update alone doesn't create history entry
- **Trade-offs:** Simpler undo code but developers must remember to wrap mutations; easy to accidentally create mutations that have no undo support