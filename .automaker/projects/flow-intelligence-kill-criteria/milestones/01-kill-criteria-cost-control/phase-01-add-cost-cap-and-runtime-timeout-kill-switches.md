# Phase 1: Add cost cap and runtime timeout kill switches

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add maxCostUsdPerFeature (default: undefined/off) and maxRuntimeMinutesPerFeature (default: 60) to WorkflowSettings. In ExecuteProcessor, after agent execution completes or during execution monitoring, check running costUsd against the cost cap and elapsed time against the runtime cap. If either exceeded: kill the agent, move feature to blocked with statusChangeReason explaining what was exceeded. Emit cost:exceeded or runtime:exceeded events. Add unit tests for: cost under cap (continues), cost over cap (kills + blocks), runtime under cap (continues), runtime over cap (kills + blocks), caps not set (no-op).

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/workflow-settings.ts`
- [ ] `apps/server/src/services/lead-engineer-execute-processor.ts`
- [ ] `apps/server/tests/unit/services/lead-engineer-execute-processor.test.ts`

### Verification
- [ ] maxCostUsdPerFeature and maxRuntimeMinutesPerFeature added to WorkflowSettings
- [ ] ExecuteProcessor checks both caps
- [ ] Agent killed and feature blocked when either cap exceeded
- [ ] Events emitted on cap violation
- [ ] Unit tests cover all paths
- [ ] npm run build:server passes
- [ ] npm run test:server passes

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
