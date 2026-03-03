# Phase 2: Remove MaintenanceSettings type and GlobalSettings.maintenance field

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Delete MaintenanceSettings and MaintenanceTaskOverride from project-settings.ts. Remove maintenance field from GlobalSettings. Remove applyMaintenanceSettingsOverrides() from AutomationService. Run npm run build:packages.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/project-settings.ts`
- [ ] `libs/types/src/global-settings.ts`
- [ ] `apps/server/src/services/automation-service.ts`

### Verification
- [ ] MaintenanceSettings types deleted
- [ ] GlobalSettings.maintenance field removed
- [ ] npm run build:packages passes
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
