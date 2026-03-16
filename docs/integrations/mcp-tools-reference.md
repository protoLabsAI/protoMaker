# MCP Tools Reference

protoLabs Studio exposes 135+ MCP tools organized into categories. This reference covers all available tools, their inputs, and example usage. Use the [Claude Code Plugin](/integrations/claude-plugin) to access these tools from your terminal.

## Quick Start

```bash
# Install the protoLabs plugin
claude plugin marketplace add /path/to/automaker/packages/mcp-server/plugins
claude plugin install protolabs

# Verify connectivity
mcp__protolabs__health_check({})
```

All tools follow this response structure:

```typescript
interface ToolResult {
  success: boolean;
  data?: unknown; // Present on success
  error?: string; // Present on failure
  errorCode?: string; // Machine-readable error code
  metadata?: unknown; // Optional additional context
}
```

## Feature Management

Manage features on the Kanban board.

### list_features

List all features in a project.

```typescript
mcp__protolabs__list_features({
  projectPath: '/home/user/my-project',
  status: 'backlog', // Optional: filter by status
});
```

**Parameters:**

| Parameter   | Type   | Required | Description                                                   |
| ----------- | ------ | -------- | ------------------------------------------------------------- |
| projectPath | string | yes      | Absolute path to the project                                  |
| status      | string | no       | Filter: `backlog`, `in_progress`, `review`, `done`, `blocked` |

### get_feature

Get details for a specific feature.

```typescript
mcp__protolabs__get_feature({
  projectPath: '/home/user/my-project',
  featureId: 'feature-1741234567890-abc123',
});
```

### create_feature

Create a new feature on the board.

```typescript
mcp__protolabs__create_feature({
  projectPath: '/home/user/my-project',
  title: 'Add user authentication',
  description: 'Implement JWT-based authentication with login/logout endpoints',
  complexity: 'medium', // 'small' | 'medium' | 'large' | 'architectural'
  model: 'sonnet', // Optional: model alias to use
  isFoundation: false, // Optional: true if downstream features wait for merge
});
```

**Parameters:**

| Parameter    | Type    | Required | Description                            |
| ------------ | ------- | -------- | -------------------------------------- |
| projectPath  | string  | yes      | Absolute path to the project           |
| title        | string  | yes      | Feature title                          |
| description  | string  | yes      | Detailed feature description           |
| complexity   | string  | no       | Complexity tier for model selection    |
| model        | string  | no       | Model alias: `haiku`, `sonnet`, `opus` |
| isFoundation | boolean | no       | Block dependents until merged          |

### update_feature

Update a feature's properties.

```typescript
mcp__protolabs__update_feature({
  projectPath: '/home/user/my-project',
  featureId: 'feature-1741234567890-abc123',
  title: 'Updated title',
  description: 'Updated description',
});
```

### delete_feature

Delete a feature from the board.

```typescript
mcp__protolabs__delete_feature({
  projectPath: '/home/user/my-project',
  featureId: 'feature-1741234567890-abc123',
});
```

### move_feature

Move a feature to a different status.

```typescript
mcp__protolabs__move_feature({
  projectPath: '/home/user/my-project',
  featureId: 'feature-1741234567890-abc123',
  status: 'in_progress',
});
```

## Agent Control

Start, stop, and monitor AI agents.

### start_agent

Start an agent on a feature.

```typescript
mcp__protolabs__start_agent({
  projectPath: '/home/user/my-project',
  featureId: 'feature-1741234567890-abc123',
  model: 'sonnet', // Optional: override default model
  agentRole: 'backend-engineer', // Optional: specific agent template
});
```

### stop_agent

Stop a running agent.

```typescript
mcp__protolabs__stop_agent({
  projectPath: '/home/user/my-project',
  featureId: 'feature-1741234567890-abc123',
});
```

### list_running_agents

List all currently running agents.

```typescript
mcp__protolabs__list_running_agents({
  projectPath: '/home/user/my-project',
});
```

### get_agent_output

Get the output from a completed or running agent.

```typescript
mcp__protolabs__get_agent_output({
  projectPath: '/home/user/my-project',
  featureId: 'feature-1741234567890-abc123',
});
```

