# Phase 2: Create ProjectHealthCard component

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create a compact ProjectHealthCard component that shows: board state (backlog/in-progress/review/done counts), running agents count, auto-mode status, last health check result. Fetches data from existing HTTP API endpoints: /api/features/summary, /api/auto-mode/status, /api/agents/running. Polls every 30s or updates via WebSocket events. Compact single-row layout.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/ui/src/components/views/dashboard-view/project-health-card.tsx`
- [ ] `apps/ui/src/hooks/use-project-health.ts`

### Verification
- [ ] Shows board counts in compact format
- [ ] Shows running agent count
- [ ] Shows auto-mode status (running/stopped/idle)
- [ ] Refreshes on relevant WebSocket events
- [ ] Loading skeleton while fetching

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
