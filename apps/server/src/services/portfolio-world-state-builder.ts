/**
 * PortfolioWorldStateBuilder — Aggregates per-project sitreps into a single
 * fleet-wide status snapshot. Fetches all project sitreps in parallel via the
 * Automaker API and computes portfolio-level metrics.
 */

import { createLogger } from '@protolabsai/utils';
import path from 'node:path';

const logger = createLogger('PortfolioWorldStateBuilder');

const DEFAULT_API_KEY = 'protoLabs_studio_key';

interface ProjectSitrep {
  board: {
    total: number;
    backlog: number;
    inProgress: number;
    review: number;
    blocked: number;
    done: number;
  };
  autoMode: {
    running: boolean;
    loopRunning: boolean;
    runningCount: number;
    maxConcurrency: number;
    humanBlockedCount: number;
  };
  blockedFeatures: Array<{
    id: string;
    title: string;
    reason: string;
    failureCount: number;
  }>;
  reviewFeatures: Array<{
    id: string;
    title: string;
    prNumber?: number;
    prUrl?: string;
  }>;
  escalations: Array<{
    id: string;
    title: string;
    status: string;
    failureCount: number;
    reason: string;
    classification?: string;
  }>;
  stagingDelta: {
    commitsAhead: number;
    commits: string[];
  };
}

export interface ProjectPortfolioEntry {
  slug: string;
  name: string;
  path: string;
  health: 'green' | 'yellow' | 'red';
  activeAgents: number;
  backlogDepth: number;
  blockedCount: number;
  errorBudgetStatus: 'healthy' | 'warning' | 'exhausted';
  topReadyFeature: { id: string; title: string } | null;
  stagingLagCommits: number;
  weeklyThroughput: number;
}

export interface PortfolioSitrep {
  generatedAt: string;
  projects: ProjectPortfolioEntry[];
  portfolioMetrics: {
    totalActiveAgents: number;
    globalWipUtilization: number;
    crossRepoBlockedCount: number;
    portfolioFlowEfficiency: number;
    topConstraint: string | null;
    /**
     * Plain-English summary of the top cross-repo blocker for the executive dashboard.
     * Only present when there is at least one cross-repo blocked feature.
     */
    topCrossRepoBlocker?: string;
  };
  pendingHumanDecisions: Array<{
    projectSlug: string;
    type: 'pr_review' | 'escalation' | 'prioritization_needed';
    ageMs: number;
    description: string;
  }>;
}

type FetchResult = {
  projectPath: string;
  sitrep: ProjectSitrep | null;
  error?: string;
};

export class PortfolioWorldStateBuilder {
  private readonly projectPaths: string[];
  private readonly automakerBaseUrl: string;
  private readonly apiKey: string;

  constructor({
    projectPaths,
    automakerBaseUrl,
  }: {
    projectPaths: string[];
    automakerBaseUrl: string;
  }) {
    this.projectPaths = projectPaths;
    this.automakerBaseUrl = automakerBaseUrl;
    this.apiKey = process.env.AUTOMAKER_API_KEY || DEFAULT_API_KEY;
  }

  async aggregate(): Promise<PortfolioSitrep> {
    if (this.projectPaths.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        projects: [],
        portfolioMetrics: {
          totalActiveAgents: 0,
          globalWipUtilization: 0,
          crossRepoBlockedCount: 0,
          portfolioFlowEfficiency: 0,
          topConstraint: null,
        },
        pendingHumanDecisions: [],
      };
    }

    // Fetch all project sitreps in parallel
    const results = await Promise.all(
      this.projectPaths.map((projectPath) => this.fetchProjectSitrep(projectPath))
    );

