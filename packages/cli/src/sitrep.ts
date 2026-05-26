/**
 * protomaker sitrep
 *
 * Operational status report — board state, running agents, auto-mode status,
 * open PRs, escalations, and server health in a single call.
 *
 * Usage:
 *   protomaker sitrep [options]
 */

import { Command } from 'commander';
import { ApiClient } from './api-client.js';
import { output, error, type GlobalFlags, getOutputMode } from './output.js';
import { resolveApiConfig } from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SitrepBoard {
  total: number;
  backlog: number;
  inProgress: number;
  review: number;
  blocked: number;
  done: number;
}

interface SitrepAgent {
  featureId: string;
  title?: string;
  model?: string;
  startTime?: string;
  branchName?: string;
  costUsd?: number;
}

interface SitrepAutoMode {
  running: boolean;
  loopRunning: boolean;
  runningCount: number;
  maxConcurrency: number;
  humanBlockedCount: number;
}

interface SitrepBlockedFeature {
  id: string;
  title?: string;
  reason?: string;
  failureCount?: number;
}

interface SitrepReviewFeature {
  id: string;
  title?: string;
  prNumber?: number;
  prUrl?: string;
}

interface SitrepEscalation {
  id: string;
  title?: string;
  status?: string;
  failureCount?: number;
  reason?: string;
  classification?: string;
}

interface SitrepPR {
  number: number;
  title: string;
  head: string;
  base: string;
  mergeable: string;
  ciStatus: string;
}

interface SitrepCommit {
  hash: string;
  message: string;
}

interface SitrepHealth {
  uptimeSeconds: number;
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
}

interface SitrepResponse {
  success: boolean;
  timestamp?: string;
  board?: SitrepBoard;
  autoMode?: SitrepAutoMode;
  agents?: SitrepAgent[];
  blockedFeatures?: SitrepBlockedFeature[];
  reviewFeatures?: SitrepReviewFeature[];
  escalations?: SitrepEscalation[];
  openPRs?: SitrepPR[];
  recentCommits?: SitrepCommit[];
  health?: SitrepHealth;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract global flags from Commander opts.
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
 * Format uptime seconds to a human-readable string.
 */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

/**
 * Render the sitrep as a human-readable report.
 */
function renderSitrep(data: SitrepResponse): string {
  const lines: string[] = [];
  const ts = data.timestamp ? new Date(data.timestamp).toISOString() : new Date().toISOString();

  lines.push('');
  lines.push(`  SITUATION REPORT  ${ts}`);
  lines.push('─'.repeat(60));

  // Board summary
  const board = data.board;
  if (board) {
    lines.push('');
    lines.push('  BOARD');
    lines.push(
      `  Total: ${board.total}  |  Backlog: ${board.backlog}  |  In Progress: ${board.inProgress}  |  Review: ${board.review}  |  Blocked: ${board.blocked}  |  Done: ${board.done}`
    );
  }

  // Auto-mode status
  const auto = data.autoMode;
  if (auto) {
    const state = auto.running ? (auto.loopRunning ? '▶️  running' : '⏸️  started') : '⛔ stopped';
    lines.push('');
    lines.push(`  AUTO-MODE  ${state}`);
    lines.push(
      `  Agents: ${auto.runningCount}/${auto.maxConcurrency}  |  Human-blocked: ${auto.humanBlockedCount}`
    );
  }

  // Running agents
  const agents = data.agents ?? [];
  if (agents.length > 0) {
    lines.push('');
    lines.push('  RUNNING AGENTS');
    for (const a of agents) {
      const title = a.title || a.featureId;
      const cost = a.costUsd !== undefined ? ` ($${a.costUsd.toFixed(2)})` : '';
      lines.push(`    • ${a.featureId} — ${title}${cost}`);
    }
  }

  // Blocked features
  const blocked = data.blockedFeatures ?? [];
  if (blocked.length > 0) {
    lines.push('');
    lines.push('  BLOCKED FEATURES');
    for (const f of blocked) {
      const reason = f.reason ? ` — ${f.reason}` : '';
      lines.push(`    • ${f.id} — ${f.title || 'unknown'}${reason}`);
    }
  }

  // Features in review
  const review = data.reviewFeatures ?? [];
  if (review.length > 0) {
    lines.push('');
    lines.push('  FEATURES IN REVIEW');
    for (const f of review) {
      const pr = f.prNumber ? ` (PR #${f.prNumber})` : '';
      lines.push(`    • ${f.id} — ${f.title || 'unknown'}${pr}`);
    }
  }

  // Escalations
  const escalations = data.escalations ?? [];
  if (escalations.length > 0) {
    lines.push('');
    lines.push('  ESCALATIONS');
    for (const e of escalations) {
      const reason = e.reason ? ` — ${e.reason}` : '';
      const cls = e.classification ? ` [${e.classification}]` : '';
      lines.push(`    • ${e.id} — ${e.title || 'unknown'}${reason}${cls}`);
    }
  }

  // Open PRs
  const prs = data.openPRs ?? [];
  if (prs.length > 0) {
    lines.push('');
    lines.push('  OPEN PRs');
    for (const pr of prs) {
      const ci = pr.ciStatus ? ` [${pr.ciStatus}]` : '';
      lines.push(`    • #${pr.number} — ${pr.title}${ci}`);
    }
  }

  // Server health
  const health = data.health;
  if (health) {
    lines.push('');
    lines.push('  SERVER HEALTH');
    lines.push(
      `  Uptime: ${formatUptime(health.uptimeSeconds)}  |  Heap: ${health.heapUsedMB}/${health.heapTotalMB}MB  |  RSS: ${health.rssMB}MB`
    );
  }

  lines.push('');
  lines.push('─'.repeat(60));
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/**
 * protomaker sitrep
 *
 * Fetch and display the operational status report.
 */
export function sitrepCommand(parent: Command): void {
  const cmd = new Command('sitrep');
  cmd.description('Show operational status report (board, agents, PRs, health)');
  cmd.option('--project-slug <slug>', 'Filter by project slug');

  cmd.action(async (opts) => {
    const flags = getGlobalFlags(opts);
    const client = createClient(flags);

    const body: Record<string, unknown> = { projectPath: flags.project };
    if (opts.projectSlug) {
      body.projectSlug = opts.projectSlug;
    }

    const result = await client.post<SitrepResponse>('/sitrep', body);

    if (!result.ok) {
      error(result.error || 'Failed to fetch sitrep');
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output(result.data, flags);
    } else {
      output(renderSitrep(result.data ?? { success: true }), flags);
    }
  });

  parent.addCommand(cmd);
}
