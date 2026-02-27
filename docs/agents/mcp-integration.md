# MCP Integration with Agents

This guide explains how **Model Context Protocol (MCP) tools** interact with protoLabs's agent system, enabling programmatic control of agent execution.

## Table of Contents

- [What is MCP?](#what-is-mcp)
- [protoLabs's MCP Architecture](#automakers-mcp-architecture)
- [MCP → Agent Flow](#mcp--agent-flow)
- [Available MCP Tools](#available-mcp-tools)
- [Creating New MCP Tools](#creating-new-mcp-tools)
- [Context Passing](#context-passing)
- [Best Practices](#best-practices)

## What is MCP?

**Model Context Protocol** (MCP) is Anthropic's standard for connecting AI models to external tools, data sources, and services. MCP servers expose tools that Claude can invoke during conversations.

**Key Concepts:**

- **MCP Server** - Exposes tools via protocol
- **MCP Tool** - Individual capability (e.g., "start_agent", "create_feature")
- **MCP Resource** - Data that can be read (e.g., feature list, agent output)

**protoLabs's MCP Server:**

- **Location:** `packages/mcp-server/`
- **Exposes:** 112 tools for controlling protoLabs programmatically
- **Used By:** The Chief of Staff agent, other AI agents, external integrations

**Official Docs:** [MCP Specification](https://spec.modelcontextprotocol.io/)

## protoLabs's MCP Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Claude Code CLI / Chief of Staff Agent                 │
│  (Invokes MCP tools via claude.ai/code)                │
└──────────────────────┬──────────────────────────────────┘
                       │ MCP Protocol (stdio/HTTP)
┌──────────────────────▼──────────────────────────────────┐
│  protoLabs MCP Server                                   │
│  Location: packages/mcp-server/src/index.ts            │
│  - Tool definitions (112 tools)                         │
│  - API client (calls protoLabs server)                  │
│  - Auth (AUTOMAKER_API_KEY)                            │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP REST API
┌──────────────────────▼──────────────────────────────────┐
│  protoLabs Server                                       │
│  Location: apps/server/src/                            │
│  - API routes (agent, features, auto-mode)              │
│  - Services (AgentService, AutoModeService)             │
│  - Provider layer → Claude SDK                          │
└─────────────────────────────────────────────────────────┘
```

## MCP → Agent Flow

### Example: Starting a Feature Agent via MCP

```typescript
// 1. Chief of Staff calls MCP tool
await use_mcp_tool({
  server_name: 'automaker',
  tool_name: 'start_agent',
  arguments: {
    projectPath: '/path/to/protomaker',
    featureId: 'feature-123',
    useWorktrees: true
  }
});

// 2. MCP Server receives tool call
// packages/mcp-server/src/index.ts
case 'start_agent':
  return apiCall('/auto-mode/run-feature', {
    projectPath: args.projectPath,
    featureId: args.featureId,
    useWorktrees: args.useWorktrees ?? true,
  });

// 3. API route handler
// apps/server/src/routes/auto-mode/routes/run-feature.ts
export function createRunFeatureHandler(autoModeService: AutoModeService) {
  return async (req: Request, res: Response): Promise<void> => {
    const { projectPath, featureId, useWorktrees } = req.body;

    // Check capacity
    const capacity = await autoModeService.checkWorktreeCapacity(projectPath, featureId);
    if (!capacity.hasCapacity) {
      res.status(429).json({ success: false, error: 'Agent limit reached' });
      return;
    }

    // Start execution in background
    autoModeService
      .executeFeature(projectPath, featureId, useWorktrees, false)
      .catch((error) => logger.error(`Feature ${featureId} error:`, error));

    res.json({ success: true });
  };
}

// 4. AutoModeService executes agent
// apps/server/src/services/auto-mode-service.ts
async executeFeature(projectPath: string, featureId: string, useWorktrees: boolean): Promise<void> {
  // Load feature
  const feature = await this.loadFeature(projectPath, featureId);

  // Load context
  const contextResult = await loadContextFiles({ projectPath, taskContext: { title: feature.title, description: feature.description } });

  // Build SDK options
  const sdkOptions = createChatOptions({ cwd: worktreePath, systemPrompt: contextResult.formattedPrompt });

  // Execute via provider
  const provider = ProviderFactory.getProviderForModel(model);
  const stream = provider.executeQuery({ prompt: feature.description, ...sdkOptions });

  // Stream results back via WebSocket
  for await (const msg of stream) {
    this.events.emit('agent:stream', { featureId, message: msg });
  }
}

// 5. Provider calls Claude SDK
// apps/server/src/providers/claude-provider.ts
async *executeQuery(options: ExecuteOptions): AsyncGenerator<ProviderMessage> {
  const env = buildEnv(options.claudeCompatibleProvider, options.credentials);

  const sdkStream = query({
    prompt: options.prompt,
    model: options.model,
    cwd: options.cwd,
    systemPrompt: options.systemPrompt,
    settingSources: options.settingSources,
    mcpServers: options.mcpServers,
    allowedTools: options.allowedTools,
    maxTurns: options.maxTurns,
    maxBudgetUsd: options.maxBudgetUsd,
    abortSignal: options.abortController.signal,
    env,
  });

  for await (const message of sdkStream) {
    yield this.transformSDKMessage(message);
  }
}

// 6. Claude SDK executes agent
// @anthropic-ai/claude-agent-sdk (native)
// - Manages context window
// - Tracks costs
// - Checkpoints files
// - Streams results back
```

## Available MCP Tools

### Feature Management

```typescript
// List features on the board
mcp__automaker__list_features({ projectPath, status: 'backlog' });

// Get feature details
mcp__automaker__get_feature({ projectPath, featureId });

// Create new feature
mcp__automaker__create_feature({
  projectPath,
  title: 'Add authentication',
  description: 'Implement OAuth2 + JWT',
  complexity: 'medium',
  dependencies: ['feature-456'], // Optional
});

// Update feature
mcp__automaker__update_feature({
  projectPath,
  featureId,
  title: 'Updated title',
  status: 'in_progress',
});

// Delete feature
mcp__automaker__delete_feature({ projectPath, featureId });

// Move feature to different column
mcp__automaker__move_feature({ projectPath, featureId, toStatus: 'review' });
```

### Agent Control

```typescript
// Start agent for a feature
mcp__automaker__start_agent({ projectPath, featureId, useWorktrees: true });

// Stop running agent
mcp__automaker__stop_agent({ featureId });

// List all running agents
mcp__automaker__list_running_agents();

// Get agent output
mcp__automaker__get_agent_output({ projectPath, featureId });

// Send message to running agent
mcp__automaker__send_message_to_agent({
  projectPath,
  featureId,
  message: 'Please add error handling',
});
```

### Queue Management

```typescript
// Add feature to queue
mcp__automaker__queue_feature({ projectPath, featureId });

// List queue
mcp__automaker__list_queue();

// Clear queue
mcp__automaker__clear_queue();
```

### Context Files

```typescript
// List context files
mcp__automaker__list_context_files({ projectPath });

// Read context file
mcp__automaker__get_context_file({ projectPath, filename: 'coding-rules.md' });

// Create context file
mcp__automaker__create_context_file({
  projectPath,
  filename: 'security-guidelines.md',
  content: '# Security Guidelines\n\n...',
});

// Delete context file
mcp__automaker__delete_context_file({ projectPath, filename: 'old-rules.md' });
```

### Auto-Mode

```typescript
// Start auto-mode
mcp__automaker__start_auto_mode({ projectPath, maxConcurrency: 2 });

// Stop auto-mode
mcp__automaker__stop_auto_mode({ projectPath });

// Get auto-mode status
mcp__automaker__get_auto_mode_status({ projectPath });
```

### Orchestration

```typescript
// Set feature dependencies
mcp__automaker__set_feature_dependencies({
  projectPath,
  featureId,
  dependencies: ['feature-123', 'feature-456'],
});

// Get dependency graph
mcp__automaker__get_dependency_graph({ projectPath });

// Get execution order
mcp__automaker__get_execution_order({ projectPath, status: 'backlog' });
```

### Project Management

```typescript
// List projects
mcp__automaker__list_projects({ projectPath });

// Create project plan
mcp__automaker__create_project({
  projectPath,
  title: 'Authentication System',
  goal: 'Implement OAuth2 authentication',
  milestones: [...],
  prd: { situation: '...', problem: '...', approach: '...', results: '...', constraints: [...] }
});

// Create features from project
mcp__automaker__create_project_features({
  projectPath,
  projectSlug: 'authentication-system',
  createEpics: true,
  setupDependencies: true
});
```

### Utilities

```typescript
// Health check
mcp__automaker__health_check();

// Get board summary
mcp__automaker__get_board_summary({ projectPath });
```

## Creating New MCP Tools

### Step 1: Define the Tool

Edit `packages/mcp-server/src/index.ts`:

```typescript
{
  name: 'your_tool_name',
  description: 'What this tool does',
  inputSchema: {
    type: 'object',
    properties: {
      projectPath: {
        type: 'string',
        description: 'Absolute path to the project directory',
      },
      yourParam: {
        type: 'string',
        description: 'Description of your parameter',
      },
    },
    required: ['projectPath', 'yourParam'],
  },
}
```

### Step 2: Implement the Handler

In the same file, add case to the tool handler:

```typescript
case 'your_tool_name':
  return apiCall('/your-api-route', {
    projectPath: args.projectPath,
    yourParam: args.yourParam,
  });
```

### Step 3: Create the API Route

Create `apps/server/src/routes/your-route/index.ts`:

```typescript
import { Router } from 'express';
import type { YourService } from '../../services/your-service.js';

export function createYourRoutes(yourService: YourService): Router {
  const router = Router();

  router.post('/your-endpoint', async (req, res) => {
    try {
      const { projectPath, yourParam } = req.body;

      // Validate inputs
      if (!projectPath || !yourParam) {
        return res.status(400).json({ success: false, error: 'Missing required params' });
      }

      // Call service
      const result = await yourService.doWork(projectPath, yourParam);

      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  });

  return router;
}
```

### Step 4: Wire into Server

Edit `apps/server/src/index.ts`:

```typescript
import { createYourRoutes } from './routes/your-route/index.js';

// Register routes
app.use('/api/your-route', createYourRoutes(yourService));
```

### Step 5: Test the Tool

```bash
# Rebuild MCP server
npm run build:packages

# Test via Claude Code CLI
claude

# In Claude conversation:
> Use the your_tool_name MCP tool to test this
```

## Context Passing

### How Context Flows from MCP → Agent

```
┌──────────────────────────────────────────────────────┐
│  Chief of Staff calls mcp__automaker__start_agent    │
│  - Passes projectPath and featureId                  │
└──────────────────┬───────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────┐
│  AutoModeService.executeFeature()                    │
│  1. Loads feature from .automaker/features/          │
│  2. Calls loadContextFiles({                         │
│       projectPath,                                   │
│       taskContext: {                                 │
│         title: feature.title,                        │
│         description: feature.description             │
│       }                                              │
│     })                                               │
└──────────────────┬───────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────┐
│  loadContextFiles() (libs/utils/src/context-loader.ts)│
│  1. Reads .automaker/context/*.md files             │
│  2. Reads .automaker/memory/*.md files (smart select)│
│  3. Formats as system prompt section                │
│  4. Returns { formattedPrompt, files, memoryFiles } │
└──────────────────┬───────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────┐
│  Build SDK Options (lib/sdk-options.ts)             │
│  - systemPrompt = basePrompt + contextResult.formattedPrompt│
│  - settingSources = ['user', 'project']             │
│  - mcpServers = { ... }                             │
│  - allowedTools = [...]                             │
└──────────────────┬───────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────┐
│  Provider.executeQuery() → Claude SDK                │
│  - Full context injected into system prompt          │
│  - Agent sees: feature description + context files   │
│    + memory + conversation history                   │
└──────────────────────────────────────────────────────┘
```

### Example: Context Seen by Agent

```
You are an AI software engineer working on feature implementation.

## Current Task
**Title:** Add authentication system
**Description:** Implement OAuth2 with JWT tokens for API endpoints

## Project Context Files

### CLAUDE.md
**Path:** `/path/to/protomaker/CLAUDE.md`
**Purpose:** Project overview and guidelines

[Full CLAUDE.md content here...]

### CODE_QUALITY.md
**Path:** `/path/to/protomaker/.automaker/context/CODE_QUALITY.md`
**Purpose:** Coding standards

- Always write tests for new features
- Use TypeScript strict mode
- Follow existing patterns in the codebase

## Memory Files

### authentication-patterns.md
**Path:** `/path/to/protomaker/.automaker/memory/authentication-patterns.md`
**Category:** patterns
**Used:** 5 times

We previously implemented OAuth2 for the admin panel. Key learnings:
- Use Passport.js for OAuth strategies
- Store JWT secret in environment variables
- Refresh tokens every 15 minutes

[Rest of agent prompt...]
```

## Best Practices

### 1. Always Pass projectPath

MCP tools need `projectPath` to load context and identify the target project.

### 2. Use Descriptive Tool Names

**Good:** `start_agent`, `create_feature`, `set_feature_dependencies`
**Bad:** `run`, `make`, `link`

### 3. Validate Inputs in API Routes

```typescript
if (!projectPath || !featureId) {
  return res.status(400).json({ success: false, error: 'Missing required params' });
}
```

### 4. Return Structured Responses

```typescript
res.json({
  success: true,
  featureId: 'feature-123',
  status: 'in_progress',
  agentStarted: true,
});
```

### 5. Handle Errors Gracefully

```typescript
try {
  // ...
} catch (error) {
  logger.error('Tool failed:', error);
  res.status(500).json({ success: false, error: (error as Error).message });
}
```

### 6. Document Tool Purpose

Include clear descriptions in tool definitions so agents know when to use them.

---

**Next:** Read [Context System Deep Dive](./context-system.md) for details on context loading and memory.
