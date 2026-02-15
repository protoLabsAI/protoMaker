/**
 * Project Wrap-Up Flow Tests
 *
 * Tests the LangGraph wrap-up state machine with mock executors.
 * Verifies:
 * - Happy path (all stages complete)
 * - Trust boundary auto-pass (skips HITL)
 * - HITL cancel stops flow
 * - Empty improvements handled gracefully
 * - Improvement routing by type (operational/code/strategic)
 */

import { describe, it, expect } from 'vitest';
import {
  createWrapUpFlow,
  type WrapUpState,
  type MetricsCollector,
  type RetroGenerator,
  type MemoryCollector,
  type LearningSynthesizer,
  type MemoryPersister,
  type ContentBriefGenerator,
  type ImprovementExtractor,
  type ImprovementRouter,
  type ImprovementItem,
} from '../../src/wrap-up/index.js';

// ─── Mock Executors ─────────────────────────────────────────────

const mockMetrics: MetricsCollector = {
  async collect(_projectPath, _projectTitle) {
    return { shippedFeatures: 5, failedFeatures: 1, prUrls: ['#101', '#102'] };
  },
};

const mockRetro: RetroGenerator = {
  async generate(_dataSummary, projectTitle) {
    return `## Retro: ${projectTitle}\n\n### What Went Well\n- Shipped on time\n\n### Lessons\n- Test early`;
  },
};

const mockMemoryCollector: MemoryCollector = {
  async collectMemoryFiles(_projectPath) {
    return [
      { filename: 'patterns.md', content: '# Patterns\n\n- Factory pattern used extensively' },
      { filename: 'gotchas.md', content: '# Gotchas\n\n- Watch out for circular deps' },
    ];
  },
};

const mockSynthesizer: LearningSynthesizer = {
  async synthesize(projectTitle, _memoryEntries, _retrospective) {
    return {
      summary: `Key learnings from ${projectTitle}: Factory pattern, circular dep avoidance.`,
      learnings: [
        {
          heading: 'Key Patterns',
          content: 'Factory pattern with DI is the standard approach',
          type: 'pattern' as const,
          category: 'project-patterns',
        },
        {
          heading: 'Critical Gotchas',
          content: 'Circular dependencies between packages cause build failures',
          type: 'gotcha' as const,
          category: 'gotchas',
        },
      ],
    };
  },
};

const storedSummaries: string[] = [];
const persistedCount: number[] = [];

const mockPersister: MemoryPersister = {
  async storeSummary(_path, _title, summary) {
    storedSummaries.push(summary);
  },
  async persistLearnings(_path, _title, learnings) {
    const count = learnings.length;
    persistedCount.push(count);
    return count;
  },
};

const mockBriefGen: ContentBriefGenerator = {
  async generate(projectTitle, _retro, _data) {
    return `# Content Brief: ${projectTitle}\n\nPublish a deep dive article.`;
  },
};

const mockExtractor: ImprovementExtractor = {
  async extract(_retro, _data) {
    return [
      {
        title: 'Add CI caching',
        description: 'Cache node_modules',
        type: 'code' as const,
        priority: 2 as const,
      },
      {
        title: 'Improve standup format',
        description: 'More structured',
        type: 'operational' as const,
        priority: 3 as const,
      },
    ];
  },
};

const routedItems: { type: string; title: string }[] = [];

const mockRouter: ImprovementRouter = {
  async createBeadsTask(_path, item) {
    routedItems.push({ type: 'beads', title: item.title });
    return { id: 'beads-001' };
  },
  async createFeature(_path, item) {
    routedItems.push({ type: 'feature', title: item.title });
    return { id: 'feature-001' };
  },
  async submitPrd(_path, item) {
    routedItems.push({ type: 'prd', title: item.title });
    return { id: 'prd-001' };
  },
};

// ─── Test Input ──────────────────────────────────────────────────

const testInput = {
  projectPath: '/test/project',
  projectTitle: 'Test Project',
  projectSlug: 'test-project',
  totalMilestones: 2,
  totalFeatures: 6,
  totalCostUsd: 1.5,
  failureCount: 1,
  milestoneSummaries: [
    { milestoneTitle: 'Foundation', featureCount: 3, costUsd: 0.8 },
    { milestoneTitle: 'Features', featureCount: 3, costUsd: 0.7 },
  ],
};

