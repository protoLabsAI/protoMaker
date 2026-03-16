# Phase 2: Add stream-observer-service unit tests

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

stream-observer-service.ts is 248 lines with zero tests. Cover: loop detection, stall detection, complete hang detection, excluded tools, hash collision resistance.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/tests/unit/services/stream-observer-service.test.ts`

### Verification

- [ ] Tests cover loop detection with repeated tool calls
- [ ] Tests cover stall and complete hang detection
- [ ] Tests verify excluded tools dont trigger detection
- [ ] At least 10 test cases
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
