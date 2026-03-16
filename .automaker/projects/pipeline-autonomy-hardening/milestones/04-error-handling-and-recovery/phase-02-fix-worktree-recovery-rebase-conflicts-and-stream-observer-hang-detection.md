# Phase 2: Fix worktree recovery rebase conflicts and stream observer hang detection

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Two fixes: (1) WorktreeRecoveryService creates PRs with known rebase conflicts. Surface failure so caller blocks feature. Fix recovery base branch fallback to dev. (2) StreamObserver misses complete hangs. Add detection case for no text AND no tools.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/worktree-recovery-service.ts`
- [ ] `apps/server/src/services/stream-observer-service.ts`
- [ ] `apps/server/src/services/auto-mode/execution-service.ts`

### Verification

- [ ] Recovery result includes rebaseConflict flag
- [ ] Caller blocks feature when rebase conflicts detected
- [ ] Recovery base branch defaults to dev
- [ ] StreamObserver detects complete hang
- [ ] npm run test:server passes

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
