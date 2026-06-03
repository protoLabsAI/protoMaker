/**
 * Integration test for the app-level pause/resume routes (#4062).
 *
 * Unlike the unit test (which calls the handlers directly), this test builds the
 * REAL `createProjectsRoutes(...)` router with a real `ProjectPauseService`
 * wired to lightweight test doubles, mounts it on an Express app exactly as the
 * server does (under `/api/projects`), and drives it over real HTTP. The point
 * is to catch a broken route wiring — a regression where `/pause` or `/resume`
 * is not registered, mounted at the wrong path, or detached from the service —
 * which a direct-handler unit test cannot detect (per CLAUDE.md: every new
 * service must have an integration test covering its wiring point).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createProjectsRoutes } from '@/routes/projects/index.js';
import { ProjectPauseService } from '@/services/project-pause-service.js';
import type { ProjectService } from '@/services/project-service.js';
import type { AutoModeService } from '@/services/auto-mode-service.js';
import type { SettingsService } from '@/services/settings-service.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import type { EventEmitter } from '@/lib/events.js';
import type { GlobalSettings } from '@protolabsai/types';

describe('projects pause/resume routes — real wiring (#4062)', () => {
  let server: Server;
  let baseUrl: string;

  // In-memory settings the fake SettingsService reads/writes.
  let settings: GlobalSettings;

  // Spies so we can assert the service side effects fire end-to-end.
  const stopAutoLoopForProject = vi.fn(async () => 1);
  const getActiveAutoLoopWorktrees = vi.fn(
    (): Array<{ projectPath: string; branchName: string | null }> => []
  );
  const listProjects = vi.fn(async (_projectPath: string): Promise<string[]> => []);

  beforeAll(async () => {
    settings = { pausedProjects: [] } as unknown as GlobalSettings;

    const settingsService = {
      getGlobalSettings: vi.fn(async () => settings),
      updateGlobalSettings: vi.fn(async (patch: Partial<GlobalSettings>) => {
        settings = { ...settings, ...patch };
        return settings;
      }),
    } as unknown as SettingsService;

    const projectService = {
      listProjects,
      getProject: vi.fn(async () => null),
      updateProject: vi.fn(async () => undefined),
    } as unknown as ProjectService;

    const autoModeService = {
      stopAutoLoopForProject,
      getActiveAutoLoopWorktrees,
    } as unknown as AutoModeService;

    const pauseService = new ProjectPauseService(projectService, autoModeService, settingsService);

    // Build the real router exactly as the server does, then mount under
    // /api/projects to mirror apps/server/src/server/routes.ts.
    const router = createProjectsRoutes(
      {} as unknown as FeatureLoader,
      {} as unknown as EventEmitter,
      projectService,
      undefined,
      undefined,
      pauseService
    );

    const app = express();
    app.use(express.json());
    app.use('/api/projects', router);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  async function post(path: string, body: unknown) {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as Record<string, unknown>;
    return { status: res.status, json };
  }

  it('POST /api/projects/pause records the app and stops loops (200)', async () => {
    getActiveAutoLoopWorktrees.mockReturnValueOnce([
      { projectPath: '/app/x', branchName: null },
      { projectPath: '/app/x', branchName: 'feature/a' },
      { projectPath: '/app/other', branchName: null }, // different app — must be ignored
    ]);

    const { status, json } = await post('/api/projects/pause', {
      projectPath: '/app/x',
      reason: 'maintenance',
    });

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.projectPath).toBe('/app/x');
    expect(json.alreadyPaused).toBe(false);

    // Side effect: the app is now durably recorded as paused.
    expect(settings.pausedProjects?.some((p) => p.projectPath === '/app/x')).toBe(true);

    // Side effect: every active loop for THIS app was stopped (both branches),
    // and the other app's loop was left alone.
    expect(stopAutoLoopForProject).toHaveBeenCalledWith('/app/x', null);
    expect(stopAutoLoopForProject).toHaveBeenCalledWith('/app/x', 'feature/a');
    expect(stopAutoLoopForProject).not.toHaveBeenCalledWith('/app/other', expect.anything());
    // 2 loops stopped, 1 each.
    expect(json.loopsStopped).toBe(2);
  });

  it('POST /api/projects/resume clears the pause registry (200)', async () => {
    // Precondition from the previous test: /app/x is paused.
    expect(settings.pausedProjects?.some((p) => p.projectPath === '/app/x')).toBe(true);

    const { status, json } = await post('/api/projects/resume', { projectPath: '/app/x' });

    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.projectPath).toBe('/app/x');
    expect(json.wasPaused).toBe(true);

    // Side effect: the app is removed from the durable pause registry.
    expect(settings.pausedProjects?.some((p) => p.projectPath === '/app/x')).toBe(false);
  });

  it('POST /api/projects/pause returns 400 when projectPath is missing', async () => {
    const { status, json } = await post('/api/projects/pause', { reason: 'no path' });

    expect(status).toBe(400);
    expect(json.success).toBe(false);
  });

  it('POST /api/projects/resume returns 400 when projectPath is missing', async () => {
    const { status, json } = await post('/api/projects/resume', {});

    expect(status).toBe(400);
    expect(json.success).toBe(false);
  });
});
