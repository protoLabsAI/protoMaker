# Phase 4: Post denial comments for rejected feedback

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

For threads marked 'denied', post a comment via GitHub API with agent's reasoning

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/pr-feedback-service.ts`

### Verification
- [ ] For each denied thread, post reply comment via gh pr comment or GraphQL
- [ ] Comment format: Agent evaluated this feedback and declined because: {reasoning}
- [ ] Update feature.threadFeedback status to 'denied' with timestamp
- [ ] Does NOT resolve the thread (leaves it open for human to see)
- [ ] Emits pr:thread-evaluated event per denial

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
