# Phase 1: Graceful Shutdown Handler

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

SIGTERM/SIGINT handler: stop new agent starts, suspend active workflows, checkpoint running agents, flush Langfuse traces, close SQLite, exit. Configurable 30s timeout with force-kill.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/lib/graceful-shutdown.ts`
- [ ] `apps/server/src/index.ts`

### Verification
- [ ] SIGTERM/SIGINT triggers orderly shutdown
- [ ] Active workflows suspended with checkpoint
- [ ] Running agents saved to context engine
- [ ] Langfuse traces flushed
- [ ] SQLite connections closed
- [ ] 30s timeout with force-kill
- [ ] Each step logged

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 1 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 2
