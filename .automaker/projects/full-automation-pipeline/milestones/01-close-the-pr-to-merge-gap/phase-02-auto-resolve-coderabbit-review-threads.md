# Phase 2: Auto-resolve CodeRabbit review threads

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create service that calls GitHub GraphQL resolveReviewThread mutation for bot-created review threads. Triggered after CI passes and before auto-merge attempt. Only resolves threads from known bot accounts (coderabbitai, github-actions).

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/coderabbit-resolver-service.ts`
- [ ] `apps/server/src/services/git-workflow-service.ts`

### Verification
- [ ] Bot review threads auto-resolved
- [ ] Human review threads left untouched
- [ ] Runs before merge attempt

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
