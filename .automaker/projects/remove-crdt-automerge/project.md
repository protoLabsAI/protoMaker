# Remove CRDT/Automerge

Replace the over-engineered Automerge/CRDT layer with simple disk-backed storage. Eliminate ~1100 lines of hand-rolled peer mesh and Automerge binary sync that adds complexity, zero debuggability, and solves a multi-instance problem we don't have yet.

**Status:** active
**Created:** 2026-03-14T04:56:20.838Z
**Updated:** 2026-03-14T06:42:11.628Z

## PRD

### Situation

The server runs two overlapping sync layers: CrdtSyncService (JSON event relay on :4444, misleadingly named) and CRDTStore (Automerge binary sync on :4445). Disk is already the primary store for all data domains. CRDT writes are fire-and-forget secondaries with zero observable benefit in single-instance mode.

### Problem

The CRDT layer is a debugging black hole: no document inspector, no state visibility, no log toggle, silent failure paths, and a skipped core test due to automerge-repo race conditions. It adds two extra WebSocket servers, 4 @automerge npm packages, a 1600-line libs/crdt package, and ~400 lines of module wiring — all for sync guarantees we're not exploiting.

### Approach

Remove Automerge entirely. Add disk persistence to Ava Channel (the one domain that currently uses CRDT as primary storage). Refactor ProjectService to replace Automerge.Doc with plain JS objects. Strip CRDT reads/writes from notes, calendar, todos, metrics. Delete crdt-store.module, crdt-sync.module, libs/crdt package, and all @automerge deps. Keep CrdtSyncService but rename it to PeerMeshService.

### Results

Server starts with 2 fewer WebSocket ports. No @automerge packages in the dependency tree. All data domains continue working with disk-backed storage. Ava channel messages persist across restarts. Full typecheck and test suite pass. Codebase is ~2000 lines lighter.

### Constraints

Ava Channel messages must persist across server restarts (disk-backed daily shards required before CRDT removal). Peer mesh must be preserved as PeerMeshService. No data loss for notes, calendar, todos. Full typecheck and test suite must pass.

## Milestones

### 1. Ava Channel Disk Persistence

Add disk-backed daily shard files to AvaChannelService before CRDT is removed. This is the only domain where CRDT is the primary store.

**Status:** pending

#### Phases

1. **Disk-backed daily shards for AvaChannelService** (medium)

### 2. Strip CRDT from Consumer Services

Remove all CRDT reads, writes, and setCrdtStore() injection from notes, calendar, todos, metrics, and project-service.

**Status:** pending

#### Phases

1. **Remove CRDT dual-write from notes routes** (small)
2. **Remove setCrdtStore() from CalendarService, TodoService, and metrics route** (small)
3. **Refactor ProjectService — remove Automerge.Doc in-memory usage** (small)

### 3. Delete CRDT Infrastructure

Remove module wiring, delete crdt-store.module.ts and crdt-sync.module.ts, clean up startup/services container, rename CrdtSyncService to PeerMeshService.

**Status:** completed

#### Phases

1. **Remove CRDT module wiring from startup and services container** (medium)
2. **Rename CrdtSyncService to PeerMeshService** (small)

### 4. Remove Dependencies and Types

Delete libs/crdt package, remove @automerge npm deps, clean up CRDT type exports from libs/types, delete stale test files.

**Status:** completed

#### Phases

1. **Delete libs/crdt package and remove @automerge dependencies** (small)
2. **Remove CRDT types from libs/types and clean up tests** (medium)
