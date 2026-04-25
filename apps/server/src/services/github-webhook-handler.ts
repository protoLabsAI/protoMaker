/**
 * GitHubWebhookHandler Service
 *
 * Listens for CI failure events emitted by the global webhook route and
 * triggers format-failure auto-remediation when the "Check formatting" check fails.
 *
 * Flow:
 *   pr:ci-failure event received
 *     → fetch check runs for the failed suite (via GitHub API)
 *     → filter for a failed "Check formatting" check run
 *     → call remediateFormatFailure() from pr-remediation-service
 *     → emit pr:remediation-completed on success
 *
 * Safety gates (enforced inside remediateFormatFailure):
 *   - Protected branch guard (never touch main/staging/dev)
 *   - Agent-author guard (branch prefix)
 *   - One-remediation-per-PR cap
 *   - Scope check (only PR-diff files modified by prettier)
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { EventType } from '@protolabsai/types';
import { remediateFormatFailure } from './pr-remediation-service.js';
import type { GitHubCheckRunsListResponse } from '../types/pr-remediation.js';

const execAsync = promisify(exec);
const logger = createLogger('GitHubWebhookHandler');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The GitHub Actions job name that runs all CI checks, including formatting.
 * The GitHub check_runs API returns job-level entries only — "Check formatting"
 * is a step name (not a job name) and will never appear as a check run name.
 */
const CHECKS_JOB_NAME = 'checks';

/**
 * The string emitted by prettier to stdout when it finds formatting issues.
 * Appears in the failed step log output fetched via `gh run view --log-failed`.
 */
const FORMAT_FAILURE_MARKER = 'Code style issues found';

// ---------------------------------------------------------------------------
// CI failure event payload (matches what routes/webhooks/routes/github.ts emits)
// ---------------------------------------------------------------------------

