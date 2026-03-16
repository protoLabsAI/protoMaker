# Phase 2: Fix state machine null nextState and DONE terminal handling

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Two bugs: (1) Processor returning nextState:null from REVIEW maps to blocked even when feature is done. Check actual feature status. (2) No DONE terminal guard - if shouldContinue true with DONE it looks up nonexistent processor. Add explicit DONE check. Also call exit() on interrupted processor before ESCALATE on max transitions.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/lead-engineer-state-machine.ts`
- [ ] `apps/server/tests/unit/services/lead-engineer-service.test.ts`

### Verification

- [ ] nextState null with done feature maps to DONE finalState
- [ ] DONE handled as terminal before processor lookup
- [ ] Max transitions calls exit on interrupted processor
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
