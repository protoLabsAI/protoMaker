# M2: Fix Milestone Cascade

**Status**: 🔴 Not started
**Duration**: 3-6 weeks (estimated)
**Dependencies**: None

---

## Overview

Fix the P0 bug: set milestoneSlug and phaseSlug on features during project scaffolding, then verify the CompletionDetectorService cascade works end-to-end. This unblocks automatic milestone completion, project completion, and ceremony triggers.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-set-milestoneslug-and-phaseslug-during-feature-scaffolding.md](./phase-01-set-milestoneslug-and-phaseslug-during-feature-scaffolding.md) | 0.5 weeks | None | TBD |
| 2 | [phase-02-fix-completiondetectorservice-milestone-cascade.md](./phase-02-fix-completiondetectorservice-milestone-cascade.md) | 1 week | None | TBD |
| 3 | [phase-03-end-to-end-cascade-integration-test.md](./phase-03-end-to-end-cascade-integration-test.md) | 1 week | None | TBD |

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

**Next**: [Phase 1](./phase-01-set-milestoneslug-and-phaseslug-during-feature-scaffolding.md)
