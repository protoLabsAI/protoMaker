# Phase 1: Disk-backed daily shards for AvaChannelService

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Replace CRDT-backed storage in AvaChannelService with disk-backed daily shard files at .automaker/ava-channel/YYYY-MM-DD.json. On write: append to in-memory shard AND persist to disk. On startup: load today's shard from disk if it exists. Remove CRDTStore dependency from constructor. Update ava-channel-reactor-service.ts to remove CRDT store injection. Update tests.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/ava-channel-service.ts`
- [ ] `apps/server/src/services/ava-channel-reactor-service.ts`
- [ ] `apps/server/tests/unit/services/ava-channel-service.test.ts`

### Verification
- [ ] AvaChannelService writes messages to .automaker/ava-channel/YYYY-MM-DD.json on every post
- [ ] On server restart, today's messages are reloaded from disk
- [ ] No CRDTStore import in ava-channel-service.ts
- [ ] Existing 30-day archival retention still works
- [ ] Tests pass

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
