/**
 * Unit tests for ProjectPauseService (#4062) — app-level pause/resume.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_GLOBAL_SETTINGS, isProjectPathPaused } from '@protolabsai/types';
import type { GlobalSettings, Project, ProjectStatus } from '@protolabsai/types';
import { ProjectPauseService } from '@/services/project-pause-service.js';
import type { ProjectService } from '@/services/project-service.js';
import type { AutoModeService } from '@/services/auto-mode-service.js';
import type { SettingsService } from '@/services/settings-service.js';

const PROJECT_PATH = '/app/alpha';

function makeProject(slug: string, status: ProjectStatus, extra: Partial<Project> = {}): Project {
  return {
    slug,
    title: slug,
    goal: 'goal',
    status,
    milestones: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

/**
 * Builds a stateful settings stub whose getGlobalSettings reflects prior
 * updateGlobalSettings calls (shallow merge), mirroring the real service.
 */
function makeSettingsService(initial?: Partial<GlobalSettings>) {
  let current: GlobalSettings = {
    ...DEFAULT_GLOBAL_SETTINGS,
    ...initial,
  };
  return {
    getGlobalSettings: vi.fn(async () => current),
    updateGlobalSettings: vi.fn(async (updates: Partial<GlobalSettings>) => {
      current = { ...current, ...updates };
      return current;
    }),
    _peek: () => current,
  };
}

function makeProjectService(projects: Project[]) {
  const bySlug = new Map(projects.map((p) => [p.slug, structuredClone(p)]));
  return {
    listProjects: vi.fn(async () => [...bySlug.keys()].sort()),
    getProject: vi.fn(async (_path: string, slug: string) => bySlug.get(slug) ?? null),
    updateProject: vi.fn(async (_path: string, slug: string, updates: Partial<Project>) => {
      const existing = bySlug.get(slug);
      if (!existing) return null;
      const updated = { ...existing, ...updates } as Project;
      bySlug.set(slug, updated);
      return updated;
    }),
    _peek: (slug: string) => bySlug.get(slug),
  };
}

