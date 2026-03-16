# Phase 1: Central timeout config module

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create `apps/server/src/config/timeouts.ts` that exports all timeout constants, reading from environment variables with existing values as defaults. Group by domain: execution, polling, networking, cleanup. Update lead-engineer-types.ts, feature-scheduler.ts, and event-hook-service.ts to import from the central module.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/config/timeouts.ts`
- [ ] `apps/server/src/services/lead-engineer-types.ts`
- [ ] `apps/server/src/services/auto-mode/feature-scheduler.ts`
- [ ] `apps/server/src/services/event-hook-service.ts`

### Verification

- [ ] Central timeouts.ts exports all timeout constants grouped by domain
- [ ] Each constant reads from a named env var with the current hardcoded value as default
- [ ] lead-engineer-types.ts imports EXECUTE_TIMEOUT_MS, MERGE_RETRY_DELAY_MS, REVIEW_POLL_DELAY_MS from config
- [ ] feature-scheduler.ts imports sleep interval constants from config
- [ ] event-hook-service.ts imports shell/http timeout from config
- [ ] No behavioral change — all defaults match previous hardcoded values
- [ ] Build and tests pass

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
