# M6: Automatic Status Events

**Status**: 🔴 Not started
**Duration**: 1-2 weeks (estimated)
**Dependencies**: None

---

## Overview

Make featureLoader.update() automatically emit feature:status-changed when status changes, eliminating inconsistent manual emission across callers. This ensures all downstream listeners (CompletionDetector, LedgerService, AgentScoringService, EventLedger) fire reliably.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-auto-emit-feature-status-changed-from-featureloader-update.md](./phase-01-auto-emit-feature-status-changed-from-featureloader-update.md) | 1 week | None | TBD |

---

## Success Criteria

M6 is **complete** when:

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

## Handoff to M7

Once M6 is complete, the following can begin:

- Next milestone phases that depend on this work
- Parallel work streams that were blocked

---

**Next**: [Phase 1](./phase-01-auto-emit-feature-status-changed-from-featureloader-update.md)
