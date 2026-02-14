# Phase 3: Ceremony integration

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Connect CeremonyService to LinearProjectUpdateService. Daily standup creates project update. Milestone completion posts summary.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/ceremony-service.ts`
- [ ] `apps/server/src/services/linear-project-update-service.ts`

### Verification
- [ ] Daily standup generates Linear project update
- [ ] Milestone completion posts summary to Linear
- [ ] Ceremony settings control which updates fire

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
