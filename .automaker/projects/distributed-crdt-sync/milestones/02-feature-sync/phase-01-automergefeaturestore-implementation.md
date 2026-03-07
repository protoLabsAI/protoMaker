# Phase 1: AutomergeFeatureStore Implementation

**Duration**: 2+ weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Implement the FeatureStore interface using CRDTStore as the backing store. Features document is a Record<featureId, Feature>. All reads come from in-memory Automerge doc (instant, no disk I/O). All writes use CRDTStore.change() which handles CRDT mutation, persistence, and sync. Maintains backward compatibility: if CRDT is disabled (no proto.config), falls back to existing FeatureLoader.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/src/services/automerge-feature-store.ts`
- [ ] `apps/server/src/services/feature-loader.ts`
- [ ] `apps/server/src/server/services.ts`
- [ ] `apps/server/src/server/wiring.ts`

### Verification
- [ ] AutomergeFeatureStore implements FeatureStore interface
- [ ] getAll() reads from Automerge doc (in-memory, no disk I/O)
- [ ] create/update/delete use CRDTStore.change() for mutations
- [ ] claim() uses CRDT atomic update with instanceId
- [ ] Remote changes from peers trigger feature:updated events via EventBus
- [ ] Fallback to FeatureLoader when proto.config is absent
- [ ] Unit tests for all FeatureStore methods against Automerge doc
- [ ] Integration test: feature created on instance A appears on instance B

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
