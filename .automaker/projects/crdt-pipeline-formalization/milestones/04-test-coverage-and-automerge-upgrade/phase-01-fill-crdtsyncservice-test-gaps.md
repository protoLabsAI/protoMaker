# Phase 1: Fill CrdtSyncService test gaps

**Duration**: 1-1.5 weeks
**Owner**: TBD
**Dependencies**: None
**Parallel Work**: Can run alongside other phases (if applicable)

---

## Overview

Add missing test cases to apps/server/tests/unit/crdt-sync-service.test.ts. Tests to add: (1) Partition recovery — simulate worker disconnect, enqueue events in outboundQueue, reconnect, verify queued events are replayed to primary in order. (2) Registry sync — simulate worker connecting to primary, verify primary sends registry_sync message, verify worker calls adoptRemoteRegistry() with the received registry. (3) Settings event broadcast — verify that publishSettings() sends CrdtSettingsEvent to all connected peers and that a received settings_event invokes the onSettingsReceived callback. (4) Peer eviction on TTL — advance mock clock past peerTtlMs, verify peer is marked offline and isOnline returns false.

---

## Tasks

### Files to Create/Modify
- [ ] `apps/server/tests/unit/crdt-sync-service.test.ts`

### Verification
- [ ] Partition recovery test: outboundQueue fills during disconnect, events replayed on reconnect
- [ ] Registry sync test: worker receives registry from primary, adoptRemoteRegistry called
- [ ] Settings broadcast test: publishSettings sends to all peers, callback fires on receive
- [ ] TTL eviction test: peer marked offline after peerTtlMs passes
- [ ] All new tests pass with npm run test:server
- [ ] No existing tests broken

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
