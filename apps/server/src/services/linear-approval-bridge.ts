/**
 * Linear Approval Bridge
 *
 * Listens for linear:approval:detected events and routes approved Linear issues
 * into the CoS → ProjM pipeline by creating an epic feature and emitting
 * authority:pm-review-approved for ProjM to decompose.
 */

import { createLogger, slugify } from '@protolabs-ai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { ApprovalContext } from './linear-approval-handler.js';
import { classifyFeature } from './feature-classifier.js';

const logger = createLogger('linear:approval-bridge');

/** Map Linear priority (0-4) to feature complexity */
function mapPriorityToComplexity(
  priority?: number
): 'small' | 'medium' | 'large' | 'architectural' {
  if (priority === undefined) return 'medium';
  switch (priority) {
    case 1:
      return 'large'; // urgent → large
    case 2:
      return 'large'; // high → large
    case 3:
      return 'medium'; // normal → medium
    case 4:
      return 'small'; // low → small
    default:
      return 'medium'; // none → medium
  }
}

export class LinearApprovalBridge {
  private running = false;
  private unsubscribe?: () => void;

  constructor(
    private events: EventEmitter,
    private featureLoader: FeatureLoader
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;

    this.unsubscribe = this.events.subscribe((type, payload) => {
      if (type === 'linear:approval:detected') {
        this.handleApproval(payload as ApprovalContext).catch((err) => {
          logger.error('Failed to process approval', {
            issueId: (payload as ApprovalContext).issueId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      } else if (type === 'linear:changes-requested:detected') {
        this.handleChangesRequested(payload as ApprovalContext).catch((err) => {
          logger.error('Failed to process changes-requested', {
            issueId: (payload as ApprovalContext).issueId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    });

    logger.info('LinearApprovalBridge started');
  }

  stop(): void {
    this.running = false;
    this.unsubscribe?.();
    logger.info('LinearApprovalBridge stopped');
  }

  /**
   * Classify a feature and assign the suggested agent role.
   * High confidence (>=0.8) → direct assignment.
   * Medium confidence (0.6-0.8) → suggestion only (Ava reviews).
   * Low confidence (<0.6) → no assignment.
   */
  private async classifyAndAssign(
    featureId: string,
    title: string,
    description: string,
    projectPath: string
  ): Promise<void> {
    const classification = await classifyFeature(title, description, projectPath);

    const HIGH_CONFIDENCE = 0.8;

    const suggestion = {
      role: classification.role,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
      autoAssigned: classification.confidence >= HIGH_CONFIDENCE,
      suggestedAt: new Date().toISOString(),
    };

    if (classification.confidence >= HIGH_CONFIDENCE) {
      // High confidence: assign directly + save suggestion
      await this.featureLoader.update(projectPath, featureId, {
        assignedRole: classification.role,
        routingSuggestion: suggestion,
      });

      logger.info(
        `Auto-assigned role "${classification.role}" to feature ${featureId} (confidence: ${classification.confidence})`
      );
    } else if (classification.confidence >= 0.6) {
      // Medium confidence: suggest but mark as needing review
      await this.featureLoader.update(projectPath, featureId, {
        assignedRole: classification.role,
        routingSuggestion: suggestion,
      });

      logger.info(
        `Suggested role "${classification.role}" for feature ${featureId} (confidence: ${classification.confidence}, needs review)`
      );
    } else {
      logger.debug(
        `Low confidence (${classification.confidence}) for feature ${featureId}, no assignment`
      );
      return;
    }

    // Emit event for UI visibility
    this.events.emit('feature:agent-suggested', {
      featureId,
      ...suggestion,
    });
  }

  private async handleApproval(context: ApprovalContext): Promise<void> {
    if (!this.running) return;

    const { issueId, title, description, priority, identifier } = context;

    logger.info(`Processing approved issue ${issueId}`, {
      identifier,
      title,
      approvalState: context.approvalState,
    });

    // Use process.cwd() as project path (same as webhook handler)
    const projectPath = process.cwd();

    const complexity = mapPriorityToComplexity(priority);

    // Build description with Linear context
    const epicDescription = [
      description || title,
      '',
      `**Source:** Linear issue ${identifier || issueId}`,
      `**Approval State:** ${context.approvalState}`,
      context.team ? `**Team:** ${context.team.name}` : '',
      `**Detected:** ${context.detectedAt}`,
    ]
      .filter(Boolean)
      .join('\n');

    // Check if feature already exists for this Linear issue
    const existing = await this.featureLoader.findByLinearIssueId(projectPath, issueId);
    if (existing) {
      logger.info(`Feature already exists for Linear issue ${issueId}: ${existing.id}, skipping`);
      return;
    }

    // Create epic feature with approved state (same as CoS submit-prd)
    const feature = await this.featureLoader.create(projectPath, {
      title,
      description: epicDescription,
      status: 'backlog',
      workItemState: 'approved',
      isEpic: true,
      epicColor: '#6366f1',
      category: 'Linear Approvals',
      complexity,
      linearIssueId: issueId,
      ...(context.project?.name ? { projectSlug: slugify(context.project.name, 40) } : {}),
    });

    logger.info(`Created epic feature ${feature.id} from approved issue ${issueId}`);

    // Classify the feature to suggest an agent role (non-blocking)
    this.classifyAndAssign(feature.id, title, epicDescription, projectPath).catch((err) => {
      logger.warn(`Agent classification failed for feature ${feature.id}:`, err);
    });

    // Emit for ProjM to pick up and decompose
    this.events.emit('authority:pm-review-approved', {
      projectPath,
      featureId: feature.id,
      complexity,
      milestones: [],
    });

    // Track the approval-to-feature mapping
    this.events.emit('linear:approval:bridged', {
      issueId,
      identifier,
      featureId: feature.id,
      title,
      complexity,
      bridgedAt: new Date().toISOString(),
    });

    logger.info(`Emitted authority:pm-review-approved for feature ${feature.id}`);
  }

  private async handleChangesRequested(context: ApprovalContext): Promise<void> {
    if (!this.running) return;

    const { issueId, identifier } = context;

    logger.info(`Processing changes-requested for issue ${issueId}`, {
      identifier,
      approvalState: context.approvalState,
    });

    const projectPath = process.cwd();

    const feature = await this.featureLoader.findByLinearIssueId(projectPath, issueId);
    if (!feature) {
      logger.warn(`No board feature found for Linear issue ${issueId}, skipping block`);
      return;
    }

    await this.featureLoader.update(projectPath, feature.id, {
      status: 'blocked',
      statusChangeReason: 'Linear: Changes Requested',
    });

    logger.info(`Blocked feature ${feature.id} for Linear issue ${issueId}`);

    this.events.emit('feature:blocked', {
      featureId: feature.id,
      projectPath,
      reason: 'Linear: Changes Requested',
      issueId,
      identifier,
      blockedAt: new Date().toISOString(),
    });
  }
}
