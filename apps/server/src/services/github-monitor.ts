/**
 * GitHub Monitor Service
 *
 * Monitors GitHub for pull requests needing review.
 * Used by QA Engineer agents to detect new PRs and provide quality reviews.
 */

import type { EventEmitter } from '../lib/events.js';
import type { GitHubMonitorConfig, WorkItem } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { SchedulerService } from './scheduler-service.js';

const execFileAsync = promisify(execFile);
const logger = createLogger('GitHubMonitor');

/**
 * GitHub PR with metadata
 */
export interface GitHubPRItem {
  number: number;
  title: string;
  description: string;
  author: string;
  branch: string;
  baseBranch: string;
  state: 'open' | 'closed' | 'merged';
  labels: string[];
  createdAt: string;
  updatedAt: string;
  url: string;
  isDraft: boolean;
}

/**
 * GitHubMonitor - Polls GitHub for new PRs
 *
 * Used by headsdown agents (especially QA Engineer) to detect:
 * - New PRs needing review
 * - PR updates (new commits, comments)
 * - PRs ready for merge
 */
export class GitHubMonitor {
  static readonly INTERVAL_ID = 'github-monitor:poll';

  /** Last PR check timestamp */
  private lastCheckTime?: string;

  /** Active polling interval */
  private interval?: NodeJS.Timeout;

  /** Project path for gh CLI execution */
  private projectPath?: string;

  /** Scheduler service for centralized timer tracking */
  private schedulerService?: SchedulerService;

  constructor(private events: EventEmitter) {}

  setSchedulerService(schedulerService: SchedulerService): void {
    this.schedulerService = schedulerService;
  }

  /**
   * Set the project path for GitHub operations
   */
  setProjectPath(projectPath: string): void {
    this.projectPath = projectPath;
  }

  /**
   * Start monitoring GitHub PRs
   */
  async startMonitoring(config: GitHubMonitorConfig): Promise<void> {
    const { pollInterval = 30000, labelFilter = [] } = config;

    // Start polling loop via schedulerService if available, else raw setInterval
    if (this.schedulerService) {
      this.schedulerService.registerInterval(
        GitHubMonitor.INTERVAL_ID,
        'GitHub PR Monitor',
        pollInterval,
        () => this.pollPRs(labelFilter)
      );
    } else {
      this.interval = setInterval(async () => {
        try {
          await this.pollPRs(labelFilter);
        } catch (error) {
          logger.error(`Error polling GitHub PRs:`, error);
        }
      }, pollInterval);
    }

    logger.info(`Started monitoring GitHub PRs`);
  }

  /**
   * Stop monitoring
   */
  stopAll(): void {
    if (this.schedulerService) {
      this.schedulerService.unregisterInterval(GitHubMonitor.INTERVAL_ID);
      logger.info(`Stopped monitoring GitHub PRs`);
    } else if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
      logger.info(`Stopped monitoring GitHub PRs`);
    }
  }

  /**
   * Poll for new or updated PRs
   */
  private async pollPRs(labelFilter: string[]): Promise<void> {
    const prs = await this.fetchPRs(labelFilter);

    for (const pr of prs) {
      // Check if PR is new or updated since last check
      if (!this.lastCheckTime || new Date(pr.updatedAt) > new Date(this.lastCheckTime)) {
        // Emit event for QA agents
        this.events.emit('github:pr:detected', {
          pr,
        });

        logger.info(`Detected PR needing review: #${pr.number} - ${pr.title}`);
      }
    }

    // Update last check time
    this.lastCheckTime = new Date().toISOString();
  }

  /**
   * Fetch open PRs from GitHub using gh CLI
   */
  private async fetchPRs(labelFilter: string[]): Promise<GitHubPRItem[]> {
    if (!this.projectPath) {
      logger.debug('Project path not set, skipping PR fetch');
      return [];
    }

    try {
      // Build the gh CLI command to fetch open PRs with metadata
      const args = [
        'pr',
        'list',
        '--state',
        'open',
        '--json',
        'number,title,body,author,headRefName,baseRefName,labels,createdAt,updatedAt,url,isDraft',
      ];

      // Execute gh CLI with argument array (prevents command injection)
      const { stdout: jsonOutput } = await execFileAsync('gh', args, {
        cwd: this.projectPath,
        timeout: 15_000,
        encoding: 'utf-8',
      });

      const prData = JSON.parse(jsonOutput) as Array<{
        number: number;
        title: string;
        body: string;
        author: { login: string };
        headRefName: string;
        baseRefName: string;
        labels: Array<{ name: string }>;
        createdAt: string;
        updatedAt: string;
        url: string;
        isDraft: boolean;
      }>;

      // Transform gh CLI response to GitHubPRItem
      const prs: GitHubPRItem[] = prData
        .filter((pr) => {
          // Filter by labels if specified
          if (labelFilter.length === 0) return true;
          const prLabels = pr.labels.map((l) => l.name);
          return labelFilter.some((label) => prLabels.includes(label));
        })
        .map((pr) => ({
          number: pr.number,
          title: pr.title,
          description: pr.body || '',
          author: pr.author?.login || 'unknown',
          branch: pr.headRefName,
          baseBranch: pr.baseRefName,
          state: 'open',
          labels: pr.labels.map((l) => l.name),
          createdAt: pr.createdAt,
          updatedAt: pr.updatedAt,
          url: pr.url,
          isDraft: pr.isDraft,
        }));

      logger.debug(`Fetched ${prs.length} open PRs from GitHub`);
      return prs;
    } catch (error) {
      logger.debug(`Failed to fetch PRs from GitHub:`, error);
      return [];
    }
  }

  /**
   * Convert GitHub PR to WorkItem for headsdown agents
   */
  static prToWorkItem(pr: GitHubPRItem): WorkItem {
    return {
      type: 'github_pr',
      id: `pr-${pr.number}`,
      priority: pr.isDraft ? 5 : 2, // Draft PRs lower priority
      description: `PR #${pr.number}: ${pr.title}`,
      url: pr.url,
      metadata: {
        prNumber: pr.number,
        author: pr.author,
        branch: pr.branch,
        baseBranch: pr.baseBranch,
        labels: pr.labels,
        isDraft: pr.isDraft,
      },
    };
  }

  /**
   * Check if monitoring is active
   */
  isMonitoring(): boolean {
    if (this.schedulerService) {
      return this.schedulerService.listAll().some((t) => t.id === GitHubMonitor.INTERVAL_ID);
    }
    return this.interval !== undefined;
  }
}
