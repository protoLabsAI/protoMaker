/**
 * DeploymentTrackerService
 *
 * Tracks real CI/CD deployment events from GitHub Actions workflows.
 * Persists to DATA_DIR/metrics/deployments.json (global, not per-project).
 *
 * CI workflows call POST /api/deploy/start before drain and
 * POST /api/deploy/complete after smoke tests to record the full
 * deployment lifecycle.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createLogger } from '@protolabsai/utils';
import type {
  DeployEnvironment,
  DeploymentStatus,
  DeploymentEvent,
  DeploymentDocument,
  DeploymentStats,
} from '@protolabsai/types';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('DeploymentTracker');

const MAX_DEPLOYMENTS = 500;

function generateId(): string {
  return randomBytes(8).toString('hex');
}

interface RecordStartOpts {
  environment: DeployEnvironment;
  commitSha: string;
  commitShort: string;
  runId?: string;
  runUrl?: string;
}

interface RecordCompletionOpts {
  deploymentId: string;
  status: 'succeeded' | 'failed' | 'rolled_back';
  version?: string;
  error?: string;
  rolledBack?: boolean;
}

interface QueryOpts {
  environment?: DeployEnvironment;
  since?: string;
  limit?: number;
}

export class DeploymentTrackerService {
  private readonly filePath: string;
  private readonly events: EventEmitter;

  constructor(dataDir: string, events: EventEmitter) {
    this.filePath = join(dataDir, 'metrics', 'deployments.json');
    this.events = events;
    this.cleanupOrphans();
  }

  /**
   * Record a deployment start. Called by CI before drain.
   * Returns the deployment ID for correlation.
   */
  recordStart(opts: RecordStartOpts): DeploymentEvent {
    const id = generateId();
    const now = new Date().toISOString();

    const deployment: DeploymentEvent = {
      id,
      environment: opts.environment,
      status: 'started',
      commitSha: opts.commitSha,
      commitShort: opts.commitShort,
      runId: opts.runId,
      runUrl: opts.runUrl,
      startedAt: now,
      agentsDrained: false,
    };

    const doc = this.load();
    doc.deployments.unshift(deployment);
    this.trimAndSave(doc);

    this.events.emit('deploy:started', {
      deploymentId: id,
      environment: opts.environment,
      commitSha: opts.commitSha,
      commitShort: opts.commitShort,
      runId: opts.runId,
      runUrl: opts.runUrl,
      timestamp: now,
    });

    logger.info(`Deployment ${id} started: ${opts.environment} ${opts.commitShort}`);

    return deployment;
  }

  /**
   * Record deployment completion (success, failure, or rollback).
   * Called by CI after smoke tests or in rollback step.
   */
  recordCompletion(opts: RecordCompletionOpts): DeploymentEvent | null {
    const doc = this.load();
    const deployment = doc.deployments.find((d) => d.id === opts.deploymentId);

    if (!deployment) {
      logger.warn(`Deployment ${opts.deploymentId} not found`);
      return null;
    }

    const now = new Date().toISOString();
    deployment.status = opts.status as DeploymentStatus;
    deployment.completedAt = now;
    deployment.durationMs = new Date(now).getTime() - new Date(deployment.startedAt).getTime();
    if (opts.version) deployment.version = opts.version;
    if (opts.error) deployment.error = opts.error;
    if (opts.rolledBack) deployment.rolledBack = true;

    this.trimAndSave(doc);

    const eventType = opts.status === 'succeeded' ? 'deploy:succeeded' : 'deploy:failed';

    if (opts.status === 'succeeded') {
      this.events.emit(eventType, {
        deploymentId: opts.deploymentId,
        environment: deployment.environment,
        commitSha: deployment.commitSha,
        version: opts.version,
        durationMs: deployment.durationMs,
        timestamp: now,
      });
    } else {
      this.events.emit(eventType, {
        deploymentId: opts.deploymentId,
        environment: deployment.environment,
        commitSha: deployment.commitSha,
        error: opts.error,
        rolledBack: opts.rolledBack ?? false,
        durationMs: deployment.durationMs,
        timestamp: now,
      });
    }

    logger.info(
      `Deployment ${opts.deploymentId} ${opts.status}: ${deployment.environment} (${deployment.durationMs}ms)`
    );

    return deployment;
  }

  /** Query deployments with optional filters */
  getDeployments(opts?: QueryOpts): DeploymentEvent[] {
    const doc = this.load();
    let results = doc.deployments;

    if (opts?.environment) {
      results = results.filter((d) => d.environment === opts.environment);
    }
    if (opts?.since) {
      const sinceMs = new Date(opts.since).getTime();
      results = results.filter((d) => new Date(d.startedAt).getTime() >= sinceMs);
    }
    if (opts?.limit) {
      results = results.slice(0, opts.limit);
    }

    return results;
  }

  /** Get the most recent deployment, optionally filtered by environment */
  getLatest(environment?: DeployEnvironment): DeploymentEvent | null {
    const doc = this.load();
    if (environment) {
      return doc.deployments.find((d) => d.environment === environment) ?? null;
    }
    return doc.deployments[0] ?? null;
  }

  /** Compute aggregate stats over a rolling window */
  getStats(windowDays: number = 30): DeploymentStats {
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
    const deployments = this.getDeployments({ since: cutoff });

    const completed = deployments.filter((d) => d.completedAt);
    const succeeded = completed.filter((d) => d.status === 'succeeded');
    const failed = completed.filter((d) => d.status === 'failed');
    const rolledBack = completed.filter((d) => d.status === 'rolled_back');

    const durations = completed
      .filter((d) => d.durationMs != null && d.durationMs > 0)
      .map((d) => d.durationMs!);

    const avgDurationMs =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

    return {
      total: deployments.length,
      succeeded: succeeded.length,
      successRate:
        completed.length > 0 ? Number((succeeded.length / completed.length).toFixed(3)) : 0,
      avgDurationMs,
      frequencyPerDay: windowDays > 0 ? Number((deployments.length / windowDays).toFixed(3)) : 0,
      failed: failed.length,
      rolledBack: rolledBack.length,
    };
  }

  // ── Internal ────────────────────────────────────────────

  /** On startup, mark any orphaned "started" deployments as failed */
  private cleanupOrphans(): void {
    const doc = this.load();
    let cleaned = 0;

    for (const d of doc.deployments) {
      if (d.status === 'started' && !d.completedAt) {
        d.status = 'failed';
        d.completedAt = new Date().toISOString();
        d.durationMs = new Date(d.completedAt).getTime() - new Date(d.startedAt).getTime();
        d.error = 'Deployment orphaned (server restarted before completion)';
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.trimAndSave(doc);
      logger.warn(`Cleaned up ${cleaned} orphaned deployment(s)`);
    }
  }

  private load(): DeploymentDocument {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf-8');
        return JSON.parse(raw) as DeploymentDocument;
      }
    } catch (err) {
      logger.warn('Failed to load deployments file, starting fresh:', err);
    }
    return { version: 1, updatedAt: new Date().toISOString(), deployments: [] };
  }

  private trimAndSave(doc: DeploymentDocument): void {
    // Enforce retention limit
    if (doc.deployments.length > MAX_DEPLOYMENTS) {
      doc.deployments = doc.deployments.slice(0, MAX_DEPLOYMENTS);
    }
    doc.updatedAt = new Date().toISOString();

    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Atomic write via temp file
    const tmp = this.filePath + '.tmp';
    writeFileSync(tmp, JSON.stringify(doc, null, 2), 'utf-8');
    renameSync(tmp, this.filePath);
  }
}
