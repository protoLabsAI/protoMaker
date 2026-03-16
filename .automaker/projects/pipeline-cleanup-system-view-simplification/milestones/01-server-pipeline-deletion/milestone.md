# M1: Server Pipeline Deletion

**Status**: 🔴 Not started
**Duration**: 3-6 weeks (estimated)
**Dependencies**: None

---

## Overview

Remove PipelineOrchestrator, PipelineService, PipelineCheckpointService and all server-side wiring, routes, and tests. Remove featureFlags.pipeline entirely.

---

## Phases

| Phase | File                                                                                                                                                             | Duration | Dependencies | Owner |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----- |
| 1     | [phase-01-delete-pipelineorchestrator-and-engine-pipeline-routes.md](./phase-01-delete-pipelineorchestrator-and-engine-pipeline-routes.md)                       | 1 week   | None         | TBD   |
| 2     | [phase-02-delete-pipelineservice-and-api-pipeline-routes.md](./phase-02-delete-pipelineservice-and-api-pipeline-routes.md)                                       | 1 week   | None         | TBD   |
| 3     | [phase-03-delete-pipelinecheckpointservice-and-remove-featureflags-pipeline.md](./phase-03-delete-pipelinecheckpointservice-and-remove-featureflags-pipeline.md) | 1 week   | None         | TBD   |

---

## Success Criteria

M1 is **complete** when:

- [ ] All phases complete
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Team reviewed and approved

---

## Outputs

### For Next Milestone

- Foundation work ready for dependent features
- APIs stable and documented
- Types exported and usable

---

## Handoff to M2

Once M1 is complete, the following can begin:

- Next milestone phases that depend on this work
- Parallel work streams that were blocked

---

**Next**: [Phase 1](./phase-01-delete-pipelineorchestrator-and-engine-pipeline-routes.md)
