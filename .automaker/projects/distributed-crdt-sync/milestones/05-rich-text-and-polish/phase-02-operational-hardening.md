# Phase 2: Operational Hardening

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Production readiness: CRDT document compaction (prevent unbounded growth), sync conflict diagnostics, reconnection resilience, monitoring and alerting for sync health, and documentation for multi-instance deployment.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/crdt/src/maintenance.ts`
- [ ] `apps/server/src/services/crdt-sync-service.ts`
- [ ] `docs/dev/distributed-sync.md`
- [ ] `docs/infra/multi-instance-deployment.md`

### Verification
- [ ] Document compaction runs periodically to prevent unbounded history growth
- [ ] Sync health metrics exposed via /api/health/detailed
- [ ] Reconnection after network partition replays queued changes correctly
- [ ] Alert when peer is unreachable for > peerTtlMs
- [ ] Deployment guide for multi-instance setup on Tailscale
- [ ] Runbook for common sync issues (split-brain, stuck peers, doc corruption)

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
