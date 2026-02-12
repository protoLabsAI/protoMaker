# Phase 2: User-agent mapping configuration

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Extend DiscordIntegrationConfig in libs/types/src/settings.ts with a userRouting field: Record<string, { agentType: string, enabled: boolean }>. Keys are Discord usernames (e.g., 'chukz'), values specify which agent handles their messages. Add DEFAULT values. Example: { 'chukz': { agentType: 'ava', enabled: true }, 'abdelly': { agentType: 'gtm', enabled: false } }.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/settings.ts`

### Verification
- [ ] userRouting field added to DiscordIntegrationConfig
- [ ] Default mapping includes chukz->ava
- [ ] Types compile

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
