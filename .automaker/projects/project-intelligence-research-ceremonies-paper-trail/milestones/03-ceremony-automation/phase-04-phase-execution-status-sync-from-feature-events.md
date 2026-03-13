# Phase 4: Phase execution status sync from feature events

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add a feature:status-changed event listener in ProjectService that finds the project and phase linked to the changed feature (via phase.featureId) and updates phase.executionStatus to mirror the feature status: backlog→pending, in_progress→in-progress, review→in-review, done→completed, blocked→blocked. Write the updated project.json to disk and emit project:updated via CRDT sync.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/project-service.ts`

### Verification
- [ ] feature:status-changed triggers phase executionStatus update
- [ ] Status mapping is correct (backlog→pending, in_progress→in-progress, done→completed, blocked→blocked)
- [ ] project.json written to disk after update
- [ ] CRDT sync emitted so peer instances see the update
- [ ] No-op when feature is not linked to any project phase

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
