# Ava Chat System

The Ava chat system is the primary interface for interacting with protoLabs Studio. Built on Vercel AI SDK v6, it renders tool results as custom React components, displays chain-of-thought reasoning, supports inline citations, groups multi-tool operations into task blocks, and gates destructive actions with HITL confirmations.

## Architecture

```
Client (React)                           Server (Express)
--------------                           ----------------
ChatMessageList                          POST /api/chat
  ChatMessage (per step bubble)            loadAvaConfig()
    ChainOfThought                         buildAvaTools() -- gated by config
    ToolInvocationPart                     getSitrep() -- live board context
      toolResultRegistry.get()             loadContextFiles()
      ConfirmationCard (HITL)              streamText() -- Vercel AI SDK
    TaskBlock (multi-tool)                 extractCitations()
    ChatMessageMarkdown
      InlineCitation
  ChatInput
    model selector
```

### Message Flow

1. Client sends `{ messages, projectPath, model? }` to `POST /api/chat`
2. Server loads `AvaConfig` from `.automaker/ava-config.json`
3. Server builds tools gated by `config.toolGroups`
4. Server injects sitrep + context files into system prompt
5. `streamText()` streams SSE: text, reasoning, tool calls, step boundaries
6. Server extracts `[[feature:id]]` / `[[doc:path]]` citations, writes as `data-citations` chunk
7. Client renders each step as its own bubble with custom tool result cards

## Architecture Pipeline

The full end-to-end pipeline from a user's chat input through tool execution, agent delegation, and response streaming:

### Full Request Flow

```
Chat UI (ChatInput)
  │  { messages, projectPath, model? }
  ▼
POST /api/chat
  ├── loadAvaConfig(projectPath)
  │     → AvaConfig { model, toolGroups, mcpServers, subagentTrust,
  │                   sitrepInjection, contextInjection, systemPromptExtension }
  ├── getSitrep(projectPath)           [if sitrepInjection: true]
  ├── loadContextFiles(projectPath)    [if contextInjection: true]
  ├── buildAvaSystemPrompt()
  │     → AVA_BASE_PROMPT (personas.ts)
  │     + ava-prompt.md               (UI chat surface)
  │     + CLAUDE.md                   (project root)
  │     + sitrep                      (live board state)
  │     + systemPromptExtension       (user custom text)
  ├── buildAvaTools(projectPath, services, config)
  │     → tool set gated by config.toolGroups flags
  └── streamText({ tools, maxSteps: 10 })
        │
        ├── [text chunk]  → SSE text delta → ChatMessageMarkdown
        ├── [reasoning]   → SSE reasoning delta → ChainOfThought
        ├── [tool-call]   → SSE tool-call → ToolInvocationPart (input-streaming)
        │     ├── needsApproval?  → approval-requested → ConfirmationCard
        │     │     User approves → re-request with approvedActions
        │     │     User rejects  → result = "denied"
        │     └── tool executes  → SSE tool-result → ToolInvocationPart (output-available)
        ├── [step-start]  → groupByStep() splits into separate bubbles
        └── [done]        → extractCitations() → data-citations chunk
```

### Prompt Chain

The Ava system prompt is assembled in layers by `buildAvaSystemPrompt()` in `personas.ts`:

```
Layer 1: AVA_BASE_PROMPT          — Fixed persona header (always injected)
Layer 2: ava-prompt.md            — UI chat body: tool guidance, HITL awareness, citations
Layer 3: CLAUDE.md                — Project-level instructions (if file exists at root)
Layer 4: sitrep                   — Live board state: feature counts, running agents
Layer 5: systemPromptExtension    — User-supplied custom text from AvaConfig
```

Each layer is optional except Layer 1 (base prompt) and Layer 2 (chat prompt body). If `sitrepInjection: false` in AvaConfig, Layer 4 is omitted. If `contextInjection: false`, CLAUDE.md and `.automaker/context/` files are omitted.

### HITL Detailed Flow

```
1. streamText emits tool-call for a destructive tool (delete_feature, stop_agent, etc.)
2. ava-tools.ts: needsApproval(toolName, approvedActions) → true
3. Server returns partial result: { __hitl: true, action, summary, inputHash }
4. SSE tool-result → ToolInvocationPart state = 'approval-requested'
5. Client renders ConfirmationCard inline (no modal, inline in message bubble)
6. User clicks Approve:
     → useChat re-sends messages with approvedActions: [{ toolName, inputHash }]
     → Server finds matching hash → executes tool → returns real result
     → ToolInvocationPart state = 'output-available'
7. User clicks Reject:
     → Client marks tool result = "denied"
     → ToolInvocationPart state = 'output-denied'
     → Ava receives "denied" in next step, acknowledges to user
```

