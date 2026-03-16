# Phase 1: Delete PipelineOrchestrator and engine pipeline routes

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Delete apps/server/src/services/pipeline-orchestrator.ts. Remove all /api/engine/pipeline/\* route handlers from apps/server/src/routes/engine/index.ts (pipeline/status, pipeline/gate/resolve, pipeline/override, pipeline-state, pipeline-checkpoints endpoints). Remove pipelineOrchestrator parameter and usage from the engine router. Clean up apps/server/src/services/channel-handlers/github-channel-handler.ts to remove pipelineOrchestrator import and resolveGate call.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/pipeline-orchestrator.ts`
- [ ] `apps/server/src/routes/engine/index.ts`
- [ ] `apps/server/src/services/channel-handlers/github-channel-handler.ts`

### Verification

- [ ] pipeline-orchestrator.ts deleted
- [ ] No /api/engine/pipeline/\* routes exist
- [ ] engine/index.ts has no PipelineOrchestrator reference
- [ ] github-channel-handler.ts has no pipelineOrchestrator reference
- [ ] npm run build:server passes

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
