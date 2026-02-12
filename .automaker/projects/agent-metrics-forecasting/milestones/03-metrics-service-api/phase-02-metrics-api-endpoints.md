# Phase 2: Metrics API endpoints

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

4 API endpoints: POST /api/metrics/summary (project-level), POST /api/metrics/features (per-feature timing), POST /api/metrics/capacity (utilization), POST /api/metrics/forecast (estimate duration/cost from historical data).

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/metrics/index.ts`

### Verification
- [ ] All 4 endpoints respond with correct data
- [ ] Summary endpoint returns project-level aggregates
- [ ] Features endpoint returns per-feature timing breakdown
- [ ] Capacity endpoint returns utilization data
- [ ] Forecast endpoint estimates based on historical complexity

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
