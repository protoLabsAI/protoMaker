# Phase 2: Add channel-based routing to Discord bot

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Extend DiscordBotService to support channelRouting in settings — map channel IDs to agent types. Add #gtm channel routing. Messages in #gtm go to GTM agent, #dev goes to engineering, #ava-josh goes to Ava. Fall back to userRouting if no channel match.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/discord-bot-service.ts`
- [ ] `libs/types/src/settings.ts`

### Verification
- [ ] channelRouting config in settings type
- [ ] Messages in #gtm channel route to GTM agent
- [ ] Channel routing takes priority over user routing
- [ ] Settings UI can configure channel routing

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
