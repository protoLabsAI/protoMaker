# Phase 4: Add Lead Engineer state transition regression tests

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Regression tests for audit findings: staleDeps with done deps, ESCALATE reachability, concurrent event serialization, nextState null mapping, action executor sequential execution.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/tests/unit/services/lead-engineer-regression.test.ts`

### Verification

- [ ] Test staleDeps rule with done dependencies
- [ ] Test pre-flight failure reaches ESCALATE
- [ ] Test execution gate escalates after 3 rejections
- [ ] Test nextState null with done feature maps to DONE
- [ ] At least 8 test cases
- [ ] npm run test:server passes

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 4 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 5
