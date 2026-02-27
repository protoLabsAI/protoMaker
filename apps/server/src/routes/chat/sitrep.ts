/**
 * Sitrep — Situation Report generator for Ava
 *
 * getSitrep() produces a markdown situation report containing:
 *   - Board counts by status (backlog / in_progress / review / done / blocked / interrupted)
 *   - List of features currently in_progress or review
 *   - Running agent feature IDs (from the persisted execution state)
 *   - Auto-mode enabled / disabled status
 *
 * Results are cached per-projectPath with a 5-minute TTL.
 * invalidateSitrep() clears the cache entry for a given projectPath immediately.
 */

import { createLogger } from '@protolabs-ai/utils';
import { getExecutionStatePath } from '@protolabs-ai/platform';
import type { ExecutionState, Feature } from '@protolabs-ai/types';
import { FeatureLoader } from '../../services/feature-loader.js';
import * as secureFs from '../../lib/secure-fs.js';

const logger = createLogger('Sitrep');

// ─────────────────────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────────────────────

interface SitrepCacheEntry {
  markdown: string;
  /** Unix timestamp (ms) when the entry was populated */
  cachedAt: number;
}

/** Module-level cache keyed by projectPath */
const cache = new Map<string, SitrepCacheEntry>();

/** TTL: 5 minutes */
const TTL_MS = 5 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Attempt to load the persisted execution state for a project.
 * Returns null when the file does not exist or cannot be parsed.
 */
async function loadExecutionState(projectPath: string): Promise<ExecutionState | null> {
  try {
    const statePath = getExecutionStatePath(projectPath);
    const content = await secureFs.readFile(statePath, 'utf-8');
    return JSON.parse(content as string) as ExecutionState;
  } catch {
    // File absent or corrupt — not a fatal error
    return null;
  }
}

/**
 * Build the markdown situation report string.
 */
async function buildSitrep(projectPath: string): Promise<string> {
  // ── 1. Load features ──────────────────────────────────────────────────────
  const loader = new FeatureLoader();
  let features: Feature[] = [];

  try {
    features = await loader.getAll(projectPath);
  } catch (error) {
    logger.warn(`Failed to load features for sitrep (${projectPath}):`, error);
  }

  // ── 2. Board counts by status ─────────────────────────────────────────────
  type StatusKey = 'backlog' | 'in_progress' | 'review' | 'done' | 'blocked' | 'interrupted';

  const counts: Record<StatusKey, number> = {
    backlog: 0,
    in_progress: 0,
    review: 0,
    done: 0,
    blocked: 0,
    interrupted: 0,
  };

  for (const feature of features) {
    const s = feature.status as string;
    if (s && s in counts) {
      counts[s as StatusKey]++;
    }
  }

  // ── 3. Active features (in_progress + review) ─────────────────────────────
  const activeFeatures = features.filter(
    (f) => f.status === 'in_progress' || f.status === 'review'
  );

  // ── 4. Running agents + auto-mode from execution state ────────────────────
  const executionState = await loadExecutionState(projectPath);
  const runningFeatureIds: string[] = executionState?.runningFeatureIds ?? [];
  const autoModeActive: boolean = executionState?.autoLoopWasRunning ?? false;

  // ── 5. Compose markdown ───────────────────────────────────────────────────
  const lines: string[] = [];

  lines.push('# Situation Report');
  lines.push('');

  // Board counts table
  lines.push('## Board');
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('|--------|------:|');
  lines.push(`| Backlog | ${counts.backlog} |`);
  lines.push(`| In Progress | ${counts.in_progress} |`);
  lines.push(`| Review | ${counts.review} |`);
  lines.push(`| Done | ${counts.done} |`);
  if (counts.blocked > 0) {
    lines.push(`| Blocked | ${counts.blocked} |`);
  }
  if (counts.interrupted > 0) {
    lines.push(`| Interrupted | ${counts.interrupted} |`);
  }
  lines.push('');

  // In-progress / review feature list
  lines.push('## Active Features');
  lines.push('');
  if (activeFeatures.length === 0) {
    lines.push('_No features currently in progress or review._');
  } else {
    for (const feature of activeFeatures) {
      const statusLabel = feature.status === 'in_progress' ? '🔄 In Progress' : '👀 Review';
      const title = feature.title ?? feature.id;
      lines.push(`- **${title}** — ${statusLabel}`);
    }
  }
  lines.push('');

  // Running agents
  lines.push('## Running Agents');
  lines.push('');
  if (runningFeatureIds.length === 0) {
    lines.push('_No agents currently running._');
  } else {
    for (const featureId of runningFeatureIds) {
      const feature = features.find((f) => f.id === featureId);
      const title = feature?.title ?? featureId;
      lines.push(`- **${title}** (\`${featureId}\`)`);
    }
  }
  lines.push('');

  // Auto-mode status
  lines.push('## Auto-Mode');
  lines.push('');
  lines.push(`**Status:** ${autoModeActive ? '🟢 Running' : '⚪ Stopped'}`);

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return a markdown situation report for the given project.
 *
 * Results are cached per-projectPath with a 5-minute TTL.
 *
 * @param projectPath - Absolute path to the project root
 * @returns Markdown string
 */
export async function getSitrep(projectPath: string): Promise<string> {
  const now = Date.now();
  const cached = cache.get(projectPath);

  if (cached !== undefined && now - cached.cachedAt < TTL_MS) {
    logger.debug(`Sitrep cache hit for ${projectPath}`);
    return cached.markdown;
  }

  logger.debug(`Generating sitrep for ${projectPath}`);
  const markdown = await buildSitrep(projectPath);

  cache.set(projectPath, { markdown, cachedAt: now });
  return markdown;
}

/**
 * Invalidate (clear) the cached sitrep for a project.
 *
 * Call this whenever features or auto-mode state change so the next
 * getSitrep() call returns fresh data.
 *
 * @param projectPath - Absolute path to the project root
 */
export function invalidateSitrep(projectPath: string): void {
  const had = cache.delete(projectPath);
  if (had) {
    logger.debug(`Invalidated sitrep cache for ${projectPath}`);
  }
}
