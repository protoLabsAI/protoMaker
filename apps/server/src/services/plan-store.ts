/**
 * PlanStore — SQLite-backed persistence for PlanState objects.
 *
 * Replaces the in-memory Map<string, PlanState> so that HITL approvals
 * arriving minutes or hours later can still resume the correct plan,
 * even after a server restart.
 *
 * DB file: $DATA_DIR/plans.db  (fallback: ./data/plans.db)
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as BetterSqlite3 from 'better-sqlite3';
import { createLogger } from '@protolabsai/utils';
import type { PlanState } from './planning-service.js';

const logger = createLogger('PlanStore');

/** Plans expire after 7 days by default */
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class PlanStore {
  private db: BetterSqlite3.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? PlanStore.defaultDbPath();

    // Ensure parent directory exists
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    logger.info(`Opening plan store at ${resolvedPath}`);
    this.db = new BetterSqlite3.default(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.migrate();
    this.cleanup();
  }

  // ─── Schema ────────────────────────────────────────────────────────────────

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plans (
        correlation_id TEXT PRIMARY KEY,
        prd            TEXT NOT NULL,
        review         TEXT NOT NULL,
        idea           TEXT NOT NULL,
        reply_topic    TEXT,
        source         TEXT,
        project_path   TEXT NOT NULL,
        status         TEXT NOT NULL DEFAULT 'pending',
        created_at     INTEGER NOT NULL,
        expires_at     INTEGER NOT NULL
      );
    `);
    logger.info('Plan store schema ready');
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Upsert a PlanState (inserts or replaces on correlationId conflict). */
  save(correlationId: string, state: PlanState): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO plans
        (correlation_id, prd, review, idea, reply_topic, source, project_path, status, created_at, expires_at)
      VALUES
        (@correlationId, @prd, @review, @idea, @replyTopic, @source, @projectPath, @status, @createdAt, @expiresAt)
    `);

    const createdMs = new Date(state.createdAt).getTime();

    stmt.run({
      correlationId,
      prd: JSON.stringify(state.prd),
      review: JSON.stringify(state.review),
      idea: state.idea,
      replyTopic: state.replyTopic ?? null,
      source: state.source ? JSON.stringify(state.source) : null,
      projectPath: state.projectPath,
      status: 'pending',
      createdAt: createdMs,
      expiresAt: createdMs + DEFAULT_TTL_MS,
    });

    logger.info(`Saved plan ${correlationId} (expires in 7d)`);
  }

  /** Retrieve a PlanState by correlationId, or null if missing / expired. */
  get(correlationId: string): PlanState | null {
    const row = this.db
      .prepare(`SELECT * FROM plans WHERE correlation_id = @correlationId AND expires_at > @now`)
      .get({ correlationId, now: Date.now() }) as StoredRow | undefined;

    if (!row) return null;

    return rowToPlanState(row);
  }

  /** Check whether a pending plan exists for a given correlationId. */
  has(correlationId: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 FROM plans WHERE correlation_id = @correlationId AND expires_at > @now`)
      .get({ correlationId, now: Date.now() });

    return row !== undefined;
  }

  /** Delete a plan (after it has been approved / rejected). */
  delete(correlationId: string): void {
    this.db.prepare(`DELETE FROM plans WHERE correlation_id = @correlationId`).run({
      correlationId,
    });
    logger.info(`Deleted plan ${correlationId}`);
  }

  /** Remove all expired plans. Called on startup and can be called periodically. */
  cleanup(): void {
    const result = this.db.prepare(`DELETE FROM plans WHERE expires_at <= @now`).run({
      now: Date.now(),
    });
    if (result.changes > 0) {
      logger.info(`Cleaned up ${result.changes} expired plan(s)`);
    }
  }

  /** Close the database connection. */
  close(): void {
    this.db.close();
    logger.info('Plan store closed');
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  static defaultDbPath(): string {
    const dataDir = process.env['DATA_DIR'] || './data';
    return path.join(dataDir, 'plans.db');
  }
}

// ─── Internal types & helpers ──────────────────────────────────────────────

interface StoredRow {
  correlation_id: string;
  prd: string;
  review: string;
  idea: string;
  reply_topic: string | null;
  source: string | null;
  project_path: string;
  status: string;
  created_at: number;
  expires_at: number;
}

function rowToPlanState(row: StoredRow): PlanState {
  return {
    correlationId: row.correlation_id,
    idea: row.idea,
    prd: JSON.parse(row.prd),
    review: JSON.parse(row.review),
    projectPath: row.project_path,
    replyTopic: row.reply_topic ?? undefined,
    source: row.source ? JSON.parse(row.source) : undefined,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
