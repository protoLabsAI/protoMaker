# M2: Fix Discord Thread Routing

**Status**: 🔴 Not started
**Duration**: 2-4 weeks (estimated)
**Dependencies**: None

---

## Overview

Fix the event payload mismatch between discord-bot-service.ts and agent-discord-router.ts that breaks slash command thread conversations, and add missing role prompt fallbacks.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-fix-event-payload-mismatch-in-thread-routing.md](./phase-01-fix-event-payload-mismatch-in-thread-routing.md) | 0.5 weeks | None | TBD |
| 2 | [phase-02-add-missing-role-prompts-for-agent-thread-responses.md](./phase-02-add-missing-role-prompts-for-agent-thread-responses.md) | 0.5 weeks | None | TBD |

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

**Next**: [Phase 1](./phase-01-fix-event-payload-mismatch-in-thread-routing.md)
