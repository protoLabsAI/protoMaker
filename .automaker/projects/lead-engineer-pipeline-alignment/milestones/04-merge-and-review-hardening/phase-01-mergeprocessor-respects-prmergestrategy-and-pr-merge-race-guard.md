# Phase 1: MergeProcessor respects prMergeStrategy and PR merge race guard

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

M3: At lead-engineer-review-merge-processors.ts:452, the merge command is hardcoded as gh pr merge with --squash. The prMergeStrategy setting exists in libs/types/src/git-settings.ts:34-35 and git-workflow-service.ts already reads it. MergeProcessor should do the same.

Fix: Read prMergeStrategy from workflow settings. Map strategy to gh flag: squash to --squash, merge to --merge, rebase to --rebase. IMPORTANT: Promotion PRs (base is staging or main) must ALWAYS use --merge regardless of setting. Default to --squash when setting is absent.

M5: Both PRMergePoller (lead-engineer-service.ts:619-671) and ReviewProcessor (review-merge-processors.ts:88-110) detect merged PRs independently, creating duplicate events.

Fix: In PRMergePoller, before processing a merged PR, check if the feature status is already done. Skip processing with debug-level log if already handled.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/lead-engineer-review-merge-processors.ts`
- [ ] `apps/server/src/services/lead-engineer-service.ts`

### Verification

- [ ] MergeProcessor reads prMergeStrategy from workflow settings
- [ ] Feature PRs use configured strategy (squash, merge, or rebase)
- [ ] Promotion PRs always use --merge regardless of setting
- [ ] PRMergePoller skips features already in done status
- [ ] No duplicate feature:pr-merged events for the same PR
- [ ] npm run typecheck passes
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
