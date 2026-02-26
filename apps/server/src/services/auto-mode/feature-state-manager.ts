/**
 * FeatureStateManager - Feature status persistence and event emission
 *
 * Responsibility:
 * - Updating feature status on disk (atomic write with backup support)
 * - Emitting consistent status-change events
 * - Ensuring persist-before-emit ordering: write to disk, THEN emit event
 *   (prevents stale data on client refresh after server restart)
 */

import type { Feature } from '@protolabs-ai/types';
import type { EventEmitter } from '../../lib/events.js';
import type { FeatureLoader } from '../feature-loader.js';
import {
  createLogger,
  atomicWriteJson,
  readJsonWithRecovery,
  logRecoveryWarning,
  DEFAULT_BACKUP_COUNT,
} from '@protolabs-ai/utils';
import { getFeatureDir } from '@protolabs-ai/platform';
import path from 'path';
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
   * ORDERING GUARANTEE: Disk write completes before any event is emitted.
   * This prevents clients from reading stale status data on refresh after
   * a server restart triggered by status-change events.
   */
  async updateFeatureStatus(projectPath: string, featureId: string, status: string): Promise<void> {
    const featureDir = getFeatureDir(projectPath, featureId);
    const featurePath = path.join(featureDir, 'feature.json');

    try {
      // Use recovery-enabled read for corrupted file handling
      const result = await readJsonWithRecovery<Feature | null>(featurePath, null, {
        maxBackups: DEFAULT_BACKUP_COUNT,
        autoRestore: true,
      });

      logRecoveryWarning(result, `Feature ${featureId}`, logger);

      const feature = result.data;
      if (!feature) {
        logger.warn(`Feature ${featureId} not found or could not be recovered`);
        return;
      }

      // Capture previous status before updating for event emission
      const previousStatus = feature.status;

      feature.status = status;
      feature.updatedAt = new Date().toISOString();

      // Clear stale pipeline gate metadata when reaching terminal states.
      // Without this, completed features keep awaitingGate=true forever and the
      // health service repeatedly knocks them back to blocked on every sweep.
      const TERMINAL_STATUSES = new Set(['done', 'verified', 'completed', 'review']);
      if (TERMINAL_STATUSES.has(status) && feature.pipelineState) {
        feature.pipelineState.awaitingGate = false;
        feature.pipelineState.awaitingGatePhase = undefined;
        feature.pipelineState.gateWaitingSince = undefined;
      }

      // Set justFinishedAt timestamp when moving to waiting_approval (agent just completed)
      // Badge will show for 2 minutes after this timestamp
      if (status === 'waiting_approval') {
        feature.justFinishedAt = new Date().toISOString();
      } else {
        // Clear the timestamp when moving to other statuses
        feature.justFinishedAt = undefined;
      }
      // Set lastFailureTime when feature fails (for auto-retry cooldown)
      if (status === 'failed' || status === 'blocked') {
        feature.lastFailureTime = new Date().toISOString();
      }

      // PERSIST BEFORE EMIT: write to disk first to prevent stale reads on restart
      await atomicWriteJson(featurePath, feature, { backupCount: DEFAULT_BACKUP_COUNT });

      // Emit feature:status-changed event for all status transitions
      this.events.emit('feature:status-changed', {
        projectPath,
        featureId,
        previousStatus,
        newStatus: status,
      });

      // Emit feature:completed event when reaching terminal success states
      // This allows Lead Engineer and other services to detect completion
      if (status === 'verified' || status === 'done') {
        this.events.emit('feature:completed', {
          projectPath,
          featureId,
          featureTitle: feature.title,
          status,
        });
      }

      // Emit feature:error event when reaching error states
      if (status === 'failed' || status === 'blocked') {
        this.events.emit('feature:error', {
          projectPath,
          featureId,
          error: feature.error || 'Feature execution failed',
          status,
        });
      }

      // Create notifications for important status changes
      const notificationService = getNotificationService();
      if (status === 'waiting_approval') {
        await notificationService.createNotification({
          type: 'feature_waiting_approval',
          title: 'Feature Ready for Review',
          message: `"${feature.title || featureId}" is ready for your review and approval.`,
          featureId,
          projectPath,
        });
      } else if (status === 'verified') {
        await notificationService.createNotification({
          type: 'feature_verified',
          title: 'Feature Verified',
          message: `"${feature.title || featureId}" has been verified and is complete.`,
          featureId,
          projectPath,
        });
      }

      // Sync completed/verified features to app_spec.txt
      if (status === 'verified' || status === 'completed') {
        try {
          await this.featureLoader.syncFeatureToAppSpec(projectPath, feature);
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
