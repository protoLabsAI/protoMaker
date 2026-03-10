# Phase 1: Add autonomy rate metric

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Track feature completions by intervention type: fully_autonomous (no human touchpoints beyond initial creation), assisted (human intervened at least once), manual (human did the work). Calculate autonomy_rate = fully_autonomous / total_completed over a rolling 30-day window. Expose via GET /api/metrics/autonomy. Determine intervention type from feature statusHistory and executionHistory - if only auto-mode transitions and no manual status changes or send_message_to_agent calls, it is fully autonomous.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/metrics-collection-service.ts`
- [ ] `apps/server/src/routes/metrics/index.ts`
- [ ] `apps/server/tests/unit/services/metrics-collection-service.test.ts`

### Verification
- [ ] Autonomy rate calculated from feature history
- [ ] Three intervention types tracked
- [ ] GET /api/metrics/autonomy returns rate and breakdown
- [ ] Unit tests cover classification logic
- [ ] npm run test:server passes

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
