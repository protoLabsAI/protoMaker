# Phase 3: PR state sync crew member

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

New crew member pr-state-sync that runs GitHubStateChecker periodically (every 5 min). Emits events that trigger the bridge.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/crew-members/pr-state-sync-check.ts`
- [ ] `apps/server/src/services/crew-members/index.ts`
- [ ] `apps/server/src/index.ts`

### Verification
- [ ] Crew member runs on 5-min schedule
- [ ] Triggers GitHubStateChecker for all registered projects
- [ ] Emits events on state changes detected

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
