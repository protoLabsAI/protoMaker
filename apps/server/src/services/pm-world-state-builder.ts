/**
 * PM World State Builder
 *
 * Constructs and maintains PMWorldState from project files, milestone status,
 * ceremony schedules, and timeline data. Exposes getDistilledSummary() returning
 * concise markdown. Runs on a 60s refresh interval.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from '@protolabsai/utils';
import type { PMWorldState } from '@protolabsai/types';
import { WorldStateDomain } from '@protolabsai/types';

const logger = createLogger('PMWorldStateBuilder');

const REFRESH_INTERVAL_MS = 60_000;

export interface PMWorldStateBuilderConfig {
  /** Root directory to scan for project files (.automaker/projects/) */
  projectRoot?: string;
}

/**
 * Builds and incrementally refreshes PMWorldState from disk.
 */
export class PMWorldStateBuilder {
  private state: PMWorldState;
  private refreshTimer: NodeJS.Timeout | null = null;
  private readonly projectRoot: string;

  constructor(config: PMWorldStateBuilderConfig = {}) {
    this.projectRoot = config.projectRoot ?? process.cwd();
    this.state = this.emptyState();
  }

  // ────────────────────────── Public API ──────────────────────────

  /** Start the 60s auto-refresh loop. */
  start(): void {
    if (this.refreshTimer) return;
    // Fire immediately, then on interval
    void this.buildState();
    this.refreshTimer = setInterval(() => {
      void this.buildState();
    }, REFRESH_INTERVAL_MS);
  }

  /** Stop the auto-refresh loop. */
  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /** Return the current in-memory world state snapshot. */
  getState(): PMWorldState {
    return this.state;
  }

  /**
   * Return a concise markdown summary suitable for injection into agent context.
   *
   * Format:
   * ## Project Status
   * - slug: status / phase (M completedMilestones/milestoneCount)
   *
   * ## Milestone Progress
   * - title: X/Y phases
   *
   * ## Upcoming Items
   * - dueAt label (projectSlug)
   */
  getDistilledSummary(): string {
    const { projects, milestones, upcomingDeadlines, ceremonies, updatedAt } = this.state;

    const lines: string[] = [`_Last refreshed: ${updatedAt}_`, ''];

    // ── Project Status ────────────────────────────────────────────
    lines.push('## Project Status');
    const projectEntries = Object.entries(projects);
    if (projectEntries.length === 0) {
      lines.push('_No active projects_');
    } else {
      for (const [slug, p] of projectEntries) {
        lines.push(
          `- **${slug}**: ${p.status} / ${p.phase} (${p.completedMilestones}/${p.milestoneCount} milestones)`
        );
      }
    }
    lines.push('');

    // ── Milestone Progress ────────────────────────────────────────
    lines.push('## Milestone Progress');
    const milestoneEntries = Object.entries(milestones);
    if (milestoneEntries.length === 0) {
      lines.push('_No milestones_');
    } else {
      for (const [slug, ms] of milestoneEntries) {
        const pct =
          ms.totalPhases > 0 ? Math.round((ms.completedPhases / ms.totalPhases) * 100) : 0;
        const due = ms.dueAt ? ` (due ${ms.dueAt.slice(0, 10)})` : '';
        lines.push(
          `- **${ms.title}** \`${slug}\`: ${ms.completedPhases}/${ms.totalPhases} phases (${pct}%)${due}`
        );
      }
    }
    lines.push('');

    // ── Upcoming Items ────────────────────────────────────────────
    lines.push('## Upcoming Items');

    // Merge upcomingDeadlines and ceremonies into a single sorted list
    const upcoming: Array<{ dueAt: string; label: string; source: string }> = [];

    for (const d of upcomingDeadlines) {
      upcoming.push({ dueAt: d.dueAt, label: d.label, source: d.projectSlug });
    }
    for (const [type, iso] of Object.entries(ceremonies)) {
      upcoming.push({ dueAt: iso, label: type, source: 'ceremony' });
    }

    upcoming.sort((a, b) => a.dueAt.localeCompare(b.dueAt));

    const now = new Date().toISOString();
    const future = upcoming.filter((u) => u.dueAt >= now);

    if (future.length === 0) {
      lines.push('_No upcoming items_');
    } else {
      for (const item of future.slice(0, 10)) {
        const dateStr = item.dueAt.slice(0, 10);
        lines.push(`- ${dateStr} — ${item.label} _(${item.source})_`);
      }
    }

    return lines.join('\n');
  }

  // ────────────────────────── State Building ──────────────────────────

