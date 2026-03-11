# Phase 2: Checkpoint UI and Rewind Command

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add checkpoint markers to the message timeline — small indicators on messages where file changes occurred. Add a Rewind to here button on each checkpoint marker. Create /rewind built-in slash command that accepts an optional checkpoint ID (defaults to most recent). Wire rewind action to POST /api/chat/rewind endpoint that calls CheckpointService.rewind().

---

## Tasks

### Files to Create/Modify
- [ ] `libs/ui/src/ai/checkpoint-marker.tsx`
- [ ] `libs/ui/src/ai/index.ts`
- [ ] `apps/server/src/routes/chat/index.ts`
- [ ] `apps/ui/src/hooks/use-chat-session.ts`

### Verification
- [ ] Checkpoint markers visible on messages with file changes
- [ ] Rewind to here button on each marker
- [ ] POST /api/chat/rewind endpoint triggers restore
- [ ] /rewind command works as built-in slash command
- [ ] UI confirms rewind with list of restored files
- [ ] No rewind if no checkpoints exist (graceful message)

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
