# Phase 2: Add per-session event processing queue to Lead Engineer

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Lead Engineer onEvent() processes events without per-session locking. Concurrent events produce conflicting actions. Add a per-session Promise chain that serializes evaluateAndExecute calls. Also whitelist event types instead of blacklisting - exclude all lead-engineer:\* events to prevent cascading loops. Skip rule evaluation when world state refresh fails.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/lead-engineer-service.ts`

### Verification

- [ ] evaluateAndExecute calls for same session are serialized via Promise chain
- [ ] lead-engineer:\* events do not trigger rule evaluation
- [ ] Stale world state from failed refresh does not trigger rule evaluation
- [ ] npm run test:server passes

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 2 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 3
