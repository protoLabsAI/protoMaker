# Phase 1: Add PR merge poller for features in review

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create a periodic check (every 2-3 minutes) that runs when the Lead Engineer is active. Query all features with status='review' and a prNumber. For each, run gh pr view to check if merged. If merged: update feature to done, set prMergedAt, emit feature:pr-merged event. Integrate into Lead Engineer service tick loop. Add unit tests.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/lead-engineer-service.ts`
- [ ] `apps/server/tests/unit/services/lead-engineer-service.test.ts`

### Verification
- [ ] Features in review with merged PRs auto-transition to done
- [ ] prMergedAt set from GitHub merge timestamp
- [ ] feature:pr-merged event emitted
- [ ] Poller only runs when Lead Engineer is active
- [ ] Handles gh CLI failures gracefully
- [ ] Unit tests cover detect-and-transition
- [ ] npm run test:server passes

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
