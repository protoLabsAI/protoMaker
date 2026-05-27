/**
 * GET /api/settings/global - Retrieve global user settings
 *
 * Returns the complete GlobalSettings object with all user preferences,
 * keyboard shortcuts, AI profiles, and project history.
 *
 * Response: `{ "success": true, "settings": GlobalSettings }`
 */

import type { Request, Response } from 'express';
import type { SettingsService } from '../../../services/settings-service.js';
import { getErrorMessage, logError } from '../common.js';
import { enrichProjects } from './enrich-projects.js';

/**
 * Create handler factory for GET /api/settings/global
 *
 * @param settingsService - Instance of SettingsService for file I/O
 * @returns Express request handler
 */
export function createGetGlobalHandler(settingsService: SettingsService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const settings = await settingsService.getGlobalSettings();

      // Serve persisted github/defaultBranch directly. enrichProjects only backfills
      // entries still missing them (projects added before they were persisted at
      // setup). When it does backfill, persist the result once so future reads —
      // and a dropped source mount (#3948) — serve the values without `.git`.
      if (settings.projects && settings.projects.length > 0) {
        const original = settings.projects;
        const enriched = await enrichProjects(original);
        settings.projects = enriched;

        const backfilled = enriched.some((p, i) => {
          const before = original[i];
          return (
            p.github?.owner !== before.github?.owner ||
            p.github?.repo !== before.github?.repo ||
            p.defaultBranch !== before.defaultBranch
          );
        });
        if (backfilled) {
          // One-time lazy migration. Best-effort: a write failure must not fail the read.
          await settingsService
            .updateGlobalSettings({ projects: enriched })
            .catch((err) => logError(err, 'Failed to persist backfilled project github metadata'));
        }
      }

      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      logError(error, 'Get global settings failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
