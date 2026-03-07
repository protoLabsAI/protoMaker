# Phase 3: Sync Server and Leader Election

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Implement sync server lifecycle within the Automaker server process. The instance marked as role:primary in proto.config.yaml starts the automerge-repo-sync-server on the configured syncPort. If the primary goes down, the next instance by priority promotes itself. Heartbeat protocol using HivemindPeer types. Integrates with existing server startup/shutdown lifecycle.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/crdt-sync-service.ts`
- [ ] `apps/server/src/server/services.ts`
- [ ] `apps/server/src/server/wiring.ts`
- [ ] `apps/server/src/server/startup.ts`
- [ ] `apps/server/src/server/shutdown.ts`
- [ ] `libs/types/src/hivemind.ts`

### Verification
- [ ] Primary instance starts sync server on configured port
- [ ] Worker instances connect as clients to primary's sync server
- [ ] Heartbeat protocol updates HivemindPeer.lastSeen on each beat
- [ ] Peers marked offline after peerTtlMs without heartbeat
- [ ] Leader election: if primary unreachable, next instance by config order promotes
- [ ] Graceful shutdown disconnects sync and announces departure
- [ ] Health endpoint includes sync status and peer list

---

## Deliverables

- [ ] Code implemented and working
- [ ] Tests passing
- [ ] Documentation updated

---

## Handoff Checklist

Before marking Phase 3 complete:

- [ ] All tasks complete
- [ ] Tests passing
- [ ] Code reviewed
- [ ] PR merged to main
- [ ] Team notified

**Next**: Phase 4
