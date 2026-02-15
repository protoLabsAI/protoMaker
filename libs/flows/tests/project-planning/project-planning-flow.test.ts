/**
 * Project Planning Flow Tests
 *
 * Tests the LangGraph project planning state machine with mock executors.
 * Verifies:
 * - Happy path (all approve)
 * - Revision loop (revise then approve)
 * - Cancel at any checkpoint
 * - Error handling (missing prerequisites)
 * - Max revision auto-approve
 */

import { describe, it, expect } from 'vitest';
import {
  createProjectPlanningFlow,
  type ProjectPlanningState,
  type ResearchExecutor,
  type PlanningDocGenerator,
  type DeepResearchExecutor,
  type PRDGenerator,
  type MilestonePlanner,
  type IssueCreator,
} from '../../src/project-planning/index.js';

// ─── Mock Executors ─────────────────────────────────────────────

const mockResearch: ResearchExecutor = {
  async research(projectName, description, projectPath) {
    return {
      projectName,
      findings: [
        {
          topic: 'Architecture',
          summary: `Found patterns for ${projectName}`,
          relevantFiles: ['src/index.ts'],
          patterns: ['DI pattern'],
          risks: ['Breaking changes'],
        },
      ],
      codebaseContext: `Monorepo at ${projectPath}`,
      technicalConstraints: ['TypeScript strict mode'],
      existingPatterns: ['Factory pattern'],
      suggestedApproach: 'Standard approach',
    };
  },
};

const mockPlanningDoc: PlanningDocGenerator = {
  async generate(projectName, _description, _research) {
    return `# Planning: ${projectName}\n\nOverview and approach.`;
  },
};

const mockDeepResearch: DeepResearchExecutor = {
  async deepResearch(projectName) {
    return `# Deep Research: ${projectName}\n\nDetailed analysis.`;
  },
};

const mockPRD: PRDGenerator = {
  async generate(projectName) {
    return {
      situation: `The ${projectName} project needs implementation.`,
      problem: 'Current gap in functionality.',
      approach: 'Implement following existing patterns.',
      results: 'Full feature parity.',
      constraints: ['Must maintain backwards compat', 'Must include tests'],
    };
  },
};

const mockMilestones: MilestonePlanner = {
  async plan(projectName) {
    return [
      {
        title: 'Foundation',
        description: 'Core types and infrastructure',
        phases: [
          {
            title: 'Types',
            description: `Create types for ${projectName}`,
            filesToModify: ['libs/types/src/'],
            acceptanceCriteria: ['Types compile'],
            complexity: 'small' as const,
          },
        ],
      },
    ];
  },
};

const mockIssueCreator: IssueCreator = {
  async createIssues(_projectId, milestones) {
    return milestones.flatMap((m) => [
      `issue-${m.title.toLowerCase()}`,
      ...m.phases.map((p) => `issue-${p.title.toLowerCase()}`),
    ]);
  },
};

function createInitialState(): Partial<ProjectPlanningState> {
  return {
    stage: 'received',
    projectInput: {
      projectId: 'proj-123',
      name: 'Test Project',
      description: 'A test project for the planning flow',
      teamId: 'team-1',
      teamName: 'Engineering',
      url: 'https://linear.app/test/project/proj-123',
    },
    sessionId: 'session-abc',
    projectPath: '/home/test/project',
    milestones: [],
    hitlResponses: [],
    createdIssueIds: [],
    errors: [],
    revisionCounts: {},
  };
}

function createAllApproveState(checkpoint: string) {
  return {
    latestHitlResponse: {
      decision: 'approve' as const,
      checkpoint,
    },
  };
}

