# Creating MCP Tools

This guide explains how to create new Model Context Protocol (MCP) tools for protoLabs Studio. MCP tools extend the capabilities of AI agents by providing structured, validated interfaces to backend functionality.

## Quick Start

**5-minute tutorial:** Create a simple MCP tool from scratch.

### 1. Define the Tool

Create `libs/tools/src/domains/example/hello-world.ts`:

```typescript
import { z } from 'zod';
import { defineSharedTool } from '../../define-tool.js';
import type { ToolContext } from '../../types.js';

// Input schema with Zod validation
const inputSchema = z.object({
  name: z.string().describe('Name to greet'),
});

// Output schema
const outputSchema = z.object({
  greeting: z.string().describe('The generated greeting'),
});

// Tool definition
export const helloWorldTool = defineSharedTool({
  name: 'hello-world',
  description: 'Generate a friendly greeting',
  inputSchema,
  outputSchema,
  execute: async (input, context) => {
    return {
      success: true,
      data: {
        greeting: `Hello, ${input.name}!`,
      },
    };
  },
});
```

### 2. Register the Tool

Add to `libs/tools/src/domains/example/index.ts`:

```typescript
export { helloWorldTool } from './hello-world.js';
```

Export from `libs/tools/src/index.ts`:

```typescript
export * from './domains/example/index.js';
```

### 3. Add to MCP Server

Update `packages/mcp-server/src/index.ts`:

```typescript
import { helloWorldTool, toMCPTool } from '@protolabsai/tools';

// In list_tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      toMCPTool(helloWorldTool),
      // ... other tools
    ],
  };
});

// In call_tool handler
if (name === 'hello-world') {
  const result = await helloWorldTool.execute(arguments, toolContext);
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
  };
}
```

### 4. Test the Tool

```bash
# Build packages
npm run build:packages

# Test via MCP client (Claude Desktop, etc.)
```

## Tool Architecture

### Component Overview

```
Tool Definition (libs/tools/src/domains/)
    ↓
defineSharedTool() - Validation & execution
    ↓
ToolRegistry - Central registration
    ↓
MCP Adapter (toMCPTool) - Protocol translation
    ↓
MCP Server (packages/mcp-server/src/) - Network transport
    ↓
AI Agent (Claude Code, etc.)
```

### Key Components

**SharedTool** - Type-safe tool definition with Zod schemas
**ToolContext** - Runtime context (services, state, etc.)
**ToolResult** - Standardized success/error response
**ToolRegistry** - Central tool discovery and routing
**MCP Adapter** - Converts SharedTool to MCP protocol format

## Tool Definition Pattern

### Basic Structure

```typescript
import { z } from 'zod';
import { defineSharedTool } from '@protolabsai/tools';

export const myTool = defineSharedTool({
  // Unique identifier (kebab-case)
  name: 'my-tool',

  // User-facing description (be specific)
  description: 'Does X by Y and returns Z',

  // Input validation (Zod schema)
  inputSchema: z.object({
    param1: z.string(),
    param2: z.number().optional(),
  }),

  // Output validation (Zod schema)
  outputSchema: z.object({
    result: z.string(),
  }),

  // Execution logic
  execute: async (input, context) => {
    // Business logic here
    return {
      success: true,
      data: { result: '...' },
    };
  },

  // Optional metadata
  metadata: {
    category: 'utility',
    tags: ['example'],
  },
});
```

### Input Schema (Zod)

Use Zod for type-safe input validation:

```typescript
const inputSchema = z.object({
  // Required string
  projectPath: z.string().describe('Absolute path to project'),

  // Optional string with default
  branchName: z.string().optional().default('main'),

  // Enum
  status: z.enum(['backlog', 'in_progress', 'done']),

  // Number with constraints
  retryCount: z.number().int().min(0).max(5),

  // Boolean
  force: z.boolean().default(false),

  // Array
  tags: z.array(z.string()).optional(),

  // Nested object
  options: z
    .object({
      verbose: z.boolean(),
      timeout: z.number(),
    })
    .optional(),

  // Union type
  model: z.union([z.literal('haiku'), z.literal('sonnet'), z.literal('opus')]),
});
```

