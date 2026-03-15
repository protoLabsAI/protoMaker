/**
 * POST /api/agents/design — Design agent endpoint.
 *
 * Accepts a natural-language design request and runs the design agent
 * against the specified .pen file. The agent uses Pencil MCP tools
 * (batch_design, set_variables, get_screenshot, snapshot_layout) to
 * apply principled design changes and verify them visually.
 *
 * Request body:
 *   {
 *     request:      string   — natural-language design instruction (required)
 *     filePath?:    string   — path to .pen file (default: "designs/components.pen")
 *     model?:       string   — model alias or full ID (default: "claude-opus-4-6")
 *     maxIterations?: number — max agentic loop iterations (default: 10)
 *   }
 *
 * Response 200:
 *   {
 *     response:         string                — agent's summary text
 *     operations:       AppliedOperation[]    — audit trail of MCP tool calls
 *     variableChanges:  Record<string,string> — design variables updated
 *     screenshots:      string[]              — base64 PNGs captured during session
 *     iterations:       number                — loop iterations used
 *   }
 *
 * Response 400: { error: "..." } — missing or invalid request body
 * Response 500: { error: "..." } — agent execution failure
 */

import { Router, type Request, type Response } from 'express';
import { createDesignAgent, type DesignAgentConfig } from '@@PROJECT_NAME-agents';

const router = Router();

// ─── Request schema ───────────────────────────────────────────────────────────

interface DesignAgentRequestBody {
  request: string;
  filePath?: string;
  model?: string;
  maxIterations?: number;
}

// ─── POST / ───────────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { request, filePath, model, maxIterations } = req.body as DesignAgentRequestBody;

  // Validate required fields
  if (!request || typeof request !== 'string' || request.trim().length === 0) {
    res.status(400).json({ error: 'Missing required field: request (non-empty string)' });
    return;
  }

  try {
    const config: DesignAgentConfig = {
      ...(filePath && { filePath }),
      ...(model && { model }),
      ...(maxIterations !== undefined && { maxIterations }),
    };

    const agent = createDesignAgent(config);
    const result = await agent.run(request.trim());

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[agents/design] Agent execution failed:', message);
    res.status(500).json({ error: `Design agent failed: ${message}` });
  }
});

export default router;
