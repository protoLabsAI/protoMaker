# Phase 3: Replace stub DiscordService in EventHookService

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

EventHookService at apps/server/src/services/event-hook-service.ts also uses the stub DiscordService for executeDiscordHook() (line 649). This needs to use DiscordBotService for user-configurable Discord hooks to actually work.

Changes:
1. apps/server/src/services/event-hook-service.ts — Accept DiscordBotService instead of (or in addition to) DiscordService. Update executeDiscordHook() to use discordBotService.sendToChannel().
2. apps/server/src/index.ts — Wire discordBotService to EventHookService.

This is the same pattern as the AvaGateway fix — both services need the real Discord client.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/event-hook-service.ts`
- [ ] `apps/server/src/index.ts`

### Verification
- [ ] EventHookService uses DiscordBotService for Discord hooks
- [ ] User-configurable Discord hooks actually send messages
- [ ] npm run build:server passes

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
