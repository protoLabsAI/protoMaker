# Phase 3: Auto-resolve accepted threads after push

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

After agent pushes fixes, auto-call codeRabbitResolverService to resolve threads marked as 'accepted'

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/pr-feedback-service.ts`

### Verification
- [ ] After agent completes and pushes, filter threadFeedback for decision=accepted
- [ ] Call codeRabbitResolverService.resolveThreads with accepted threadIds
- [ ] Update feature.threadFeedback status to 'resolved' with timestamp
- [ ] Emit pr:threads-resolved event with count and threadIds
- [ ] Handles GraphQL errors gracefully (log, don't fail entire flow)

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
