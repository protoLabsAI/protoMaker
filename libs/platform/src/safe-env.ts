/**
 * Sanitized environment builder for subprocess execution.
 *
 * Prevents leaking sensitive env vars (API keys, tokens, credentials)
 * to agent subprocesses by whitelisting only the variables they need.
 */

const SAFE_ENV_VARS = [
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'LANG',
  'LC_ALL',
  'TERM',
  'NODE_ENV',
  'TMPDIR',
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
  'HUSKY',
] as const;

export interface SafeEnvOptions {
  /** Include ANTHROPIC_API_KEY — only for agent processes that call Claude API directly */
  includeAnthropicKey?: boolean;
  /** Override the PATH value (e.g., extended PATH with extra tool locations for Electron) */
  path?: string;
}

/**
 * Build a sanitized environment object for subprocess execution.
 *
 * Only whitelisted variables are included. ANTHROPIC_API_KEY is excluded
 * by default and must be explicitly opted in for agent processes that need
 * to call the Claude API directly.
 *
 * HUSKY is always set to '0' to disable git hooks in subprocesses.
 *
 * @example
 * // General git/shell commands — no API key
 * const env = buildSafeEnv({ path: extendedPath });
 *
 * // Agent subprocess — needs Claude API
 * const env = buildSafeEnv({ includeAnthropicKey: true });
 */
export function buildSafeEnv(options: SafeEnvOptions = {}): Record<string, string> {
  const env: Record<string, string> = {};

  for (const key of SAFE_ENV_VARS) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }

  // Apply PATH override (e.g., extended PATH for Electron apps)
  if (options.path !== undefined) {
    env['PATH'] = options.path;
  }

  // Always disable husky hooks in subprocesses
  env['HUSKY'] = '0';

  // Only include ANTHROPIC_API_KEY for agent processes that require it
  if (options.includeAnthropicKey) {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (apiKey !== undefined) {
      env['ANTHROPIC_API_KEY'] = apiKey;
    }
  }

  return env;
}
