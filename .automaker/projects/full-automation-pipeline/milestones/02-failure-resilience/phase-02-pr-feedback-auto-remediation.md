# Phase 2: PR feedback auto-remediation

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

When PRFeedbackService detects pr:changes-requested, auto-restart the dev agent with the review feedback injected into its continuation prompt. Agent sees exactly what needs fixing. Push new commits to the same PR.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/pr-feedback-service.ts`
- [ ] `apps/server/src/services/auto-mode-service.ts`

### Verification
- [ ] Review feedback triggers agent restart
- [ ] Agent receives feedback context
- [ ] New commits pushed to same PR
- [ ] Prevents infinite feedback loops (max 2 rounds)

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
