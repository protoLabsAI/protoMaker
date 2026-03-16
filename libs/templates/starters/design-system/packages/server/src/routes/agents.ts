/**
 * Agent API routes.
 *
 * POST /api/agents/design     — run the design agent
 * POST /api/agents/implement  — run the implement agent
 * POST /api/agents/a11y       — run the a11y agent
 */

import { Router, type Request, type Response } from 'express';
import { createDesignAgent, type DesignAgentConfig } from '@@PROJECT_NAME-agents';
import { ImplementAgent } from '@@PROJECT_NAME-agents/implement';
import { createA11yAgent } from '@@PROJECT_NAME-agents/a11y';

const router = Router();

// ─── Request schemas ────────────────────────────────────────────────────────

interface DesignAgentRequestBody {
  request: string;
  filePath?: string;
  model?: string;
  maxIterations?: number;
}

interface ImplementAgentRequestBody {
  penFilePath: string;
  outputDir: string;
  mode: 'library' | 'single';
  componentName?: string;
  instructions?: string;
  cssStrategy?: 'inline' | 'css-modules' | 'tailwind';
}

interface A11yAgentRequestBody {
  html: string;
  scope?: 'component' | 'page';
  context?: string;
  wcagLevel?: 'A' | 'AA' | 'AAA';
  model?: string;
  maxIterations?: number;
}

// ─── POST /design (existing) ────────────────────────────────────────────────

router.post('/design', async (req: Request, res: Response): Promise<void> => {
  const { request, filePath, model, maxIterations } = req.body as DesignAgentRequestBody;

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

// ─── POST /implement ────────────────────────────────────────────────────────

router.post('/implement', async (req: Request, res: Response): Promise<void> => {
  const { penFilePath, outputDir, mode, componentName, instructions, cssStrategy } =
    req.body as ImplementAgentRequestBody;

  if (!penFilePath || !outputDir || !mode) {
    res.status(400).json({ error: 'Missing required fields: penFilePath, outputDir, mode' });
    return;
  }

  try {
    const agent = new ImplementAgent();
    const result = await agent.generate({
      penFilePath,
      outputDir,
      mode,
      ...(componentName && { componentName }),
      ...(instructions && { instructions }),
      ...(cssStrategy && { cssStrategy }),
    });

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[agents/implement] Agent execution failed:', message);
    res.status(500).json({ error: `Implement agent failed: ${message}` });
  }
});

// ─── POST /a11y ─────────────────────────────────────────────────────────────

router.post('/a11y', async (req: Request, res: Response): Promise<void> => {
  const { html, scope, wcagLevel, model, maxIterations } = req.body as A11yAgentRequestBody;

  if (!html || typeof html !== 'string' || html.trim().length === 0) {
    res.status(400).json({ error: 'Missing required field: html (non-empty string)' });
    return;
  }

  try {
    const agent = createA11yAgent({
      ...(wcagLevel && { wcagLevel }),
      ...(model && { model }),
      ...(maxIterations !== undefined && { maxIterations }),
    });
    const result = await agent.run(html.trim(), { scope });

    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[agents/a11y] Agent execution failed:', message);
    res.status(500).json({ error: `A11y agent failed: ${message}` });
  }
});

export default router;
