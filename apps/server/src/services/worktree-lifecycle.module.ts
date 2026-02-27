import { createLogger } from '@protolabs-ai/utils';

import type { ServiceContainer } from '../server/services.js';

const logger = createLogger('Server:Wiring');

/** Constant: 5-minute drift detection interval */
const DRIFT_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Wires worktree lifecycle service and sets up periodic drift detection.
 */
export function register(container: ServiceContainer): void {
  const { repoRoot, worktreeLifecycleService, githubStateChecker, reconciliationService } =
    container;

  // Worktree Lifecycle Service initialization
  worktreeLifecycleService.initialize();

  // Drift detection setup
  githubStateChecker.registerProject(repoRoot);

  // Periodic drift detection: check every 5 minutes, reconcile any drifts found
  container.driftCheckInterval = setInterval(async () => {
    try {
      const drifts = await githubStateChecker.checkAllProjects();
      for (const drift of drifts) {
        await reconciliationService.reconcile(drift);
      }
    } catch (err) {
      logger.warn('Drift detection cycle failed:', err);
    }
  }, DRIFT_CHECK_INTERVAL_MS);

  // Prune phantom worktrees on startup
  worktreeLifecycleService.prunePhantomWorktrees(repoRoot).catch((err: unknown) => {
    logger.warn('Failed to prune phantom worktrees on startup:', err);
  });
}
