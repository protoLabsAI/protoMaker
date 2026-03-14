/**
 * Tests for orchestrateProjectFeatures()
 *
 * Verifies fields passed to featureLoader.create() when creating features from project phases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orchestrateProjectFeatures } from '@/services/project-orchestration-service.js';

vi.mock('@protolabsai/platform', () => ({
  secureFs: {
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
  },
  getProjectJsonPath: vi
    .fn()
    .mockReturnValue('/mock/.automaker/projects/test-project/project.json'),
}));

const makeProject = () => ({
  id: 'proj-test-123',
  slug: 'test-project',
  title: 'Test Project',
  goal: 'Build something great',
  status: 'reviewing' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  milestones: [
    {
      number: 1,
      slug: 'milestone-foundation',
      title: 'Foundation',
      description: 'Lay the foundation',
      status: 'pending' as const,
      phases: [
        {
          number: 1,
          name: 'phase-setup',
          title: 'Setup',
          description: 'Initial setup tasks',
          tasks: [],
          filesToModify: ['apps/server/src/index.ts'],
        },
        {
          number: 2,
          name: 'phase-core',
          title: 'Core Implementation',
          description: 'Implement core features',
          tasks: [],
          dependencies: ['phase-setup'],
          filesToModify: ['apps/server/src/services/core.ts'],
        },
      ],
    },
  ],
});

describe('project-orchestration-service.ts', () => {
  describe('orchestrateProjectFeatures()', () => {
    const PROJECT_PATH = '/mock';
    const PROJECT_SLUG = 'test-project';

    let mockCreate: ReturnType<typeof vi.fn>;
    let mockUpdate: ReturnType<typeof vi.fn>;
    let mockFeatureLoader: any;
    let callCount: number;

    beforeEach(() => {
      callCount = 0;
      mockCreate = vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          id: `feature-${Date.now()}-${callCount}`,
          dependencies: [],
        };
      });
      mockUpdate = vi.fn().mockResolvedValue({ id: 'updated', dependencies: [] });
      mockFeatureLoader = {
        create: mockCreate,
        update: mockUpdate,
        getAll: vi.fn().mockResolvedValue([]),
      };
    });

    it('passes projectSlug to featureLoader.create() for phase features', async () => {
      await orchestrateProjectFeatures(
        makeProject() as any,
        { projectPath: PROJECT_PATH, projectSlug: PROJECT_SLUG },
        mockFeatureLoader
      );

      // Epic is call[0], first phase is call[1]
      const phaseCreateArgs = mockCreate.mock.calls[1][1];

      expect(phaseCreateArgs).toMatchObject({
        projectSlug: PROJECT_SLUG,
      });
    });

    it('passes epicId to featureLoader.create() for phase features', async () => {
      // Capture the epic ID returned from the first create call
      let epicId: string | undefined;
      mockCreate.mockImplementation(async () => {
        callCount++;
        const id = `feature-${callCount}`;
        if (callCount === 1) epicId = id; // first call is the epic
        return { id, dependencies: [] };
      });

      await orchestrateProjectFeatures(
        makeProject() as any,
        { projectPath: PROJECT_PATH, projectSlug: PROJECT_SLUG },
        mockFeatureLoader
      );

      const phaseCreateArgs = mockCreate.mock.calls[1][1];

      expect(phaseCreateArgs.epicId).toBeDefined();
      expect(phaseCreateArgs.epicId).toBe(epicId);
    });

    it('passes branchName to featureLoader.create() for phase features', async () => {
      await orchestrateProjectFeatures(
        makeProject() as any,
        { projectPath: PROJECT_PATH, projectSlug: PROJECT_SLUG },
        mockFeatureLoader
      );

      const phaseCreateArgs = mockCreate.mock.calls[1][1];

      expect(typeof phaseCreateArgs.branchName).toBe('string');
      expect(phaseCreateArgs.branchName.length).toBeGreaterThan(0);
    });

    it('sets isFoundation: true for phase number 1 and false for subsequent phases', async () => {
      await orchestrateProjectFeatures(
        makeProject() as any,
        { projectPath: PROJECT_PATH, projectSlug: PROJECT_SLUG },
        mockFeatureLoader
      );

      // Epic = call[0], Phase 1 = call[1], Phase 2 = call[2]
      const firstPhaseArgs = mockCreate.mock.calls[1][1];
      const secondPhaseArgs = mockCreate.mock.calls[2][1];

      expect(firstPhaseArgs.isFoundation).toBe(true);
      expect(secondPhaseArgs.isFoundation).toBe(false);
    });

    it('wires sequential phase dependencies via featureLoader.update()', async () => {
      const createdIds: string[] = [];
      mockCreate.mockImplementation(async () => {
        callCount++;
        const id = `feature-${callCount}`;
        createdIds.push(id);
        return { id, dependencies: [] };
      });

      await orchestrateProjectFeatures(
        makeProject() as any,
        { projectPath: PROJECT_PATH, projectSlug: PROJECT_SLUG },
        mockFeatureLoader
      );

      // Epic = feature-1, Phase 1 = feature-2, Phase 2 = feature-3
      // Phase 2 should depend on Phase 1
      const updateCalls = mockUpdate.mock.calls;
      const phase2Update = updateCalls.find(([, , updates]) =>
        updates?.dependencies?.includes(createdIds[1])
      );

      expect(phase2Update).toBeDefined();
      expect(phase2Update![2].dependencies).toContain(createdIds[1]);
    });

    it('passes milestoneSlug to featureLoader.create() for phase features', async () => {
      await orchestrateProjectFeatures(
        makeProject() as any,
        { projectPath: PROJECT_PATH, projectSlug: PROJECT_SLUG },
        mockFeatureLoader
      );

      const phaseCreateArgs = mockCreate.mock.calls[1][1];

      expect(phaseCreateArgs).toMatchObject({
        milestoneSlug: 'milestone-foundation',
      });
    });

    it('passes phaseSlug to featureLoader.create() for phase features', async () => {
      await orchestrateProjectFeatures(
        makeProject() as any,
        { projectPath: PROJECT_PATH, projectSlug: PROJECT_SLUG },
        mockFeatureLoader
      );

      const phaseCreateArgs = mockCreate.mock.calls[1][1];

      expect(phaseCreateArgs).toMatchObject({
        phaseSlug: 'phase-setup',
      });
    });

    it('reuses existing features by branchName instead of creating duplicates', async () => {
      const existingEpic = {
        id: 'existing-epic-id',
        branchName: 'epic/foundation',
        projectSlug: PROJECT_SLUG,
        isEpic: true,
        dependencies: [],
      };
      const existingPhase = {
        id: 'existing-phase-id',
        branchName: 'feature/foundation-setup',
        projectSlug: PROJECT_SLUG,
        isEpic: false,
        dependencies: [],
      };

      mockFeatureLoader.getAll = vi.fn().mockResolvedValue([existingEpic, existingPhase]);

      const result = await orchestrateProjectFeatures(
        makeProject() as any,
        { projectPath: PROJECT_PATH, projectSlug: PROJECT_SLUG },
        mockFeatureLoader
      );

      // Only the second phase (core) should be created — epic and first phase already exist
      expect(mockCreate).toHaveBeenCalledTimes(1);
      const createdArgs = mockCreate.mock.calls[0][1];
      expect(createdArgs.title).toBe('Core Implementation');

      // But the maps should still include the reused features
      expect(result.milestoneEpicMap['milestone-foundation']).toBe('existing-epic-id');
      expect(result.phaseFeatureMap['milestone-foundation:phase-setup']).toBe('existing-phase-id');
    });
  });
});
