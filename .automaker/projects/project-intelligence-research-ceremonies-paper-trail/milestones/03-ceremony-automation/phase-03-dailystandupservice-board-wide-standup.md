# Phase 3: DailyStandupService — board-wide standup

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create apps/server/src/services/daily-standup-service.ts. Runs on a 15-minute cron. Checks if ceremonies.dailyStandup.enabled is true and if lastRunAt is more than 20 hours ago (or null). If due: gathers all feature status changes across all projects since lastRunAt using the event ledger, runs standup-flow with board-wide context (features completed, features started, features blocked, PRs merged, agents running), saves output as a global standup artifact in data/standups/{date}.json, posts summary to Discord #dev channel, updates ceremonies.dailyStandup.lastRunAt.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/daily-standup-service.ts`
- [ ] `apps/server/src/server.ts`

### Verification
- [ ] DailyStandupService registered in server startup
- [ ] Cron checks every 15 minutes
- [ ] Only fires when enabled=true and 20+ hours since lastRunAt
- [ ] Gathers board-wide feature changes across all projects
- [ ] standup-flow receives board-wide context (not single-project)
- [ ] Output saved to data/standups/{YYYY-MM-DD}.json
- [ ] Discord #dev channel receives standup summary
- [ ] ceremonies.dailyStandup.lastRunAt updated after successful run

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
