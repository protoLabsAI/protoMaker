# M1: Tool Result Compaction

**Status**: 🔴 Not started
**Duration**: 2-4 weeks (estimated)
**Dependencies**: None

---

## Overview

Build the compaction layer that processes tool results before they enter conversation history. This is the highest-impact change — most token bloat comes from verbose tool results.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-compacttoolresult-utility-and-per-tool-policies.md](./phase-01-compacttoolresult-utility-and-per-tool-policies.md) | 1 week | None | TBD |
| 2 | [phase-02-message-level-compaction-and-token-budget.md](./phase-02-message-level-compaction-and-token-budget.md) | 1 week | None | TBD |

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

**Next**: [Phase 1](./phase-01-compacttoolresult-utility-and-per-tool-policies.md)
