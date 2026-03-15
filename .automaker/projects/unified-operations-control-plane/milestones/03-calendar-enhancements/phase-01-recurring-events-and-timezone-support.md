# Phase 1: Recurring events and timezone support

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Extend CalendarEvent with recurrence field (frequency, interval, daysOfWeek, endDate, count) and timezone field (IANA string). CalendarService.listEvents() expands recurring events into instances. JobExecutorService schedules next occurrence after completion. Update routes and MCP tools.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/calendar.ts`
- [ ] `apps/server/src/services/calendar-service.ts`
- [ ] `apps/server/src/services/job-executor-service.ts`
- [ ] `apps/server/src/routes/calendar/index.ts`
- [ ] `packages/mcp-server/src/tools/calendar-tools.ts`

### Verification
- [ ] CalendarEvent includes optional recurrence and timezone
- [ ] listEvents expands recurring events within date range
- [ ] Instance IDs: parentId:date format
- [ ] JobExecutorService creates next occurrence after completion
- [ ] Backward compatible with existing events
- [ ] Unit tests for recurrence expansion and timezone

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
