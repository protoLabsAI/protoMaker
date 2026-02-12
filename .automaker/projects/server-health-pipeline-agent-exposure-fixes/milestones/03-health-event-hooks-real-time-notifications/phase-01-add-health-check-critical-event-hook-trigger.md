# Phase 1: Add health_check_critical event hook trigger

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add a new event hook trigger type for health events so users can configure custom notifications.

Changes:
1. libs/types/src/settings.ts — Add 'health_check_critical' to EventHookTrigger type union and EVENT_HOOK_TRIGGER_LABELS
2. apps/server/src/services/event-hook-service.ts — Subscribe to health:check-completed event. When status is 'critical' or 'degraded', trigger the health_check_critical hook.
3. apps/server/src/routes/briefing/routes/digest.ts — Add health_check_critical: 'critical' to TRIGGER_SEVERITY_MAP

This enables users to configure Discord webhooks, shell commands, or HTTP hooks for health events through the settings UI.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/settings.ts`
- [ ] `apps/server/src/services/event-hook-service.ts`
- [ ] `apps/server/src/routes/briefing/routes/digest.ts`

### Verification
- [ ] health_check_critical trigger type exists in EventHookTrigger
- [ ] Critical health events trigger configured hooks
- [ ] Briefing digest includes health events with correct severity
- [ ] Existing hooks continue to work unchanged
- [ ] npm run build:packages && npm run build:server passes

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
