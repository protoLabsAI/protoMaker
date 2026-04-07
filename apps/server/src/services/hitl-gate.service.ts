/**
 * HITL Gate Service
 *
 * Routes HITL gate-hold requests through Workstacean's hitl plugin via POST /publish.
 * Replaces the direct Discord bot reaction pattern.
 *
 * When a pipeline gate is hit for a Discord-sourced feature, this service publishes
 * a "hitl.request.gate-hold" event to Workstacean. Workstacean's HITL plugin handles
 * the reaction prompt in Discord and routes the approval/rejection back via events.
 *
 * Pattern: same A2A routing used by other protomaker→Workstacean integrations.
 */

import { createLogger } from '@protolabsai/utils';
import { publish } from '../client/workstacean-api.client.js';

const logger = createLogger('HITLGateService');

/** Parameters for a gate-hold approval request */
export interface GateHoldRequest {
  featureId: string;
  projectPath: string;
  featureTitle?: string;
  channelId: string;
  phase?: string;
}

/** Pending gate-hold tracking entry */
interface PendingGate {
  featureId: string;
  projectPath: string;
  channelId: string;
  publishedAt: number;
}

/**
 * HITLGateService — publishes gate-hold requests to Workstacean.
 *
 * Workstacean's hitl plugin receives the "hitl.request.gate-hold" event
 * and posts a reaction-based approval prompt in the Discord channel.
 * The approval/rejection is routed back as "hitl.response.*" events.
 */
export class HITLGateService {
  private pending = new Map<string, PendingGate>();

  /**
   * Publish a gate-hold approval request to Workstacean.
   * Returns true if the event was successfully published.
   */
  async requestGateHold(params: GateHoldRequest): Promise<boolean> {
    const { featureId, projectPath, featureTitle, channelId, phase } = params;

    logger.info(
      `Publishing hitl.request.gate-hold for feature ${featureId} in channel ${channelId}`
    );

    const result = await publish({
      event: 'hitl.request.gate-hold',
      data: {
        featureId,
        projectPath,
        featureTitle: featureTitle ?? featureId,
        channelId,
        phase: phase ?? null,
        source: 'protomaker',
        requestedAt: new Date().toISOString(),
      },
    });

    if (result.ok) {
      this.pending.set(featureId, {
        featureId,
        projectPath,
        channelId,
        publishedAt: Date.now(),
      });
      logger.info(`Gate-hold request published for feature ${featureId}`);
    } else {
      logger.error(`Failed to publish gate-hold for feature ${featureId}: ${result.error}`);
    }

    return result.ok;
  }

  /**
   * Cancel a pending gate-hold (e.g., feature was rejected or resolved externally).
   * Publishes a "hitl.request.cancel" event to Workstacean.
   */
  async cancelGateHold(featureId: string): Promise<void> {
    const gate = this.pending.get(featureId);
    if (!gate) {
      logger.debug(`cancelGateHold: no pending gate for feature ${featureId}`);
      return;
    }

    const result = await publish({
      event: 'hitl.request.cancel',
      data: {
        featureId,
        projectPath: gate.projectPath,
        channelId: gate.channelId,
        source: 'protomaker',
        cancelledAt: new Date().toISOString(),
      },
    });

    this.pending.delete(featureId);

    if (!result.ok) {
      logger.warn(`Failed to cancel gate-hold for feature ${featureId}: ${result.error}`);
    } else {
      logger.info(`Gate-hold cancel published for feature ${featureId}`);
    }
  }

  /** Check if a gate-hold is pending for a feature. */
  hasPendingGate(featureId: string): boolean {
    return this.pending.has(featureId);
  }

  /** Get all pending gate feature IDs. */
  getPendingFeatureIds(): string[] {
    return Array.from(this.pending.keys());
  }
}
