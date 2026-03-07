# M5: Expanded Ledger & Failure Persistence

**Status**: 🔴 Not started
**Duration**: 2-4 weeks (estimated)
**Dependencies**: None

---

## Overview

Extend the metrics ledger to record ALL terminal feature states (not just completed), persist failure classifications on features, and store all Langfuse trace IDs for full retry traceability.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-record-failed-and-escalated-features-in-ledger.md](./phase-01-record-failed-and-escalated-features-in-ledger.md) | 0.5 weeks | None | TBD |
| 2 | [phase-02-persist-failure-classifications-and-trace-ids.md](./phase-02-persist-failure-classifications-and-trace-ids.md) | 0.5 weeks | None | TBD |

---

## Success Criteria

M5 is **complete** when:

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

## Handoff to M6

Once M5 is complete, the following can begin:

- Next milestone phases that depend on this work
- Parallel work streams that were blocked

---

**Next**: [Phase 1](./phase-01-record-failed-and-escalated-features-in-ledger.md)
