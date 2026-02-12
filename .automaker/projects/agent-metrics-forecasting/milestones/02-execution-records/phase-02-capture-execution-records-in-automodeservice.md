# Phase 2: Capture execution records in AutoModeService

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Record start time and model when agent starts. Capture completedAt, duration, cost, tokens from SDK result on completion. Push ExecutionRecord for both success and error_max_turns. Persist to feature.json via executionHistory.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/auto-mode-service.ts`

### Verification
- [ ] ExecutionRecord created at agent start
- [ ] Record updated with duration, cost, tokens on completion
- [ ] Both success and failure records captured
- [ ] Records persisted in feature.json

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
