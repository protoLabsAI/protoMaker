/**
 * GET /api/traces       → list of all stored traces (newest first)
 * GET /api/traces/:id   → single trace by ID
 *
 * Traces are populated by the POST /api/chat handler via the onFinish callback.
 * Data is stored in-memory; restart the server to clear it.
 */

import { Router, type Request, type Response } from 'express';
import { traceStore } from '../tracing/trace-store.js';

const router = Router();

// ── GET / ─────────────────────────────────────────────────────────────────────

router.get('/', (_req: Request, res: Response): void => {
  res.json(traceStore.list());
});

// ── GET /:id ──────────────────────────────────────────────────────────────────

router.get('/:id', (req: Request, res: Response): void => {
  const trace = traceStore.get(String(req.params['id'] ?? ''));
  if (!trace) {
    res.status(404).json({ error: 'Trace not found' });
    return;
  }
  res.json(trace);
});

export default router;
