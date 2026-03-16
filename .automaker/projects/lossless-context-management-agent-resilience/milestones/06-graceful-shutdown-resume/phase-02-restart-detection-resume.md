# Phase 2: Restart Detection & Resume

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

On startup: check checkpoint store for suspended workflows. Validate feature and worktree exist. Present resume options via WebSocket and MCP. Auto-resume if auto-mode was active. Board shows interrupted features.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/restart-recovery-service.ts`
- [ ] `apps/server/src/index.ts`
- [ ] `apps/server/src/routes/agent.ts`

### Verification
- [ ] Startup detects interrupted workflows
- [ ] Validates feature and worktree before resume
- [ ] Resume options visible in UI
- [ ] Auto-mode resumes if was active
- [ ] MCP tool for manual resume
- [ ] Board shows interrupted features

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
