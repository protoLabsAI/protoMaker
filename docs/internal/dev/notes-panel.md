# Notes panel

Per-project rich text notes with TipTap editor, tabbed workspace, AI writing assistance, and agent tool integration.

## Storage

Notes are stored at `.automaker/notes/workspace.json` — a single JSON file per project containing all tabs and content.

The workspace includes an optional `workspaceVersion` counter (monotonic integer) that increments on every server-side mutation. This enables change detection and future optimistic concurrency control.

## API routes

### Notes CRUD

| Route                                    | Body                                             | Purpose                          |
| ---------------------------------------- | ------------------------------------------------ | -------------------------------- |
| `POST /api/notes/get`                    | `{ projectPath }`                                | Load workspace or return default |
| `POST /api/notes/save`                   | `{ projectPath, workspace }`                     | Save workspace (blob)            |
| `POST /api/notes/get-tab`                | `{ projectPath, tabId }`                         | Single tab content (for chat)    |
| `POST /api/notes/list-tabs`              | `{ projectPath, includeRestricted? }`            | Tab listing with permissions     |
| `POST /api/notes/write-tab`              | `{ projectPath, tabId, content, mode? }`         | Agent write-back to a tab        |
| `POST /api/notes/create-tab`             | `{ projectPath, name?, content?, permissions? }` | Create a new tab                 |
| `POST /api/notes/delete-tab`             | `{ projectPath, tabId }`                         | Delete a tab (not the last one)  |
| `POST /api/notes/rename-tab`             | `{ projectPath, tabId, name }`                   | Rename a tab                     |
| `POST /api/notes/update-tab-permissions` | `{ projectPath, tabId, permissions }`            | Update agentRead/agentWrite      |
| `POST /api/notes/reorder-tabs`           | `{ projectPath, tabOrder }`                      | Reorder tabs                     |

Granular routes (`create-tab`, `delete-tab`, `rename-tab`, `update-tab-permissions`, `reorder-tabs`, `write-tab`) emit WebSocket events so the UI can react to agent-initiated changes. They also increment `workspaceVersion` and return it in the response.

### AI streaming endpoints

All AI endpoints return SSE text streams. They power the inline editor features described below.

| Route                   | Body                                         | Model  | Purpose                  |
| ----------------------- | -------------------------------------------- | ------ | ------------------------ |
| `POST /api/ai/complete` | `{ context?, currentLine? }`                 | Haiku  | Ghost text autocomplete  |
| `POST /api/ai/rewrite`  | `{ text, instruction, surroundingContext? }` | Sonnet | Selection rewrite        |
| `POST /api/ai/generate` | `{ command, context, selection? }`           | Sonnet | Slash command generation |

## Tab permissions

Each tab has two permission flags:

- **agentRead** — Whether AI agents and the chat sidebar can see the tab's content
- **agentWrite** — Whether AI agents can write to the tab via MCP tools or the `/api/notes/write-tab` endpoint

When `agentRead` is false, the tab name still appears in the chat context listing but content is excluded. The `get-tab` route enforces `agentRead` — requests for tabs with `agentRead: false` return 403.

Permissions can be updated programmatically via the `update_note_tab_permissions` MCP tool or the `/api/notes/update-tab-permissions` route.

## AI editor features

The notes editor integrates three AI writing features, all powered by the streaming endpoints above.

### Ghost text autocomplete

Copilot-style inline predictions. As you type, the editor requests a short continuation (5-15 words) from Haiku after a 500ms debounce. The prediction appears as gray phantom text at the cursor position.

- **Tab** — Accept the suggestion (inserts into the document)
- **Escape** — Dismiss the suggestion
- Any other typing dismisses the current suggestion and triggers a new one

Implementation: ProseMirror `Plugin` with `Decoration.widget` renders a span with class `.ghost-text-suggestion`. An `AbortController` cancels in-flight requests when the user types again.

### AI bubble menu

Select any text to reveal a floating toolbar with AI actions. Five presets plus a custom prompt input:

| Action   | Instruction                        |
| -------- | ---------------------------------- |
| Rewrite  | Rewrite this more clearly          |
| Shorten  | Make this shorter and more concise |
| Fix      | Fix grammar and spelling           |
| Pro tone | Rewrite in a professional tone     |
| Expand   | Expand with more detail            |
| Custom   | Any freeform instruction you type  |

