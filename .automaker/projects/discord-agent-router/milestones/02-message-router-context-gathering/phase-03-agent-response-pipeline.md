# Phase 3: Agent response pipeline

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create the response flow: (1) Agent handler receives 'discord:user-message:routed' event, (2) Processes via simpleQuery or a dedicated agent conversation, (3) Sends response back via DiscordBotService.sendToChannel(). For Ava, this means receiving the routed message, understanding it in context, and responding. Create a new AgentDiscordRouter service that manages agent-to-Discord response mapping. Handle message splitting for long responses (>2000 chars). Create threads for complex conversations (>3 back-and-forth exchanges in 5 minutes).

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/discord-bot-service.ts`
- [ ] `apps/server/src/services/agent-discord-router.ts`

### Verification
- [ ] Agent receives routed message and processes it
- [ ] Response posted to same channel
- [ ] Long responses split at 2000 char boundary
- [ ] Thread creation for extended conversations
- [ ] Error handling — agent failure doesn't crash the bot

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
