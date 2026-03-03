# Phase 1: Delete MaintenanceSection UI and scheduler backend routes

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Delete maintenance/ UI directory. Delete apps/server/src/routes/scheduler/ directory. Remove maintenance from navigation.ts, settings-view.tsx, use-settings-view.ts, and routes.ts.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/settings-view/maintenance/maintenance-section.tsx`
- [ ] `apps/ui/src/components/views/settings-view/config/navigation.ts`
- [ ] `apps/ui/src/components/views/settings-view.tsx`
- [ ] `apps/ui/src/components/views/settings-view/hooks/use-settings-view.ts`
- [ ] `apps/server/src/server/routes.ts`
- [ ] `apps/server/src/routes/scheduler/index.ts`

### Verification
- [ ] Settings nav has no Maintenance item
- [ ] /api/scheduler/* routes return 404
- [ ] npm run build passes
- [ ] npm run typecheck passes

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
