/**
 * Feature Health Service - Audits the board for state drift and inconsistencies
 *
 * Checks for:
 * - Orphaned features (epicId references non-existent epic)
 * - Merged-but-not-done (branch merged to main but feature not marked done)
 * - Completed epics (all children done but epic still in-progress/backlog)
 * - Stale in-progress (features stuck in running with no active agent)
 * - Dangling dependencies (depend on deleted/non-existent features)
 *
 * Provides dry-run and auto-fix modes.
 */

import { createLogger } from '@protolabs-ai/utils';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { Feature } from '@protolabs-ai/types';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';

const execFileAsync = promisify(execFile);

const logger = createLogger('FeatureHealth');

export interface HealthIssue {
  type:
    | 'orphaned_epic_ref'
    | 'merged_not_done'
    | 'epic_children_done'
    | 'stale_running'
    | 'stale_gate'
    | 'dangling_dependency';
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
    issues.push(...(await this.checkMergedNotDone(features, projectPath)));

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
    const doneStatuses = new Set(['done', 'completed', 'verified', 'review']);

    const epics = features.filter((f) => f.isEpic);

    for (const epic of epics) {
      if (doneStatuses.has(epic.status ?? '')) continue;

      const children = features.filter((f) => f.epicId === epic.id);
      if (children.length === 0) continue;

      const allChildrenDone = children.every((c) => doneStatuses.has(c.status ?? ''));
      if (allChildrenDone) {
        issues.push({
          type: 'epic_children_done',
          featureId: epic.id,
          featureTitle: epic.title ?? epic.id,
          message: `Epic has ${children.length} children, all done, but epic status is '${epic.status}'`,
          autoFixable: true,
          fix: 'Set epic status to done',
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
   * Features with branches that are merged to main (or their epic branch) but not marked done.
   * Uses execFileAsync with argument arrays to prevent command injection.
   */
  private async checkMergedNotDone(
    features: Feature[],
    projectPath: string
  ): Promise<HealthIssue[]> {
    const issues: HealthIssue[] = [];
    const doneStatuses = new Set(['done', 'completed', 'verified', 'review']);

    // Detect default branch (try main first, then master)
    let defaultBranch = 'main';
    try {
      await execFileAsync('git', ['rev-parse', '--verify', 'main'], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 5_000,
      });
    } catch {
      try {
        await execFileAsync('git', ['rev-parse', '--verify', 'master'], {
          cwd: projectPath,
          encoding: 'utf-8',
          timeout: 5_000,
        });
        defaultBranch = 'master';
      } catch {
        // Neither main nor master exist, skip this check
        return issues;
      }
    }

    // Get list of branches merged into the default branch
    let mergedBranches: Set<string>;
    try {
      const { stdout: output } = await execFileAsync('git', ['branch', '--merged', defaultBranch], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 10_000,
      });
      mergedBranches = new Set(
        output
          .split('\n')
          .map((line) => line.trim().replace(/^\*\s*/, ''))
          .filter((b) => b && b !== 'main' && b !== 'master')
      );
    } catch {
      // Git command failed, skip this check
      return issues;
    }

    // Build a map of epic branches for checking child features
    const epicBranchMap = new Map<string, string>();
    for (const f of features) {
      if (f.isEpic && f.branchName) {
        epicBranchMap.set(f.id, f.branchName);
      }
    }

    // Cache epic branch --merged results to avoid redundant git calls
    const epicMergedCache = new Map<string, Set<string>>();

    for (const feature of features) {
      if (!feature.branchName) continue;
      if (doneStatuses.has(feature.status ?? '')) continue;
      if (feature.isEpic) continue; // Epics are handled separately

      let isMerged = mergedBranches.has(feature.branchName);

      // For features with an epicId, also check if branch is merged into the epic branch
      if (!isMerged && feature.epicId) {
        const epicBranch = epicBranchMap.get(feature.epicId);
        if (epicBranch) {
          let epicMergedBranches = epicMergedCache.get(epicBranch);
          if (!epicMergedBranches) {
            try {
              const { stdout: epicMergedOutput } = await execFileAsync(
                'git',
                ['branch', '--merged', epicBranch],
                {
                  cwd: projectPath,
                  encoding: 'utf-8',
                  timeout: 5_000,
                }
              );
              epicMergedBranches = new Set(
                epicMergedOutput
                  .split('\n')
                  .map((line) => line.trim().replace(/^\*\s*/, ''))
                  .filter((b) => b)
              );
              epicMergedCache.set(epicBranch, epicMergedBranches);
            } catch {
              // Epic branch check failed, cache empty set to avoid retrying
              epicMergedBranches = new Set();
              epicMergedCache.set(epicBranch, epicMergedBranches);
            }
          }
          isMerged = epicMergedBranches.has(feature.branchName);
        }
      }

      if (isMerged) {
        const targetBranch =
          feature.epicId && epicBranchMap.get(feature.epicId)
            ? epicBranchMap.get(feature.epicId)!
            : defaultBranch;
        issues.push({
          type: 'merged_not_done',
          featureId: feature.id,
          featureTitle: feature.title ?? feature.id,
          message: `Branch '${feature.branchName}' is merged to ${targetBranch} but feature status is '${feature.status}'`,
          autoFixable: true,
          fix: 'Set status to done',
        });
      }
    }

    return issues;
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

      case 'merged_not_done':
        await this.featureLoader.update(projectPath, issue.featureId, { status: 'done' });
        break;
    }
  }
}
