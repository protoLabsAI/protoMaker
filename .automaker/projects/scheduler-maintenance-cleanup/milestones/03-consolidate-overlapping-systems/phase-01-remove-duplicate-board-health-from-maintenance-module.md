# Phase 1: Remove duplicate board-health from maintenance module

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Remove the board-health check from maintenance.module.ts (the 6h full-sweep tier). Board health is already handled by automation-service maintenance:stale-features (hourly) and ava-cron-tasks ava-daily-board-health (daily Discord report). The maintenance.module version adds no unique value. Keep the resource-usage check (critical tier) — that one is unique.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/maintenance.module.ts`

### Verification
- [ ] board-health check removed from maintenance.module.ts
- [ ] resource-usage check preserved (critical tier)
- [ ] maintenance:sweep:full still runs but only resource-usage
- [ ] No references to removed check break
- [ ] Server tests pass

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
