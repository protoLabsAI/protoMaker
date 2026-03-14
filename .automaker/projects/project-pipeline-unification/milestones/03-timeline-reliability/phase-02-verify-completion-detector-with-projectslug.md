# Phase 2: Verify completion detector with projectSlug

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

The completion detector guards on feature.projectSlug && feature.milestoneSlug before checking milestone completion. Verify this works end-to-end now that features have projectSlug. Add a test that creates features with projectSlug, marks them done, and confirms milestone:completed event fires.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/tests/unit/services/completion-detector.test.ts`

### Verification
- [ ] Milestone completion detection fires when all milestone features are done
- [ ] Test covers the full flow: feature done -> milestone:completed event
- [ ] Test verifies projectSlug is required

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
