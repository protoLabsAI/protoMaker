# Phase 2: Migrate remaining services to central config

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Update all remaining services that define their own timeout constants to import from the central config module. Includes crdt-sync, health-monitor, archival, worktree-lifecycle, pr-feedback, pr-watcher, work-intake, stream-observer, and authority agents.

---

## Tasks

### Files to Create/Modify

- [ ] `apps/server/src/services/crdt-sync-service.ts`
- [ ] `apps/server/src/services/health-monitor-service.ts`
- [ ] `apps/server/src/services/archival-service.ts`
- [ ] `apps/server/src/services/worktree-lifecycle-service.ts`
- [ ] `apps/server/src/services/pr-feedback-service.ts`
- [ ] `apps/server/src/services/pr-watcher-service.ts`
- [ ] `apps/server/src/services/work-intake-service.ts`
- [ ] `apps/server/src/services/stream-observer-service.ts`
- [ ] `apps/server/src/services/authority-agents/pm-agent.ts`
- [ ] `apps/server/src/services/authority-agents/em-agent.ts`
- [ ] `apps/server/src/services/authority-agents/projm-agent.ts`
- [ ] `apps/server/src/services/ava-gateway-service.ts`
- [ ] `apps/server/src/services/ava-channel-reactor-service.ts`

### Verification

- [ ] All listed services import timeouts from central config
- [ ] No locally-defined timeout constants remain (except truly service-private ones like rate limit delays)
- [ ] Duplicate constant names resolved (DRIFT_CHECK_INTERVAL_MS, POLL_INTERVAL_MS)
- [ ] Build and tests pass
- [ ] env var documentation added to .env.example or docs

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
