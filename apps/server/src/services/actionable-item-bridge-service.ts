/**
 * ActionableItem Bridge Service
 *
 * Listens for events from existing systems (HITL forms, notifications,
 * escalations, pipeline gates) and creates ActionableItems automatically.
 * This connects the unified inbox to all user-attention signals.
 *
 * Also auto-dismisses actionable items when their associated feature
 * transitions out of blocked state (feature unblocked).
 */

import { createLogger } from '@protolabsai/utils';
import type { EventType } from '@protolabsai/types';
import type { ActionableItemService } from './actionable-item-service.js';
import type { EventEmitter, UnsubscribeFn } from '../lib/events.js';
import type { AuthorityService } from './authority-service.js';

const logger = createLogger('ActionableItemBridge');

interface BridgeOptions {
  actionableItemService: ActionableItemService;
  events: EventEmitter;
  authorityService?: AuthorityService;
}

export class ActionableItemBridgeService {
  private actionableItemService: ActionableItemService;
  private events: EventEmitter;
  private authorityService: AuthorityService | null = null;
  private unsubscribe: UnsubscribeFn | null = null;

  constructor({ actionableItemService, events, authorityService }: BridgeOptions) {
    this.actionableItemService = actionableItemService;
    this.events = events;
    this.authorityService = authorityService ?? null;
    this.start();
  }

  /**
   * Wire in the AuthorityService after construction to avoid circular dependencies.
   */
  setAuthorityService(authorityService: AuthorityService): void {
    this.authorityService = authorityService;
  }

  private start() {
    this.unsubscribe = this.events.subscribe((type: EventType, payload: unknown) => {
      switch (type) {
        case 'hitl:form-requested':
          this.handleHITLFormRequested(payload);
          break;
        case 'notification:created':
          this.handleNotificationCreated(payload);
          break;
        case 'escalation:ui-notification':
          this.handleEscalation(payload);
          break;
        case 'pipeline:gate-waiting':
          this.handlePipelineGate(payload);
          break;
        case 'feature:status-changed':
          this.handleFeatureStatusChanged(payload);
          break;
        case 'authority:awaiting-approval':
          this.handleAuthorityAwaitingApproval(payload);
          break;
        case 'hitl:form-responded':
          this.handleHITLFormResponded(payload);
          break;
      }
    });
    logger.info('Bridge service started — listening for events');
  }

  private async handleHITLFormRequested(payload: unknown) {
    const data = payload as {
      formId: string;
      title: string;
      callerType: string;
      featureId?: string;
      projectPath?: string;
      stepCount: number;
      expiresAt: string;
    };

    if (!data.projectPath) {
      logger.warn('HITL form requested without projectPath, skipping bridge');
      return;
    }

    try {
      await this.actionableItemService.createActionableItem({
        projectPath: data.projectPath,
        actionType: 'hitl_form',
        priority: 'high',
        title: data.title,
        message: `${data.stepCount} step form from ${data.callerType}`,
        expiresAt: data.expiresAt,
        category: 'forms',
        actionPayload: {
          formId: data.formId,
          featureId: data.featureId,
        },
      });
      logger.info(`Created actionable item for HITL form: ${data.formId}`);
    } catch (error) {
      logger.error('Failed to create actionable item for HITL form:', error);
    }
  }

  private async handleNotificationCreated(payload: unknown) {
    const data = payload as {
      id: string;
      type: string;
      title: string;
      message: string;
      featureId?: string;
      projectPath?: string;
    };

    if (!data.projectPath) {
      logger.warn('Notification created without projectPath, skipping bridge');
      return;
    }

    // Map notification types to actionable item priority and type
    let priority: 'low' | 'medium' | 'high' | 'urgent' = 'low';
    let actionType: 'approval' | 'notification' = 'notification';

    if (data.type === 'feature_waiting_approval') {
      priority = 'medium';
      actionType = 'approval';
    }

    try {
      await this.actionableItemService.createActionableItem({
        projectPath: data.projectPath,
        actionType,
        priority,
        title: data.title,
        message: data.message,
        category: 'notifications',
        actionPayload: {
          featureId: data.featureId,
          notificationId: data.id,
        },
      });
      logger.info(`Created actionable item for notification: ${data.type}`);
    } catch (error) {
      logger.error('Failed to create actionable item for notification:', error);
    }
  }

