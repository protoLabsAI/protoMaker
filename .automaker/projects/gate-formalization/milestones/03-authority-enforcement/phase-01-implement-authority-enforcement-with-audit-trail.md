# Phase 1: Implement authority enforcement with audit trail

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Make a decision on authority-service.ts executeAction(): implement real enforcement. When an agent proposes an action above its trust tier's risk threshold: (1) Block the action, (2) Create an approval request in the actionable items queue, (3) Log the denial with full context (agent, action, risk level, trust tier). Add `authorityEnforcement: boolean` to WorkflowSettings (default: false — opt-in, so existing behavior unchanged). When enabled, the policy engine actually blocks rather than just logging. Add unit tests covering: action within trust → approved, action above trust → blocked + approval created, action with pre-approval → auto-approved.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/authority-service.ts`
- [ ] `libs/types/src/global-settings.ts`
- [ ] `apps/server/tests/unit/services/authority-service.test.ts`

### Verification
- [ ] executeAction() performs real enforcement when enabled
- [ ] Blocked actions create approval requests
- [ ] Full audit trail for all policy decisions
- [ ] Opt-in via WorkflowSettings (default off)
- [ ] Unit tests cover approve/block/pre-approve paths
- [ ] npm run build:server passes
- [ ] npm run test:all passes

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
