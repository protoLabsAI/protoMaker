/**
 * Subprocess management utilities for CLI providers
 */

import { spawn, type ChildProcess } from 'child_process';
import readline from 'readline';
import treeKill from 'tree-kill';

const LOG_PREFIX = '[SubprocessManager]';
// eslint-disable-next-line no-console
const logger = {
  info: (msg: string, ...args: unknown[]) => console.log(`${LOG_PREFIX} ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`${LOG_PREFIX} ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`${LOG_PREFIX} ${msg}`, ...args),
};

/**
 * Kill a process and all its descendants.
 * Falls back to childProcess.kill() if PID is unavailable.
 */
function killProcessTree(childProcess: ChildProcess, signal: string): void {
  try {
    if (childProcess.pid) {
      treeKill(childProcess.pid, signal);
    } else {
      childProcess.kill(signal as NodeJS.Signals);
    }
  } catch {
    // Process may already be dead — ignore
  }
}

export interface SubprocessOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  abortController?: AbortController;
  timeout?: number; // Milliseconds of no output before timeout
  /**
   * Data to write to stdin after process spawns.
   * Use this for passing prompts/content that may contain shell metacharacters.
   * Avoids shell interpretation issues when passing data as CLI arguments.
   */
  stdinData?: string;
}

export interface SubprocessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Spawns a subprocess and streams JSONL output line-by-line
 */
export async function* spawnJSONLProcess(options: SubprocessOptions): AsyncGenerator<unknown> {
  const { command, args, cwd, env, abortController, timeout = 30000, stdinData } = options;

  const processEnv = {
    ...process.env,
    ...env,
  };

  // Log command without stdin data (which may be large/sensitive)
  logger.info(`Spawning: ${command} ${args.join(' ')}`);
  logger.info(`Working directory: ${cwd}`);
  if (stdinData) {
    logger.info(`Passing ${stdinData.length} bytes via stdin`);
  }

  // On Windows, .cmd files must be run through shell (cmd.exe)
  const needsShell =
    process.platform === 'win32' &&
    (command.toLowerCase().endsWith('.cmd') || command === 'npx' || command === 'npm');

  const childProcess: ChildProcess = spawn(command, args, {
    cwd,
    env: processEnv,
    // Use 'pipe' for stdin when we need to write data, otherwise 'ignore'
    stdio: [stdinData ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    shell: needsShell,
  });

  // Write stdin data if provided
  if (stdinData && childProcess.stdin) {
    childProcess.stdin.write(stdinData);
    childProcess.stdin.end();
  }

  let stderrOutput = '';
  let lastOutputTime = Date.now();
  let timeoutHandle: NodeJS.Timeout | null = null;

  // Collect stderr for error reporting
  if (childProcess.stderr) {
    childProcess.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderrOutput += text;
      logger.warn(`stderr: ${text}`);
    });
  }

  // Setup timeout detection
  const resetTimeout = () => {
    lastOutputTime = Date.now();
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    timeoutHandle = setTimeout(() => {
      const elapsed = Date.now() - lastOutputTime;
      if (elapsed >= timeout) {
        logger.error(`Process timeout: no output for ${timeout}ms`);
        killProcessTree(childProcess, 'SIGTERM');
      }
    }, timeout);
  };

  resetTimeout();

  // Setup abort handling with cleanup
  let abortHandler: (() => void) | null = null;
  if (abortController) {
    abortHandler = () => {
      logger.info('Abort signal received, killing process tree');
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      killProcessTree(childProcess, 'SIGTERM');
    };
    // Check if already aborted, if so call handler immediately
    if (abortController.signal.aborted) {
      abortHandler();
    } else {
      abortController.signal.addEventListener('abort', abortHandler);
    }
  }

  // Helper to clean up abort listener
  const cleanupAbortListener = () => {
    if (abortController && abortHandler) {
      abortController.signal.removeEventListener('abort', abortHandler);
      abortHandler = null;
    }
  };

  // Pre-register exit promise to prevent race where process exits between
  // stdout close and listener registration.
  const exitPromise = new Promise<number | null>((resolve) => {
    childProcess.on('exit', (code) => {
      logger.info(`Process exited with code: ${code}`);
      resolve(code);
    });

    childProcess.on('error', (error) => {
      logger.error('Process error:', error);
      resolve(null);
    });
  });

  // Parse stdout as JSONL (one JSON object per line)
  if (childProcess.stdout) {
    const rl = readline.createInterface({
      input: childProcess.stdout,
      crlfDelay: Infinity,
    });

    try {
      for await (const line of rl) {
        resetTimeout();

        if (!line.trim()) continue;

        try {
          const parsed = JSON.parse(line);
          yield parsed;
        } catch (parseError) {
          logger.error(`Failed to parse JSONL line: ${line}`, parseError);
          // Yield error but continue processing
          yield {
            type: 'error',
            error: `Failed to parse output: ${line}`,
          };
        }
      }
    } catch (error) {
      logger.error('Error reading stdout:', error);
      throw error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      rl.close();
      cleanupAbortListener();
    }
  } else {
    // No stdout - still need to cleanup abort listener when process exits
    cleanupAbortListener();
  }

  // Wait for process to exit (promise was pre-registered before readline to avoid race)
  const exitCode = await exitPromise;

  // Handle non-zero exit codes
  if (exitCode !== 0 && exitCode !== null) {
    const errorMessage = stderrOutput || `Process exited with code ${exitCode}`;
    logger.error(`Process failed: ${errorMessage}`);
    yield {
      type: 'error',
      error: errorMessage,
    };
  }

  // Process completed successfully
  if (exitCode === 0 && !stderrOutput) {
    logger.info('Process completed successfully');
  }
}

/**
 * Spawns a subprocess and collects all output
 */
export async function spawnProcess(options: SubprocessOptions): Promise<SubprocessResult> {
  const { command, args, cwd, env, abortController, stdinData } = options;

  const processEnv = {
    ...process.env,
    ...env,
  };

  return new Promise((resolve, reject) => {
    // On Windows, .cmd files must be run through shell (cmd.exe)
    const needsShell =
      process.platform === 'win32' &&
      (command.toLowerCase().endsWith('.cmd') || command === 'npx' || command === 'npm');

    const childProcess = spawn(command, args, {
      cwd,
      env: processEnv,
      stdio: [stdinData ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      shell: needsShell,
    });

    if (stdinData && childProcess.stdin) {
      childProcess.stdin.write(stdinData);
      childProcess.stdin.end();
    }

    let stdout = '';
    let stderr = '';

    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
    }

    // Setup abort handling with cleanup
    let abortHandler: (() => void) | null = null;
    const cleanupAbortListener = () => {
      if (abortController && abortHandler) {
        abortController.signal.removeEventListener('abort', abortHandler);
        abortHandler = null;
      }
    };

    if (abortController) {
      abortHandler = () => {
        cleanupAbortListener();
        killProcessTree(childProcess, 'SIGTERM');
        reject(new Error('Process aborted'));
      };
      abortController.signal.addEventListener('abort', abortHandler);
    }

    childProcess.on('exit', (code) => {
      cleanupAbortListener();
      resolve({ stdout, stderr, exitCode: code });
    });

    childProcess.on('error', (error) => {
      cleanupAbortListener();
      reject(error);
    });
  });
}
