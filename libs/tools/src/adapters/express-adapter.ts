/**
 * Express adapter for SharedTool conversion
 *
 * Converts SharedTool definitions into Express Router middleware with:
 * - Automatic Zod validation on request body
 * - Proper HTTP error codes (400, 500, etc.)
 * - JSON response formatting
 * - Generic /tools/execute dispatcher endpoint
 */

import express, { type Router, type Request, type Response } from 'express';
import type { SharedTool, ToolContext } from '../types.js';

/**
 * Options for configuring the Express adapter
 */
export interface ExpressAdapterOptions {
  /**
   * Base path prefix for tool routes (default: '/tools')
   */
  basePath?: string;

  /**
   * Context factory function to inject dependencies per-request
   */
  contextFactory?: (req: Request) => ToolContext | Promise<ToolContext>;

  /**
   * Whether to include a generic /execute dispatcher endpoint (default: true)
   */
  includeDispatcher?: boolean;

  /**
   * Custom error handler for tool execution errors
   */
  errorHandler?: (error: unknown, toolName: string, res: Response) => void;
}

/**
 * Convert an array of SharedTool definitions into an Express Router
 *
 * @param tools - Array of SharedTool definitions to expose as HTTP endpoints
 * @param options - Configuration options for the adapter
 * @returns Express Router with POST routes for each tool
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { toExpressRouter } from '@automaker/tools/adapters/express';
 * import { myTool } from './tools';
 *
 * const app = express();
 * app.use(express.json());
 * app.use('/api', toExpressRouter([myTool], {
 *   contextFactory: (req) => ({
 *     featureId: req.headers['x-feature-id'] as string,
 *     projectPath: req.headers['x-project-path'] as string,
 *   })
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

  // Create a map for quick tool lookup
  const toolMap = new Map<string, SharedTool>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  // Register individual POST routes for each tool
  for (const tool of tools) {
    const route = `${basePath}/${tool.name}`;

    router.post(route, async (req: Request, res: Response) => {
      try {
        // Build execution context
        const context = contextFactory ? await contextFactory(req) : {};

        // Validate input using Zod schema
        const validationResult = tool.inputSchema.safeParse(req.body);

        if (!validationResult.success) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: validationResult.error.format(),
          });
        }

        // Execute the tool
        const result = await tool.execute(validationResult.data, context);

        // Validate output using Zod schema
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

        // Return result with appropriate status code
        const statusCode = result.success ? 200 : 500;
        return res.status(statusCode).json(result);
      } catch (error) {
        errorHandler(error, tool.name, res);
      }
    });
  }

  // Register generic /execute dispatcher endpoint
  if (includeDispatcher) {
    router.post(`${basePath}/execute`, async (req: Request, res: Response) => {
      try {
        const { tool: toolName, input } = req.body;

        // Validate request structure
        if (!toolName || typeof toolName !== 'string') {
          return res.status(400).json({
            success: false,
            error: 'Missing or invalid "tool" field in request body',
          });
        }

        // Find the tool
        const tool = toolMap.get(toolName);
        if (!tool) {
          return res.status(404).json({
            success: false,
            error: `Tool "${toolName}" not found`,
            availableTools: Array.from(toolMap.keys()),
          });
        }

        // Build execution context
        const context = contextFactory ? await contextFactory(req) : {};

        // Validate input using Zod schema
        const validationResult = tool.inputSchema.safeParse(input);

        if (!validationResult.success) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: validationResult.error.format(),
          });
        }

        // Execute the tool
        const result = await tool.execute(validationResult.data, context);

        // Validate output using Zod schema
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

        // Return result with appropriate status code
        const statusCode = result.success ? 200 : 500;
        return res.status(statusCode).json(result);
      } catch (error) {
        errorHandler(error, 'execute', res);
      }
    });

    // Add a GET endpoint to list available tools
    router.get(`${basePath}`, (req: Request, res: Response) => {
      const toolsList = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        metadata: tool.metadata,
      }));

      res.json({
        success: true,
        tools: toolsList,
      });
    });
  }

  return router;
}

/**
 * Default error handler for tool execution errors
 */
function defaultErrorHandler(error: unknown, toolName: string, res: Response): void {
  console.error(`Error executing tool "${toolName}":`, error);

  const message = error instanceof Error ? error.message : 'Unknown error';

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message,
  });
}
