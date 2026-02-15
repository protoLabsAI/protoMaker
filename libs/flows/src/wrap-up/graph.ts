/**
 * Project Wrap-Up Graph
 *
 * LangGraph state machine for the post-completion knowledge loop.
 *
 * Flow:
 *   START → gather_metrics → generate_retro → extract_learnings
 *     → update_memory → generate_content_brief → propose_improvements
 *     → hitl_improvements → [approve: route_improvements | revise: propose_improvements]
 *     → route_improvements → done → END
 *
 * Trust boundary auto-pass: when trustBoundaryResult === 'autoApprove',
 * the HITL gate is bypassed and improvements are routed automatically.
 */

import { GraphBuilder } from '../graphs/builder.js';
import { WrapUpStateAnnotation, type WrapUpState } from './types.js';
import {
  gatherMetricsNode,
  createGatherMetricsNode,
  type MetricsCollector,
} from './nodes/gather-metrics.js';
import {
  generateRetroNode,
  createGenerateRetroNode,
  type RetroGenerator,
} from './nodes/generate-retro.js';
import {
  extractLearningsNode,
  createExtractLearningsNode,
  type MemoryCollector,
  type LearningSynthesizer,
} from './nodes/extract-learnings.js';
import {
  updateMemoryNode,
  createUpdateMemoryNode,
  type MemoryPersister,
} from './nodes/update-memory.js';
import {
  generateContentBriefNode,
  createGenerateContentBriefNode,
  type ContentBriefGenerator,
} from './nodes/generate-content-brief.js';
import {
  proposeImprovementsNode,
  createProposeImprovementsNode,
  type ImprovementExtractor,
} from './nodes/propose-improvements.js';
import {
  routeImprovementsNode,
  createRouteImprovementsNode,
  type ImprovementRouter,
} from './nodes/route-improvements.js';
import { improvementsHitlRouter, hitlImprovementsProcessor } from './nodes/hitl-improvements.js';

/**
 * Configuration for creating a wrap-up flow.
 * All executors are optional — defaults use mocks for testing.
 */
export interface WrapUpFlowConfig {
  enableCheckpointing?: boolean;

  /** Collects project stats from features on disk */
  metricsCollector?: MetricsCollector;

  /** LLM: generates retrospective from project data */
  retroGenerator?: RetroGenerator;

  /** Reads .automaker/memory/ files from disk */
  memoryCollector?: MemoryCollector;

  /** LLM: synthesizes memory entries into structured learnings */
  learningSynthesizer?: LearningSynthesizer;

  /** Writes PROJECT_LEARNINGS.md + persists to memory files + Linear */
  memoryPersister?: MemoryPersister;

  /** LLM: generates GTM content brief */
  contentBriefGenerator?: ContentBriefGenerator;

  /** LLM: extracts improvement proposals from retrospective */
  improvementExtractor?: ImprovementExtractor;

  /** Routes improvements to Beads/features/PRD pipeline */
  improvementRouter?: ImprovementRouter;
}

/**
 * Creates the project wrap-up graph.
 *
 * All processing nodes accept pluggable executors for dependency injection.
 * In tests, use defaults (mocks). In production, inject real implementations.
 */
export function createWrapUpFlow(config: WrapUpFlowConfig = {}) {
  const { enableCheckpointing = false } = config;

  // Create nodes with injected implementations
  const gatherMetrics = config.metricsCollector
    ? createGatherMetricsNode(config.metricsCollector)
    : gatherMetricsNode;

  const generateRetro = config.retroGenerator
    ? createGenerateRetroNode(config.retroGenerator)
    : generateRetroNode;

  const extractLearnings =
    config.memoryCollector || config.learningSynthesizer
      ? createExtractLearningsNode(config.memoryCollector, config.learningSynthesizer)
      : extractLearningsNode;

  const updateMemory = config.memoryPersister
    ? createUpdateMemoryNode(config.memoryPersister)
    : updateMemoryNode;

  const generateContentBrief = config.contentBriefGenerator
    ? createGenerateContentBriefNode(config.contentBriefGenerator)
    : generateContentBriefNode;

  const proposeImprovements = config.improvementExtractor
    ? createProposeImprovementsNode(config.improvementExtractor)
    : proposeImprovementsNode;

  const routeImprovements = config.improvementRouter
    ? createRouteImprovementsNode(config.improvementRouter)
    : routeImprovementsNode;

  // Build the graph
  const builder = new GraphBuilder<WrapUpState>({
    stateAnnotation: WrapUpStateAnnotation,
    enableCheckpointing,
  });

  // ─── Processing Nodes ─────────────────────────────────────
  builder
    .addNode('gather_metrics', gatherMetrics)
    .addNode('generate_retro', generateRetro)
    .addNode('extract_learnings', extractLearnings)
    .addNode('update_memory', updateMemory)
    .addNode('generate_content_brief', generateContentBrief)
    .addNode('propose_improvements', proposeImprovements)
    .addNode('route_improvements', routeImprovements);

  // ─── HITL Checkpoint ───────────────────────────────────────
  builder.addNode('hitl_improvements', hitlImprovementsProcessor);

  // ─── Done Node ─────────────────────────────────────────────
  builder.addNode('done', async () => ({ stage: 'completed' as const }));

  // ─── Edges ─────────────────────────────────────────────────

  // Linear flow: metrics → retro → learnings → memory → content → improvements
  builder
    .setEntryPoint('gather_metrics')
    .addEdge('gather_metrics', 'generate_retro')
    .addEdge('generate_retro', 'extract_learnings')
    .addEdge('extract_learnings', 'update_memory')
    .addEdge('update_memory', 'generate_content_brief')
    .addEdge('generate_content_brief', 'propose_improvements');

  // Improvements → HITL checkpoint
  builder.addEdge('propose_improvements', 'hitl_improvements');

  // HITL routing: approve → route, revise → re-propose, cancel → done
  builder.addConditionalEdge('hitl_improvements', improvementsHitlRouter, {
    route_improvements: 'route_improvements',
    propose_improvements: 'propose_improvements',
    done: 'done',
  });

  // Route → done → END
  builder.addEdge('route_improvements', 'done');
  builder.setFinishPoint('done');

  return builder.compile();
}
