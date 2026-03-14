/**
 * Feature Health Service - Audits the board for state drift and inconsistencies
 *
 * Checks for:
 * - Orphaned features (epicId references non-existent epic)
 * - Completed epics (all children done but epic still in-progress/backlog)
 * - Stale in-progress (features stuck in running with no active agent)
 * - Dangling dependencies (depend on deleted/non-existent features)
 * - Stale pipeline gates (awaiting gate beyond timeout threshold)
 *
 * Provides dry-run and auto-fix modes.
 * Note: merged-not-done detection was removed. PR merge -> done transitions are
 * handled synchronously by the primary webhook handler at
 * apps/server/src/routes/webhooks/routes/github.ts.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';
import type { Feature } from '@protolabsai/types';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';

const execFileAsync = promisify(execFile);

const logger = createLogger('FeatureHealth');

/** Maximum age for a concurrency lease before it is considered stale (45 minutes). */
const STALE_LEASE_MAX_AGE_MS = 45 * 60 * 1000;

export interface HealthIssue {
  type:
    | 'orphaned_epic_ref'
    | 'epic_children_done'
    | 'stale_running'
    | 'stale_gate'
    | 'dangling_dependency'
    | 'closed_pr_in_review'
    | 'stale_lease';
  featureId: string;
  featureTitle: string;
  message: string;
  autoFixable: boolean;
  fix?: string;
}

export interface HealthReport {
  checkedAt: string;
  totalFeatures: number;
  issues: HealthIssue[];
  fixed: HealthIssue[];
}

export class FeatureHealthService {
  constructor(
    private readonly featureLoader: FeatureLoader,
    private readonly autoModeService: AutoModeService
  ) {}

  /**
   * Run a full health audit on the board.
   * @param projectPath - Project to audit
   * @param autoFix - If true, automatically fix auto-fixable issues
   */
  async audit(projectPath: string, autoFix = false): Promise<HealthReport> {
    logger.info(`Running board health audit for ${projectPath} (autoFix=${autoFix})`);

    const features = await this.featureLoader.getAll(projectPath);
    const featureMap = new Map(features.map((f) => [f.id, f]));

    const issues: HealthIssue[] = [];
    const fixed: HealthIssue[] = [];

    // Run all checks
    issues.push(...this.checkOrphanedEpicRefs(features, featureMap));
    issues.push(...this.checkDanglingDependencies(features, featureMap));
    issues.push(...this.checkEpicChildrenDone(features, featureMap));
    issues.push(...(await this.checkStaleRunning(features, projectPath)));
    issues.push(...this.checkStaleGates(features));
    issues.push(...(await this.checkClosedPRsInReview(features)));
    issues.push(...this.checkStaleLeases());

    // Auto-fix if requested
    if (autoFix) {
      for (const issue of issues) {
        if (!issue.autoFixable) continue;

        try {
          await this.applyFix(projectPath, issue, featureMap);
          fixed.push(issue);
          logger.info(`Auto-fixed: ${issue.message}`);
        } catch (error) {
          logger.error(`Failed to auto-fix ${issue.featureId}: ${error}`);
        }
      }
    }

    const report: HealthReport = {
      checkedAt: new Date().toISOString(),
      totalFeatures: features.length,
      issues,
      fixed,
    };

    logger.info(`Health audit complete: ${issues.length} issues found, ${fixed.length} fixed`);

    return report;
  }

  /**
   * Features whose epicId points to a non-existent or non-epic feature.
   */
  private checkOrphanedEpicRefs(
    features: Feature[],
    featureMap: Map<string, Feature>
  ): HealthIssue[] {
    const issues: HealthIssue[] = [];

    for (const feature of features) {
      if (!feature.epicId) continue;

      const epic = featureMap.get(feature.epicId);
      if (!epic) {
        issues.push({
          type: 'orphaned_epic_ref',
          featureId: feature.id,
          featureTitle: feature.title ?? feature.id,
          message: `Feature references non-existent epic ${feature.epicId}`,
          autoFixable: true,
          fix: 'Clear epicId reference',
        });
      } else if (!epic.isEpic) {
        issues.push({
          type: 'orphaned_epic_ref',
          featureId: feature.id,
          featureTitle: feature.title ?? feature.id,
          message: `Feature references ${feature.epicId} which is not an epic`,
          autoFixable: true,
          fix: 'Clear epicId reference',
        });
      }
    }

    return issues;
  }

