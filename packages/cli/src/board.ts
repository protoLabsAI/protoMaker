/**
 * protomaker board
 *
 * Print a per-status summary of the feature board.
 *
 * Usage:
 *   protomaker board [options]
 *   protomaker board --json
 */

import { Command } from 'commander';
import { ApiClient } from './api-client.js';
import { output, error, type GlobalFlags, getOutputMode } from './output.js';
import { resolveApiConfig } from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WipLaneSaturation {
  count: number;
  limit: number;
  ratio: number;
  overLimit: boolean;
}

interface WipSaturation {
  in_progress: WipLaneSaturation;
  review: WipLaneSaturation;
  overallSaturation: number;
}

interface BoardSummaryData {
  total: number;
  backlog: number;
  inProgress: number;
  review: number;
  blocked: number;
  done: number;
  verified: number;
  wipSaturation: WipSaturation;
}

interface SummaryResponse {
  success: boolean;
  summary?: BoardSummaryData;
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

/**
 * Render a text summary table from board summary data.
 */
function renderSummary(summary: BoardSummaryData): string {
  const wip = summary.wipSaturation;

  const rows: string[][] = [
    ['Status', 'Count', 'WIP Limit'],
    ['─'.repeat(12), '─'.repeat(5), '─'.repeat(9)],
    ['backlog', String(summary.backlog), ''],
    ['in_progress', String(summary.inProgress), String(wip.in_progress.limit)],
    ['review', String(summary.review), String(wip.review.limit)],
    ['blocked', String(summary.blocked), ''],
    ['done', String(summary.done), ''],
  ];

  if (summary.verified > 0) {
    rows.push(['verified', String(summary.verified), '']);
  }

  rows.push(['', '', '']);
  rows.push(['TOTAL', String(summary.total), '']);

  // Pad columns
  const col0 = Math.max(...rows.map((r) => r[0].length));
  const col1 = Math.max(...rows.map((r) => r[1].length));
  const col2 = Math.max(...rows.map((r) => r[2].length));

  const lines = rows.map(([a, b, c]) => `${a.padEnd(col0)}  ${b.padEnd(col1)}  ${c.padEnd(col2)}`);

  const result = ['', `Board Summary (${summary.total} total)`, '─'.repeat(40), ...lines, ''];

  // WIP saturation warnings
  if (wip.in_progress.overLimit) {
    result.push(`⚠ in_progress WIP exceeded: ${wip.in_progress.count}/${wip.in_progress.limit}`);
  }
  if (wip.review.overLimit) {
    result.push(`⚠ review WIP exceeded: ${wip.review.count}/${wip.review.limit}`);
  }

  if (wip.in_progress.overLimit || wip.review.overLimit) {
    result.push('');
  }

  return result.join('\n');
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/**
 * protomaker board
 *
 * Print a per-status summary.  With --json, output raw JSON.
 */
export function boardCommand(parent: Command): void {
  const cmd = new Command('board');
  cmd.description('Print a per-status summary of the feature board');

  cmd.action(async (opts) => {
    const flags = getGlobalFlags(opts);
    const client = createClient(flags);

    const result = await client.post<SummaryResponse>('/features/summary', {
      projectPath: flags.project,
    });

    if (!result.ok) {
      error(result.error || 'Failed to fetch board summary');
      process.exit(1);
      return;
    }

    const summary = result.data?.summary;
    if (!summary) {
      error('No summary data returned from server');
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output(summary, flags);
    } else {
      output(renderSummary(summary), flags);
    }
  });

  parent.addCommand(cmd);
}

/**
 * protomaker query
 *
 * Query features with compound filters: status, category, assignee.
 *
 * Usage:
 *   protomaker query [options]
 *   protomaker query --status backlog --category feature
 *   protomaker query --assignee agent --json
 */
export function queryCommand(parent: Command): void {
  const cmd = new Command('query');
  cmd.description('Query features with compound filters');
  cmd.option('--status <status>', 'Filter by status (backlog, in_progress, review, blocked, done)');
  cmd.option('--category <category>', 'Filter by category');
  cmd.option('--assignee <assignee>', 'Filter by assignee');

  cmd.action(async (opts) => {
    const flags = getGlobalFlags(opts);
    const client = createClient(flags);

    const body: Record<string, unknown> = {
      projectPath: flags.project,
    };
    if (opts.status) body.status = opts.status;
    if (opts.category) body.category = opts.category;
    if (opts.assignee !== undefined) body.assignee = opts.assignee;

    const result = await client.post<{
      success: boolean;
      features?: any[];
      count?: number;
      error?: string;
    }>('/features/query', body);

    if (!result.ok) {
      error(result.error || 'Failed to query features');
      process.exit(1);
      return;
    }

    const features = result.data?.features ?? [];
    const count = result.data?.count ?? features.length;

    if (getOutputMode(flags) === 'json') {
      output({ features, count }, flags);
    } else {
      // Human-readable output
      const filterParts: string[] = [];
      if (opts.status) filterParts.push(`status=${opts.status}`);
      if (opts.category) filterParts.push(`category=${opts.category}`);
      if (opts.assignee !== undefined) filterParts.push(`assignee=${opts.assignee}`);

      const filterLine = filterParts.length
        ? `Filters: ${filterParts.join(', ')}`
        : 'Filters: (none)';

      const lines = ['', `Query Results (${count} found)`, filterLine, '─'.repeat(40)];

      for (const f of features) {
        const status = f.status || 'backlog';
        const title = f.title || f.id;
        const cat = f.category || '';
        const assigneeLabel = f.assignee ? ` → ${f.assignee}` : '';
        lines.push(`  ${f.id}  [${status}]  ${title}${cat ? ` (${cat})` : ''}${assigneeLabel}`);
      }

      lines.push('');
      output(lines.join('\n'), flags);
    }
  });

  parent.addCommand(cmd);
}
