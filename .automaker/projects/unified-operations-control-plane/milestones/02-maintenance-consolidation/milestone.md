# M2: Maintenance Consolidation

**Status**: 🔴 Not started
**Duration**: 3-6 weeks (estimated)
**Dependencies**: None

---

## Overview

Merge the four overlapping board health systems into a single MaintenanceOrchestrator with composable check modules.

---

## Phases

| Phase | File                                                                                                                                                 | Duration | Dependencies | Owner |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----- |
| 1     | [phase-01-maintenanceorchestrator-service-with-check-module-interface.md](./phase-01-maintenanceorchestrator-service-with-check-module-interface.md) | 1 week   | None         | TBD   |
| 2     | [phase-02-extract-health-checks-to-maintenance-modules.md](./phase-02-extract-health-checks-to-maintenance-modules.md)                               | 2 weeks  | None         | TBD   |
| 3     | [phase-03-wire-maintenanceorchestrator-and-remove-old-systems.md](./phase-03-wire-maintenanceorchestrator-and-remove-old-systems.md)                 | 2 weeks  | None         | TBD   |

---

## Success Criteria

M2 is **complete** when:

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

## Handoff to M3

Once M2 is complete, the following can begin:

- Next milestone phases that depend on this work
- Parallel work streams that were blocked

---

**Next**: [Phase 1](./phase-01-maintenanceorchestrator-service-with-check-module-interface.md)
