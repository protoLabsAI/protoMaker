# Phase 3: Fix ExecuteProcessor waitForCompletion race and pre-flight shouldContinue

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Three bugs: (1) executionSettled assigned AFTER event subscription creating race. Use deferred promise pattern. (2) Pre-flight failure returns shouldContinue:false with ESCALATE but ESCALATE never runs. Change to shouldContinue:true. (3) Execution gate failure silently returns to backlog creating infinite loop. Track rejections and escalate after 3.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/lead-engineer-execute-processor.ts`
- [ ] `apps/server/tests/unit/services/lead-engineer-execute-processor.test.ts`

### Verification

- [ ] executionSettled promise created before event subscription
- [ ] Pre-flight failure with shouldContinue:true causes ESCALATE to run
- [ ] Execution gate tracks rejections and escalates after 3
- [ ] npm run test:server passes

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 3 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 4