### send_message_to_agent

Send a message to a running agent.

```typescript
mcp__protolabs__send_message_to_agent({
  projectPath: '/home/user/my-project',
  featureId: 'feature-1741234567890-abc123',
  message: 'Also add TypeScript types for the response schema',
});
```

## Queue Management

Manage the auto-mode processing queue.

### queue_feature

Add a feature to the auto-mode processing queue.

```typescript
mcp__protolabs__queue_feature({
  projectPath: '/home/user/my-project',
  featureId: 'feature-1741234567890-abc123',
  priority: 1, // Optional: higher priority = processed first
});
```

### list_queue

List all features in the processing queue.

```typescript
mcp__protolabs__list_queue({
  projectPath: '/home/user/my-project',
});
```

### clear_queue

Remove all features from the queue.

```typescript
mcp__protolabs__clear_queue({
  projectPath: '/home/user/my-project',
});
```

## Context Files

Manage `.automaker/context/` files that define agent rules and conventions.

### list_context_files

List all context files for a project.

```typescript
mcp__protolabs__list_context_files({
  projectPath: '/home/user/my-project',
});
```

### get_context_file

Read a context file's content.

```typescript
mcp__protolabs__get_context_file({
  projectPath: '/home/user/my-project',
  fileName: 'CLAUDE.md',
});
```

### create_context_file

Create a new context file.

```typescript
mcp__protolabs__create_context_file({
  projectPath: '/home/user/my-project',
  fileName: 'testing-conventions.md',
  content: '# Testing Conventions\n\nAlways write unit tests for services...',
});
```

### delete_context_file

Delete a context file.

```typescript
mcp__protolabs__delete_context_file({
  projectPath: '/home/user/my-project',
  fileName: 'outdated-rules.md',
});
```

## Project Orchestration

Create and manage hierarchical project plans.

### create_project

Create a new project with PRD and milestones.

```typescript
mcp__protolabs__create_project({
  projectPath: '/home/user/my-project',
  title: 'User Authentication System',
  goal: 'Implement secure JWT-based authentication',
  prd: {
    situation: 'Current system has no authentication',
    problem: 'Users cannot securely access their data',
    approach: 'Implement JWT tokens with refresh flow',
    results: 'Secure, scalable authentication system',
    constraints: ['Must support OAuth providers'],
  },
  milestones: [
    {
      title: 'Foundation',
      description: 'Core auth infrastructure',
      phases: [
        {
          title: 'Add Auth Types',
          description: 'TypeScript types for auth entities',
          filesToModify: ['libs/types/src/auth.ts'],
          acceptanceCriteria: ['Types compile', 'Exported from index'],
          complexity: 'small',
        },
      ],
    },
  ],
});
```

### list_projects

List all projects in a workspace.

```typescript
mcp__protolabs__list_projects({
  projectPath: '/home/user/my-project',
});
```

### get_project

Get full project details including milestones and phases.

```typescript
mcp__protolabs__get_project({
  projectPath: '/home/user/my-project',
  projectSlug: 'user-authentication-system',
});
```

### create_project_features

Convert project phases to board features.

```typescript
mcp__protolabs__create_project_features({
  projectPath: '/home/user/my-project',
  projectSlug: 'user-authentication-system',
  createEpics: true, // Create epic per milestone
  setupDependencies: true, // Auto-configure phase order
});
```

### set_feature_dependencies

Set dependencies between features.

```typescript
mcp__protolabs__set_feature_dependencies({
  projectPath: '/home/user/my-project',
  featureId: 'feature-456',
  dependsOn: ['feature-123', 'feature-789'],
});
```

### get_dependency_graph

Get the full dependency graph for a project.

```typescript
mcp__protolabs__get_dependency_graph({
  projectPath: '/home/user/my-project',
});
```

### get_execution_order

Get the topologically sorted execution order.

```typescript
mcp__protolabs__get_execution_order({
  projectPath: '/home/user/my-project',
});
```

## Auto-Mode Control

Start and stop autonomous feature processing.

### start_auto_mode

Start auto-mode for a project.

