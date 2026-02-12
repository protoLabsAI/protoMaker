# M2: Phase 3: Hook Improvements

**Status**: 🔴 Not started
**Duration**: 3-6 weeks (estimated)
**Dependencies**: None

---

## Overview

Add 4 hooks for state persistence and failure detection. PreCompact saves state before context wipes, SessionEnd persists for next startup, PostToolUseFailure detects MCP failures, stop hook upgrades to JSON format with structured idle tasks.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-precompact-and-sessionend-hooks.md](./phase-01-precompact-and-sessionend-hooks.md) | 1 week | None | TBD |
| 2 | [phase-02-posttoolusefailure-hook-for-mcp-failures.md](./phase-02-posttoolusefailure-hook-for-mcp-failures.md) | 0.5 weeks | None | TBD |
| 3 | [phase-03-stop-hook-json-upgrade-and-structured-idle.md](./phase-03-stop-hook-json-upgrade-and-structured-idle.md) | 0.5 weeks | None | TBD |

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

**Next**: [Phase 1](./phase-01-precompact-and-sessionend-hooks.md)
