/**
 * Unit tests for ProjectAssignmentService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProjectAssignmentService } from '@/services/project-assignment-service.js';

// Mock loadProtoConfig from @protolabsai/platform
vi.mock('@protolabsai/platform', () => ({
  loadProtoConfig: vi.fn(),
  secureFs: {
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
  },
}));

import { loadProtoConfig } from '@protolabsai/platform';
const mockLoadProtoConfig = vi.mocked(loadProtoConfig);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeProject = (overrides: Record<string, unknown> = {}) => ({
  id: `proj-${Math.random()}`,
  slug: 'my-project',
  title: 'My Project',
  goal: 'Build something',
  status: 'active' as const,
  milestones: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const makeProjectService = () => ({
  listProjects: vi.fn<() => Promise<string[]>>().mockResolvedValue([]),
  getProject: vi.fn<() => Promise<ReturnType<typeof makeProject> | null>>().mockResolvedValue(null),
  updateProject: vi
    .fn<() => Promise<ReturnType<typeof makeProject> | null>>()
    .mockImplementation(async (_path, _slug, updates) => {
      return makeProject(updates as Record<string, unknown>);
    }),
});

const makeCrdtSyncService = (instanceId = 'instance-alpha') => ({
  getInstanceId: vi.fn().mockReturnValue(instanceId),
  getPeers: vi.fn().mockReturnValue([]),
});

const makeEventEmitter = () => ({
  emit: vi.fn(),
  broadcast: vi.fn(),
  subscribe: vi.fn(),
  on: vi.fn(),
  setRemoteBroadcaster: vi.fn(),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProjectAssignmentService', () => {
  const PROJECT_PATH = '/mock/project';
  const PROJECT_SLUG = 'my-project';
  const INSTANCE_ID = 'instance-alpha';

  let projectService: ReturnType<typeof makeProjectService>;
  let crdtSyncService: ReturnType<typeof makeCrdtSyncService>;
  let eventEmitter: ReturnType<typeof makeEventEmitter>;
  let service: ProjectAssignmentService;

  beforeEach(() => {
    vi.clearAllMocks();
    projectService = makeProjectService();
    crdtSyncService = makeCrdtSyncService(INSTANCE_ID);
    eventEmitter = makeEventEmitter();
    service = new ProjectAssignmentService(
      projectService as unknown as import('@/services/project-service.js').ProjectService,
      crdtSyncService as unknown as import('@/services/crdt-sync-service.js').CrdtSyncService,
      eventEmitter as unknown as import('@/lib/events.js').EventEmitter
    );
  });

  afterEach(() => {
    // Ensure any running intervals are cleaned up between tests
    service.stopPeriodicFailoverCheck();
  });

  // ─── assignProject ─────────────────────────────────────────────────────────

  describe('assignProject()', () => {
    it('calls updateProject with assignedTo, assignedAt, assignedBy', async () => {
      const result = await service.assignProject(
        PROJECT_PATH,
        PROJECT_SLUG,
        'instance-beta',
        'instance-alpha'
      );

      expect(projectService.updateProject).toHaveBeenCalledOnce();
      const [path, slug, updates] = projectService.updateProject.mock.calls[0];
      expect(path).toBe(PROJECT_PATH);
      expect(slug).toBe(PROJECT_SLUG);
      expect(updates).toMatchObject({
        assignedTo: 'instance-beta',
        assignedBy: 'instance-alpha',
      });
      expect(typeof (updates as Record<string, string>).assignedAt).toBe('string');
      expect(result).not.toBeNull();
    });

    it('returns null when project does not exist', async () => {
      projectService.updateProject.mockResolvedValue(null);
      const result = await service.assignProject(PROJECT_PATH, 'nonexistent', 'x', 'y');
      expect(result).toBeNull();
    });
  });

  // ─── unassignProject ───────────────────────────────────────────────────────

  describe('unassignProject()', () => {
    it('calls updateProject with undefined assignment fields', async () => {
      await service.unassignProject(PROJECT_PATH, PROJECT_SLUG);

      expect(projectService.updateProject).toHaveBeenCalledOnce();
      const [path, slug, updates] = projectService.updateProject.mock.calls[0];
      expect(path).toBe(PROJECT_PATH);
      expect(slug).toBe(PROJECT_SLUG);
      expect(updates).toMatchObject({
        assignedTo: undefined,
        assignedAt: undefined,
        assignedBy: undefined,
      });
    });
  });

  // ─── getAssignments ────────────────────────────────────────────────────────

  describe('getAssignments()', () => {
    it('returns assignment records for assigned projects', async () => {
      projectService.listProjects.mockResolvedValue(['proj-a', 'proj-b', 'proj-c']);
      projectService.getProject.mockImplementation(async (_path, slug) => {
        if (slug === 'proj-a')
          return makeProject({
            slug: 'proj-a',
            assignedTo: 'instance-alpha',
            assignedAt: '2026-01-01T00:00:00.000Z',
            assignedBy: 'user',
          });
        if (slug === 'proj-b') return makeProject({ slug: 'proj-b' }); // unassigned
        if (slug === 'proj-c')
          return makeProject({
            slug: 'proj-c',
            assignedTo: 'instance-beta',
            assignedAt: '2026-01-02T00:00:00.000Z',
            assignedBy: 'instance-alpha',
          });
        return null;
      });

      const assignments = await service.getAssignments(PROJECT_PATH);

      expect(assignments).toHaveLength(2);
      expect(assignments.find((a) => a.projectSlug === 'proj-a')).toMatchObject({
        assignedTo: 'instance-alpha',
        assignedBy: 'user',
      });
      expect(assignments.find((a) => a.projectSlug === 'proj-c')).toMatchObject({
        assignedTo: 'instance-beta',
        assignedBy: 'instance-alpha',
      });
    });

    it('returns empty array when no projects are assigned', async () => {
      projectService.listProjects.mockResolvedValue(['proj-a']);
      projectService.getProject.mockResolvedValue(makeProject({ slug: 'proj-a' }));
      const assignments = await service.getAssignments(PROJECT_PATH);
      expect(assignments).toHaveLength(0);
    });
  });

  // ─── getMyAssignedProjects ─────────────────────────────────────────────────

  describe('getMyAssignedProjects()', () => {
    it('returns only projects assigned to this instance', async () => {
      projectService.listProjects.mockResolvedValue(['proj-mine', 'proj-other', 'proj-unassigned']);
      projectService.getProject.mockImplementation(async (_path, slug) => {
        if (slug === 'proj-mine')
          return makeProject({ slug: 'proj-mine', assignedTo: INSTANCE_ID });
        if (slug === 'proj-other')
          return makeProject({ slug: 'proj-other', assignedTo: 'instance-beta' });
        if (slug === 'proj-unassigned') return makeProject({ slug: 'proj-unassigned' });
        return null;
      });

      const mine = await service.getMyAssignedProjects(PROJECT_PATH);

      expect(mine).toHaveLength(1);
      expect(mine[0].slug).toBe('proj-mine');
    });
  });

  // ─── claimPreferredProjects ────────────────────────────────────────────────

  describe('claimPreferredProjects()', () => {
    it('claims unassigned preferred projects', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        projectPreferences: { preferredProjects: ['proj-a', 'proj-b'] },
      } as ReturnType<typeof loadProtoConfig> extends Promise<infer T> ? T : never);

      projectService.getProject.mockImplementation(async (_path, slug) => {
        if (slug === 'proj-a') return makeProject({ slug: 'proj-a' }); // unassigned
        if (slug === 'proj-b') return makeProject({ slug: 'proj-b', assignedTo: 'instance-beta' }); // already assigned
        return null;
      });

      const claimed = await service.claimPreferredProjects(PROJECT_PATH);

      expect(claimed).toEqual(['proj-a']);
      expect(projectService.updateProject).toHaveBeenCalledOnce();
      const [, slug, updates] = projectService.updateProject.mock.calls[0];
      expect(slug).toBe('proj-a');
      expect((updates as Record<string, string>).assignedTo).toBe(INSTANCE_ID);
    });

    it('returns empty array when no preferred projects configured', async () => {
      mockLoadProtoConfig.mockResolvedValue(null);
      const claimed = await service.claimPreferredProjects(PROJECT_PATH);
      expect(claimed).toEqual([]);
      expect(projectService.updateProject).not.toHaveBeenCalled();
    });

    it('skips projects that are not found', async () => {
      mockLoadProtoConfig.mockResolvedValue({
        projectPreferences: { preferredProjects: ['missing-proj'] },
      } as ReturnType<typeof loadProtoConfig> extends Promise<infer T> ? T : never);

      projectService.getProject.mockResolvedValue(null);

      const claimed = await service.claimPreferredProjects(PROJECT_PATH);
      expect(claimed).toEqual([]);
    });
  });

  // ─── reassignOrphanedProjects ──────────────────────────────────────────────

  describe('reassignOrphanedProjects()', () => {
    it('claims projects from peers with stale heartbeats', async () => {
      const staleTimestamp = new Date(Date.now() - 200_000).toISOString(); // 200s ago > 120s TTL
      crdtSyncService.getPeers.mockReturnValue([
        {
          identity: { instanceId: 'stale-peer' },
          lastSeen: staleTimestamp,
        },
      ]);

      projectService.listProjects.mockResolvedValue(['orphan-proj', 'healthy-proj']);
      projectService.getProject.mockImplementation(async (_path, slug) => {
        if (slug === 'orphan-proj')
          return makeProject({ slug: 'orphan-proj', assignedTo: 'stale-peer' });
        if (slug === 'healthy-proj')
          return makeProject({ slug: 'healthy-proj', assignedTo: INSTANCE_ID });
        return null;
      });

      const reassigned = await service.reassignOrphanedProjects(PROJECT_PATH);

      expect(reassigned).toEqual(['orphan-proj']);
      expect(projectService.updateProject).toHaveBeenCalledOnce();
      const [, slug, updates] = projectService.updateProject.mock.calls[0];
      expect(slug).toBe('orphan-proj');
      expect((updates as Record<string, string>).assignedTo).toBe(INSTANCE_ID);
    });

    it('uses "auto-failover" as assignedBy when claiming orphans', async () => {
      const staleTimestamp = new Date(Date.now() - 200_000).toISOString();
      crdtSyncService.getPeers.mockReturnValue([
        { identity: { instanceId: 'stale-peer' }, lastSeen: staleTimestamp },
      ]);
      projectService.listProjects.mockResolvedValue(['orphan-proj']);
      projectService.getProject.mockResolvedValue(
        makeProject({ slug: 'orphan-proj', assignedTo: 'stale-peer' })
      );

      await service.reassignOrphanedProjects(PROJECT_PATH);

      const [, , updates] = projectService.updateProject.mock.calls[0];
      expect((updates as Record<string, string>).assignedBy).toBe('auto-failover');
    });

    it('emits "project:failover" event for each orphan claimed', async () => {
      const staleTimestamp = new Date(Date.now() - 200_000).toISOString();
      crdtSyncService.getPeers.mockReturnValue([
        { identity: { instanceId: 'stale-peer' }, lastSeen: staleTimestamp },
      ]);
      projectService.listProjects.mockResolvedValue(['orphan-proj']);
      projectService.getProject.mockResolvedValue(
        makeProject({ slug: 'orphan-proj', assignedTo: 'stale-peer' })
      );

      await service.reassignOrphanedProjects(PROJECT_PATH);

      expect(eventEmitter.emit).toHaveBeenCalledOnce();
      const [eventType, payload] = eventEmitter.emit.mock.calls[0];
      expect(eventType).toBe('project:failover');
      expect(payload).toMatchObject({
        projectSlug: 'orphan-proj',
        projectPath: PROJECT_PATH,
        previousOwner: 'stale-peer',
        newOwner: INSTANCE_ID,
      });
      expect(typeof (payload as Record<string, unknown>).stalenessMs).toBe('number');
      expect((payload as Record<string, unknown>).stalenessMs).toBeGreaterThan(120_000);
      expect(typeof (payload as Record<string, unknown>).timestamp).toBe('string');
    });

    it('does not claim projects from peers with fresh heartbeats', async () => {
      const freshTimestamp = new Date(Date.now() - 30_000).toISOString(); // 30s ago < 120s TTL
      crdtSyncService.getPeers.mockReturnValue([
        {
          identity: { instanceId: 'fresh-peer' },
          lastSeen: freshTimestamp,
        },
      ]);

      projectService.listProjects.mockResolvedValue(['other-proj']);
      projectService.getProject.mockResolvedValue(
        makeProject({ slug: 'other-proj', assignedTo: 'fresh-peer' })
      );

      const reassigned = await service.reassignOrphanedProjects(PROJECT_PATH);

      expect(reassigned).toHaveLength(0);
      expect(projectService.updateProject).not.toHaveBeenCalled();
    });

    it('returns empty array when no peers are connected', async () => {
      crdtSyncService.getPeers.mockReturnValue([]);
      const reassigned = await service.reassignOrphanedProjects(PROJECT_PATH);
      expect(reassigned).toHaveLength(0);
    });

    it('does not reassign projects assigned to self', async () => {
      const staleTimestamp = new Date(Date.now() - 200_000).toISOString();
      // Self is somehow in the peers list with a stale heartbeat (edge case)
      crdtSyncService.getPeers.mockReturnValue([
        {
          identity: { instanceId: INSTANCE_ID },
          lastSeen: staleTimestamp,
        },
      ]);

      projectService.listProjects.mockResolvedValue(['my-proj']);
      projectService.getProject.mockResolvedValue(
        makeProject({ slug: 'my-proj', assignedTo: INSTANCE_ID })
      );

      const reassigned = await service.reassignOrphanedProjects(PROJECT_PATH);
      expect(reassigned).toHaveLength(0);
    });

    it('does not emit events when no orphans are claimed', async () => {
      crdtSyncService.getPeers.mockReturnValue([]);
      await service.reassignOrphanedProjects(PROJECT_PATH);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  // ─── startPeriodicFailoverCheck / stopPeriodicFailoverCheck ───────────────

  describe('startPeriodicFailoverCheck()', () => {
    it('calls reassignOrphanedProjects on each tick', async () => {
      vi.useFakeTimers();

      crdtSyncService.getPeers.mockReturnValue([]);

      service.startPeriodicFailoverCheck(PROJECT_PATH);

      // Advance timer by 60s — should trigger one check
      await vi.advanceTimersByTimeAsync(60_000);

      expect(projectService.listProjects).not.toHaveBeenCalled(); // no stale peers, exits early

      vi.useRealTimers();
    });

    it('triggers failover when an orphaned project is detected on tick', async () => {
      vi.useFakeTimers();

      const staleTimestamp = new Date(Date.now() - 200_000).toISOString();
      crdtSyncService.getPeers.mockReturnValue([
        { identity: { instanceId: 'stale-peer' }, lastSeen: staleTimestamp },
      ]);
      projectService.listProjects.mockResolvedValue(['orphan-proj']);
      projectService.getProject.mockResolvedValue(
        makeProject({ slug: 'orphan-proj', assignedTo: 'stale-peer' })
      );

      service.startPeriodicFailoverCheck(PROJECT_PATH);

      await vi.advanceTimersByTimeAsync(60_000);

      expect(projectService.updateProject).toHaveBeenCalledOnce();
      const [, slug, updates] = projectService.updateProject.mock.calls[0];
      expect(slug).toBe('orphan-proj');
      expect((updates as Record<string, string>).assignedBy).toBe('auto-failover');
      expect(eventEmitter.emit).toHaveBeenCalledWith('project:failover', expect.any(Object));

      vi.useRealTimers();
    });

    it('replaces any existing interval when called twice', async () => {
      vi.useFakeTimers();

      crdtSyncService.getPeers.mockReturnValue([]);

      service.startPeriodicFailoverCheck(PROJECT_PATH);
      service.startPeriodicFailoverCheck(PROJECT_PATH); // second call should clear the first

      await vi.advanceTimersByTimeAsync(60_000);

      // Should still work — only one interval active
      expect(crdtSyncService.getPeers).toHaveBeenCalledOnce();

      vi.useRealTimers();
    });
  });

  describe('stopPeriodicFailoverCheck()', () => {
    it('stops the periodic check', async () => {
      vi.useFakeTimers();

      crdtSyncService.getPeers.mockReturnValue([]);

      service.startPeriodicFailoverCheck(PROJECT_PATH);
      service.stopPeriodicFailoverCheck();

      await vi.advanceTimersByTimeAsync(120_000); // advance 2 ticks

      expect(crdtSyncService.getPeers).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('is safe to call before start', () => {
      expect(() => service.stopPeriodicFailoverCheck()).not.toThrow();
    });
  });
});
