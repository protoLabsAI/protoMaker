# Phase 2: Add Linux-compatible file watching

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

fs.watch with recursive:true is a no-op on Linux. Replace with chokidar or implement a polling fallback for the staging server. Only affects the agent manifest watcher, not the entire codebase.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/agent-manifest-service.ts`
- [ ] `apps/server/package.json`

### Verification
- [ ] Manifest cache invalidates on file changes on Linux
- [ ] No regression on macOS
- [ ] Watcher properly cleaned up on dispose()

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
