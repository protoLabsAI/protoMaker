# Phase 5: Unify concurrency tracking and fix settings and ledger races

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Five fixes: (1) ConcurrencyManager release() underflow guard. (2) Reconciliation checks both runningFeatures AND ConcurrencyManager. (3) Settings updateGlobalSettings write mutex. (4) CompletionDetector awaits loadLedger before subscribing. (5) CompletionDetector dedup rollback on PR failure.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/auto-mode/concurrency-manager.ts`
- [ ] `apps/server/src/services/auto-mode-service.ts`
- [ ] `apps/server/src/services/settings-service.ts`
- [ ] `apps/server/src/services/completion-detector-service.ts`

### Verification

- [ ] ConcurrencyManager release never goes below 0
- [ ] Reconciliation checks both tracking systems
- [ ] Settings writes serialized via Promise chain
- [ ] CompletionDetector awaits ledger before events
- [ ] Dedup key not claimed until after successful PR creation
- [ ] npm run test:server passes

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 5 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 6
