# Phase 2: Dispose AgentManifestService on shutdown

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add getAgentManifestService().dispose() to the graceful shutdown sequence in shutdown.ts. This closes fs.watch handles and prevents leaked watchers in test environments.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/server/shutdown.ts`

### Verification
- [ ] dispose() called during graceful shutdown
- [ ] Server shuts down cleanly without open handle warnings
- [ ] Existing tests pass

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 2 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 3
