# Phase 2: Post-Execution Goal Verification

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add semantic verification step to DeployProcessor after typecheck passes. Run a lightweight haiku LLM call that evaluates whether the feature's acceptance criteria (from structured plan or feature description) were satisfied by the actual code changes (git diff of the merged PR). Fire-and-forget pattern matching existing reflection generation. If criteria are unmet, create follow-up features on the board with specific gap descriptions rather than blocking the merge. Store verification result in trajectory for the learning flywheel.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/lead-engineer-deploy-processor.ts`
- [ ] `libs/types/src/lead-engineer.ts`

### Verification

- [ ] DeployProcessor runs goal verification after typecheck succeeds
- [ ] Verification uses haiku model via simpleQuery (fire-and-forget, non-blocking)
- [ ] Verification prompt includes acceptance criteria + git diff of merged changes
- [ ] Unmet criteria generate follow-up features on the board with gap descriptions
- [ ] Verification result stored in trajectory (GoalVerificationResult type)
- [ ] Skipped gracefully when no acceptance criteria available
- [ ] Does not block merge or DONE transition — advisory only
- [ ] npm run typecheck succeeds

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
