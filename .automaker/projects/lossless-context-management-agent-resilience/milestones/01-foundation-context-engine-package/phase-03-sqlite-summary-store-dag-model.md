# Phase 3: SQLite Summary Store & DAG Model

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Implement SummaryStore for the DAG. Tables: summaries, summary_sources, summary_parents, context_items. FTS5 index on summaries content. DAG traversal helpers: getAncestors, getDescendants, getSourceMessages.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/context-engine/src/store/summary-store.ts`
- [ ] `libs/context-engine/src/store/migrations.ts`

### Verification
- [ ] Summary DAG persists with bidirectional provenance links
- [ ] Can traverse from summary to original source messages
- [ ] Can traverse from summary to parent condensed summaries
- [ ] FTS5 full-text search across summary content works
- [ ] Context items table tracks active context assembly
- [ ] Unit tests verify DAG construction and traversal

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 3 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 4
