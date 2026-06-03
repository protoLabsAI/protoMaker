/**
 * Project Pause Service - App-level pause/resume
 *
 * Pause is keyed by `projectPath` (one app/projectPath may hold many project
 * slugs under `.automaker/projects/`). The durable, enforced source of truth is
 * the `pausedProjects` list in global settings; while paused, auto-mode refuses
 * to start a loop for the projectPath. We also reflect `status: 'paused'` on
 * every non-terminal project slug in the app for board visibility.
 *
 * Resume restores each slug's prior status (`pausedFrom`) and removes the app
 * from the pause registry. It does NOT auto-restart auto-mode.
 */

import type { GlobalSettings, ProjectStatus } from '@protolabsai/types';
import { isProjectPathPaused } from '@protolabsai/types';
import { createLogger } from '@protolabsai/utils';
import type { ProjectService } from './project-service.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('ProjectPauseService');

/** Statuses that are terminal/already-paused and must not be overwritten by pause. */
const NON_PAUSABLE_STATUSES: ReadonlySet<ProjectStatus> = new Set<ProjectStatus>([
  'completed',
  'cancelled',
  'paused',
]);

export interface PauseProjectResult {
  projectPath: string;
  slugsPaused: string[];
  loopsStopped: number;
  alreadyPaused: boolean;
}

export interface ResumeProjectResult {
  projectPath: string;
  slugsResumed: string[];
  wasPaused: boolean;
}

export class ProjectPauseService {
  constructor(
    private readonly projectService: ProjectService,
    private readonly autoModeService: AutoModeService,
    private readonly settingsService: SettingsService
  ) {}

  /**
   * Pause an app/projectPath. Idempotent: re-pausing an already-paused app still
   * re-enforces the paused state. Settings are written first (durable intent),
   * then the loop is stopped — so a stop failure still leaves the paused state.
   */
  async pauseProject(projectPath: string, reason?: string): Promise<PauseProjectResult> {
    const settings = await this.settingsService.getGlobalSettings();

    const existingPaused = settings.pausedProjects ?? [];
    const alreadyPaused = existingPaused.some((p) => p.projectPath === projectPath);
    const pausedAt = new Date().toISOString();

    // (b) add to pausedProjects, deduped by projectPath
    const pausedProjects = [
      ...existingPaused.filter((p) => p.projectPath !== projectPath),
      { projectPath, reason, pausedAt },
    ];

    // (c) remove from autoModeAlwaysOn.projects so it won't re-arm on restart
    const autoModeAlwaysOn = settings.autoModeAlwaysOn
      ? {
          ...settings.autoModeAlwaysOn,
          projects: settings.autoModeAlwaysOn.projects.filter((p) => p.projectPath !== projectPath),
        }
      : settings.autoModeAlwaysOn;

    // (d) persist intent durably before touching the loop
    await this.settingsService.updateGlobalSettings({ pausedProjects, autoModeAlwaysOn });

    // (e) reflect status='paused' on every non-terminal project slug
    const slugsPaused: string[] = [];
    const slugs = await this.projectService.listProjects(projectPath);
    for (const slug of slugs) {
      const project = await this.projectService.getProject(projectPath, slug);
      if (!project) continue;
      if (NON_PAUSABLE_STATUSES.has(project.status)) continue;

      await this.projectService.updateProject(projectPath, slug, {
        status: 'paused',
        pausedFrom: project.status,
        pauseReason: reason,
        pausedAt,
      });
      slugsPaused.push(slug);
    }

    // (f) stop the running loop (best-effort — durable state already recorded)
    const loopsStopped = await this.autoModeService.stopAutoLoopForProject(projectPath);

    logger.info(
      `Paused app ${projectPath}: ${slugsPaused.length} slug(s) paused, ${loopsStopped} loop(s) stopped${
        alreadyPaused ? ' (was already paused)' : ''
      }`
    );

    return { projectPath, slugsPaused, loopsStopped, alreadyPaused };
  }

  /**
   * Resume an app/projectPath. Removes it from the pause registry and restores
   * each paused slug's prior status. Does NOT restart auto-mode.
   */
  async resumeProject(projectPath: string): Promise<ResumeProjectResult> {
    const settings = await this.settingsService.getGlobalSettings();

    const existingPaused = settings.pausedProjects ?? [];
    const wasPaused = existingPaused.some((p) => p.projectPath === projectPath);

    // (a) remove from pausedProjects registry
    const pausedProjects = existingPaused.filter((p) => p.projectPath !== projectPath);
    await this.settingsService.updateGlobalSettings({ pausedProjects });

    // (b) restore prior status on every currently-paused slug
    const slugsResumed: string[] = [];
    const slugs = await this.projectService.listProjects(projectPath);
    for (const slug of slugs) {
      const project = await this.projectService.getProject(projectPath, slug);
      if (!project) continue;
      if (project.status !== 'paused') continue;

      const restoredStatus: ProjectStatus = project.pausedFrom ?? 'active';
      await this.projectService.updateProject(projectPath, slug, {
        status: restoredStatus,
        pausedFrom: undefined,
        pauseReason: undefined,
        pausedAt: undefined,
      });
      slugsResumed.push(slug);
    }

    // (c) do NOT restart auto-mode — resume is intentionally inert on loops.
    logger.info(
      `Resumed app ${projectPath}: ${slugsResumed.length} slug(s) restored${
        wasPaused ? '' : ' (was not in pause registry)'
      }`
    );

    return { projectPath, slugsResumed, wasPaused };
  }

  /** Whether the given app/projectPath is currently paused per global settings. */
  async isPaused(projectPath: string): Promise<boolean> {
    const settings: GlobalSettings = await this.settingsService.getGlobalSettings();
    return isProjectPathPaused(settings, projectPath);
  }
}