interface CIFailurePayload {
  projectPath: string;
  prNumber: number;
  headBranch: string;
  headSha: string;
  checkSuiteId?: number;
  checkSuiteUrl?: string | null;
  repository: string;
  checksUrl?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class GitHubWebhookHandler {
  private readonly events: EventEmitter;
  /** Resolved project path used for git operations / worktree lookups. */
  private readonly projectPath: string;
  private unsubscribe?: () => void;

  /**
   * @param events      Shared event bus (subscribe + emit).
   * @param projectPath Root project directory — used to locate worktrees and
   *                    prettier when remediating format failures.
   */
  constructor(events: EventEmitter, projectPath: string) {
    this.events = events;
    this.projectPath = projectPath;
  }

  /**
   * Start listening for CI failure events. Call once during server startup.
   */
  start(): void {
    this.unsubscribe = this.events.subscribe((type: EventType, payload: unknown) => {
      if (type === 'pr:ci-failure') {
        // Fire-and-forget: errors are caught and logged inside the handler.
        void this.handleCIFailure(payload as CIFailurePayload);
      }
    });
    logger.info('[GitHubWebhookHandler] Listening for CI failure events');
  }

  /**
   * Stop listening. Call during graceful shutdown.
   */
  stop(): void {
    this.unsubscribe?.();
    logger.info('[GitHubWebhookHandler] Stopped listening for CI failure events');
  }

  // ---------------------------------------------------------------------------
  // Internal handlers
  // ---------------------------------------------------------------------------

  private async handleCIFailure(payload: CIFailurePayload): Promise<void> {
    const { prNumber, headBranch, headSha, repository, checksUrl } = payload;

    logger.info('[GitHubWebhookHandler] Received CI failure', {
      prNumber,
      headBranch,
      repository,
    });

    // Check if the "Check formatting" step specifically failed
    const formatCheckFailed = await this.isFormatCheckFailed(
      repository,
      payload.checkSuiteId,
      checksUrl
    );

    if (!formatCheckFailed) {
      logger.debug(
        '[GitHubWebhookHandler] Format check did not fail — skipping format remediation',
        {
          prNumber,
          headBranch,
        }
      );
      return;
    }

    logger.info('[GitHubWebhookHandler] Format check failure confirmed — triggering remediation', {
      prNumber,
      headBranch,
    });

    // Resolve project path: use the provided projectPath if non-empty, else fall back to
    // process.cwd() (the server's working directory where the repo lives).
    const projectPath = this.projectPath || process.cwd();

    try {
      const result = await remediateFormatFailure(
        {
          projectPath,
          prNumber,
          headBranch,
          headSha,
          repository,
          checksUrl,
        },
        this.events
      );

      logger.info('[GitHubWebhookHandler] Remediation complete', {
        prNumber,
        status: result.status,
        reason: result.reason.slice(0, 120),
      });

      if (result.status === 'escalated') {
        logger.warn('[GitHubWebhookHandler] Escalating to HITL', {
          prNumber,
          reason: result.reason,
          details: result.details,
        });
      }
    } catch (err) {
      logger.error('[GitHubWebhookHandler] Unhandled error during format remediation', {
        prNumber,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Determine whether a format-check failure caused the `checks` CI job to fail.
   *
   * Background: `.github/workflows/checks.yml` defines a single job named `checks`
   * (not `Check formatting`). The "Check formatting" label is a step name inside
   * that job. The GitHub check_runs API only exposes job-level entries, so searching
   * for `cr.name === 'Check formatting'` always returns undefined.
   *
   * This method:
   *   1. Finds the `checks` job run and confirms it failed.
   *   2. Extracts the workflow run ID from `details_url`.
   *   3. Fetches the failed-step log via `gh run view --log-failed`.
   *   4. Returns true only if the log contains the prettier failure marker.
   *
   * Uses `checksUrl` (check_suite.check_runs_url) when available;
   * falls back to querying by checkSuiteId.
   *
   * Returns false on any API or parse error (fail-safe: don't remediate if uncertain).
   */
  private async isFormatCheckFailed(
    repository: string,
    checkSuiteId: number | undefined,
    checksUrl: string | undefined
  ): Promise<boolean> {
    try {
      let checkRuns: GitHubCheckRunsListResponse | null = null;

      if (checksUrl) {
        // Use the URL directly — gh api accepts full GitHub API URLs
        const { stdout } = await execAsync(`gh api ${JSON.stringify(checksUrl)}`, {
          timeout: 15000,
        });
        checkRuns = JSON.parse(stdout) as GitHubCheckRunsListResponse;
      } else if (checkSuiteId) {
        const { stdout } = await execAsync(
          `gh api repos/${repository}/check-suites/${checkSuiteId}/check-runs`,
          { timeout: 15000 }
        );
        checkRuns = JSON.parse(stdout) as GitHubCheckRunsListResponse;
      } else {
        logger.debug(
          '[GitHubWebhookHandler] No checksUrl or checkSuiteId — cannot verify check name'
        );
        return false;
      }

      if (!checkRuns || !Array.isArray(checkRuns.check_runs)) {
        logger.debug('[GitHubWebhookHandler] Unexpected check_runs response shape');
        return false;
      }

      // The GitHub check_runs API returns job-level entries only.
      // "Check formatting" is a step inside the "checks" job — not its own check run.
      const checksJob = checkRuns.check_runs.find(
        (cr) => cr.name === CHECKS_JOB_NAME && cr.conclusion === 'failure'
      );

      if (!checksJob) {
        logger.debug(
          '[GitHubWebhookHandler] "checks" job not found or did not fail — skipping format remediation'
        );
        return false;
      }

      // Extract the workflow run ID from the job detail URL so we can fetch step-level logs.
      // URL format: https://github.com/{org}/{repo}/actions/runs/{runId}/job/{jobId}
      const detailsUrl = checksJob.details_url ?? '';
      const runIdMatch = /\/actions\/runs\/(\d+)/.exec(detailsUrl);
      if (!runIdMatch) {
        logger.warn(
          '[GitHubWebhookHandler] Could not extract run_id from details_url — cannot confirm format failure',
          { detailsUrl }
        );
        // Fail-safe: without run_id we cannot inspect logs, so do not auto-remediate
        return false;
      }
      const runId = runIdMatch[1];

      // Fetch the output of all failed steps for this run.
      // The prettier "Check formatting" step emits FORMAT_FAILURE_MARKER to stdout on failure.
      const { stdout: logOutput } = await execAsync(
        `gh run view ${runId} --log-failed --repo ${repository}`,
        { timeout: 30000 }
      );

      const hasFormatFailure = logOutput.includes(FORMAT_FAILURE_MARKER);
      logger.debug('[GitHubWebhookHandler] Format failure log check', {
        runId,
        hasFormatFailure,
      });
      return hasFormatFailure;
    } catch (err) {
      logger.warn('[GitHubWebhookHandler] Failed to check format failure in CI logs', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Fail-safe: if we can't confirm the format check failed, don't auto-remediate
      return false;
    }
  }
}
