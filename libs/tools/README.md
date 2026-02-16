# @automaker/tools

Unified tool definition and registry system for AutoMaker.

## Overview

This package provides a type-safe tool creation system with Zod schema validation and centralized tool management. It enables defining reusable tools with input/output validation and dependency injection through a context interface.

## Features

- **Type-safe tool definitions** with `defineSharedTool<TInput, TOutput>()`
- **Zod schema validation** for inputs and outputs
- **ToolContext interface** for dependency injection
- **ToolRegistry** for centralized tool management
- **Tool categorization and tagging** for organization
- **Full TypeScript support** with generated type definitions

## Installation

```bash
npm install @automaker/tools
```

## Usage

### Creating a Tool

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

### Using the Registry

```typescript
import { ToolRegistry } from '@automaker/tools';

// Create registry
const registry = new ToolRegistry();

// Register tools
registry.register(greetTool);

// Execute by name
const result = await registry.execute('greet', { name: 'Alice' });
console.log(result.data?.message); // "Hello Alice!"

// Lookup tools
const tool = registry.get('greet');
console.log(registry.has('greet')); // true
console.log(registry.listNames()); // ['greet']

// Filter by category or tag
const greetingTools = registry.getByCategory('greetings');
const socialTools = registry.getByTag('social');
```

### Using ToolContext

```typescript
const contextAwareTool = defineSharedTool({
  name: 'save-file',
  description: 'Saves data to a file',
  inputSchema: z.object({ content: z.string() }),
  outputSchema: z.object({ path: z.string() }),
  execute: async (input, context) => {
    // Access injected services
    const fs = context.services?.fs;
    const projectPath = context.projectPath;

    // Use context for execution
    const filePath = `${projectPath}/output.txt`;
    await fs.writeFile(filePath, input.content);

    return {
      success: true,
      data: { path: filePath },
    };
  },
});

// Execute with context
await registry.execute(
  'save-file',
  { content: 'Hello' },
  {
    projectPath: '/tmp/project',
    services: { fs: fsImplementation },
  }
);
```

## API Reference

### `defineSharedTool<TInput, TOutput>(definition)`

Factory function to create type-safe tool definitions.

**Parameters:**

- `definition.name` - Unique tool identifier
- `definition.description` - Human-readable description
- `definition.inputSchema` - Zod schema for input validation
- `definition.outputSchema` - Zod schema for output validation
- `definition.execute` - Async function that executes the tool
- `definition.metadata` - Optional categorization metadata

**Returns:** `SharedTool<TInput, TOutput>`

### `ToolRegistry`

Central registry for managing tools.

**Methods:**

- `register(tool)` - Register a tool
- `registerMany(tools)` - Register multiple tools
- `get(name)` - Get tool by name
- `has(name)` - Check if tool exists
- `unregister(name)` - Remove tool
- `execute(name, input, context?)` - Execute tool by name
- `listNames()` - Get all tool names
- `listTools()` - Get all tools
- `getByCategory(category)` - Filter by category
- `getByTag(tag)` - Filter by tag
- `clear()` - Remove all tools
- `size` - Number of registered tools

### `ToolContext`

Context interface for dependency injection.

**Properties:**

- `services?` - Service instances (database, API clients, etc.)
- `config?` - Configuration values
- `featureId?` - Current feature/context identifier
- `projectPath?` - Project file system path
- `metadata?` - Additional metadata

### `ToolResult<TOutput>`

Tool execution result.

**Properties:**

- `success` - Boolean indicating success/failure
- `data?` - Output data (if successful)
- `error?` - Error message (if failed)
- `metadata?` - Additional execution metadata

## License

SEE LICENSE IN LICENSE
