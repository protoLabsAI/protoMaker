# Phase 1: Fix ErrorBudgetService event bus wiring

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

ErrorBudgetService (`error-budget-service.ts:59`) extends Node EventEmitter and emits error_budget:exhausted/error_budget:recovered on its own instance. AutoModeCoordinator (`auto-mode-coordinator.ts:33-37`) listens on the shared app event bus. The events never bridge.

Fix: Remove `extends EventEmitter` from ErrorBudgetService. Add a `private events: EventEmitter` constructor parameter. Change `this.emit(...)` calls to `this.events.emit(...)`. Update wiring to pass the shared event bus. Verify AutoModeCoordinator receives events.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/error-budget-service.ts`
- [ ] `apps/server/src/server/wiring.ts`

### Verification

- [ ] ErrorBudgetService no longer extends Node EventEmitter
- [ ] ErrorBudgetService emits error_budget:exhausted on the shared app event bus
- [ ] AutoModeCoordinator.\_handleExhausted fires when error budget is exhausted
- [ ] isPickupFrozen() returns true after error_budget:exhausted
- [ ] npm run typecheck passes
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
