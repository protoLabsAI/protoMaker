# Phase 1: Auto-emit feature:status-changed from featureLoader.update()

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update featureLoader.update() in feature-loader.ts to automatically emit feature:status-changed event when updates.status differs from feature.status. The event payload should include: featureId, projectPath, oldStatus, newStatus, reason (from updates.statusChangeReason or 'status updated'). Add a skipEventEmission option to update() for cases where the caller needs to suppress (e.g., batch operations). Inject EventEmitter into FeatureLoader via constructor or setter. Remove manual feature:status-changed emissions from: feature-state-manager.ts, feature-scheduler.ts, reconciliation-service.ts, and the feature update route. Add tests proving the event fires exactly once per status change.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/feature-loader.ts`
- [ ] `apps/server/src/services/feature-state-manager.ts`
- [ ] `apps/server/src/services/feature-scheduler.ts`
- [ ] `apps/server/src/services/reconciliation-service.ts`
- [ ] `apps/server/src/routes/features/index.ts`
- [ ] `apps/server/src/server/wiring.ts`
- [ ] `apps/server/tests/unit/services/feature-loader-events.test.ts`

### Verification
- [ ] featureLoader.update() auto-emits feature:status-changed when status changes
- [ ] Event includes featureId, projectPath, oldStatus, newStatus, reason
- [ ] Event fires exactly once per status change (no double-fires)
- [ ] skipEventEmission option suppresses emission when needed
- [ ] Manual feature:status-changed emissions removed from callers
- [ ] All downstream listeners (CompletionDetector, LedgerService, EventLedger) fire correctly
- [ ] M1 event emission tests updated and pass
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
