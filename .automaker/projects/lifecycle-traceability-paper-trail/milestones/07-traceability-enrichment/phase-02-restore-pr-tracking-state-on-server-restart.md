# Phase 2: Restore PR tracking state on server restart

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update PRFeedbackService to persist its tracked PR state (this.trackedPRs Map) to disk. On startup, reload from .automaker/pr-tracking.json. Write on every PR state change (add, update status, remove). Include: featureId, prNumber, prUrl, lastCheckedAt, ciStatus, reviewStatus, remediationCount. This ensures PR polling resumes after server restart without manual re-triggering.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/pr-feedback-service.ts`

### Verification
- [ ] PR tracking state persisted to .automaker/pr-tracking.json on every change
- [ ] On startup, tracked PRs reloaded from disk
- [ ] Polling resumes for all previously tracked PRs after restart
- [ ] Stale entries (PR already merged) cleaned up on reload
- [ ] npm run typecheck passes

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
