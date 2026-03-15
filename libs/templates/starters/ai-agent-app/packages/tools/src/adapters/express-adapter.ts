/**
 * Express adapter for SharedTool conversion.
 *
 * Converts SharedTool definitions into an Express Router with:
 * - POST /tools/:toolName routes with automatic Zod validation
 * - POST /tools/execute dispatcher for dynamic tool invocation
 * - GET /tools listing endpoint
 * - Proper HTTP status codes (400 validation errors, 404 not found, 500 errors)
 */

import express, { type Router, type Request, type Response } from 'express';
import type { SharedTool, ToolContext } from '../types.js';

/**
 * Options for configuring the Express adapter.
 */
export interface ExpressAdapterOptions {
  /**
   * Base path prefix for all tool routes (default: '/tools')
   */
  basePath?: string;

  /**
   * Per-request context factory for dependency injection.
   * Called before every tool execution to build the ToolContext.
   */
  contextFactory?: (req: Request) => ToolContext | Promise<ToolContext>;

  /**
   * Include the generic `/execute` dispatcher endpoint (default: true)
   */
  includeDispatcher?: boolean;

  /**
   * Custom error handler for unexpected execution errors.
   */
  errorHandler?: (error: unknown, toolName: string, res: Response) => void;
}

/**
 * Convert an array of SharedTool definitions into an Express Router.
 *
 * Each tool gets a `POST {basePath}/{toolName}` route. Optionally, a
 * `POST {basePath}/execute` dispatcher and `GET {basePath}` listing endpoint
 * are also registered.
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { toExpressRouter } from './adapters/express-adapter.js';
 * import { getWeatherTool, searchWebTool } from './examples/index.js';
 *
 * const app = express();
 * app.use(express.json());
 * app.use(
 *   '/api',
 *   toExpressRouter([getWeatherTool, searchWebTool], {
 *     contextFactory: (req) => ({
 *       userId: req.headers['x-user-id'],
 *       apiKey: process.env.EXTERNAL_API_KEY,
 *     }),
 *   })
 * );
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toExpressRouter(
  tools: SharedTool<any, any>[],
  options: ExpressAdapterOptions = {}
): Router {
  const {
    basePath = '/tools',
    contextFactory,
    includeDispatcher = true,
    errorHandler = defaultErrorHandler,
  } = options;

  const router = express.Router();

  // Map for O(1) lookup in dispatcher
  const toolMap = new Map<string, SharedTool>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  // Individual POST routes per tool
  for (const tool of tools) {
    const route = `${basePath}/${tool.name}`;

    router.post(route, async (req: Request, res: Response) => {
      try {
        const context = contextFactory ? await contextFactory(req) : {};

        const validationResult = tool.inputSchema.safeParse(req.body);
        if (!validationResult.success) {
          res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: validationResult.error.format(),
          });
          return;
        }

        const result = await tool.execute(validationResult.data, context);

        if (result.success && result.data !== undefined) {
          const outputValidation = tool.outputSchema.safeParse(result.data);
          if (!outputValidation.success) {
            res.status(500).json({
              success: false,
              error: 'Tool output validation failed',
              details: outputValidation.error.format(),
            });
            return;
          }
        }

        res.status(result.success ? 200 : 500).json(result);
      } catch (error) {
        errorHandler(error, tool.name, res);
      }
    });
  }

  if (includeDispatcher) {
    // Generic dispatcher: POST /tools/execute  { tool: 'name', input: {...} }
    router.post(`${basePath}/execute`, async (req: Request, res: Response) => {
      try {
        const { tool: toolName, input } = req.body as { tool: unknown; input: unknown };

        if (!toolName || typeof toolName !== 'string') {
          res.status(400).json({
            success: false,
            error: 'Missing or invalid "tool" field in request body',
          });
          return;
        }

        const tool = toolMap.get(toolName);
        if (!tool) {
          res.status(404).json({
            success: false,
            error: `Tool "${toolName}" not found`,
            availableTools: Array.from(toolMap.keys()),
          });
          return;
        }

        const context = contextFactory ? await contextFactory(req) : {};

        const validationResult = tool.inputSchema.safeParse(input);
        if (!validationResult.success) {
          res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: validationResult.error.format(),
          });
          return;
        }

        const result = await tool.execute(validationResult.data, context);

        if (result.success && result.data !== undefined) {
          const outputValidation = tool.outputSchema.safeParse(result.data);
          if (!outputValidation.success) {
            res.status(500).json({
              success: false,
              error: 'Tool output validation failed',
              details: outputValidation.error.format(),
            });
            return;
          }
        }

        res.status(result.success ? 200 : 500).json(result);
      } catch (error) {
        errorHandler(error, 'execute', res);
      }
    });

    // List all registered tools
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
  res.status(500).json({ success: false, error: 'Internal server error', message });
}
