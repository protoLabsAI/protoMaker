# Phase 4: Fix error classification breadth and merge retry logic

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Three fixes: (1) ExecuteProcessor isFatalInfraFailure patterns too broad. Use specific patterns. (2) MergeProcessor retry matches generic check. Use specific strings. (3) EscalateProcessor double update - combine into single write. Fix phase reporting to use originating state.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/lead-engineer-execute-processor.ts`
- [ ] `apps/server/src/services/lead-engineer-review-merge-processors.ts`
- [ ] `apps/server/src/services/lead-engineer-escalation.ts`

### Verification

- [ ] Fatal infra patterns are specific not generic
- [ ] Merge retry matches specific check failure strings
- [ ] EscalateProcessor uses single featureLoader.update call
- [ ] npm run test:server passes

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
