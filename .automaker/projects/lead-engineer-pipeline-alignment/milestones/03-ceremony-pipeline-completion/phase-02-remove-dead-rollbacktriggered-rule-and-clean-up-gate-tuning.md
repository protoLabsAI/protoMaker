# Phase 2: Remove dead rollbackTriggered rule and clean up gate-tuning

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

H4: In lead-engineer-rules.ts:546-593, the rollbackTriggered rule listens for feature:health-degraded and health:signal events. Neither event is emitted anywhere. No health monitoring system exists. The rule is dead code.

M7: ceremony-action-executor.ts classifies retro items as gate-tuning (line 44) and emits gate:tuning-signal. The signal is persisted to a file but there is no gate-tuning case in LeadRuleAction or the action executor. The signal is logged and forgotten.

Fix: Remove rollbackTriggered from DEFAULT_RULES array and delete the rule definition. For gate-tuning, remove it from the ActionType union and map those items to improvement-feature instead. Clean up any types referencing removed items.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/lead-engineer-rules.ts`
- [ ] `apps/server/src/services/ceremony-action-executor.ts`
- [ ] `libs/types/src/lead-engineer.ts`

### Verification

- [ ] rollbackTriggered rule removed from DEFAULT_RULES and definition deleted
- [ ] gate-tuning removed from ActionType union in ceremony-action-executor
- [ ] Items formerly classified as gate-tuning are classified as improvement-feature
- [ ] No references to feature:health-degraded remain in lead-engineer-rules.ts
- [ ] DEFAULT_RULES array is valid and all remaining rules have working triggers
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
