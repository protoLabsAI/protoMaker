# M1: Test Foundation

**Status**: 🔴 Not started
**Duration**: 3-6 weeks (estimated)
**Dependencies**: None

---

## Overview

Write comprehensive regression tests BEFORE changing any production code. Cover the exact seams that will be modified: CompletionDetectorService cascade, archival behavior, event emission patterns, ledger recording, and feature scaffolding. These tests define the contract — every subsequent milestone must pass them.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-completiondetectorservice-cascade-tests.md](./phase-01-completiondetectorservice-cascade-tests.md) | 1 week | None | TBD |
| 2 | [phase-02-feature-scaffolding-tests.md](./phase-02-feature-scaffolding-tests.md) | 1 week | None | TBD |
| 3 | [phase-03-archival-and-ledger-behavior-tests.md](./phase-03-archival-and-ledger-behavior-tests.md) | 1 week | None | TBD |

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

**Next**: [Phase 1](./phase-01-completiondetectorservice-cascade-tests.md)
