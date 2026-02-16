# Tools Package (`@automaker/tools`)

Unified tool definition and registry system for building type-safe, reusable tools with Zod schema validation and dependency injection.

## Overview

The `@automaker/tools` package provides a centralized system for creating, managing, and executing tools with:

- **Type-safe tool definitions** via `defineSharedTool<TInput, TOutput>()`
- **Zod schema validation** for inputs and outputs
- **ToolContext interface** for dependency injection
- **ToolRegistry** for centralized tool management
- **Categorization and tagging** for organization
- **Full TypeScript support** with generated types

## Installation

The package is part of the monorepo and available via workspace imports:

```typescript
import { defineSharedTool, ToolRegistry } from '@automaker/tools';
```

## Core Concepts

### Tool Definition

A tool is defined with:

1. **Name** — Unique identifier (e.g., `"greet"`, `"save-file"`)
2. **Description** — Human-readable purpose
3. **Input schema** — Zod schema for input validation
4. **Output schema** — Zod schema for output validation
5. **Execute function** — Async function that processes input
6. **Metadata** (optional) — Category and tags for organization

### Tool Context

The `ToolContext` interface enables **dependency injection** at execution time:

```typescript
interface ToolContext {
  services?: Record<string, any>; // Service instances (DB, API clients, etc.)
  config?: Record<string, any>; // Configuration values
  featureId?: string; // Current feature/context identifier
  projectPath?: string; // Project file system path
  metadata?: Record<string, any>; // Additional metadata
}
```

This allows tools to access external dependencies without hardcoding them.

### Tool Result

All tools return a standardized `ToolResult<TOutput>`:

```typescript
interface ToolResult<TOutput> {
  success: boolean; // Execution success/failure
  data?: TOutput; // Output data (if successful)
  error?: string; // Error message (if failed)
  metadata?: Record<string, any>; // Additional execution metadata
}
```

## Creating Tools

### Basic Tool

```typescript
import { defineSharedTool } from '@automaker/tools';
import { z } from 'zod';

const greetTool = defineSharedTool({
  name: 'greet',
  description: 'Greets a person by name',
  inputSchema: z.object({
    name: z.string(),
    age: z.number().optional(),
  }),
  outputSchema: z.object({
    message: z.string(),
  }),
  execute: async (input, context) => {
    const greeting = input.age ? `Hello ${input.name}, age ${input.age}!` : `Hello ${input.name}!`;

    return {
      success: true,
      data: { message: greeting },
    };
  },
  metadata: {
    category: 'greetings',
    tags: ['social', 'communication'],
  },
});
```

**Type safety:**

```typescript
// Input type is inferred from inputSchema
type GreetInput = z.infer<typeof greetTool.inputSchema>;
// { name: string; age?: number }

// Output type is inferred from outputSchema
type GreetOutput = z.infer<typeof greetTool.outputSchema>;
// { message: string }
```

### Context-Aware Tool

Tools can access injected dependencies via `context`:

```typescript
const saveFileTool = defineSharedTool({
  name: 'save-file',
  description: 'Saves data to a file',
  inputSchema: z.object({
    content: z.string(),
    filename: z.string().optional(),
  }),
  outputSchema: z.object({
    path: z.string(),
  }),
  execute: async (input, context) => {
    // Access injected services
    const fs = context.services?.fs;
    const projectPath = context.projectPath;

    if (!fs || !projectPath) {
      return {
        success: false,
        error: 'Missing required context: fs service or projectPath',
      };
    }

    // Use context for execution
    const filename = input.filename || 'output.txt';
    const filePath = `${projectPath}/${filename}`;

    try {
      await fs.writeFile(filePath, input.content);
      return {
        success: true,
        data: { path: filePath },
      };
    } catch (err) {
      return {
        success: false,
        error: `Failed to write file: ${err.message}`,
      };
    }
  },
  metadata: {
    category: 'file-operations',
    tags: ['io', 'files'],
  },
});
```

### Error Handling

Tools should catch errors and return structured failures:

```typescript
const fetchDataTool = defineSharedTool({
  name: 'fetch-data',
  description: 'Fetches data from an API',
  inputSchema: z.object({
    url: z.string().url(),
  }),
  outputSchema: z.object({
    data: z.any(),
  }),
  execute: async (input, context) => {
    try {
      const response = await fetch(input.url);
      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return {
        success: true,
        data: { data },
      };
    } catch (err) {
      return {
        success: false,
        error: `Network error: ${err.message}`,
      };
    }
  },
});
```

## Tool Registry

The `ToolRegistry` provides centralized tool management.

### Creating a Registry

```typescript
import { ToolRegistry } from '@automaker/tools';

const registry = new ToolRegistry();
```

### Registering Tools

```typescript
// Register single tool
registry.register(greetTool);

// Register multiple tools
registry.registerMany([greetTool, saveFileTool, fetchDataTool]);
```

### Executing Tools

```typescript
// Execute by name
const result = await registry.execute('greet', { name: 'Alice' });

if (result.success) {
  console.log(result.data?.message); // "Hello Alice!"
} else {
  console.error(result.error);
}

// Execute with context
const result = await registry.execute(
  'save-file',
  { content: 'Hello world' },
  {
    projectPath: '/tmp/project',
    services: { fs: fsImplementation },
  }
);
```

