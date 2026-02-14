# Phase 1: Build structured feedback triage

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create buildThreadFeedbackPrompt that parses review into per-thread items with threadId, severity, message, location, and suggested fix

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/pr-feedback-service.ts`

### Verification
- [ ] Fetches review threads via GraphQL reviewThreads query
- [ ] Maps threads to structured feedback items with ID, severity, category, location
- [ ] Groups CodeRabbit threads separately from human threads
- [ ] Returns markdown prompt with numbered feedback items
- [ ] Each item has clear Accept/Deny decision instruction

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
