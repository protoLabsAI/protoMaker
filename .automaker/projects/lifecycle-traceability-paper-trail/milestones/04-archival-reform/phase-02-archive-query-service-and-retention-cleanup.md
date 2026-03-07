# Phase 2: Archive query service and retention cleanup

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create ArchiveQueryService at apps/server/src/services/archive-query-service.ts that can: list archived features (with date range filter), load archived feature.json, load archived agent-output.md, search archived features by projectSlug. Add a retention cleanup job that deletes archives older than retentionDays (configurable, default 90 days). Register as a maintenance task in maintenance-tasks.ts. Add REST endpoint GET /api/archive/features for listing and GET /api/archive/features/:id for loading archived feature data.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/archive-query-service.ts`
- [ ] `apps/server/src/services/maintenance-tasks.ts`
- [ ] `apps/server/src/routes/archive/index.ts`
- [ ] `apps/server/src/server/routes.ts`
- [ ] `apps/server/src/server/services.ts`
- [ ] `apps/server/src/server/wiring.ts`

### Verification
- [ ] ArchiveQueryService can list all archived features with metadata
- [ ] ArchiveQueryService can load full archived feature.json
- [ ] ArchiveQueryService can load archived agent-output.md
- [ ] ArchiveQueryService supports projectSlug filter
- [ ] Retention cleanup maintenance task deletes archives older than retentionDays
- [ ] REST endpoints for archive listing and detail
- [ ] npm run typecheck passes

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
