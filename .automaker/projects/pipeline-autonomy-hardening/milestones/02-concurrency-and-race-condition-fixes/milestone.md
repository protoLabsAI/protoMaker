# M2: Concurrency and Race Condition Fixes

**Status**: 🔴 Not started
**Duration**: 5-10 weeks (estimated)
**Dependencies**: None

---

## Overview

Eliminate data races that cause silent state loss, duplicate agents, and stuck features

---

## Phases

| Phase | File                                                                                                                                                                             | Duration | Dependencies | Owner |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------ | ----- |
| 1     | [phase-01-add-per-feature-mutex-to-featureloader-update-and-claim.md](./phase-01-add-per-feature-mutex-to-featureloader-update-and-claim.md)                                     | 1 week   | None         | TBD   |
| 2     | [phase-02-add-per-session-event-processing-queue-to-lead-engineer.md](./phase-02-add-per-session-event-processing-queue-to-lead-engineer.md)                                     | 1 week   | None         | TBD   |
| 3     | [phase-03-fix-executeprocessor-waitforcompletion-race-and-pre-flight-shouldcontinue.md](./phase-03-fix-executeprocessor-waitforcompletion-race-and-pre-flight-shouldcontinue.md) | 2 weeks  | None         | TBD   |
| 4     | [phase-04-fix-runningfeatures-tracking-gap-in-execution-service.md](./phase-04-fix-runningfeatures-tracking-gap-in-execution-service.md)                                         | 1 week   | None         | TBD   |
| 5     | [phase-05-unify-concurrency-tracking-and-fix-settings-and-ledger-races.md](./phase-05-unify-concurrency-tracking-and-fix-settings-and-ledger-races.md)                           | 2 weeks  | None         | TBD   |

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

**Next**: [Phase 1](./phase-01-add-per-feature-mutex-to-featureloader-update-and-claim.md)
