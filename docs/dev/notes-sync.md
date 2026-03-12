# Notes CRDT Domain

How the notes workspace is stored, replicated, and synchronized across protoLabs instances.

## Overview

The notes workspace is backed by an **Automerge CRDT document** that provides eventual consistency across hivemind instances. Disk (`workspace.json`) remains the durable, always-available fallback that routes read and write to directly.

```
HTTP Request
     │
     ▼
Notes Routes ──── read/write ────▶ Disk (.automaker/notes/workspace.json)
     │                                      │
     │ fire-and-forget                       │ hydrate on first start
     ▼                                      ▼
CRDTStore ◀──────────────────── hydrateNotesWorkspace()
  domain=notes, id=workspace
     │
     ▼
CrdtSyncService ──── broadcast to peers
```

## Domain & Document Identity

| Property       | Value                    |
| -------------- | ------------------------ |
| Domain         | `notes`                  |
| Document ID    | `workspace`              |
| Registry key   | `notes:workspace`        |
| Full doc key   | `doc:notes/workspace`    |
| Type           | `NotesWorkspaceDocument` |
| Schema version | `1`                      |

There is exactly **one** notes workspace document per protoLabs instance. It is not scoped by project — all projects share the same workspace document within a single instance. If per-project isolation is needed in the future, the document ID can be parameterized (e.g., `workspace:${projectSlug}`).

## TypeScript Types

```ts
// libs/crdt/src/documents.ts

interface NoteTab {
  id: string;
  name: string;
  content: string; // HTML produced by TipTap editor
  permissions: {
    agentRead: boolean;
    agentWrite: boolean;
  };
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  wordCount: number;
  characterCount: number;
}

interface NotesWorkspaceDocument extends CRDTDocumentRoot {
  schemaVersion: 1;
  tabs: Record<string, NoteTab>; // keyed by tab UUID
  tabOrder: string[]; // ordered tab IDs
  activeTabId: string | null;
  updatedAt: string; // ISO 8601, workspace-level timestamp
}
```

## Hydration

When the server starts and `initCRDTStore()` is called, `hydrateNotesWorkspace()` seeds the CRDT document **once** from the existing disk file:

1. Check `store.getRegistry()` for `notes:workspace` — if present, skip (idempotent)
2. Read `.automaker/notes/workspace.json` from disk
3. Map disk format (`DiskNotesWorkspace`) to CRDT format (`NotesWorkspaceDocument`):
   - Numeric timestamps → ISO 8601 strings
   - Missing permissions → default `agentRead: true, agentWrite: false`
   - Missing tabs → empty `{}`
4. Call `store.getOrCreate<NotesWorkspaceDocument>('notes', 'workspace', initialData)`

If the disk file does not exist, an empty workspace is seeded.

Hydration is **fire-and-forget** — it does not block server startup and failures are logged at `warn` level without crashing.

## Write Path (Routes)

Notes routes write to **disk first**, then propagate to CRDT asynchronously:

```ts
// Simplified pattern from notes routes
await saveWorkspace(projectPath, workspace); // disk — synchronous, durable

// CRDT propagation is not yet wired in routes.
// The CRDTStore receives updates at hydration time only (server restart).
// Per-mutation CRDT writes are planned for a follow-up feature.
```

This means the CRDT document reflects the disk state at last startup, not in real time. Route mutations are not immediately replicated to peers. Full real-time sync requires the route-level CRDT write integration (see [Deferred Work](#deferred-work) below).

## Read Path (Routes)

All five MCP note tools call routes that **read from disk**:

| MCP Tool          | Route                        | Notes                             |
| ----------------- | ---------------------------- | --------------------------------- |
| `list_note_tabs`  | `POST /api/notes/list-tabs`  | Filters by `agentRead` permission |
| `read_note_tab`   | `POST /api/notes/get-tab`    | Enforces `agentRead` permission   |
| `write_note_tab`  | `POST /api/notes/write-tab`  | Enforces `agentWrite` permission  |
| `create_note_tab` | `POST /api/notes/create-tab` | Creates tab in disk workspace     |
| `delete_note_tab` | `POST /api/notes/delete-tab` | Cannot delete last tab            |

Reads come from `loadWorkspace()` which reads `.automaker/notes/workspace.json`. If the file does not exist, a default single-tab workspace is returned.

## Conflict Semantics

Automerge uses **last-write-wins (LWW)** for scalar fields. This applies to all tab fields:

| Field             | Conflict resolution                                             |
| ----------------- | --------------------------------------------------------------- |
| `tab.content`     | LWW — last writer wins (whole-field replacement)                |
| `tab.name`        | LWW                                                             |
| `tab.permissions` | LWW per sub-field (`agentRead`, `agentWrite`)                   |
| `tab.updatedAt`   | LWW (monotonically increasing in practice)                      |
| `tabOrder`        | Automerge list CRDT — concurrent insertions are both preserved  |
| `tabs` (map)      | Automerge map CRDT — concurrent adds/removes are both preserved |

Because `content` is LWW and not a character-level CRDT, two instances editing the same tab concurrently will lose one editor's changes. This is acceptable for the current use case (agents are the primary writers, not humans typing simultaneously).

## Fallback Behavior

When CRDT is unavailable (e.g., CRDTStore not initialized, storage error):

1. Routes read from and write to disk as normal — no degradation in functionality
2. Peers do not receive updates until CRDT is restored and routes are re-hydrated
3. The disk file is always the single-instance source of truth

The CRDT layer is additive — its absence does not break notes functionality for a single instance.

## Deferred Work

### TipTap Y.js Binding

TipTap's collaborative editing uses [Y.js](https://yjs.dev/) for per-character OT/CRDT operations. The current implementation stores tab content as a plain HTML string and uses LWW semantics. A future integration would:

1. Replace `NoteTab.content: string` with a Y.js document or encoded binary blob
2. Wire TipTap's `CollaborationExtension` to the CRDTStore via a Y.js provider
3. Enable real-time character-level merge across instances

Until this binding is implemented, `NoteTab.content` remains a LWW scalar field.

### Route-Level CRDT Writes

Currently, mutations via the notes routes (write, create, delete, rename tabs) only update disk. A follow-up feature will add fire-and-forget CRDT writes to each mutation path so that changes replicate to peers without requiring a server restart.

## Related

- [Distributed Sync](./distributed-sync.md) — CRDTStore architecture, peer mesh, and sync protocol
- [Notes Panel](./notes-panel.md) — Frontend UI for the notes workspace
- `apps/server/src/routes/notes/index.ts` — Route implementations
- `apps/server/src/services/crdt-store.module.ts` — Hydration code (`hydrateNotesWorkspace`)
- `libs/crdt/src/documents.ts` — `NotesWorkspaceDocument`, `NoteTab`, `normalizeNotesWorkspace`
