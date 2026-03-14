# Phase 3: Refactor ProjectService — remove Automerge.Doc in-memory usage

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Replace Automerge.Doc<ProjectsDoc> in-memory cache in project-service.ts with a plain Map<string, Record<string, Project>>. The disk path is already the source of truth. This removes the last @automerge/automerge import from apps/server/src/.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/project-service.ts`

### Verification
- [ ] No @automerge imports in project-service.ts
- [ ] Project CRUD operations still work correctly
- [ ] TypeScript compiles with no errors

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 3 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 4
