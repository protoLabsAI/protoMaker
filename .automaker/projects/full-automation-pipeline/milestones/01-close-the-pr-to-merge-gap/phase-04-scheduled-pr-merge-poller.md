# Phase 4: Scheduled PR merge poller

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add a maintenance task that polls features in 'review' status every 5 minutes. Check merge eligibility via MergeEligibilityService. If eligible (CI passing, no unresolved human threads), auto-merge via githubMergeService. Fallback for webhook-based approach.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/maintenance-tasks.ts`
- [ ] `apps/server/src/services/scheduler-service.ts`

### Verification
- [ ] Polls every 5 minutes
- [ ] Checks merge eligibility
- [ ] Auto-merges eligible PRs
- [ ] Logs all decisions

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
