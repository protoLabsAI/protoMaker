# Phase 3: Event Router service and delivery API

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create EventRouterService unifying SignalIntakeService classification with webhook delivery tracking. Single entry point: classifyAndRoute(signal). API routes for delivery list, detail, and manual retry. MCP tool for delivery status.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/event-router-service.ts`
- [ ] `apps/server/src/routes/ops/routes/deliveries.ts`
- [ ] `packages/mcp-server/src/tools/ops-tools.ts`
- [ ] `apps/server/src/server/wiring.ts`

### Verification

- [ ] EventRouterService wraps classification + delivery tracking
- [ ] Single classifyAndRoute method
- [ ] API routes for deliveries
- [ ] MCP tool for delivery status
- [ ] Wired at startup
- [ ] Integration test for end-to-end flow

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 3 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 4