describe('ProjectPauseService (#4062)', () => {
  let autoModeService: { stopAutoLoopForProject: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    autoModeService = { stopAutoLoopForProject: vi.fn(async () => 1) };
  });

  it('pause records pausedProjects, strips autoModeAlwaysOn, pauses non-terminal slugs, and stops the loop', async () => {
    const settings = makeSettingsService({
      autoModeAlwaysOn: {
        enabled: true,
        projects: [
          { projectPath: PROJECT_PATH, branchName: null },
          { projectPath: '/app/other', branchName: null },
        ],
      },
    });
    const projectService = makeProjectService([
      makeProject('active-one', 'active'),
      makeProject('approved-one', 'approved'),
      makeProject('done-one', 'completed'),
      makeProject('cancelled-one', 'cancelled'),
    ]);

    const service = new ProjectPauseService(
      projectService as unknown as ProjectService,
      autoModeService as unknown as AutoModeService,
      settings as unknown as SettingsService
    );

    const result = await service.pauseProject(PROJECT_PATH, 'maintenance');

    // pausedProjects updated + autoModeAlwaysOn stripped of this projectPath
    const saved = settings._peek();
    expect(isProjectPathPaused(saved, PROJECT_PATH)).toBe(true);
    expect(saved.pausedProjects?.find((p) => p.projectPath === PROJECT_PATH)?.reason).toBe(
      'maintenance'
    );
    expect(saved.autoModeAlwaysOn?.projects.map((p) => p.projectPath)).toEqual(['/app/other']);

    // non-terminal slugs flipped to paused with pausedFrom recorded
    expect(result.slugsPaused.sort()).toEqual(['active-one', 'approved-one']);
    expect(projectService._peek('active-one')?.status).toBe('paused');
    expect(projectService._peek('active-one')?.pausedFrom).toBe('active');
    expect(projectService._peek('approved-one')?.pausedFrom).toBe('approved');

    // terminal slugs untouched
    expect(projectService._peek('done-one')?.status).toBe('completed');
    expect(projectService._peek('cancelled-one')?.status).toBe('cancelled');

    // loop stopped, count surfaced
    expect(autoModeService.stopAutoLoopForProject).toHaveBeenCalledWith(PROJECT_PATH);
    expect(result.loopsStopped).toBe(1);
    expect(result.alreadyPaused).toBe(false);
  });

  it('persists paused intent before stopping the loop (durable even if stop fails)', async () => {
    const settings = makeSettingsService();
    const projectService = makeProjectService([makeProject('active-one', 'active')]);
    autoModeService.stopAutoLoopForProject.mockRejectedValueOnce(new Error('stop failed'));

    const service = new ProjectPauseService(
      projectService as unknown as ProjectService,
      autoModeService as unknown as AutoModeService,
      settings as unknown as SettingsService
    );

    await expect(service.pauseProject(PROJECT_PATH)).rejects.toThrow('stop failed');

    // settings write happened before the loop stop threw
    expect(isProjectPathPaused(settings._peek(), PROJECT_PATH)).toBe(true);
  });

  it('pause is idempotent: re-pausing an already-paused app reports alreadyPaused and dedupes', async () => {
    const settings = makeSettingsService({
      pausedProjects: [{ projectPath: PROJECT_PATH, pausedAt: '2026-01-01T00:00:00.000Z' }],
    });
    const projectService = makeProjectService([makeProject('paused-one', 'paused')]);

    const service = new ProjectPauseService(
      projectService as unknown as ProjectService,
      autoModeService as unknown as AutoModeService,
      settings as unknown as SettingsService
    );

    const result = await service.pauseProject(PROJECT_PATH);

    expect(result.alreadyPaused).toBe(true);
    // already-paused slug is not re-paused
    expect(result.slugsPaused).toEqual([]);
    // dedupe: still exactly one entry
    const entries = settings._peek().pausedProjects?.filter((p) => p.projectPath === PROJECT_PATH);
    expect(entries).toHaveLength(1);
  });

  it('resume removes from pausedProjects and restores pausedFrom status', async () => {
    const settings = makeSettingsService({
      pausedProjects: [{ projectPath: PROJECT_PATH, pausedAt: '2026-01-01T00:00:00.000Z' }],
    });
    const projectService = makeProjectService([
      makeProject('one', 'paused', { pausedFrom: 'active', pauseReason: 'x', pausedAt: 't' }),
      makeProject('two', 'paused', { pausedFrom: 'approved' }),
      makeProject('untouched', 'completed'),
    ]);

    const service = new ProjectPauseService(
      projectService as unknown as ProjectService,
      autoModeService as unknown as AutoModeService,
      settings as unknown as SettingsService
    );

    const result = await service.resumeProject(PROJECT_PATH);

    expect(result.wasPaused).toBe(true);
    expect(isProjectPathPaused(settings._peek(), PROJECT_PATH)).toBe(false);

    expect(result.slugsResumed.sort()).toEqual(['one', 'two']);
    expect(projectService._peek('one')?.status).toBe('active');
    expect(projectService._peek('one')?.pausedFrom).toBeUndefined();
    expect(projectService._peek('one')?.pauseReason).toBeUndefined();
    expect(projectService._peek('two')?.status).toBe('approved');
    expect(projectService._peek('untouched')?.status).toBe('completed');

    // resume must NOT restart auto-mode
    expect(autoModeService.stopAutoLoopForProject).not.toHaveBeenCalled();
  });

  it('resume falls back to active when pausedFrom is missing', async () => {
    const settings = makeSettingsService({
      pausedProjects: [{ projectPath: PROJECT_PATH, pausedAt: 't' }],
    });
    const projectService = makeProjectService([makeProject('one', 'paused')]);

    const service = new ProjectPauseService(
      projectService as unknown as ProjectService,
      autoModeService as unknown as AutoModeService,
      settings as unknown as SettingsService
    );

    await service.resumeProject(PROJECT_PATH);
    expect(projectService._peek('one')?.status).toBe('active');
  });

  it('isPaused reflects the durable registry', async () => {
    const settings = makeSettingsService({
      pausedProjects: [{ projectPath: PROJECT_PATH, pausedAt: 't' }],
    });
    const projectService = makeProjectService([]);
    const service = new ProjectPauseService(
      projectService as unknown as ProjectService,
      autoModeService as unknown as AutoModeService,
      settings as unknown as SettingsService
    );

    expect(await service.isPaused(PROJECT_PATH)).toBe(true);
    expect(await service.isPaused('/app/other')).toBe(false);
  });
});
