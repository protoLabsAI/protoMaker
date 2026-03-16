# Phase 5: Timer Registry API routes and MCP tools

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add API routes: GET /api/ops/timers (list all), POST /api/ops/timers/:id/pause, POST /api/ops/timers/:id/resume, POST /api/ops/timers/pause-all, POST /api/ops/timers/resume-all. Update MCP tools to include interval tasks. Add WebSocket events for timer state changes.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/ops/index.ts`
- [ ] `apps/server/src/routes/ops/routes/timers.ts`
- [ ] `packages/mcp-server/src/tools/scheduler-tools.ts`
- [ ] `libs/types/src/event.ts`

### Verification
- [ ] GET /api/ops/timers returns all cron + interval tasks
- [ ] Pause/resume endpoints work per timer and bulk
- [ ] MCP get_scheduler_status includes interval tasks
- [ ] WebSocket events emitted on timer state changes
- [ ] API tests cover all endpoints

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 5 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 6
