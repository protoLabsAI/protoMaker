/**
 * protomaker health
 *
 * Server health check — verifies the protoLabs.studio server is running and
 * returns basic health status.
 *
 * Usage:
 *   protomaker health [options]
 */

import { Command } from 'commander';
import { ApiClient } from './api-client.js';
import { output, error, type GlobalFlags, getOutputMode } from './output.js';
import { resolveApiConfig } from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HealthResponse {
  status: string;
  timestamp?: string;
  version?: string;
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
 * Render health status as human-readable output.
 */
function renderHealth(data: HealthResponse): string {
  const status = data.status === 'ok' ? '✅ healthy' : '❌ unhealthy';
  const lines: string[] = [];
  lines.push('');
  lines.push(`  Server: ${status}`);
  if (data.version) lines.push(`  Version: ${data.version}`);
  if (data.timestamp) lines.push(`  Checked: ${data.timestamp}`);
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

/**
 * protomaker health
 *
 * Check server health via GET /api/health.
 */
export function healthCommand(parent: Command): void {
  const cmd = new Command('health');
  cmd.description('Check server health status');

  cmd.action(async (opts) => {
    const flags = getGlobalFlags(cmd.optsWithGlobals());
    const client = createClient(flags);

    const result = await client.get<HealthResponse>('/health');

    if (!result.ok) {
      error(result.error || 'Server health check failed');
      process.exit(1);
      return;
    }

    if (getOutputMode(flags) === 'json') {
      output(result.data, flags);
    } else {
      output(renderHealth(result.data ?? { status: 'unknown' }), flags);
    }
  });

  parent.addCommand(cmd);
}
