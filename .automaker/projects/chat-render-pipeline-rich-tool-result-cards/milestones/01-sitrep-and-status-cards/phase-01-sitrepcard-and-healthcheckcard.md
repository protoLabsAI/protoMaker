# Phase 1: SitrepCard and HealthCheckCard

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create SitrepCard for get_sitrep tool output. The sitrep contains: board summary (backlog/in_progress/review/done counts), auto-mode status, running agents list, blocked features, review features, escalations, open PRs with CI status, staging delta, recent commits, and server health. Render as a compact dashboard card with sections for each area, status indicators, and counts. Also create HealthCheckCard for health_check — shows server version, uptime, memory, connected services. Register both in tool-invocation-part.tsx.

---

## Tasks

### Files to Create/Modify

- [ ] `libs/ui/src/ai/tool-results/sitrep-card.tsx`
- [ ] `libs/ui/src/ai/tool-results/health-check-card.tsx`
- [ ] `libs/ui/src/ai/tool-invocation-part.tsx`

### Verification

- [ ] SitrepCard renders board counts, auto-mode status, running agents, blocked features, open PRs
- [ ] HealthCheckCard renders version, uptime, memory stats
- [ ] Both handle loading states and missing data gracefully
- [ ] Both registered in tool-invocation-part.tsx
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
