---
tags: [ui]
summary: ui implementation decisions and patterns
relevantTo: [ui]
importance: 0.7
relatedFiles: []
usageStats:
  loaded: 0
  referenced: 0
  successfulFeatures: 0
---
# ui

#### [Gotcha] selectedIndex initialized to -1 (not 0), representing explicit 'no selection' state (2026-03-11)
- **Situation:** Hook needs to communicate whether a command is pre-selected in the dropdown
- **Root cause:** -1 is semantically clearer than 0; 0 would auto-select first item on activation, causing unexpected behavior
- **How to avoid:** Downstream UI components must handle -1 specially; can't directly use `commands[selectedIndex]` without bounds check

#### [Pattern] Deduped recent server URLs array (max 10) prevents duplicate entries from repeated 'set server' clicks (2026-03-11)
- **Problem solved:** Users switching between servers frequently (dev/staging/prod workflows) benefit from quick-access list
- **Why this works:** Deduplication indicates expected user behavior (clicking 'set server' multiple times with same URL). Size limit (10) balances UX density with memory.
- **Trade-offs:** Gained: clean recent list UX; lost: ability to see frequency of server usage