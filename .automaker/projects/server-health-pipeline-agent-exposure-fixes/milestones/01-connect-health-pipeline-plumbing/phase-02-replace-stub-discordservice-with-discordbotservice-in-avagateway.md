# Phase 2: Replace stub DiscordService with DiscordBotService in AvaGateway

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

AvaGatewayService at apps/server/src/services/ava-gateway-service.ts is constructed with DiscordService (the stub from discord-service.ts where every method throws 'not yet implemented'). It should use DiscordBotService (the working Discord.js client at discord-bot-service.ts with sendToChannel() at line 1905).

Changes needed:
1. apps/server/src/services/ava-gateway-service.ts — Change constructor to accept DiscordBotService instead of DiscordService. Update postToDiscord() to use discordBotService.sendToChannel(channelId, message). Update postStartupMessage() and sendEmergencyStopAlert() similarly.
2. apps/server/src/index.ts — Pass discordBotService to getAvaGatewayService() instead of discordService (line 354). The discordBotService is created at line 473.
3. apps/server/src/index.ts — Call avaGatewayService.start() after initialization (currently only .initialize() is called at line 531 but .start() which begins event listening is never called).
4. Set the infra channel ID to '1469109809939742814'.

Note: discordBotService is created AFTER avaGatewayService in index.ts (line 473 vs 351). Either reorder initialization or use a setter method like setDiscordBot(discordBotService) called after both are created.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/ava-gateway-service.ts`
- [ ] `apps/server/src/index.ts`

### Verification
- [ ] AvaGateway uses DiscordBotService.sendToChannel() for all Discord posting
- [ ] Startup message appears in Discord #infra when server starts
- [ ] avaGatewayService.start() is called in index.ts
- [ ] Infra channel ID 1469109809939742814 is configured
- [ ] npm run build:server passes

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
