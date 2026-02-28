# Claude Agent SDK Integration

Automaker integrates with the [Claude Agent SDK](https://github.com/anthropics/agent-sdk-typescript) to power its AI agent execution system. This guide explains the architecture, configuration patterns, and how agents are invoked.

## Architecture Overview

The agent execution pipeline consists of three main layers:

```
User/API Request
    ↓
AgentService (apps/server/src/services/agent-service.ts)
    ↓
ProviderFactory (apps/server/src/providers/provider-factory.ts)
    ↓
Claude Agent SDK (chat function with tool use)
    ↓
Agent Execution in Worktree
```

### Key Components

**AgentService** - Session management, message history, WebSocket streaming
**ProviderFactory** - Multi-provider abstraction (Claude, OpenAI, custom)
**RoleRegistryService** - Dynamic agent template storage and retrieval
**AgentFactoryService** - Agent instantiation from templates with context injection
**DynamicAgentExecutor** - Worktree-isolated execution with Claude SDK

## Provider Architecture

Automaker uses a provider abstraction to support multiple LLM backends:

### Supported Providers

| Provider   | Model IDs       | SDK Used              |
| ---------- | --------------- | --------------------- |
| **Claude** | `claude-*`      | @anthropic/agent-sdk  |
| **OpenAI** | `gpt-*`, `o1-*` | openai                |
| **Custom** | Any             | Custom implementation |

### Provider Selection

The system automatically selects the provider based on model ID:

```typescript
import { getProviderByModelId } from '@protolabs-ai/utils';

// Resolves to Claude provider
const provider = getProviderByModelId('claude-sonnet-4-6');

// Resolves to OpenAI provider
const provider = getProviderByModelId('gpt-4-turbo');
```

### Claude SDK Chat Options

When using Claude models, the SDK is configured via `createChatOptions()`:

```typescript
import { createChatOptions } from '../lib/sdk-options.js';

const chatOptions = createChatOptions({
  workingDirectory: '/path/to/worktree',
  model: 'claude-sonnet-4-6',
  thinkingLevel: 'medium', // 'low' | 'medium' | 'high'
  contextFiles: ['.automaker/context/CLAUDE.md'],
  mcpServers: ['automaker', 'github'],
  customInstructions: 'Always use conventional commits',
  skills: ['code-review', 'testing'],
  subagents: { enabled: true, custom: [] },
});

// Pass to Claude SDK
const response = await chat({
  ...chatOptions,
  messages: conversationHistory,
});
```

## Agent Session Management

### Session Lifecycle

1. **Create Session** - Initialize with working directory and model
2. **Load Context** - Inject context files from `.automaker/context/`
3. **Execute Agent** - Stream responses via WebSocket
4. **Save History** - Persist conversation to disk
5. **Resume Session** - Continue from previous conversation state

### Session Structure

```typescript
interface Session {
  messages: Message[];
  isRunning: boolean;
  abortController: AbortController | null;
  workingDirectory: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  sdkSessionId?: string; // Claude SDK session ID for continuity
  promptQueue: QueuedPrompt[]; // Auto-run queue
  featureContext?: {
    projectPath: string;
    featureId: string;
    phase: PipelinePhase;
  };
}
```

### Creating a Session

```typescript
// Via REST API
POST /api/agent/start-session
{
  "sessionId": "session-123",
  "sessionName": "Feature Implementation",
  "projectPath": "/path/to/project",
  "model": "claude-sonnet-4-6",
  "thinkingLevel": "medium"
}

// Via MCP Tool
mcp__protolabs__start_agent({
  projectPath: '/path/to/project',
  featureId: 'feature-123',
  model: 'claude-sonnet-4-6',
});
```

## Context Injection

Automaker automatically loads context files before agent execution:

### Context File Discovery

Context files are loaded from:

```bash
.automaker/context/
├── CLAUDE.md        # Primary context (auto-loaded)
├── custom-1.md      # Additional context
└── custom-2.md
```

**Loading behavior:**

```typescript
import { loadContextFiles } from '@protolabs-ai/utils';

const contextFiles = await loadContextFiles({
  workingDirectory: '/path/to/project',
  autoLoadClaudeMd: true, // Load CLAUDE.md automatically
});

// Returns: [
//   { name: 'CLAUDE.md', content: '...' },
//   { name: 'custom-1.md', content: '...' }
// ]
```

### Context File Format

Context files use markdown with optional front matter:

```markdown
---
priority: 10
tags: [architecture, patterns]
---

# Project-Specific Rules

Always use TypeScript strict mode.
Never use `any` type.
```

### Context Filtering

The system can filter out CLAUDE.md when `autoLoadClaudeMd: false`:

```typescript
import { filterClaudeMdFromContext } from '../lib/settings-helpers.js';

const filteredContext = filterClaudeMdFromContext(contextFiles);
```

## Thinking Levels

Claude models support adaptive thinking via the `thinkingLevel` parameter:

| Level    | Tokens | Use Case                                   | Cost Impact |
| -------- | ------ | ------------------------------------------ | ----------- |
| `low`    | ~500   | Simple tasks, quick responses              | +5%         |
| `medium` | ~2000  | Standard features, moderate complexity     | +15%        |
| `high`   | ~8000  | Architectural decisions, complex refactors | +50%        |

**Setting thinking level:**

```typescript
// Via session configuration
const session = {
  model: 'claude-sonnet-4-6',
  thinkingLevel: 'high', // Forces deep reasoning
};

// Or via API
PATCH /api/agent/update-session
{
  "sessionId": "session-123",
  "thinkingLevel": "high"
}
```

**When to use high thinking:**

- Architectural planning
- Complex algorithm design
- Multi-file refactoring
- Debugging subtle race conditions

## MCP Server Integration

Automaker supports Model Context Protocol (MCP) servers for tool augmentation:

### Configuring MCP Servers

```typescript
// In settings.json or via API
{
  "mcpServers": {
    "automaker": {
      "command": "node",
      "args": ["./packages/mcp-server/dist/index.js"],
      "env": {
        "AUTOMAKER_API_KEY": "..."
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "..."
      }
    }
  }
}
```

### Available MCP Servers

| Server           | Tools                                         | Use Case                  |
| ---------------- | --------------------------------------------- | ------------------------- |
| **automaker**    | 135 tools (feature mgmt, agents, queue, etc.) | Core Automaker operations |
| **github**       | PR management, issue tracking                 | GitHub integration        |
| **filesystem**   | File read/write, directory operations         | Advanced file ops         |
| **brave-search** | Web search                                    | Research tasks            |
| **context7**     | Documentation lookup                          | Library documentation     |

### Enabling MCP Servers

```typescript
import { getMCPServersFromSettings } from '../lib/settings-helpers.js';

const mcpServers = getMCPServersFromSettings(settings);

const chatOptions = createChatOptions({
  mcpServers, // Pass to Claude SDK
  // ... other options
});
```

## Skills and Subagents

### Skills Configuration

Skills are procedural markdown files loaded into agent context:

```typescript
import { getSkillsConfiguration } from '../lib/settings-helpers.js';

const skills = getSkillsConfiguration(settings);
// Returns: ['code-review', 'testing', 'debugging']

const chatOptions = createChatOptions({
  skills, // Loads .automaker/skills/*.md
  // ... other options
});
```

### Subagents Configuration

Subagents enable delegation to specialized agents:

```typescript
import { getSubagentsConfiguration } from '../lib/settings-helpers.js';

const subagents = getSubagentsConfiguration(settings);
// Returns: { enabled: true, custom: ['security-auditor'] }

const chatOptions = createChatOptions({
  subagents,
  // ... other options
});
```

## Error Handling

### Error Classification

```typescript
import { classifyError, isAbortError } from '@protolabs-ai/utils';

try {
  await executeAgent(options);
} catch (error) {
  if (isAbortError(error)) {
    // User cancelled
    return { status: 'cancelled' };
  }

  const classification = classifyError(error);
  switch (classification.category) {
    case 'rate_limit':
      // Retry with backoff
      break;
    case 'authentication':
      // Prompt for API key
      break;
    case 'network':
      // Check connectivity
      break;
    default:
      // Log and report
      logger.error('Agent execution failed', { error, classification });
  }
}
```

### Abort Handling

Users can abort running agents via:

```typescript
POST /api/agent/abort-agent
{
  "sessionId": "session-123"
}
```

The service uses `AbortController` to gracefully cancel SDK calls:

```typescript
const abortController = new AbortController();
session.abortController = abortController;

const response = await chat({
  ...chatOptions,
  signal: abortController.signal,
});
```

## Streaming Responses

Agent responses stream to the frontend via WebSocket:

### Event Types

```typescript
// Text chunk
{
  type: 'agent:text',
  sessionId: 'session-123',
  text: 'Processing your request...'
}

// Tool use
{
  type: 'agent:tool-use',
  sessionId: 'session-123',
  toolName: 'read-file',
  toolInput: { path: 'src/index.ts' }
}

// Tool result
{
  type: 'agent:tool-result',
  sessionId: 'session-123',
  toolName: 'read-file',
  result: '...'
}

// Complete
{
  type: 'agent:complete',
  sessionId: 'session-123'
}

// Error
{
  type: 'agent:error',
  sessionId: 'session-123',
  error: '...'
}
```

### Handling Streams in UI

```typescript
// React component example
useEffect(() => {
  const ws = new WebSocket('ws://localhost:3008');

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.type === 'agent:text') {
      appendText(message.text);
    } else if (message.type === 'agent:tool-use') {
      showToolIndicator(message.toolName);
    } else if (message.type === 'agent:complete') {
      markComplete();
    }
  };

  return () => ws.close();
}, []);
```

## Conversation Persistence

### Saving Sessions

Conversations are saved to `DATA_DIR/agent-sessions/`:

```bash
data/agent-sessions/
├── session-123.json       # Message history
└── metadata.json          # Session metadata
```

### Session Metadata

```typescript
interface SessionMetadata {
  id: string;
  name: string;
  projectPath?: string;
  workingDirectory: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  tags?: string[];
  model?: string;
  sdkSessionId?: string;
}
```

### Resuming Sessions

```typescript
POST /api/agent/send-message
{
  "sessionId": "session-123",
  "message": "Continue from where we left off",
  "model": "claude-sonnet-4-6"
}
```

The SDK automatically resumes conversation context using `sdkSessionId`.

## Worktree Isolation

Agents execute in isolated git worktrees to protect the main codebase:

### Worktree Creation

```typescript
import { createWorktree } from '@protolabs-ai/git-utils';

const worktreePath = await createWorktree({
  projectPath: '/path/to/project',
  branchName: 'feature/my-feature',
});

// worktreePath: '/path/to/project/.worktrees/feature-my-feature'
```

### Execution in Worktree

```typescript
const chatOptions = createChatOptions({
  workingDirectory: worktreePath, // Agent operates here
  // ... other options
});
```

### Worktree Cleanup

```typescript
import { cleanupWorktree } from '@protolabs-ai/git-utils';

await cleanupWorktree({
  projectPath: '/path/to/project',
  worktreePath,
});
```

## Custom Tool Integration

Automaker can register custom tools for agent use:

### Defining a Tool

```typescript
import { ToolDefinition } from '@protolabs-ai/tools';

const myTool: ToolDefinition = {
  name: 'analyze-dependencies',
  description: 'Analyze npm package dependencies',
  input_schema: {
    type: 'object',
    properties: {
      packagePath: { type: 'string', description: 'Path to package.json' },
    },
    required: ['packagePath'],
  },
  handler: async (input) => {
    const pkg = await fs.readFile(input.packagePath, 'utf8');
    const data = JSON.parse(pkg);
    return {
      dependencies: Object.keys(data.dependencies || {}),
      devDependencies: Object.keys(data.devDependencies || {}),
    };
  },
};
```

### Registering Tools

```typescript
import { ToolRegistry } from '@protolabs-ai/tools';

const registry = new ToolRegistry();
registry.register('dependencies', myTool);

const chatOptions = createChatOptions({
  customTools: registry.getAllTools(),
  // ... other options
});
```

## Learn More

- [Agent Architecture](./architecture.md) - Deep dive into agent system design
- [Dynamic Role Registry](./dynamic-role-registry.md) - Creating agent templates
- [MCP Integration](./mcp-integration.md) - Advanced MCP server usage
- [Prompt Engineering](./prompt-engineering.md) - Writing effective agent prompts
- [Monorepo Architecture](../dev/monorepo-architecture.md) - Package structure
