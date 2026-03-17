# Phase 1: Delete dead maintenance check modules

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Delete 5 unregistered maintenance check module files from services/maintenance/checks/: DanglingDependencyCheck, EpicCompletionCheck, MemoryPressureCheck, OrphanedWorktreeCheck, StalePRCheck. Verify each has zero non-test importers before deletion. Keep DataIntegrityCheck and StuckFeatureCheck ONLY if they are imported somewhere — otherwise delete them too. Remove any barrel exports (index.ts) that reference deleted files.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/maintenance/checks/dangling-dependency-check.ts`
- [ ] `apps/server/src/services/maintenance/checks/epic-completion-check.ts`
- [ ] `apps/server/src/services/maintenance/checks/memory-pressure-check.ts`
- [ ] `apps/server/src/services/maintenance/checks/orphaned-worktree-check.ts`
- [ ] `apps/server/src/services/maintenance/checks/stale-pr-check.ts`
- [ ] `apps/server/src/services/maintenance/checks/data-integrity-check.ts`
- [ ] `apps/server/src/services/maintenance/checks/stuck-feature-check.ts`

### Verification
- [ ] All dead check module files deleted
- [ ] No broken imports remain (typecheck passes)
- [ ] No test files reference deleted modules (or tests updated)
- [ ] Zero importers verified before each deletion
- [ ] Server tests pass

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
