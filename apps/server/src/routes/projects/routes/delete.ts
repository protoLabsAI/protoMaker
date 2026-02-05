/**
 * POST /delete endpoint - Delete a project plan
 *
 * Supports both soft deletion (archive with 7-day retention) and permanent deletion.
 * When archiving, Discord channels are moved to Archive category.
 * Permanent deletion requires admin confirmation and respects 7-day retention period.
 */

import type { Request, Response } from 'express';
import { deleteProjectPlan, projectPlanExists, getProjectJsonPath } from '@automaker/platform';
import { secureFs } from '@automaker/platform';
import { getErrorMessage, logError } from '../common.js';
import type { Project } from '@automaker/types';
import {
  archiveProjectChannels,
  permanentlyDeleteChannels,
  createArchiveMetadata,
  isReadyForPermanentDeletion,
  getDaysUntilDeletion,
} from '../../../services/discord-archive-service.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('projects:delete');

export function createDeleteHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, projectSlug, permanent, force } = req.body as {
        projectPath: string;
        projectSlug: string;
        permanent?: boolean;
        force?: boolean;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }
      if (!projectSlug) {
        res.status(400).json({ success: false, error: 'projectSlug is required' });
        return;
      }

      // Check if project exists
      const exists = await projectPlanExists(projectPath, projectSlug);
      if (!exists) {
        res.status(404).json({ success: false, error: `Project "${projectSlug}" not found` });
        return;
      }

      // Load project to check for Discord channels and archive metadata
      const projectJsonPath = getProjectJsonPath(projectPath, projectSlug);
      let project: Project | null = null;
      try {
        const rawContent = await secureFs.readFile(projectJsonPath, 'utf-8');
        const content = typeof rawContent === 'string' ? rawContent : rawContent.toString('utf-8');
        project = JSON.parse(content) as Project;
      } catch (error) {
        logger.warn('Failed to load project JSON, proceeding with deletion', { error });
      }

      // Handle permanent deletion
      if (permanent) {
        // Verify retention period has elapsed (unless force is true)
        if (!force && project?.archiveMetadata) {
          if (!isReadyForPermanentDeletion(project.archiveMetadata)) {
            const daysRemaining = getDaysUntilDeletion(project.archiveMetadata);
            res.status(400).json({
              success: false,
              error: `Cannot permanently delete project. ${daysRemaining} days remaining in retention period.`,
              daysRemaining,
            });
            return;
          }
        }

        // Permanently delete Discord channels if archived
        if (project?.discordChannelIds && project.discordChannelIds.length > 0) {
          logger.info('Permanently deleting Discord channels', {
            projectSlug,
            channelCount: project.discordChannelIds.length,
          });

          const deleteResult = await permanentlyDeleteChannels(project.discordChannelIds);
          if (!deleteResult.success) {
            logger.warn('Some Discord channels failed to delete', {
              projectSlug,
              failed: deleteResult.failedChannels,
            });
          }
        }

        // Permanently delete project files
        const deleted = await deleteProjectPlan(projectPath, projectSlug);
        if (!deleted) {
          res.status(500).json({ success: false, error: 'Failed to delete project' });
          return;
        }

        logger.info('Project permanently deleted', { projectSlug });
        res.json({ success: true, permanent: true });
        return;
      }

      // Handle soft deletion (archive)
      if (project?.discordChannelIds && project.discordChannelIds.length > 0) {
        logger.info('Archiving Discord channels', {
          projectSlug,
          channelCount: project.discordChannelIds.length,
        });

        const archiveResult = await archiveProjectChannels({
          channelIds: project.discordChannelIds,
          projectSlug,
        });

        // Create archive metadata
        const archiveMetadata = createArchiveMetadata(archiveResult.archiveCategoryId);

        // Update project with archive metadata
        const updatedProject: Project = {
          ...project,
          archiveMetadata,
          updatedAt: new Date().toISOString(),
        };

        // Save updated project with archive metadata
        await secureFs.writeFile(projectJsonPath, JSON.stringify(updatedProject, null, 2));

        logger.info('Project archived', {
          projectSlug,
          channelsArchived: archiveResult.archivedChannels.length,
          scheduledDeletion: archiveMetadata.scheduledDeletionAt,
        });

        res.json({
          success: true,
          archived: true,
          archiveMetadata,
          channelsArchived: archiveResult.archivedChannels.length,
          channelsFailed: archiveResult.failedChannels.length,
        });
        return;
      }

      // No Discord channels, proceed with immediate deletion
      const deleted = await deleteProjectPlan(projectPath, projectSlug);
      if (!deleted) {
        res.status(500).json({ success: false, error: 'Failed to delete project' });
        return;
      }

      logger.info('Project deleted (no channels to archive)', { projectSlug });
      res.json({ success: true });
    } catch (error) {
      logError(error, 'Delete project failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
