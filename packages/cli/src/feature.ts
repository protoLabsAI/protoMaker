/**
 * protomaker feature
 *
 * Core board commands — list, get, create, update, move features.
 *
 * Usage:
 *   protomaker feature list [options]
 *   protomaker feature get <featureId> [options]
 *   protomaker feature create [options]
 *   protomaker feature update <featureId> [options]
 *   protomaker feature move <featureId> <status> [options]
 */

import { Command } from 'commander';
import { ApiClient } from './api-client.js';
import { output, error, usageError, type GlobalFlags, getOutputMode } from './output.js';
import { resolveApiConfig } from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FeatureStatus = 'backlog' | 'in_progress' | 'review' | 'blocked' | 'done' | 'interrupted';

interface Feature {
  id: string;
  title?: string;
  category: string;
  description: string;
  priority?: 0 | 1 | 2 | 3 | 4;
  status?: FeatureStatus | string;
  dependencies?: string[];
  complexity?: 'small' | 'medium' | 'large' | 'architectural';
  branchName?: string;
  isEpic?: boolean;
  epicId?: string;
  costUsd?: number;
  prNumber?: number;
  prUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  [key: string]: unknown;
}

interface ListResponse {
  success: boolean;
  features: Feature[];
  error?: string;
}

interface GetResponse {
  success: boolean;
  feature?: Feature;
  error?: string;
}

interface CreateResponse {
  success: boolean;
  feature?: Feature;
  error?: string;
}

