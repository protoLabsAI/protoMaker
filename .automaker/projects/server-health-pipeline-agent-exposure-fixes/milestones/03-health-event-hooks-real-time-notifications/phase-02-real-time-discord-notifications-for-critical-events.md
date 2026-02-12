# Phase 2: Real-time Discord notifications for critical events

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Currently AvaGateway only posts to Discord during the 30-minute heartbeat check. Add real-time posting when health:issue-detected fires.

The AvaGateway already has handleHealthIssue() at line 341 which formats severity and creates alerts. The fix from Milestone 1 connects health:issue-detected → handleHealthIssue(). But we also want notification:created events to post to Discord immediately for feature_waiting_approval and feature_error types.

Changes:
1. apps/server/src/services/ava-gateway-service.ts — Subscribe to notification:created events. For high/critical severity notifications, post to Discord #infra immediately.
2. Add rate limiting — don't post more than 1 message per event type per 5 minutes to prevent spam.

This gives Josh real-time Discord alerts instead of waiting for the 30-min heartbeat.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/ava-gateway-service.ts`

### Verification
- [ ] Critical health events post to Discord within seconds (not 30-min delay)
- [ ] Feature errors post to Discord in real-time
- [ ] Rate limiting prevents spam (max 1 per event type per 5 min)
- [ ] Circuit breaker still works
- [ ] npm run build:server passes

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
