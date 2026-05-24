/**
 * AutoDismissStaleBotReviewsCheck — clear blocking CHANGES_REQUESTED reviews
 * left by bot reviewers (protoquinn, CodeRabbit) on stale commits.
 *
 * Problem: GitHub branch protection treats a `CHANGES_REQUESTED` review as
 * blocking until the reviewer either dismisses it OR submits a fresh
 * `APPROVED` review. Our review bots routinely re-review fix commits with
 * `COMMENTED` (acknowledging the fix without escalating to APPROVED),
 * which does NOT clear the blocking state. The result is PRs stuck at
 * `mergeStateStatus: BLOCKED` even after all flagged concerns are
 * resolved and CI is green — a maintainer has to manually dismiss.
 *
 * This check identifies the exact "stale" shape and dismisses the
 * blocking review automatically:
 *
 *   1. PR is OPEN
 *   2. Latest CHANGES_REQUESTED review is from a `[bot]` user
 *   3. That review's commit is NOT the current head
 *   4. The same bot has posted a later COMMENTED or APPROVED review
 *      on a more recent commit (proves it's seen and acked the fix)
 *   5. All required CI checks on the current head are SUCCESS
 *
 * When all 5 hold, the stale CHANGES_REQUESTED is dismissed with a
 * message citing the follow-up review and the head SHA.
 *
 * See: protoLabsAI/protoMaker#3732
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@protolabsai/utils';
import type { MaintenanceCheck, MaintenanceIssue } from '../types.js';

const logger = createLogger('AutoDismissStaleBotReviewsCheck');

type ExecFileAsync = (
  file: string,
  args: string[],
  options: { cwd?: string; encoding: string; timeout: number }
) => Promise<{ stdout: string; stderr: string }>;

interface PROpen {
  number: number;
  headRefOid: string;
  mergeStateStatus: string;
  reviewDecision: string | null;
  url: string;
}

interface PRReview {
  id: number;
  user: { login: string } | null;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  commit_id: string | null;
  submitted_at: string | null;
}

interface PRCheck {
  name: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'QUEUED' | 'PENDING' | string;
  conclusion: 'SUCCESS' | 'FAILURE' | 'SKIPPED' | 'CANCELLED' | 'NEUTRAL' | null;
}

interface RepoCoords {
  owner: string;
  repo: string;
}

/** Identify a user that's a GitHub App / bot (login ends with `[bot]`). */
function isBot(login: string): boolean {
  return login.endsWith('[bot]');
}

export class AutoDismissStaleBotReviewsCheck implements MaintenanceCheck {
  readonly id = 'auto-dismiss-stale-bot-reviews';

  private readonly execFileAsync: ExecFileAsync;

  constructor(
    private readonly repoCoords: RepoCoords,
    execFileAsyncOverride?: ExecFileAsync
  ) {
    this.execFileAsync = execFileAsyncOverride ?? (promisify(execFile) as ExecFileAsync);
  }

  async run(projectPath: string): Promise<MaintenanceIssue[]> {
    const issues: MaintenanceIssue[] = [];

    try {
      const openPRs = await this.listOpenPRs(projectPath);
      for (const pr of openPRs) {
        // Fast-path: only act on PRs that GitHub thinks are blocked AND have a
        // CHANGES_REQUESTED decision. Anything else means either the PR is
        // happy, or it's blocked for a different reason (CI failure, conflicts).
        if (pr.mergeStateStatus !== 'BLOCKED') continue;
        if (pr.reviewDecision !== 'CHANGES_REQUESTED') continue;

        const dismissed = await this.processPR(projectPath, pr);
        for (const reviewId of dismissed) {
          issues.push({
            checkId: this.id,
            severity: 'info',
            message: `Dismissed stale CHANGES_REQUESTED on PR #${pr.number} (review id ${reviewId})`,
            autoFixable: false,
            context: {
              prNumber: pr.number,
              prUrl: pr.url,
              reviewId,
              headSha: pr.headRefOid,
            },
          });
        }
      }
    } catch (error) {
      logger.error(`AutoDismissStaleBotReviewsCheck failed for ${projectPath}:`, error);
    }

    return issues;
  }

