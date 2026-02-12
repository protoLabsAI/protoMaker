# M1: Connect Health Pipeline Plumbing

**Status**: 🔴 Not started
**Duration**: 3-6 weeks (estimated)
**Dependencies**: None

---

## Overview

Fix the three critical breaks that prevent health events from reaching Discord: emit health:issue-detected, replace stub DiscordService, and call avaGatewayService.start().

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-emit-health-issue-detected-events-from-healthmonitorservice.md](./phase-01-emit-health-issue-detected-events-from-healthmonitorservice.md) | 0.5 weeks | None | TBD |
| 2 | [phase-02-replace-stub-discordservice-with-discordbotservice-in-avagateway.md](./phase-02-replace-stub-discordservice-with-discordbotservice-in-avagateway.md) | 1 week | None | TBD |
| 3 | [phase-03-replace-stub-discordservice-in-eventhookservice.md](./phase-03-replace-stub-discordservice-in-eventhookservice.md) | 0.5 weeks | None | TBD |

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

**Next**: [Phase 1](./phase-01-emit-health-issue-detected-events-from-healthmonitorservice.md)