```typescript
mcp__protolabs__start_auto_mode({
  projectPath: '/home/user/my-project',
  respectDependencies: true, // Process in dependency order
});
```

### stop_auto_mode

Stop auto-mode.

```typescript
mcp__protolabs__stop_auto_mode({
  projectPath: '/home/user/my-project',
});
```

### get_auto_mode_status

Get auto-mode status and current queue.

```typescript
mcp__protolabs__get_auto_mode_status({
  projectPath: '/home/user/my-project',
});
```

## GitHub Operations

Work with pull requests and CI status.

### check_pr_status

Check the status of a pull request.

```typescript
mcp__protolabs__check_pr_status({
  projectPath: '/home/user/my-project',
  prNumber: 123,
});
```

### merge_pr

Merge an approved pull request.

```typescript
mcp__protolabs__merge_pr({
  projectPath: '/home/user/my-project',
  prNumber: 123,
  mergeStrategy: 'squash', // 'squash' | 'merge' | 'rebase'
});
```

### resolve_pr_threads

Resolve all open review threads on a PR.

```typescript
mcp__protolabs__resolve_pr_threads({
  projectPath: '/home/user/my-project',
  prNumber: 123,
});
```

## Observability (Langfuse)

Access traces, costs, and evaluation data.

### langfuse_list_traces

List recent agent execution traces.

```typescript
mcp__protolabs__langfuse_list_traces({
  limit: 20,
  userId: 'feature-1741234567890-abc123', // Optional: filter by feature
});
```

### langfuse_get_costs

Get cost breakdown for a time period.

```typescript
mcp__protolabs__langfuse_get_costs({
  fromDate: '2026-01-01',
  toDate: '2026-01-31',
});
```

### langfuse_score_trace

Add a quality score to a trace.

```typescript
mcp__protolabs__langfuse_score_trace({
  traceId: 'trace-abc123',
  name: 'code-quality',
  value: 0.9,
  comment: 'Clean implementation, good test coverage',
});
```

## Utilities

### health_check

Verify MCP server connectivity.

```typescript
mcp__protolabs__health_check({});
// Returns: { success: true, data: { status: 'healthy', version: '1.0.0' } }
```

### get_board_summary

Get a summary of the current board state.

```typescript
mcp__protolabs__get_board_summary({
  projectPath: '/home/user/my-project',
});
```

## Project Spec

Manage the project specification document.

### get_project_spec

Get the project specification from `.automaker/spec.md`.

```typescript
mcp__protolabs__get_project_spec({
  projectPath: '/home/user/my-project',
});
```

### update_project_spec

Update the project specification.

```typescript
mcp__protolabs__update_project_spec({
  projectPath: '/home/user/my-project',
  content: '# Project Spec\n\n## Goals\n...',
});
```

## Error Codes

| Code                  | Meaning                        |
| --------------------- | ------------------------------ |
| `NOT_FOUND`           | Resource doesn't exist         |
| `DUPLICATE`           | Resource already exists        |
| `VALIDATION_ERROR`    | Invalid input parameters       |
| `PERMISSION_DENIED`   | Operation not allowed          |
| `INTERNAL_ERROR`      | Server-side failure            |
| `SERVICE_UNAVAILABLE` | Required service not available |

## Troubleshooting

### "Tool not found"

The MCP server isn't connected. Verify:

1. The plugin is installed: `claude plugin list`
2. The server is running: check `packages/mcp-server/`
3. The API key is set in the plugin environment

### "AUTOMAKER_API_KEY not set"

Set the API key in the plugin config:

```bash
# packages/mcp-server/plugins/automaker/.env
AUTOMAKER_API_KEY=your-api-key
```

### "projectPath not found"

Use an absolute path to your project:

```typescript
// ❌ Relative path
projectPath: './my-project';

// ✅ Absolute path
projectPath: '/home/user/my-project';
```

## Learn More

- [Claude Code Plugin](/integrations/claude-plugin) - Plugin setup and commands
- [Creating MCP Tools](../dev/creating-mcp-tools.md) - Build custom tools
- [Project Orchestration](../infra/orchestration.md) - Planning large projects
