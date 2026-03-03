# Phase 1: Add Run Now, timestamps, stats, and human-readable cron

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

In automations-section.tsx: add cronToHuman() helper, enabled/disabled count summary, lastRunAt/nextRunAt timestamps, executionCount/failureCount per row, and Run Now button calling POST /api/automations/:id/run. Add runAutomation() to api.ts.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/settings-view/automations/automations-section.tsx`
- [ ] `apps/ui/src/lib/api.ts`

### Verification
- [ ] Each row shows last run and next run times in human-readable relative format
- [ ] Run Now button triggers the automation and refreshes the row
- [ ] Header shows N/M automations enabled summary
- [ ] Cron expressions display as human-readable strings
- [ ] npm run build passes

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
