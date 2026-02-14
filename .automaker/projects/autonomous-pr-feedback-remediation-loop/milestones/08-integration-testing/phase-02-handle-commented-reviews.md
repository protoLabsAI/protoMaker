# Phase 2: Handle COMMENTED reviews

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Analyze COMMENTED review decision to detect actionable CodeRabbit walk-throughs vs non-actionable comments

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/pr-feedback-service.ts`

### Verification
- [ ] For COMMENTED reviews, parse comments to check for CodeRabbit suggestions
- [ ] If CodeRabbit comment has severity markers, treat as actionable
- [ ] If just walk-through summary with no suggestions, log and skip
- [ ] Human COMMENTED reviews analyzed for keywords (should, must, needs) to detect actionability
- [ ] Only trigger remediation if actionable items found

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
