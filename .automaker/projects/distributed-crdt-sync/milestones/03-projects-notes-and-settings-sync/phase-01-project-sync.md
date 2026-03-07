# Phase 1: Project Sync

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create Automerge document for projects (Record<slug, Project>). ProjectService reads/writes via CRDTStore. Project ceremonies (future) will sync as project sub-documents. PRD and milestone markdown content stored as Automerge text fields for future rich-text CRDT.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/project-service.ts`
- [ ] `apps/server/src/services/crdt-sync-service.ts`
- [ ] `libs/crdt/src/documents.ts`

### Verification
- [ ] Projects document syncs across instances
- [ ] Project created on instance A visible on instance B
- [ ] Project updates (status, milestones) propagate in real-time
- [ ] Backward compatible: works without CRDT (falls back to filesystem)

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
