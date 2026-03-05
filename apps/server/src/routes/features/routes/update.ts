/**
 * POST /update endpoint - Update a feature
 *
 * When the authority system is enabled for a project, status changes are
 * evaluated against trust-based policies before proceeding. If the policy
 * denies or requires approval, the update is blocked with an appropriate
 * HTTP status code. When the authority system is disabled, behavior is
 * unchanged from previous versions.
 */

import type { Request, Response } from 'express';
import { FeatureLoader } from '../../../services/feature-loader.js';
import type { Feature, FeatureStatus, ActionProposal, RiskLevel } from '@protolabsai/types';
import type { AuthorityService } from '../../../services/authority-service.js';
import type { SettingsService } from '../../../services/settings-service.js';
import type { FeatureHealthService } from '../../../services/feature-health-service.js';
import type { EventEmitter } from '../../../lib/events.js';
import { getErrorMessage, logError } from '../common.js';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('features/update');

// Statuses that should trigger syncing to app_spec.txt
const SYNC_TRIGGER_STATUSES: FeatureStatus[] = ['done'];

export function createUpdateHandler(
  featureLoader: FeatureLoader,
  settingsService?: SettingsService,
  authorityService?: AuthorityService,
  healthService?: FeatureHealthService,
  events?: EventEmitter
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectPath,
        featureId,
        updates,
        descriptionHistorySource,
        enhancementMode,
        preEnhancementDescription,
        callerAgentId,
        risk,
      } = req.body as {
        projectPath: string;
        featureId: string;
        updates: Partial<Feature>;
        descriptionHistorySource?: 'enhance' | 'edit';
        enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer';
        preEnhancementDescription?: string;
        callerAgentId?: string;
        risk?: RiskLevel;
      };

      if (!projectPath || !featureId || !updates) {
        res.status(400).json({
          success: false,
          error: 'projectPath, featureId, and updates are required',
        });
        return;
      }

      // Check for duplicate title if title is being updated
      if (updates.title && updates.title.trim()) {
        const duplicate = await featureLoader.findDuplicateTitle(
          projectPath,
          updates.title,
          featureId // Exclude the current feature from duplicate check
        );
        if (duplicate) {
          res.status(409).json({
            success: false,
            error: `A feature with title "${updates.title}" already exists`,
            duplicateFeatureId: duplicate.id,
          });
          return;
        }
      }

      // Get the current feature to detect status changes
      const currentFeature = await featureLoader.get(projectPath, featureId);
      const previousStatus = currentFeature?.status as FeatureStatus | undefined;
      const newStatus = updates.status as FeatureStatus | undefined;

      // Authority system policy check: gate status changes when enabled
      if (newStatus && previousStatus !== newStatus && settingsService && authorityService) {
        try {
          const projectSettings = await settingsService.getProjectSettings(projectPath);
          if (projectSettings.authoritySystem?.enabled) {
            const proposal: ActionProposal = {
              who: callerAgentId || 'user',
              what: 'transition_status',
              target: featureId,
              justification: `Status change from ${previousStatus} to ${newStatus}`,
              risk: risk || 'low',
              statusTransition: { from: previousStatus || 'unknown', to: newStatus },
            };

            const decision = await authorityService.submitProposal(proposal, projectPath);

            if (decision.verdict === 'deny') {
              res.status(403).json({
                success: false,
                error: decision.reason,
                verdict: 'deny',
              });
              return;
            }

            if (decision.verdict === 'require_approval') {
              res.status(202).json({
                success: false,
                verdict: 'require_approval',
                approvalId: decision.approver,
                reason: decision.reason,
              });
              return;
            }

            // verdict === 'allow' - continue with normal update
          }
        } catch (policyError) {
          // Log but do not block the update if the policy check itself fails.
          // This prevents the authority system from becoming a single point of failure.
          logger.error('Authority policy check failed, proceeding with update:', policyError);
        }
      }

      // Require a reason when blocking a feature
      if (newStatus === 'blocked' && previousStatus !== 'blocked') {
        const reason = updates.statusChangeReason?.trim();
        if (!reason) {
          res.status(400).json({
            success: false,
            error: 'A reason is required when blocking a feature. Set statusChangeReason.',
          });
          return;
        }
      }

      const updated = await featureLoader.update(
        projectPath,
        featureId,
        updates,
        descriptionHistorySource,
        enhancementMode,
        preEnhancementDescription
      );

      // Trigger sync to app_spec.txt when status changes to done
      if (newStatus && SYNC_TRIGGER_STATUSES.includes(newStatus) && previousStatus !== newStatus) {
        try {
          const synced = await featureLoader.syncFeatureToAppSpec(projectPath, updated);
          if (synced) {
            logger.info(
              `Synced feature "${updated.title || updated.id}" to app_spec.txt on status change to ${newStatus}`
            );
          }
        } catch (syncError) {
          // Log the sync error but don't fail the update operation
          logger.error(`Failed to sync feature to app_spec.txt:`, syncError);
        }
      }

      // Trigger immediate board health audit when status changes (especially to 'done')
      // This ensures that if a feature status is changed manually, we reconcile any
      // webhook mismatches or merged PRs that may not have been caught previously
      if (newStatus && previousStatus !== newStatus && healthService) {
        try {
          await healthService.audit(projectPath);
          logger.debug(
            `Triggered board health audit after status change: ${previousStatus} -> ${newStatus}`
          );
        } catch (auditError) {
          // Log the audit error but don't fail the update operation
          logger.error(`Failed to run board health audit after status change:`, auditError);
        }
      }

      // Emit feature:status-changed so downstream services can react:
      // - CompletionDetectorService: cascade epic → milestone → project completion checks
      // - LedgerService: record metrics
      // - AutoModeService: stop zombie agents on done
      // - PRFeedbackService: start tracking PRs on review
      if (
        newStatus &&
        previousStatus !== newStatus &&
        (newStatus === 'done' || newStatus === 'review') &&
        events
      ) {
        events.emit('feature:status-changed', {
          projectPath: req.body.projectPath,
          featureId: req.body.featureId,
          previousStatus: previousStatus || 'unknown',
          newStatus,
        });
      }

      // Emit feature:updated when title or description changed so downstream
      // services can react to metadata changes.
      if (events) {
        const titleChanged = updates.title !== undefined && currentFeature?.title !== updated.title;
        const descriptionChanged =
          updates.description !== undefined && currentFeature?.description !== updated.description;
        if (titleChanged || descriptionChanged) {
          events.emit('feature:updated', {
            featureId,
            projectPath,
            previousTitle: currentFeature?.title,
            newTitle: updated.title,
            previousDescription: currentFeature?.description,
            newDescription: updated.description,
          });
        }
      }

      res.json({ success: true, feature: updated });
    } catch (error) {
      logError(error, 'Update feature failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
