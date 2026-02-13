/**
 * LinearApprovalHandler
 *
 * Detects when a Linear issue transitions to an "approved" workflow state
 * and emits a linear:approval:detected event with full issue context.
 *
 * Approval states are configurable via settings.integrations.linear.approvalStates
 * (default: ['Approved', 'Ready for Planning']).
 */

import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('linear:approval');

const DEFAULT_APPROVAL_STATES = ['Approved', 'Ready for Planning'];

export interface ApprovalContext {
  /** Linear issue ID */
  issueId: string;
  /** Linear issue identifier (e.g., ENG-123) */
  identifier?: string;
  /** Issue title */
  title: string;
  /** Issue description */
  description?: string;
  /** The workflow state that triggered approval */
  approvalState: string;
  /** Priority (0-4) */
  priority?: number;
  /** Team info */
  team?: { id: string; name: string };
  /** Labels */
  labels?: string[];
  /** Timestamp of approval detection */
  detectedAt: string;
}

export class LinearApprovalHandler {
  private settingsService: SettingsService | null = null;
  private emitter: EventEmitter | null = null;
  private running = false;

  initialize(settingsService: SettingsService, emitter: EventEmitter): void {
    this.settingsService = settingsService;
    this.emitter = emitter;
    this.running = true;
    logger.info('LinearApprovalHandler initialized');
  }

  stop(): void {
    this.running = false;
    logger.info('LinearApprovalHandler stopped');
  }

  /**
   * Get configured approval states from project settings
   */
  private async getApprovalStates(projectPath: string): Promise<string[]> {
    if (!this.settingsService) {
      return DEFAULT_APPROVAL_STATES;
    }

    try {
      const settings = await this.settingsService.getProjectSettings(projectPath);
      return settings?.integrations?.linear?.approvalStates || DEFAULT_APPROVAL_STATES;
    } catch {
      return DEFAULT_APPROVAL_STATES;
    }
  }

  /**
   * Check if a Linear workflow state name indicates approval
   */
  async isApprovalState(stateName: string, projectPath: string): Promise<boolean> {
    const approvalStates = await this.getApprovalStates(projectPath);
    return approvalStates.some((s) => s.toLowerCase() === stateName.toLowerCase());
  }

  /**
   * Handle a Linear issue state change and detect approval transitions.
   * Called from the webhook handler or sync service when a Linear issue updates.
   *
   * @param issueId - Linear issue ID
   * @param stateName - New workflow state name
   * @param projectPath - Project path for settings lookup
   * @param issueContext - Additional issue context from the webhook payload
   */
  async onIssueStateChange(
    issueId: string,
    stateName: string,
    projectPath: string,
    issueContext?: {
      identifier?: string;
      title?: string;
      description?: string;
      priority?: number;
      team?: { id: string; name: string };
      labels?: string[];
    }
  ): Promise<void> {
    if (!this.running) return;

    const isApproval = await this.isApprovalState(stateName, projectPath);
    if (!isApproval) return;

    const approvalContext: ApprovalContext = {
      issueId,
      identifier: issueContext?.identifier,
      title: issueContext?.title || 'Unknown',
      description: issueContext?.description,
      approvalState: stateName,
      priority: issueContext?.priority,
      team: issueContext?.team,
      labels: issueContext?.labels,
      detectedAt: new Date().toISOString(),
    };

    logger.info(`Approval detected for issue ${issueId}: state "${stateName}"`, {
      identifier: approvalContext.identifier,
      title: approvalContext.title,
    });

    if (this.emitter) {
      this.emitter.emit('linear:approval:detected', approvalContext);
    }
  }
}

// Singleton instance
export const linearApprovalHandler = new LinearApprovalHandler();
