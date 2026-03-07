# Phase 2: libs/crdt Workspace Package

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Create new workspace package @protolabsai/crdt. Wraps Automerge 3 + automerge-repo with a CRDTStore class that manages Automerge documents by domain (features, projects, notes, config). Provides document creation, change, subscribe, and sync lifecycle. Handles persistence to .automaker/crdt/ directory. Includes WebSocket sync adapter configured for Tailscale peer connections.

---

## Tasks

### Files to Create/Modify
- [ ] `libs/crdt/package.json`
- [ ] `libs/crdt/tsconfig.json`
- [ ] `libs/crdt/src/index.ts`
- [ ] `libs/crdt/src/crdt-store.ts`
- [ ] `libs/crdt/src/sync-adapter.ts`
- [ ] `libs/crdt/src/documents.ts`
- [ ] `libs/crdt/src/types.ts`
- [ ] `package.json`
- [ ] `tsconfig.json`
- [ ] `Dockerfile`

### Verification
- [ ] CRDTStore class creates and manages Automerge documents by domain name
- [ ] change() method applies mutations and emits local change events
- [ ] subscribe() method fires callbacks on local and remote changes
- [ ] WebSocket sync adapter connects to peer via Tailscale IP:port
- [ ] Persistence adapter saves/loads Automerge binary to .automaker/crdt/
- [ ] Two-node integration test: change on node A appears on node B within 200ms
- [ ] Conflict test: concurrent field updates on same document merge correctly
- [ ] Package builds and passes typecheck

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
