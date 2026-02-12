# Phase 2: Tests and validation

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add unit tests for CeremonyService: test milestone update generation, test retro content generation (mock simpleQuery), test message splitting at 2000 chars, test config loading (enabled/disabled), test channel override. Add integration test that verifies ceremony events fire when milestones complete. Run full test suite to ensure no regressions.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/tests/unit/ceremony-service.test.ts`

### Verification
- [ ] Unit tests for milestone update generation pass
- [ ] Unit tests for retro generation pass
- [ ] Message splitting test passes
- [ ] Config toggle test (enabled/disabled) passes
- [ ] npm run test:server passes
- [ ] npm run test:all passes

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
