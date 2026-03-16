# Phase 4: Migrate external monitors and Lead Engineer timers

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Migrate GitHubMonitor (30s), DiscordMonitor (30s), and LeadEngineerService (3 timers: 5min world state refresh, 30s supervisor, 2.5min PR merge poll) to use schedulerService.registerInterval(). LeadEngineerService registers per-project timers with project-scoped IDs.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/github-monitor.ts`
- [ ] `apps/server/src/services/discord-monitor.ts`
- [ ] `apps/server/src/services/lead-engineer-service.ts`
- [ ] `apps/server/src/services/scheduler.module.ts`

### Verification
- [ ] All services use schedulerService.registerInterval()
- [ ] LeadEngineer timer IDs are project-scoped
- [ ] Category field distinguishes timer types
- [ ] schedulerService.listAll() shows all timers
- [ ] Existing tests pass

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
