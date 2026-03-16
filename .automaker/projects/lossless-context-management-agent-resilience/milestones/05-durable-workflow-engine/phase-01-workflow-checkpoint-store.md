# Phase 1: Workflow Checkpoint Store

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

SQLite-backed workflow checkpoint store. Tables: workflow_executions, workflow_steps. CRUD, query by state (find suspended), query by feature. Atomic state transitions with optimistic locking.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/context-engine/src/workflow/checkpoint-store.ts`
- [ ] `libs/context-engine/src/workflow/types.ts`
- [ ] `libs/context-engine/src/store/migrations.ts`

### Verification
- [ ] Workflow state persists to SQLite
- [ ] Atomic transitions with optimistic locking
- [ ] Can query all suspended workflows
- [ ] Can query by feature ID
- [ ] Step history preserved for debugging
- [ ] Checkpoint data includes arbitrary JSON

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
