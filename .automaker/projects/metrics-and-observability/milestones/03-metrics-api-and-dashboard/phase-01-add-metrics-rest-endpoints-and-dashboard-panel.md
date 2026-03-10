# Phase 1: Add metrics REST endpoints and dashboard panel

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create /api/metrics routes: GET /api/metrics/dora (returns DORA metrics for time range), GET /api/metrics/agentic (returns agentic metrics), GET /api/metrics/summary (returns current snapshot). Add a MetricsPanel component to the existing analytics-view or dashboard-view that shows: DORA metric trends (sparklines), current autonomy rate, WIP saturation gauges, cost/feature trend. Reuse existing chart/visualization patterns from the analytics view.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/metrics/index.ts`
- [ ] `apps/ui/src/components/views/dashboard-view/metrics/dora-metrics-panel.tsx`
- [ ] `apps/server/src/server/routes.ts`

### Verification
- [ ] REST endpoints return metrics data
- [ ] Dashboard panel shows DORA trends
- [ ] Agentic metrics visible in UI
- [ ] npm run typecheck passes
- [ ] npm run build passes

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
