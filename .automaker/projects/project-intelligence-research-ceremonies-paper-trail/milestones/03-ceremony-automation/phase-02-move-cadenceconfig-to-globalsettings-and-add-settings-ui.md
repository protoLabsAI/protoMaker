# Phase 2: Move CadenceConfig to GlobalSettings and add settings UI

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Remove cadence field from Project interface (it was never used). Add GlobalCeremoniesConfig (from Milestone 1 types) handling to SettingsService — persist ceremonies.dailyStandup.enabled and ceremonies.dailyStandup.lastRunAt in data/settings.json. Add a Ceremonies section to the Settings page in the UI with a toggle for Daily Standup on/off.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/project.ts`
- [ ] `apps/server/src/services/settings-service.ts`
- [ ] `apps/ui/src/components/views/settings-view/developer-section.tsx`

### Verification
- [ ] cadence field removed from Project interface without breaking existing data reads
- [ ] SettingsService reads/writes ceremonies.dailyStandup from data/settings.json
- [ ] Settings page shows Ceremonies section with Daily Standup toggle
- [ ] Toggle persists via existing settings API

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
