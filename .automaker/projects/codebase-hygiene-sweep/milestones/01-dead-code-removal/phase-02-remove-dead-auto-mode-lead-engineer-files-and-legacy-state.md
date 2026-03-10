# Phase 2: Remove dead auto-mode lead-engineer files and legacy state

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Delete 4 dead files in auto-mode/: lead-engineer-service.ts, lead-engineer-state-machine.ts, lead-engineer-verify-processor.ts, lead-engineer-rules.ts (~475 lines, zero external imports). Remove dead legacy global state from auto-mode-service.ts: getWorktreeAutoLoopKey(), ProjectAutoLoopState, consecutiveFailures, pausedDueToFailures, config, trackFailureAndCheckPause(), signalShouldPause(), CONSECUTIVE_FAILURE_THRESHOLD (~60 lines).

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/auto-mode/lead-engineer-service.ts`
- [ ] `apps/server/src/services/auto-mode/lead-engineer-state-machine.ts`
- [ ] `apps/server/src/services/auto-mode/lead-engineer-verify-processor.ts`
- [ ] `apps/server/src/services/auto-mode/lead-engineer-rules.ts`
- [ ] `apps/server/src/services/auto-mode-service.ts`

### Verification
- [ ] 4 dead lead-engineer files deleted
- [ ] Legacy global state removed from auto-mode-service.ts
- [ ] npm run build:server passes
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
