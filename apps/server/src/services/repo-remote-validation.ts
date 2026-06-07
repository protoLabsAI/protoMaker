/**
 * Repo-Remote Validation Service
 *
 * Validates that a project's git remote origin matches the expected repo slug
 * declared in project settings (`expectedRepoSlug`).  Prevents cross-repo
 * corruption where `.automaker/` boards target one repo but the git remote
 * points to another.
 *
 * Used as a startup gate in `startAutoLoopForProject` (like the compliance
 * gate) and surfaced as a project-health warning on the board.
 *
 * Default: REFUSE auto-mode when `expectedRepoSlug` is set and origin disagrees.
 * Escape hatch: set AUTOMAKER_SKIP_REPO_SLUG_CHECK=1 (truthy) to bypass.
 *
 * When `expectedRepoSlug` is NOT set, validation is skipped silently — no
 * warning, no block.  The field is the canonical declaration of intent.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';

const execAsync = promisify(exec);
const logger = createLogger('RepoRemoteValidation');

/** Env var operators can set (truthy) to bypass the repo-slug gate entirely. */
export const REPO_SLUG_SKIP_ENV = 'AUTOMAKER_SKIP_REPO_SLUG_CHECK';

/** Regex for HTTPS GitHub remotes: https://github.com/owner/repo.git */
const GITHUB_HTTPS_REMOTE_REGEX = /https:\/\/github\.com\/([^/]+)\/([^/.]+)/;
/** Regex for SSH GitHub remotes: git@github.com:owner/repo.git */
const GITHUB_SSH_REMOTE_REGEX = /git@github\.com:([^/]+)\/([^/.]+)/;

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * Extract the "owner/repo" slug from a git remote URL.
 * Returns null if the URL is not a recognizable GitHub remote.
 */
export function extractRepoSlug(remoteUrl: string): string | null {
  const trimmed = remoteUrl.trim();
  const httpsMatch = trimmed.match(GITHUB_HTTPS_REMOTE_REGEX);
  if (httpsMatch) return `${httpsMatch[1]}/${httpsMatch[2]}`;

  const sshMatch = trimmed.match(GITHUB_SSH_REMOTE_REGEX);
  if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;

  return null;
}

/**
 * Read the git remote origin URL for a project path.
 * Returns null if there is no origin remote or the command fails.
 */
export async function readGitRemoteOrigin(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git remote get-url origin', {
      cwd: projectPath,
      timeout: 10000,
    });
    const url = stdout.trim();
    return url || null;
  } catch {
    // No origin remote, not a git repo, or timeout — all non-fatal
    return null;
  }
}

/**
 * Result of validating a project's git remote against its expected slug.
 */
export interface RepoSlugValidationResult {
  /** True when validation passed or was skipped. */
  valid: boolean;
  /** True when the gate was bypassed via the opt-out env var. */
  skipped: boolean;
  /** True when `expectedRepoSlug` was not set (nothing to validate). */
  notConfigured: boolean;
  /** The expected slug from settings, if any. */
  expectedSlug?: string;
  /** The actual slug resolved from git remote origin, if any. */
  actualSlug?: string | null;
  /** Human-readable mismatch message when valid is false. */
  mismatchMessage?: string;
}

/**
 * Build a clear, operator-facing refusal message from a slug mismatch.
 */
export function buildRepoSlugMismatchMessage(
  projectPath: string,
  expectedSlug: string,
  actualSlug: string | null
): string {
  const actual = actualSlug ?? '(no origin remote)';
  const lines = [
    `protoMaker refused to run auto-mode for ${projectPath}: git remote origin does not match the expected repo.`,
    '',
    `  Expected: ${expectedSlug}`,
    `  Actual:   ${actual}`,
    '',
    `This usually means the .automaker/ board at ${projectPath} targets a different repo`,
    `than the git repository cloned at that path.  Fix the mismatch by either:`,
    `  1. Re-cloning the correct repo at this path, or`,
    `  2. Moving the .automaker/ board to a path that matches the expected repo.`,
    '',
    `To bypass this gate (not recommended), set ${REPO_SLUG_SKIP_ENV}=1.`,
  ];
  return lines.join('\n');
}

/**
 * Validate that a project's git remote origin matches the expected repo slug
 * from project settings.
 *
 * @param projectPath - Absolute path to the project directory
 * @param expectedRepoSlug - The expected "owner/repo" slug from settings, or undefined to skip
 * @returns Validation result
 */
export async function validateRepoSlug(
  projectPath: string,
  expectedRepoSlug?: string
): Promise<RepoSlugValidationResult> {
  const result: RepoSlugValidationResult = {
    valid: true,
    skipped: false,
    notConfigured: !expectedRepoSlug,
    expectedSlug: expectedRepoSlug,
    actualSlug: null,
  };

  // If no expected slug is configured, skip silently
  if (!expectedRepoSlug) {
    return result;
  }

  // Opt-out: don't fight people's systems
  if (isTruthyEnv(process.env[REPO_SLUG_SKIP_ENV])) {
    logger.info(
      `[repo-remote] ${REPO_SLUG_SKIP_ENV} set — skipping repo slug validation for ${projectPath}`
    );
    result.skipped = true;
    return result;
  }

  // Read the actual remote URL
  const remoteUrl = await readGitRemoteOrigin(projectPath);
  const actualSlug = remoteUrl ? extractRepoSlug(remoteUrl) : null;
  result.actualSlug = actualSlug;

  // If we can't resolve the actual slug (non-GitHub remote or no remote),
  // do NOT block — refusing to run a legitimate local/non-GitHub repo would
  // be worse than the gap. Only block when we positively detect a mismatch.
  if (!actualSlug) {
    logger.info(
      `[repo-remote] Cannot resolve repo slug from origin (${remoteUrl ?? 'null'}) for ${projectPath} — skipping validation`
    );
    return result;
  }

  // Compare slugs (case-insensitive — GitHub is case-insensitive for owner names)
  if (actualSlug.toLowerCase() !== expectedRepoSlug.toLowerCase()) {
    result.valid = false;
    result.mismatchMessage = buildRepoSlugMismatchMessage(
      projectPath,
      expectedRepoSlug,
      actualSlug
    );
    logger.warn(
      `[repo-remote] Mismatch detected for ${projectPath}: expected "${expectedRepoSlug}", got "${actualSlug}"`
    );
    return result;
  }

  return result;
}
