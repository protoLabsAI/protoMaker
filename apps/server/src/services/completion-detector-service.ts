/**
 * Completion Detector Service
 *
 * Reacts to feature status changes and cascades through:
 *   feature done → epic done → milestone completed → project completed
 *
 * Emits events that CeremonyService already listens for (milestone:completed,
 * project:completed) so ceremonies fire automatically when the board reflects
 * completion — no polling required.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { ProjectService } from './project-service.js';
import type { SettingsService } from './settings-service.js';
import type { Feature, Milestone } from '@protolabsai/types';

const execFileAsync = promisify(execFile);

const logger = createLogger('CompletionDetector');

/** Payload shape for auto-mode feature complete events */
interface AutoModeFeatureCompletePayload {
  type: string;
  featureId: string;
  projectPath: string;
  passes?: boolean;
  [key: string]: unknown;
}

/** Payload shape for manual feature status change events */
interface FeatureStatusChangedPayload {
  projectPath: string;
  featureId: string;
  previousStatus: string;
  newStatus: string;
}

/** Entry recorded in the completion-emitted.jsonl sidecar */
interface CompletionLedgerEntry {
  type: 'epic' | 'milestone' | 'project';
  key: string;
  timestamp: string;
}

export class CompletionDetectorService {
  private emitter: EventEmitter | null = null;
  private featureLoader: FeatureLoader | null = null;
  private projectService: ProjectService | null = null;
  private settingsService: SettingsService | null = null;
  private unsubscribe: (() => void) | null = null;
  private dataDir: string | null = null;

  /** Dedup guard: track epics/milestones/projects we've already emitted completion for */
  private emittedEpics = new Set<string>();
  private emittedMilestones = new Set<string>();
  private emittedProjects = new Set<string>();

  /** Observability counters for engine status API */
  private completionCounts = { epics: 0, milestones: 0, projects: 0 };

  private getLedgerPath(): string | null {
    if (!this.dataDir) return null;
    return path.join(this.dataDir, 'ledger', 'completion-emitted.jsonl');
  }

  /**
   * Load existing completion keys from the JSONL sidecar file.
   * Pre-populates the in-memory Sets so warm restarts suppress duplicate events.
   */
  private async loadLedger(): Promise<void> {
    const ledgerPath = this.getLedgerPath();
    if (!ledgerPath) return;

    if (!fs.existsSync(ledgerPath)) {
      logger.debug('CompletionDetector: no existing ledger file, starting fresh');
      return;
    }

    try {
      const rl = readline.createInterface({
        input: fs.createReadStream(ledgerPath, 'utf-8'),
        crlfDelay: Infinity,
      });

      let loaded = 0;
      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const entry = JSON.parse(trimmed) as CompletionLedgerEntry;
          if (entry.type === 'epic' && entry.key) {
            this.emittedEpics.add(entry.key);
            loaded++;
          } else if (entry.type === 'milestone' && entry.key) {
            this.emittedMilestones.add(entry.key);
            loaded++;
          } else if (entry.type === 'project' && entry.key) {
            this.emittedProjects.add(entry.key);
            loaded++;
          }
        } catch {
          // skip malformed lines
        }
      }

