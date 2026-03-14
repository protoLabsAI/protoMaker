# Route Organization Pattern

This document describes the pattern used for organizing Express routes into modular, maintainable file structures. This pattern is exemplified by the `app-spec` route module and should be applied to other route modules for consistency and maintainability.

---

## Table of Contents

1. [Overview](#overview)
2. [Directory Structure](#directory-structure)
3. [File Organization Principles](#file-organization-principles)
4. [File Types and Their Roles](#file-types-and-their-roles)
5. [Implementation Guidelines](#implementation-guidelines)
6. [Example: app-spec Module](#example-app-spec-module)
7. [Migration Guide](#migration-guide)

---

## Overview

The route organization pattern separates concerns into:

- **Route handlers** - Thin HTTP request/response handlers in `routes/` subdirectory
- **Business logic** - Extracted into standalone function files
- **Shared utilities** - Common functions and state in `common.ts`
- **Route registration** - Centralized in `index.ts`

This pattern improves:

- **Maintainability** - Clear separation of concerns
- **Testability** - Functions can be tested independently
- **Reusability** - Business logic can be reused across routes
- **Readability** - Smaller, focused files are easier to understand

---

## Directory Structure

```
routes/
  └── {module-name}/
      ├── index.ts                    # Route registration & export
      ├── common.ts                   # Shared utilities & state
      ├── {business-function}.ts      # Extracted business logic functions
      └── routes/
          ├── {endpoint-name}.ts      # Individual route handlers
          └── ...
```

### Example Structure

```
routes/
  └── app-spec/
      ├── index.ts                    # createSpecRegenerationRoutes()
      ├── common.ts                   # Shared state, logging utilities
      ├── generate-spec.ts            # generateSpec() function
      ├── generate-features-from-spec.ts  # generateFeaturesFromSpec() function
      ├── parse-and-create-features.ts   # parseAndCreateFeatures() function
      └── routes/
          ├── create.ts               # POST /create handler
          ├── generate.ts             # POST /generate handler
          ├── generate-features.ts    # POST /generate-features handler
          ├── status.ts               # GET /status handler
          └── stop.ts                 # POST /stop handler
```

---

## File Organization Principles

### 1. **Single Responsibility**

Each file should have one clear purpose:

- Route handlers handle HTTP concerns (request/response, validation)
- Business logic files contain domain-specific operations
- Common files contain shared utilities and state

### 2. **Separation of Concerns**

- **HTTP Layer** (`routes/*.ts`) - Request parsing, response formatting, status codes
- **Business Logic** (`*.ts` in root) - Core functionality, domain operations
- **Shared State** (`common.ts`) - Module-level state, cross-cutting utilities

### 3. **File Size Management**

- Extract functions when files exceed ~150-200 lines
- Extract when a function is reusable across multiple routes
- Extract when a function has complex logic that deserves its own file

### 4. **Naming Conventions**

- Route handlers: `{verb}-{resource}.ts` or `{action}.ts` (e.g., `create.ts`, `status.ts`)
- Business logic: `{action}-{noun}.ts` or `{verb}-{noun}.ts` (e.g., `generate-spec.ts`)
- Common utilities: Always `common.ts`

---

## File Types and Their Roles

### `index.ts` - Route Registration

**Purpose**: Central export point that creates and configures the Express router.

**Responsibilities**:

- Import route handler factories
- Create Express Router instance
- Register all routes
- Export router creation function

**Pattern**:

```typescript
import { Router } from "express";
import type { EventEmitter } from "../../lib/events.js";
import { createCreateHandler } from "./routes/create.js";
import { createGenerateHandler } from "./routes/generate.js";

export function create{Module}Routes(events: EventEmitter): Router {
  const router = Router();

  router.post("/create", createCreateHandler(events));
  router.get("/status", createStatusHandler());

  return router;
}
```

**Key Points**:

- Function name: `create{Module}Routes`
- Accepts dependencies (e.g., `EventEmitter`) as parameters
- Returns configured Router instance
- Route handlers are factory functions that accept dependencies

---

### `common.ts` - Shared Utilities & State

**Purpose**: Central location for shared state, utilities, and helper functions used across multiple route handlers and business logic files.

**Common Contents**:

- Module-level state (e.g., `isRunning`, `currentAbortController`)
- State management functions (e.g., `setRunningState()`)
- Logging utilities (e.g., `logAuthStatus()`, `logError()`)
- Error handling utilities (e.g., `getErrorMessage()`)
- Shared constants
- Shared types/interfaces

**Pattern**:

```typescript
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('{ModuleName}');

// Shared state
export let isRunning = false;
export let currentAbortController: AbortController | null = null;

// State management
export function setRunningState(running: boolean, controller: AbortController | null = null): void {
  isRunning = running;
  currentAbortController = controller;
}

// Utility functions
export function logError(error: unknown, context: string): void {
  logger.error(`❌ ${context}:`, error);
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
```

**Key Points**:

- Export shared state as `let` variables (mutable state)
- Provide setter functions for state management
- Keep utilities focused and reusable
- Use consistent logging patterns

---

### `routes/{endpoint-name}.ts` - Route Handlers

**Purpose**: Thin HTTP request/response handlers that validate input, call business logic, and format responses.

**Responsibilities**:

- Parse and validate request parameters
- Check preconditions (e.g., `isRunning` state)
- Call business logic functions
- Handle errors and format responses
- Manage background tasks (if applicable)

**Pattern**:

```typescript
import type { Request, Response } from "express";
import type { EventEmitter } from "../../../lib/events.js";
import { createLogger } from "@protolabsai/utils";
import {
  isRunning,
  setRunningState,
  logError,
  getErrorMessage,
} from "../common.js";
import { businessLogicFunction } from "../business-logic.js";

const logger = createLogger("{ModuleName}");

export function create{Action}Handler(events: EventEmitter) {
  return async (req: Request, res: Response): Promise<void> => {
    logger.info("========== /{endpoint} endpoint called ==========");

    try {
      // 1. Parse and validate input
      const { param1, param2 } = req.body as { param1: string; param2?: number };

      if (!param1) {
        res.status(400).json({ success: false, error: "param1 required" });
        return;
      }

      // 2. Check preconditions
      if (isRunning) {
        res.json({ success: false, error: "Operation already running" });
        return;
      }

      // 3. Set up state
      const abortController = new AbortController();
      setRunningState(true, abortController);

      // 4. Call business logic (background if async)
      businessLogicFunction(param1, param2, events, abortController)
        .catch((error) => {
          logError(error, "Operation failed");
          events.emit("module:event", { type: "error", error: getErrorMessage(error) });
        })
        .finally(() => {
          setRunningState(false, null);
        });

      // 5. Return immediate response
      res.json({ success: true });
    } catch (error) {
      logger.error("❌ Route handler exception:", error);
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
```

**Key Points**:

- Factory function pattern: `create{Action}Handler(dependencies)`
- Returns async Express handler function
- Validate input early
- Use shared utilities from `common.ts`
- Handle errors consistently
- For background tasks, return success immediately and handle completion asynchronously

---

### `{business-function}.ts` - Business Logic Files

**Purpose**: Standalone files containing complex business logic functions that can be reused across routes or extracted to reduce file size.

**When to Extract**:

- Function exceeds ~100-150 lines
- Function is called from multiple route handlers
- Function has complex logic that deserves its own file
- Function can be tested independently

**Pattern**:

```typescript
/**
 * {Brief description of what this function does}
 */

import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import type { EventEmitter } from '../../lib/events.js';
import { createLogger } from '@protolabsai/utils';
import { logAuthStatus } from './common.js';
import { anotherBusinessFunction } from './another-business-function.js';

const logger = createLogger('{ModuleName}');

export async function businessLogicFunction(
  param1: string,
  param2: number,
  events: EventEmitter,
  abortController: AbortController
): Promise<void> {
  logger.debug('========== businessLogicFunction() started ==========');

  try {
    // Business logic here
    // ...

    // Can call other business logic functions
    await anotherBusinessFunction(param1, events, abortController);

    logger.debug('========== businessLogicFunction() completed ==========');
  } catch (error) {
    logger.error('❌ businessLogicFunction() failed:', error);
    throw error;
  }
}
```

**Key Points**:

- Export named functions (not default exports)
- Include JSDoc comment at top
- Import shared utilities from `common.ts`
- Use consistent logging patterns
- Can import and call other business logic functions
- Handle errors and re-throw or emit events as appropriate

---

## Implementation Guidelines

### Step 1: Create Directory Structure

```bash
mkdir -p routes/{module-name}/routes
```

### Step 2: Create `common.ts`

Start with shared state and utilities:

- Module-level state variables
- State management functions
- Logging utilities
- Error handling utilities

### Step 3: Extract Business Logic

Identify large functions or reusable logic:

- Functions > 150 lines → extract to separate file
- Functions used by multiple routes → extract to separate file
- Complex operations → extract to separate file

### Step 4: Create Route Handlers

For each endpoint:

- Create `routes/{endpoint-name}.ts`
- Implement factory function pattern
- Keep handlers thin (validation + call business logic)
- Use utilities from `common.ts`

### Step 5: Create `index.ts`

- Import all route handler factories
- Create router and register routes
- Export router creation function

### Step 6: Register Module

In main routes file:

```typescript
import { create{Module}Routes } from "./{module-name}/index.js";

app.use("/api/{module-name}", create{Module}Routes(events));
```

---

## Example: app-spec Module

The `app-spec` module demonstrates this pattern:

### File Breakdown

**`index.ts`** (24 lines)

- Creates router
- Registers 5 endpoints
- Exports `createSpecRegenerationRoutes()`

**`common.ts`** (74 lines)

- Shared state: `isRunning`, `currentAbortController`
- State management: `setRunningState()`
- Utilities: `logAuthStatus()`, `logError()`, `getErrorMessage()`

**`generate-spec.ts`** (204 lines)

- Extracted business logic for spec generation
- Handles SDK calls, streaming, file I/O
- Called by both `create.ts` and `generate.ts` routes

**`generate-features-from-spec.ts`** (155 lines)

- Extracted business logic for feature generation
- Handles SDK calls and streaming
- Calls `parseAndCreateFeatures()` for final step

**`parse-and-create-features.ts`** (84 lines)

- Extracted parsing and file creation logic
- Called by `generate-features-from-spec.ts`

**`routes/create.ts`** (96 lines)

- Thin handler for POST /create
- Validates input, checks state, calls `generateSpec()`

**`routes/generate.ts`** (99 lines)

- Thin handler for POST /generate
- Similar to `create.ts` but different input parameter

**`routes/generate-features.ts`** (71 lines)

- Thin handler for POST /generate-features
- Calls `generateFeaturesFromSpec()`

**`routes/status.ts`** (17 lines)

- Simple handler for GET /status
- Returns current state

**`routes/stop.ts`** (25 lines)

- Simple handler for POST /stop
- Aborts current operation

### Key Observations

1. **Route handlers are thin** - Most are 70-100 lines, focused on HTTP concerns
2. **Business logic is extracted** - Complex operations in separate files
3. **Shared utilities centralized** - Common functions in `common.ts`
4. **Reusability** - `generateSpec()` used by both `create.ts` and `generate.ts`
5. **Clear separation** - HTTP layer vs business logic vs shared utilities

---

## Migration Guide

### Migrating an Existing Route Module

1. **Analyze current structure**
   - Identify all endpoints
   - Identify shared state/utilities
   - Identify large functions (>150 lines)

2. **Create directory structure**

   ```bash
   mkdir -p routes/{module-name}/routes
   ```

3. **Extract common utilities**
   - Move shared state to `common.ts`
   - Move utility functions to `common.ts`
   - Update imports in existing files

4. **Extract business logic**
   - Identify functions to extract
   - Create `{function-name}.ts` files
   - Move logic, update imports

5. **Create route handlers**
   - Create `routes/{endpoint-name}.ts` for each endpoint
   - Move HTTP handling logic
   - Keep handlers thin

6. **Create index.ts**
   - Import route handlers
   - Register routes
   - Export router creation function

7. **Update main routes file**
   - Import from new `index.ts`
   - Update route registration

8. **Test**
   - Verify all endpoints work
   - Check error handling
   - Verify shared state management

### Example Migration

**Before** (monolithic `routes.ts`):

```typescript
// routes.ts - 500+ lines
router.post('/create', async (req, res) => {
  // 200 lines of logic
});

router.post('/generate', async (req, res) => {
  // 200 lines of similar logic
});
```

**After** (organized structure):

```typescript
// routes/app-spec/index.ts
export function createSpecRegenerationRoutes(events) {
  const router = Router();
  router.post("/create", createCreateHandler(events));
  router.post("/generate", createGenerateHandler(events));
  return router;
}

// routes/app-spec/routes/create.ts - 96 lines
export function createCreateHandler(events) {
  return async (req, res) => {
    // Thin handler, calls generateSpec()
  };
}

// routes/app-spec/generate-spec.ts - 204 lines
export async function generateSpec(...) {
  // Business logic extracted here
}
```

---

## Best Practices

### ✅ Do

- Keep route handlers thin (< 150 lines)
- Extract complex business logic to separate files
- Centralize shared utilities in `common.ts`
- Use factory function pattern for route handlers
- Export named functions (not default exports)
- Use consistent logging patterns
- Handle errors consistently
- Document complex functions with JSDoc

### ❌ Don't

- Put business logic directly in route handlers
- Duplicate utility functions across files
- Create files with only one small function (< 20 lines)
- Mix HTTP concerns with business logic
- Use default exports for route handlers
- Create deeply nested directory structures
- Put route handlers in root of module directory

---

## Summary

The route organization pattern provides:

1. **Clear structure** - Easy to find and understand code
2. **Separation of concerns** - HTTP, business logic, and utilities separated
3. **Reusability** - Business logic can be shared across routes
4. **Maintainability** - Smaller, focused files are easier to maintain
5. **Testability** - Functions can be tested independently

Apply this pattern to all route modules for consistency and improved code quality.
