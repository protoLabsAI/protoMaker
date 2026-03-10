# Phase 1: Implement error budget tracker with auto-pause

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create ErrorBudgetService that tracks: total PRs merged and PRs that failed CI post-merge (change fail rate) over a rolling window. Add `errorBudgetWindow` (default: 7 days), `errorBudgetThreshold` (default: 0.2 = 20% fail rate) to WorkflowSettings. When fail rate exceeds threshold: auto-mode only picks up features tagged as bug-fix. Add a LeadEngineerRule `errorBudgetExhausted` that enforces this. Persist budget state to `.automaker/metrics/error-budget.json`.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/error-budget-service.ts`
- [ ] `apps/server/src/services/lead-engineer-rules.ts`
- [ ] `apps/server/src/services/lead-engineer-types.ts`
- [ ] `libs/types/src/global-settings.ts`
- [ ] `apps/server/src/server/services.ts`

### Verification
- [ ] Change fail rate tracked over rolling window
- [ ] Auto-mode restricts to bug fixes when budget exhausted
- [ ] Budget state persisted to disk
- [ ] Thresholds configurable in WorkflowSettings
- [ ] npm run build:server passes
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
