# Phase 1: Project update service

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

New LinearProjectUpdateService that generates and posts status updates to Linear projects. Collects features done/total, PR status, blockers, milestone progress.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/linear-project-update-service.ts`
- [ ] `apps/server/src/services/linear-mcp-client.ts`
- [ ] `apps/server/src/index.ts`

### Verification
- [ ] Service generates status update from board state
- [ ] Posts to Linear via projectUpdateCreate mutation
- [ ] Includes milestone progress and blockers

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
