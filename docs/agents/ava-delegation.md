# Ava Delegation Flow

When Ava's orchestration loop determines it needs to run a task autonomously — writing code, running tests, researching an issue — it delegates to a specialized inner agent via the `execute_dynamic_agent` tool. This page documents the delegation path from Ava's tool call through role resolution, agent execution, progress streaming, and back to the chat UI.

## Overview

```
Ava (outer loop, streamText)
  │  calls execute_dynamic_agent tool
  ▼
ava-tools.ts: execute_dynamic_agent handler
  ├── RoleRegistryService.get(role)          → AgentTemplate
  ├── AgentFactoryService.createFromTemplate() → AgentConfig
  └── DynamicAgentExecutor.execute()
        ├── ClaudeProvider.executeQuery()    → SDK query()
        └── WebSocket progress events        → AgentOutputCard (chat UI)
```

The outer Ava session continues streaming SSE to the browser while the inner agent runs asynchronously, emitting progress over WebSocket.

## Step-by-Step Delegation

### 1. Ava Decides to Delegate

During a `streamText` step, Ava emits a tool call to `execute_dynamic_agent`:

```json
{
  "toolName": "execute_dynamic_agent",
  "input": {
    "role": "implementer",
    "feature_id": "feature-1234",
    "prompt": "Implement the login form component described in the feature spec.",
    "trust": "standard"
  }
}
```

The `role` field identifies which registered agent template to use. `feature_id` is optional — it provides context about which board item the agent is working on. `trust` can override the project-level `subagentTrust` downward (it cannot grant more trust than the project allows).

### 2. Role Registry Lookup

`RoleRegistryService.get(role)` retrieves the named template from the in-memory registry. Templates are registered at server startup from:

- Built-in templates (e.g., `implementer`, `reviewer`, `researcher`) registered in `apps/server/src/services/role-registry-service.ts`
- Project-local templates loaded from `.automaker/roles/` at project open time

If the role is not found, `execute_dynamic_agent` returns an error result and Ava reports the failure to the user.

See [Dynamic Role Registry](./dynamic-role-registry.md) for the full template schema.

### 3. Agent Config Resolution

`AgentFactoryService.createFromTemplate(role, projectPath, overrides?)` resolves the template into a concrete `AgentConfig`:

