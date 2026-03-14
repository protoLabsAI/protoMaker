# M1: Ava Channel Disk Persistence

**Status**: 🔴 Not started
**Duration**: 1-2 weeks (estimated)
**Dependencies**: None

---

## Overview

Add disk-backed daily shard files to AvaChannelService before CRDT is removed. This is the only domain where CRDT is the primary store.

---

## Phases

| Phase | File | Duration | Dependencies | Owner |
|-------|------|----------|--------------|-------|
| 1 | [phase-01-disk-backed-daily-shards-for-avachannelservice.md](./phase-01-disk-backed-daily-shards-for-avachannelservice.md) | 1 week | None | TBD |

---

## Success Criteria

M1 is **complete** when:

- [ ] All phases complete
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Team reviewed and approved

---

## Outputs

### For Next Milestone
- Foundation work ready for dependent features
- APIs stable and documented
- Types exported and usable

---

## Handoff to M2

Once M1 is complete, the following can begin:

- Next milestone phases that depend on this work
- Parallel work streams that were blocked

---

**Next**: [Phase 1](./phase-01-disk-backed-daily-shards-for-avachannelservice.md)
