# Phase 1: Discord routing types and event extensions

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add new event types for discord message routing: 'discord:user-message:routed' (when a mapped user's message is sent to an agent), 'discord:agent-response' (when agent produces a response). Add DiscordRoutedMessage interface with fields: userId, username, channelId, guildId, content, attachments, recentContext (recent channel messages). Add to EventType union in libs/types/src/event.ts.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/event.ts`

### Verification
- [ ] New event types added to EventType union
- [ ] DiscordRoutedMessage interface exported
- [ ] Types compile with npm run build:packages

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
