# Phase 1: DM send and receive capability

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

In DiscordBotService, add: (1) sendDM(username, content) method that looks up user by username in the guild and sends a DM, (2) Handle incoming DMs in the MessageCreate handler (message.channel.type === ChannelType.DM), (3) Route incoming DMs through the same user-agent routing map, (4) Add a new MCP tool 'discord_send_dm' so Ava (via MCP) can DM Josh directly. (5) Emit 'discord:dm:received' and 'discord:dm:sent' events.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/discord-bot-service.ts`
- [ ] `packages/mcp-server/plugins/automaker/agents/discord.md`

### Verification
- [ ] sendDM method works by Discord username
- [ ] Incoming DMs routed to assigned agent
- [ ] New MCP tool available for agents to send DMs
- [ ] DM events emitted to server event system

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