    const projects: ProjectPortfolioEntry[] = results.map((result) => {
      const slug = path.basename(result.projectPath);
      if (result.error || !result.sitrep) {
        return {
          slug,
          name: slug,
          path: result.projectPath,
          health: 'red' as const,
          activeAgents: 0,
          backlogDepth: 0,
          blockedCount: 0,
          errorBudgetStatus: 'exhausted' as const,
          topReadyFeature: null,
          stagingLagCommits: 0,
          weeklyThroughput: 0,
        };
      }
      const sitrep = result.sitrep;
      return {
        slug,
        name: slug,
        path: result.projectPath,
        health: this.calculateHealthStatus(sitrep),
        activeAgents: sitrep.autoMode.runningCount,
        backlogDepth: sitrep.board.backlog,
        blockedCount: sitrep.board.blocked,
        errorBudgetStatus: this.calculateErrorBudgetStatus(sitrep),
        topReadyFeature: null,
        stagingLagCommits: sitrep.stagingDelta.commitsAhead,
        weeklyThroughput: sitrep.board.done,
      };
    });

    const totalActiveAgents = projects.reduce((sum, p) => sum + p.activeAgents, 0);
    const crossRepoBlockedCount = projects.reduce((sum, p) => sum + p.blockedCount, 0);
    const systemMaxConcurrency = this.deriveSystemMaxConcurrency(results);
    const globalWipUtilization =
      systemMaxConcurrency > 0 ? totalActiveAgents / systemMaxConcurrency : 0;

    const portfolioFlowEfficiency = this.computeFlowEfficiency(results);
    const topConstraint = this.deriveTopConstraint(results);
    const pendingHumanDecisions = this.aggregatePendingDecisions(results);

    // Fetch cross-repo dependency data from the local API to surface the top blocker
    const topCrossRepoBlocker = await this.fetchTopCrossRepoBlocker(this.projectPaths);

