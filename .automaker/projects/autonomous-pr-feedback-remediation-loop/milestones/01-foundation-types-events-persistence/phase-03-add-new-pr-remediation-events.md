# Phase 3: Add new PR remediation events

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Extend libs/types/src/event.ts with pr:remediation-started, pr:thread-evaluated, pr:threads-resolved events

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/event.ts`

### Verification
- [ ] AutomakerEventType includes new remediation events
- [ ] Event payload types defined for each new event
- [ ] Events documented with when/why they fire
- [ ] Types compile and export correctly

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