  private async handleEscalation(payload: unknown) {
    const data = payload as {
      type: string;
      severity: string;
      source: string;
      context: Record<string, unknown>;
      deduplicationKey: string;
      timestamp: string;
    };

    // Map escalation severity to actionable item priority
    const severityToPriority: Record<string, 'low' | 'medium' | 'high' | 'urgent'> = {
      critical: 'urgent',
      high: 'high',
      medium: 'medium',
      low: 'low',
    };
    const priority = severityToPriority[data.severity] ?? 'medium';

    // Extract projectPath and featureId from context if available
    const projectPath = (data.context?.projectPath as string) || '';
    const featureId = data.context?.featureId as string | undefined;

    if (!projectPath) {
      logger.warn('Escalation without projectPath in context, skipping bridge');
      return;
    }

    try {
      await this.actionableItemService.createActionableItem({
        projectPath,
        actionType: 'escalation',
        priority,
        title: `Escalation: ${(data.context?.featureTitle as string) || data.type}`,
        message: (data.context?.reason as string) || `${data.source} — ${data.severity} severity`,
        category: 'escalations',
        actionPayload: {
          featureId,
          escalationSource: data.source,
          escalationType: data.type,
          deduplicationKey: data.deduplicationKey,
        },
      });
      logger.info(`Created actionable item for escalation: ${data.type}`);
    } catch (error) {
      logger.error('Failed to create actionable item for escalation:', error);
    }
  }

  private async handlePipelineGate(payload: unknown) {
    const data = payload as {
      featureId: string;
      projectPath?: string;
      phase: string;
      branch: string;
      gateMode: string;
      timestamp: string;
    };

    if (!data.projectPath) {
      logger.warn('Pipeline gate without projectPath, skipping bridge');
      return;
    }

    try {
      await this.actionableItemService.createActionableItem({
        projectPath: data.projectPath,
        actionType: 'gate',
        priority: 'high',
        title: `Pipeline gate: ${data.phase}`,
        message: `${data.branch} pipeline awaiting ${data.gateMode} gate at ${data.phase}`,
        category: 'pipeline',
        actionPayload: {
          featureId: data.featureId,
          pipelinePhase: data.phase,
          pipelineBranch: data.branch,
          gateMode: data.gateMode,
        },
      });
      logger.info(`Created actionable item for pipeline gate: ${data.phase}`);
    } catch (error) {
      logger.error('Failed to create actionable item for pipeline gate:', error);
    }
  }

  /**
   * Auto-dismiss actionable items when a feature transitions from blocked
   * to backlog or in_progress (feature unblocked). Finds all pending/snoozed
   * items associated with the featureId and dismisses them.
   */
  private async handleFeatureStatusChanged(payload: unknown) {
    const data = payload as {
      featureId?: string;
      previousStatus?: string;
      newStatus?: string;
      projectPath?: string;
    };

    // Only act when feature transitions FROM blocked TO backlog/in_progress
    if (data.previousStatus !== 'blocked') return;
    if (data.newStatus !== 'backlog' && data.newStatus !== 'in_progress') return;
    if (!data.projectPath || !data.featureId) return;

    try {
      const allItems = await this.actionableItemService.getActionableItems(data.projectPath, {
        includeActed: false,
        includeDismissed: false,
        includeExpired: false,
      });

      // Find pending/snoozed items that reference this featureId
      const matchingItems = allItems.filter(
        (item) =>
          item.actionPayload?.featureId === data.featureId &&
          (item.status === 'pending' || item.status === 'snoozed')
      );

      if (matchingItems.length === 0) return;

      for (const item of matchingItems) {
        await this.actionableItemService.dismissItem(data.projectPath, item.id);
      }

      logger.info(
        `Auto-dismissed ${matchingItems.length} item(s) for feature ${data.featureId} — feature unblocked`
      );
    } catch (error) {
      logger.error(`Failed to auto-dismiss items for feature ${data.featureId}:`, error);
    }
  }

