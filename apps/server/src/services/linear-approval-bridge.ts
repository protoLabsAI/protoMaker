/**
 * Linear Approval Bridge
 *
 * Listens for linear:approval:detected events and routes approved Linear issues
 * into the CoS → ProjM pipeline by creating an epic feature and emitting
 * authority:pm-review-approved for ProjM to decompose.
 */

import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { ApprovalContext } from './linear-approval-handler.js';

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
      }
    });

    logger.info('LinearApprovalBridge started');
  }

  stop(): void {
    this.running = false;
    this.unsubscribe?.();
    logger.info('LinearApprovalBridge stopped');
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
    });

    logger.info(`Created epic feature ${feature.id} from approved issue ${issueId}`);

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
}