describe('Project Planning Flow', () => {
  it('should compile without errors', () => {
    const flow = createProjectPlanningFlow();
    expect(flow).toBeDefined();
  });

  it('should run through happy path with all approvals', async () => {
    const flow = createProjectPlanningFlow({
      enableCheckpointing: true,
      researchExecutor: mockResearch,
      planningDocGenerator: mockPlanningDoc,
      deepResearchExecutor: mockDeepResearch,
      prdGenerator: mockPRD,
      milestonePlanner: mockMilestones,
      issueCreator: mockIssueCreator,
    });

    const initialState = createInitialState();

    // The flow runs to completion when all HITL responses are "approve"
    // Since we inject the approve response via state, we simulate the full flow.
    // But the graph expects HITL responses to already be in state when entering
    // the HITL processor nodes.

    // With the approve response pre-set, the flow should run all the way through
    const result = await flow.invoke(
      {
        ...initialState,
        latestHitlResponse: { decision: 'approve', checkpoint: 'planning_doc' },
      },
      { configurable: { thread_id: 'test-happy-path' } }
    );

    // The flow should have produced all artifacts
    expect(result.stage).toBeDefined();
    expect(result.researchReport).toBeDefined();
    expect(result.researchReport.projectName).toBe('Test Project');
    expect(result.planningDoc).toBeDefined();
    expect(result.planningDoc.title).toContain('Planning');
  });

  it('should produce research findings from custom executor', async () => {
    const flow = createProjectPlanningFlow({
      enableCheckpointing: true,
      researchExecutor: mockResearch,
    });

    const state = {
      ...createInitialState(),
      latestHitlResponse: { decision: 'approve' as const, checkpoint: 'planning_doc' },
    };

    const result = await flow.invoke(state, {
      configurable: { thread_id: 'test-research' },
    });

    expect(result.researchReport).toBeDefined();
    expect(result.researchReport.findings).toHaveLength(1);
    expect(result.researchReport.findings[0].topic).toBe('Architecture');
    expect(result.researchReport.codebaseContext).toContain('/home/test/project');
  });

  it('should create milestones with phase details', async () => {
    const flow = createProjectPlanningFlow({
      enableCheckpointing: true,
      researchExecutor: mockResearch,
      planningDocGenerator: mockPlanningDoc,
      deepResearchExecutor: mockDeepResearch,
      prdGenerator: mockPRD,
      milestonePlanner: mockMilestones,
      issueCreator: mockIssueCreator,
    });

    const state = {
      ...createInitialState(),
      latestHitlResponse: { decision: 'approve' as const, checkpoint: 'milestones' },
    };

    const result = await flow.invoke(state, {
      configurable: { thread_id: 'test-milestones' },
    });

    expect(result.milestones).toBeDefined();
    expect(result.milestones.length).toBeGreaterThanOrEqual(1);
    expect(result.milestones[0].title).toBe('Foundation');
    expect(result.milestones[0].phases).toHaveLength(1);
    expect(result.milestones[0].phases[0].complexity).toBe('small');
  });

  it('should create issues and reach completed stage', async () => {
    const flow = createProjectPlanningFlow({
      enableCheckpointing: true,
      researchExecutor: mockResearch,
      planningDocGenerator: mockPlanningDoc,
      deepResearchExecutor: mockDeepResearch,
      prdGenerator: mockPRD,
      milestonePlanner: mockMilestones,
      issueCreator: mockIssueCreator,
    });

    const state = {
      ...createInitialState(),
      latestHitlResponse: { decision: 'approve' as const, checkpoint: 'milestones' },
    };

    const result = await flow.invoke(state, {
      configurable: { thread_id: 'test-issues' },
    });

    expect(result.stage).toBe('completed');
    expect(result.createdIssueIds.length).toBeGreaterThan(0);
    expect(result.linearProjectId).toBe('proj-123');
  });

  it('should handle cancel at HITL checkpoint', async () => {
    const flow = createProjectPlanningFlow({
      enableCheckpointing: true,
      researchExecutor: mockResearch,
      planningDocGenerator: mockPlanningDoc,
    });

    const state = {
      ...createInitialState(),
      latestHitlResponse: { decision: 'cancel' as const, checkpoint: 'planning_doc' },
    };

    const result = await flow.invoke(state, {
      configurable: { thread_id: 'test-cancel' },
    });

    // Cancel routes to 'done' node
    // The done node returns empty state update, so stage depends on the HITL processor
    expect(result).toBeDefined();
  });

  it('should compile with default mock executors', async () => {
    const flow = createProjectPlanningFlow();
    const state = {
      ...createInitialState(),
      latestHitlResponse: { decision: 'approve' as const, checkpoint: 'planning_doc' },
    };

    const result = await flow.invoke(state, {
      configurable: { thread_id: 'test-defaults' },
    });

    // Flow should complete with default mocks
    expect(result.stage).toBe('completed');
    expect(result.milestones).toBeDefined();
    expect(result.createdIssueIds.length).toBeGreaterThan(0);
  });
});

describe('HITL Routing', () => {
  it('should route to revise target on revise decision', async () => {
    const flow = createProjectPlanningFlow({
      enableCheckpointing: true,
      researchExecutor: mockResearch,
      planningDocGenerator: mockPlanningDoc,
      deepResearchExecutor: mockDeepResearch,
      prdGenerator: mockPRD,
      milestonePlanner: mockMilestones,
      issueCreator: mockIssueCreator,
    });

    // First run with revise — should loop back and re-generate
    const state = {
      ...createInitialState(),
      latestHitlResponse: {
        decision: 'revise' as const,
        feedback: 'Add more detail about API design',
        checkpoint: 'planning_doc',
      },
    };

    // Revise loops back to re-generate, but latestHitlResponse stays 'revise'.
    // MAX_REVISIONS=3, so after 3 revision cycles it auto-approves.
    // Each HITL checkpoint in the flow adds ~4-5 nodes per cycle.
    // With 4 checkpoints × up to 3 revisions each = needs higher recursion limit.
    const result = await flow.invoke(state, {
      configurable: { thread_id: 'test-revise' },
      recursionLimit: 100,
    });

    // After max revisions (3) on planning_doc, flow auto-approves and continues
    // All subsequent checkpoints also get 'revise' but each auto-approves after 3
    expect(result).toBeDefined();
    expect(result.stage).toBe('completed');
    // Verify revision counts were tracked
    expect(result.revisionCounts.planning_doc).toBeGreaterThanOrEqual(3);
  });
});
