# CopilotKit Integration

How the CopilotKit sidebar provides AI chat, LangGraph workflows, and HITL approval flows in the Automaker UI.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser (React)                                     │
│                                                      │
│  CopilotKitProvider (conditional)                    │
│    └─ CopilotSidebarWrapper                          │
│         └─ CopilotSidebar (right panel)              │
│              ├─ Chat interface                       │
│              ├─ Workflow selector                    │
│              ├─ Execution list                       │
│              └─ Workflow history                     │
│                                                      │
│  Hooks:                                              │
│    useCopilotKitContext    → project context          │
│    useCopilotKitSuggestions → chat suggestions        │
│    useSidebarState        → localStorage persistence │
└───────────────────┬─────────────────────────────────┘
                    │ POST /api/copilotkit
                    ▼
┌─────────────────────────────────────────────────────┐
│  Server (Express)                                    │
│                                                      │
│  CopilotRuntime                                      │
│    ├─ AnthropicAdapter (claude-sonnet-4-5)            │
│    ├─ Server Actions                                 │
│    │   ├─ listFeatures                               │
│    │   ├─ createFeature                              │
│    │   ├─ moveFeature                                │
│    │   ├─ getBoardSummary                            │
│    │   ├─ startAutoMode                              │
│    │   └─ stopAutoMode                               │
│    └─ LangGraph Agents (registered flows)            │
│                                                      │
│  Thread API: /api/copilotkit/threads                 │
│    ├─ GET    / (list)                                │
│    ├─ GET    /:id                                    │
│    ├─ PATCH  /:id                                    │
│    └─ DELETE /:id                                    │
└─────────────────────────────────────────────────────┘
```

## Backend Setup

### CopilotKit Route

The CopilotKit runtime is mounted at `/api/copilotkit` in `apps/server/src/routes/copilotkit/index.ts`. It uses the `AnthropicAdapter` with the existing `ANTHROPIC_API_KEY`.

```typescript
import {
  CopilotRuntime,
  AnthropicAdapter,
  copilotRuntimeNodeExpressEndpoint,
} from '@copilotkit/runtime';

const runtime = new CopilotRuntime({ actions });
const serviceAdapter = new AnthropicAdapter({ model: 'claude-sonnet-4-5-20250929' });

