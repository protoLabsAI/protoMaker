/**
 * LinearIntakeBridge
 *
 * Listens for `linear:intake:triggered` events (emitted when a Linear issue moves
 * to "In Progress") and creates simple (non-epic) board features.
 *
 * Dedup strategy — two-level guard prevents duplicate features from concurrent webhooks:
 *   1. In-memory Set (synchronous): marks an issue as "creating" before any async I/O.
 *   2. Disk lookup (async): checks for an existing feature via findByLinearIssueId().
 *
 * Level 1 closes the race window between concurrent webhook deliveries for the same
 * issue within the same process lifetime. Level 2 handles restarts and stale state.
 */

import { createLogger } from '@protolabsai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';

const logger = createLogger('LinearIntakeBridge');

/** Priority mapping: Linear priority (0–4) → board complexity */
const PRIORITY_TO_COMPLEXITY: Record<number, 'small' | 'medium' | 'large' | 'architectural'> = {
  0: 'medium', // No priority → default
  1: 'architectural', // Urgent
  2: 'large', // High
  3: 'medium', // Normal
  4: 'small', // Low
};

export interface LinearIntakeContext {
  /** Linear issue UUID */
  issueId: string;
  /** Human-readable identifier, e.g. "PRO-261" */
  identifier?: string;
  title: string;
  description?: string;
  /** Linear priority: 0=No priority, 1=Urgent, 2=High, 3=Normal, 4=Low */
  priority?: number;
  projectPath: string;
}

export class LinearIntakeBridge {
  /** In-memory dedup set — tracks Linear issue IDs currently being processed */
  private creatingIssues: Set<string> = new Set();

  constructor(
    private events: EventEmitter,
    private featureLoader: FeatureLoader
  ) {
    this.registerListener();
    logger.info('LinearIntakeBridge initialized');
  }

  private registerListener(): void {
    this.events.subscribe((type, payload) => {
      if (type === 'linear:intake:triggered') {
        void this.handleIntakeTriggered(payload as LinearIntakeContext);
      }
    });
  }

  async handleIntakeTriggered(context: LinearIntakeContext): Promise<void> {
    const { issueId, identifier, title, description, priority, projectPath } = context;
    const label = identifier ?? issueId;

    // LEVEL 1: In-memory dedup (synchronous — closes the concurrent webhook race window)
    if (this.creatingIssues.has(issueId)) {
      logger.debug(`Feature creation already in progress for Linear issue ${label}`, {
        issueId,
        identifier,
      });
      return;
    }

    // LEVEL 2: Disk dedup (async — handles process restarts and persisted state)
    const existing = await this.featureLoader.findByLinearIssueId(projectPath, issueId);
    if (existing) {
      logger.info(`Feature already exists for Linear issue ${label}`, {
        featureId: existing.id,
        issueId,
        identifier,
      });
      return;
    }

    // Mark as creating BEFORE starting async create to prevent concurrent duplicates
    this.creatingIssues.add(issueId);
    logger.debug(`Creating feature for Linear issue ${label}`, { issueId, identifier });

    try {
      const complexity = PRIORITY_TO_COMPLEXITY[priority ?? 0] ?? 'medium';

      const feature = await this.featureLoader.create(projectPath, {
        title,
        description: description ?? '',
        status: 'backlog',
        complexity,
        linearIssueId: issueId,
        linearIdentifier: identifier,
        sourceChannel: 'linear',
      });

      logger.info(`Created feature ${feature.id} for Linear issue ${label}`, {
        featureId: feature.id,
        issueId,
        identifier,
        complexity,
      });

      this.events.emit('feature:created', { featureId: feature.id, projectPath });
    } catch (error) {
      logger.error(`Failed to create feature for Linear issue ${label}`, {
        error,
        issueId,
        identifier,
      });
      throw error;
    } finally {
      // Always remove from Set — even on error — so future retries are not blocked
      this.creatingIssues.delete(issueId);
      logger.debug(`Finished processing Linear issue ${label}`, { issueId, identifier });
    }
  }
}
