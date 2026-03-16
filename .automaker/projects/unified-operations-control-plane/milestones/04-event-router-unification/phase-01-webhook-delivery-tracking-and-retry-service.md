# Phase 1: Webhook delivery tracking and retry service

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create WebhookDeliveryService wrapping all webhook processing with delivery records (id, source, eventType, status, attempts, lastError). Failed deliveries retry with exponential backoff (1s, 5s, 30s, max 3 attempts). Store in .automaker/webhook-deliveries.json (max 500 entries). Idempotent retry via signal dedup.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/types/src/webhook.ts`
- [ ] `apps/server/src/services/webhook-delivery-service.ts`
- [ ] `apps/server/src/routes/github/routes/webhook.ts`
- [ ] `apps/server/src/routes/webhooks/routes/github.ts`

### Verification

- [ ] WebhookDelivery type defined
- [ ] Every webhook creates delivery record
- [ ] Failed deliveries retry with exponential backoff
- [ ] Max 3 retries
- [ ] Idempotent via signal dedup
- [ ] Rolling 500-entry log
- [ ] Events emitted for delivery lifecycle
- [ ] Unit tests for retry and idempotency

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
