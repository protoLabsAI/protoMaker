# M4: System View Simplification

**Status**: 🔴 Not started
**Duration**: 2-4 weeks (estimated)
**Dependencies**: None

---

## Overview

Rebuild system view to a 2-lane topology: Production lane (Lead Engineer → Auto-Mode → Agent Execution → Git Workflow → PR Pipeline) and Integrations sidebar (GitHub, Discord). Remove all pipeline-stage and pre-production lane code.

---

## Phases

| Phase | File                                                                                                                           | Duration | Dependencies | Owner |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------ | ----- |
| 1     | [phase-01-rebuild-flow-graph-constants-to-2-lane-topology.md](./phase-01-rebuild-flow-graph-constants-to-2-lane-topology.md)   | 1 week   | None         | TBD   |
| 2     | [phase-02-simplify-use-flow-graph-data-and-flow-graph-view.md](./phase-02-simplify-use-flow-graph-data-and-flow-graph-view.md) | 1 week   | None         | TBD   |

---

## Success Criteria

M4 is **complete** when:

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

## Handoff to M5

Once M4 is complete, the following can begin:

- Next milestone phases that depend on this work
- Parallel work streams that were blocked

---

**Next**: [Phase 1](./phase-01-rebuild-flow-graph-constants-to-2-lane-topology.md)
