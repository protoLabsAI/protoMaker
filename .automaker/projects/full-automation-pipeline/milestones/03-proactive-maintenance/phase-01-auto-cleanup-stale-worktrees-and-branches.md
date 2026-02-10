# Phase 1: Auto-cleanup stale worktrees and branches

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Upgrade scheduled stale worktree/branch detection tasks from detect-only to detect-and-fix. For merged branches: auto-run git worktree remove and git branch -D. Safety checks: confirm branch is merged, no uncommitted work, not the current branch.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/maintenance-tasks.ts`

### Verification
- [ ] Merged branch worktrees auto-removed
- [ ] Safety checks prevent data loss
- [ ] Emits cleanup events for audit

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