      logger.debug(`CompletionDetector: loaded ${loaded} completion keys from ledger`);
    } catch (err) {
      logger.warn('CompletionDetector: failed to load ledger:', err);
    }
  }

  /**
   * Append a completion key to the JSONL sidecar — fire-and-forget.
   */
  private appendLedgerEntry(type: 'epic' | 'milestone' | 'project', key: string): void {
    const ledgerPath = this.getLedgerPath();
    if (!ledgerPath) return;

    const entry: CompletionLedgerEntry = { type, key, timestamp: new Date().toISOString() };
    const line = JSON.stringify(entry) + '\n';

    void (async () => {
      try {
        await fs.promises.mkdir(path.dirname(ledgerPath), { recursive: true });
        await fs.promises.appendFile(ledgerPath, line, 'utf-8');
      } catch (err) {
        logger.error('CompletionDetector: failed to write ledger entry:', err);
      }
    })();
  }

  initialize(
    emitter: EventEmitter,
    featureLoader: FeatureLoader,
    projectService: ProjectService,
    dataDir?: string,
    settingsService?: SettingsService
  ): void {
    this.emitter = emitter;
    this.featureLoader = featureLoader;
    this.projectService = projectService;
    this.settingsService = settingsService ?? null;
    this.dataDir = dataDir ?? null;

    // Load ledger asynchronously to pre-populate dedup Sets from disk
    void this.loadLedger();

    this.unsubscribe = emitter.subscribe((type, payload) => {
      // Auto-mode completion (agent finished successfully)
      if (type === 'auto-mode:event') {
        const data = payload as AutoModeFeatureCompletePayload;
        if (data.type === 'auto_mode_feature_complete' && data.passes) {
          void this.onFeatureDone(data.projectPath, data.featureId);
        }
      }

      // Manual board move (user drags to done via UI/API)
      if (type === 'feature:status-changed') {
        const data = payload as FeatureStatusChangedPayload;
        if (data.newStatus === 'done') {
          void this.onFeatureDone(data.projectPath, data.featureId);
        }
      }
    });

    logger.info('Completion detector initialized');
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.emitter = null;
    this.featureLoader = null;
    this.projectService = null;
    this.settingsService = null;
    this.dataDir = null;
    this.emittedEpics.clear();
    this.emittedMilestones.clear();
    this.emittedProjects.clear();
  }

  /**
   * Get observability status for engine status API
   */
  getStatus(): {
    completionCounts: { epics: number; milestones: number; projects: number };
    emittedMilestones: number;
    emittedProjects: number;
  } {
    return {
      completionCounts: { ...this.completionCounts },
      emittedMilestones: this.emittedMilestones.size,
      emittedProjects: this.emittedProjects.size,
    };
  }

  /**
   * Core handler: a feature moved to "done". Check cascading completions.
   */
  private async onFeatureDone(projectPath: string, featureId: string): Promise<void> {
    try {
      const feature = await this.featureLoader!.get(projectPath, featureId);
      if (!feature) return;

      // 1. Epic completion check
      if (feature.epicId) {
        await this.checkEpicCompletion(projectPath, feature.epicId);
      }

      // 2. Milestone completion check
      if (feature.projectSlug && feature.milestoneSlug) {
        await this.checkMilestoneCompletion(
          projectPath,
          feature.projectSlug,
          feature.milestoneSlug
        );
      }
    } catch (error) {
      logger.error(`Completion check failed for feature ${featureId}:`, error);
    }
  }

  /**
   * Check if all children of an epic are done. If the epic has a branch,
   * create a PR from the epic branch to dev (or the configured base branch)
   * and move the epic to "review". The epic only reaches "done" when the
   * GitHub webhook detects that the epic-to-dev PR has merged.
   *
   * If the epic has no branch (manual or non-git epic), mark done directly.
   */
  private async checkEpicCompletion(projectPath: string, epicId: string): Promise<void> {
    const dedupeKey = `${projectPath}:${epicId}`;
    if (this.emittedEpics.has(dedupeKey)) return;

    const allFeatures = await this.featureLoader!.getAll(projectPath);
    const children = allFeatures.filter((f) => f.epicId === epicId && f.id !== epicId);

    if (children.length === 0) return;

    const allDone = children.every((f) => f.status === 'done');
    if (!allDone) return;

    const epic = allFeatures.find((f) => f.id === epicId);
    if (!epic || epic.status === 'done' || epic.status === 'review') return;

    // Claim dedup slot before async work to prevent race conditions
    this.emittedEpics.add(dedupeKey);
    this.appendLedgerEntry('epic', dedupeKey);
    this.completionCounts.epics++;

    // If the epic has a branch, create the epic-to-dev PR instead of marking done
    if (epic.branchName) {
      const result = await this.createEpicToDevPR(projectPath, epicId, epic);
      if (result) {
        // PR created successfully — move epic to review
        await this.featureLoader!.update(projectPath, epicId, {
          status: 'review',
          prNumber: result.prNumber,
          prUrl: result.prUrl,
          statusChangeReason: `All ${children.length} child features completed — epic-to-dev PR #${result.prNumber} created with auto-merge`,
        });
        this.emitter!.emit('epic:pr-created', {
          epicFeatureId: epicId,
          projectPath,
          epicBranchName: epic.branchName,
          prNumber: result.prNumber,
          prUrl: result.prUrl,
        });
        logger.info(
          `Epic "${epic.title}" moved to review — PR #${result.prNumber} created to merge ${epic.branchName} into dev`
        );
        return;
      }
      // PR creation failed — fall through to block the epic
      await this.featureLoader!.update(projectPath, epicId, {
        status: 'blocked',
        statusChangeReason: `All child features done but epic-to-dev PR creation failed for branch ${epic.branchName}. Manual intervention required — create PR from ${epic.branchName} to dev.`,
      });
      logger.warn(
        `Epic "${epic.title}" blocked — failed to create epic-to-dev PR for ${epic.branchName}`
      );
      return;
    }

    // No branch — mark done directly (manual or non-git epic)
    logger.info(`All children of epic "${epic.title}" are done — marking epic done (no branch)`);
    await this.featureLoader!.update(projectPath, epicId, { status: 'done' });

    this.emitter!.emit('feature:completed', {
      projectPath,
      featureId: epicId,
      featureTitle: epic.title,
      projectSlug: epic.projectSlug,
      isEpic: true,
    });

    // Epic completion may itself trigger milestone/project checks
    if (epic.projectSlug && epic.milestoneSlug) {
      await this.checkMilestoneCompletion(projectPath, epic.projectSlug, epic.milestoneSlug);
    }
  }

  /**
   * Create a PR from the epic branch to the project's base branch (default: dev)
   * and enable auto-merge with --merge strategy.
   *
   * Returns { prNumber, prUrl } on success, or null on failure.
   */
  private async createEpicToDevPR(
    projectPath: string,
    epicId: string,
    epic: Feature
  ): Promise<{ prNumber: number; prUrl: string } | null> {
    const epicBranch = epic.branchName!;

    // Resolve the base branch from settings (default: dev)
    let baseBranch = 'dev';
    if (this.settingsService) {
      try {
        const settings = await this.settingsService.getGlobalSettings();
        baseBranch = settings.gitWorkflow?.prBaseBranch ?? 'dev';
      } catch {
        // fall back to dev
      }
    }

    try {
      // Check if an open PR from this epic branch already exists
      const { stdout: existingPrs } = await execFileAsync(
        'gh',
        [
          'pr',
          'list',
          '--head',
          epicBranch,
          '--base',
          baseBranch,
          '--state',
          'open',
          '--json',
          'number,url',
          '--limit',
          '1',
        ],
        { cwd: projectPath, timeout: 15000 }
      );
      const existing = JSON.parse(existingPrs.trim() || '[]') as Array<{
        number: number;
        url: string;
      }>;

      if (existing.length > 0) {
        // PR already exists — ensure auto-merge is enabled and return it
        const pr = existing[0];
        await execFileAsync('gh', ['pr', 'merge', String(pr.number), '--merge', '--auto'], {
          cwd: projectPath,
          timeout: 15000,
        }).catch(() => {
          // auto-merge may already be enabled, ignore
        });
        logger.info(
          `Epic "${epic.title}" — reusing existing PR #${pr.number} from ${epicBranch} to ${baseBranch}`
        );
        return { prNumber: pr.number, prUrl: pr.url };
      }

      // Build child feature summary for PR body
      const allFeatures = await this.featureLoader!.getAll(projectPath);
      const children = allFeatures.filter((f) => f.epicId === epicId && f.id !== epicId);
      const childList = children
        .map((f) => `- ${f.title}${f.prUrl ? ` (${f.prUrl})` : ''}`)
        .join('\n');

      const body = `## Epic: ${epic.title}\n\nAll child features completed. This PR merges the epic branch into ${baseBranch}.\n\n### Features included:\n${childList}\n\n---\nAuto-generated by CompletionDetectorService.`;

      // Create the PR — use execFile with argument array to prevent shell injection
      const { stdout: prOutput } = await execFileAsync(
        'gh',
        [
          'pr',
          'create',
          '--base',
          baseBranch,
          '--head',
          epicBranch,
          '--title',
          `epic: ${epic.title}`,
          '--body',
          body,
        ],
        { cwd: projectPath, timeout: 30000 }
      );
      const prUrl = prOutput.trim();

      // Extract PR number from URL (https://github.com/org/repo/pull/123)
      const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
      if (!prNumberMatch) {
        logger.error(`Failed to parse PR number from: ${prUrl}`);
        return null;
      }
      const prNumber = parseInt(prNumberMatch[1], 10);

      // Enable auto-merge with --merge strategy (never squash on promotion PRs)
      await execFileAsync('gh', ['pr', 'merge', String(prNumber), '--merge', '--auto'], {
        cwd: projectPath,
        timeout: 15000,
      }).catch((err) => {
        logger.warn(`Failed to enable auto-merge on epic PR #${prNumber} (non-fatal):`, err);
      });

      logger.info(
        `Created epic-to-dev PR #${prNumber}: ${epicBranch} → ${baseBranch} with auto-merge`
      );
      return { prNumber, prUrl };
    } catch (err) {
      logger.error(`Failed to create epic-to-dev PR for ${epicBranch}:`, err);
      return null;
    }
  }

  /**
   * Check if all features belonging to a milestone are done.
   * Uses milestoneSlug on features as the primary signal; falls back to
   * phase featureId links when features lack milestoneSlug (e.g. epic-child features).
   * All milestone phases must also be scaffolded (have featureId) before completion fires.
   * If so, emit milestone:completed (CeremonyService picks this up).
   */
  private async checkMilestoneCompletion(
    projectPath: string,
    projectSlug: string,
    milestoneSlug: string
  ): Promise<void> {
    const dedupeKey = `${projectPath}:${projectSlug}:${milestoneSlug}`;
    if (this.emittedMilestones.has(dedupeKey)) return;

    const project = await this.projectService!.getProject(projectPath, projectSlug);
    if (!project) return;

    const milestone = project.milestones.find((m) => m.slug === milestoneSlug);
    if (!milestone || milestone.status === 'completed') return;

    const allFeatures = await this.featureLoader!.getAll(projectPath);

    // Guard: all phases must be scaffolded (every phase has a featureId assigned)
    if (!milestone.phases.length || !milestone.phases.every((p) => p.featureId)) return;

    // Primary check: query features by milestoneSlug
    const milestoneFeatures = allFeatures.filter((f) => f.milestoneSlug === milestoneSlug);

    if (milestoneFeatures.length > 0) {
      // Features explicitly reference this milestone — use them as ground truth
      if (!milestoneFeatures.every((f) => f.status === 'done')) return;
    } else {
      // Fallback: no features have milestoneSlug set (e.g. epic-child features)
      // Fall back to checking each phase's feature by its featureId
      for (const phase of milestone.phases) {
        const feature = allFeatures.find((f) => f.id === phase.featureId);
        if (!feature || feature.status !== 'done') return;
      }
    }

    // Mark milestone completed
    this.completionCounts.milestones++;
    this.emittedMilestones.add(dedupeKey);
    this.appendLedgerEntry('milestone', dedupeKey);
    milestone.status = 'completed';
    await this.projectService!.updateProject(projectPath, projectSlug, {
      status: project.status,
      milestones: project.milestones,
    });

    // Aggregate stats
    const stats = this.aggregateMilestoneStats(milestone, allFeatures);
    const milestoneNumber = project.milestones.findIndex((m) => m.slug === milestoneSlug) + 1;

    logger.info(
      `Milestone "${milestone.title}" (${milestoneNumber}/${project.milestones.length}) completed`
    );

    this.emitter!.emit('milestone:completed', {
      projectPath,
      projectTitle: project.title,
      projectSlug,
      milestoneSlug,
      milestoneTitle: milestone.title,
      milestoneNumber,
      featureCount: stats.featureCount,
      totalCostUsd: stats.totalCostUsd,
      failureCount: stats.failureCount,
      prUrls: stats.prUrls,
      featureSummaries: stats.featureSummaries,
    });

    // Check if ALL milestones are now completed → project done
    await this.checkProjectCompletion(projectPath, projectSlug);
  }

  /**
   * Check if all milestones in a project are completed.
   * If so, emit project:completed (CeremonyService picks this up).
   */
  private async checkProjectCompletion(projectPath: string, projectSlug: string): Promise<void> {
    const dedupeKey = `${projectPath}:${projectSlug}`;
    if (this.emittedProjects.has(dedupeKey)) return;

    const project = await this.projectService!.getProject(projectPath, projectSlug);
    if (!project || project.status === 'completed') return;

    // Ongoing projects never auto-complete — they are persistent containers
    if (project.ongoing) return;

    const allCompleted = project.milestones.every((m) => m.status === 'completed');
    if (!allCompleted) return;

    this.completionCounts.projects++;
    this.emittedProjects.add(dedupeKey);
    this.appendLedgerEntry('project', dedupeKey);
    await this.projectService!.updateProject(projectPath, projectSlug, {
      status: 'completed',
    });

    // Aggregate project-wide stats
    const allFeatures = await this.featureLoader!.getAll(projectPath);
    const stats = this.aggregateProjectStats(project.milestones, allFeatures);

    logger.info(`Project "${project.title}" fully completed!`);

    this.emitter!.emit('project:completed', {
      projectPath,
      projectTitle: project.title,
      projectSlug,
      totalMilestones: project.milestones.length,
      totalFeatures: stats.totalFeatures,
      totalCostUsd: stats.totalCostUsd,
      failureCount: stats.failureCount,
      milestoneSummaries: stats.milestoneSummaries,
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private aggregateMilestoneStats(
    milestone: Milestone,
    allFeatures: Feature[]
  ): {
    featureCount: number;
    totalCostUsd: number;
    failureCount: number;
    prUrls: string[];
    featureSummaries: Array<{
      id: string;
      title: string;
      status: string;
      costUsd: number;
      prUrl?: string;
      failureCount?: number;
    }>;
  } {
    const milestoneFeatures = allFeatures.filter((f) =>
      milestone.phases.some((p) => p.featureId === f.id)
    );

    let totalCostUsd = 0;
    let failureCount = 0;
    const prUrls: string[] = [];
    const featureSummaries: Array<{
      id: string;
      title: string;
      status: string;
      costUsd: number;
      prUrl?: string;
      failureCount?: number;
    }> = [];

    for (const feature of milestoneFeatures) {
      const costUsd = feature.costUsd || 0;
      const featureFailures = feature.failureCount || 0;

      totalCostUsd += costUsd;
      if (featureFailures > 0) failureCount++;
      if (feature.prUrl) prUrls.push(feature.prUrl);

      featureSummaries.push({
        id: feature.id,
        title: feature.title || 'Untitled',
        status: feature.status || 'backlog',
        costUsd,
        prUrl: feature.prUrl,
        failureCount: featureFailures,
      });
    }

    return {
      featureCount: milestoneFeatures.length,
      totalCostUsd,
      failureCount,
      prUrls,
      featureSummaries,
    };
  }

  private aggregateProjectStats(
    milestones: Milestone[],
    allFeatures: Feature[]
  ): {
    totalFeatures: number;
    totalCostUsd: number;
    failureCount: number;
    milestoneSummaries: Array<{
      milestoneTitle: string;
      featureCount: number;
      costUsd: number;
    }>;
  } {
    let totalFeatures = 0;
    let totalCostUsd = 0;
    let failureCount = 0;
    const milestoneSummaries: Array<{
      milestoneTitle: string;
      featureCount: number;
      costUsd: number;
    }> = [];

    for (const milestone of milestones) {
      const stats = this.aggregateMilestoneStats(milestone, allFeatures);
      totalFeatures += stats.featureCount;
      totalCostUsd += stats.totalCostUsd;
      failureCount += stats.failureCount;

      milestoneSummaries.push({
        milestoneTitle: milestone.title,
        featureCount: stats.featureCount,
        costUsd: stats.totalCostUsd,
      });
    }

    return { totalFeatures, totalCostUsd, failureCount, milestoneSummaries };
  }
}

// Singleton
export const completionDetectorService = new CompletionDetectorService();
