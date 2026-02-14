# Phase 3: End-to-end flow validation

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Test complete remediation loop from feedback arrival to thread resolution to CI pass

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/pr-feedback-service.ts`

### Verification
- [ ] Create test PR with CodeRabbit feedback → verify auto-remediation triggers
- [ ] Verify agent sees previous context on restart
- [ ] Verify accepted threads auto-resolve, denied threads get comment
- [ ] Verify CI failure triggers another cycle
- [ ] Verify state persists across server restart
- [ ] Verify max iterations escalates correctly
- [ ] All events fire in correct order

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
