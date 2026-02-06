/**
 * Maintenance Actions
 *
 * Low-priority actions for idle logging and ensuring agents pick up work.
 */

import type { GOAPActionDefinition } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import type { GOAPActionRegistry } from '../goap-action-registry.js';
import type { AutoModeService } from '../auto-mode-service.js';

const logger = createLogger('GOAPActions:Maintenance');

export const LOG_IDLE: GOAPActionDefinition = {
  id: 'log_idle',
  name: 'Log Idle',
  description: 'System is idle — log the state for observability',
  category: 'maintenance',
  preconditions: [{ key: 'is_idle', value: true }],
  effects: [], // No state change — observability only
  cost: 0,
};

export const ENSURE_AUTO_MODE_IF_WORK: GOAPActionDefinition = {
  id: 'ensure_auto_mode_if_work',
  name: 'Ensure Agents Picking Up Work',
  description: 'Auto-mode is running with backlog work but no agents active — nudge the system',
  category: 'maintenance',
  preconditions: [
    { key: 'has_backlog_work', value: true },
    { key: 'auto_mode_running', value: true },
    { key: 'agents_running', value: 0 },
  ],
  effects: [{ key: 'agents_picking_up_work', value: true }],
  cost: 2,
};

export function registerMaintenanceActions(
  registry: GOAPActionRegistry,
  autoModeService: AutoModeService
): void {
  registry.register(LOG_IDLE, async (projectPath) => {
    logger.debug('System is idle, nothing to do', { projectPath });
  });

  registry.register(ENSURE_AUTO_MODE_IF_WORK, async (projectPath, branchName) => {
    // Auto-mode is running but agents aren't picking up work.
    // This could happen if auto-mode loop is stalled. Restart it.
    try {
      await autoModeService.stopAutoLoopForProject(projectPath, branchName);
    } catch {
      // May not be running
    }
    try {
      await autoModeService.startAutoLoopForProject(projectPath, branchName);
      logger.info('Restarted auto-mode to nudge agent pickup', { projectPath });
    } catch (err) {
      logger.error('Failed to restart auto-mode after stop', { projectPath, error: err });
      throw err; // Surface the failure so GOAP knows the action failed
    }
  });
}