  /**
   * Inspect a single PR. Returns the list of review IDs that were dismissed.
   */
  private async processPR(projectPath: string, pr: PROpen): Promise<number[]> {
    const reviews = await this.listReviews(projectPath, pr.number);

    // Group reviews by author (login). For each bot author, find any
    // CHANGES_REQUESTED that's been superseded by a later COMMENTED/APPROVED.
    const byAuthor = new Map<string, PRReview[]>();
    for (const r of reviews) {
      if (!r.user) continue;
      if (!isBot(r.user.login)) continue;
      const arr = byAuthor.get(r.user.login) ?? [];
      arr.push(r);
      byAuthor.set(r.user.login, arr);
    }

    const dismissed: number[] = [];

    for (const [_login, list] of byAuthor) {
      // Sort ascending by submitted_at
      list.sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''));
      const stale = list.filter(
        (r) => r.state === 'CHANGES_REQUESTED' && r.commit_id !== pr.headRefOid
      );
      if (stale.length === 0) continue;

      const latestStale = stale[stale.length - 1];
      const followUp = list.find(
        (r) =>
          (r.state === 'COMMENTED' || r.state === 'APPROVED') &&
          (r.submitted_at ?? '').localeCompare(latestStale.submitted_at ?? '') > 0
      );
      if (!followUp) continue;

      // Final guard — all required CI checks must be SUCCESS on head.
      const checksClean = await this.allChecksGreen(projectPath, pr.number);
      if (!checksClean) continue;

      for (const sr of stale) {
        const ok = await this.dismiss(
          projectPath,
          pr.number,
          sr.id,
          `Auto-dismissed: superseded by ${followUp.state} review from same bot on later commit ${(followUp.commit_id ?? '').slice(0, 7)}. CI green on head ${pr.headRefOid.slice(0, 7)}.`
        );
        if (ok) {
          dismissed.push(sr.id);
          logger.info(
            `Dismissed stale CHANGES_REQUESTED review ${sr.id} on PR #${pr.number} (bot=${sr.user?.login})`
          );
        }
      }
    }

    return dismissed;
  }

  private async listOpenPRs(projectPath: string): Promise<PROpen[]> {
    const { stdout } = await this.execFileAsync(
      'gh',
      [
        'pr',
        'list',
        '--state',
        'open',
        '--limit',
        '50',
        '--json',
        'number,headRefOid,mergeStateStatus,reviewDecision,url',
      ],
      { cwd: projectPath, encoding: 'utf-8', timeout: 30_000 }
    );
    return JSON.parse(stdout) as PROpen[];
  }

  private async listReviews(projectPath: string, prNumber: number): Promise<PRReview[]> {
    const { owner, repo } = this.repoCoords;
    const { stdout } = await this.execFileAsync(
      'gh',
      ['api', `repos/${owner}/${repo}/pulls/${prNumber}/reviews`],
      { cwd: projectPath, encoding: 'utf-8', timeout: 30_000 }
    );
    return JSON.parse(stdout) as PRReview[];
  }

  private async allChecksGreen(projectPath: string, prNumber: number): Promise<boolean> {
    const { stdout } = await this.execFileAsync(
      'gh',
      ['pr', 'view', String(prNumber), '--json', 'statusCheckRollup'],
      { cwd: projectPath, encoding: 'utf-8', timeout: 30_000 }
    );
    const parsed = JSON.parse(stdout) as { statusCheckRollup: PRCheck[] };
    const checks = parsed.statusCheckRollup ?? [];
    // Conservative: there must be at least one completed check, and zero
    // failures. If anything is still IN_PROGRESS / QUEUED, we hold off — the
    // dismissal will happen on a later sweep when CI settles.
    const completed = checks.filter((c) => c.status === 'COMPLETED');
    if (completed.length === 0) return false;
    if (completed.length < checks.filter((c) => c.name).length) return false;
    return completed.every(
      (c) => c.conclusion === 'SUCCESS' || c.conclusion === 'SKIPPED' || c.conclusion === 'NEUTRAL'
    );
  }

  private async dismiss(
    projectPath: string,
    prNumber: number,
    reviewId: number,
    message: string
  ): Promise<boolean> {
    const { owner, repo } = this.repoCoords;
    try {
      await this.execFileAsync(
        'gh',
        [
          'api',
          `repos/${owner}/${repo}/pulls/${prNumber}/reviews/${reviewId}/dismissals`,
          '-X',
          'PUT',
          '-f',
          `message=${message}`,
        ],
        { cwd: projectPath, encoding: 'utf-8', timeout: 30_000 }
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`Failed to dismiss review ${reviewId} on PR #${prNumber}: ${msg}`);
      return false;
    }
  }
}
