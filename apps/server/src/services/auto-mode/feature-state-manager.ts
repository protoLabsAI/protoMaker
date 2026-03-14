/**
 * FeatureStateManager - Feature status persistence and event emission
 *
 * Responsibility:
 * - Updating feature status on disk (via FeatureLoader for persist-before-emit guarantee)
 * - Emitting downstream events (feature:completed, feature:error) after status is persisted
 *
 * NOTE: feature:status-changed is now emitted automatically by FeatureLoader.update().
 * This class no longer emits it manually.
 */

import type { Feature } from '@protolabsai/types';
import type { EventEmitter } from '../../lib/events.js';
import type { FeatureLoader } from '../feature-loader.js';
import { createLogger } from '@protolabsai/utils';
import { getNotificationService } from '../notification-service.js';

const logger = createLogger('FeatureStateManager');

export class FeatureStateManager {
  constructor(
    private events: EventEmitter,
    private featureLoader: FeatureLoader
  ) {}

  /**
   * Update a feature's status on disk and emit status-change events.
   *
   * ORDERING GUARANTEE: FeatureLoader.update() writes to disk before emitting
   * feature:status-changed. This prevents clients from reading stale status data
   * on refresh after a server restart triggered by status-change events.
   */
  async updateFeatureStatus(projectPath: string, featureId: string, status: string): Promise<void> {
    try {
      // Read the current feature to get its state for derived field computation
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) {
        logger.warn(`Feature ${featureId} not found or could not be recovered`);
        return;
      }

      const timestamp = new Date().toISOString();

      // Build the updates object
      const updates: Partial<Feature> = {
        status,
        updatedAt: timestamp,
      };

      // Clear stale pipeline gate metadata when reaching terminal states.
      // Without this, completed features keep awaitingGate=true forever and the
      // health service repeatedly knocks them back to blocked on every sweep.
      const TERMINAL_STATUSES = new Set(['done', 'verified', 'completed', 'review']);
      if (TERMINAL_STATUSES.has(status) && feature.pipelineState) {
        updates.pipelineState = {
          ...feature.pipelineState,
          awaitingGate: false,
          awaitingGatePhase: undefined,
          gateWaitingSince: undefined,
        };
      }

      // Set justFinishedAt timestamp when moving to waiting_approval (agent just completed)
      // Badge will show for 2 minutes after this timestamp
      if (status === 'waiting_approval') {
        updates.justFinishedAt = timestamp;
      } else {
        // Clear the timestamp when moving to other statuses
        updates.justFinishedAt = undefined;
      }

      // Set lastFailureTime when feature fails (for auto-retry cooldown)
      if (status === 'failed' || status === 'blocked') {
        updates.lastFailureTime = timestamp;
      }

      // PERSIST BEFORE EMIT: featureLoader.update() writes to disk first, then
      // automatically emits feature:status-changed (no manual emission needed here).
      const updatedFeature = await this.featureLoader.update(projectPath, featureId, updates);

      // Emit feature:completed event when reaching terminal success states
      // This allows Lead Engineer and other services to detect completion
      if (status === 'verified' || status === 'done') {
        this.events.emit('feature:completed', {
          projectPath,
          featureId,
          featureTitle: updatedFeature.title,
          projectSlug: updatedFeature.projectSlug,
          status,
        });
      }

      // Emit feature:error event when reaching error states
      if (status === 'failed' || status === 'blocked') {
        this.events.emit('feature:error', {
          projectPath,
          featureId,
          error: updatedFeature.error || 'Feature execution failed',
          projectSlug: updatedFeature.projectSlug,
          status,
        });
      }

      // Create notifications for important status changes
      const notificationService = getNotificationService();
      if (status === 'waiting_approval') {
        await notificationService.createNotification({
          type: 'feature_waiting_approval',
          title: 'Feature Ready for Review',
          message: `"${updatedFeature.title || featureId}" is ready for your review and approval.`,
          featureId,
          projectPath,
        });
      } else if (status === 'verified') {
        await notificationService.createNotification({
          type: 'feature_verified',
          title: 'Feature Verified',
          message: `"${updatedFeature.title || featureId}" has been verified and is complete.`,
          featureId,
          projectPath,
        });
      }

      // Sync completed/verified features to app_spec.txt
      if (status === 'verified' || status === 'completed') {
        try {
          await this.featureLoader.syncFeatureToAppSpec(projectPath, updatedFeature);
        } catch (syncError) {
          // Log but don't fail the status update if sync fails
          logger.warn(`Failed to sync feature ${featureId} to app_spec.txt:`, syncError);
        }
      }
    } catch (error) {
      logger.error(`Failed to update feature status for ${featureId}:`, error);
    }
  }
}