  /**
   * Features that depend on non-existent features.
   */
  private checkDanglingDependencies(
    features: Feature[],
    featureMap: Map<string, Feature>
  ): HealthIssue[] {
    const issues: HealthIssue[] = [];

    for (const feature of features) {
      if (!feature.dependencies || feature.dependencies.length === 0) continue;

      const dangling = feature.dependencies.filter((depId) => !featureMap.has(depId));
      if (dangling.length > 0) {
        issues.push({
          type: 'dangling_dependency',
          featureId: feature.id,
          featureTitle: feature.title ?? feature.id,
          message: `Feature depends on ${dangling.length} non-existent feature(s): ${dangling.join(', ')}`,
          autoFixable: true,
          fix: 'Remove dangling dependency IDs',
        });
      }
    }

    return issues;
  }

  /**
   * Epics where all child features are done but the epic isn't.
   */
  private checkEpicChildrenDone(
    features: Feature[],
    _featureMap: Map<string, Feature>
  ): HealthIssue[] {
    const issues: HealthIssue[] = [];
    const doneStatuses = new Set(['done', 'completed', 'verified']);

    const epics = features.filter((f) => f.isEpic);

    for (const epic of epics) {
      if (doneStatuses.has(epic.status ?? '')) continue;

      const children = features.filter((f) => f.epicId === epic.id);
      if (children.length === 0) continue;

      const allChildrenDone = children.every((c) => doneStatuses.has(c.status ?? ''));
      if (allChildrenDone) {
        const hasGitBranch = !!epic.branchName;
        issues.push({
          type: 'epic_children_done',
          featureId: epic.id,
          featureTitle: epic.title ?? epic.id,
          message: `Epic has ${children.length} children, all done, but epic status is '${epic.status}'`,
          autoFixable: !hasGitBranch,
          fix: hasGitBranch
            ? 'Delegate to CompletionDetectorService for epic-to-dev PR creation'
            : 'Set epic status to done',
        });
      }
    }

    return issues;
  }

  /**
   * Features in running/in-progress/in_progress status with no active agent.
   */
  private async checkStaleRunning(
    features: Feature[],
    projectPath: string
  ): Promise<HealthIssue[]> {
    const issues: HealthIssue[] = [];
    const runningStatuses = new Set(['running', 'in-progress', 'in_progress']);

    const runningFeatures = features.filter((f) => runningStatuses.has(f.status ?? ''));
    if (runningFeatures.length === 0) return issues;

    const runningAgents = await this.autoModeService.getRunningAgents();
    // Filter agents by projectPath so we only compare against agents for this project
    const activeAgentIds = new Set(
      runningAgents.filter((a) => a.projectPath === projectPath).map((a) => a.featureId)
    );

    for (const feature of runningFeatures) {
      if (activeAgentIds.has(feature.id)) continue;

      issues.push({
        type: 'stale_running',
        featureId: feature.id,
        featureTitle: feature.title ?? feature.id,
        message: `Feature status is '${feature.status}' but no agent is running for it`,
        autoFixable: true,
        fix: 'Reset status to backlog',
      });
    }

    return issues;
  }

  /**
   * Features stuck awaiting a pipeline gate for longer than the timeout threshold.
   */
  private checkStaleGates(features: Feature[]): HealthIssue[] {
    const GATE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour
    const now = Date.now();
    const issues: HealthIssue[] = [];
    // Never move terminal-status features to blocked — stale gate metadata on
    // completed features is harmless and must not undo already-shipped work.
    const TERMINAL_STATUSES = new Set(['done', 'verified', 'completed', 'review']);

    for (const feature of features) {
      if (TERMINAL_STATUSES.has(feature.status ?? '')) continue;
      const ps = feature.pipelineState;
      if (!ps?.awaitingGate) continue;

      // Use gateWaitingSince if available, fall back to last phaseHistory timestamp
      let gateStartMs: number | null = null;
      if (ps.gateWaitingSince) {
        gateStartMs = new Date(ps.gateWaitingSince).getTime();
      } else if (ps.phaseHistory?.length) {
        const last = ps.phaseHistory[ps.phaseHistory.length - 1];
        gateStartMs = new Date(last.timestamp).getTime();
      }

      if (gateStartMs && now - gateStartMs > GATE_TIMEOUT_MS) {
        const waitHours = ((now - gateStartMs) / (1000 * 60 * 60)).toFixed(1);
        issues.push({
          type: 'stale_gate',
          featureId: feature.id,
          featureTitle: feature.title ?? feature.id,
          message: `Feature awaiting ${ps.awaitingGatePhase ?? 'unknown'} gate for ${waitHours}h`,
          autoFixable: true,
          fix: 'Move to blocked status',
        });
      }
    }
    return issues;
  }

