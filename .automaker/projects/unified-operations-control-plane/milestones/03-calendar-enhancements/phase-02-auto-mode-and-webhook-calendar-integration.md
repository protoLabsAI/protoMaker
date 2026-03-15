# Phase 2: Auto-mode and webhook calendar integration

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create CalendarIntegrationService listening to operational events. Feature start/complete/PR-merge and auto-mode start/stop create ops-type calendar entries. CeremonyService migrated to use recurring events.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/calendar-integration-service.ts`
- [ ] `libs/types/src/calendar.ts`
- [ ] `apps/server/src/services/ceremony-service.ts`
- [ ] `apps/server/src/server/wiring.ts`

### Verification
- [ ] CalendarIntegrationService listens to feature lifecycle events
- [ ] Ops-type calendar entries created for key events
- [ ] CeremonyService uses recurring events
- [ ] New ops event type added
- [ ] Lightweight with no performance impact
- [ ] Unit tests verify event-to-calendar mapping

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
