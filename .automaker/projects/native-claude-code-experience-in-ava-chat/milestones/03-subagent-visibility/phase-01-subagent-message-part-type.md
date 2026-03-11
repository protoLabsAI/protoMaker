# Phase 1: Subagent Message Part Type

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add a subagent-progress data part type to the message stream. When the server detects an Agent tool_use block in the streamed response, emit a data-subagent chunk with: subagentType, status (spawning/running/done/failed), description, and result summary. Define the SubagentProgress type in @protolabsai/types.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/types/src/chat.ts`
- [ ] `apps/server/src/routes/chat/index.ts`

### Verification
- [ ] SubagentProgress type defined with subagentType, status, description, resultSummary
- [ ] Server emits data-subagent UIMessageChunk when Agent tool detected
- [ ] Chunk includes parsed subagent metadata from tool input
- [ ] Works with existing streamText pipeline

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
