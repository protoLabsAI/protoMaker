/**
 * Context-engine retrieval routes — HTTP API for agent retrieval tools.
 *
 * Exposes the three `lcm_*` retrieval operations over HTTP:
 *
 *   POST /api/context-engine/grep     — lcm_grep: full-text search
 *   POST /api/context-engine/describe — lcm_describe: summary metadata + provenance
 *   POST /api/context-engine/expand   — lcm_expand: bounded DAG walk / full content
 *
 * All endpoints accept a `dbPath` field in the request body pointing to the
 * SQLite database file opened by `ConversationStore`.  The routes open a
 * short-lived read-only connection per request (better-sqlite3 is synchronous
 * so this is safe and efficient for agent call patterns).
 *
 * Mounted at `/api/context-engine` in `server/routes.ts`.
 */

import { Router, type Request, type Response } from 'express';
import * as BetterSqlite3 from 'better-sqlite3';
import { createLogger } from '@protolabsai/utils';
import {
  runMigrations,
  ContextGrep,
  ContextDescriber,
  ContextExpander,
} from '@protolabsai/context-engine';

const logger = createLogger('ContextEngineRoutes');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Open a better-sqlite3 database at `dbPath`, run pending migrations, and
 * return the database handle.  Throws if `dbPath` is missing or the file
 * cannot be opened.
 */
function openDb(dbPath: string): BetterSqlite3.Database {
  const db = new BetterSqlite3.default(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function badRequest(res: Response, message: string): void {
  res.status(400).json({ success: false, error: message });
}

function serverError(res: Response, message: string): void {
  res.status(500).json({ success: false, error: message });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/context-engine/grep
 *
 * Body:
 * ```json
 * {
 *   "dbPath": "/path/to/conversations.db",
 *   "query": "search terms",
 *   "conversationId": "optional-uuid",
 *   "limit": 10,
 *   "searchNodes": true,
 *   "searchLargeFiles": true
 * }
 * ```
 */
function handleGrep(req: Request, res: Response): void {
  const { dbPath, query, conversationId, limit, searchNodes, searchLargeFiles } = req.body as {
    dbPath?: string;
    query?: string;
    conversationId?: string;
    limit?: number;
    searchNodes?: boolean;
    searchLargeFiles?: boolean;
  };

  if (!dbPath) return badRequest(res, 'dbPath is required');
  if (!query || typeof query !== 'string' || query.trim() === '') {
    return badRequest(res, 'query must be a non-empty string');
  }

  let db: BetterSqlite3.Database | null = null;
  try {
    db = openDb(dbPath);
    const grepper = new ContextGrep(db);
    const result = grepper.search({
      query: query.trim(),
      conversationId,
      limit: typeof limit === 'number' ? limit : 10,
      searchNodes: searchNodes !== false,
      searchLargeFiles: searchLargeFiles !== false,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`lcm_grep error: ${msg}`);
    serverError(res, msg);
  } finally {
    db?.close();
  }
}

/**
 * POST /api/context-engine/describe
 *
 * Body:
 * ```json
 * {
 *   "dbPath": "/path/to/conversations.db",
 *   "nodeId": "uuid",
 *   "includeParents": false,
 *   "maxParentDepth": 3
 * }
 * ```
 */
function handleDescribe(req: Request, res: Response): void {
  const { dbPath, nodeId, includeParents, maxParentDepth } = req.body as {
    dbPath?: string;
    nodeId?: string;
    includeParents?: boolean;
    maxParentDepth?: number;
  };

  if (!dbPath) return badRequest(res, 'dbPath is required');
  if (!nodeId || typeof nodeId !== 'string') {
    return badRequest(res, 'nodeId must be a non-empty string');
  }

  let db: BetterSqlite3.Database | null = null;
  try {
    db = openDb(dbPath);
    const describer = new ContextDescriber(db);
    const description = describer.describe(nodeId, {
      includeParents: includeParents === true,
      maxParentDepth: typeof maxParentDepth === 'number' ? maxParentDepth : 3,
    });

    if (!description) {
      res.status(404).json({ success: false, error: `Node not found: ${nodeId}` });
      return;
    }

    res.json({ success: true, description });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`lcm_describe error: ${msg}`);
    serverError(res, msg);
  } finally {
    db?.close();
  }
}

/**
 * POST /api/context-engine/expand
 *
 * Body:
 * ```json
 * {
 *   "dbPath": "/path/to/conversations.db",
 *   "nodeId": "uuid",
 *   "question": "optional focused question",
 *   "tokenCap": 50000,
 *   "ttlMs": 10000
 * }
 * ```
 */
function handleExpand(req: Request, res: Response): void {
  const { dbPath, nodeId, question, tokenCap, ttlMs } = req.body as {
    dbPath?: string;
    nodeId?: string;
    question?: string;
    tokenCap?: number;
    ttlMs?: number;
  };

  if (!dbPath) return badRequest(res, 'dbPath is required');
  if (!nodeId || typeof nodeId !== 'string') {
    return badRequest(res, 'nodeId must be a non-empty string');
  }

  let db: BetterSqlite3.Database | null = null;
  try {
    db = openDb(dbPath);
    const expander = new ContextExpander(db);
    const result = expander.expand({
      nodeId,
      question: typeof question === 'string' ? question : undefined,
      tokenCap: typeof tokenCap === 'number' ? tokenCap : undefined,
      ttlMs: typeof ttlMs === 'number' ? ttlMs : undefined,
    });

    if (!result) {
      res.status(404).json({ success: false, error: `Node not found: ${nodeId}` });
      return;
    }

    res.json({ success: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`lcm_expand error: ${msg}`);
    serverError(res, msg);
  } finally {
    db?.close();
  }
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the context-engine router.
 *
 * Mounted at `/api/context-engine` in `server/routes.ts`:
 * ```typescript
 * app.use('/api/context-engine', createContextEngineRoutes());
 * ```
 */
export function createContextEngineRoutes(): Router {
  const router = Router();

  router.post('/grep', handleGrep);
  router.post('/describe', handleDescribe);
  router.post('/expand', handleExpand);

  return router;
}