app.use(
  '/api/copilotkit',
  copilotRuntimeNodeExpressEndpoint({
    runtime,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  })
);
```

### Graceful Degradation

The route is guarded behind `process.env.ANTHROPIC_API_KEY`. When the key is not set (CI, E2E tests), the route returns 404 and the frontend falls through to render without CopilotKit.

### Server Actions

Server actions let the chat assistant interact with the Automaker board:

| Action            | Description                                  |
| ----------------- | -------------------------------------------- |
| `listFeatures`    | List features, optionally filtered by status |
| `createFeature`   | Create a new feature on the board            |
| `moveFeature`     | Move a feature to a new status               |
| `getBoardSummary` | Get feature counts by status + agent info    |
| `startAutoMode`   | Start autonomous feature processing          |
| `stopAutoMode`    | Stop autonomous feature processing           |

### Thread Management

Thread metadata is stored in `{DATA_DIR}/copilotkit-threads/{threadId}.json`. The `CopilotKitThreadService` provides CRUD operations. LangGraph state is persisted via MemorySaver (in-memory).

## Frontend Setup

### Provider

`CopilotKitProvider` (in `apps/ui/src/components/copilotkit/provider.tsx`) conditionally enables CopilotKit:

1. Probes `/api/copilotkit` with a HEAD request
2. If the endpoint exists (non-404), wraps children with `<CopilotKit>`
3. If unavailable, renders children without CopilotKit

This ensures the app works in CI and environments without an API key.

### Sidebar

`CopilotSidebarWrapper` renders the CopilotKit sidebar on the right side. The left sidebar is Automaker's navigation. Configuration:

- `defaultOpen={false}` — starts collapsed
- `shortcut="\\"` — toggle with backslash key
- Theme mapped from Automaker CSS variables via `getCopilotKitThemeStyles()`

### Context Injection

`useCopilotKitContext` hook injects project context via `useCopilotReadable`:

- Current project name and path
- Board summary (feature counts by status)
- Feature list (id, title, status, complexity)

Context refreshes automatically when the project or features change.

### Chat Suggestions

`useCopilotKitSuggestions` provides contextual quick-start suggestions based on whether a project is selected.

## HITL Interrupt Flows

### How Interrupts Work

When the content creation flow runs with `enableHITL=true`, it compiles with `interruptBefore` on three gate nodes:

1. `research_hitl` — after research quality review
2. `outline_hitl` — after outline structure review
3. `final_review_hitl` — after final content review

The graph pauses at these nodes, and the `ContentFlowService` sets the status to `interrupted`. The frontend shows an approval UI.

### Resume with Edits

When resuming, the `resumeFlow` method accepts:

```typescript
interface HITLReview {
  gate: 'research_hitl' | 'outline_hitl' | 'final_review_hitl';
  decision: 'approve' | 'revise' | 'reject';
  feedback?: string;
  editedContent?: string; // User's edited version
}
```

If `editedContent` is provided:

- At `outline_hitl`: parsed as JSON outline and replaces the current outline
- At `final_review_hitl`: replaces the assembled content string
- At `research_hitl`: not used (research results are structured data)

### Rejection Handling

- `revise` — increments retry counter, re-runs the phase (up to `maxRetries`)
- `reject` — routes to `complete` node, ending the flow early

## Components Reference

| Component               | File                                         | Purpose                        |
| ----------------------- | -------------------------------------------- | ------------------------------ |
| `CopilotKitProvider`    | `components/copilotkit/provider.tsx`         | Conditional CopilotKit wrapper |
| `CopilotSidebarWrapper` | `components/copilotkit/provider.tsx`         | Themed sidebar container       |
| `RecentChats`           | `components/copilotkit/recent-chats.tsx`     | Thread history popover         |
| `GenericApprovalDialog` | `components/copilotkit/generic-dialog.tsx`   | Yes/no fallback for interrupts |
| `ModelSelector`         | `components/copilotkit/model-selector.tsx`   | Haiku/sonnet/opus dropdown     |
| `WorkflowAbortButton`   | `components/copilotkit/workflow-abort.tsx`   | Stop running workflow          |
| `ExecutionList`         | `components/copilotkit/execution-list.tsx`   | Active execution tracker       |
| `WorkflowHistory`       | `components/copilotkit/workflow-history.tsx` | Recent runs list               |

### Hooks

| Hook                       | File                                         | Purpose                        |
| -------------------------- | -------------------------------------------- | ------------------------------ |
| `useCopilotKitContext`     | `hooks/use-copilotkit-context.ts`            | Project context injection      |
| `useCopilotKitSuggestions` | `hooks/use-copilotkit-suggestions.ts`        | Chat suggestions               |
| `useSidebarState`          | `components/copilotkit/use-sidebar-state.ts` | Persistent sidebar preferences |
| `useWorkflowHistory`       | `components/copilotkit/workflow-history.tsx` | History entry management       |

## Theming

CopilotKit CSS variables are mapped from Automaker's theme in `theme-bridge.tsx`:

```typescript
{
  '--copilot-kit-primary-color': 'hsl(var(--primary))',
  '--copilot-kit-contrast-color': 'hsl(var(--primary-foreground))',
  '--copilot-kit-background-color': 'hsl(var(--background))',
  '--copilot-kit-secondary-color': 'hsl(var(--card))',
  '--copilot-kit-secondary-contrast-color': 'hsl(var(--card-foreground))',
  '--copilot-kit-separator-color': 'hsl(var(--border))',
  '--copilot-kit-muted-color': 'hsl(var(--muted))',
}
```

This ensures the sidebar matches all Automaker themes (dark, light, custom).

## Model Selection

The `ModelSelector` component persists the selected model tier per workflow in localStorage with key format `copilotkit-model-{workflowId}`. Available tiers:

| Tier   | Model                        | Use Case           |
| ------ | ---------------------------- | ------------------ |
| Haiku  | `claude-haiku-4-5-20251001`  | Fast, simple tasks |
| Sonnet | `claude-sonnet-4-5-20250929` | Balanced (default) |
| Opus   | `claude-opus-4-5-20251101`   | Maximum capability |

## Packages

CopilotKit packages are declared in workspace `package.json` files:

- **Server**: `@copilotkit/runtime@^1.51.3`
- **UI**: `@copilotkit/react-core@^1.51.3`, `@copilotkit/react-ui@^1.51.3`
