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

import { createLogger } from '@protolabs-ai/utils';
import type { EventType } from '@protolabs-ai/types';
import type { ActionableItemService } from './actionable-item-service.js';
import type { EventEmitter, UnsubscribeFn } from '../lib/events.js';

const logger = createLogger('ActionableItemBridge');

interface BridgeOptions {
  actionableItemService: ActionableItemService;
  events: EventEmitter;
}

export class ActionableItemBridgeService {
  private actionableItemService: ActionableItemService;
  private events: EventEmitter;
  private unsubscribe: UnsubscribeFn | null = null;

  constructor({ actionableItemService, events }: BridgeOptions) {
    this.actionableItemService = actionableItemService;
    this.events = events;
    this.start();
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
        title: `Escalation: ${data.type}`,
        message: `${data.source} — ${data.severity} severity`,
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

  shutdown() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
      logger.info('Bridge service stopped');
    }
  }
}
