/**
 * protomaker agent
 *
 * Agent lifecycle commands — start, stop, list, output, message.
 *
 * Usage:
 *   protomaker agent start <featureId> [options]
 *   protomaker agent stop <featureId> [options]
 *   protomaker agent list [options]
 *   protomaker agent output <featureId> [options]
 *   protomaker agent message <featureId> <prompt> [options]
 */

import { Command } from 'commander';
import { ApiClient } from './api-client.js';
import { output, error, usageError, type GlobalFlags, getOutputMode } from './output.js';
import { resolveApiConfig } from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Running agent info returned by the auto-mode status endpoint. */
interface RunningAgent {
  featureId: string;
  title?: string;
  status?: string;
  branchName?: string;
  projectPath?: string;
  startTime?: string;
  [key: string]: unknown;
}

interface RunFeatureResponse {
  success: boolean;
  error?: string;
}

interface StopFeatureResponse {
  success: boolean;
  stopped?: boolean;
  error?: string;
}

interface AgentListResponse {
  success: boolean;
  isRunning?: boolean;
  isAutoLoopRunning?: boolean;
  runningFeatures?: Array<string | RunningAgent>;
  runningCount?: number;
  maxConcurrency?: number;
  error?: string;
}

interface AgentOutputResponse {
  success: boolean;
  content?: string | null;
  error?: string;
}

