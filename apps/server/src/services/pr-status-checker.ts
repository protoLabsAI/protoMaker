/**
 * PR Status Checker - GitHub API operations for PR review and CI status
 *
 * Handles all GitHub API calls needed by PRFeedbackService:
 * - Fetch PR review decisions (via gh CLI)
 * - Fetch review threads (via GraphQL)
 * - Fetch CI check run results
 */

import { createLogger } from '@protolabsai/utils';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const logger = createLogger('PRStatusChecker');

/** A PR currently being monitored */
export interface TrackedPR {
  featureId: string;
  projectPath: string;
  prNumber: number;
  prUrl: string;
  branchName: string;
  lastCheckedAt: number;
  reviewState: 'pending' | 'changes_requested' | 'approved' | 'commented';
  iterationCount: number;
  lastProcessedReviewAt?: number;
  /** When this PR was first added to tracking (epoch ms) */
  trackedSince?: number;
  ciMonitoring?: {
    headSha: string;
    startedAt: number;
    lastPolledAt: number;
  };
}

/** Review decision and comments fetched from GitHub */
export interface PRReviewInfo {
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING';
  reviews: Array<{
    author: string;
    state: string;
    body: string;
    submittedAt: string;
  }>;
  comments: Array<{
    author: string;
    body: string;
    createdAt: string;
  }>;
}

/** Structured feedback item from a review thread */
export interface ThreadFeedbackItem {
  threadId: string;
  severity: 'critical' | 'warning' | 'suggestion' | 'info';
  category?: string;
  message: string;
  location?: {
    path: string;
    line?: number;
  };
  suggestedFix?: string;
  isBot: boolean;
}

/** Single CI check run result */
export interface CICheckRun {
  name: string;
  status: string;
  conclusion: string | null;
}

/** Failed CI check with output details */
export interface FailedCheck {
  name: string;
  conclusion: string;
  output: string;
}

export class PRStatusChecker {
  /**
   * Fetch PR review status from GitHub using gh CLI.
   * Uses execFileAsync with argument array to prevent command injection.
   */
  async fetchPRReviewStatus(pr: TrackedPR): Promise<PRReviewInfo | null> {
    try {
      const { stdout: reviewJson } = await execFileAsync(
        'gh',
        ['pr', 'view', String(pr.prNumber), '--json', 'reviewDecision,reviews,comments'],
        {
          cwd: pr.projectPath,
          timeout: 15_000,
          encoding: 'utf-8',
        }
      );

      const data = JSON.parse(reviewJson) as {
        reviewDecision: string;
        reviews: Array<{
          author: { login: string };
          state: string;
          body: string;
          submittedAt: string;
        }>;
        comments: Array<{
          author: { login: string };
          body: string;
          createdAt: string;
        }>;
      };

      return {
        state: (data.reviewDecision || 'PENDING') as PRReviewInfo['state'],
        reviews: (data.reviews || []).map((r) => ({
          author: r.author?.login || 'unknown',
          state: r.state,
          body: r.body || '',
          submittedAt: r.submittedAt,
        })),
        comments: (data.comments || []).map((c) => ({
          author: c.author?.login || 'unknown',
          body: c.body || '',
          createdAt: c.createdAt,
        })),
      };
    } catch (error) {
      logger.debug(`gh pr view failed for PR #${pr.prNumber}: ${error}`);
      return null;
    }
  }

  /**
   * Fetch review threads from GitHub using GraphQL.
   * Returns only unresolved threads as structured feedback items.
   */
  async fetchReviewThreads(pr: TrackedPR): Promise<ThreadFeedbackItem[]> {
    const remoteUrl = await this.getRemoteUrl(pr.projectPath);
    const match =
      remoteUrl.match(/github\.com[:/]([^/]+)\/([^/\s]+?)(?:\.git)?$/) ||
      remoteUrl.match(/^([^/]+)\/([^/\s]+)$/);

    if (!match) {
      throw new Error(`Could not parse GitHub owner/repo from remote: ${remoteUrl}`);
    }

    const [, owner, repoName] = match;

    const query = `
      query {
        repository(owner: "${owner}", name: "${repoName}") {
          pullRequest(number: ${pr.prNumber}) {
            reviewThreads(first: 100) {
              nodes {
                id
                isResolved
                comments(first: 10) {
                  nodes {
                    id
                    body
                    author {
                      login
                    }
                    path
                    line
                  }
                }
              }
            }
          }
        }
      }
    `;

    const { stdout } = await execFileAsync(
      'gh',
      ['api', 'graphql', '-f', `query=${query.replace(/\n/g, ' ')}`],
      {
        cwd: pr.projectPath,
        timeout: 15_000,
        encoding: 'utf-8',
      }
    );

    const data = JSON.parse(stdout);
    const threads = data.data?.repository?.pullRequest?.reviewThreads?.nodes || [];

    return threads
      .filter((thread: { isResolved: boolean }) => !thread.isResolved)
      .map(
        (thread: {
          id: string;
          comments: {
            nodes: Array<{
              id: string;
              body: string;
              author: { login: string };
              path?: string;
              line?: number;
            }>;
          };
        }) => {
          const firstComment = thread.comments?.nodes?.[0];
          if (!firstComment) return null;

          const author = firstComment.author.login.toLowerCase();
          const isBot =
            author === 'coderabbitai' ||
            author.includes('coderabbit') ||
            author.includes('github-actions') ||
            author.includes('dependabot');

          const { severity, category, suggestion } = this.parseCommentMetadata(firstComment.body);

          return {
            threadId: thread.id,
            severity,
            category,
            message: this.extractMessage(firstComment.body),
            location: firstComment.path
              ? { path: firstComment.path, line: firstComment.line }
              : undefined,
            suggestedFix: suggestion,
            isBot,
          };
        }
      )
      .filter(Boolean) as ThreadFeedbackItem[];
  }

