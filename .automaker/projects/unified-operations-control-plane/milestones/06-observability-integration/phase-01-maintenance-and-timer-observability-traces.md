# Phase 1: Maintenance and timer observability traces

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create OpsTracingService wrapping sweeps and timer ticks with Langfuse traces. Maintenance sweeps get per-check spans. High-frequency timers sampled at 1%. Errors always traced.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/ops-tracing-service.ts`
- [ ] `apps/server/src/services/maintenance-orchestrator.ts`
- [ ] `apps/server/src/services/scheduler-service.ts`
- [ ] `apps/server/src/server/wiring.ts`

### Verification
- [ ] Maintenance sweeps create Langfuse traces
- [ ] Per-check child spans with duration and result
- [ ] High-frequency timer sampling at configurable rate
- [ ] Errors always traced
- [ ] Graceful degradation without Langfuse
- [ ] Unit tests for trace creation and sampling

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