The response streams in via `/api/ai/rewrite` and replaces the selected text using `editor.commands.insertContentAt({ from, to }, result)`.

A second row of actions sends selected text to processing pipelines:

| Action    | Pipeline        | Purpose                           |
| --------- | --------------- | --------------------------------- |
| Blog Post | Content (guide) | Generate a blog post from snippet |
| Social    | Content (guide) | Generate social media content     |
| Docs      | Content (ref)   | Generate reference documentation  |
| Idea      | Authority       | Inject into the idea pipeline     |

Error handling: failed AI rewrites show a `toast.error('AI rewrite failed')` notification via Sonner.

### Slash commands

Type `/` at the start of a line or after a space to open the command palette. Commands are divided into AI and formatting categories:

**AI commands** (call `/api/ai/generate`):

| Command          | Description                     |
| ---------------- | ------------------------------- |
| Continue writing | AI continues from cursor        |
| Summarize        | Summarize the document so far   |
| Expand           | Expand with more detail         |
| Fix grammar      | Fix grammar and spelling errors |
| Professional     | Rewrite in professional tone    |

**Formatting commands** (instant, no AI):

| Command    | Description       |
| ---------- | ----------------- |
| Heading 1  | Insert H1         |
| Heading 2  | Insert H2         |
| Heading 3  | Insert H3         |
| Bullet     | Bullet list       |
| Numbered   | Numbered list     |
| Quote      | Blockquote        |
| Code block | Fenced code block |
| Divider    | Horizontal rule   |

Navigate with arrow keys, select with Enter, dismiss with Escape. The popup uses `tippy.js` for positioning and `ReactRenderer` from `@tiptap/react` for the React component.

Error handling: failed AI generation shows a `toast.error('AI generation failed')` notification. Ghost text failures are intentionally silent.

## Toolbar

The toolbar (`notes-toolbar.tsx`) groups formatting actions into four sections separated by dividers.

### Button groups

| Group    | Buttons                                                       |
| -------- | ------------------------------------------------------------- |
| History  | Undo, Redo                                                    |
| Inline   | Bold, Italic, Strikethrough, Underline, Code, Highlight, Link |
| Headings | H1, H2, H3                                                    |
| Block    | Bullet list, Ordered list, Task list, Blockquote, Code block  |

A trailing eye/eye-off toggle controls the `agentRead` permission for the active tab.

### Keyboard shortcuts

Shortcuts are shown as `<kbd>` hints in toolbar button tooltips.

| Action        | Shortcut |
| ------------- | -------- |
| Undo          | `⌘Z`     |
| Redo          | `⇧⌘Z`    |
| Bold          | `⌘B`     |
| Italic        | `⌘I`     |
| Strikethrough | `⌘⇧S`    |
| Underline     | `⌘U`     |
| Inline code   | `⌘E`     |
| Highlight     | `⌘⇧H`    |
| Link          | `⌘K`     |

Heading, list, blockquote, and code block buttons do not have default shortcuts.

### Link handling

The Link button toggles between setting and unsetting a link. When setting, it uses `window.prompt()` to collect the URL. Links render with the `--primary` theme color and underline styling. `openOnClick` is disabled so clicking a link in the editor doesn't navigate away.

## Agent notes tools

AI agents can read and write notes programmatically via MCP tools that call the server REST API.

### MCP tools

| MCP Tool                      | Parameters                                    | Description                                |
| ----------------------------- | --------------------------------------------- | ------------------------------------------ |
| `list_note_tabs`              | `projectPath, includeRestricted?`             | List tabs with permissions and word counts |
| `read_note_tab`               | `projectPath, tabId`                          | Read tab content (requires agentRead)      |
| `write_note_tab`              | `projectPath, tabId, content, mode?`          | Write to tab (requires agentWrite)         |
| `create_note_tab`             | `projectPath, name?, content?, permissions?`  | Create a new tab                           |
| `delete_note_tab`             | `projectPath, tabId`                          | Delete a tab (cannot delete last tab)      |
| `rename_note_tab`             | `projectPath, tabId, name`                    | Rename a tab                               |
| `update_note_tab_permissions` | `projectPath, tabId, agentRead?, agentWrite?` | Update agent permissions for a tab         |
| `reorder_note_tabs`           | `projectPath, tabOrder`                       | Reorder tabs (provide full ID array)       |

