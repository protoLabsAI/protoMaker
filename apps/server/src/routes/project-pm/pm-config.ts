/**
 * PM Configuration — per-project config for PM chat behaviour
 *
 * PMConfig controls which tool groups are available to the Project PM agent.
 *
 * Stored at {projectPath}/.automaker/pm-config.json.
 * loadPMConfig returns merged defaults when the file does not exist.
 * savePMConfig deep-merges a partial config and persists it.
 */

import path from 'path';
import { createLogger } from '@protolabsai/utils';
import { getAutomakerDir, ensureAutomakerDir } from '@protolabsai/platform';
import * as secureFs from '../../lib/secure-fs.js';
import type { PMToolsConfig } from './pm-tools.js';

export type { PMToolsConfig };

const logger = createLogger('PMConfig');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PM chat configuration stored per-project.
 */
export interface PMConfig {
  /** Per-tool-group enable/disable flags */
  toolGroups: PMToolsConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default configuration — all tool groups enabled.
 */
export const DEFAULT_PM_CONFIG: PMConfig = {
  toolGroups: {
    boardRead: true,
    boardWrite: true,
    agentControl: true,
    prWorkflow: true,
    orchestration: true,
    contextFiles: true,
    leadEngineer: true,
    projectMgmt: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// File path helper
// ─────────────────────────────────────────────────────────────────────────────

function getPMConfigPath(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'pm-config.json');
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load PMConfig for a project.
 *
 * Returns DEFAULT_PM_CONFIG merged with any overrides present in the config
 * file. If the file does not exist the defaults are returned directly.
 */
export async function loadPMConfig(projectPath: string): Promise<PMConfig> {
  const configPath = getPMConfigPath(projectPath);

  try {
    const content = await secureFs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content as string) as Partial<PMConfig>;

    const mergedToolGroups: PMToolsConfig = {
      ...DEFAULT_PM_CONFIG.toolGroups,
      ...(parsed.toolGroups ?? {}),
    };

    const merged: PMConfig = {
      ...DEFAULT_PM_CONFIG,
      ...parsed,
      toolGroups: mergedToolGroups,
    };

    logger.debug(`Loaded pm-config from ${configPath}`);
    return merged;
  } catch (error: unknown) {
    if (isEnoentError(error)) {
      logger.debug(`No pm-config at ${configPath}, using defaults`);
      return { ...DEFAULT_PM_CONFIG, toolGroups: { ...DEFAULT_PM_CONFIG.toolGroups } };
    }

    logger.warn(`Failed to read pm-config at ${configPath}, using defaults:`, error);
    return { ...DEFAULT_PM_CONFIG, toolGroups: { ...DEFAULT_PM_CONFIG.toolGroups } };
  }
}

/**
 * Save a (partial) PMConfig for a project.
 *
 * The provided partial config is merged with the current on-disk config (or
 * defaults if the file does not exist) and the result is written to disk.
 */
export async function savePMConfig(
  projectPath: string,
  partial: Partial<PMConfig>
): Promise<PMConfig> {
  await ensureAutomakerDir(projectPath);

  const current = await loadPMConfig(projectPath);

  const mergedToolGroups: PMToolsConfig = {
    ...current.toolGroups,
    ...(partial.toolGroups ?? {}),
  };

  const merged: PMConfig = {
    ...current,
    ...partial,
    toolGroups: mergedToolGroups,
  };

  const configPath = getPMConfigPath(projectPath);
  await secureFs.writeFile(configPath, JSON.stringify(merged, null, 2), 'utf-8');
  logger.info(`Saved pm-config to ${configPath}`);

  return merged;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function isEnoentError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
