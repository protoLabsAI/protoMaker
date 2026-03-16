# Phase 3: Fix action executor race and enable_auto_merge strategy

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Two bugs: (1) Fire-and-forget actions race causing featureLoader.update interleaving. Execute actions sequentially. (2) enable_auto_merge hardcodes --squash violating branch strategy for promotions. Resolve strategy based on PR base branch.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/lead-engineer-action-executor.ts`
- [ ] `apps/server/tests/unit/services/lead-engineer-action-executor.test.ts`

### Verification

- [ ] Actions targeting same featureId execute sequentially
- [ ] enable_auto_merge uses --merge for staging/main/epic branches
- [ ] enable_auto_merge uses --squash for dev branches
- [ ] npm run test:server passes

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
