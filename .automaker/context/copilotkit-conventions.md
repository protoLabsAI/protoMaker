# CopilotKit Conventions

**CRITICAL: Use `@copilotkitnext` packages (AG-UI protocol). NEVER use `@copilotkit`.**

## Package Imports

```typescript
// UI layer
import { CopilotKitProvider, CopilotSidebar } from '@copilotkitnext/react';
import '@copilotkitnext/react/styles.css';

// Server layer
import { CopilotRuntime, createCopilotEndpointExpress } from '@copilotkitnext/runtime/express';
import { BuiltInAgent, defineTool } from '@copilotkitnext/agent';
```

## Server: Registering Agents

Location: `apps/server/src/routes/copilotkit/index.ts`

```typescript
const runtime = new CopilotRuntime({
  agents: {
    default: avaAgent,                        // BuiltInAgent (tool-based)
    'content-pipeline': contentPipelineGraph,  // LangGraph flow (registered directly)
    'antagonistic-review': antagonisticReviewAgent, // BuiltInAgent
  },
});
```

- **BuiltInAgent**: For tool-based agents. Uses `defineTool()` with Zod schemas.
- **LangGraph graphs**: Register directly in `agents` object (they implement the agent interface).
- Model format: `'anthropic/claude-sonnet-4-5-20250929'`
- Endpoint: `createCopilotEndpointExpress({ runtime, basePath: '/' })`

## LangGraph State Annotations

Every LangGraph flow that integrates with CopilotKit must include:

```typescript
const CopilotKitStateAnnotation = {
  sessionId: Annotation<string | undefined>,
  userId: Annotation<string | undefined>,
  threadMetadata: Annotation<Record<string, unknown> | undefined>,
  currentActivity: Annotation<string | undefined>,
  progress: Annotation<number | undefined>,
};
```

Spread into your root annotation: `...CopilotKitStateAnnotation`

## State Emission in Nodes

```typescript
import { copilotkitEmitState, emitHeartbeat } from '../copilotkit-utils';

// At node entry
await copilotkitEmitState(config, { currentActivity: 'Generating outline', progress: 0 });
// During I/O
await emitHeartbeat(config, 'Invoking LLM');
// At node exit
await copilotkitEmitState(config, { currentActivity: 'Outline complete', progress: 100 });
```

Both functions gracefully no-op when CopilotKit is unavailable.

## UI: Context Injection

Use `useAgentContext` to inject readable context into CopilotKit agents:

```typescript
import { useAgentContext } from '@copilotkitnext/react';

// Inside a component rendered within CKProvider
useAgentContext({
  description: 'Current project path',
  value: currentProject?.path || null,
});
```

**NOTE:** `useCopilotReadable` does NOT exist in `@copilotkitnext/react` v1.51.3. Use `useAgentContext` instead.

## UI: Existing Components

Location: `apps/ui/src/components/copilotkit/`

- **provider.tsx** — Root CopilotKit provider with auth, error boundary, availability check, project context injection
- **theme-bridge.tsx** — Maps Automaker CSS vars to CopilotKit CSS vars (use HSL format)
- **agent-state-display.tsx** — Displays LangGraph agent state (activity, progress) streamed via AG-UI protocol
- **workflow-selector.tsx** — Dropdown to choose which LangGraph agent to invoke, with WorkflowProvider context
- **use-sidebar-state.ts** — Persists sidebar state (open/closed, workflow, model) to localStorage
- **execution-list.tsx** — Active workflow executions with status/progress
- **model-selector.tsx** — Haiku/Sonnet/Opus model chooser
- **generic-dialog.tsx** — Fallback yes/no dialog for LangGraph interrupts
- **workflow-abort.tsx** — Cancel running workflows
- **workflow-history.tsx** — Execution history viewer

## LangGraph Interrupts (HITL)

For human-in-the-loop approval flows:
- Import `interrupt` from `@langchain/langgraph`
- Call `interrupt({ type: 'review_approval', ...payload })` in graph nodes
- CopilotKit AG-UI runtime surfaces interrupts in the sidebar automatically
- UI routes interrupt types to components via discriminated union
- Resume with `resolve()` containing user response

## Key Rules

1. All `@copilotkitnext` packages are at v1.51.3 — verify new APIs exist before using
2. Wrap CopilotKit UI in error boundaries (provider already does this)
3. Use `getCopilotKitThemeStyles()` from theme-bridge for consistent styling
4. Check `/api/copilotkit/info` for endpoint availability before assuming CopilotKit is live
5. Tool parameters MUST be Zod schemas
6. `maxSteps` on BuiltInAgent prevents infinite tool loops
