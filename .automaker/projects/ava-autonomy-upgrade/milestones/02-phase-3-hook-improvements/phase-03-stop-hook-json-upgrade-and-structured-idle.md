# Phase 3: Stop hook JSON upgrade and structured idle

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Upgrade continue-work.sh to use JSON decision output instead of exit 2 (hookSpecificOutput with decision: block/allow and reason). Add structured idle task list (check Linear for new initiatives, review Beads backlog, run maintenance tasks, check for drift). Add blocked-feature escalation logic (if all remaining features blocked, inject escalation message). Update hooks.json if needed for JSON output pattern.

---

## Tasks

### Files to Create/Modify
- [ ] `packages/mcp-server/plugins/automaker/hooks/continue-work.sh`

### Verification
- [ ] Stop hook outputs JSON with decision and reason instead of exit 2
- [ ] Blocked-only boards trigger escalation message
- [ ] Idle cycle provides specific task list not vague cleanup message
- [ ] Guard still prevents infinite loops

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
