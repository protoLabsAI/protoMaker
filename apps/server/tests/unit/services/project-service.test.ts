/**
 * Tests for ProjectService.createFeaturesFromProject()
 *
 * Verifies fields passed to featureLoader.create() when creating features from project phases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectService } from '@/services/project-service.js';

// Mock secureFs to avoid file system access
vi.mock('@protolabsai/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@protolabsai/platform')>();
  return {
    ...actual,
    secureFs: {
      readFile: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
      readdir: vi.fn().mockResolvedValue([]),
      rm: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
  };
});

import { secureFs } from '@protolabsai/platform';

const makeProject = () => ({
  id: 'proj-test-456',
  slug: 'my-project',
  title: 'My Project',
  goal: 'Ship a great product',
  status: 'reviewing' as const,
  health: 'on-track' as const,
  priority: 'high' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  milestones: [
    {
      number: 1,
      slug: 'core-features',
      title: 'Core Features',
      description: 'Build the core features',
      status: 'pending' as const,
      phases: [
        {
          number: 1,
          name: 'phase-auth',
          title: 'Authentication',
          description: 'Add user authentication',
          tasks: [],
          complexity: 'medium' as const,
        },
        {
          number: 2,
          name: 'phase-api',
          title: 'API Layer',
          description: 'Build REST API',
          tasks: [],
          complexity: 'high' as const,
          dependencies: ['phase-auth'],
        },
      ],
    },
  ],
  links: [],
  updates: [],
});

describe('project-service.ts', () => {
  describe('ProjectService.createFeaturesFromProject()', () => {
    const PROJECT_PATH = '/mock/workspace';
    const PROJECT_SLUG = 'my-project';

    let mockCreate: ReturnType<typeof vi.fn>;
    let mockFeatureLoader: any;
    let projectService: ProjectService;
    let callCount: number;

    beforeEach(() => {
      callCount = 0;
      mockCreate = vi.fn().mockImplementation(async () => {
        callCount++;
        return { id: `feature-${callCount}`, dependencies: [] };
      });
      mockFeatureLoader = {
        create: mockCreate,
        update: vi.fn().mockResolvedValue(undefined),
        getAll: vi.fn().mockResolvedValue([]),
      };
      projectService = new ProjectService(mockFeatureLoader);

      // Mock secureFs.readFile to return project JSON (used by getProject and updateProject)
      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(makeProject()) as any);
    });

    it('passes projectSlug, epicId, and dependencies to featureLoader.create() for phase features', async () => {
      await projectService.createFeaturesFromProject(PROJECT_PATH, PROJECT_SLUG);

      // Epic is call[0], first phase feature is call[1]
      const phaseCreateArgs = mockCreate.mock.calls[1][1];

      expect(phaseCreateArgs).toMatchObject({
        projectSlug: PROJECT_SLUG,
      });
      expect(phaseCreateArgs.epicId).toBeDefined();
      // dependencies array is present (empty for first phase with no deps)
      expect(Array.isArray(phaseCreateArgs.dependencies)).toBe(true);
    });

    it('passes branchName to featureLoader.create() for phase features', async () => {
      await projectService.createFeaturesFromProject(PROJECT_PATH, PROJECT_SLUG);

      const phaseCreateArgs = mockCreate.mock.calls[1][1];

      expect(typeof phaseCreateArgs.branchName).toBe('string');
      expect(phaseCreateArgs.branchName.length).toBeGreaterThan(0);
    });

    it('resolves phase dependencies to feature IDs in the create call', async () => {
      // Phase 2 depends on phase-auth (phase 1). After phase 1 feature is created,
      // phase 2's create call should receive the phase 1 feature ID in dependencies.
      const createdIds: string[] = [];
      mockCreate.mockImplementation(async () => {
        callCount++;
        const id = `feature-${callCount}`;
        createdIds.push(id);
        return { id, dependencies: [] };
      });

      await projectService.createFeaturesFromProject(PROJECT_PATH, PROJECT_SLUG);

      // Epic = feature-1, Phase 1 (auth) = feature-2, Phase 2 (api) = feature-3
      const phase2CreateArgs = mockCreate.mock.calls[2][1];

      // Phase 2 should have phase 1's feature ID in dependencies
      expect(phase2CreateArgs.dependencies).toContain(createdIds[1]); // feature-2 (auth phase)
    });

    it('creates epic and feature for each milestone/phase', async () => {
      const result = await projectService.createFeaturesFromProject(PROJECT_PATH, PROJECT_SLUG);

      // 1 epic + 2 phases = 3 create calls
      expect(mockCreate).toHaveBeenCalledTimes(3);
      expect(result.featuresCreated).toBe(2);
      expect(result.epicsCreated).toBe(1);
    });

    it('passes milestoneSlug to featureLoader.create() for phase features', async () => {
      await projectService.createFeaturesFromProject(PROJECT_PATH, PROJECT_SLUG);

      const phaseCreateArgs = mockCreate.mock.calls[1][1];

      expect(phaseCreateArgs).toMatchObject({
        milestoneSlug: 'core-features',
      });
    });

    it('passes phaseSlug to featureLoader.create() for phase features', async () => {
      await projectService.createFeaturesFromProject(PROJECT_PATH, PROJECT_SLUG);

      const phaseCreateArgs = mockCreate.mock.calls[1][1];

      expect(phaseCreateArgs).toMatchObject({
        phaseSlug: 'phase-auth',
      });
    });
  });
});
