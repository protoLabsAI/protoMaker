import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { getDefaultModel } from './model-resolver.js';
import chatRouter from './routes/chat.js';
import tracesRouter from './routes/traces.js';
import commandsRouter from './routes/commands.js';
import promptsRouter from './routes/prompts.js';
import rolesRouter from './routes/roles.js';
import { startWebSocketServer } from './ws.js';

// ─── App factory ──────────────────────────────────────────────────────────────

/**
 * Create and configure the Express application.
 *
 * Middleware:
 *   - CORS (permissive by default; restrict origins via the CORS_ORIGIN env var)
 *   - JSON body parsing (limit: 10mb)
 *
 * Routes:
 *   GET /api/health  → { status: "ok", model: "<resolved-model-id>", provider: "<provider>" }
 */
export function createApp(): express.Application {
  const app = express();

  // ── Middleware ──────────────────────────────────────────────────────────────

  const allowedOrigin = process.env['CORS_ORIGIN'];
  app.use(cors(allowedOrigin ? { origin: allowedOrigin, credentials: true } : undefined));

  app.use(express.json({ limit: '10mb' }));

  // ── Routes ──────────────────────────────────────────────────────────────────

  app.get('/api/health', (_req: Request, res: Response) => {
    const { modelId, provider } = getDefaultModel();
    res.json({ status: 'ok', model: modelId, provider });
  });

  app.use('/api/chat', chatRouter);
  app.use('/api/traces', tracesRouter);
  app.use('/api/commands', commandsRouter);
  app.use('/api/prompts', promptsRouter);
  app.use('/api/roles', rolesRouter);

  return app;
}

// ─── Server entry point ───────────────────────────────────────────────────────

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
const app = createApp();

app.listen(PORT, () => {
  const { modelId, provider } = getDefaultModel();
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Active model: ${modelId} (${provider})`);

  // Start the optional WebSocket sideband for tool progress events
  startWebSocketServer();
});
