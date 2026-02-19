# Notes panel

Per-project rich text notes with TipTap editor, tabbed workspace, AI writing assistance, and agent tool integration.

## Storage

Notes are stored at `.automaker/notes/workspace.json` — a single JSON file per project containing all tabs and content.

## API routes

### Notes CRUD

| Route                       | Body                                     | Purpose                          |
| --------------------------- | ---------------------------------------- | -------------------------------- |
| `POST /api/notes/get`       | `{ projectPath }`                        | Load workspace or return default |
| `POST /api/notes/save`      | `{ projectPath, workspace }`             | Save workspace                   |
| `POST /api/notes/get-tab`   | `{ projectPath, tabId }`                 | Single tab content (for chat)    |
| `POST /api/notes/list-tabs` | `{ projectPath, includeRestricted? }`    | Tab listing with permissions     |
| `POST /api/notes/write-tab` | `{ projectPath, tabId, content, mode? }` | Agent write-back to a tab        |

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

When `agentRead` is false, the tab name still appears in the chat context listing but content is excluded.

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

## Agent notes tools

AI agents can read and write notes programmatically via shared tools in `@automaker/tools` and corresponding MCP tools.

### MCP tools

| MCP Tool         | Parameters                           | Description                                |
| ---------------- | ------------------------------------ | ------------------------------------------ |
| `list_note_tabs` | `projectPath, includeRestricted?`    | List tabs with permissions and word counts |
| `read_note_tab`  | `projectPath, tabId`                 | Read tab content (requires agentRead)      |
| `write_note_tab` | `projectPath, tabId, content, mode?` | Write to tab (requires agentWrite)         |

The `mode` parameter for `write_note_tab` accepts `"replace"` (default) or `"append"`.

### Shared tool functions

Available from `@automaker/tools` for use in LangGraph flows and custom agents:

```typescript
import { listTabs, readTab, writeTab } from '@automaker/tools';

// List all agent-readable tabs
const result = await listTabs(context, { projectPath: '/path/to/project' });

// Read a specific tab
const tab = await readTab(context, { projectPath: '/path/to/project', tabId: 'tab-id' });

// Append to a tab
await writeTab(context, {
  projectPath: '/path/to/project',
  tabId: 'tab-id',
  content: '<p>Agent-generated content</p>',
  mode: 'append',
});
```

The `ToolContext` must include a `notesLoader` service for these tools to work:

```typescript
const context: ToolContext = {
  notesLoader: {
    load: (projectPath) => loadWorkspace(projectPath),
    save: (projectPath, workspace) => saveWorkspace(projectPath, workspace),
  },
  events: { emit: (event, data) => eventEmitter.emit(event, data) },
};
```

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
| StarterKit    | `@tiptap/starter-kit`           | Headings, bold, italic, lists, etc.        |
| Placeholder   | `@tiptap/extension-placeholder` | Empty editor placeholder text              |
| GhostText     | `extensions/ghost-text.ts`      | Copilot-style autocomplete                 |
| SlashCommands | `extensions/slash-commands.ts`  | `/` command palette via @tiptap/suggestion |

## Key files

| File                                                                   | Purpose                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------ |
| `libs/types/src/notes.ts`                                              | NoteTab, NotesWorkspace types                    |
| `libs/platform/src/paths.ts`                                           | getNotesDir, getNotesWorkspacePath               |
| `apps/server/src/routes/notes/index.ts`                                | CRUD + agent write routes                        |
| `apps/server/src/routes/ai/index.ts`                                   | AI streaming endpoints                           |
| `apps/server/src/routes/chat/personas.ts`                              | Persona selection and prompts                    |
| `apps/ui/src/store/notes-store.ts`                                     | Zustand store with debounced save                |
| `apps/ui/src/components/views/notes-view/tiptap-editor.tsx`            | Main editor component                            |
| `apps/ui/src/components/views/notes-view/ai-bubble-menu.tsx`           | Selection-based AI actions                       |
| `apps/ui/src/components/views/notes-view/extensions/ghost-text.ts`     | ProseMirror plugin for autocomplete              |
| `apps/ui/src/components/views/notes-view/extensions/slash-commands.ts` | Slash command trigger and items                  |
| `apps/ui/src/components/views/notes-view/slash-command-list.tsx`       | Popup UI for slash commands                      |
| `libs/tools/src/domains/notes/`                                        | Shared agent tools (listTabs, readTab, writeTab) |
| `packages/mcp-server/src/index.ts`                                     | MCP tool definitions                             |
