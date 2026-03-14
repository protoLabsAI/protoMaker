# PRD: Remove CRDT/Automerge

## Situation
The server runs two overlapping sync layers: CrdtSyncService (JSON event relay on :4444, misleadingly named) and CRDTStore (Automerge binary sync on :4445). Disk is already the primary store for all data domains. CRDT writes are fire-and-forget secondaries with zero observable benefit in single-instance mode.

## Problem
The CRDT layer is a debugging black hole: no document inspector, no state visibility, no log toggle, silent failure paths, and a skipped core test due to automerge-repo race conditions. It adds two extra WebSocket servers, 4 @automerge npm packages, a 1600-line libs/crdt package, and ~400 lines of module wiring — all for sync guarantees we're not exploiting.

## Approach
Remove Automerge entirely. Add disk persistence to Ava Channel (the one domain that currently uses CRDT as primary storage). Refactor ProjectService to replace Automerge.Doc with plain JS objects. Strip CRDT reads/writes from notes, calendar, todos, metrics. Delete crdt-store.module, crdt-sync.module, libs/crdt package, and all @automerge deps. Keep CrdtSyncService but rename it to PeerMeshService.

## Results
Server starts with 2 fewer WebSocket ports. No @automerge packages in the dependency tree. All data domains continue working with disk-backed storage. Ava channel messages persist across restarts. Full typecheck and test suite pass. Codebase is ~2000 lines lighter.

## Constraints
Ava Channel messages must persist across server restarts (disk-backed daily shards required before CRDT removal). Peer mesh must be preserved as PeerMeshService. No data loss for notes, calendar, todos. Full typecheck and test suite must pass.
