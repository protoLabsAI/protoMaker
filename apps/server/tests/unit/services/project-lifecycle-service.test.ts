/**
 * Unit tests for ProjectLifecycleService.generateQaDoc()
 *
 * generateQaDoc() is private and called inside launch(). Tests exercise it
 * via launch() after setting up the necessary mocks.
 *
 * Tests:
 * 1. Project with milestones + acceptance criteria → markdown has correct headings and checkboxes
 * 2. Project with no milestones → fallback message
 * 3. Project with milestones but no acceptance criteria → fallback message
 * 4. Idempotency: QA Checklist already exists → createDoc is NOT called
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectLifecycleService } from '@/services/project-lifecycle-service.js';
import type { Project } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual('@protolabsai/utils');
  return {
    ...actual,
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  };
});

vi.mock('@protolabsai/model-resolver', () => ({
  resolveModelString: vi.fn(() => 'claude-sonnet-4-5'),
}));

vi.mock('@protolabsai/platform', () => ({
  getResearchFilePath: vi.fn(() => '/mock/.automaker/projects/test-project/research.md'),
  secureFs: {
    readFile: vi.fn().mockResolvedValue('{}'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/services/project-orchestration-service.js', () => ({
  orchestrateProjectFeatures: vi.fn().mockResolvedValue({
    featuresCreated: 2,
    milestoneEpicMap: { 'milestone-1': 'epic-1' },
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_PATH = '/mock/project';
const PROJECT_SLUG = 'test-project';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-test-123',
    slug: PROJECT_SLUG,
    title: 'Test Project',
    goal: 'Build something great',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    milestones: [],
    ...overrides,
  } as Project;
}

function makeEmptyDocsFile() {
  return {
    version: 1 as const,
    docOrder: [],
    docs: {},
  };
}

function makeDocsFileWithQaChecklist() {
  return {
    version: 1 as const,
    docOrder: ['doc-1'],
    docs: {
      'doc-1': {
        id: 'doc-1',
        title: 'QA Checklist',
        content: '# QA Checklist\n',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    },
  };
}

function makeProjectService(project: Project | null = null) {
  return {
    getProject: vi.fn().mockResolvedValue(project),
    createProject: vi.fn().mockResolvedValue(undefined),
    updateProject: vi.fn().mockResolvedValue(project),
    saveProjectMilestones: vi.fn().mockResolvedValue(project),
    listDocs: vi.fn().mockResolvedValue(makeEmptyDocsFile()),
    createDoc: vi.fn().mockResolvedValue({ id: 'new-doc', title: 'QA Checklist' }),
  };
}

function makeFeatureLoader(backlogCount = 1) {
  const features = Array.from({ length: backlogCount }, (_, i) => ({
    id: `feature-${i}`,
    status: 'backlog',
    title: `Feature ${i}`,
  }));
  return {
    getAll: vi.fn().mockResolvedValue(features),
    create: vi.fn(),
    update: vi.fn(),
  };
}

function makeAutoModeService() {
  return {
    startAutoLoopForProject: vi.fn().mockResolvedValue(undefined),
  };
}

function makeEvents() {
  const handlers = new Map<string, Array<(payload: unknown) => void>>();
  return {
    on: vi.fn((type: string, handler: (payload: unknown) => void) => {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type)!.push(handler);
      return () => {};
    }),
    emit: vi.fn(),
    subscribe: vi.fn(),
    broadcast: vi.fn(),
  };
}

function makeService(
  project: Project | null,
  projectServiceOverrides: Partial<ReturnType<typeof makeProjectService>> = {},
  featureCount = 1
) {
  const projectService = { ...makeProjectService(project), ...projectServiceOverrides };
  const featureLoader = makeFeatureLoader(featureCount);
  const autoModeService = makeAutoModeService();
  const events = makeEvents();

  const service = new ProjectLifecycleService(
    {} as any, // settingsService — not used by generateQaDoc
    projectService as any,
    featureLoader as any,
    autoModeService as any,
    events as any
  );

  return { service, projectService, featureLoader, autoModeService, events };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectLifecycleService — generateQaDoc()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('project with milestones and acceptance criteria', () => {
    it('calls createDoc with markdown containing milestone and phase headings', async () => {
      const project = makeProject({
        milestones: [
          {
            number: 1,
            slug: 'milestone-foundation',
            title: 'Foundation',
            description: 'Foundation work',
            status: 'planned',
            phases: [
              {
                number: 1,
                name: 'phase-setup',
                title: 'Setup',
                description: 'Initial setup',
                acceptanceCriteria: ['Server starts without errors', 'All tests pass'],
              },
            ],
          },
        ],
      });

      const { service, projectService } = makeService(project);

      await service.launch(PROJECT_PATH, PROJECT_SLUG);

      expect(projectService.createDoc).toHaveBeenCalledOnce();
      const [, , title, content] = projectService.createDoc.mock.calls[0];

      expect(title).toBe('QA Checklist');
      expect(content).toContain('## Milestone 1: Foundation');
      expect(content).toContain('### Phase 1: Setup');
      expect(content).toContain('- [ ] Server starts without errors');
      expect(content).toContain('- [ ] All tests pass');
    });

    it('includes all milestones and phases with acceptance criteria', async () => {
      const project = makeProject({
        milestones: [
          {
            number: 1,
            slug: 'milestone-1',
            title: 'Alpha',
            description: 'Alpha milestone',
            status: 'planned',
            phases: [
              {
                number: 1,
                name: 'phase-one',
                title: 'Phase One',
                description: 'First phase',
                acceptanceCriteria: ['Criterion A'],
              },
            ],
          },
          {
            number: 2,
            slug: 'milestone-2',
            title: 'Beta',
            description: 'Beta milestone',
            status: 'planned',
            phases: [
              {
                number: 1,
                name: 'phase-two',
                title: 'Phase Two',
                description: 'Second phase',
                acceptanceCriteria: ['Criterion B', 'Criterion C'],
              },
            ],
          },
        ],
      });

      const { service, projectService } = makeService(project);

      await service.launch(PROJECT_PATH, PROJECT_SLUG);

      const [, , , content] = projectService.createDoc.mock.calls[0];
      expect(content).toContain('## Milestone 1: Alpha');
      expect(content).toContain('## Milestone 2: Beta');
      expect(content).toContain('- [ ] Criterion A');
      expect(content).toContain('- [ ] Criterion B');
      expect(content).toContain('- [ ] Criterion C');
    });

    it('starts the markdown with the # QA Checklist heading', async () => {
      const project = makeProject({
        milestones: [
          {
            number: 1,
            slug: 'milestone-1',
            title: 'First',
            description: 'First milestone',
            status: 'planned',
            phases: [
              {
                number: 1,
                name: 'phase-one',
                title: 'Phase One',
                description: 'Phase one',
                acceptanceCriteria: ['Thing works'],
              },
            ],
          },
        ],
      });

      const { service, projectService } = makeService(project);
      await service.launch(PROJECT_PATH, PROJECT_SLUG);

      const [, , , content] = projectService.createDoc.mock.calls[0];
      expect(content).toMatch(/^# QA Checklist/);
    });
  });

  describe('project with no milestones', () => {
    it('calls createDoc with fallback message when milestones array is empty', async () => {
      const project = makeProject({ milestones: [] });
      const { service, projectService } = makeService(project);

      await service.launch(PROJECT_PATH, PROJECT_SLUG);

      expect(projectService.createDoc).toHaveBeenCalledOnce();
      const [, , , content] = projectService.createDoc.mock.calls[0];
      expect(content).toContain('_No acceptance criteria found in milestones._');
    });

    it('calls createDoc with fallback when milestones is undefined', async () => {
      const project = makeProject({ milestones: undefined });
      const { service, projectService } = makeService(project);

      await service.launch(PROJECT_PATH, PROJECT_SLUG);

      expect(projectService.createDoc).toHaveBeenCalledOnce();
      const [, , , content] = projectService.createDoc.mock.calls[0];
      expect(content).toContain('_No acceptance criteria found in milestones._');
    });
  });

  describe('project with milestones but no acceptance criteria', () => {
    it('calls createDoc with fallback when no phase has acceptance criteria', async () => {
      const project = makeProject({
        milestones: [
          {
            number: 1,
            slug: 'milestone-1',
            title: 'Empty Milestone',
            description: 'Milestone with no AC',
            status: 'planned',
            phases: [
              {
                number: 1,
                name: 'phase-empty',
                title: 'Empty Phase',
                description: 'Phase with no acceptance criteria',
                // no acceptanceCriteria field
              },
            ],
          },
        ],
      });

      const { service, projectService } = makeService(project);

      await service.launch(PROJECT_PATH, PROJECT_SLUG);

      expect(projectService.createDoc).toHaveBeenCalledOnce();
      const [, , , content] = projectService.createDoc.mock.calls[0];
      expect(content).toContain('_No acceptance criteria found in milestones._');
    });

    it('calls createDoc with fallback when acceptance criteria arrays are empty', async () => {
      const project = makeProject({
        milestones: [
          {
            number: 1,
            slug: 'milestone-1',
            title: 'Milestone',
            description: 'Milestone with empty AC arrays',
            status: 'planned',
            phases: [
              {
                number: 1,
                name: 'phase-one',
                title: 'Phase One',
                description: 'Phase with empty AC',
                acceptanceCriteria: [],
              },
            ],
          },
        ],
      });

      const { service, projectService } = makeService(project);

      await service.launch(PROJECT_PATH, PROJECT_SLUG);

      expect(projectService.createDoc).toHaveBeenCalledOnce();
      const [, , , content] = projectService.createDoc.mock.calls[0];
      expect(content).toContain('_No acceptance criteria found in milestones._');
    });
  });

  describe('idempotency — QA Checklist already exists', () => {
    it('does NOT call createDoc when QA Checklist doc already exists', async () => {
      const project = makeProject({
        milestones: [
          {
            number: 1,
            slug: 'milestone-1',
            title: 'Foundation',
            description: 'Foundation',
            status: 'planned',
            phases: [
              {
                number: 1,
                name: 'phase-one',
                title: 'Phase One',
                description: 'Phase one',
                acceptanceCriteria: ['Everything works'],
              },
            ],
          },
        ],
      });

      const { service, projectService } = makeService(project, {
        listDocs: vi.fn().mockResolvedValue(makeDocsFileWithQaChecklist()),
      });

      await service.launch(PROJECT_PATH, PROJECT_SLUG);

      expect(projectService.createDoc).not.toHaveBeenCalled();
    });

    it('calls createDoc when no existing doc is titled QA Checklist', async () => {
      const project = makeProject({
        milestones: [
          {
            number: 1,
            slug: 'milestone-1',
            title: 'Foundation',
            description: 'Foundation',
            status: 'planned',
            phases: [
              {
                number: 1,
                name: 'phase-one',
                title: 'Phase One',
                description: 'Phase one',
                acceptanceCriteria: ['Everything works'],
              },
            ],
          },
        ],
      });

      const docsWithOtherDoc = {
        version: 1 as const,
        docOrder: ['doc-1'],
        docs: {
          'doc-1': {
            id: 'doc-1',
            title: 'Some Other Doc',
            content: 'content',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      };

      const { service, projectService } = makeService(project, {
        listDocs: vi.fn().mockResolvedValue(docsWithOtherDoc),
      });

      await service.launch(PROJECT_PATH, PROJECT_SLUG);

      expect(projectService.createDoc).toHaveBeenCalledOnce();
    });
  });
});
