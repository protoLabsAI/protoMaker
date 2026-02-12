# M3: Consumer Migration

**Status**: 🔴 Not started
**Duration**: 3-6 weeks (estimated)
**Dependencies**: None

---

## Overview

Migrate existing code that uses static AgentRole lookups to use the dynamic registry. Switch statements and Record<AgentRole,T> patterns become registry lookups with fallbacks.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-migrate-discord-router-to-registry.md](./phase-01-migrate-discord-router-to-registry.md) | 1 week | None | TBD |
| 2 | [phase-02-migrate-headsdown-service-to-registry.md](./phase-02-migrate-headsdown-service-to-registry.md) | 1 week | None | TBD |
| 3 | [phase-03-prompt-registry-adapter.md](./phase-03-prompt-registry-adapter.md) | 1 week | None | TBD |

---

## Success Criteria

M3 is **complete** when:

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

## Handoff to M4

Once M3 is complete, the following can begin:

- Next milestone phases that depend on this work
- Parallel work streams that were blocked

---

**Next**: [Phase 1](./phase-01-migrate-discord-router-to-registry.md)