interface UpdateResponse {
  success: boolean;
  feature?: Feature;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract global flags from Commander opts.
 * Global flags are defined on the root program and inherited by subcommands.
 */
function getGlobalFlags(opts: Record<string, unknown>): GlobalFlags {
  return {
    json: opts.json === true,
    quiet: opts.quiet === true,
    project: (opts.project as string) ?? process.cwd(),
  };
}

/**
 * Create an API client from global flags.
 */
function createClient(flags: GlobalFlags): ApiClient {
  const config = resolveApiConfig(flags.project);
  return new ApiClient(config);
}

/**
 * Format a feature status for display.
 */
function statusBadge(status?: string): string {
  const map: Record<string, string> = {
    backlog: '📋 backlog',
    in_progress: '▶️ in_progress',
    review: '👀 review',
    blocked: '🚫 blocked',
    done: '✅ done',
    interrupted: '⏸️ interrupted',
  };
  return status ? (map[status] ?? status) : '—';
}

/**
 * Format a complexity level for display.
 */
function complexityLabel(complexity?: string): string {
  const map: Record<string, string> = {
    small: 'S',
    medium: 'M',
    large: 'L',
    architectural: 'A',
  };
  return complexity ? (map[complexity] ?? complexity) : '—';
}

/**
 * Render a feature board grouped by status as a text table.
 */
function renderBoard(features: Feature[]): string {
  const statusOrder: FeatureStatus[] = [
    'backlog',
    'in_progress',
    'review',
    'blocked',
    'done',
    'interrupted',
  ];

  // Group by status
  const groups: Record<string, Feature[]> = {};
  for (const f of features) {
    const s = (f.status as string) || 'backlog';
    if (!groups[s]) groups[s] = [];
    groups[s].push(f);
  }

  const lines: string[] = [];
  lines.push('');

  for (const status of statusOrder) {
    const items = groups[status];
    if (!items || items.length === 0) continue;

    lines.push(`── ${status.toUpperCase()} (${items.length}) ──`);

    for (const f of items) {
      const title = f.title || f.id;
      const complexity = complexityLabel(f.complexity);
      const priority = f.priority !== undefined ? `p${f.priority}` : '';
      const parts = [title];
      if (complexity !== '—') parts.push(complexity);
      if (priority) parts.push(priority);
      lines.push(`  • ${parts.join(' ')}`);
    }

    lines.push('');
  }

  // Any statuses not in our known list
  for (const [status, items] of Object.entries(groups)) {
    if (statusOrder.includes(status as FeatureStatus)) continue;
    lines.push(`── ${status.toUpperCase()} (${items.length}) ──`);
    for (const f of items) {
      lines.push(`  • ${f.title || f.id}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Render a single feature in full detail.
 */
function renderFeature(feature: Feature): string {
  const lines: string[] = [];
  lines.push(`ID:          ${feature.id}`);
  lines.push(`Title:       ${feature.title || '—'}`);
  lines.push(`Status:      ${statusBadge(feature.status)}`);
  lines.push(`Category:    ${feature.category || '—'}`);
  lines.push(`Complexity:  ${feature.complexity || '—'}`);
  lines.push(`Priority:    ${feature.priority ?? '—'}`);
  lines.push('');
  lines.push(`Description:`);

  // Wrap description at ~72 chars
  const desc = feature.description || '';
  const wrapped = wrapText(desc, 72);
  lines.push(...wrapped.map((l) => `  ${l}`));

  lines.push('');

  if (feature.branchName) lines.push(`Branch:      ${feature.branchName}`);
  if (feature.epicId) lines.push(`Epic:        ${feature.epicId}`);
  if (feature.isEpic) lines.push(`Is Epic:     true`);
  if (feature.dependencies && feature.dependencies.length > 0)
    lines.push(`Dependencies: ${feature.dependencies.join(', ')}`);
  if (feature.costUsd !== undefined) lines.push(`Cost:        $${feature.costUsd.toFixed(4)}`);
  if (feature.prNumber) lines.push(`PR:          #${feature.prNumber}`);
  if (feature.prUrl) lines.push(`PR URL:      ${feature.prUrl}`);
  if (feature.createdAt) lines.push(`Created:     ${feature.createdAt}`);
  if (feature.updatedAt) lines.push(`Updated:     ${feature.updatedAt}`);
  if (feature.completedAt) lines.push(`Completed:   ${feature.completedAt}`);

  return lines.join('\n');
}

/**
 * Wrap text to a given line width.
 */
function wrapText(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if ((current + ' ' + word).trim().length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Validate that a status value is known.
 */
function validateStatus(status: string): FeatureStatus {
  const valid: FeatureStatus[] = [
    'backlog',
    'in_progress',
    'review',
    'blocked',
    'done',
    'interrupted',
  ];
  if (!valid.includes(status as FeatureStatus)) {
    usageError(`Invalid status "${status}". Must be one of: ${valid.join(', ')}`);
  }
  return status as FeatureStatus;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * protomaker feature list
 *
 * List all features grouped by status (board view).
 * With --json, output raw JSON array.
 */
export function listCommand(parent: Command): void {
  const cmd = new Command('list');
  cmd.description('List all features grouped by status (board view)');
  cmd.option('--status <status>', 'Filter by status');
  cmd.option('--compact', 'Show compact one-line format (text mode)');

  cmd.action(async (opts) => {
    const flags = getGlobalFlags(cmd.optsWithGlobals());
    const client = createClient(flags);
    const body: Record<string, unknown> = { projectPath: flags.project };
    if (opts.status) body.status = opts.status;
    if (opts.compact && getOutputMode(flags) !== 'json') body.compact = true;

    const result = await client.post<ListResponse>('/features/list', body);

    if (!result.ok) {
      error(result.error || 'Failed to list features');
      process.exit(1);
      return;
    }

    const features = result.data?.features ?? [];

    if (getOutputMode(flags) === 'json') {
      output(features, flags);
    } else if (opts.compact) {
      // Compact one-line format
      const lines = features.map(
        (f) =>
          `${f.id}\t${statusBadge(f.status)}\t${complexityLabel(f.complexity)}\t${f.title || ''}`
      );
      output(lines.join('\n'), flags);
    } else {
      output(renderBoard(features), flags);
    }
  });

  parent.addCommand(cmd);
}

/**
 * protomaker feature get <featureId>
 *
 * Show full feature details.
 * With --json, output raw JSON.
 */
export function getCommand(parent: Command): void {
  const cmd = new Command('get').arguments('<featureId>');
  cmd.description('Show full feature details');

  cmd.action(async (featureId: string, opts) => {
    const flags = getGlobalFlags(cmd.optsWithGlobals());
    const client = createClient(flags);

    const result = await client.post<GetResponse>('/features/get', {
      projectPath: flags.project,
      featureId,
    });

    if (!result.ok) {
      error(result.error || `Failed to get feature "${featureId}"`);
      process.exit(1);
      return;
    }

    const feature = result.data?.feature;
    if (!feature) {
      error(`Feature "${featureId}" not found`);
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output(feature, flags);
    } else {
      output(renderFeature(feature), flags);
    }
  });

  parent.addCommand(cmd);
}

/**
 * protomaker feature create
 *
 * Create a new feature. Returns the new feature id.
 *
 * Required: --description
 * Optional: --title, --category, --complexity, --priority, --epic-id
 */
export function createCommand(parent: Command): void {
  const cmd = new Command('create');
  cmd.description('Create a new feature');
  cmd.requiredOption('--description <text>', 'Feature description');
  cmd.option('--title <text>', 'Feature title');
  cmd.option('--category <text>', 'Feature category', 'feature');
  cmd.option('--complexity <level>', 'Complexity level (small|medium|large|architectural)');
  cmd.option('--priority <n>', 'Priority (1=urgent, 2=high, 3=normal, 4=low)');
  cmd.option('--epic-id <id>', 'Parent epic ID');
  cmd.option('--is-epic', 'Mark as epic container');
  cmd.option('--execution-mode <mode>', 'Execution mode (standard|read-only)');
  cmd.option('--workflow <name>', 'Workflow name (e.g. standard, audit, research, postmortem)');

  cmd.action(async (opts) => {
    const flags = getGlobalFlags(cmd.optsWithGlobals());
    const client = createClient(flags);

    const feature: Record<string, unknown> = {
      description: opts.description,
      category: opts.category,
    };

    if (opts.title) feature.title = opts.title;
    if (opts.complexity) feature.complexity = opts.complexity;
    if (opts.priority) {
      const p = parseInt(opts.priority, 10);
      if (![1, 2, 3, 4].includes(p)) {
        usageError('Priority must be 1, 2, 3, or 4');
      }
      feature.priority = p;
    }
    if (opts.epicId) feature.epicId = opts.epicId;
    if (opts.isEpic) feature.isEpic = true;
    if (opts.executionMode) {
      if (!['standard', 'read-only'].includes(opts.executionMode)) {
        usageError("Execution mode must be 'standard' or 'read-only'");
      }
      feature.executionMode = opts.executionMode;
    }
    if (opts.workflow) feature.workflow = opts.workflow;

    const result = await client.post<CreateResponse>('/features/create', {
      projectPath: flags.project,
      feature,
    });

    if (!result.ok) {
      error(result.error || 'Failed to create feature');
      process.exit(1);
      return;
    }

    const created = result.data?.feature;
    if (!created) {
      error('No feature returned from server');
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output(created, flags);
    } else {
      output(`Created feature: ${created.id}`, flags);
    }
  });

  parent.addCommand(cmd);
}

/**
 * protomaker feature update <featureId>
 *
 * Update a feature's fields.
 *
 * Options: --title, --description, --category, --complexity, --priority
 */
export function updateCommand(parent: Command): void {
  const cmd = new Command('update').arguments('<featureId>');
  cmd.description('Update a feature');
  cmd.option('--title <text>', 'New title');
  cmd.option('--description <text>', 'New description');
  cmd.option('--category <text>', 'New category');
  cmd.option('--complexity <level>', 'New complexity level (small|medium|large|architectural)');
  cmd.option('--priority <n>', 'New priority (1=urgent, 2=high, 3=normal, 4=low)');
  cmd.option(
    '--depends-on <ids>',
    'Comma-separated feature IDs this feature depends on (replaces the existing dependency list)'
  );
  cmd.option('--clear-deps', 'Clear all dependencies on this feature');

  cmd.action(async (featureId: string, opts) => {
    const flags = getGlobalFlags(cmd.optsWithGlobals());
    const updates: Record<string, unknown> = {};

    if (opts.title !== undefined) updates.title = opts.title;
    if (opts.description !== undefined) updates.description = opts.description;
    if (opts.category !== undefined) updates.category = opts.category;
    if (opts.complexity !== undefined) updates.complexity = opts.complexity;
    if (opts.priority !== undefined) {
      const p = parseInt(opts.priority, 10);
      if (![1, 2, 3, 4].includes(p)) {
        usageError('Priority must be 1, 2, 3, or 4');
      }
      updates.priority = p;
    }

    if (opts.dependsOn !== undefined && opts.clearDeps) {
      usageError('Use either --depends-on or --clear-deps, not both');
    }
    if (opts.clearDeps) {
      updates.dependencies = [];
    } else if (opts.dependsOn !== undefined) {
      const deps = String(opts.dependsOn)
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      if (deps.includes(featureId)) {
        usageError('A feature cannot depend on itself');
      }
      updates.dependencies = deps;
    }

    if (Object.keys(updates).length === 0) {
      usageError(
        'At least one update option is required (--title, --description, --category, --complexity, --priority, --depends-on, --clear-deps)'
      );
    }

    const client = createClient(flags);

    const result = await client.post<UpdateResponse>('/features/update', {
      projectPath: flags.project,
      featureId,
      updates,
    });

    if (!result.ok) {
      error(result.error || `Failed to update feature "${featureId}"`);
      process.exit(1);
      return;
    }

    const updated = result.data?.feature;
    if (!updated) {
      error('No feature returned from server');
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output(updated, flags);
    } else {
      output(`Updated feature: ${featureId}`, flags);
    }
  });

  parent.addCommand(cmd);
}

/**
 * protomaker feature move <featureId> <status>
 *
 * Transition a feature to a new status.
 *
 * Valid statuses: backlog, in_progress, review, blocked, done, interrupted
 */
export function moveCommand(parent: Command): void {
  const cmd = new Command('move').arguments('<featureId> <status>');
  cmd.description('Transition a feature to a new status');
  cmd.option('--reason <text>', 'Reason for status change (required when blocking)');

  cmd.action(async (featureId: string, statusArg: string, opts) => {
    const flags = getGlobalFlags(cmd.optsWithGlobals());
    const status = validateStatus(statusArg);

    const updates: Record<string, unknown> = { status };
    if (opts.reason) updates.statusChangeReason = opts.reason;

    const client = createClient(flags);

    const result = await client.post<UpdateResponse>('/features/update', {
      projectPath: flags.project,
      featureId,
      updates,
    });

    if (!result.ok) {
      error(result.error || `Failed to move feature "${featureId}" to "${status}"`);
      process.exit(1);
      return;
    }

    const updated = result.data?.feature;
    if (!updated) {
      error('No feature returned from server');
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output(updated, flags);
    } else {
      output(`Moved "${featureId}" → ${status}`, flags);
    }
  });

  parent.addCommand(cmd);
}