### Execution Function

Implement business logic:

```typescript
execute: async (input, context) => {
  try {
    // 1. Validate context
    if (!context.featureLoader) {
      return {
        success: false,
        error: 'featureLoader not available',
        errorCode: 'MISSING_DEPENDENCY',
      };
    }

    // 2. Business logic
    const feature = await context.featureLoader.get(
      input.projectPath,
      input.featureId
    );

    if (!feature) {
      return {
        success: false,
        error: 'Feature not found',
        errorCode: 'NOT_FOUND',
      };
    }

    // 3. Perform operation
    const updated = await context.featureLoader.update(
      input.projectPath,
      input.featureId,
      { status: input.status }
    );

    // 4. Emit events
    if (context.events) {
      context.events.emit('feature:updated', {
        featureId: updated.id,
        projectPath: input.projectPath,
      });
    }

    // 5. Return success
    return {
      success: true,
      data: { feature: updated },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'EXECUTION_FAILED',
    };
  }
},
```

## Tool Context

### Available Services

Tools receive a `ToolContext` object with access to backend services:

```typescript
interface ToolContext {
  // Feature management
  featureLoader?: FeatureLoader;

  // Project operations
  projectService?: ProjectService;

  // Agent control
  agentService?: AgentService;

  // Git operations
  gitService?: GitService;

  // Event emitter
  events?: EventEmitter;

  // Logger
  logger?: Logger;

  // Settings
  settings?: Settings;
}
```

### Using Context Services

```typescript
execute: async (input, context) => {
  // Check service availability
  if (!context.featureLoader) {
    return {
      success: false,
      error: 'featureLoader not available',
      errorCode: 'MISSING_SERVICE',
    };
  }

  // Use service methods
  const features = await context.featureLoader.list(input.projectPath);

  // Log operations
  if (context.logger) {
    context.logger.info('Listed features', { count: features.length });
  }

  return { success: true, data: { features } };
},
```

## Error Handling

### Standardized Error Responses

```typescript
// Not found error
return {
  success: false,
  error: 'Feature not found',
  errorCode: 'NOT_FOUND',
  metadata: { featureId: input.featureId },
};

// Validation error
return {
  success: false,
  error: 'Invalid input: projectPath is required',
  errorCode: 'VALIDATION_ERROR',
  metadata: { field: 'projectPath' },
};
```

### Error Codes

Use consistent error code patterns:

| Code                  | Description              | HTTP Equivalent         |
| --------------------- | ------------------------ | ----------------------- |
| `VALIDATION_ERROR`    | Invalid input            | 400 Bad Request         |
| `NOT_FOUND`           | Resource not found       | 404 Not Found           |
| `DUPLICATE`           | Resource already exists  | 409 Conflict            |
| `PERMISSION_DENIED`   | Insufficient permissions | 403 Forbidden           |
| `INTERNAL_ERROR`      | Server-side error        | 500 Internal Error      |
| `SERVICE_UNAVAILABLE` | Dependency unavailable   | 503 Service Unavailable |

## Testing Tools

### Unit Tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { myTool } from './my-tool.js';
import type { ToolContext } from '../../types.js';

describe('myTool', () => {
  it('executes successfully with valid input', async () => {
    const mockContext: ToolContext = {
      featureLoader: {
        get: vi.fn().mockResolvedValue({ id: '123', title: 'Test' }),
      },
    };

    const result = await myTool.execute({ projectPath: '/test', featureId: '123' }, mockContext);

    expect(result.success).toBe(true);
    expect(result.data?.feature).toBeDefined();
  });

  it('returns error for missing service', async () => {
    const result = await myTool.execute(
      { projectPath: '/test', featureId: '123' },
      {} // No featureLoader
    );

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('MISSING_DEPENDENCY');
  });
});
```

## Domain Organization

### Directory Structure

Organize tools by domain:

```
libs/tools/src/domains/
├── features/           # Feature management
│   ├── index.ts
│   ├── create-feature.ts
│   ├── get-feature.ts
│   └── ...
├── agents/             # Agent control
│   ├── index.ts
│   ├── start-agent.ts
│   └── ...
├── projects/           # Project orchestration
│   ├── index.ts
│   ├── create-project.ts
│   └── ...
└── utilities/          # Utility tools
    ├── index.ts
    ├── health-check.ts
    └── ...
