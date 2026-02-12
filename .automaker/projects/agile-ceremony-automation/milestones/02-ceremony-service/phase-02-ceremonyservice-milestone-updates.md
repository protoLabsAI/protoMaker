# Phase 2: CeremonyService — milestone updates

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create apps/server/src/services/ceremony-service.ts. Subscribe to milestone:completed events. Load ceremony config from project settings. If ceremonies enabled, generate milestone update content from template: project title, milestone N/total, features shipped (title + PR link), cost, duration, blockers, what's next. Post to Discord via integration event (integration:discord) targeting configured channel. Split messages if >2000 chars. Replace the existing one-liner in IntegrationService.handleMilestoneCompleted with a delegation to CeremonyService (if ceremonies enabled, let CeremonyService handle it; otherwise keep the one-liner).

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/ceremony-service.ts`
- [ ] `apps/server/src/services/integration-service.ts`

### Verification
- [ ] CeremonyService class exists with handleMilestoneCompleted method
- [ ] Milestone update includes features shipped, cost, duration, next milestone
- [ ] Messages split at 2000 char boundary
- [ ] IntegrationService delegates to CeremonyService when ceremonies enabled
- [ ] Falls back to one-liner when ceremonies disabled

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
