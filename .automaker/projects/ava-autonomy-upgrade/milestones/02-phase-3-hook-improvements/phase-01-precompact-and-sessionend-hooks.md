# Phase 1: PreCompact and SessionEnd hooks

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create pre-compact-save-state.sh (saves board state, current task, PR pipeline to data/ava-session-state.json before compaction) and session-end-save.sh (persists session summary on SessionEnd event). Register in hooks.json with PreCompact and SessionEnd matchers. Update session-context.sh to read saved state on startup and inject it as context.

---

## Tasks

### Files to Create/Modify
- [ ] `packages/mcp-server/plugins/automaker/hooks/pre-compact-save-state.sh (new)`
- [ ] `packages/mcp-server/plugins/automaker/hooks/session-end-save.sh (new)`
- [ ] `packages/mcp-server/plugins/automaker/hooks/session-context.sh`
- [ ] `packages/mcp-server/plugins/automaker/hooks/hooks.json`

### Verification
- [ ] PreCompact hook saves board counts and current work to JSON
- [ ] SessionEnd hook writes session summary
- [ ] session-context.sh reads saved state and injects after startup/compact/resume
- [ ] Compaction no longer loses operational context

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
