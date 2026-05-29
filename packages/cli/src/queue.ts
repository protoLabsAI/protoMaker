/**
 * protomaker queue
 *
 * Queue management commands — add, list, clear features in the execution queue.
 *
 * Usage:
 *   protomaker queue add <featureId> [options]
 *   protomaker queue list [options]
 *   protomaker queue clear [options]
 */

import { Command } from 'commander';
import { ApiClient } from './api-client.js';
import { output, error, usageError, type GlobalFlags, getOutputMode } from './output.js';
import { resolveApiConfig } from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueueFeature {
  id: string;
  title?: string;
  status?: string;
  complexity?: string;
  priority?: number;
  [key: string]: unknown;
}

interface QueueAddResponse {
  success: boolean;
  feature?: QueueFeature;
  error?: string;
}

interface QueueListResponse {
  success: boolean;
  features: QueueFeature[];
  error?: string;
}

interface QueueClearResponse {
  success: boolean;
  clearedCount?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGlobalFlags(opts: Record<string, unknown>): GlobalFlags {
  return {
    json: opts.json === true,
    quiet: opts.quiet === true,
    project: (opts.project as string) ?? process.cwd(),
  };
}

function createClient(flags: GlobalFlags): ApiClient {
  const config = resolveApiConfig(flags.project);
  return new ApiClient(config);
}

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

function complexityLabel(complexity?: string): string {
  const map: Record<string, string> = {
    small: 'S',
    medium: 'M',
    large: 'L',
    architectural: 'A',
  };
  return complexity ? (map[complexity] ?? complexity) : '—';
}

function renderQueueList(features: QueueFeature[]): string {
  if (features.length === 0) {
    return 'Queue is empty.';
  }

  const lines: string[] = [];
  lines.push('');
  lines.push(`Queue (${features.length} feature${features.length === 1 ? '' : 's'}):`);
  lines.push('');

  for (const f of features) {
    const title = f.title || f.id;
    const complexity = complexityLabel(f.complexity);
    const priority = f.priority !== undefined ? `p${f.priority}` : '';
    const status = statusBadge(f.status);
    const parts = [title];
    if (complexity !== '—') parts.push(complexity);
    if (priority) parts.push(priority);
    lines.push(`  • ${f.id} — ${parts.join(' ')} ${status}`);
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * protomaker queue add <featureId>
 *
 * Add a feature to the execution queue (transition to backlog status).
 */
export function addCommand(parent: Command): void {
  const cmd = new Command('add').arguments('<featureId>');
  cmd.description('Add a feature to the execution queue');

  cmd.action(async (featureId: string, opts) => {
    const flags = getGlobalFlags(cmd.optsWithGlobals());
    const client = createClient(flags);

    const result = await client.post<QueueAddResponse>('/features/update', {
      projectPath: flags.project,
      featureId,
      updates: { status: 'backlog' },
    });

    if (!result.ok) {
      error(result.error || `Failed to add feature "${featureId}" to queue`);
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output({ success: true, featureId, status: 'backlog' }, flags);
    } else {
      output(`Added "${featureId}" to the queue`, flags);
    }
  });

  parent.addCommand(cmd);
}

/**
 * protomaker queue list
 *
 * List features in the execution queue (backlog status).
 */
export function listCommand(parent: Command): void {
  const cmd = new Command('list');
  cmd.description('List features in the execution queue');

  cmd.action(async (opts) => {
    const flags = getGlobalFlags(cmd.optsWithGlobals());
    const client = createClient(flags);

    const result = await client.post<QueueListResponse>('/features/list', {
      projectPath: flags.project,
      status: 'backlog',
    });

    if (!result.ok) {
      error(result.error || 'Failed to list queue');
      process.exit(1);
      return;
    }

    const features = result.data?.features ?? [];

    if (getOutputMode(flags) === 'json') {
      output(features, flags);
    } else {
      output(renderQueueList(features), flags);
    }
  });

  parent.addCommand(cmd);
}

/**
 * protomaker queue clear
 *
 * Clear all features from the execution queue (delete backlog features).
 */
export function clearCommand(parent: Command): void {
  const cmd = new Command('clear');
  cmd.description('Clear all features from the execution queue');
  cmd.option('--yes', 'Skip confirmation prompt');

  cmd.action(async (opts) => {
    const flags = getGlobalFlags(cmd.optsWithGlobals());

    if (!opts.yes) {
      // Read confirmation from stdin
      const readline = await import('node:readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question(
          'Clearing the queue permanently deletes every backlog (queued) feature. This cannot be undone. Continue? (y/N) ',
          (a) => {
            rl.close();
            resolve(a.trim().toLowerCase());
          }
        );
      });

      if (answer !== 'y' && answer !== 'yes') {
        output('Cancelled.', flags);
        return;
      }
    }

    const client = createClient(flags);

    // First, get all backlog features
    const listResult = await client.post<QueueListResponse>('/features/list', {
      projectPath: flags.project,
      status: 'backlog',
    });

    if (!listResult.ok) {
      error(listResult.error || 'Failed to list queue');
      process.exit(1);
      return;
    }

    const features = listResult.data?.features ?? [];

    if (features.length === 0) {
      if (getOutputMode(flags) === 'json') {
        output({ success: true, clearedCount: 0 }, flags);
      } else {
        output('Queue is already empty.', flags);
      }
      return;
    }

    // Delete all backlog features
    const featureIds = features.map((f) => f.id);
    const deleteResult = await client.post<QueueClearResponse>('/features/bulk-delete', {
      projectPath: flags.project,
      featureIds,
    });

    if (!deleteResult.ok) {
      error(deleteResult.error || 'Failed to clear queue');
      process.exit(1);
      return;
    }

    const clearedCount = (deleteResult.data as any)?.deletedCount ?? featureIds.length;

    if (getOutputMode(flags) === 'json') {
      output({ success: true, clearedCount }, flags);
    } else {
      output(
        `Cleared ${clearedCount} feature${clearedCount === 1 ? '' : 's'} from the queue`,
        flags
      );
    }
  });

  parent.addCommand(cmd);
}
