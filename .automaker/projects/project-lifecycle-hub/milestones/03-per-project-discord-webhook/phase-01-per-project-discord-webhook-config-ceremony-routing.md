# Phase 1: Per-project Discord webhook config + ceremony routing

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

TDD phase. Add discordWebhookUrl?: string to the project ceremonySettings in libs/types. Write tests for: (1) CeremonyService reads discordWebhookUrl from project settings and posts ceremony output via HTTP webhook instead of bot channel ID when set. (2) Falls back to global Discord config when webhookUrl is absent. Implement webhook HTTP posting (simple fetch POST to the webhook URL). Update settings schema. Write a unit test that mocks fetch and asserts the webhook receives the ceremony payload when configured.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/global-settings.ts`
- [ ] `apps/server/src/services/ceremony-service.ts`
- [ ] `apps/server/tests/unit/services/ceremony-webhook.test.ts`

### Verification
- [ ] discordWebhookUrl field added to project ceremonySettings type
- [ ] When discordWebhookUrl is set, ceremony output is POSTed to the webhook URL
- [ ] When discordWebhookUrl is absent, falls back to global Discord bot channel
- [ ] Unit tests verify both routing paths with mocked fetch
- [ ] Build passes

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