- Applies project-specific overrides (from `.automaker/roles/{role}.override.json` if present)
- Resolves the system prompt (template's `systemPrompt` field, rendered with feature context)
- Determines the tool set: template `capabilities` → allowed tool names
- Caps trust at `min(template.maxTrust, subagentTrust)` from AvaConfig

The returned `AgentConfig` is a fully resolved, immutable snapshot — no further registry lookups occur during execution.

### 4. DynamicAgentExecutor

`DynamicAgentExecutor.execute(config, options)` runs the inner agent:

```
DynamicAgentExecutor.execute(config, options)
  ├── Validate canUseTool for every tool in config.allowedTools
  │     → Tools exceeding trust level are removed from the set
  ├── ClaudeProvider.executeQuery({
  │     systemPrompt: config.systemPrompt,
  │     tools: config.allowedTools,
  │     mcpServers: AvaConfig.mcpServers,
  │     hooks: { PostToolUse, Notification, SubagentStop }
  │   })
  └── Returns: AgentResult { output, cost, stepCount, error? }
```

The executor is stateless — it does not maintain agent sessions between Ava calls. Each `execute_dynamic_agent` invocation starts a fresh SDK session.

### 5. canUseTool Gate

Before running, `DynamicAgentExecutor` validates each tool against the effective trust level:

```
for each tool in config.allowedTools:
  if tool.requiredTrust > effectiveTrust:
    remove from allowed set
    log("tool_blocked: {toolName}")
```

This is enforced at the executor level — not in the SDK's `canUseTool` callback — so blocked tools are simply removed before the agent starts rather than causing mid-run refusals.

If the approved tool set becomes empty (all tools blocked), `DynamicAgentExecutor` returns an error result immediately rather than running an agent with no tools.

### 6. Progress Streaming Back to Chat UI

During execution, `DynamicAgentExecutor` emits progress events via the server's WebSocket channel, keyed by `agentRunId` (generated per `execute_dynamic_agent` call and passed through the tool result for the UI to subscribe with):

| Event               | When emitted                              | UI component                      |
| ------------------- | ----------------------------------------- | --------------------------------- |
| `agent:text`        | Inner agent emits a text chunk            | `AgentOutputCard` — streamed text |
| `agent:tool-use`    | Inner agent calls a tool                  | Tool invocation row               |
| `agent:tool-result` | Inner tool returns (via PostToolUse hook) | Collapsible result                |
| `agent:complete`    | `SubagentStop` hook fires                 | Cost + step count chip            |
| `agent:error`       | Agent throws or SDK errors                | Error callout                     |

The chat bubble for `execute_dynamic_agent` renders as `AgentOutputCard` (registered in `toolResultRegistry`). It subscribes to the WebSocket channel by `agentRunId` extracted from the tool's input-streaming output.

### 7. Result Returned to Ava

After the inner agent completes, `execute_dynamic_agent` returns a structured result to the outer Ava `streamText` loop:

```json
{
  "success": true,
  "output": "Implemented LoginForm component at apps/ui/src/components/auth/login-form.tsx. Added form validation and error states. Tests added at apps/ui/src/components/auth/__tests__/login-form.test.tsx.",
  "cost": { "inputTokens": 14200, "outputTokens": 3100 },
  "stepCount": 8
}
```

Ava receives this as a tool result and continues its response — typically summarizing what the agent accomplished and updating the board state.

If the inner agent failed, `success: false` is returned with an `error` field. Ava will surface the error to the user and can decide to retry, escalate, or report the failure.

## Role Registry and Template Resolution

Templates are the source of truth for what an agent is allowed to do. Key fields relevant to delegation:

| Field          | Purpose                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `name`         | Role identifier — matches the `role` field in `execute_dynamic_agent`   |
| `systemPrompt` | Agent identity and instructions (rendered with `{{ feature }}` context) |
| `capabilities` | List of allowed tool group names                                        |
| `maxTrust`     | Maximum trust level this role may operate at                            |
| `tier`         | `0` = protected (cannot be unregistered), `1` = managed                 |

Built-in roles (`implementer`, `reviewer`, `researcher`) are tier 0 and cannot be overridden by project-local files. Project roles in `.automaker/roles/` are tier 1 and can be registered, updated, or removed at runtime.

See [Dynamic Role Registry](./dynamic-role-registry.md) for the complete template schema and registration API.

## Approval Flow for Delegated Agents

When `subagentTrust` is `standard` and the inner agent calls a destructive tool, the `canUseTool` gate allows it but the tool itself checks `needsApproval()`. In this case:

1. The inner agent's tool execution is paused
2. An `agent:approval-requested` WebSocket event is emitted with `{ toolName, input, inputHash }`
3. `AgentOutputCard` renders an inline `ConfirmationCard` within the agent bubble
4. User approves → WebSocket message sent back → execution resumes
5. User rejects → tool result = `"denied"` → agent receives denial and adapts

This mirrors the outer HITL flow but is scoped to the inner agent session. The outer Ava session remains blocked on the `execute_dynamic_agent` tool result until the inner agent completes (including any mid-agent approvals).

## Key Files

| File                                                                   | Role                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ |
| `apps/server/src/routes/chat/ava-tools.ts`                             | `execute_dynamic_agent` tool definition and handler          |
| `apps/server/src/services/role-registry-service.ts`                    | `RoleRegistryService` — template store and lookup            |
| `apps/server/src/services/agent-factory-service.ts`                    | `AgentFactoryService.createFromTemplate()` — config resolver |
| `apps/server/src/services/dynamic-agent-executor.ts`                   | `DynamicAgentExecutor.execute()` — runs the inner agent      |
| `apps/server/src/providers/claude-provider.ts`                         | `ClaudeProvider.executeQuery()` — SDK wrapper                |
| `apps/ui/src/components/views/chat/tool-results/agent-output-card.tsx` | Chat UI card — renders agent progress stream                 |

## See Also

- [Ava Chat System — Architecture Pipeline](../dev/ava-chat-system.md#architecture-pipeline) — full request flow from chat input to response
- [Ava Chat Server API](../server/ava-chat.md) — SDK hooks, trust model, MCP server config
- [Dynamic Role Registry](./dynamic-role-registry.md) — template schema, registration, and tier enforcement
- [SDK Integration](./sdk-integration.md) — Claude Agent SDK query options and session management
