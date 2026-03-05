# Phase 1: compactToolResult utility and per-tool policies

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create a compactToolResult() function in apps/server/src/routes/chat/ that accepts a tool name and result object, applies size-based and tool-specific compaction rules, and returns a compact version. Add per-tool policies: list_features keeps only id/title/status, get_board_summary keeps counts only, get_agent_output truncates to last 2000 chars, etc. Wire it into the chat route so all tool results pass through compaction before being added to conversation history.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/routes/chat/tool-compaction.ts`
- [ ] `apps/server/src/routes/chat/index.ts`
- [ ] `apps/server/src/routes/chat/ava-tools.ts`

### Verification
- [ ] compactToolResult() reduces list_features output by 80%+
- [ ] compactToolResult() reduces get_board_summary by 50%+
- [ ] All 44 tools have a compaction policy (even if pass-through)
- [ ] Chat route wires compaction into tool result flow
- [ ] Existing tool functionality is not broken
- [ ] TypeScript compiles cleanly

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
