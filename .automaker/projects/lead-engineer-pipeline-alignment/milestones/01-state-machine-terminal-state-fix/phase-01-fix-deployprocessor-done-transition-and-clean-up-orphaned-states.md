# Phase 1: Fix DeployProcessor DONE transition and clean up orphaned states

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Fix three interconnected issues in the state machine terminal state:

1. **DeployProcessor return value** (`lead-engineer-deploy-processor.ts:77-81`): Change `nextState: null` to `nextState: 'DONE'` and `shouldContinue: false`. The state machine in `lead-engineer-state-machine.ts` already handles `shouldContinue: false` as terminal — it just needs the correct final state.

2. **Remove VERIFY from FeatureState enum** (`libs/types/src/lead-engineer.ts:318`): VERIFY has no processor registered in the state machine processor map. If a feature ever entered VERIFY, it would fall through to ESCALATE. Remove it from the enum and check all consumers.

3. **Remove legacy 'verified' status reference** (`lead-engineer-deploy-processor.ts:45`): The condition `fresh.status !== 'verified'` references a status outside the canonical 5-status system. Remove this check — only 'done' matters.

4. **Verify DONE handling**: Ensure `LeadEngineerService.process()` correctly identifies `finalState === 'DONE'` as success and sets `outcome: 'completed'`. Check `lead-engineer-service.ts` around line 522-527 for the outcome check.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/lead-engineer-deploy-processor.ts`
- [ ] `apps/server/src/services/lead-engineer-state-machine.ts`
- [ ] `libs/types/src/lead-engineer.ts`

### Verification

- [ ] DeployProcessor.process() returns nextState DONE with shouldContinue false
- [ ] FeatureState enum does not contain VERIFY
- [ ] No references to verified status in any lead engineer processor
- [ ] LeadEngineerService.process() sets outcome to completed when finalState is DONE
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