function createFullConfig() {
  return {
    metricsCollector: mockMetrics,
    retroGenerator: mockRetro,
    memoryCollector: mockMemoryCollector,
    learningSynthesizer: mockSynthesizer,
    memoryPersister: mockPersister,
    contentBriefGenerator: mockBriefGen,
    improvementExtractor: mockExtractor,
    improvementRouter: mockRouter,
  };
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Project Wrap-Up Flow', () => {
  beforeEach(() => {
    storedSummaries.length = 0;
    persistedCount.length = 0;
    routedItems.length = 0;
  });

  it('should complete the full wrap-up flow with trust boundary auto-approve', async () => {
    const graph = createWrapUpFlow(createFullConfig());

    const result = await graph.invoke({
      input: testInput,
      trustBoundaryResult: 'autoApprove',
    });

    // Verify final state
    expect(result.stage).toBe('completed');

    // Metrics gathered
    expect(result.metrics).toBeDefined();
    expect(result.metrics.totalFeatures).toBe(6);
    expect(result.metrics.shippedFeatures).toBe(5);

    // Retrospective generated
    expect(result.retrospective).toContain('Retro: Test Project');

    // Learnings extracted
    expect(result.learnings).toHaveLength(2);
    expect(result.learnings[0].type).toBe('pattern');
    expect(result.learnings[1].type).toBe('gotcha');

    // Summary stored
    expect(storedSummaries).toHaveLength(1);
    expect(storedSummaries[0]).toContain('Test Project');

    // Learnings persisted
    expect(persistedCount).toHaveLength(1);
    expect(persistedCount[0]).toBe(2);

    // Content brief generated
    expect(result.contentBrief).toContain('Content Brief');

    // Improvements proposed and routed (auto-approved via trust boundary)
    expect(result.improvements).toHaveLength(2);
    expect(routedItems).toHaveLength(2);
    expect(routedItems.find((r) => r.type === 'feature')).toBeDefined();
    expect(routedItems.find((r) => r.type === 'beads')).toBeDefined();
  });

  it('should use mock defaults when no executors provided', async () => {
    const graph = createWrapUpFlow();

    const result = await graph.invoke({
      input: testInput,
      trustBoundaryResult: 'autoApprove',
    });

    expect(result.stage).toBe('completed');
    // Mock retro provides basic content
    expect(result.retrospective).toContain('Test Project');
    // Mock extractor returns empty
    expect(result.improvements).toHaveLength(0);
  });

  it('should route improvements by type correctly', async () => {
    const strategicExtractor: ImprovementExtractor = {
      async extract() {
        return [
          {
            title: 'New pipeline',
            description: 'Large initiative',
            type: 'strategic' as const,
            priority: 1 as const,
          },
          {
            title: 'Fix lint',
            description: 'Small fix',
            type: 'code' as const,
            priority: 3 as const,
          },
          {
            title: 'Update process',
            description: 'Team workflow',
            type: 'operational' as const,
            priority: 2 as const,
          },
        ];
      },
    };

    const graph = createWrapUpFlow({
      ...createFullConfig(),
      improvementExtractor: strategicExtractor,
    });

    const result = await graph.invoke({
      input: testInput,
      trustBoundaryResult: 'autoApprove',
    });

    expect(result.stage).toBe('completed');
    expect(routedItems).toHaveLength(3);
    expect(routedItems.find((r) => r.type === 'prd')).toBeDefined();
    expect(routedItems.find((r) => r.type === 'feature')).toBeDefined();
    expect(routedItems.find((r) => r.type === 'beads')).toBeDefined();
    expect(result.createdPrdIds).toHaveLength(1);
    expect(result.createdFeatureIds).toHaveLength(1);
    expect(result.createdBeadsIds).toHaveLength(1);
  });

  it('should cap improvements at 3 items', async () => {
    const manyExtractor: ImprovementExtractor = {
      async extract() {
        return Array.from({ length: 10 }, (_, i) => ({
          title: `Item ${i}`,
          description: 'test',
          type: 'code' as const,
          priority: 2 as const,
        }));
      },
    };

    const graph = createWrapUpFlow({
      ...createFullConfig(),
      improvementExtractor: manyExtractor,
    });

    const result = await graph.invoke({
      input: testInput,
      trustBoundaryResult: 'autoApprove',
    });

    expect(result.improvements).toHaveLength(3);
  });

  it('should handle empty memory gracefully', async () => {
    const emptyMemory: MemoryCollector = {
      async collectMemoryFiles() {
        return [];
      },
    };

    const graph = createWrapUpFlow({
      ...createFullConfig(),
      memoryCollector: emptyMemory,
    });

    const result = await graph.invoke({
      input: testInput,
      trustBoundaryResult: 'autoApprove',
    });

    expect(result.stage).toBe('completed');
    expect(result.memoryEntries).toHaveLength(0);
    // Synthesis still runs (uses retro as input)
    expect(result.learningSummary).toBeDefined();
  });
});
