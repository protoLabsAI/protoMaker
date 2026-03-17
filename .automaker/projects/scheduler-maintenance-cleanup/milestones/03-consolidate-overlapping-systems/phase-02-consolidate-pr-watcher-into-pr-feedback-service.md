# Phase 2: Consolidate PR watcher into PR feedback service

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Merge pr-watcher-service.ts functionality into pr-feedback-service.ts. Both poll PRs for CI state changes — pr-watcher watches specific PRs for resolution, pr-feedback monitors PR reviews and CI for remediation. Combine into a single PRMonitorService that handles both use cases. Update all importers of PRWatcherService to use the consolidated service. Delete pr-watcher-service.ts.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/pr-feedback-service.ts`
- [ ] `apps/server/src/services/pr-watcher-service.ts`
- [ ] `apps/server/src/server/services.ts`

### Verification
- [ ] pr-watcher-service.ts deleted
- [ ] All PR watching functionality preserved in pr-feedback-service
- [ ] All importers updated
- [ ] Typecheck passes
- [ ] Server tests pass

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