  /**
   * Concurrency leases that have outlived their agents.
   *
   * If an agent process exits without releasing its lease (crash, OOM, etc.),
   * the slot stays occupied indefinitely. This check releases leases older
   * than STALE_LEASE_MAX_AGE_MS and reports them as auto-fixed issues.
   */
  private checkStaleLeases(): HealthIssue[] {
    const released = this.autoModeService.releaseStaleLeases(STALE_LEASE_MAX_AGE_MS);
    return released.map((featureId) => ({
      type: 'stale_lease' as const,
      featureId,
      featureTitle: featureId,
      message: `Concurrency lease for feature ${featureId} exceeded ${STALE_LEASE_MAX_AGE_MS / 60_000}min — forcefully released`,
      autoFixable: false, // Already released inline; no further fix needed
    }));
  }

  /**
   * Apply an auto-fix for a given issue.
   */
  private async applyFix(
    projectPath: string,
    issue: HealthIssue,
    featureMap: Map<string, Feature>
  ): Promise<void> {
    switch (issue.type) {
      case 'orphaned_epic_ref':
        await this.featureLoader.update(projectPath, issue.featureId, { epicId: undefined });
        break;

      case 'dangling_dependency': {
        const feature = featureMap.get(issue.featureId);
        if (feature?.dependencies) {
          const validDeps = feature.dependencies.filter((depId) => featureMap.has(depId));
          await this.featureLoader.update(projectPath, issue.featureId, {
            dependencies: validDeps,
          });
        }
        break;
      }

      case 'epic_children_done':
        await this.featureLoader.update(projectPath, issue.featureId, { status: 'done' });
        break;

      case 'stale_running':
        await this.featureLoader.update(projectPath, issue.featureId, { status: 'backlog' });
        break;

      case 'stale_gate':
        await this.featureLoader.update(projectPath, issue.featureId, { status: 'blocked' });
        break;

      case 'closed_pr_in_review': {
        const feature = featureMap.get(issue.featureId);
        await this.featureLoader.update(projectPath, issue.featureId, {
          status: 'backlog',
          statusChangeReason: `PR closed without merging (detected by board health audit) — auto-recovering to backlog`,
          prNumber: undefined,
          prUrl: undefined,
          reviewStartedAt: undefined,
        });
        logger.info(
          `Auto-fixed closed_pr_in_review: feature ${issue.featureId} recovered to backlog (was PR #${feature?.prNumber})`
        );
        break;
      }
    }
  }

  /**
   * Features in 'review' status whose linked PR has been closed without merging.
   * Compensating control for missed webhooks (runs on 6-hour board health cycle).
   */
  private async checkClosedPRsInReview(features: Feature[]): Promise<HealthIssue[]> {
    const issues: HealthIssue[] = [];
    const reviewFeatures = features.filter((f) => f.status === 'review' && f.prNumber != null);

    for (const feature of reviewFeatures) {
      const prNumber = feature.prNumber!;
      try {
        const { stdout } = await execFileAsync(
          'gh',
          ['pr', 'view', String(prNumber), '--json', 'state,merged'],
          { encoding: 'utf-8', timeout: 10_000 }
        );
        const prData = JSON.parse(stdout) as { state: string; merged: boolean };

        if (prData.state === 'CLOSED' && !prData.merged) {
          issues.push({
            type: 'closed_pr_in_review',
            featureId: feature.id,
            featureTitle: feature.title ?? feature.id,
            message: `PR #${prNumber} is closed without merging but feature status is 'review'`,
            autoFixable: true,
            fix: 'Reset status to backlog and clear PR fields',
          });
        }
      } catch {
        // gh CLI not available, PR not found, or network error — skip
        logger.debug(`Skipping closed PR check for feature ${feature.id} PR #${prNumber}`);
      }
    }

    return issues;
  }
}
