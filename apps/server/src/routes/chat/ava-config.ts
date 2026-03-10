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
import { createLogger } from '@protolabsai/utils';
import { getAutomakerDir, ensureAutomakerDir } from '@protolabsai/platform';
import * as secureFs from '../../lib/secure-fs.js';
import type { MCPServerConfig } from '@protolabsai/types';
import type { AvaToolsConfig } from './ava-tools.js';

export type { AvaToolsConfig };

const logger = createLogger('AvaConfig');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ava chat configuration stored per-project.
 *
 * Field names intentionally match the frontend AvaConfig in ava-client.ts
 * so the /api/ava/config endpoints can pass through without transformation.
 */
export interface AvaConfig {
  /** Claude model alias to use for Ava ("haiku" | "sonnet" | "opus") */
  model: 'haiku' | 'sonnet' | 'opus';
  /** Per-tool-group enable/disable flags */
  toolGroups: AvaToolsConfig;
  /** When true, inject a live situation report into the system prompt */
  sitrepInjection: boolean;
  /** When true, inject project context (CLAUDE.md, context files) into the prompt */
  contextInjection: boolean;
  /** Additional text appended to Ava's base system prompt (empty = no extension) */
  systemPromptExtension: string;
  /** When true, destructive tools execute immediately without HITL confirmation */
  autoApproveTools: boolean;
  /** MCP servers available to Ava and delegated inner agents */
  mcpServers?: MCPServerConfig[];
  /**
   * Trust level for subagent tool execution.
   * - 'full': Subagents run with bypassPermissions (fully autonomous).
   * - 'gated': Each tool call requires approval via the event-based approval flow.
   * Defaults to 'full'.
   */
  subagentTrust: 'full' | 'gated';
}

// ─────────────────────────────────────────────────────────────────────────────
// Defaults
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default configuration used when no per-project config file exists.
 *
 * Enabled by default (~20 tools): briefing, health, notes, calendar, discord,
 * avaChannel, metrics, settings, delegation, boardRead.
 *
 * Disabled by default (project-tactical): boardWrite, agentControl, autoMode,
 * prWorkflow, promotion, contextFiles, orchestration, projectMgmt,
 * agentDelegation, projects.
 *
 * Any group can be re-enabled via .automaker/ava-config.json.
 */
export const DEFAULT_AVA_CONFIG: AvaConfig = {
  model: 'sonnet',
  toolGroups: {
    // ── Always-on: oversight & communication ──────────────────────────────
    boardRead: true,
    briefing: true,
    health: true,
    notes: true,
    calendar: true,
    discord: true,
    avaChannel: true,
    metrics: true,
    settings: true,
    delegation: true,
    // ── Off by default: project-tactical (re-enable via ava-config.json) ──
    boardWrite: false,
    agentControl: false,
    autoMode: false,
    prWorkflow: false,
    promotion: false,
    contextFiles: false,
    orchestration: false,
    projectMgmt: false,
    agentDelegation: false,
    projects: false,
  },
  sitrepInjection: true,
  contextInjection: true,
  systemPromptExtension: '',
  autoApproveTools: false,
  mcpServers: [],
  subagentTrust: 'full',
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

    // Deep-merge: toolGroups are merged separately to preserve all default keys
    const mergedToolGroups: AvaToolsConfig = {
      ...DEFAULT_AVA_CONFIG.toolGroups,
      ...(parsed.toolGroups ?? {}),
    };

    const merged: AvaConfig = {
      ...DEFAULT_AVA_CONFIG,
      ...parsed,
      toolGroups: mergedToolGroups,
    };

    logger.debug(`Loaded ava-config from ${configPath}`);
    return merged;
  } catch (error: unknown) {
    // File not found — return defaults without writing anything
    if (isEnoentError(error)) {
      logger.debug(`No ava-config at ${configPath}, using defaults`);
      return { ...DEFAULT_AVA_CONFIG, toolGroups: { ...DEFAULT_AVA_CONFIG.toolGroups } };
    }

    // JSON parse errors or other I/O issues — log and fall back to defaults
    logger.warn(`Failed to read ava-config at ${configPath}, using defaults:`, error);
    return { ...DEFAULT_AVA_CONFIG, toolGroups: { ...DEFAULT_AVA_CONFIG.toolGroups } };
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

  // Merge toolGroups separately for deep merge semantics
  const mergedToolGroups: AvaToolsConfig = {
    ...current.toolGroups,
    ...(partial.toolGroups ?? {}),
  };

  const merged: AvaConfig = {
    ...current,
    ...partial,
    toolGroups: mergedToolGroups,
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
