/**
 * PR creation with automatic REST fallback for `gh pr create` secondary rate limits.
 *
 * `gh pr create` frequently trips GitHub's secondary rate limit during bursts of
 * agent-driven PR creation. The `gh api POST /repos/{owner}/{repo}/pulls` path
 * has different limits and routinely succeeds when the CLI is throttled, so we
 * retry through the REST API before surfacing the error to the caller.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabsai/utils';

const execFileAsync = promisify(execFile);
const logger = createLogger('ghPrCreate');

export interface CreatePrArgs {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  base: string;
  head: string;
  title: string;
  body: string;
  draft?: boolean;
  /** Required when the target repo differs from the current remote (forks, cross-repo). */
  repo?: string;
}

export interface CreatePrResult {
  url: string;
  number?: number;
  /** Which path returned the PR: 'cli' or 'rest'. Useful for diagnostics. */
  via: 'cli' | 'rest';
}

/**
 * Detect secondary rate limit / abuse signals in a `gh` CLI error message.
 *
 * The GitHub API returns these verbatim in stderr when `gh` hits a burst limit:
 *   - "secondary rate limit"
 *   - "abuse detection"
 *   - "exceeded a secondary rate limit"
 *   - HTTP 403 with "retry after"
 */
export function isSecondaryRateLimit(errorMessage: string): boolean {
  const msg = errorMessage.toLowerCase();
  return (
    msg.includes('secondary rate limit') ||
    msg.includes('abuse detection') ||
    msg.includes('was submitted too quickly') ||
    (msg.includes('http 403') && msg.includes('retry after'))
  );
}

/**
 * Parse `owner/repo` from a git remote URL. Accepts both SSH and HTTPS forms.
 */
function parseOwnerRepo(remoteUrl: string): { owner: string; repo: string } | null {
  const match = remoteUrl.match(/[:/]([^/]+)\/([^/\s]+?)(?:\.git)?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

async function getOwnerRepo(
  cwd: string,
  env: NodeJS.ProcessEnv | undefined,
  explicitRepo?: string
): Promise<{ owner: string; repo: string } | null> {
  if (explicitRepo) {
    const [owner, repo] = explicitRepo.split('/');
    if (owner && repo) return { owner, repo };
  }
  try {
    const { stdout } = await execFileAsync('git', ['config', '--get', 'remote.origin.url'], {
      cwd,
      env,
    });
    return parseOwnerRepo(stdout.trim());
  } catch {
    return null;
  }
}

/**
 * Create a PR via `gh pr create`, falling back to `gh api POST /repos/.../pulls`
 * if the CLI hits a secondary rate limit.
 *
 * Throws the original error on non-rate-limit failures so callers can keep their
 * existing "already exists" / etc. handling paths.
 */
export async function createPrWithFallback(args: CreatePrArgs): Promise<CreatePrResult> {
  const { cwd, env, base, head, title, body, draft, repo } = args;

  const cliArgs = [
    'pr',
    'create',
    '--base',
    base,
    '--head',
    head,
    '--title',
    title,
    '--body',
    body,
  ];
  if (repo) cliArgs.splice(2, 0, '--repo', repo);
  if (draft) cliArgs.push('--draft');

  try {
    const { stdout } = await execFileAsync('gh', cliArgs, { cwd, env });
    const url = stdout.trim();
    const numberMatch = url.match(/\/pull\/(\d+)/);
    return { url, number: numberMatch ? parseInt(numberMatch[1], 10) : undefined, via: 'cli' };
  } catch (cliError) {
    const err = cliError as { stderr?: string; message?: string };
    const message = err.stderr || err.message || '';

    if (!isSecondaryRateLimit(message)) {
      throw cliError;
    }

    logger.warn(
      `gh pr create hit secondary rate limit; falling back to REST API: ${message.slice(0, 200)}`
    );

    const target = await getOwnerRepo(cwd, env, repo);
    if (!target) {
      // Can't build a REST path without owner/repo — rethrow the original CLI error
      throw cliError;
    }

    // `head` for cross-repo forks is "owner:branch". The REST API accepts that
    // form directly, so no transformation is needed.
    const restArgs = [
      'api',
      '-X',
      'POST',
      `/repos/${target.owner}/${target.repo}/pulls`,
      '-f',
      `title=${title}`,
      '-f',
      `head=${head}`,
      '-f',
      `base=${base}`,
      '-f',
      `body=${body}`,
    ];
    if (draft) restArgs.push('-F', 'draft=true');

    const { stdout: restStdout } = await execFileAsync('gh', restArgs, { cwd, env });
    const payload = JSON.parse(restStdout) as { html_url?: string; number?: number };
    if (!payload.html_url) {
      throw new Error(`REST fallback returned no html_url: ${restStdout.slice(0, 200)}`);
    }

    logger.info(
      `PR created via REST fallback after CLI rate limit: #${payload.number} ${payload.html_url}`
    );

    return { url: payload.html_url, number: payload.number, via: 'rest' };
  }
}