  /**
   * Fetch the PR's base branch and HEAD commit SHA.
   * Used to detect required status checks that never registered.
   */
  async fetchPRDetails(pr: TrackedPR): Promise<{ baseBranch: string; headSha: string } | null> {
    try {
      const { stdout } = await execFileAsync(
        'gh',
        ['pr', 'view', String(pr.prNumber), '--json', 'baseRefName,headRefOid'],
        {
          cwd: pr.projectPath,
          timeout: 15_000,
          encoding: 'utf-8',
        }
      );

      const data = JSON.parse(stdout) as { baseRefName: string; headRefOid: string };
      return { baseBranch: data.baseRefName, headSha: data.headRefOid };
    } catch (error) {
      logger.debug(`Failed to fetch PR details for PR #${pr.prNumber}: ${error}`);
      return null;
    }
  }

  /**
   * Fetch the names of required status checks configured on a branch's protection rules.
   * Returns an empty array if the branch has no protection or no required checks.
   */
  async fetchRequiredStatusChecks(pr: TrackedPR, baseBranch: string): Promise<string[]> {
    try {
      const { stdout } = await execFileAsync(
        'gh',
        ['api', `repos/{owner}/{repo}/branches/${baseBranch}/protection/required_status_checks`],
        {
          cwd: pr.projectPath,
          timeout: 15_000,
          encoding: 'utf-8',
        }
      );

      const data = JSON.parse(stdout) as {
        contexts?: string[];
        checks?: Array<{ context: string; app_id: number | null }>;
      };

      // Prefer `checks` (newer GitHub API) over `contexts` (deprecated)
      if (data.checks && data.checks.length > 0) {
        return data.checks.map((c) => c.context);
      }
      return data.contexts ?? [];
    } catch (error) {
      // Branch may have no protection configured — this is normal
      logger.debug(`No required status checks found for branch '${baseBranch}': ${error}`);
      return [];
    }
  }

  /**
   * Fetch all CI check runs for a commit SHA.
   */
  async fetchCICheckRuns(pr: TrackedPR, headSha: string): Promise<CICheckRun[]> {
    try {
      const { stdout } = await execFileAsync(
        'gh',
        ['api', `repos/{owner}/{repo}/commits/${headSha}/check-runs`, '--jq', '.check_runs'],
        {
          cwd: pr.projectPath,
          timeout: 15_000,
          encoding: 'utf-8',
        }
      );

      return JSON.parse(stdout) as CICheckRun[];
    } catch (error) {
      logger.debug(`Failed to fetch check runs for ${headSha}: ${error}`);
      return [];
    }
  }

  /**
   * Fetch only failed CI check runs for a commit SHA, with output details.
   * When ciProvider is 'github-actions' (default), fetches GHA job logs as a
   * fallback for checks where the API output is insufficient.
   */
  async fetchFailedChecks(
    pr: TrackedPR,
    headSha: string,
    ciProvider: string = 'github-actions'
  ): Promise<FailedCheck[]> {
    try {
      const { stdout } = await execFileAsync(
        'gh',
        ['api', `repos/{owner}/{repo}/commits/${headSha}/check-runs`, '--jq', '.check_runs'],
        {
          cwd: pr.projectPath,
          timeout: 15_000,
          encoding: 'utf-8',
        }
      );

      const checkRuns = JSON.parse(stdout) as Array<{
        id: number;
        name: string;
        status: string;
        conclusion: string;
        output?: {
          title?: string;
          summary?: string;
          text?: string;
        };
      }>;

      const failedRuns = checkRuns.filter((check) => check.conclusion === 'failure');
      const results: FailedCheck[] = [];

      for (const check of failedRuns) {
        const apiOutput = [check.output?.title, check.output?.summary, check.output?.text]
          .filter(Boolean)
          .join('\n')
          .slice(0, 1000);

        // Use GHA job logs as fallback when check run API output is insufficient
        let output = apiOutput;
        if ((!output || output.trim().length < 50) && ciProvider === 'github-actions') {
          const jobLogs = await this.fetchJobLogs(pr, check.id, ciProvider);
          if (jobLogs) {
            output = jobLogs;
          }
        }

        results.push({
          name: check.name,
          conclusion: check.conclusion,
          output,
        });
      }

      return results;
    } catch (error) {
      logger.debug(`Failed to fetch failed checks for ${headSha}: ${error}`);
      return [];
    }
  }

