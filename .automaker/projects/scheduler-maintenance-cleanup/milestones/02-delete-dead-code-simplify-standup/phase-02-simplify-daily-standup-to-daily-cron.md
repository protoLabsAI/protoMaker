# Phase 2: Simplify daily standup to daily cron

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Change daily-standup:check from polling every 15 minutes (*/15 * * * *) with a 20-hour check to a single daily cron (0 9 * * *). Remove the 'has 20 hours passed since last standup' conditional logic — the cron schedule itself ensures daily cadence. Keep the standup flow execution unchanged.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/daily-standup-service.ts`

### Verification
- [ ] Cron changed from */15 to 0 9 * * * (daily at 9am)
- [ ] 20-hour elapsed check removed
- [ ] Standup flow execution unchanged
- [ ] Server tests pass

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
