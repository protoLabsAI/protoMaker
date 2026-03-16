# Phase 1: Fix staleDeps rule - done features excluded from worldState

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

WorldStateBuilder excludes done features from featureMap. staleDeps rule treats missing deps as not-done, so features with completed dependencies can NEVER be unblocked. Fix: treat missing deps as done rather than not-done.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/lead-engineer-world-state.ts`
- [ ] `apps/server/tests/unit/services/lead-engineer-rules.test.ts`

### Verification

- [ ] staleDeps rule correctly identifies done dependencies
- [ ] Unit test: blocked feature with done dep gets unblock action
- [ ] Unit test: blocked feature with in_progress dep stays blocked
- [ ] npm run test:server passes

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 1 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 2