  /**
   * Read project data from disk and rebuild the PMWorldState.
   * Gracefully handles missing directories or malformed files.
   */
  async buildState(): Promise<void> {
    try {
      const next = this.emptyState();

      await this.loadProjects(next);
      await this.loadCeremonies(next);
      await this.loadTimelines(next);

      next.updatedAt = new Date().toISOString();
      this.state = next;

      logger.debug(`PMWorldState refreshed — ${Object.keys(next.projects).length} projects`);
    } catch (err) {
      logger.warn('PMWorldStateBuilder.buildState() failed, retaining previous state:', err);
    }
  }

  // ────────────────────────── Private Helpers ──────────────────────────

  private emptyState(): PMWorldState {
    return {
      domain: WorldStateDomain.Project,
      updatedAt: new Date().toISOString(),
      projects: {},
      milestones: {},
      ceremonies: {},
      upcomingDeadlines: [],
    };
  }

  /**
   * Scan .automaker/projects/ for project.json files and populate
   * state.projects and state.milestones.
   */
  private async loadProjects(state: PMWorldState): Promise<void> {
    const projectsDir = path.join(this.projectRoot, '.automaker', 'projects');

    let slugs: string[];
    try {
      const entries = await fs.readdir(projectsDir, { withFileTypes: true });
      slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      // .automaker/projects/ may not exist — that's fine
      return;
    }

    for (const slug of slugs) {
      const projectJsonPath = path.join(projectsDir, slug, 'project.json');
      try {
        const raw = await fs.readFile(projectJsonPath, 'utf-8');
        const project = JSON.parse(raw) as {
          status?: string;
          phase?: string;
          milestones?: Array<{
            slug?: string;
            title: string;
            phases?: Array<{ featureId?: string; status?: string }>;
            dueAt?: string;
          }>;
        };

        const milestones = project.milestones ?? [];
        const completedMilestones = milestones.filter((ms) => {
          const phases = ms.phases ?? [];
          if (phases.length === 0) return false;
          return phases.every((p) => p.status === 'done' || p.status === 'verified');
        }).length;

        state.projects[slug] = {
          status: project.status ?? 'active',
          phase: project.phase ?? 'development',
          milestoneCount: milestones.length,
          completedMilestones,
        };

        for (const ms of milestones) {
          const msSlug =
            ms.slug ??
            ms.title
              .toLowerCase()
              .replace(/\s+/g, '-')
              .replace(/[^a-z0-9-]/g, '');
          const phases = ms.phases ?? [];
          const completedPhases = phases.filter(
            (p) => p.status === 'done' || p.status === 'verified'
          ).length;

          state.milestones[msSlug] = {
            title: ms.title,
            totalPhases: phases.length,
            completedPhases,
            dueAt: ms.dueAt,
          };
        }
      } catch {
        // Skip malformed or missing project.json
        logger.debug(`Skipping project ${slug}: could not read project.json`);
      }
    }
  }

  /**
   * Load upcoming ceremony dates from .automaker/ceremony-state.json.
   */
  private async loadCeremonies(state: PMWorldState): Promise<void> {
    const ceremonyStatePath = path.join(this.projectRoot, '.automaker', 'ceremony-state.json');
    try {
      const raw = await fs.readFile(ceremonyStatePath, 'utf-8');
      const data = JSON.parse(raw) as Record<
        string,
        { nextRunAt?: string; nextAt?: string; type?: string }
      >;

      for (const [key, entry] of Object.entries(data)) {
        const nextAt = entry.nextRunAt ?? entry.nextAt;
        if (nextAt) {
          state.ceremonies[entry.type ?? key] = nextAt;
        }
      }
    } catch {
      // ceremony-state.json may not exist — that's fine
    }
  }

  /**
   * Load upcoming deadline entries from .automaker/timeline.json.
   */
  private async loadTimelines(state: PMWorldState): Promise<void> {
    const timelinePath = path.join(this.projectRoot, '.automaker', 'timeline.json');
    try {
      const raw = await fs.readFile(timelinePath, 'utf-8');
      const data = JSON.parse(raw) as Array<{
        projectSlug: string;
        label: string;
        dueAt: string;
      }>;

      if (Array.isArray(data)) {
        for (const entry of data) {
          if (entry.projectSlug && entry.label && entry.dueAt) {
            state.upcomingDeadlines.push({
              projectSlug: entry.projectSlug,
              label: entry.label,
              dueAt: entry.dueAt,
            });
          }
        }
      }
    } catch {
      // timeline.json may not exist — that's fine
    }
  }
}
