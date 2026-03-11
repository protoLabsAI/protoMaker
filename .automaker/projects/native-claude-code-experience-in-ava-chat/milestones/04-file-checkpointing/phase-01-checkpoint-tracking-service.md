# Phase 1: Checkpoint Tracking Service

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create CheckpointService that intercepts Write/Edit tool results in the chat pipeline. Before each file modification, store the original file content. Maintain a per-session checkpoint map: sessionId -> [{ checkpointId (UUID), messageId, filePath, originalContent, timestamp }]. Expose rewind(sessionId, checkpointId) that restores all files modified after the checkpoint to their state at that point. Files created after checkpoint are deleted on rewind.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/checkpoint-service.ts`
- [ ] `apps/server/src/server/services.ts`
- [ ] `apps/server/src/routes/chat/index.ts`

### Verification
- [ ] Service tracks file state before Write/Edit tool execution
- [ ] Checkpoint created per user message turn
- [ ] rewind() restores files to checkpoint state
- [ ] Created files deleted on rewind
- [ ] Checkpoint data persisted per session
- [ ] Service registered in ServiceContainer

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
