# Notes Workspace

How the notes workspace is stored and served across protoLabs instances.

> **Updated March 2026:** CRDT/Automerge sync was removed from the notes routes. The workspace is now disk-only (`workspace.json`). Each instance maintains its own copy; there is no cross-instance replication of notes.

## Overview

The notes workspace is stored as a JSON file at `.automaker/notes/workspace.json`. All reads and writes go directly to disk — there is no in-memory CRDT layer.

```
HTTP Request
     │
     ▼
Notes Routes ──── read/write ────▶ Disk (.automaker/notes/workspace.json)
```

## TypeScript Types

```ts
// apps/server/src/routes/notes/index.ts

interface NoteTab {
  id: string;
  name: string;
  content: string; // HTML produced by TipTap editor
  permissions: {
    agentRead: boolean;
    agentWrite: boolean;
  };
  metadata: {
    createdAt: string; // ISO 8601
    updatedAt: string; // ISO 8601
    wordCount: number;
    characterCount: number;
  };
}

interface NotesWorkspace {
  tabs: Record<string, NoteTab>; // keyed by tab UUID
  tabOrder: string[]; // ordered tab IDs
  activeTabId: string | null;
  version: number;
}
```

## Write Path (Routes)

Notes routes write to disk and emit EventBus events:

```ts
await saveWorkspace(projectPath, workspace); // disk — synchronous, durable
eventEmitter.broadcast('notes:tab-updated', { projectPath, tabId });
```

EventBus events emitted by notes routes:

| Event                           | When                             |
| ------------------------------- | -------------------------------- |
| `notes:tab-created`             | New tab created                  |
| `notes:tab-updated`             | Tab content written              |
| `notes:tab-deleted`             | Tab deleted                      |
| `notes:tab-renamed`             | Tab renamed                      |
| `notes:tab-permissions-changed` | `agentRead`/`agentWrite` updated |

## Read Path (Routes)

All five MCP note tools call routes that read from disk:

| MCP Tool            | Route                          | Notes                             |
| ------------------- | ------------------------------ | --------------------------------- |
| `list_note_tabs`    | `POST /api/notes/list-tabs`    | Filters by `agentRead` permission |
| `read_note_tab`     | `POST /api/notes/get-tab`      | Enforces `agentRead` permission   |
| `write_note_tab`    | `POST /api/notes/write-tab`    | Enforces `agentWrite` permission  |
| `create_note_tab`   | `POST /api/notes/create-tab`   | Creates tab in disk workspace     |
| `delete_note_tab`   | `POST /api/notes/delete-tab`   | Cannot delete last tab            |
| `rename_note_tab`   | `POST /api/notes/rename-tab`   | Renames existing tab              |
| `reorder_note_tabs` | `POST /api/notes/reorder-tabs` | Sets tabOrder array               |

Reads come from `loadWorkspace()` which reads `.automaker/notes/workspace.json`. If the file does not exist, a default single-tab workspace is returned.

## Default Workspace

If no `workspace.json` exists, routes return:

```json
{
  "tabs": {
    "<uuid>": {
      "id": "<uuid>",
      "name": "Notes",
      "content": "",
      "permissions": { "agentRead": true, "agentWrite": true },
      "metadata": {
        "createdAt": "<now>",
        "updatedAt": "<now>",
        "wordCount": 0,
        "characterCount": 0
      }
    }
  },
  "tabOrder": ["<uuid>"],
  "activeTabId": "<uuid>",
  "version": 1
}
```

## Multi-Instance Behavior

Notes are **not replicated** across Hivemind instances. Each instance has its own `workspace.json`. If you need the same notes on multiple instances, copy the file manually or use git to sync it.

## Related

- [Distributed Sync](./distributed-sync.md) — Peer mesh architecture and sync protocol
- [Notes Panel](./notes-panel.md) — Frontend UI for the notes workspace
- `apps/server/src/routes/notes/index.ts` — Route implementations
