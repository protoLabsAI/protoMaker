# Phase 2: PostToolUseFailure hook for MCP failures

**Duration**: 0.5-1 week
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create handle-mcp-failure.sh hook that detects when MCP tools fail (mcp__plugin_automaker_automaker__ namespace), checks if server is unreachable, and injects diagnostic context. Register in hooks.json with PostToolUseFailure event and matcher for MCP tool names. Output suggests recovery actions (check server, verify auth, inspect logs).

---

## Tasks

### Files to Create/Modify
- [ ] `packages/mcp-server/plugins/automaker/hooks/handle-mcp-failure.sh (new)`
- [ ] `packages/mcp-server/plugins/automaker/hooks/hooks.json`

### Verification
- [ ] Hook fires when MCP tools fail
- [ ] Detects server-down vs other failures
- [ ] Injects recovery context to Claude
- [ ] Does not fire on successful tool calls

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
