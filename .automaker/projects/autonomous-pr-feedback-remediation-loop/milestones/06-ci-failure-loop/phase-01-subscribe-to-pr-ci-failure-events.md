# Phase 1: Subscribe to pr:ci-failure events

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Make PRFeedbackService subscribe to pr:ci-failure and trigger another agent run with CI failure context

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/pr-feedback-service.ts`

### Verification
- [ ] Service subscribes to pr:ci-failure event on init
- [ ] On CI failure, increment prIterationCount
- [ ] Build CI failure continuation prompt with failed check details
- [ ] Restart agent with CI context (which checks failed, error messages)
- [ ] Respects max iteration limit (escalate if > 2 CI failures)

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
