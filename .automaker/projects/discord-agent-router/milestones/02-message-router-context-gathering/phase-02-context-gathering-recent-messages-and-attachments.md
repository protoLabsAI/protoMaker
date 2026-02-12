# Phase 2: Context gathering — recent messages and attachments

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

When routing a message, gather context: (1) Fetch last 10 messages from the same channel for conversational context, (2) Process attachments on the triggering message (images, files) using the existing processAttachment() pattern, (3) Include any referenced message (reply context). Package all context into the DiscordRoutedMessage payload so the agent has full awareness of the conversation.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/discord-bot-service.ts`

### Verification
- [ ] Recent channel messages included in routed payload
- [ ] Image attachments processed and included
- [ ] File attachments processed and included
- [ ] Reply context included when user replies to another message

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
