# Phase 1: GitHub merge/status server routes

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create /api/github/merge-pr and /api/github/check-pr-status routes that wrap GitHubMergeService and MergeEligibilityService. Located in apps/server/src/routes/github/, follow pattern from existing process-coderabbit-feedback endpoint. Parameters: projectPath, prNumber, mergeStrategy (squash/merge/rebase), waitForCI flag. Return: merge result with status or CI check results with conclusion states.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/github/index.ts`
- [ ] `apps/server/src/routes/github/routes/merge-pr.ts (new)`
- [ ] `apps/server/src/routes/github/routes/check-pr-status.ts (new)`

### Verification
- [ ] POST /api/github/merge-pr returns success/failure with merge commit
- [ ] POST /api/github/check-pr-status returns CI results with passing/failing state
- [ ] Routes use execFileAsync for gh CLI calls
- [ ] Error handling for auth failures and PR not found

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
