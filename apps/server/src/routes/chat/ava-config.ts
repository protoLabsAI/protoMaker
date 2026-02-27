/**
 * Ava Configuration — per-project config for Ava chat behaviour
 *
 * AvaConfig controls which capabilities are available, which model is used,
 * and whether contextual data (sitrep, project context) is injected.
 *
 * Stored at {projectPath}/.automaker/ava-config.json.
 * loadAvaConfig returns merged defaults when the file does not exist — no
 * file is written on first load.  saveAvaConfig deep-merges a partial
 * config and persists it.
 */

import path from 'path';
import { createLogger } from '@protolabs-ai/utils';
import { getAutomakerDir, ensureAutomakerDir } from '@protolabs-ai/platform';
import * as secureFs from '../../lib/secure-fs.js';

const logger = createLogger('AvaConfig');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-tool enable/disable flags for Ava.
 * Each key represents a named tool capability.
 */
export interface AvaToolsConfig {
  /** Full-text search across the project knowledge base */
  knowledgeSearch: boolean;
  /** Board / feature read access (list features, check status) */
  readBoard: boolean;
  /** Sitrep generation (generate and display a situation report) */
  sitrep: boolean;
  /** Web search capability */
  webSearch: boolean;
}

/**
 * Ava chat configuration stored per-project.
 */
export interface AvaConfig {
  /** Claude model alias to use for Ava (e.g. "sonnet", "opus", "haiku") */
  model: string;
  /** Per-tool enable/disable flags */
  tools: AvaToolsConfig;
  /** When true, inject a situation report into the system prompt */
  injectSitrep: boolean;
  /** When true, inject project context (CLAUDE.md, context files) into the prompt */
  injectContext: boolean;
  /** Additional text appended to Ava's base system prompt (empty = no extension) */
  systemPromptExtension: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default configuration used when no per-project config file exists.
 * All tools are enabled; model defaults to sonnet.
 */
export const DEFAULT_AVA_CONFIG: AvaConfig = {
  model: 'sonnet',
  tools: {
    knowledgeSearch: true,
    readBoard: true,
    sitrep: true,
    webSearch: true,
  },
  injectSitrep: true,
  injectContext: true,
  systemPromptExtension: '',
};

// ─────────────────────────────────────────────────────────────────────────────
// File path helper
// ─────────────────────────────────────────────────────────────────────────────

function getAvaConfigPath(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'ava-config.json');
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load AvaConfig for a project.
 *
 * Returns DEFAULT_AVA_CONFIG merged with any overrides present in the config
 * file.  If the file does not exist the defaults are returned directly — the
 * function never writes a file.
 *
 * @param projectPath - Absolute path to the project root
 * @returns Resolved AvaConfig (always a complete object)
 */
export async function loadAvaConfig(projectPath: string): Promise<AvaConfig> {
  const configPath = getAvaConfigPath(projectPath);

  try {
    const content = await secureFs.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(content as string) as Partial<AvaConfig>;

    // Deep-merge: tools are merged separately to preserve all default keys
    const mergedTools: AvaToolsConfig = {
      ...DEFAULT_AVA_CONFIG.tools,
      ...(parsed.tools ?? {}),
    };

    const merged: AvaConfig = {
      ...DEFAULT_AVA_CONFIG,
      ...parsed,
      tools: mergedTools,
    };

    logger.debug(`Loaded ava-config from ${configPath}`);
    return merged;
  } catch (error: unknown) {
    // File not found — return defaults without writing anything
    if (isEnoentError(error)) {
      logger.debug(`No ava-config at ${configPath}, using defaults`);
      return { ...DEFAULT_AVA_CONFIG, tools: { ...DEFAULT_AVA_CONFIG.tools } };
    }

    // JSON parse errors or other I/O issues — log and fall back to defaults
    logger.warn(`Failed to read ava-config at ${configPath}, using defaults:`, error);
    return { ...DEFAULT_AVA_CONFIG, tools: { ...DEFAULT_AVA_CONFIG.tools } };
  }
}

/**
 * Save a (partial) AvaConfig for a project.
 *
 * The provided partial config is merged with the current on-disk config (or
 * defaults if the file does not exist) and the result is written to disk.
 *
 * @param projectPath - Absolute path to the project root
 * @param partial     - Partial config overrides to apply
 * @returns The fully-resolved config that was written
 */
export async function saveAvaConfig(
  projectPath: string,
  partial: Partial<AvaConfig>
): Promise<AvaConfig> {
  // Ensure the .automaker directory exists before writing
  await ensureAutomakerDir(projectPath);

  // Load current config (may return defaults if file absent)
  const current = await loadAvaConfig(projectPath);

  // Merge tools separately for deep merge semantics
  const mergedTools: AvaToolsConfig = {
    ...current.tools,
    ...(partial.tools ?? {}),
  };

  const merged: AvaConfig = {
    ...current,
    ...partial,
    tools: mergedTools,
  };

  const configPath = getAvaConfigPath(projectPath);
  await secureFs.writeFile(configPath, JSON.stringify(merged, null, 2), 'utf-8');
  logger.info(`Saved ava-config to ${configPath}`);

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
