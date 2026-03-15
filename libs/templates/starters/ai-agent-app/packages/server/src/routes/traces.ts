/**
 * GET /api/traces — trace viewer data endpoint.
 *
 * Returns all trace records written to the `.traces/` directory by
 * `FileTracer`.  Useful for a local trace viewer or debugging dashboard.
 *
 * ## Response
 * ```json
 * {
 *   "traces": [ { "traceId": "…", "name": "chat", "model": "…", … } ],
 *   "count": 3
 * }
 * ```
 *
 * ## Configuration
 * Set the `TRACES_DIR` environment variable to change the directory.
 * Defaults to `.traces` relative to `process.cwd()`.
 *
 * ## Mount
 * ```ts
 * import { tracesHandler } from './routes/traces.js';
 * app.get('/api/traces', tracesHandler);
 * ```
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Request, Response } from 'express';

const TRACES_DIR = process.env['TRACES_DIR'] ?? join(process.cwd(), '.traces');

/**
 * Express handler — reads all `trace-*.json` files and returns them as an
 * array, sorted newest-first (by filename, which includes a UUID whose
 * creation order roughly matches insertion order via the FileTracer naming
 * convention `trace-<traceId>.json`).
 */
export async function tracesHandler(_req: Request, res: Response): Promise<void> {
  let files: string[];

  try {
    files = await readdir(TRACES_DIR);
  } catch {
    // Directory doesn't exist yet — no traces written
    res.json({ traces: [], count: 0 });
    return;
  }

  const jsonFiles = files
    .filter((f) => f.startsWith('trace-') && f.endsWith('.json'))
    .sort()
    .reverse();

  const results = await Promise.all(
    jsonFiles.map(async (file) => {
      try {
        const content = await readFile(join(TRACES_DIR, file), 'utf-8');
        return JSON.parse(content) as unknown;
      } catch {
        return null;
      }
    })
  );

  const traces = results.filter(Boolean);

  res.json({ traces, count: traces.length });
}