    return {
      generatedAt: new Date().toISOString(),
      projects,
      portfolioMetrics: {
        totalActiveAgents,
        globalWipUtilization,
        crossRepoBlockedCount,
        portfolioFlowEfficiency,
        topConstraint,
        ...(topCrossRepoBlocker ? { topCrossRepoBlocker } : {}),
      },
      pendingHumanDecisions,
    };
  }

  private async fetchProjectSitrep(projectPath: string): Promise<FetchResult> {
    try {
      const response = await fetch(`${this.automakerBaseUrl}/api/sitrep`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify({ projectPath }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'unknown error');
        logger.error(`Sitrep fetch failed for ${projectPath}: HTTP ${response.status} — ${text}`);
        return { projectPath, sitrep: null, error: `HTTP ${response.status}` };
      }

      const sitrep = (await response.json()) as ProjectSitrep;
      return { projectPath, sitrep };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Sitrep fetch failed for ${projectPath}:`, message);
      return { projectPath, sitrep: null, error: message };
    }
  }

  private calculateHealthStatus(sitrep: ProjectSitrep): 'green' | 'yellow' | 'red' {
    const errorBudgetStatus = this.calculateErrorBudgetStatus(sitrep);
    if (sitrep.board.blocked > 0 || errorBudgetStatus === 'exhausted') {
      return 'red';
    }
    if (
      sitrep.board.backlog > 10 ||
      (sitrep.autoMode.runningCount === 0 && sitrep.board.backlog > 0)
    ) {
      return 'yellow';
    }
    return 'green';
  }

  private calculateErrorBudgetStatus(sitrep: ProjectSitrep): 'healthy' | 'warning' | 'exhausted' {
    if (sitrep.escalations.length >= 3 || sitrep.board.blocked > 5) {
      return 'exhausted';
    }
    if (sitrep.escalations.length > 0 || sitrep.board.blocked > 0) {
      return 'warning';
    }
    return 'healthy';
  }

  private deriveSystemMaxConcurrency(results: FetchResult[]): number {
    for (const { sitrep } of results) {
      if (sitrep && sitrep.autoMode.maxConcurrency > 0) {
        return sitrep.autoMode.maxConcurrency;
      }
    }
    return 10;
  }

  private deriveTopConstraint(results: FetchResult[]): string | null {
    let topProjectPath: string | null = null;
    let topSitrep: ProjectSitrep | null = null;
    let maxBlocked = 0;

    for (const { projectPath, sitrep } of results) {
      if (sitrep && sitrep.board.blocked > maxBlocked) {
        maxBlocked = sitrep.board.blocked;
        topProjectPath = projectPath;
        topSitrep = sitrep;
      }
    }

    if (!topProjectPath || !topSitrep || maxBlocked === 0) {
      return null;
    }

    const slug = path.basename(topProjectPath);
    const firstBlockedReason = topSitrep.blockedFeatures[0]?.reason;
    const reasonSuffix = firstBlockedReason ? ` — ${firstBlockedReason}` : '';
    return `${maxBlocked} feature${maxBlocked !== 1 ? 's' : ''} blocked in ${slug}${reasonSuffix}`;
  }

  /**
   * Flow efficiency = done / total across all projects.
   * Represents the fraction of work that has been completed (throughput / total work visible).
   * Returns 0 when no sitrep data is available.
   */
  private computeFlowEfficiency(results: FetchResult[]): number {
    let totalDone = 0;
    let totalFeatures = 0;

    for (const { sitrep } of results) {
      if (!sitrep) continue;
      totalDone += sitrep.board.done;
      totalFeatures += sitrep.board.total;
    }

    return totalFeatures > 0 ? totalDone / totalFeatures : 0;
  }

  private aggregatePendingDecisions(
    results: FetchResult[]
  ): PortfolioSitrep['pendingHumanDecisions'] {
    const decisions: PortfolioSitrep['pendingHumanDecisions'] = [];

    for (const { projectPath, sitrep, error } of results) {
      const slug = path.basename(projectPath);

      if (error || !sitrep) {
        decisions.push({
          projectSlug: slug,
          type: 'escalation',
          ageMs: 0,
          description: `Sitrep fetch failed: ${error ?? 'unknown error'}`,
        });
        continue;
      }

      for (const rf of sitrep.reviewFeatures) {
        decisions.push({
          projectSlug: slug,
          type: 'pr_review',
          ageMs: 0,
          description: `PR review needed: ${rf.title}${rf.prNumber ? ` (#${rf.prNumber})` : ''}`,
        });
      }

      for (const esc of sitrep.escalations) {
        decisions.push({
          projectSlug: slug,
          type: 'escalation',
          ageMs: 0,
          description: `Feature escalated: ${esc.title} (${esc.failureCount} failures) — ${esc.reason}`,
        });
      }

      if (sitrep.board.backlog > 10) {
        decisions.push({
          projectSlug: slug,
          type: 'prioritization_needed',
          ageMs: 0,
          description: `Backlog depth ${sitrep.board.backlog} exceeds threshold in ${slug}`,
        });
      }
    }

    // Sort by ageMs descending (oldest first)
    return decisions.sort((a, b) => b.ageMs - a.ageMs);
  }

  /**
   * Fetches the cross-repo dependency graph from the local API and returns
   * a plain-English summary of the top blocker for the executive dashboard.
   * Returns null if there are no cross-repo blocked features or on error.
   */
  private async fetchTopCrossRepoBlocker(projectPaths: string[]): Promise<string | null> {
    try {
      const params =
        projectPaths.length > 0
          ? `?projectPaths=${projectPaths.map(encodeURIComponent).join(',')}`
          : '';
      const response = await fetch(
        `${this.automakerBaseUrl}/api/portfolio/cross-repo-deps${params}`,
        {
          headers: { 'X-API-Key': this.apiKey },
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (!response.ok) return null;

      const data = (await response.json()) as {
        totalCrossRepoBlocked?: number;
        topBlocker?: {
          appPath: string;
          featureId: string;
          description: string;
          blockedFeatureCount: number;
        } | null;
      };

      if (!data.totalCrossRepoBlocked || data.totalCrossRepoBlocked === 0) return null;

      const top = data.topBlocker;
      if (!top)
        return `${data.totalCrossRepoBlocked} feature(s) blocked by cross-repo dependencies`;

      const appName = path.basename(top.appPath);
      return `${top.blockedFeatureCount} feature(s) blocked waiting on ${appName}:${top.featureId} — ${top.description}`;
    } catch {
      // Non-critical — silently return null
      return null;
    }
  }
}