The `inputHash` is a stable JSON hash of the tool arguments. This ensures approvals are scoped to the exact invocation — re-approving a different set of arguments requires a new approval.

### AvaConfig Reference

Full set of supported fields, including newer delegation and trust fields:

```typescript
interface AvaConfig {
  // Model
  model: 'haiku' | 'sonnet' | 'opus';

  // Tool access gates
  toolGroups: {
    boardRead: boolean; // get_board_summary, list_features, get_feature
    boardWrite: boolean; // create_feature, update_feature, move_feature, delete_feature
    agentControl: boolean; // list_running_agents, start_agent, stop_agent, get_agent_output
    autoMode: boolean; // get_auto_mode_status, start_auto_mode, stop_auto_mode
    projectMgmt: boolean; // get_project_spec, update_project_spec
    orchestration: boolean; // get_execution_order, set_feature_dependencies
    notes: boolean; // notes read/write tools
    metrics: boolean; // metrics and DORA tools
    prWorkflow: boolean; // PR workflow tools
    promotion: boolean; // release/promotion tools
    contextFiles: boolean; // context file management tools
    projects: boolean; // project management tools
    briefing: boolean; // get_briefing tool
    avaChannel: boolean; // Ava Channel read/write tools
    discord: boolean; // Discord message tools
    calendar: boolean; // calendar event tools
    health: boolean; // health status tools
    settings: boolean; // settings read/write tools
  };

  // Context injection
  sitrepInjection: boolean; // Inject live board state into system prompt
  contextInjection: boolean; // Inject .automaker/context/ files into prompt

  // Custom prompt
  systemPromptExtension: string; // Appended after all other prompt layers

  // Tool approval
  autoApproveTools: boolean; // When true, destructive tools skip HITL confirmation

  // Agent delegation
  mcpServers?: MCPServerConfig[]; // Custom MCP servers for inner agents
  subagentTrust: 'full' | 'gated'; // 'full' = bypassPermissions; 'gated' = approval flow
}
```

All fields default to enabled. `subagentTrust` defaults to `'full'`. `mcpServers` defaults to `[]`. See `apps/server/src/routes/chat/ava-config.ts`.

## Server API

### `POST /api/chat`

Main chat endpoint. Uses Vercel AI SDK `streamText()`.

**Request body:**

```typescript
{
  messages: UIMessage[];       // useChat-compatible message array
  projectPath: string;         // Project root for tool context
  model?: 'haiku' | 'sonnet' | 'opus';  // Override model
}
```

**Response:** Server-Sent Events (SSE) stream containing:

- Text chunks (streaming markdown)
- Reasoning chunks (extended thinking)
- Tool invocation parts (call + result)
- Step boundaries (`step-start`)
- Citations (`data-citations`)

### `GET /api/ava/config` / `POST /api/ava/config`

Read/write per-project AvaConfig.

### AvaConfig

