# Phase 3: DM types and capability interfaces

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add types for Discord DM operations: DiscordDMMessage interface, agent DM send/receive methods. Add 'discord:dm:received' and 'discord:dm:sent' event types. The DM capability should be typed so any agent can send a DM to their assigned human by username lookup.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/event.ts`
- [ ] `libs/types/src/settings.ts`

### Verification
- [ ] DM event types added
- [ ] DiscordDMMessage interface exported
- [ ] DM config in settings (opt-in per user)

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
