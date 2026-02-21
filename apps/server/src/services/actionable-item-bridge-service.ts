/**
 * ActionableItem Bridge Service
 *
 * Listens for events from existing systems (HITL forms, notifications,
 * escalations, pipeline gates) and creates ActionableItems automatically.
 * This connects the unified inbox to all user-attention signals.
 */

import { createLogger } from '@automaker/utils';
import type { EventType } from '@automaker/types';
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
      projectPath: string;
    };

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
      projectPath: string;
      phase: string;
      branch: string;
      gateMode: string;
      timestamp: string;
    };

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

  shutdown() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
      logger.info('Bridge service stopped');
    }
  }
}
