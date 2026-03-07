# Phase 1: Record failed and escalated features in ledger

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update LedgerService to also write entries when features reach terminal failure states: blocked (with failureCount >= maxRetries), or when manually moved to done after being stuck. Add a new ledger entry type field: 'completed' | 'escalated' | 'abandoned'. For escalated entries, include: failureCount, statusChangeReason, escalationReason, lastTraceId. Subscribe to escalation:signal-received events in addition to the existing completion events. Update the ledger entry type in libs/types/ to include the new fields.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/ledger-service.ts`
- [ ] `libs/types/src/ledger.ts`
- [ ] `apps/server/src/server/wiring.ts`

### Verification
- [ ] Ledger records entries for escalated features with type: 'escalated'
- [ ] Escalated entries include failureCount, statusChangeReason, escalationReason
- [ ] Ledger records entries for abandoned features with type: 'abandoned'
- [ ] Completed features continue to work as before with type: 'completed'
- [ ] M1 ledger tests updated to verify new entry types
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
