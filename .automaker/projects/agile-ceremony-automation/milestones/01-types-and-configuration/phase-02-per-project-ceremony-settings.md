# Phase 2: Per-project ceremony settings

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add CeremonySettings interface to settings.ts with: enabled (boolean), discordChannelId (string, override), enableMilestoneUpdates (boolean), enableProjectRetros (boolean), retroModel (PhaseModelEntry, which LLM for retros). Add ceremonySettings field to ProjectSettings. Add DEFAULT_CEREMONY_SETTINGS constant. Add ceremonyModel to PhaseModelConfig for global default.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/settings.ts`

### Verification
- [ ] CeremonySettings interface exists with all fields
- [ ] ProjectSettings has ceremonySettings optional field
- [ ] DEFAULT_CEREMONY_SETTINGS constant exists
- [ ] PhaseModelConfig has ceremonyModel field
- [ ] npm run build:packages succeeds

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
