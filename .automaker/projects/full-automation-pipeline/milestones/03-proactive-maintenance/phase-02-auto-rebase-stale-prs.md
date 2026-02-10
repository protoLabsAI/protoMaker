# Phase 2: Auto-rebase stale PRs

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Detect PRs behind their base branch. Auto-rebase via gt restack (Graphite) or gh pr rebase. If conflicts detected, escalate to human via Discord notification instead of force-pushing.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/maintenance-tasks.ts`
- [ ] `apps/server/src/services/graphite-service.ts`

### Verification
- [ ] Stale PRs auto-rebased
- [ ] Conflicts escalate to Discord
- [ ] Uses Graphite when available

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
