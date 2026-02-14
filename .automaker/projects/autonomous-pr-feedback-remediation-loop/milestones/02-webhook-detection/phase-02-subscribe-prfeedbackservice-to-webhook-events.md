# Phase 2: Subscribe PRFeedbackService to webhook events

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Make PRFeedbackService listen to pr:review-submitted and immediately process reviews instead of waiting for poll

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/pr-feedback-service.ts`

### Verification
- [ ] Service subscribes to pr:review-submitted event on init
- [ ] On event, immediately calls processReviewStatus with PR data
- [ ] Falls back to polling if webhook missed or delayed
- [ ] Deduplicates webhook + poll (don't double-process same review)
- [ ] Logs whether detection was webhook or poll

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
