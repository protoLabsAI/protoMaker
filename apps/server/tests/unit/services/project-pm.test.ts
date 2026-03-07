/**
 * ProjectPM Module — ProjectStatusSync subscription tests
 *
 * Verifies that the project-pm.module register() function wires event
 * subscriptions that update project.json status on:
 *   - project:completed        → status: 'completed', completedAt: <ISO timestamp>
 *   - project:lifecycle:launched → status: 'active'
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { register } from '@/services/project-pm.module.js';

// ────────────────────────── Mocks ──────────────────────────

function createMockEvents() {
  const handlers = new Map<string, Array<(payload: unknown) => void>>();

  return {
    on: vi.fn((type: string, handler: (payload: unknown) => void) => {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type)!.push(handler);
      return () => {
        const list = handlers.get(type) ?? [];
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
      };
    }),
    emit: vi.fn(),
    subscribe: vi.fn(),
    broadcast: vi.fn(),
    _fire(type: string, payload: unknown) {
      const list = handlers.get(type) ?? [];
      for (const h of list) h(payload);
    },
  };
}

function createMockProjectPmService() {
  return {
    getOrCreateSession: vi.fn(),
    appendSystemMessage: vi.fn(),
    archiveSession: vi.fn().mockResolvedValue(undefined),
    listSessions: vi.fn().mockReturnValue([]),
  };
}

function createMockProjectService() {
  return {
    updateProject: vi.fn().mockResolvedValue(null),
  };
}

// ────────────────────────── Tests ──────────────────────────

describe('project-pm.module — ProjectStatusSync subscriptions', () => {
  let events: ReturnType<typeof createMockEvents>;
  let projectPmService: ReturnType<typeof createMockProjectPmService>;
  let projectService: ReturnType<typeof createMockProjectService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    events = createMockEvents();
    projectPmService = createMockProjectPmService();
    projectService = createMockProjectService();

    await register({ events, projectPmService, projectService } as any);
  });

  describe('project:completed', () => {
    it('should call projectService.updateProject with status completed and completedAt', async () => {
      const before = Date.now();

      events._fire('project:completed', {
        projectPath: '/workspace/my-project',
        projectSlug: 'my-project',
      });

      // Allow any async work to settle
      await new Promise((r) => setTimeout(r, 10));

      expect(projectService.updateProject).toHaveBeenCalledWith(
        '/workspace/my-project',
        'my-project',
        expect.objectContaining({
          status: 'completed',
          completedAt: expect.any(String),
        })
      );

      const call = projectService.updateProject.mock.calls[0];
      const completedAt = new Date(call[2].completedAt as string).getTime();
      expect(completedAt).toBeGreaterThanOrEqual(before);
      expect(completedAt).toBeLessThanOrEqual(Date.now());
    });

    it('should resolve projectSlug from project field when projectSlug is absent', async () => {
      events._fire('project:completed', {
        projectPath: '/workspace/my-project',
        project: 'my-project-alt',
        // no projectSlug
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(projectService.updateProject).toHaveBeenCalledWith(
        '/workspace/my-project',
        'my-project-alt',
        expect.objectContaining({ status: 'completed' })
      );
    });

    it('should NOT call updateProject when projectPath is missing', async () => {
      events._fire('project:completed', {
        projectSlug: 'my-project',
        // no projectPath
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(projectService.updateProject).not.toHaveBeenCalled();
    });
  });

  describe('project:lifecycle:launched', () => {
    it('should call projectService.updateProject with status active', async () => {
      events._fire('project:lifecycle:launched', {
        projectPath: '/workspace/my-project',
        projectSlug: 'my-project',
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(projectService.updateProject).toHaveBeenCalledWith(
        '/workspace/my-project',
        'my-project',
        expect.objectContaining({ status: 'active' })
      );
    });

    it('should NOT call updateProject when projectPath or projectSlug is missing', async () => {
      events._fire('project:lifecycle:launched', {
        projectSlug: 'my-project',
        // no projectPath
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(projectService.updateProject).not.toHaveBeenCalled();
    });
  });
});