### Querying Tools

```typescript
// Check if tool exists
registry.has('greet'); // true

// Get tool by name
const tool = registry.get('greet');

// List all tool names
registry.listNames(); // ['greet', 'save-file', 'fetch-data']

// Get all tools
const allTools = registry.listTools();

// Filter by category
const fileTools = registry.getByCategory('file-operations');

// Filter by tag
const ioTools = registry.getByTag('io');

// Registry size
console.log(registry.size); // 3
```

### Unregistering Tools

```typescript
// Remove single tool
registry.unregister('greet');

// Clear all tools
registry.clear();
```

## Usage Patterns

### LangGraph Integration

Tools can be used within LangGraph nodes:

```typescript
import { defineSharedTool, ToolRegistry } from '@automaker/tools';
import { StateGraph, Annotation } from '@langchain/langgraph';

// Define tools
const analyzeTool = defineSharedTool({
  name: 'analyze-code',
  description: 'Analyzes code quality',
  inputSchema: z.object({ code: z.string() }),
  outputSchema: z.object({ score: z.number() }),
  execute: async (input) => {
    // Analysis logic...
    return { success: true, data: { score: 0.85 } };
  },
});

// Register in global registry
const toolRegistry = new ToolRegistry();
toolRegistry.register(analyzeTool);

// Use in LangGraph node
const GraphState = Annotation.Root({
  code: Annotation<string>,
  qualityScore: Annotation<number>,
});

async function analyzeNode(state: typeof GraphState.State) {
  const result = await toolRegistry.execute('analyze-code', { code: state.code });

  if (!result.success) {
    throw new Error(`Analysis failed: ${result.error}`);
  }

  return { qualityScore: result.data!.score };
}

const workflow = new StateGraph(GraphState);
workflow.addNode('analyze', analyzeNode);
// ...
```

### Dynamic Tool Loading

Load tools from external sources at runtime:

```typescript
import { defineSharedTool, ToolRegistry } from '@automaker/tools';
import * as fs from 'fs/promises';

async function loadToolsFromDirectory(registry: ToolRegistry, dir: string) {
  const files = await fs.readdir(dir);

  for (const file of files) {
    if (file.endsWith('.tool.ts')) {
      const toolModule = await import(`${dir}/${file}`);
      const tool = toolModule.default;

      if (tool && typeof tool.execute === 'function') {
        registry.register(tool);
      }
    }
  }
}

// Load all tools from a directory
const registry = new ToolRegistry();
await loadToolsFromDirectory(registry, './tools');

console.log(`Loaded ${registry.size} tools`);
```

### Conditional Tool Execution

Execute different tools based on runtime conditions:

```typescript
async function processData(input: unknown, context: ToolContext) {
  const registry = new ToolRegistry();
  registry.registerMany([validateTool, transformTool, saveTool]);

  // 1. Validate
  const validationResult = await registry.execute('validate', input, context);
  if (!validationResult.success) {
    return validationResult; // Return early on validation failure
  }

  // 2. Transform
  const transformResult = await registry.execute('transform', validationResult.data, context);
  if (!transformResult.success) {
    return transformResult;
  }

  // 3. Save
  return await registry.execute('save', transformResult.data, context);
}
```

### Tool Chaining

Chain tools together with output → input mapping:

```typescript
async function chainTools(
  registry: ToolRegistry,
  toolNames: string[],
  initialInput: unknown,
  context: ToolContext
) {
  let currentInput = initialInput;

  for (const toolName of toolNames) {
    const result = await registry.execute(toolName, currentInput, context);

    if (!result.success) {
      return result; // Stop chain on first failure
    }

    currentInput = result.data; // Feed output to next tool
  }

  return { success: true, data: currentInput };
}

// Usage
const result = await chainTools(
  registry,
  ['fetch-data', 'parse-json', 'validate-schema', 'save-to-db'],
  { url: 'https://api.example.com/data' },
  context
);
```

## Testing

The tools package is designed for easy testing with mock dependencies:

### Testing Tool Definitions

```typescript
import { defineSharedTool } from '@automaker/tools';
import { z } from 'zod';

describe('greetTool', () => {
  it('should greet by name only', async () => {
    const result = await greetTool.execute({ name: 'Alice' }, {});

    expect(result.success).toBe(true);
    expect(result.data?.message).toBe('Hello Alice!');
  });

  it('should greet with age', async () => {
    const result = await greetTool.execute({ name: 'Bob', age: 30 }, {});

    expect(result.success).toBe(true);
    expect(result.data?.message).toBe('Hello Bob, age 30!');
  });

  it('should validate input schema', async () => {
    // @ts-expect-error Testing invalid input
    const result = await greetTool.execute({ name: 123 }, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('validation');
  });
});
```

### Testing with Mock Context

