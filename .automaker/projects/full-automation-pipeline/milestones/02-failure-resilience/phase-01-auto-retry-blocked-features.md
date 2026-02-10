# Phase 1: Auto-retry blocked features

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Extend ReconciliationService to detect features in 'blocked' status that have transient errors (API quota, network, timeout). Auto-reset to 'backlog' after 5-minute cooldown. Increment retry count and auto-escalate to opus model after 2nd failure. Max 3 retries per feature.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/reconciliation-service.ts`
- [ ] `apps/server/src/services/auto-mode-service.ts`

### Verification
- [ ] Transient failures auto-retry
- [ ] Escalates to opus after 2 failures
- [ ] Max 3 retries respected
- [ ] Non-transient errors stay blocked

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
