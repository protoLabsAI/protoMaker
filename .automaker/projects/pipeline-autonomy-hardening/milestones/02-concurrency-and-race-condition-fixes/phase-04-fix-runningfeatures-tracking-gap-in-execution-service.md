# Phase 4: Fix runningFeatures tracking gap in execution-service

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

During recursive executeFeature() calls, code deletes featureId from runningFeatures then re-adds it. This gap allows duplicate agents. Pass internal flag to skip duplicate check on recursive calls. Also align terminal status sets - remove review from TERMINAL_STATUSES since resume legitimately re-executes review features.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/auto-mode/execution-service.ts`
- [ ] `apps/server/tests/unit/services/execution-service.test.ts`

### Verification

- [ ] runningFeatures.has(featureId) true throughout entire lifecycle including recursion
- [ ] Terminal status set no longer includes review
- [ ] npm run test:server passes

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 4 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 5
