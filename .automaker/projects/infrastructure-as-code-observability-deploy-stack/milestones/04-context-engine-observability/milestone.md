# M4: Context Engine Observability

**Status**: 🔴 Not started
**Duration**: 2-4 weeks (estimated)
**Dependencies**: None

---

## Overview

Add tracing to context engine operations so compaction, assembly, and store operations are visible in Langfuse.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-add-otel-spans-to-context-engine-operations.md](./phase-01-add-otel-spans-to-context-engine-operations.md) | 1 week | None | TBD |
| 2 | [phase-02-add-langfuse-generation-spans-for-compaction-llm-calls.md](./phase-02-add-langfuse-generation-spans-for-compaction-llm-calls.md) | 1 week | None | TBD |

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

**Next**: [Phase 1](./phase-01-add-otel-spans-to-context-engine-operations.md)
