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

/** The exact name of the GitHub Actions step we are watching. */
const FORMAT_CHECK_NAME = 'Check formatting';

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
   * Query the GitHub API to determine whether the "Check formatting" check run
   * failed in the given check suite.
   *
   * Uses `checksUrl` (the check_suite.check_runs_url) when available;
   * falls back to querying by checkSuiteId.
   *
   * Returns false on any API error (fail-safe: don't remediate if we can't confirm).
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

      const formatCheck = checkRuns.check_runs.find((cr) => cr.name === FORMAT_CHECK_NAME);
      if (!formatCheck) {
        logger.debug('[GitHubWebhookHandler] "Check formatting" check run not found in suite');
        return false;
      }

      const failed = formatCheck.conclusion === 'failure';
      logger.debug('[GitHubWebhookHandler] Format check status', {
        checkName: formatCheck.name,
        conclusion: formatCheck.conclusion,
        failed,
      });
      return failed;
    } catch (err) {
      logger.warn('[GitHubWebhookHandler] Failed to fetch check runs', {
        error: err instanceof Error ? err.message : String(err),
      });
      // Fail-safe: if we can't confirm the format check failed, don't auto-remediate
      return false;
    }
  }
}
