# Phase 3: Shared Settings Sync

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create a shared-settings Automerge document for configuration that should propagate across instances (shared model preferences, workflow tuning, etc). Instance-local settings remain in .automaker/settings.json. Effective config = proto.config defaults MERGED with shared CRDT settings MERGED with local overrides.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/settings-service.ts`
- [ ] `apps/server/src/services/crdt-sync-service.ts`
- [ ] `libs/crdt/src/documents.ts`
- [ ] `libs/types/src/proto-config.ts`

### Verification
- [ ] Shared settings document syncs across instances
- [ ] Settings changed on any instance propagate to all peers
- [ ] Instance-local overrides take precedence over shared settings
- [ ] proto.config defaults < shared CRDT settings < local overrides resolution order
- [ ] Credentials and API keys are NEVER included in shared settings

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