```typescript
import { createMockContext } from './test-utils';

describe('saveFileTool', () => {
  it('should save file with injected fs', async () => {
    const mockFs = {
      writeFile: jest.fn().mockResolvedValue(undefined),
    };

    const context = {
      projectPath: '/tmp/test',
      services: { fs: mockFs },
    };

    const result = await saveFileTool.execute({ content: 'Hello world' }, context);

    expect(result.success).toBe(true);
    expect(result.data?.path).toBe('/tmp/test/output.txt');
    expect(mockFs.writeFile).toHaveBeenCalledWith('/tmp/test/output.txt', 'Hello world');
  });

  it('should fail when missing context', async () => {
    const result = await saveFileTool.execute({ content: 'test' }, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required context');
  });
});
```

### Testing Registry

```typescript
import { ToolRegistry } from '@automaker/tools';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register and retrieve tools', () => {
    registry.register(greetTool);

    expect(registry.has('greet')).toBe(true);
    expect(registry.get('greet')).toBe(greetTool);
  });

  it('should execute tools by name', async () => {
    registry.register(greetTool);

    const result = await registry.execute('greet', { name: 'Alice' });

    expect(result.success).toBe(true);
    expect(result.data?.message).toBe('Hello Alice!');
  });

  it('should filter by category', () => {
    registry.registerMany([greetTool, saveFileTool]);

    const fileTools = registry.getByCategory('file-operations');
    expect(fileTools).toHaveLength(1);
    expect(fileTools[0].name).toBe('save-file');
  });
});
```

## Migration from Existing Tool Systems

If you have existing tool implementations, migrate them to `@automaker/tools`:

### Before (Inline Tool Implementation)

```typescript
async function processFeature(feature: Feature) {
  // Tool logic embedded in function
  const analysis = await analyzeCode(feature.code);
  const score = calculateScore(analysis);

  // No reusability, no validation, no registry
  return { score };
}
```

### After (Tool Package)

```typescript
import { defineSharedTool, ToolRegistry } from '@automaker/tools';

// 1. Define tool
const analyzeFeatureTool = defineSharedTool({
  name: 'analyze-feature',
  description: 'Analyzes feature code quality',
  inputSchema: z.object({
    code: z.string(),
  }),
  outputSchema: z.object({
    score: z.number(),
  }),
  execute: async (input) => {
    const analysis = await analyzeCode(input.code);
    const score = calculateScore(analysis);
    return { success: true, data: { score } };
  },
});

// 2. Register globally
const globalRegistry = new ToolRegistry();
globalRegistry.register(analyzeFeatureTool);

// 3. Use anywhere
async function processFeature(feature: Feature) {
  const result = await globalRegistry.execute('analyze-feature', { code: feature.code });
  return result.data;
}
```

**Benefits:**

- ✅ Reusable across codebase
- ✅ Type-safe with Zod validation
- ✅ Centrally managed via registry
- ✅ Testable in isolation
- ✅ Context-injectable for DI

## API Reference

### `defineSharedTool<TInput, TOutput>(definition)`

Factory function to create type-safe tool definitions.

**Parameters:**

```typescript
interface ToolDefinition<TInput, TOutput> {
  name: string; // Unique tool identifier
  description: string; // Human-readable description
  inputSchema: z.ZodSchema<TInput>; // Zod schema for input validation
  outputSchema: z.ZodSchema<TOutput>; // Zod schema for output validation
  execute: (input: TInput, context: ToolContext) => Promise<ToolResult<TOutput>>;
  metadata?: {
    category?: string; // Tool category (e.g., 'file-operations')
    tags?: string[]; // Tags for filtering (e.g., ['io', 'files'])
  };
}
```

**Returns:** `SharedTool<TInput, TOutput>`

### `ToolRegistry`

Central registry for managing tools.

**Methods:**

- `register(tool)` — Register a tool
- `registerMany(tools)` — Register multiple tools
- `get(name)` — Get tool by name
- `has(name)` — Check if tool exists
- `unregister(name)` — Remove tool
- `execute(name, input, context?)` — Execute tool by name
- `listNames()` — Get all tool names
- `listTools()` — Get all tools
- `getByCategory(category)` — Filter by category
- `getByTag(tag)` — Filter by tag
- `clear()` — Remove all tools
- `size` — Number of registered tools

### `ToolContext`

Context interface for dependency injection.

**Properties:**

```typescript
interface ToolContext {
  services?: Record<string, any>; // Service instances (DB, API clients, etc.)
  config?: Record<string, any>; // Configuration values
  featureId?: string; // Current feature/context identifier
  projectPath?: string; // Project file system path
  metadata?: Record<string, any>; // Additional metadata
}
```

### `ToolResult<TOutput>`

Tool execution result.

**Properties:**

```typescript
interface ToolResult<TOutput> {
  success: boolean; // Boolean indicating success/failure
  data?: TOutput; // Output data (if successful)
  error?: string; // Error message (if failed)
  metadata?: Record<string, any>; // Additional execution metadata
}
```

## Related Documentation

- [Flows Package](./flows.md) — LangGraph flow architecture and patterns
- [Shared Packages](./shared-packages.md) — Monorepo package overview
- [Types Package](../libs/types/README.md) — Core TypeScript type definitions
