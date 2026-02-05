/**
 * POST /list endpoint - List all project plans for a project
 *
 * Returns project slugs with archive status and retention information
 */

import type { Request, Response } from 'express';
import { listProjectPlans, getProjectJsonPath, secureFs } from '@automaker/platform';
import { getErrorMessage, logError } from '../common.js';
import type { Project } from '@automaker/types';
import { getDaysUntilDeletion } from '../../../services/discord-archive-service.js';

interface ProjectListItem {
  slug: string;
  title: string;
  status: string;
  archived?: boolean;
  archivedAt?: string;
  daysUntilDeletion?: number;
  scheduledDeletionAt?: string;
}

export function createListHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, includeArchived = true } = req.body as {
        projectPath: string;
        includeArchived?: boolean;
      };

      if (!projectPath) {
        res.status(400).json({ success: false, error: 'projectPath is required' });
        return;
      }

      const projectSlugs = await listProjectPlans(projectPath);

      // Load full project data to check archive status
      const projects: ProjectListItem[] = [];
      for (const slug of projectSlugs) {
        try {
          const jsonPath = getProjectJsonPath(projectPath, slug);
          const rawContent = await secureFs.readFile(jsonPath, 'utf-8');
          const content = typeof rawContent === 'string' ? rawContent : rawContent.toString('utf-8');
          const project = JSON.parse(content) as Project;

          const listItem: ProjectListItem = {
            slug: project.slug,
            title: project.title,
            status: project.status,
          };

          if (project.archiveMetadata) {
            listItem.archived = true;
            listItem.archivedAt = project.archiveMetadata.archivedAt;
            listItem.scheduledDeletionAt = project.archiveMetadata.scheduledDeletionAt;
            listItem.daysUntilDeletion = getDaysUntilDeletion(project.archiveMetadata);
          }

          // Filter out archived projects if requested
          if (!includeArchived && listItem.archived) {
            continue;
          }

          projects.push(listItem);
        } catch (error) {
          // If we can't load the project JSON, just include the slug
          projects.push({
            slug,
            title: slug,
            status: 'unknown',
          });
        }
      }

      res.json({ success: true, projects });
    } catch (error) {
      logError(error, 'List project plans failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
