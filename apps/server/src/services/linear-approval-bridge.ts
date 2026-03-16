/**
 * LinearApprovalBridge
 *
 * Listens for `linear:approval:detected` events (emitted when a Linear issue moves
 * to "Approved" or "Ready for Planning") and creates epic board features.
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

const logger = createLogger('LinearApprovalBridge');

export interface LinearApprovalContext {
  /** Linear issue UUID */
  issueId: string;
  /** Human-readable identifier, e.g. "PRO-262" */
  identifier?: string;
  title: string;
  description?: string;
  /** Linear priority: 0=No priority, 1=Urgent, 2=High, 3=Normal, 4=Low */
  priority?: number;
  projectPath: string;
}

/** Priority mapping: Linear priority (0–4) → board complexity for approved epics */
const PRIORITY_TO_COMPLEXITY: Record<number, 'small' | 'medium' | 'large' | 'architectural'> = {
  0: 'large', // No priority → default large for epics
  1: 'architectural', // Urgent
  2: 'large', // High
  3: 'large', // Normal
  4: 'medium', // Low
};

export class LinearApprovalBridge {
  /** In-memory dedup set — tracks Linear issue IDs currently being processed */
  private creatingIssues: Set<string> = new Set();

  constructor(
    private events: EventEmitter,
    private featureLoader: FeatureLoader
  ) {
    this.registerListener();
    logger.info('LinearApprovalBridge initialized');
  }

  private registerListener(): void {
    this.events.subscribe((type, payload) => {
      if (type === 'linear:approval:detected') {
        void this.handleApprovalDetected(payload as LinearApprovalContext);
      }
    });
  }

  async handleApprovalDetected(context: LinearApprovalContext): Promise<void> {
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
    logger.debug(`Creating epic feature for Linear issue ${label}`, { issueId, identifier });

    try {
      const complexity = PRIORITY_TO_COMPLEXITY[priority ?? 0] ?? 'large';

      const feature = await this.featureLoader.create(projectPath, {
        title,
        description: description ?? '',
        status: 'backlog',
        complexity,
        isEpic: true,
        linearIssueId: issueId,
        linearIdentifier: identifier,
        sourceChannel: 'linear',
      });

      logger.info(`Created epic feature ${feature.id} for Linear issue ${label}`, {
        featureId: feature.id,
        issueId,
        identifier,
        complexity,
      });

      this.events.emit('feature:created', { featureId: feature.id, projectPath });
    } catch (error) {
      logger.error(`Failed to create epic feature for Linear issue ${label}`, {
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
