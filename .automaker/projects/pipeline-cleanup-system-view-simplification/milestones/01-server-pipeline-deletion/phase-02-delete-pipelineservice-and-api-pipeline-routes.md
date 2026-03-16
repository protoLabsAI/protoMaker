# Phase 2: Delete PipelineService and /api/pipeline/\* routes

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Delete apps/server/src/services/pipeline-service.ts and the entire apps/server/src/routes/pipeline/ directory (index.ts, common.ts, routes/get-config.ts, save-config.ts, add-step.ts, update-step.ts, delete-step.ts, reorder-steps.ts). Remove pipeline route mounting from apps/server/src/server/routes.ts. Remove pipelineService import and all pipeline config reads from auto-mode-service.ts and auto-mode/execution-service.ts (line ~1785 pipeline step sorting). Delete test files: apps/server/tests/unit/routes/pipeline.test.ts and apps/server/tests/unit/services/pipeline-service.test.ts.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/pipeline-service.ts`
- [ ] `apps/server/src/routes/pipeline/`
- [ ] `apps/server/src/server/routes.ts`
- [ ] `apps/server/src/services/auto-mode-service.ts`
- [ ] `apps/server/src/services/auto-mode/execution-service.ts`
- [ ] `apps/server/tests/unit/routes/pipeline.test.ts`
- [ ] `apps/server/tests/unit/services/pipeline-service.test.ts`

### Verification

- [ ] pipeline-service.ts deleted
- [ ] routes/pipeline/ directory deleted
- [ ] No /api/pipeline/\* routes in routes.ts
- [ ] auto-mode-service.ts has no pipelineService reference
- [ ] execution-service.ts has no pipelineConfig.steps reference
- [ ] npm run build:server passes
- [ ] npm run test:server passes

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
