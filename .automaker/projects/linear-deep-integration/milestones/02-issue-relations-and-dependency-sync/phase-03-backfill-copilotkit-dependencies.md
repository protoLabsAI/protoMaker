# Phase 3: Backfill CopilotKit dependencies

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

One-time endpoint to sync existing Automaker feature dependencies to Linear issue relations for a project.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/linear/sync-dependencies.ts`
- [ ] `apps/server/src/routes/linear/index.ts`

### Verification
- [ ] POST /api/linear/sync-dependencies endpoint works
- [ ] Creates blocks relations in Linear
- [ ] Reports summary: created, skipped, errors

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
