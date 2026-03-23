/**
 * GET /api/ops/concurrency - Concurrency resolution overview
 *
 * Returns the active concurrency configuration for all running auto-mode projects,
 * showing how the precedence chain resolved for each worktree.
 */

import { Router } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import type { SettingsService } from '../../../services/settings-service.js';
import { MAX_SYSTEM_CONCURRENCY, DEFAULT_MAX_CONCURRENCY } from '@protolabsai/types';

export function createConcurrencyRoutes(
  autoModeService: AutoModeService,
  settingsService: SettingsService
): Router {
  const router = Router();

  /**
   * GET /api/ops/concurrency
   *
   * Returns:
   * - Precedence chain documentation
   * - Effective system cap (env var vs. settings.systemMaxConcurrency)
   * - Per-project resolved concurrency for all active auto-mode loops
   */
  router.get('/', async (_req, res) => {
    try {
      const settings = await settingsService.getGlobalSettings();

      const envCap = MAX_SYSTEM_CONCURRENCY;
      const configuredSystemMax = settings.systemMaxConcurrency ?? null;
      const effectiveSystemCap =
        configuredSystemMax !== null ? Math.min(configuredSystemMax, envCap) : envCap;

      const globalMax = settings.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
      const autoModeByWorktree = settings.autoModeByWorktree ?? {};

      const activeWorktrees = autoModeService.getActiveAutoLoopWorktrees();

      const loops = activeWorktrees.map(({ projectPath, branchName }) => {
        const projectId = settings.projects?.find((p) => p.path === projectPath)?.id ?? null;
        const key = projectId ? `${projectId}::${branchName ?? '__main__'}` : null;
        const perProjectEntry =
          key && typeof autoModeByWorktree === 'object'
            ? (autoModeByWorktree as Record<string, { maxConcurrency?: number } | undefined>)[key]
            : undefined;
        const perProjectValue = perProjectEntry?.maxConcurrency ?? null;

        const projectStatus = autoModeService.getStatusForProject(projectPath, branchName);
        const resolved = projectStatus.maxConcurrency;

        return {
          projectPath,
          branchName,
          resolved,
          source: perProjectValue !== null ? 'per-project' : 'global',
          perProjectConfigured: perProjectValue,
          globalConfigured: globalMax,
        };
      });

      res.json({
        precedenceChain: [
          'AUTOMAKER_MAX_CONCURRENCY env var → MAX_SYSTEM_CONCURRENCY (absolute hard cap)',
          'settings.systemMaxConcurrency (UI-configurable system cap)',
          'autoModeByWorktree[projectId::branchName].maxConcurrency (per-project)',
          'settings.maxConcurrency (global default)',
          'DEFAULT_MAX_CONCURRENCY = 1 (code fallback)',
        ],
        caps: {
          envCap,
          configuredSystemMax,
          effectiveSystemCap,
        },
        globalMax,
        loops,
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to retrieve concurrency overview',
      });
    }
  });

  return router;
}
