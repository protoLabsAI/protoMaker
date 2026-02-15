/**
 * Project Planning Graph
 *
 * LangGraph state machine for the full project planning workflow.
 *
 * Flow:
 *   START → research → create_planning_doc → hitl_planning
 *     → [approve: deep_research | revise: create_planning_doc]
 *   → deep_research → create_research_doc → hitl_research
 *     → [approve: generate_prd | revise: deep_research]
 *   → generate_prd → hitl_prd
 *     → [approve: plan_milestones | revise: generate_prd]
 *   → plan_milestones → hitl_milestones
 *     → [approve: create_issues | revise: plan_milestones]
 *   → create_issues → done
 *
 * Each HITL checkpoint pauses execution. The ConversationSurface
 * presents the artifact to the user and waits for their response.
 * The flow resumes when the response is injected into state.
 */

import { GraphBuilder } from '../graphs/builder.js';
import { ProjectPlanningStateAnnotation, type ProjectPlanningState } from './types.js';
import { researchNode, createResearchNode, type ResearchExecutor } from './nodes/research.js';
import {
  createPlanningDocNode_default,
  createPlanningDocNode,
  type PlanningDocGenerator,
} from './nodes/create-planning-doc.js';
import { createHitlRouter, createHitlProcessorNode } from './nodes/hitl-checkpoint.js';
import {
  deepResearchNode,
  createDeepResearchNode,
  type DeepResearchExecutor,
} from './nodes/deep-research.js';
import { generatePRDNode, createGeneratePRDNode, type PRDGenerator } from './nodes/generate-prd.js';
import {
  planMilestonesNode,
  createPlanMilestonesNode,
  type MilestonePlanner,
} from './nodes/plan-milestones.js';
import {
  createIssuesNode,
  createIssueCreationNode,
  type IssueCreator,
} from './nodes/create-issues.js';

/**
 * Configuration for creating a project planning flow
 */
export interface ProjectPlanningFlowConfig {
  /** Enable state checkpointing for persistence (default: false) */
  enableCheckpointing?: boolean;

  /** Custom research executor (default: mock) */
  researchExecutor?: ResearchExecutor;

  /** Custom planning doc generator (default: mock) */
  planningDocGenerator?: PlanningDocGenerator;

  /** Custom deep research executor (default: mock) */
  deepResearchExecutor?: DeepResearchExecutor;

  /** Custom PRD generator (default: mock) */
  prdGenerator?: PRDGenerator;

  /** Custom milestone planner (default: mock) */
  milestonePlanner?: MilestonePlanner;

  /** Custom issue creator (default: mock) */
  issueCreator?: IssueCreator;
}

/**
 * Creates the project planning graph.
 *
 * All processing nodes accept pluggable executors for dependency injection.
 * In tests, use defaults (mocks). In production, inject real LLM-powered implementations.
 */
export function createProjectPlanningFlow(config: ProjectPlanningFlowConfig = {}) {
  const { enableCheckpointing = false } = config;

  // Create nodes with injected implementations
  const research = config.researchExecutor
    ? createResearchNode(config.researchExecutor)
    : researchNode;

  const createPlanningDoc = config.planningDocGenerator
    ? createPlanningDocNode(config.planningDocGenerator)
    : createPlanningDocNode_default;

  const deepResearch = config.deepResearchExecutor
    ? createDeepResearchNode(config.deepResearchExecutor)
    : deepResearchNode;

  const generatePRD = config.prdGenerator
    ? createGeneratePRDNode(config.prdGenerator)
    : generatePRDNode;

  const planMilestones = config.milestonePlanner
    ? createPlanMilestonesNode(config.milestonePlanner)
    : planMilestonesNode;

  const createIssues = config.issueCreator
    ? createIssueCreationNode(config.issueCreator)
    : createIssuesNode;

  // Build the graph
  const builder = new GraphBuilder<ProjectPlanningState>({
    stateAnnotation: ProjectPlanningStateAnnotation,
    enableCheckpointing,
  });

  // ─── Processing Nodes ─────────────────────────────────────
  builder
    .addNode('research', research)
    .addNode('create_planning_doc', createPlanningDoc)
    .addNode('deep_research', deepResearch)
    .addNode('generate_prd', generatePRD)
    .addNode('plan_milestones', planMilestones)
    .addNode('create_issues', createIssues);

  // ─── HITL Checkpoint Nodes ────────────────────────────────
  builder
    .addNode('hitl_planning', createHitlProcessorNode('planning_doc', 'deep_researching'))
    .addNode('hitl_research', createHitlProcessorNode('research_doc', 'prd_review'))
    .addNode('hitl_prd', createHitlProcessorNode('prd', 'milestone_review'))
    .addNode('hitl_milestones', createHitlProcessorNode('milestones', 'creating_issues'));

  // ─── Done Node ────────────────────────────────────────────
  builder.addNode('done', async () => ({}));

  // ─── Edges ────────────────────────────────────────────────

  // Linear flow: research → planning doc → HITL
  builder
    .setEntryPoint('research')
    .addEdge('research', 'create_planning_doc')
    .addEdge('create_planning_doc', 'hitl_planning');

  // HITL planning: approve → deep research, revise → redo planning doc
  builder.addConditionalEdge(
    'hitl_planning',
    createHitlRouter({
      checkpointName: 'planning_doc',
      approveTarget: 'deep_research',
      reviseTarget: 'create_planning_doc',
    }),
    {
      deep_research: 'deep_research',
      create_planning_doc: 'create_planning_doc',
      done: 'done',
    }
  );

  // Deep research → HITL
  builder.addEdge('deep_research', 'hitl_research');

  // HITL research: approve → PRD, revise → redo research
  builder.addConditionalEdge(
    'hitl_research',
    createHitlRouter({
      checkpointName: 'research_doc',
      approveTarget: 'generate_prd',
      reviseTarget: 'deep_research',
    }),
    {
      generate_prd: 'generate_prd',
      deep_research: 'deep_research',
      done: 'done',
    }
  );

  // PRD → HITL
  builder.addEdge('generate_prd', 'hitl_prd');

  // HITL PRD: approve → milestones, revise → redo PRD
  builder.addConditionalEdge(
    'hitl_prd',
    createHitlRouter({
      checkpointName: 'prd',
      approveTarget: 'plan_milestones',
      reviseTarget: 'generate_prd',
    }),
    {
      plan_milestones: 'plan_milestones',
      generate_prd: 'generate_prd',
      done: 'done',
    }
  );

  // Milestones → HITL
  builder.addEdge('plan_milestones', 'hitl_milestones');

  // HITL milestones: approve → create issues, revise → redo milestones
  builder.addConditionalEdge(
    'hitl_milestones',
    createHitlRouter({
      checkpointName: 'milestones',
      approveTarget: 'create_issues',
      reviseTarget: 'plan_milestones',
    }),
    {
      create_issues: 'create_issues',
      plan_milestones: 'plan_milestones',
      done: 'done',
    }
  );

  // Final: create issues → done → END
  builder.addEdge('create_issues', 'done');
  builder.setFinishPoint('done');

  return builder.compile();
}
