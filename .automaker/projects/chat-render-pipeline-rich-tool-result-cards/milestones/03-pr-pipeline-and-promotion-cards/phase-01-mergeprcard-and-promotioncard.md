# Phase 1: MergePRCard and PromotionCard

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create MergePRCard for merge_pr — shows PR number, title, merge status (success/failed), target branch, and merge commit hash. Create PromotionCard for promote_to_staging — shows promotion status, source/target branches, commit count, and any conflicts. Register both.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/ui/src/ai/tool-results/merge-pr-card.tsx`
- [ ] `libs/ui/src/ai/tool-results/promotion-card.tsx`
- [ ] `libs/ui/src/ai/tool-invocation-part.tsx`

### Verification

- [ ] MergePRCard shows PR merge status with number, title, branch, commit hash
- [ ] PromotionCard shows promotion status with branch info and commit count
- [ ] Both handle error states (merge failed, conflicts)
- [ ] Both registered in tool-invocation-part.tsx
- [ ] Build passes

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
