# M4: dispatchResponse Wiring Audit

**Status**: 🔴 Not started
**Duration**: 1-2 weeks (estimated)
**Dependencies**: None

---

## Overview

Audit whether ReactiveSpawnerService is fully wired into the service container and passed to AvaChannelReactorService. Fix any gaps so dispatchResponse correctly spawns Claude sessions for request-type backchannel messages.

---

## Phases

| Phase | File                                                                                                                               | Duration | Dependencies | Owner |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----- |
| 1     | [phase-01-wire-reactivespawnerservice-into-service-container.md](./phase-01-wire-reactivespawnerservice-into-service-container.md) | 1 week   | None         | TBD   |

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

**Next**: [Phase 1](./phase-01-wire-reactivespawnerservice-into-service-container.md)
