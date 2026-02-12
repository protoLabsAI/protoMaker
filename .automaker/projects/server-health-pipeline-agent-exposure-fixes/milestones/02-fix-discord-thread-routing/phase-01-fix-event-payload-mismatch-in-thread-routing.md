# Phase 1: Fix event payload mismatch in thread routing

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Two locations in discord-bot-service.ts emit discord:user-message:routed with the WRONG payload shape:

1. handleAgentCommand() at lines 733-746 emits: { projectPath, userId, username, agentId, messages: [...], channelId }
2. Thread handler in messageCreate at lines 873-886 emits same shape.

But agent-discord-router.ts handleRoutedMessage() at line 159 destructures: { channelId, userId, content, username, routedToAgent }

And the DiscordUserMessageRoutedPayload type in libs/types/src/discord.ts lines 195-201 expects: { channelId, userId, username, content, routedToAgent }

Fix: Change BOTH emitters in discord-bot-service.ts to match the existing type:
- Replace agentId → routedToAgent
- Replace messages[0].content → content (extract the string directly)
- Remove projectPath from payload (not in type)

Files:
- apps/server/src/services/discord-bot-service.ts — Fix two event emit payloads

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/discord-bot-service.ts`

### Verification
- [ ] handleAgentCommand emits { channelId, userId, username, content, routedToAgent }
- [ ] Thread handler emits same shape
- [ ] agent-discord-router correctly receives content and routedToAgent
- [ ] npm run build:server passes

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
