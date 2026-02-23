/**
 * POST /api/actionable-items/global - List actionable items across all known projects
 *
 * Request body: { includeActed?: boolean, includeDismissed?: boolean, includeExpired?: boolean }
 * Response: { success: true, items: ActionableItem[], pendingCount: number, unreadCount: number }
 */

import type { Request, Response } from 'express';
import type { ActionableItemService } from '../../../services/actionable-item-service.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { getErrorMessage, logError } from '../common.js';
import type { ActionableItem } from '@automaker/types';
import { getEffectivePriority } from '@automaker/types';

export function createGlobalListHandler(
  service: ActionableItemService,
  settingsService: SettingsService
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { includeActed, includeDismissed, includeExpired } = req.body;

      // Get all known project paths from settings
      const settings = await settingsService.getGlobalSettings();
      const projectPaths = (settings.projects ?? []).map((p) => p.path).filter(Boolean);

      if (projectPaths.length === 0) {
        res.json({ success: true, items: [], pendingCount: 0, unreadCount: 0 });
        return;
      }

      // Fetch items from all projects in parallel
      const results = await Promise.allSettled(
        projectPaths.map(async (projectPath) => {
          const items = await service.getActionableItems(projectPath, {
            includeActed,
            includeDismissed,
            includeExpired,
          });
          return items;
        })
      );

      // Merge all items, tagging each with its source project
      const allItems: ActionableItem[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allItems.push(...result.value);
        }
      }

      // Sort by effective priority then by date
      const priorityScore: Record<string, number> = {
        urgent: 4,
        high: 3,
        medium: 2,
        low: 1,
      };

      allItems.sort((a, b) => {
        const scoreA = priorityScore[getEffectivePriority(a)] ?? 0;
        const scoreB = priorityScore[getEffectivePriority(b)] ?? 0;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      const pendingCount = allItems.filter(
        (i) => i.status === 'pending' || i.status === 'snoozed'
      ).length;
      const unreadCount = allItems.filter((i) => !i.read && i.status === 'pending').length;

      res.json({ success: true, items: allItems, pendingCount, unreadCount });
    } catch (error) {
      logError(error, 'Global list actionable items failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
