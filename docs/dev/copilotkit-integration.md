# CopilotKit Integration

How the CopilotKit sidebar provides AI chat, LangGraph workflows, and HITL approval flows in the protoLabs UI.

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
│              ├─ Model selector                      │
│              ├─ Execution list                       │
│              └─ Workflow history                     │
│                                                      │
│  Hooks:                                              │
│    useAgentContext      → project context injection   │
│    useLangGraphInterrupt → HITL approval flows       │
│    useSidebarState     → localStorage persistence    │
└───────────────────┬─────────────────────────────────┘
                    │ POST /api/copilotkit
                    ▼
┌─────────────────────────────────────────────────────┐
│  Server (Express)                                    │
│                                                      │
│  CopilotRuntime + createCopilotEndpointExpress       │
│    ├─ "default" agent (Ava): BuiltInAgent            │
│    │   └─ defineTool() board-operation tools          │
│    │       ├─ listFeatures                           │
│    │       ├─ createFeature                          │
│    │       ├─ moveFeature                            │
│    │       ├─ getBoardSummary                        │
│    │       ├─ startAutoMode                          │
│    │       └─ stopAutoMode                           │
│    ├─ "content-pipeline" agent: LangGraph flow       │
│    └─ "antagonistic-review" agent: BuiltInAgent      │
│                                                      │
│  Agent discovery: GET /api/copilotkit/info            │
│                                                      │
│  Thread API: /api/copilotkit/threads                 │
│    ├─ GET    / (list)                                │
│    ├─ POST   / (create)                              │
│    ├─ GET    /:id                                    │
│    ├─ PATCH  /:id                                    │
│    └─ DELETE /:id                                    │
└─────────────────────────────────────────────────────┘
```

## Backend Setup

### CopilotKit Route

The CopilotKit runtime is mounted at `/api/copilotkit` in `apps/server/src/routes/copilotkit/index.ts`. It registers three agents via the AG-UI protocol using `@copilotkitnext/runtime` and `@copilotkitnext/agent`.

```typescript
import { CopilotRuntime } from '@copilotkitnext/runtime';
import { createCopilotEndpointExpress } from '@copilotkitnext/runtime/express';
import { BuiltInAgent, defineTool } from '@copilotkitnext/agent';

// Define board-operation tools using defineTool()
const avaTools = [
  defineTool({
    name: 'listFeatures',
    description: 'List all features on the board',
    parameters: z.object({ projectPath: z.string(), status: z.string().optional() }),
    execute: async (args) => {
      /* ... */
    },
  }),
  // createFeature, moveFeature, getBoardSummary, startAutoMode, stopAutoMode
];

// Register agents — discoverable via /api/copilotkit/info
const avaAgent = new BuiltInAgent({ name: 'default', tools: avaTools });
const runtime = new CopilotRuntime({
  agents: [avaAgent /* content-pipeline, antagonistic-review */],
});