```

### Domain Boundaries

Keep tools in the correct domain:

```typescript
// ❌ Bad: Agent tool in features domain
libs / tools / src / domains / features / start - agent.ts;

// ✅ Good: Agent tool in agents domain
libs / tools / src / domains / agents / start - agent.ts;
```

## Advanced Patterns

### Tool Composition

Compose tools from shared helper functions:

```typescript
// Shared validation helper
async function validateProject(projectPath: string, context: ToolContext) {
  if (!context.featureLoader) {
    throw new Error('featureLoader not available');
  }

  const exists = await context.featureLoader.projectExists(projectPath);
  if (!exists) {
    throw new Error('Project not found');
  }
}

// Reuse in multiple tools
export const tool1 = defineSharedTool({
  name: 'tool-1',
  // ...
  execute: async (input, context) => {
    await validateProject(input.projectPath, context);
    // tool-specific logic
  },
});
```

### Batch Operations

```typescript
export const batchUpdateTool = defineSharedTool({
  name: 'batch-update-features',
  description: 'Update multiple features at once',
  inputSchema: z.object({
    projectPath: z.string(),
    featureIds: z.array(z.string()),
    updates: z.object({ status: z.string() }),
  }),
  outputSchema: z.object({
    updated: z.number(),
    failed: z.number(),
    errors: z.array(z.string()),
  }),
  execute: async (input, context) => {
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const featureId of input.featureIds) {
      try {
        await context.featureLoader!.update(input.projectPath, featureId, input.updates);
        updated++;
      } catch (error) {
        failed++;
        errors.push(`${featureId}: ${(error as Error).message}`);
      }
    }

    return {
      success: failed === 0,
      data: { updated, failed, errors },
    };
  },
});
```

## Best Practices

### 1. Write Descriptive Names

```typescript
// ✅ Good
name: 'create-feature-with-dependencies';
description: 'Create a new feature and automatically set up its dependencies';

// ❌ Bad
name: 'cf';
description: 'Creates stuff';
```

### 2. Validate All Inputs

```typescript
// ✅ Good
inputSchema: z.object({
  projectPath: z.string().min(1, 'projectPath cannot be empty'),
  featureId: z.string().regex(/^feature-\d+-[a-z0-9]+$/, 'Invalid feature ID format'),
}),

// ❌ Bad
inputSchema: z.any(); // No validation
```

### 3. Return Structured Errors

```typescript
// ✅ Good
return {
  success: false,
  error: 'Feature not found',
  errorCode: 'NOT_FOUND',
  metadata: { featureId: input.featureId },
};

// ❌ Bad
throw new Error('Error'); // Unhandled exception
```

### 4. Emit Events for Side Effects

```typescript
// ✅ Good
if (context.events) {
  context.events.emit('feature:created', {
    featureId: created.id,
    projectPath: input.projectPath,
  });
}
```

## Troubleshooting

### "Tool not found"

**Issue:** MCP server doesn't recognize tool.

**Solution:** Ensure tool is registered in `packages/mcp-server/src/index.ts`:

```typescript
// In ListToolsRequestSchema handler
tools: [
  toMCPTool(myNewTool),  // Add here
]

// In CallToolRequestSchema handler
case 'my-new-tool':
  return await myNewTool.execute(args, toolContext);
```

### "Validation error"

**Issue:** Input doesn't match schema.

**Solution:** Check Zod schema and input types match (e.g., number vs string).

## Learn More

- [MCP Tools Reference](../integrations/mcp-tools-reference.md) - Complete tool catalog
- [Agent SDK Integration](../agents/sdk-integration.md) - How agents use tools
- [Monorepo Architecture](./monorepo-architecture.md) - Package structure