Stored at `{projectPath}/.automaker/ava-config.json`. See the [AvaConfig Reference](#avaconfig-reference) section above for the full interface definition. All fields default to enabled. See `apps/server/src/routes/chat/ava-config.ts`.

## Tool Groups

| Group         | Representative Tools                                                   | Custom Card                                                |
| ------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| boardRead     | `get_board_summary`, `list_features`, `get_feature`                    | `BoardSummaryCard`, `FeatureListCard`, `FeatureDetailCard` |
| boardWrite    | `create_feature`, `update_feature`, `move_feature`, `delete_feature`   | `FeatureCreatedCard`, `FeatureUpdatedCard`, HITL           |
| agentControl  | `start_agent`, `stop_agent`, `list_running_agents`, `get_agent_output` | `AgentStatusCard`, `AgentOutputCard`                       |
| autoMode      | `get_auto_mode_status`, `start_auto_mode`, `stop_auto_mode`            | `AutoModeStatusCard`                                       |
| projectMgmt   | `get_project_spec`, `update_project_spec`                              | HITL for write ops                                         |
| orchestration | `get_execution_order`, `set_feature_dependencies`                      | `ExecutionOrderCard`                                       |
| notes         | notes read/write tools                                                 | (JSON fallback)                                            |
| metrics       | metrics and DORA tools                                                 | (JSON fallback)                                            |
| prWorkflow    | PR workflow tools                                                      | (JSON fallback)                                            |
| promotion     | release/promotion tools                                                | (JSON fallback)                                            |
| contextFiles  | context file management tools                                          | (JSON fallback)                                            |
| projects      | project management tools                                               | (JSON fallback)                                            |
| briefing      | `get_briefing`                                                         | (JSON fallback)                                            |
| avaChannel    | Ava Channel read/write tools                                           | (JSON fallback)                                            |
| discord       | Discord message tools                                                  | (JSON fallback)                                            |
| calendar      | calendar event tools                                                   | (JSON fallback)                                            |
| health        | health status tools                                                    | (JSON fallback)                                            |
| settings      | settings read/write tools                                              | (JSON fallback)                                            |

## HITL Confirmation Flow

Destructive tools (`delete_feature`, `stop_agent`, `update_project_spec`) require user approval:

```
1. Server: tool called --> check approvedActions
2. If not approved --> return { __hitl: true, action, summary, input }
3. Client: ConfirmationCard renders inline (not modal)
4. User clicks Approve --> re-sends request with approvedActions[{ toolName, inputHash }]
5. Server: finds approval match --> executes tool
6. User clicks Reject --> tool result = "denied", Ava acknowledges
```

The `inputHash` is a stable JSON hash of the tool arguments, ensuring approvals are scoped to the exact invocation.

## UI Components

All chat components live in `libs/ui/src/ai/` and are exported from `@protolabsai/ui/ai`.

### Rendering Pipeline

```
UIMessage.parts[]
  --> buildSegments()           // Collapse consecutive tools into groups
  --> groupByStep()             // Split at step-start into separate bubbles
  --> ChatMessage
        --> per bubble:
              MessageProgressIndicator (while streaming)
              ToolInvocationPart | TaskBlock (tool segments)
              MessagePartRenderer (text, reasoning, source-url)
              MessageSources (citations)
```

### Component Catalog

| Component             | File                        | Purpose                                              |
| --------------------- | --------------------------- | ---------------------------------------------------- |
| `ChatMessage`         | `chat-message.tsx`          | Role-based message with step-split bubbles           |
| `ChatMessageList`     | `chat-message-list.tsx`     | Scrollable container, stick-to-bottom, scroll button |
| `ChatInput`           | `chat-input.tsx`            | Auto-resize textarea, model selector toolbar         |
| `ChatMessageMarkdown` | `chat-message-markdown.tsx` | remark-gfm, syntax highlighting, citations           |
| `CodeBlock`           | `code-block.tsx`            | Prism.js highlighting, 14 languages, copy button     |
| `ChainOfThought`      | `chain-of-thought.tsx`      | Step-by-step reasoning, auto-open/collapse, duration |
| `ToolInvocationPart`  | `tool-invocation-part.tsx`  | Single tool card, registry lookup, state badges      |
| `TaskBlock`           | `task-block.tsx`            | Multi-tool grouping, collapsible, inferred title     |
| `ConfirmationCard`    | `confirmation-card.tsx`     | HITL Approve/Reject inline UI                        |
| `InlineFormCard`      | `inline-form-card.tsx`      | Inline HITL form rendered from JSON Schema           |
| `InlineCitation`      | `inline-citation.tsx`       | Numbered badge with hover popover                    |
| `MessageSources`      | `message-sources.tsx`       | Sources list below message                           |
| `MessageActions`      | `message-actions.tsx`       | Copy, retry, and action buttons per message          |
| `PlanPart`            | `plan-part.tsx`             | Structured plan display within messages              |
| `ReasoningPart`       | `reasoning-part.tsx`        | Simple reasoning wrapper                             |
| `Loader`              | `loader.tsx`                | Typing/loading indicator                             |
| `Shimmer`             | `shimmer.tsx`               | Skeleton loading animation for streaming             |
| `Suggestion`          | `suggestion.tsx`            | Empty state suggestion chips                         |
| `QueueView`           | `queue-view.tsx`            | Agent queue visualization                            |
| `PromptInputContext`  | `prompt-input-context.tsx`  | Input state context provider                         |
| `toolResultRegistry`  | `tool-result-registry.tsx`  | Maps tool names to custom React renderers            |

### Tool Result Cards

| Card                 | Tool                        | File                                     |
| -------------------- | --------------------------- | ---------------------------------------- |
| `BoardSummaryCard`   | `get_board_summary`         | `tool-results/board-summary-card.tsx`    |
| `FeatureListCard`    | `list_features`             | `tool-results/feature-list-card.tsx`     |
| `FeatureDetailCard`  | `get_feature`               | `tool-results/feature-detail-card.tsx`   |
| `FeatureCreatedCard` | `create_feature`            | `tool-results/feature-created-card.tsx`  |
| `FeatureUpdatedCard` | `update_feature`            | `tool-results/feature-updated-card.tsx`  |
| `MoveFeatureCard`    | `move_feature`              | `tool-results/feature-updated-card.tsx`  |
| `AgentStatusCard`    | `start_agent`, `stop_agent` | `tool-results/agent-status-card.tsx`     |
| `AgentOutputCard`    | `get_agent_output`          | `tool-results/agent-output-card.tsx`     |
| `AutoModeStatusCard` | `get_auto_mode_status`      | `tool-results/auto-mode-status-card.tsx` |
| `ExecutionOrderCard` | `get_execution_order`       | `tool-results/execution-order-card.tsx`  |
| `ArtifactCard`       | `generate_artifact`         | `tool-results/artifact-card.tsx`         |
| `ImageCard`          | `generate_image`            | `tool-results/image-card.tsx`            |
| `WebPreviewCard`     | `generate_html`             | `tool-results/web-preview-card.tsx`      |

### Adding a New Tool Result Card

1. Create `libs/ui/src/ai/tool-results/my-card.tsx`:

```typescript
import type { ToolResultRendererProps } from '../tool-result-registry.js';

export function MyCard({ output, state, toolName }: ToolResultRendererProps) {
  const data = extractData(output);
  if (!data) return null;
  return <div>...</div>;
}

function extractData(output: unknown) {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  // Unwrap ToolResult envelope: { success: true, data: {...} }
  if ('success' in o && 'data' in o) return o.data;
  return o;
}
```

2. Export from `libs/ui/src/ai/index.ts`
3. Register in `tool-invocation-part.tsx`:

```typescript
import { MyCard } from './tool-results/my-card.js';
toolResultRegistry.register('my_tool_name', MyCard);
```

4. Rebuild: `npx turbo run build --filter="@protolabsai/ui"`

### Tool State Machine

```typescript
type ToolState =
  | 'input-streaming' // Args streaming from server
  | 'input-available' // Args received, tool executing
  | 'approval-requested' // Destructive tool, awaiting HITL
  | 'approval-responded' // User approved, now executing
  | 'output-available' // Tool completed successfully
  | 'output-error' // Tool failed
  | 'output-denied'; // User rejected destructive tool
```

## Citations

### Server-side

The chat route scans assistant text for `[[feature:id]]` and `[[doc:path]]` patterns after streaming completes. Features are resolved via `FeatureLoader.get()`. Results are written as a `data-citations` chunk.

### Client-side

`ChatMessageMarkdown` preprocesses citation markers into `<span class="citation" data-citation-*>` elements. The custom `span` handler renders `InlineCitation` badges with numbered superscripts and hover popovers.

### Ava's System Prompt

The Ava system prompt is assembled from two sources by `buildAvaSystemPrompt()` in `personas.ts`:

1. **`AVA_BASE_PROMPT`** — the fixed persona header (always injected)
2. **`projectContext`** — loaded by `loadAvaContext()`, which reads:
   - `CLAUDE.md` at the project root (project-specific instructions)
   - The Ava prompt body (see below)

#### Prompt File Separation

The Ava UI chat and the `/ava` CLI skill use **separate prompt files**:

| Surface              | File                                                    | Purpose                                                                                                                                   |
| -------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **UI chat**          | `apps/server/src/routes/chat/ava-prompt.md`             | UI-tailored prompt: tool groups, HITL guidance, citation syntax, SDK hook awareness. No CLI delegation tree or MCP-specific instructions. |
| **CLI `/ava` skill** | `packages/mcp-server/plugins/automaker/commands/ava.md` | Full CLI skill with frontmatter, MCP tool access list, delegation tree, agent supervision protocol, and bash-based path resolution.       |

`loadAvaContext()` resolves the UI prompt path using `import.meta.url` (relative to the compiled module). If `ava-prompt.md` is not found, it falls back to the CLI skill file for backward compatibility.

**Editing guidance:**

- To change Ava's behavior in the **web chat UI** → edit `apps/server/src/routes/chat/ava-prompt.md`
- To change Ava's behavior in the **Claude Code `/ava` command** → edit `packages/mcp-server/plugins/automaker/commands/ava.md`
- Changes to one file do **not** affect the other

Ava is instructed to use citation syntax when referencing entities:

```
When referencing a feature, use [[feature:<featureId>]].
When referencing a document, use [[doc:<filePath>]].
```

## Extended Thinking

Enabled for Opus and Sonnet models. Budget: 10,000 tokens.

```typescript
// Server-side gate
function modelSupportsExtendedThinking(id: string): boolean {
  return id.includes('opus') || id.includes('sonnet');
}

// Passed to streamText()
experimental_thinking: {
  budgetTokens: 10_000;
}
```

The `ChainOfThought` component renders reasoning steps with spinner/check icons, auto-opens during streaming, and collapses to "Thought for Xs" when complete.

## Navigation

The Ava chat is accessible from multiple entry points:

- **Desktop sidebar**: "Ava Chat" nav item (gated by `featureFlags.avaChat`) navigates to `/chat`
- **Mobile bottom nav**: "Chat" tab with `MessageCircle` icon (gated by `featureFlags.avaChat`)
- **Keyboard shortcut**: `Cmd+K` / `Ctrl+K` opens the chat modal overlay
- **Direct route**: `/chat` renders `ChatOverlayContent` full-screen

## File Map

```
libs/ui/src/ai/
  index.ts                          # Barrel exports
  chat-message.tsx                  # Step-split message bubbles
  chat-message-list.tsx             # Scrollable message container
  chat-message-markdown.tsx         # Markdown + citations + tables
  chat-input.tsx                    # Prompt input with toolbar
  code-block.tsx                    # Syntax highlighting
  chain-of-thought.tsx              # Reasoning display
  tool-invocation-part.tsx          # Single tool card + registry wiring
  tool-result-registry.tsx          # Tool name -> component map
  task-block.tsx                    # Multi-tool grouping
  confirmation-card.tsx             # HITL approve/reject
  inline-form-card.tsx              # Inline HITL form (JSON Schema)
  inline-citation.tsx               # Citation badges
  message-sources.tsx               # Sources section
  message-actions.tsx               # Per-message action buttons
  plan-part.tsx                     # Structured plan display
  reasoning-part.tsx                # Simple reasoning wrapper
  prompt-input-context.tsx          # Input state context
  suggestion.tsx                    # Empty state suggestions
  loader.tsx                        # Typing/loading indicator
  shimmer.tsx                       # Skeleton loading animation
  queue-view.tsx                    # Agent queue visualization
  tool-results/
    board-summary-card.tsx
    feature-list-card.tsx
    feature-detail-card.tsx
    feature-created-card.tsx
    feature-updated-card.tsx        # Also exports MoveFeatureCard
    agent-status-card.tsx
    agent-output-card.tsx
    auto-mode-status-card.tsx
    execution-order-card.tsx
    artifact-card.tsx               # Generated artifact display
    image-card.tsx                  # Generated image display
    web-preview-card.tsx            # HTML preview iframe

apps/server/src/routes/chat/
  index.ts                          # POST /api/chat endpoint
  ava-prompt.md                     # Ava UI chat system prompt (UI surface only)
  ava-tools.ts                      # Tool definitions + HITL gating
  ava-config.ts                     # Per-project config load/save
  personas.ts                       # System prompt builder
  sitrep.ts                         # Live board state injection

packages/mcp-server/plugins/automaker/commands/
  ava.md                            # CLI /ava skill prompt (Claude Code only — unchanged)

apps/ui/src/routes/
  chat.tsx                          # Full-screen /chat route (featureFlags.avaChat)

apps/ui/src/components/layout/
  chat-modal.tsx                    # Cmd+K chat modal overlay
  mobile-bottom-nav.tsx             # Mobile Chat tab (featureFlags.avaChat)
  sidebar/hooks/use-navigation.ts   # Desktop sidebar Chat nav item

apps/ui/src/components/views/chat-overlay/
  chat-overlay-view.tsx             # Top-level overlay (Electron bridge)
  chat-overlay-content.tsx          # Shared content (messages + input)
  conversation-list.tsx             # Session history sidebar
  ava-settings-panel.tsx            # Config popover
```

## See Also

- [Ava Chat Server API](../server/ava-chat.md) — MCP server config, trust model
- [SDK Integration](../agents/sdk-integration.md) — Claude Agent SDK query options and session management
