# Phase 2: Remove defunct graph registry entries

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

In apps/server/src/lib/graph-registry.ts, remove 3 of the 7 graph topology entries: unified-pipeline, lead-engineer-reflection, and interrupt-loop. The 4 remaining entries are: review-flow, coordinator-flow, antagonistic-review, content-creation. Note: review-flow and coordinator-flow remain in the registry for UI visualization topology display even though their LangGraph implementations are deleted — their registry entries describe topology for display only. Update the registry export array.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/lib/graph-registry.ts`

### Verification

- [ ] graph-registry.ts exports exactly 4 graph definitions
- [ ] No unified-pipeline, lead-engineer-reflection, or interrupt-loop entries
- [ ] npm run build:server passes

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 2 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 3
