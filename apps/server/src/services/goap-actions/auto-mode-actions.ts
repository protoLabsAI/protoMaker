/**
 * Auto-Mode Control Actions
 *
 * Actions for starting and stopping the auto-mode pipeline.
 */

import type { GOAPActionDefinition } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import type { GOAPActionRegistry } from '../goap-action-registry.js';
import type { AutoModeService } from '../auto-mode-service.js';

const logger = createLogger('GOAPActions:AutoMode');

export const START_AUTO_MODE: GOAPActionDefinition = {
  id: 'start_auto_mode',
  name: 'Start Auto-Mode',
  description: 'Start the auto-mode pipeline to begin processing backlog features',
  category: 'auto-mode',
  preconditions: [
    { key: 'has_backlog_work', value: true },
    { key: 'auto_mode_running', value: false },
  ],
  effects: [{ key: 'auto_mode_running', value: true }],
  cost: 1,
};

export const STOP_AUTO_MODE: GOAPActionDefinition = {
  id: 'stop_auto_mode',
  name: 'Stop Auto-Mode',
  description: 'Stop the auto-mode pipeline',
  category: 'auto-mode',
  preconditions: [{ key: 'auto_mode_running', value: true }],
  effects: [{ key: 'auto_mode_running', value: false }],
  cost: 1,
};

export function registerAutoModeActions(
  registry: GOAPActionRegistry,
  autoModeService: AutoModeService
): void {
  registry.register(START_AUTO_MODE, async (projectPath, branchName) => {
    try {
      await autoModeService.startAutoLoopForProject(projectPath, branchName);
      logger.info('Started auto-mode', { projectPath });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('already running')) {
        logger.debug('Auto-mode already running, treating as success', { projectPath });
        return; // Not an error
      }
      throw error;
    }
  });

  registry.register(STOP_AUTO_MODE, async (projectPath, branchName) => {
    await autoModeService.stopAutoLoopForProject(projectPath, branchName);
    logger.info('Stopped auto-mode', { projectPath });
  });
}
