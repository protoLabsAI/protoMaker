/**
 * Express adapter for SharedTool conversion.
 *
 * Converts an array of SharedTool definitions into an Express Router with:
 * - Individual POST routes per tool:  POST /tools/{toolName}
 * - Generic dispatcher endpoint:      POST /tools/execute
 * - Tool listing endpoint:            GET  /tools
 * - Automatic Zod input validation (400 on failure)
 * - Automatic Zod output validation (500 on failure)
 * - Context injection via contextFactory callback
 */

import express, { type Router, type Request, type Response } from 'express';
import type { SharedTool, ToolContext } from '../core/types.js';

/**
 * Configuration options for the Express adapter.
 */
export interface ExpressAdapterOptions {
  /**
   * Base path prefix for all tool routes.
   * @default '/tools'
   */
  basePath?: string;

  /**
   * Factory function to build a `ToolContext` from the incoming request.
   * Use this to inject per-request dependencies (auth, services, etc).
   *
   * @example
   * ```typescript
   * contextFactory: (req) => ({
   *   config: { userId: req.headers['x-user-id'] },
   *   services: { db: myDatabase },
   * })
   * ```
   */
  contextFactory?: (req: Request) => ToolContext | Promise<ToolContext>;

  /**
   * Whether to include a generic `/tools/execute` dispatcher endpoint.
   * @default true
   */
  includeDispatcher?: boolean;

  /**
   * Custom error handler for uncaught tool execution errors.
   */
  errorHandler?: (error: unknown, toolName: string, res: Response) => void;
}

/**
 * Convert an array of SharedTools into an Express Router.
 *
 * Registers:
 * - `POST {basePath}/{toolName}` — individual tool endpoints
 * - `POST {basePath}/execute`    — dispatcher (if includeDispatcher is true)
 * - `GET  {basePath}`            — list available tools
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { toExpressRouter } from '@ai-agent-app/tools';
 * import { weatherTool, searchTool } from './tools';
 *
 * const app = express();
 * app.use(express.json());
 * app.use('/api', toExpressRouter([weatherTool, searchTool], {
 *   contextFactory: (req) => ({
 *     config: { userId: req.headers['x-user-id'] as string },
 *   }),
 * }));
 * ```
 */
export function toExpressRouter(tools: SharedTool[], options: ExpressAdapterOptions = {}): Router {
  const {
    basePath = '/tools',
    contextFactory,
    includeDispatcher = true,
    errorHandler = defaultErrorHandler,
  } = options;

  const router = express.Router();

  // Quick lookup map for the dispatcher endpoint
  const toolMap = new Map<string, SharedTool>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  // Register individual POST route for each tool
  for (const tool of tools) {
    const route = `${basePath}/${tool.name}`;

    router.post(route, async (req: Request, res: Response) => {
      try {
        const context: ToolContext = contextFactory ? await contextFactory(req) : {};

        // Validate input
        const validationResult = tool.inputSchema.safeParse(req.body);
        if (!validationResult.success) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: validationResult.error.format(),
          });
        }

        // Execute tool
        const result = await tool.execute(validationResult.data, context);

        // Validate output
        if (result.success && result.data !== undefined) {
          const outputValidation = tool.outputSchema.safeParse(result.data);
          if (!outputValidation.success) {
            return res.status(500).json({
              success: false,
              error: 'Tool output validation failed',
              details: outputValidation.error.format(),
            });
          }
        }

        const statusCode = result.success ? 200 : 500;
        return res.status(statusCode).json(result);
      } catch (error) {
        errorHandler(error, tool.name, res);
      }
    });
  }

  if (includeDispatcher) {
    // Generic dispatcher: POST /tools/execute { tool: 'name', input: { ... } }
    router.post(`${basePath}/execute`, async (req: Request, res: Response) => {
      try {
        const { tool: toolName, input } = req.body as {
          tool?: string;
          input?: unknown;
        };

        if (!toolName || typeof toolName !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'Missing or invalid "tool" field in request body',
          });
        }

        const tool = toolMap.get(toolName);
        if (!tool) {
          return res.status(404).json({
            success: false,
            error: `Tool "${toolName}" not found`,
            availableTools: Array.from(toolMap.keys()),
          });
        }

        const context: ToolContext = contextFactory ? await contextFactory(req) : {};

        const validationResult = tool.inputSchema.safeParse(input);
        if (!validationResult.success) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: validationResult.error.format(),
          });
        }

        const result = await tool.execute(validationResult.data, context);

        if (result.success && result.data !== undefined) {
          const outputValidation = tool.outputSchema.safeParse(result.data);
          if (!outputValidation.success) {
            return res.status(500).json({
              success: false,
              error: 'Tool output validation failed',
              details: outputValidation.error.format(),
            });
          }
        }

        const statusCode = result.success ? 200 : 500;
        return res.status(statusCode).json(result);
      } catch (error) {
        errorHandler(error, 'execute', res);
      }
    });

    // GET /tools — list available tools
    router.get(`${basePath}`, (_req: Request, res: Response) => {
      res.json({
        success: true,
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          metadata: tool.metadata,
        })),
      });
    });
  }

  return router;
}

function defaultErrorHandler(error: unknown, toolName: string, res: Response): void {
  console.error(`Error executing tool "${toolName}":`, error);
  const message = error instanceof Error ? error.message : 'Unknown error';
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message,
  });
}
