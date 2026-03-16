# Phase 4: Add missing failure patterns and fix classifier regex and wiring

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

FailureClassifier has broad regex and missing patterns. Add word boundaries to numeric patterns. Add patterns for stale context, git workflow failure, concurrency race, staging failure, loop detection. Wire FailureClassifierService into ServiceContainer and ReconciliationService.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/failure-classifier-service.ts`
- [ ] `apps/server/src/server/services.ts`

### Verification

- [ ] Numeric patterns use word boundaries
- [ ] Five new failure patterns added for documented modes
- [ ] FailureClassifierService in ServiceContainer
- [ ] ReconciliationService receives classifier
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
