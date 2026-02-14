# Phase 2: Detect CI failures after push

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

After agent pushes, poll GitHub checks API to detect failures and emit pr:ci-failure event

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/pr-feedback-service.ts`

### Verification
- [ ] After push detected (via webhook or poll), wait 30s then fetch check runs
- [ ] If any required checks fail, emit pr:ci-failure with check names and conclusions
- [ ] Extracts error messages from check output if available
- [ ] Only triggers on REQUIRED checks (not optional)
- [ ] Deduplicates (don't re-trigger on same failure)

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
