# Phase 2: Add WIP saturation index to board summary

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Compute WIP/limit ratio per lane (in_progress, review). Add maxInProgress (default: 5) and maxInReview (default: 10) to WorkflowSettings. Add wipSaturation object to get_board_summary response with per-lane ratio and overall saturation score. Flag lanes exceeding 1.0.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/workflow-settings.ts`
- [ ] `apps/server/src/routes/board.ts`
- [ ] `apps/server/tests/unit/routes/board.test.ts`

### Verification
- [ ] maxInProgress and maxInReview added to WorkflowSettings
- [ ] Board summary includes wipSaturation object
- [ ] Per-lane ratios calculated correctly
- [ ] Over-limit lanes flagged
- [ ] Unit tests cover saturation calculation
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
