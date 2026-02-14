# Phase 2: Stop EM from polluting feature.description

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Remove code that appends review feedback to feature.description permanently in EM agent

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/authority-agents/em-agent.ts`

### Verification
- [ ] Lines 203-214 that append feedback to description are deleted
- [ ] Description stays clean across PR iterations
- [ ] Feedback stored only in feature.lastReviewFeedback and feature.threadFeedback
- [ ] Original feature intent remains clear
- [ ] Test: description doesn't grow after multiple feedback cycles

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