  /**
   * Fetch GitHub Actions job logs for a specific check run (job ID).
   * Parses the GHA log format (##[group] / ##[endgroup] / ##[error] markers),
   * finds the failing step, and returns the last 200 lines of that step.
   * Returns null for non-GHA providers or on fetch failure.
   */
  async fetchJobLogs(
    pr: TrackedPR,
    checkRunId: number,
    ciProvider: string = 'github-actions'
  ): Promise<string | null> {
    if (ciProvider !== 'github-actions') {
      return null;
    }

    try {
      const { stdout } = await execFileAsync(
        'gh',
        ['api', `repos/{owner}/{repo}/actions/jobs/${checkRunId}/logs`],
        {
          cwd: pr.projectPath,
          timeout: 30_000,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024, // 10 MB — GHA logs can be large
        }
      );

      return this.parseGHAJobLogs(stdout);
    } catch (error) {
      logger.debug(`Failed to fetch job logs for check run ${checkRunId}: ${error}`);
      return null;
    }
  }

  /**
   * Parse GitHub Actions log format to extract the failing step output.
   *
   * GHA log lines look like: "2024-01-01T00:00:00.0000000Z ##[group]Step name"
   * Groups are delimited by ##[group] / ##[endgroup]. Errors appear as ##[error].
   *
   * Strategy:
   * 1. Find the last group (step) that contains a ##[error] line.
   * 2. Return the last 200 lines of that step's content.
   * 3. If no step with errors is found, return the last 200 lines of all content.
   */
  private parseGHAJobLogs(rawLogs: string): string {
    const lines = rawLogs.split('\n');

    // Strip the ISO timestamp prefix from a log line to get the raw content.
    const getContent = (line: string): string =>
      line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z /, '');

    let currentGroupStart = -1;
    let failingGroupStart = -1;
    let failingGroupEnd = -1;

    for (let i = 0; i < lines.length; i++) {
      const content = getContent(lines[i]);

      if (content.startsWith('##[group]')) {
        currentGroupStart = i;
      } else if (content.startsWith('##[endgroup]')) {
        currentGroupStart = -1;
      } else if (content.startsWith('##[error]')) {
        // Mark the enclosing group as the failing step, or use a local window.
        if (currentGroupStart >= 0) {
          failingGroupStart = currentGroupStart;
          failingGroupEnd = i;
        } else {
          // Error outside a group — capture a window around it
          failingGroupStart = Math.max(0, i - 10);
          failingGroupEnd = i;
        }
      }
    }

    let relevantLines: string[];
    if (failingGroupStart >= 0) {
      const end = failingGroupEnd >= 0 ? failingGroupEnd + 1 : lines.length;
      relevantLines = lines.slice(failingGroupStart, end);
    } else {
      relevantLines = lines;
    }

    // Truncate to last 200 lines of the relevant section
    return relevantLines.slice(-200).join('\n');
  }

  private async getRemoteUrl(projectPath: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd: projectPath,
      timeout: 15_000,
      encoding: 'utf-8',
    });
    return stdout.trim();
  }

  private parseCommentMetadata(body: string): {
    severity: ThreadFeedbackItem['severity'];
    category?: string;
    suggestion?: string;
  } {
    const severityMatch = body.match(/\*\*Severity\*\*:\s*(\w+)/i);
    let severity: ThreadFeedbackItem['severity'] = 'info';

    if (severityMatch) {
      const sev = severityMatch[1].toLowerCase();
      if (sev === 'critical' || sev === 'high') severity = 'critical';
      else if (sev === 'warning' || sev === 'medium') severity = 'warning';
      else if (sev === 'suggestion' || sev === 'low') severity = 'suggestion';
    } else {
      if (body.includes('🚨')) severity = 'critical';
      else if (body.includes('⚠️')) severity = 'warning';
      else if (body.includes('💡')) severity = 'suggestion';
    }

    const categoryMatch = body.match(/\*\*Category\*\*:\s*([^\n]+)/i);
    const category = categoryMatch?.[1]?.trim();

    const suggestionMatch = body.match(/\*\*Suggestion\*\*:\s*([^\n]+(?:\n(?!\*\*)[^\n]+)*)/i);
    const suggestion = suggestionMatch?.[1]?.trim();

    return { severity, category, suggestion };
  }

  private extractMessage(body: string): string {
    const messageMatch = body.match(/^(.+?)(?:\n\n|\*\*)/s);
    const message = (messageMatch?.[1] || body).trim().replace(/^(?:🐰|🔍|💡|⚠️|🚨)\s*/u, '');
    return message;
  }
}

export const prStatusChecker = new PRStatusChecker();
