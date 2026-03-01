/**
 * ClaudeCodeTool — runs `claude -p <prompt>` headlessly with lock file protection.
 *
 * Factory: createClaudeCodeTool(deps?) returns a SharedTool named 'claude-code'.
 *
 * Key features:
 * - Per-invocationId lock file prevents concurrent runs of the same automation
 * - Configurable timeout (default 300 s) terminates the process on expiry
 * - Captures stdout and stderr; best-effort JSON cost parsing from claude output
 * - Clean SIGTERM → 3 s grace → SIGKILL termination sequence
 */

import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { z } from 'zod';
import { defineSharedTool } from './define-tool.js';
import type { SharedTool } from './types.js';

// ---------------------------------------------------------------------------
// Lock file helpers
// ---------------------------------------------------------------------------

const LOCK_DIR = join(tmpdir(), 'protolabs-claude-locks');

function lockFilePath(invocationId: string): string {
  return join(LOCK_DIR, `${invocationId}.lock`);
}

/**
 * Attempts to acquire an exclusive lock file for the given invocation ID.
 * Uses the 'wx' flag (exclusive create) so only one concurrent call succeeds.
 * Returns true on success, false if the lock is already held.
 */
function acquireLock(invocationId: string): boolean {
  try {
    mkdirSync(LOCK_DIR, { recursive: true });
    writeFileSync(lockFilePath(invocationId), String(process.pid), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

function releaseLock(invocationId: string): void {
  try {
    unlinkSync(lockFilePath(invocationId));
  } catch {
    // File may already be gone — safe to ignore
  }
}

// ---------------------------------------------------------------------------
// Cost parsing
// ---------------------------------------------------------------------------

/**
 * Scans output lines for a JSON object containing a `cost_usd` number.
 * The Claude CLI emits cost information in its JSON output when used with
 * --output-format json. Returns undefined when no cost data is found.
 */
function parseCostUsd(text: string): number | undefined {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof parsed['cost_usd'] === 'number') return parsed['cost_usd'] as number;
    } catch {
      // Not JSON — skip line
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Deps + schemas
// ---------------------------------------------------------------------------

export interface ClaudeCodeDeps {
  /** Path to the claude binary (default: 'claude' — relies on $PATH) */
  claudePath?: string;
  /** Default working directory for child processes (default: process.cwd()) */
  cwd?: string;
}

const ClaudeCodeInputSchema = z.object({
  prompt: z.string().describe('Prompt to send to claude -p'),
  invocationId: z
    .string()
    .describe(
      'Unique ID used for the lock file — prevents concurrent executions of the same automation job. ' +
        'Use a stable identifier like "board-health-check" or "daily-report".'
    ),
  timeout: z
    .number()
    .int()
    .positive()
    .default(300_000)
    .describe('Maximum runtime in milliseconds (default: 300 000 = 5 minutes)'),
  cwd: z.string().optional().describe('Working directory override for this invocation'),
});

const ClaudeCodeOutputSchema = z.object({
  output: z.string().describe('Captured stdout from the claude process'),
  stderr: z.string().describe('Captured stderr from the claude process'),
  exitCode: z.number().nullable().describe('Process exit code (null if killed by signal)'),
  timedOut: z.boolean().describe('True if the process was terminated due to timeout'),
  costUsd: z
    .number()
    .optional()
    .describe('Estimated API cost parsed from JSON output lines, if available'),
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a 'claude-code' SharedTool that spawns `claude -p <prompt>` headlessly.
 *
 * The tool manages the full subprocess lifecycle:
 * 1. Acquires an exclusive lock file keyed by invocationId
 * 2. Spawns `claude -p <prompt>` with stdout/stderr captured
 * 3. Enforces a hard timeout (SIGTERM then SIGKILL after 3 s grace period)
 * 4. Releases the lock file in all exit paths (success, error, timeout)
 *
 * @param deps - Optional configuration (claudePath, default cwd)
 * @returns A SharedTool named 'claude-code' for use with ToolRegistry or toLangGraphTools()
 */
export function createClaudeCodeTool(deps?: ClaudeCodeDeps): SharedTool {
  const claudeBin = deps?.claudePath ?? 'claude';
  const defaultCwd = deps?.cwd ?? process.cwd();

  return defineSharedTool({
    name: 'claude-code',
    description:
      'Runs `claude -p <prompt>` as a headless subprocess. ' +
      'Uses an exclusive lock file (keyed by invocationId) to prevent concurrent runs ' +
      'of the same automation. Enforces a configurable timeout with clean process ' +
      'termination (SIGTERM then SIGKILL after 3 s grace). Returns captured stdout, ' +
      'stderr, exit code, and optional cost estimate.',
    inputSchema: ClaudeCodeInputSchema,
    outputSchema: ClaudeCodeOutputSchema,
    metadata: { category: 'ai', tags: ['claude', 'subprocess', 'automation', 'headless'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof ClaudeCodeInputSchema>;

      if (!acquireLock(input.invocationId)) {
        return {
          success: false,
          error:
            `Lock already held for invocationId '${input.invocationId}'. ` +
            'Another instance of this automation is still running.',
        };
      }

      let timedOut = false;
      let timeoutHandle: NodeJS.Timeout | null = null;
      let stdoutBuf = '';
      let stderrBuf = '';

      try {
        const child = spawn(claudeBin, ['-p', input.prompt], {
          cwd: input.cwd ?? defaultCwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env },
        });

        // Pre-register exit promise BEFORE data listeners to eliminate the race
        // where the process exits between stdout-close and listener attachment.
        const exitPromise = new Promise<number | null>((resolve) => {
          child.on('exit', resolve);
          child.on('error', () => resolve(null));
        });

        // Arm timeout: SIGTERM first, then SIGKILL after 3 s grace period
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          setTimeout(() => {
            try {
              child.kill('SIGKILL');
            } catch {
              // Process already dead — safe to ignore
            }
          }, 3_000);
        }, input.timeout);

        child.stdout?.on('data', (chunk: Buffer) => {
          stdoutBuf += chunk.toString();
        });
        child.stderr?.on('data', (chunk: Buffer) => {
          stderrBuf += chunk.toString();
        });

        const exitCode = await exitPromise;

        // Clear timeout if process exited naturally before deadline
        if (timeoutHandle) clearTimeout(timeoutHandle);

        const costUsd = parseCostUsd(stdoutBuf);

        if (timedOut) {
          return {
            success: false,
            error: `claude -p timed out after ${input.timeout} ms`,
            data: { output: stdoutBuf, stderr: stderrBuf, exitCode, timedOut: true, costUsd },
          };
        }

        if (exitCode !== 0) {
          const errDetail = stderrBuf.slice(0, 500);
          return {
            success: false,
            error: `claude -p exited with code ${exitCode}${errDetail ? `: ${errDetail}` : ''}`,
            data: { output: stdoutBuf, stderr: stderrBuf, exitCode, timedOut: false, costUsd },
          };
        }

        return {
          success: true,
          data: { output: stdoutBuf, stderr: stderrBuf, exitCode, timedOut: false, costUsd },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to spawn claude process',
        };
      } finally {
        releaseLock(input.invocationId);
      }
    },
  });
}