The `mode` parameter for `write_note_tab` accepts `"replace"` (default) or `"append"`.

## WebSocket events

Granular mutation routes emit these events so the UI can react to agent-initiated workspace changes:

| Event                           | Payload                               | Trigger                        |
| ------------------------------- | ------------------------------------- | ------------------------------ |
| `notes:tab-created`             | `{ projectPath, tabId, name }`        | `create-tab` route             |
| `notes:tab-deleted`             | `{ projectPath, tabId }`              | `delete-tab` route             |
| `notes:tab-renamed`             | `{ projectPath, tabId, name }`        | `rename-tab` route             |
| `notes:tab-updated`             | `{ projectPath, tabId, name }`        | `write-tab` route              |
| `notes:tab-permissions-changed` | `{ projectPath, tabId, permissions }` | `update-tab-permissions` route |

## Context-aware chat

When the user navigates to `/notes`, the chat sidebar injects notes context into the request body. The server selects a persona based on the active tab name:

| Persona       | Keywords                                                                          | Style                     |
| ------------- | --------------------------------------------------------------------------------- | ------------------------- |
| **Jon** (GTM) | blog, post, social, marketing, content, newsletter, tweet, linkedin, announcement | Creative, audience-aware  |
| **Ava** (Ops) | prd, spec, design, architecture, ops, runbook, doc, plan, rfc                     | Precise, structured       |
| **Writer**    | (default)                                                                         | General writing assistant |

## TipTap extensions

The editor uses these extensions:

| Extension     | Source                          | Purpose                                    |
| ------------- | ------------------------------- | ------------------------------------------ |
| StarterKit    | `@tiptap/starter-kit`           | Headings, bold, italic, lists, history     |
| Placeholder   | `@tiptap/extension-placeholder` | Empty editor placeholder text              |
| Link          | `@tiptap/extension-link`        | Hyperlinks (openOnClick disabled)          |
| Underline     | `@tiptap/extension-underline`   | Underline mark                             |
| Highlight     | `@tiptap/extension-highlight`   | Yellow highlight mark                      |
| TaskList      | `@tiptap/extension-task-list`   | Checkbox list container                    |
| TaskItem      | `@tiptap/extension-task-item`   | Checkbox list items (nested supported)     |
| GhostText     | `extensions/ghost-text.ts`      | Copilot-style autocomplete                 |
| SlashCommands | `extensions/slash-commands.ts`  | `/` command palette via @tiptap/suggestion |

## Key files

| File                                                                   | Purpose                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------- |
| `libs/types/src/notes.ts`                                              | NoteTab, NotesWorkspace types                       |
| `libs/platform/src/paths.ts`                                           | getNotesDir, getNotesWorkspacePath                  |
| `apps/server/src/routes/notes/index.ts`                                | CRUD + granular agent routes                        |
| `apps/server/src/routes/ai/index.ts`                                   | AI streaming endpoints                              |
| `apps/server/src/routes/chat/personas.ts`                              | Persona selection and prompts                       |
| `apps/ui/src/store/notes-store.ts`                                     | Zustand store with debounced save                   |
| `apps/ui/src/components/views/notes-view/tiptap-editor.tsx`            | Main editor component                               |
| `apps/ui/src/components/views/notes-view/notes-toolbar.tsx`            | Formatting toolbar with shortcut hints              |
| `apps/ui/src/components/views/notes-view/ai-bubble-menu.tsx`           | Selection-based AI actions + pipeline send          |
| `apps/ui/src/components/views/notes-view/extensions/ghost-text.ts`     | ProseMirror plugin for autocomplete                 |
| `apps/ui/src/components/views/notes-view/extensions/slash-commands.ts` | Slash command trigger and items                     |
| `apps/ui/src/components/views/notes-view/slash-command-list.tsx`       | Popup UI for slash commands                         |
| `apps/ui/src/styles/global.css`                                        | ProseMirror prose styles (links, highlights, tasks) |
| `packages/mcp-server/src/index.ts`                                     | MCP tool definitions                                |
