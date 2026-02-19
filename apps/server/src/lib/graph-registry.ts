/**
 * Graph Registry
 *
 * Registry of all 7 LangGraph topologies with JSON serialization.
 * Each graph entry includes metadata, node structure, and edge configuration.
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('GraphRegistry');

/**
 * Graph topology types
 */
export type GraphTopology =
  | 'linear'
  | 'linear-hitl'
  | 'parallel-fanout'
  | 'conditional-routing'
  | 'multi-stage-hitl'
  | 'complex-parallel'
  | 'loop';

/**
 * Node definition in a graph
 */
export interface GraphNode {
  id: string;
  type: 'processor' | 'decision' | 'hitl' | 'fanout' | 'aggregate';
  description: string;
}

/**
 * Edge definition in a graph
 */
export interface GraphEdge {
  from: string;
  to: string;
  condition?: string;
}

/**
 * Graph definition
 */
export interface GraphDefinition {
  id: string;
  name: string;
  description: string;
  topology: GraphTopology;
  nodes: GraphNode[];
  edges: GraphEdge[];
  entryPoint: string;
  features: string[];
  useCase: string;
}

/**
 * Registry of all available graphs
 */
const GRAPH_REGISTRY: GraphDefinition[] = [
  {
    id: 'research-flow',
    name: 'Research Flow',
    description: 'Linear sequential flow for research tasks',
    topology: 'linear',
    nodes: [
      { id: 'gather_context', type: 'processor', description: 'Gather contextual information' },
      { id: 'analyze', type: 'processor', description: 'Analyze gathered context' },
      { id: 'summarize', type: 'processor', description: 'Generate summary' },
    ],
    edges: [
      { from: 'gather_context', to: 'analyze' },
      { from: 'analyze', to: 'summarize' },
      { from: 'summarize', to: 'END' },
    ],
    entryPoint: 'gather_context',
    features: ['sequential', 'stateful', 'checkpointing'],
    useCase: 'Research and analysis workflows',
  },
  {
    id: 'review-flow',
    name: 'Review Flow',
    description: 'Linear flow with human-in-the-loop interrupt',
    topology: 'linear-hitl',
    nodes: [
      { id: 'draft', type: 'processor', description: 'Generate initial draft' },
      { id: 'human_review', type: 'hitl', description: 'Human review checkpoint' },
      { id: 'revise', type: 'processor', description: 'Revise based on feedback' },
    ],
    edges: [
      { from: 'draft', to: 'human_review' },
      { from: 'human_review', to: 'revise', condition: 'not approved' },
      { from: 'human_review', to: 'END', condition: 'approved' },
      { from: 'revise', to: 'END' },
    ],
    entryPoint: 'draft',
    features: ['interrupt', 'hitl', 'conditional-routing'],
    useCase: 'Content review with human approval gates',
  },
  {
    id: 'coordinator-flow',
    name: 'Coordinator Flow',
    description: 'Parallel fan-out with subgraph orchestration',
    topology: 'parallel-fanout',
    nodes: [
      { id: 'plan', type: 'processor', description: 'Create execution plan' },
      { id: 'fanout_research', type: 'fanout', description: 'Fan out to research workers' },
      { id: 'research_worker', type: 'processor', description: 'Execute research task' },
      { id: 'aggregate', type: 'aggregate', description: 'Aggregate results' },
      { id: 'finalize', type: 'processor', description: 'Generate final report' },
    ],
    edges: [
      { from: 'plan', to: 'fanout_research' },
      { from: 'fanout_research', to: 'research_worker' },
      { from: 'research_worker', to: 'aggregate' },
      { from: 'aggregate', to: 'finalize' },
      { from: 'finalize', to: 'END' },
    ],
    entryPoint: 'plan',
    features: ['parallel', 'send-api', 'subgraphs', 'message-isolation'],
    useCase: 'Orchestrating parallel subgraph tasks',
  },
  {
    id: 'antagonistic-review',
    name: 'Antagonistic Review Graph',
    description: 'Complex conditional routing with dual-perspective review',
    topology: 'conditional-routing',
    nodes: [
      { id: 'classify_topic', type: 'decision', description: 'Classify and route by depth' },
      { id: 'fan_out_pairs', type: 'fanout', description: 'Fan out to reviewer pairs' },
      { id: 'pair_review', type: 'processor', description: 'Parallel pair reviews' },
      { id: 'aggregate_pairs', type: 'aggregate', description: 'Aggregate pair results' },
      { id: 'ava_review', type: 'processor', description: 'Ava perspective review' },
      { id: 'jon_review', type: 'processor', description: 'Jon perspective review' },
      { id: 'check_consensus', type: 'decision', description: 'Check reviewer consensus' },
      { id: 'resolution', type: 'processor', description: 'Resolve conflicts' },
      { id: 'consolidate', type: 'processor', description: 'Consolidate feedback' },
      { id: 'check_hitl', type: 'decision', description: 'Check if HITL required' },
    ],
    edges: [
      { from: 'classify_topic', to: 'fan_out_pairs' },
      { from: 'fan_out_pairs', to: 'pair_review' },
      { from: 'pair_review', to: 'aggregate_pairs' },
      { from: 'aggregate_pairs', to: 'ava_review' },
      { from: 'ava_review', to: 'jon_review' },
      { from: 'jon_review', to: 'check_consensus' },
      { from: 'check_consensus', to: 'consolidate', condition: 'consensus' },
      { from: 'check_consensus', to: 'resolution', condition: 'no consensus' },
      { from: 'resolution', to: 'consolidate' },
      { from: 'consolidate', to: 'check_hitl' },
      { from: 'check_hitl', to: 'END', condition: 'no hitl' },
    ],
    entryPoint: 'classify_topic',
    features: ['conditional', 'parallel', 'distillation-depth', 'consensus-routing'],
    useCase: 'Multi-perspective document review with depth-based routing',
  },
  {
    id: 'project-planning',
    name: 'Project Planning Flow',
    description: 'Multi-stage HITL workflow for project planning',
    topology: 'multi-stage-hitl',
    nodes: [
      { id: 'research', type: 'processor', description: 'Initial research' },
      { id: 'create_planning_doc', type: 'processor', description: 'Create planning document' },
      { id: 'hitl_planning', type: 'hitl', description: 'Planning approval gate' },
      { id: 'deep_research', type: 'processor', description: 'Deep research phase' },
      { id: 'hitl_research', type: 'hitl', description: 'Research approval gate' },
      { id: 'generate_prd', type: 'processor', description: 'Generate PRD' },
      { id: 'hitl_prd', type: 'hitl', description: 'PRD approval gate' },
      { id: 'plan_milestones', type: 'processor', description: 'Plan milestones' },
      { id: 'hitl_milestones', type: 'hitl', description: 'Milestone approval gate' },
      { id: 'create_issues', type: 'processor', description: 'Create Linear issues' },
    ],
    edges: [
      { from: 'research', to: 'create_planning_doc' },
      { from: 'create_planning_doc', to: 'hitl_planning' },
      { from: 'hitl_planning', to: 'deep_research', condition: 'approve' },
      { from: 'hitl_planning', to: 'create_planning_doc', condition: 'revise' },
      { from: 'deep_research', to: 'hitl_research' },
      { from: 'hitl_research', to: 'generate_prd', condition: 'approve' },
      { from: 'hitl_research', to: 'deep_research', condition: 'revise' },
      { from: 'generate_prd', to: 'hitl_prd' },
      { from: 'hitl_prd', to: 'plan_milestones', condition: 'approve' },
      { from: 'hitl_prd', to: 'generate_prd', condition: 'revise' },
      { from: 'plan_milestones', to: 'hitl_milestones' },
      { from: 'hitl_milestones', to: 'create_issues', condition: 'approve' },
      { from: 'hitl_milestones', to: 'plan_milestones', condition: 'revise' },
      { from: 'create_issues', to: 'END' },
    ],
    entryPoint: 'research',
    features: ['multi-stage', 'hitl', 'revision-loops', 'linear-integration'],
    useCase: 'Complete project planning workflow with checkpoints',
  },
  {
    id: 'content-creation',
    name: 'Content Creation Flow',
    description: 'Complex multi-phase pipeline with parallel processing',
    topology: 'complex-parallel',
    nodes: [
      { id: 'generate_queries', type: 'processor', description: 'Generate research queries' },
      { id: 'fan_out_research', type: 'fanout', description: 'Fan out to research workers' },
      { id: 'research_delegate', type: 'processor', description: 'Execute research' },
      { id: 'research_review', type: 'processor', description: 'Antagonistic research review' },
      { id: 'generate_outline', type: 'processor', description: 'Generate content outline' },
      { id: 'outline_review', type: 'processor', description: 'Antagonistic outline review' },
      { id: 'fan_out_generation', type: 'fanout', description: 'Fan out to section writers' },
      { id: 'generation_delegate', type: 'processor', description: 'Generate section' },
      { id: 'assemble', type: 'aggregate', description: 'Assemble sections' },
      { id: 'fan_out_review', type: 'fanout', description: 'Fan out to reviewers' },
      { id: 'review_delegate', type: 'processor', description: 'Review section' },
      { id: 'final_content_review', type: 'processor', description: 'Antagonistic final review' },
      { id: 'fan_out_output', type: 'fanout', description: 'Fan out to output generators' },
      { id: 'output_delegate', type: 'processor', description: 'Generate output format' },
      { id: 'complete', type: 'aggregate', description: 'Complete flow' },
    ],
    edges: [
      { from: 'generate_queries', to: 'fan_out_research' },
      { from: 'fan_out_research', to: 'research_delegate' },
      { from: 'research_delegate', to: 'research_review' },
      { from: 'research_review', to: 'generate_outline', condition: 'pass' },
      { from: 'research_review', to: 'generate_queries', condition: 'revise' },
      { from: 'generate_outline', to: 'outline_review' },
      { from: 'outline_review', to: 'fan_out_generation', condition: 'pass' },
      { from: 'outline_review', to: 'generate_outline', condition: 'revise' },
      { from: 'fan_out_generation', to: 'generation_delegate' },
      { from: 'generation_delegate', to: 'assemble' },
      { from: 'assemble', to: 'fan_out_review' },
      { from: 'fan_out_review', to: 'review_delegate' },
      { from: 'review_delegate', to: 'final_content_review' },
      { from: 'final_content_review', to: 'fan_out_output', condition: 'pass' },
      { from: 'final_content_review', to: 'assemble', condition: 'revise' },
      { from: 'fan_out_output', to: 'output_delegate' },
      { from: 'output_delegate', to: 'complete' },
      { from: 'complete', to: 'END' },
    ],
    entryPoint: 'generate_queries',
    features: ['multi-phase', 'parallel', 'antagonistic-review', 'revision-loops', 'multi-format'],
    useCase: 'End-to-end content generation with quality gates',
  },
  {
    id: 'interrupt-loop',
    name: 'Interrupt Loop',
    description: 'Basic loop pattern with interrupt control',
    topology: 'loop',
    nodes: [
      { id: 'process', type: 'processor', description: 'Process current iteration' },
      { id: 'check_condition', type: 'decision', description: 'Check loop condition' },
      { id: 'interrupt_gate', type: 'hitl', description: 'Optional interrupt point' },
    ],
    edges: [
      { from: 'process', to: 'check_condition' },
      { from: 'check_condition', to: 'interrupt_gate', condition: 'continue' },
      { from: 'check_condition', to: 'END', condition: 'done' },
      { from: 'interrupt_gate', to: 'process' },
    ],
    entryPoint: 'process',
    features: ['loop', 'interrupt', 'conditional'],
    useCase: 'Iterative processing with optional human oversight',
  },
];

/**
 * Get all graph definitions
 */
export function getAllGraphs(): GraphDefinition[] {
  return GRAPH_REGISTRY;
}

/**
 * Get a specific graph by ID
 */
export function getGraph(id: string): GraphDefinition | undefined {
  return GRAPH_REGISTRY.find((g) => g.id === id);
}

/**
 * Get graphs by topology type
 */
export function getGraphsByTopology(topology: GraphTopology): GraphDefinition[] {
  return GRAPH_REGISTRY.filter((g) => g.topology === topology);
}

/**
 * Serialize graph registry to JSON
 */
export function serializeGraphRegistry(): string {
  return JSON.stringify(
    {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      graphs: GRAPH_REGISTRY,
    },
    null,
    2
  );
}

logger.info(`Graph registry initialized with ${GRAPH_REGISTRY.length} topologies`);
