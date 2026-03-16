/**
 * CheckpointStore — SQLite-backed persistence for durable workflow executions.
 *
 * Tables:
 *   workflow_executions — top-level workflow instances with state + checkpoint data
 *   workflow_steps      — individual step records for debugging and replay
 *
 * State transitions are atomic and support optimistic locking via a monotonically
 * increasing `version` column.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as BetterSqlite3 from 'better-sqlite3';
import { createLogger } from '@protolabsai/utils';
import { runMigrations, getCurrentSchemaVersion } from '../store/migrations.js';
import type {
  WorkflowExecution,
  WorkflowState,
  WorkflowStep,
  CreateWorkflowInput,
  WorkflowQuery,
} from './types.js';

const logger = createLogger('CheckpointStore');

// ---------------------------------------------------------------------------
// Raw DB row shapes (snake_case from SQLite)
// ---------------------------------------------------------------------------

interface DbWorkflowExecution {
  id: string;
  feature_id: string;
  state: string;
  version: number;
  checkpoint_data: string;
  created_at: string;
  updated_at: string;
  suspended_at: string | null;
}

interface DbWorkflowStep {
  id: string;
  workflow_id: string;
  step_name: string;
  state: string;
  input: string;
  output: string;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

// ---------------------------------------------------------------------------
// CheckpointStore
// ---------------------------------------------------------------------------

export class CheckpointStore {
  private db: BetterSqlite3.Database | null = null;
  private dbPath: string | null = null;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Opens (or creates) the SQLite database at the given path and runs any
   * pending migrations. Safe to call multiple times — subsequent calls are
   * no-ops if the same path is already open.
   */
  open(dbPath: string): void {
    if (this.db && this.dbPath === dbPath) {
      return; // already open at the same path
    }

    if (this.db) {
      this.close();
    }

    // Ensure parent directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    logger.info(`Opening checkpoint store at ${dbPath}`);
    this.db = new BetterSqlite3.default(dbPath);
    this.dbPath = dbPath;

    // Performance pragmas
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');

    // Apply pending schema migrations
    runMigrations(this.db);

    const version = getCurrentSchemaVersion(this.db);
    logger.info(`Schema at version ${version}`);
  }

  /**
   * Closes the database connection. Subsequent operations will throw until
   * `open()` is called again.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.dbPath = null;
      logger.info('Checkpoint store closed');
    }
  }

  private requireDb(): BetterSqlite3.Database {
    if (!this.db) {
      throw new Error('CheckpointStore is not open. Call open(dbPath) first.');
    }
    return this.db;
  }

  // ---------------------------------------------------------------------------
  // Workflow executions
  // ---------------------------------------------------------------------------

  /**
   * Creates a new workflow execution in the 'pending' state.
   */
  createWorkflow(input: CreateWorkflowInput): WorkflowExecution {
    const db = this.requireDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    const checkpointData = JSON.stringify(input.checkpointData ?? null);

    db.prepare(
      `INSERT INTO workflow_executions
         (id, feature_id, state, version, checkpoint_data, created_at, updated_at, suspended_at)
       VALUES (?, ?, 'pending', 0, ?, ?, ?, NULL)`
    ).run(id, input.featureId, checkpointData, now, now);

    logger.info(`Created workflow ${id} for feature ${input.featureId}`);
    return this.getWorkflow(id)!;
  }

  /**
   * Returns a workflow execution by id, or null if not found.
   */
  getWorkflow(id: string): WorkflowExecution | null {
    const db = this.requireDb();
    const row = db.prepare('SELECT * FROM workflow_executions WHERE id = ?').get(id) as
      | DbWorkflowExecution
      | undefined;

    return row ? this.mapExecution(row) : null;
  }

  /**
   * Returns all workflow executions for a given feature ID.
   */
  getWorkflowsByFeature(featureId: string): WorkflowExecution[] {
    const db = this.requireDb();
    const rows = db
      .prepare('SELECT * FROM workflow_executions WHERE feature_id = ? ORDER BY created_at ASC')
      .all(featureId) as DbWorkflowExecution[];

    return rows.map((r) => this.mapExecution(r));
  }

  /**
   * Returns all workflow executions currently in the 'suspended' state.
   */
  getSuspendedWorkflows(): WorkflowExecution[] {
    const db = this.requireDb();
    const rows = db
      .prepare(
        "SELECT * FROM workflow_executions WHERE state = 'suspended' ORDER BY suspended_at ASC"
      )
      .all() as DbWorkflowExecution[];

    return rows.map((r) => this.mapExecution(r));
  }

  /**
   * Atomically transitions a workflow to a new state with optimistic locking.
   *
   * If `expectedVersion` is provided and does not match the current version,
   * throws an error to prevent lost-update races. On success the version is
   * incremented by 1.
   *
   * @throws {Error} if the workflow is not found
   * @throws {Error} if the version check fails (optimistic locking conflict)
   */
  transitionState(
    id: string,
    newState: WorkflowState,
    checkpointData?: unknown,
    expectedVersion?: number
  ): WorkflowExecution {
    const db = this.requireDb();

    const transition = db.transaction((): WorkflowExecution => {
      const existing = db.prepare('SELECT * FROM workflow_executions WHERE id = ?').get(id) as
        | DbWorkflowExecution
        | undefined;

      if (!existing) {
        throw new Error(`Workflow not found: ${id}`);
      }

      if (expectedVersion !== undefined && existing.version !== expectedVersion) {
        throw new Error(
          `Optimistic locking conflict for workflow ${id}: ` +
            `expected version ${expectedVersion}, got ${existing.version}`
        );
      }

      const now = new Date().toISOString();
      const newCheckpointData =
        checkpointData !== undefined ? JSON.stringify(checkpointData) : existing.checkpoint_data;
      const suspendedAt = newState === 'suspended' ? now : existing.suspended_at;
      const newVersion = existing.version + 1;

      db.prepare(
        `UPDATE workflow_executions
         SET state = ?, version = ?, checkpoint_data = ?, updated_at = ?, suspended_at = ?
         WHERE id = ?`
      ).run(newState, newVersion, newCheckpointData, now, suspendedAt ?? null, id);

      logger.info(`Workflow ${id} transitioned ${existing.state} → ${newState} (v${newVersion})`);

      return this.mapExecution(
        db.prepare('SELECT * FROM workflow_executions WHERE id = ?').get(id) as DbWorkflowExecution
      );
    });

    return transition();
  }

  /**
   * Deletes a workflow execution and all its steps (CASCADE).
   */
  deleteWorkflow(id: string): void {
    const db = this.requireDb();
    const result = db.prepare('DELETE FROM workflow_executions WHERE id = ?').run(id);
    if (result.changes > 0) {
      logger.info(`Deleted workflow ${id}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Workflow steps
  // ---------------------------------------------------------------------------

  /**
   * Appends a step record to a workflow execution.
   */
  addStep(workflowId: string, step: Omit<WorkflowStep, 'id'>): WorkflowStep {
    const db = this.requireDb();

    // Verify parent workflow exists
    if (!this.getWorkflow(workflowId)) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    const id = randomUUID();
    const input = JSON.stringify(step.input ?? null);
    const output = JSON.stringify(step.output ?? null);

    db.prepare(
      `INSERT INTO workflow_steps
         (id, workflow_id, step_name, state, input, output, error, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      workflowId,
      step.stepName,
      step.state,
      input,
      output,
      step.error ?? null,
      step.startedAt,
      step.completedAt ?? null
    );

    logger.info(`Added step '${step.stepName}' to workflow ${workflowId}`);

    return db
      .prepare('SELECT * FROM workflow_steps WHERE id = ?')
      .get(id) as unknown as WorkflowStep;
  }

  /**
   * Returns all steps for a workflow in chronological order (oldest first).
   */
  getSteps(workflowId: string): WorkflowStep[] {
    const db = this.requireDb();
    const rows = db
      .prepare('SELECT * FROM workflow_steps WHERE workflow_id = ? ORDER BY started_at ASC')
      .all(workflowId) as DbWorkflowStep[];

    return rows.map((r) => this.mapStep(r));
  }

  // ---------------------------------------------------------------------------
  // Mapping helpers
  // ---------------------------------------------------------------------------

  private mapExecution(row: DbWorkflowExecution): WorkflowExecution {
    return {
      id: row.id,
      featureId: row.feature_id,
      state: row.state as WorkflowState,
      version: row.version,
      checkpointData: this.parseJson(row.checkpoint_data),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      suspendedAt: row.suspended_at,
    };
  }

  private mapStep(row: DbWorkflowStep): WorkflowStep {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      stepName: row.step_name,
      state: row.state as WorkflowState,
      input: this.parseJson(row.input),
      output: this.parseJson(row.output),
      error: row.error,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    };
  }

  private parseJson(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
