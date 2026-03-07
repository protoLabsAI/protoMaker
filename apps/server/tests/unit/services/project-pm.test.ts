/**
 * ProjectPM Module — event subscription tests
 *
 * Verifies that the project-pm.module register() function wires event
 * subscriptions that:
 *   - project:lifecycle:launched → create PM session + append welcome message
 *   - project:completed          → archive PM session
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

// ────────────────────────── Tests ──────────────────────────

describe('project-pm.module — event subscriptions', () => {
  let events: ReturnType<typeof createMockEvents>;
  let projectPmService: ReturnType<typeof createMockProjectPmService>;

  beforeEach(async () => {
    vi.clearAllMocks();
    events = createMockEvents();
    projectPmService = createMockProjectPmService();

    await register({ events, projectPmService } as any);
  });

  describe('project:completed', () => {
    it('should archive PM session on project:completed', async () => {
      events._fire('project:completed', {
        projectPath: '/workspace/my-project',
        projectSlug: 'my-project',
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(projectPmService.archiveSession).toHaveBeenCalledWith(
        '/workspace/my-project',
        'my-project'
      );
    });

    it('should resolve projectSlug from project field when projectSlug is absent', async () => {
      events._fire('project:completed', {
        projectPath: '/workspace/my-project',
        project: 'my-project-alt',
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(projectPmService.archiveSession).toHaveBeenCalledWith(
        '/workspace/my-project',
        'my-project-alt'
      );
    });

    it('should NOT archive when projectPath is missing', async () => {
      events._fire('project:completed', {
        projectSlug: 'my-project',
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(projectPmService.archiveSession).not.toHaveBeenCalled();
    });
  });

  describe('project:lifecycle:launched', () => {
    it('should create PM session and append welcome message', async () => {
      events._fire('project:lifecycle:launched', {
        projectPath: '/workspace/my-project',
        projectSlug: 'my-project',
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(projectPmService.getOrCreateSession).toHaveBeenCalledWith(
        '/workspace/my-project',
        'my-project'
      );
      expect(projectPmService.appendSystemMessage).toHaveBeenCalledWith(
        '/workspace/my-project',
        'my-project',
        expect.stringContaining('my-project')
      );
    });

    it('should NOT create session when projectPath or projectSlug is missing', async () => {
      events._fire('project:lifecycle:launched', {
        projectSlug: 'my-project',
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(projectPmService.getOrCreateSession).not.toHaveBeenCalled();
    });
  });
});
