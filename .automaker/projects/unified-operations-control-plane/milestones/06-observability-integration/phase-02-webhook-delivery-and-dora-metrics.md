# Phase 2: Webhook delivery and DORA metrics

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Trace webhook deliveries in Langfuse. Add DORAMetricsService calculating deployment frequency, lead time, change failure rate, time to restore. Surface on Ops Dashboard. Weekly DORA calendar events.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/ops-tracing-service.ts`
- [ ] `apps/server/src/services/dora-metrics-service.ts`
- [ ] `apps/server/src/services/calendar-integration-service.ts`
- [ ] `apps/ui/src/components/views/ops-view/system-health-panel.tsx`

### Verification

- [ ] Webhook deliveries traced in Langfuse
- [ ] DORA metrics calculated from event history
- [ ] DORA displayed on Ops Dashboard
- [ ] Weekly DORA calendar event
- [ ] Graceful degradation without Langfuse
- [ ] Unit tests for DORA calculations

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