// Mount as Express router
const copilotRouter = createCopilotEndpointExpress({ runtime });
app.use('/api/copilotkit', copilotRouter);
```

### Graceful Degradation

The route is dynamically imported and guarded behind `ANTHROPIC_API_KEY`. When the key is not set (CI, E2E tests), the route is not mounted and the frontend falls through to render without CopilotKit.

### Registered Agents

| Agent                 | Type         | Description                           |
| --------------------- | ------------ | ------------------------------------- |
| `default` (Ava)       | BuiltInAgent | Board operations via defineTool()     |
| `content-pipeline`    | LangGraph    | Content creation flow with HITL gates |
| `antagonistic-review` | BuiltInAgent | Content quality review                |

### Thread Management

Thread metadata is stored in `{DATA_DIR}/copilotkit-threads/{threadId}.json`. The `CopilotKitThreadService` provides CRUD operations. LangGraph state is persisted via MemorySaver (in-memory).

## Frontend Setup

### Provider

`CopilotKitProvider` (in `apps/ui/src/components/copilotkit/provider.tsx`) conditionally enables CopilotKit:

1. Probes `/api/copilotkit/info` with a GET request (requires authentication)
2. If the endpoint responds with 2xx, wraps children with `<CKProvider>`
3. If unavailable or 404, renders children without CopilotKit
4. Wrapped in an error boundary so CopilotKit failures never crash the app

This ensures the app works in CI and environments without an API key.

### Sidebar

`CopilotSidebarWrapper` renders the CopilotKit sidebar on the right side. The left sidebar is protoLabs's navigation. Configuration:

- Toggle with `Cmd+K` (macOS) / `Ctrl+K` (other platforms)
- Labels: header title "Ava", welcome message "How can I help with your project?"
- Theme mapped from protoLabs CSS variables via `getCopilotKitThemeStyles()`

### Context Injection

`ProjectContextInjector` component uses `useAgentContext` (from `@copilotkitnext/react`) to inject project context:

- Current project path
- Feature list (id, title, status, complexity)

Context refreshes automatically when the project or features change.

### Model Selection

The `ModelSelector` component in the sidebar allows switching between model tiers. The selected model is sent to the server via the `X-Copilotkit-Model` header. Model preference is persisted per-workflow in localStorage with key format `copilotkit-model-{workflowId}`.

| Tier   | Model                        | Use Case           |
| ------ | ---------------------------- | ------------------ |
| Haiku  | `claude-haiku-4-5-20251001`  | Fast, simple tasks |
| Sonnet | `claude-sonnet-4-5-20250929` | Balanced (default) |
| Opus   | `claude-opus-4-5-20251101`   | Maximum capability |

## HITL Interrupt Flows

### How Interrupts Work

When the content creation flow runs with `enableHITL=true`, it compiles with `interruptBefore` on three gate nodes:

1. `research_hitl` — after research quality review
2. `outline_hitl` — after outline structure review
3. `final_review_hitl` — after final content review

The graph pauses at these nodes, and the `ContentFlowService` sets the status to `interrupted`. The frontend shows an approval UI via `useLangGraphInterrupt` (registered as a HITL tool with CopilotKit using `useHumanInTheLoop` from `@copilotkitnext/react`).

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

| Component               | File                                            | Purpose                        |
| ----------------------- | ----------------------------------------------- | ------------------------------ |
| `CopilotKitProvider`    | `components/copilotkit/provider.tsx`            | Conditional CopilotKit wrapper |
| `CopilotSidebarWrapper` | `components/copilotkit/provider.tsx`            | Themed sidebar container       |
| `AgentStateDisplay`     | `components/copilotkit/agent-state-display.tsx` | Agent state visualization      |
| `ErrorDisplay`          | `components/copilotkit/error-display.tsx`       | CopilotKit error handling      |
| `ModelSelector`         | `components/copilotkit/model-selector.tsx`      | Haiku/sonnet/opus dropdown     |
| `WorkflowSelector`      | `components/copilotkit/workflow-selector.tsx`   | Agent/workflow picker          |
| `WorkflowAbortButton`   | `components/copilotkit/workflow-abort.tsx`      | Stop running workflow          |
| `ExecutionList`         | `components/copilotkit/execution-list.tsx`      | Active execution tracker       |
| `WorkflowHistory`       | `components/copilotkit/workflow-history.tsx`    | Recent runs list               |
| `RecentChats`           | `components/copilotkit/recent-chats.tsx`        | Thread history popover         |
| `GenericApprovalDialog` | `components/copilotkit/generic-dialog.tsx`      | Yes/no fallback for interrupts |
| `EntityWizard`          | `components/copilotkit/entity-wizard.tsx`       | Guided entity creation         |
| `PhaseApproval`         | `components/copilotkit/phase-approval.tsx`      | Phase approval UI              |
| `PrdEditorModal`        | `components/copilotkit/prd-editor-modal.tsx`    | PRD editing in modal           |
| `TiptapEditor`          | `components/copilotkit/tiptap-editor.tsx`       | Rich text editor for content   |

### Hooks

| Hook                    | File                                                | Purpose                          |
| ----------------------- | --------------------------------------------------- | -------------------------------- |
| `useAgentContext`       | `@copilotkitnext/react` (library)                   | Project context injection        |
| `useLangGraphInterrupt` | `components/copilotkit/use-langgraph-interrupt.tsx` | HITL interrupt tool registration |
| `useSidebarState`       | `components/copilotkit/use-sidebar-state.ts`        | Persistent sidebar preferences   |
| `useAgent`              | `@copilotkitnext/react` (library)                   | Agent state access               |

## Theming

CopilotKit CSS variables are mapped from protoLabs's theme in `theme-bridge.tsx`:

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

> **Note:** The `hsl()` wrapper is from CopilotKit's CSS variable format. protoLabs tokens use OKLch internally — the `hsl()` wrapping here is a compatibility layer for CopilotKit's theming system.

This ensures the sidebar matches all protoLabs themes.

## Packages

CopilotKit packages are declared in workspace `package.json` files:

- **Server**: `@copilotkitnext/runtime@^1.51.3`, `@copilotkitnext/agent@^1.51.3`
- **UI**: `@copilotkitnext/react@^1.51.3`
