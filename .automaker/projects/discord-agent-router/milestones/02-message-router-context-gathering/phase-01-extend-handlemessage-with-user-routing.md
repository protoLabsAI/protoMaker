# Phase 1: Extend handleMessage with user routing

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

In apps/server/src/services/discord-bot-service.ts, extend handleMessage() to: (1) Check if message.author.username is in the userRouting map, (2) If mapped and enabled, gather the message content and attachments, (3) Emit 'discord:user-message:routed' event with full payload, (4) Do NOT break existing !idea and slash command handling — routing should be a fallback after existing handlers. Add debouncing: if a user sends multiple messages within 3 seconds, batch them into one routed event.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/discord-bot-service.ts`

### Verification
- [ ] Messages from mapped users emit routed events
- [ ] Unmapped users are silently ignored
- [ ] Bot messages are ignored
- [ ] Existing !idea and slash commands still work
- [ ] Debouncing prevents spam routing

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
