# Phase 2: Rate limiting and webhook secret rotation

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add rate limiting middleware (token bucket, 100 req/min per IP). Add dual-secret validation for rotation: accept both current and previous secret. Store previous with expiry. Add rotation API endpoint.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/middleware/rate-limiter.ts`
- [ ] `apps/server/src/routes/github/routes/webhook.ts`
- [ ] `apps/server/src/routes/webhooks/routes/github.ts`
- [ ] `libs/types/src/global-settings.ts`
- [ ] `apps/server/src/routes/github/routes/webhook-settings.ts`

### Verification

- [ ] Rate limiter on webhook routes
- [ ] Token bucket: 100 req/min per IP
- [ ] 429 on limit exceeded
- [ ] Dual-secret validation during rotation
- [ ] Previous secret with expiry in settings
- [ ] Rotation API endpoint
- [ ] Unit tests for rate limiting and dual-secret

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
