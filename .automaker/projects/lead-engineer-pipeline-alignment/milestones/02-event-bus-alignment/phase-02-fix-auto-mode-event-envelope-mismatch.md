# Phase 2: Fix auto-mode event envelope mismatch

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

TypedEventBus (`typed-event-bus.ts:59-63`) wraps ALL auto-mode events in an auto-mode:event envelope. Lead Engineer rules (`lead-engineer-rules.ts:165`) listen for direct events like auto-mode:stopped and auto-mode:idle. The autoModeHealth rule never fires.

Fix: In TypedEventBus emitAutoModeEvent(), after emitting the auto-mode:event envelope, also emit the direct event type. Normalize event naming between TypedEventBus (may use underscores) and rule triggers (use hyphens). Verify autoModeHealth rule evaluates when auto-mode stops with backlog items.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/auto-mode/typed-event-bus.ts`
- [ ] `apps/server/src/services/lead-engineer-rules.ts`

### Verification

- [ ] TypedEventBus emits both auto-mode:event envelope AND direct event type
- [ ] autoModeHealth rule triggers array matches the emitted direct event types
- [ ] autoModeHealth rule evaluates when auto-mode stops with backlog items
- [ ] Existing auto-mode:event envelope subscribers still work
- [ ] npm run typecheck passes
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
