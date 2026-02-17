/**
 * Linear Intake Bridge
 *
 * Listens for linear:intake:triggered events and creates simple features
 * on the Automaker board. Unlike the approval bridge, this creates non-epic
 * features that go straight to backlog for auto-mode pickup.
 *
 * Guard: skips issues assigned to a user (human-owned work) and
 * issues that already have a feature on the board.
 */

import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { ApprovalContext } from './linear-approval-handler.js';
import { classifyFeature } from './feature-classifier.js';

const logger = createLogger('linear:intake');

/** Map Linear priority (0-4) to feature complexity */
function mapPriorityToComplexity(
  priority?: number
): 'small' | 'medium' | 'large' | 'architectural' {
  if (priority === undefined) return 'medium';
  switch (priority) {
    case 1:
      return 'large'; // urgent
    case 2:
      return 'large'; // high
    case 3:
      return 'medium'; // normal
    case 4:
      return 'small'; // low
    default:
      return 'medium'; // none
  }
}

export class LinearIntakeBridge {
  private running = false;
  private unsubscribe?: () => void;

  constructor(
    private events: EventEmitter,
    private featureLoader: FeatureLoader,
    private projectPath: string
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;

    this.unsubscribe = this.events.subscribe((type, payload) => {
      if (type === 'linear:intake:triggered') {
        this.handleIntake(payload as ApprovalContext).catch((err) => {
          logger.error('Failed to process intake', {
            issueId: (payload as ApprovalContext).issueId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    });

    logger.info('LinearIntakeBridge started');
  }

  stop(): void {
    this.running = false;
    this.unsubscribe?.();
    logger.info('LinearIntakeBridge stopped');
  }

  private async handleIntake(context: ApprovalContext): Promise<void> {
    if (!this.running) return;

    const { issueId, title, description, priority, identifier, assignee } = context;
    const projectPath = this.projectPath;

    // Guard: skip issues assigned to a user (human-owned work)
    if (assignee) {
      logger.info(
        `Skipping intake for issue ${identifier || issueId}: assigned to ${assignee.name}`
      );
      return;
    }

    // Guard: skip if feature already exists for this Linear issue
    const existing = await this.featureLoader.findByLinearIssueId(projectPath, issueId);
    if (existing) {
      logger.info(
        `Skipping intake for issue ${identifier || issueId}: feature ${existing.id} already exists`
      );
      return;
    }

    const complexity = mapPriorityToComplexity(priority);

    const featureDescription = [
      description || title,
      '',
      `**Source:** Linear issue ${identifier || issueId}`,
      context.team ? `**Team:** ${context.team.name}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // Create simple feature (not an epic)
    const feature = await this.featureLoader.create(projectPath, {
      title,
      description: featureDescription,
      status: 'backlog',
      complexity,
      linearIssueId: issueId,
    });

    logger.info(`Created feature ${feature.id} from Linear issue ${identifier || issueId}`, {
      complexity,
      title,
    });

    // Classify to suggest agent role (non-blocking)
    classifyFeature(title, featureDescription, projectPath)
      .then(async (classification) => {
        if (classification.confidence >= 0.6) {
          await this.featureLoader.update(projectPath, feature.id, {
            assignedRole: classification.role,
            routingSuggestion: {
              role: classification.role,
              confidence: classification.confidence,
              reasoning: classification.reasoning,
              autoAssigned: classification.confidence >= 0.8,
              suggestedAt: new Date().toISOString(),
            },
          });
          logger.info(
            `Classified feature ${feature.id} as "${classification.role}" (confidence: ${classification.confidence})`
          );
        }
      })
      .catch((err) => {
        logger.warn(`Classification failed for feature ${feature.id}:`, err);
      });

    // Emit tracking event
    this.events.emit('linear:intake:bridged', {
      issueId,
      identifier,
      featureId: feature.id,
      title,
      complexity,
      bridgedAt: new Date().toISOString(),
    });
  }
}
