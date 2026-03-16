/**
 * Design System Starter — API Server
 *
 * Express server exposing AI agent endpoints for the design-system starter kit.
 *
 * Configure with environment variables:
 *   PORT             — HTTP port (default: 3001)
 *   ANTHROPIC_API_KEY — Required for the design agent
 *   CORS_ORIGIN      — Allowed CORS origin (default: permissive)
 *
 * Routes:
 *   GET  /api/health         → { status: "ok" }
 *   POST /api/agents/design     → run the design agent
 *   POST /api/agents/implement  → run the implement agent
 *   POST /api/agents/a11y       → run the a11y agent
 */

import express, { type Request, type Response } from 'express';
import cors from 'cors';
import agentsRouter from './routes/agents.js';

// ─── App factory ──────────────────────────────────────────────────────────────

export function createApp(): express.Application {
  const app = express();

  // ── Middleware ──────────────────────────────────────────────────────────────

  const allowedOrigin = process.env['CORS_ORIGIN'];
  app.use(cors(allowedOrigin ? { origin: allowedOrigin, credentials: true } : undefined));
  app.use(express.json({ limit: '10mb' }));

  // ── Routes ──────────────────────────────────────────────────────────────────

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/agents', agentsRouter);

  return app;
}

// ─── Server entry point ───────────────────────────────────────────────────────

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const app = createApp();

app.listen(PORT, () => {
  console.log(`Design System server listening on http://localhost:${PORT}`);
});
