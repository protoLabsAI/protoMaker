# Notes Panel

Per-project rich text notes with Tiptap editor, tabbed workspace, and context-aware chat integration.

## Storage

Notes are stored at `.automaker/notes/workspace.json` — a single JSON file per project containing all tabs and content.

## API Routes

| Route                       | Body                         | Purpose                          |
| --------------------------- | ---------------------------- | -------------------------------- |
| `POST /api/notes/get`       | `{ projectPath }`            | Load workspace or return default |
| `POST /api/notes/save`      | `{ projectPath, workspace }` | Save workspace                   |
| `POST /api/notes/get-tab`   | `{ projectPath, tabId }`     | Single tab content (for chat)    |
| `POST /api/notes/list-tabs` | `{ projectPath }`            | Tab listing with permissions     |

## Tab Permissions

Each tab has two permission flags:

- **agentRead** — Whether the chat sidebar can see the tab's content
- **agentWrite** — Reserved for future agent write-back capability

When `agentRead` is false, the tab name still appears in the chat context listing but content is excluded.

## Context-Aware Chat

When the user navigates to `/notes`, the chat sidebar injects notes context into the request body. The server selects a persona based on the active tab name:

| Persona       | Keywords                                                                          | Style                     |
| ------------- | --------------------------------------------------------------------------------- | ------------------------- |
| **Jon** (GTM) | blog, post, social, marketing, content, newsletter, tweet, linkedin, announcement | Creative, audience-aware  |
| **Ava** (Ops) | prd, spec, design, architecture, ops, runbook, doc, plan, rfc                     | Precise, structured       |
| **Writer**    | (default)                                                                         | General writing assistant |

## Tiptap Extensions

MVP uses **StarterKit** and **Placeholder** only. This provides headings, bold, italic, strike, code, lists, blockquote, and code blocks.

## Key Files

| File                                          | Purpose                                            |
| --------------------------------------------- | -------------------------------------------------- |
| `libs/types/src/notes.ts`                     | NoteTab, NotesWorkspace types                      |
| `libs/platform/src/paths.ts`                  | getNotesDir, getNotesWorkspacePath, ensureNotesDir |
| `apps/server/src/routes/notes/index.ts`       | CRUD routes                                        |
| `apps/server/src/routes/chat/personas.ts`     | Persona selection and prompts                      |
| `apps/ui/src/store/notes-store.ts`            | Zustand store with debounced save                  |
| `apps/ui/src/components/views/notes-view.tsx` | Main view component                                |
| `apps/ui/src/components/views/notes-view/`    | Tab bar, toolbar, editor, status bar               |
