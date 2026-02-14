# Phase 2: Add per-thread feedback tracking types

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Extend libs/types/src/coderabbit.ts and feature.ts to track individual review threads with agent decisions (accept/deny) and reasoning

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/coderabbit.ts`
- [ ] `libs/types/src/feature.ts`

### Verification
- [ ] ReviewThreadFeedback interface with threadId, status (pending|accepted|denied), agentReasoning, resolvedAt
- [ ] Feature type has threadFeedback array field
- [ ] Feature type has remediationHistory array with timestamps and iteration metadata
- [ ] Types compile and export correctly

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
