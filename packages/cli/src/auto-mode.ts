/**
 * protomaker auto-mode
 *
 * Auto-mode control commands — start, stop, status.
 *
 * Usage:
 *   protomaker auto-mode start [options]
 *   protomaker auto-mode stop [options]
 *   protomaker auto-mode status [options]
 */

import { Command } from 'commander';
import { ApiClient } from './api-client.js';
import { output, error, type GlobalFlags, getOutputMode } from './output.js';
import { resolveApiConfig } from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunningAgent {
  featureId: string;
  title?: string;
  status?: string;
  branchName?: string;
  projectPath?: string;
  startTime?: string;
  [key: string]: unknown;
}

interface AutoModeStartResponse {
  success: boolean;
  alreadyRunning?: boolean;
  message?: string;
  error?: string;
}

interface AutoModeStopResponse {
  success: boolean;
  wasRunning?: boolean;
  message?: string;
  error?: string;
}

interface AutoModeStatusResponse {
  success: boolean;
  isRunning?: boolean;
  isAutoLoopRunning?: boolean;
  runningFeatures?: Array<string | RunningAgent>;
  runningCount?: number;
  maxConcurrency?: number;
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

function renderStatus(status: AutoModeStatusResponse): string {
  const lines: string[] = [];
  lines.push('');

  const running = status.isAutoLoopRunning ?? status.isRunning ?? false;
  lines.push(`Status:        ${running ? '▶️ running' : '⏹️ stopped'}`);

  if (status.runningCount !== undefined) {
    lines.push(`Running:       ${status.runningCount}`);
  }
  if (status.maxConcurrency !== undefined) {
    lines.push(`Concurrency:   ${status.maxConcurrency}`);
  }

  if (status.runningFeatures && status.runningFeatures.length > 0) {
    lines.push('');
    lines.push('Active features:');
    for (const rf of status.runningFeatures) {
      // runningFeatures comes back as bare featureId strings; tolerate objects too.
      const f: RunningAgent = typeof rf === 'string' ? { featureId: rf } : rf;
      const titlePart = f.title ? ` — ${f.title}` : '';
      const branch = f.branchName ? ` (branch: ${f.branchName})` : '';
      lines.push(`  • ${f.featureId}${titlePart}${branch}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * protomaker auto-mode start
 *
 * Start the auto-mode loop for a project.
 *
 * Options: --branch, --max-concurrency
 */
export function startCommand(parent: Command): void {
  const cmd = new Command('start');
  cmd.description('Start the auto-mode loop');
  cmd.option('--branch <name>', 'Branch name for worktree isolation');
  cmd.option('--max-concurrency <n>', 'Max concurrent features');

  cmd.action(async (opts) => {
    const flags = getGlobalFlags(opts);
    const client = createClient(flags);

    const body: Record<string, unknown> = { projectPath: flags.project };
    if (opts.branch) {
      body.branchName = opts.branch;
    }
    if (opts.maxConcurrency) {
      const n = parseInt(opts.maxConcurrency, 10);
      if (isNaN(n) || n < 1 || n > 20) {
        error('max-concurrency must be between 1 and 20');
        process.exit(1);
        return;
      }
      body.maxConcurrency = n;
    }

    const result = await client.post<AutoModeStartResponse>('/auto-mode/start', body);

    if (!result.ok) {
      error(result.error || 'Failed to start auto-mode');
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output(result.data, flags);
    } else {
      if (result.data?.alreadyRunning) {
        output('Auto-mode is already running', flags);
      } else {
        output('Auto-mode started', flags);
      }
    }
  });

  parent.addCommand(cmd);
}

/**
 * protomaker auto-mode stop
 *
 * Stop the auto-mode loop for a project.
 *
 * Options: --branch
 */
export function stopCommand(parent: Command): void {
  const cmd = new Command('stop');
  cmd.description('Stop the auto-mode loop');
  cmd.option('--branch <name>', 'Branch name for worktree isolation');

  cmd.action(async (opts) => {
    const flags = getGlobalFlags(opts);
    const client = createClient(flags);

    const body: Record<string, unknown> = { projectPath: flags.project };
    if (opts.branch) {
      body.branchName = opts.branch;
    }

    const result = await client.post<AutoModeStopResponse>('/auto-mode/stop', body);

    if (!result.ok) {
      error(result.error || 'Failed to stop auto-mode');
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output(result.data, flags);
    } else {
      if (result.data?.wasRunning === false) {
        output('Auto-mode was not running', flags);
      } else {
        output('Auto-mode stopped', flags);
      }
    }
  });

  parent.addCommand(cmd);
}

/**
 * protomaker auto-mode status
 *
 * Show the current auto-mode status for a project.
 *
 * Options: --branch
 */
export function statusCommand(parent: Command): void {
  const cmd = new Command('status');
  cmd.description('Show auto-mode status');
  cmd.option('--branch <name>', 'Branch name for worktree isolation');

  cmd.action(async (opts) => {
    const flags = getGlobalFlags(opts);
    const client = createClient(flags);

    const body: Record<string, unknown> = { projectPath: flags.project };
    if (opts.branch) {
      body.branchName = opts.branch;
    }

    const result = await client.post<AutoModeStatusResponse>('/auto-mode/status', body);

    if (!result.ok) {
      error(result.error || 'Failed to get auto-mode status');
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output(result.data, flags);
    } else {
      output(renderStatus(result.data ?? { success: true }), flags);
    }
  });

  parent.addCommand(cmd);
}
