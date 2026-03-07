# Phase 2: Per-project Discord webhook settings UI

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add a Discord webhook URL input field to the project settings panel. When saved, it persists to .automaker/settings.json under ceremonySettings.discordWebhookUrl via a PATCH to the existing project settings API. Include a 'Test webhook' button that posts a test message. Write a Vitest test for the webhook URL validation logic (must be a valid Discord webhook URL pattern: https://discord.com/api/webhooks/...).

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/projects/project-settings-panel.tsx`
- [ ] `apps/ui/tests/unit/webhook-settings.test.tsx`

### Verification
- [ ] Discord webhook URL input visible in project settings panel
- [ ] URL validated against Discord webhook pattern before save
- [ ] Test webhook button posts a test message and shows success/failure
- [ ] Persists via existing project settings PATCH endpoint
- [ ] Vitest test covers URL validation logic
- [ ] Build passes

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
