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
const DEFAULT_CHANGES_REQUESTED_STATES = ['Changes Requested'];
const DEFAULT_INTAKE_TRIGGER_STATES = ['In Progress'];

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
  /** Assignee info (if assigned to a user) */
  assignee?: { id: string; name: string };
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
   * Get configured "Changes Requested" states from project settings
   */
  private async getChangesRequestedStates(projectPath: string): Promise<string[]> {
    if (!this.settingsService) {
      return DEFAULT_CHANGES_REQUESTED_STATES;
    }

    try {
      const settings = await this.settingsService.getProjectSettings(projectPath);
      return (
        settings?.integrations?.linear?.changesRequestedStates || DEFAULT_CHANGES_REQUESTED_STATES
      );
    } catch {
      return DEFAULT_CHANGES_REQUESTED_STATES;
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
   * Check if a Linear workflow state name indicates changes requested
   */
  async isChangesRequestedState(stateName: string, projectPath: string): Promise<boolean> {
    const changesRequestedStates = await this.getChangesRequestedStates(projectPath);
    return changesRequestedStates.some((s) => s.toLowerCase() === stateName.toLowerCase());
  }

  /**
   * Get configured intake trigger states from project settings
   */
  private async getIntakeTriggerStates(projectPath: string): Promise<string[]> {
    if (!this.settingsService) {
      return DEFAULT_INTAKE_TRIGGER_STATES;
    }

    try {
      const settings = await this.settingsService.getProjectSettings(projectPath);
      return settings?.integrations?.linear?.intakeTriggerStates || DEFAULT_INTAKE_TRIGGER_STATES;
    } catch {
      return DEFAULT_INTAKE_TRIGGER_STATES;
    }
  }

  /**
   * Check if a Linear workflow state name triggers intake transfer
   */
  async isIntakeTriggerState(stateName: string, projectPath: string): Promise<boolean> {
    const intakeStates = await this.getIntakeTriggerStates(projectPath);
    return intakeStates.some((s) => s.toLowerCase() === stateName.toLowerCase());
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
      assignee?: { id: string; name: string };
    }
  ): Promise<void> {
    if (!this.running) return;

    // Check for approval state
    const isApproval = await this.isApprovalState(stateName, projectPath);
    if (isApproval) {
      const approvalContext: ApprovalContext = {
        issueId,
        identifier: issueContext?.identifier,
        title: issueContext?.title || 'Unknown',
        description: issueContext?.description,
        approvalState: stateName,
        priority: issueContext?.priority,
        team: issueContext?.team,
        labels: issueContext?.labels,
        assignee: issueContext?.assignee,
        detectedAt: new Date().toISOString(),
      };

      logger.info(`Approval detected for issue ${issueId}: state "${stateName}"`, {
        identifier: approvalContext.identifier,
        title: approvalContext.title,
      });

      if (this.emitter) {
        this.emitter.emit('linear:approval:detected', approvalContext);
      }
      return;
    }

    // Check for changes requested state
    const isChangesRequested = await this.isChangesRequestedState(stateName, projectPath);
    if (isChangesRequested) {
      const changesRequestedContext: ApprovalContext = {
        issueId,
        identifier: issueContext?.identifier,
        title: issueContext?.title || 'Unknown',
        description: issueContext?.description,
        approvalState: stateName,
        priority: issueContext?.priority,
        team: issueContext?.team,
        labels: issueContext?.labels,
        assignee: issueContext?.assignee,
        detectedAt: new Date().toISOString(),
      };

      logger.info(`Changes requested detected for issue ${issueId}: state "${stateName}"`, {
        identifier: changesRequestedContext.identifier,
        title: changesRequestedContext.title,
      });

      if (this.emitter) {
        this.emitter.emit('linear:changes-requested:detected', changesRequestedContext);
      }
      return;
    }

    // Check for intake trigger state (transfer to Automaker board)
    const isIntake = await this.isIntakeTriggerState(stateName, projectPath);
    if (isIntake) {
      const intakeContext: ApprovalContext = {
        issueId,
        identifier: issueContext?.identifier,
        title: issueContext?.title || 'Unknown',
        description: issueContext?.description,
        approvalState: stateName,
        priority: issueContext?.priority,
        team: issueContext?.team,
        labels: issueContext?.labels,
        assignee: issueContext?.assignee,
        detectedAt: new Date().toISOString(),
      };

      logger.info(`Intake trigger detected for issue ${issueId}: state "${stateName}"`, {
        identifier: intakeContext.identifier,
        title: intakeContext.title,
        assignee: intakeContext.assignee?.name,
      });

      if (this.emitter) {
        this.emitter.emit('linear:intake:triggered', intakeContext);
      }
      return;
    }
  }
}

// Singleton instance
export const linearApprovalHandler = new LinearApprovalHandler();
