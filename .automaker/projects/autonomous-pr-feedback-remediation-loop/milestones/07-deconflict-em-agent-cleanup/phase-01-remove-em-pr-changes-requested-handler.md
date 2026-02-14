# Phase 1: Remove EM pr:changes-requested handler

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Delete handleChangesRequested from em-agent.ts and remove subscription, let PRFeedbackService own feedback loop

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/authority-agents/em-agent.ts`

### Verification
- [ ] handleChangesRequested method deleted
- [ ] pr:changes-requested subscription removed from listenForPRFeedback
- [ ] EM agent still handles pr:approved for auto-merge
- [ ] No functionality broken (test merge-on-approval still works)
- [ ] No race condition with PRFeedbackService

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