interface FollowUpResponse {
  success: boolean;
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
 * Format agent list as a human-readable table.
 */
function renderAgentList(agents: Array<string | RunningAgent>): string {
  if (agents.length === 0) {
    return 'No agents currently running.';
  }

  const lines: string[] = [];
  lines.push('');
  lines.push(`Running agents (${agents.length}):`);
  lines.push('');

  for (const a of agents) {
    // The API returns runningFeatures as bare featureId strings; tolerate both
    // a string and a richer object so we never render "undefined — undefined".
    const agent: RunningAgent = typeof a === 'string' ? { featureId: a } : a;
    const titlePart = agent.title ? ` — ${agent.title}` : '';
    const branch = agent.branchName ? ` (branch: ${agent.branchName})` : '';
    const started = agent.startTime ? ` [started: ${agent.startTime}]` : '';
    lines.push(`  • ${agent.featureId}${titlePart}${branch}${started}`);
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * protomaker agent start <featureId>
 *
 * Dispatch an agent to work on a feature.
 *
 * Options: --force (skip dependency checks), --worktree
 */
export function startCommand(parent: Command): void {
  const cmd = new Command('start').arguments('<featureId>');
  cmd.description('Dispatch an agent for a feature');
  cmd.option('--force', 'Skip dependency checks and start anyway');
  cmd.option('--worktree', 'Use git worktree isolation for this feature');

  cmd.action(async (featureId: string, opts) => {
    const flags = getGlobalFlags(cmd.optsWithGlobals());
    const client = createClient(flags);

    const result = await client.post<RunFeatureResponse>('/auto-mode/run-feature', {
      projectPath: flags.project,
      featureId,
      force: opts.force ?? false,
      useWorktrees: opts.worktree ?? false,
    });

    if (!result.ok) {
      error(result.error || 'Failed to start agent');
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output({ success: true, featureId, message: 'Agent dispatched' }, flags);
    } else {
      output(`Agent dispatched for feature "${featureId}"`, flags);
    }
  });

  parent.addCommand(cmd);
}

/**
 * protomaker agent stop <featureId>
 *
 * Stop a running agent for a specific feature.
 *
 * Options: --target-status (set feature status after stopping)
 */
export function stopCommand(parent: Command): void {
  const cmd = new Command('stop').arguments('<featureId>');
  cmd.description('Stop a running agent for a feature');
  cmd.option(
    '--target-status <status>',
    'Set feature status after stopping (e.g. backlog, blocked)'
  );

  cmd.action(async (featureId: string, opts) => {
    const flags = getGlobalFlags(cmd.optsWithGlobals());
    const client = createClient(flags);

    const body: Record<string, unknown> = { featureId };
    if (opts.targetStatus) {
      body.targetStatus = opts.targetStatus;
    }

    const result = await client.post<StopFeatureResponse>('/auto-mode/stop-feature', body);

    if (!result.ok) {
      error(result.error || 'Failed to stop agent');
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output({ success: true, featureId, stopped: result.data?.stopped ?? true }, flags);
    } else {
      output(`Agent stopped for feature "${featureId}"`, flags);
    }
  });

  parent.addCommand(cmd);
}

/**
 * protomaker agent list
 *
 * Show running agents (from auto-mode status).
 */
export function listCommand(parent: Command): void {
  const cmd = new Command('list');
  cmd.description('Show running agents');
  cmd.option('--branch <name>', 'Filter by branch name');

  cmd.action(async (opts) => {
    const flags = getGlobalFlags(cmd.optsWithGlobals());
    const client = createClient(flags);

    const body: Record<string, unknown> = { projectPath: flags.project };
    if (opts.branch) {
      body.branchName = opts.branch;
    }

    const result = await client.post<AgentListResponse>('/auto-mode/status', body);

    if (!result.ok) {
      error(result.error || 'Failed to list agents');
      process.exit(1);
      return;
    }

    const agents = result.data?.runningFeatures ?? [];

    if (getOutputMode(flags) === 'json') {
      output(
        {
          isRunning: result.data?.isRunning,
          isAutoLoopRunning: result.data?.isAutoLoopRunning,
          runningCount: result.data?.runningCount,
          maxConcurrency: result.data?.maxConcurrency,
          agents,
        },
        flags
      );
    } else {
      output(renderAgentList(agents), flags);
    }
  });

  parent.addCommand(cmd);
}

/**
 * protomaker agent output <featureId>
 *
 * Print the agent output (agent-output.md) for a feature.
 */
export function outputCommand(parent: Command): void {
  const cmd = new Command('output').arguments('<featureId>');
  cmd.description('Print the agent output for a feature');

  cmd.action(async (featureId: string, opts) => {
    const flags = getGlobalFlags(cmd.optsWithGlobals());
    const client = createClient(flags);

    const result = await client.post<AgentOutputResponse>('/features/agent-output', {
      projectPath: flags.project,
      featureId,
    });

    if (!result.ok) {
      error(result.error || 'Failed to get agent output');
      process.exit(1);
      return;
    }

    const content = result.data?.content;

    if (!content) {
      if (getOutputMode(flags) === 'json') {
        output({ featureId, content: null }, flags);
      } else {
        output(`No agent output yet for feature "${featureId}"`, flags);
      }
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output({ featureId, content }, flags);
    } else {
      output(content, flags);
    }
  });

  parent.addCommand(cmd);
}

/**
 * protomaker agent message <featureId> <prompt>
 *
 * Send a follow-up message to a running agent.
 *
 * Options: --image <path> (attach image, repeatable)
 */
export function messageCommand(parent: Command): void {
  const cmd = new Command('message').arguments('<featureId> <prompt>');
  cmd.description('Send a follow-up message to a running agent');
  cmd.option('--image <path>', 'Attach an image file (repeatable)');

  cmd.action(async (featureId: string, prompt: string, opts) => {
    const flags = getGlobalFlags(cmd.optsWithGlobals());
    const client = createClient(flags);

    const body: Record<string, unknown> = {
      projectPath: flags.project,
      featureId,
      prompt,
    };

    if (opts.image) {
      body.imagePaths = Array.isArray(opts.image) ? opts.image : [opts.image];
    }

    const result = await client.post<FollowUpResponse>('/auto-mode/follow-up-feature', body);

    if (!result.ok) {
      error(result.error || 'Failed to send message to agent');
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output({ success: true, featureId, prompt }, flags);
    } else {
      output(`Message sent to agent for feature "${featureId}"`, flags);
    }
  });

  parent.addCommand(cmd);
}