  /**
   * Handle authority:awaiting-approval — creates an actionable item of type 'approval'
   * so the request appears in the unified inbox as a HITL form for the human to act on.
   */
  private async handleAuthorityAwaitingApproval(payload: unknown) {
    const data = payload as {
      projectPath: string;
      proposal: {
        who: string;
        what: string;
        target: string;
        justification: string;
        risk: string;
      };
      decision: {
        verdict: string;
        reason: string;
        approver?: string;
      };
      requestId: string;
    };

    if (!data.projectPath) {
      logger.warn('authority:awaiting-approval without projectPath, skipping bridge');
      return;
    }

    // Risk level to priority mapping
    const riskToPriority: Record<string, 'low' | 'medium' | 'high' | 'urgent'> = {
      critical: 'urgent',
      high: 'urgent',
      medium: 'high',
      low: 'medium',
    };
    const priority = riskToPriority[data.proposal.risk] ?? 'high';

    try {
      await this.actionableItemService.createActionableItem({
        projectPath: data.projectPath,
        actionType: 'approval',
        priority,
        title: `Approval required: ${data.proposal.what}`,
        message: `Agent ${data.proposal.who} requests "${data.proposal.what}" on "${data.proposal.target}". Reason: ${data.decision.reason}`,
        category: 'authority',
        actionPayload: {
          requestId: data.requestId,
          proposalWho: data.proposal.who,
          proposalWhat: data.proposal.what,
          proposalTarget: data.proposal.target,
          proposalRisk: data.proposal.risk,
          proposalJustification: data.proposal.justification,
        },
      });
      logger.info(`Created actionable item for authority approval request: ${data.requestId}`);
    } catch (error) {
      logger.error('Failed to create actionable item for authority approval:', error);
    }
  }

  /**
   * Handle hitl:form-responded — if the form is an authority approval form,
   * resolve the pending approval request based on the HITL response.
   *
   * Authority approval HITL forms encode their requestId in the formId field
   * when callerType is 'authority-approval'. The response array's first entry
   * should contain a 'decision' field ('approve' or 'reject').
   */
  private async handleHITLFormResponded(payload: unknown) {
    const data = payload as {
      formId: string;
      callerType?: string;
      projectPath?: string;
      cancelled?: boolean;
      response?: Record<string, unknown>[];
    };

    // Only handle authority-approval forms
    if (data.callerType !== 'authority-approval') {
      return;
    }

    if (!data.projectPath || data.cancelled || !data.response || !this.authorityService) {
      return;
    }

    // Extract decision from first response step
    const firstStep = data.response[0] ?? {};
    const decisionValue = firstStep['decision'] as string | undefined;
    const respondedBy = (firstStep['respondedBy'] as string | undefined) ?? 'hitl-form';

    if (!decisionValue) {
      logger.warn(`authority-approval HITL form ${data.formId} has no decision in response`);
      return;
    }

    const resolution: 'approve' | 'reject' = decisionValue === 'approve' ? 'approve' : 'reject';

    try {
      await this.authorityService.resolveApproval(
        data.formId,
        resolution,
        respondedBy,
        data.projectPath
      );
      logger.info(
        `Resolved authority approval request ${data.formId} via HITL form: ${resolution} by ${respondedBy}`
      );
    } catch (error) {
      logger.error(`Failed to resolve authority approval via HITL form ${data.formId}:`, error);
    }
  }

  shutdown() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
      logger.info('Bridge service stopped');
    }
  }
}
