# Phase 2: Fix CompletionDetectorService milestone cascade

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Review and fix CompletionDetectorService.checkMilestoneCompletion() to correctly use milestoneSlug from features. Verify that when all features with a given milestoneSlug reach done status, the milestone is marked completed in project.json and milestone:completed event is emitted. Verify the cascade continues: milestone:completed → checkProjectCompletion → project:completed → ceremony triggers. Run the full M1 cascade tests — they should now PASS.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/completion-detector-service.ts`

### Verification
- [ ] checkMilestoneCompletion correctly queries features by milestoneSlug
- [ ] Milestone marked completed in project.json when all its features are done
- [ ] milestone:completed event emitted with correct milestoneSlug and projectSlug
- [ ] Project completion cascades when all milestones are done
- [ ] project:completed event emitted triggering ceremony flows
- [ ] M1 cascade tests all pass
- [ ] Backward compatible — features without milestoneSlug are ignored gracefully

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
