# Phase 1: Add error budget auto-freeze to AutoModeService

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

ErrorBudgetService already tracks budget burn. Add error_budget:exhausted event emitted when burn rate exceeds threshold (default 1.0 = 100% consumed). AutoModeService listens and pauses new feature pickup (keeps running agents alive but does not start new ones). When ErrorBudgetService emits error_budget:recovered (burn drops below 0.8), AutoModeService resumes. Add errorBudgetAutoFreeze to WorkflowSettings (default: true). Add unit tests for: budget exhausted pauses pickup, budget recovered resumes, setting disabled skips freeze.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/error-budget-service.ts`
- [ ] `apps/server/src/services/auto-mode/auto-mode-coordinator.ts`
- [ ] `libs/types/src/workflow-settings.ts`
- [ ] `apps/server/tests/unit/services/error-budget-service.test.ts`

### Verification
- [ ] error_budget:exhausted and error_budget:recovered events emitted
- [ ] AutoModeService pauses pickup on exhausted
- [ ] AutoModeService resumes on recovered
- [ ] errorBudgetAutoFreeze setting controls behavior
- [ ] Unit tests cover freeze/thaw/disabled paths
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
