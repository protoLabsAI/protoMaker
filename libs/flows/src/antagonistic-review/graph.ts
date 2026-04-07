/**
 * Antagonistic Review Graph
 *
 * Dual-perspective PRD review workflow using LangGraph with distillation depth routing.
 *
 * Flow:
 * START -> classify_topic -> fan_out_pairs -> [pair_review (parallel)] ->
 * aggregate_pairs -> ava_review -> jon_review -> check_consensus ->
 * [consolidate | resolution -> consolidate] -> check_hitl -> [interrupt | done]
 *
 * Distillation depth routing (after classify_topic):
 * - depth=0 (surface): Skip pair reviews entirely
 * - depth=1 (standard): Activate most relevant pair via Send()
 * - depth=2 (deep): Activate all 3 pairs via Send() in parallel
 *
 * Conditional routing:
 * - check_consensus: if both approve, skip resolution
 * - check_hitl: if hitlRequired=true, trigger interrupt for HITL
 *
 * LLM nodes (classify, ava, jon, consolidate) use real LLM-powered implementations
 * with model fallback (smart → fast). Models are injected via state by the adapter.
 * When no models are provided, falls back to deterministic mock behavior.
 */

import { MemorySaver } from '@langchain/langgraph';
import { GraphBuilder } from '../graphs/builder.js';
import { AntagonisticReviewStateAnnotation, type AntagonisticReviewState } from './state.js';
import { DistillationDepth, type ReviewerPerspective, type SPARCPrd } from '@protolabsai/types';
import { getAvaPrompt, getJonPrompt } from '@protolabsai/prompts';

// Import real LLM-powered nodes
import { classifyTopicNode } from './nodes/classify-topic.js';
import { avaReviewNode, parseReviewXml } from './nodes/ava-review.js';
import { jonReviewNode } from './nodes/jon-review.js';
import { consolidateNode } from './nodes/consolidate.js';

// Import decision/routing nodes (compatible with AntagonisticReviewState)
import { checkConsensus } from './nodes/check-consensus.js';
import { resolution } from './nodes/resolution.js';
import { checkHitl } from './nodes/check-hitl.js';
import { fanOutPairs } from './nodes/fan-out-pairs.js';
import { aggregatePairs } from './nodes/aggregate-pairs.js';
import { createPairReviewNode } from './nodes/pair-review.js';

// ─── Type Bridge Helpers ───────────────────────────────────────────────────
// The real LLM nodes use their own local types (prd: string, node-local
// ReviewerPerspective). The graph state uses @protolabsai/types (prd: SPARCPrd,
// types ReviewerPerspective). These helpers bridge the gap.

/**
 * Serialize SPARCPrd object to markdown string for LLM nodes
 */
function serializePrd(prd: SPARCPrd): string {
  return `## Situation
${prd.situation}

## Problem
${prd.problem}

## Approach
${prd.approach}

## Results
${prd.results}

## Constraints
${prd.constraints || 'None specified'}`;
}

/**
 * Map node-local verdict to @protolabsai/types ReviewVerdict
 */
function mapVerdictToReviewVerdict(verdict: string): 'approve' | 'concern' | 'block' {
  switch (verdict) {
    case 'approve':
      return 'approve';
    case 'approve-with-concerns':
      return 'concern';
    case 'revise':
      return 'concern';
    case 'reject':
      return 'block';
    default:
      return 'concern';
  }
}

/**
 * Map node-local ReviewerPerspective to @protolabsai/types ReviewerPerspective
 */
function mapNodeReviewToGraphReview(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodeReview: any,
  reviewerName: 'ava' | 'jon'
): ReviewerPerspective {
  return {
    reviewer: reviewerName,
    overallVerdict: mapVerdictToReviewVerdict(nodeReview.verdict),
    sections: (nodeReview.sections || []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => ({
        section: s.area || s.section || 'general',
        verdict: s.concerns && s.concerns.length > 0 ? ('concern' as const) : ('approve' as const),
        comments: s.assessment || s.comments || '',
        issues: s.concerns,
        suggestions: s.recommendations,
      })
    ),
    generalComments: nodeReview.comments,
    completedAt: nodeReview.timestamp || new Date().toISOString(),
  };
}

/**
 * Map @protolabsai/types ReviewerPerspective to node-local format for LLM context
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGraphReviewToNodeReview(graphReview: ReviewerPerspective): any {
  const verdictMap: Record<string, string> = {
    approve: 'approve',
    concern: 'approve-with-concerns',
    block: 'reject',
  };

  return {
    reviewer: graphReview.reviewer === 'ava' ? 'Ava' : 'Jon',
    verdict: verdictMap[graphReview.overallVerdict] || graphReview.overallVerdict,
    sections: graphReview.sections.map((s) => ({
      area: s.section,
      assessment: s.comments,
      concerns: s.issues || [],
      recommendations: s.suggestions || [],
    })),
    comments: graphReview.generalComments || '',
    timestamp: graphReview.completedAt,
  };
}

/**
 * Parse a markdown SPARC PRD string back to SPARCPrd object
 */
function parsePrdString(prdText: string, fallback: SPARCPrd): SPARCPrd {
  const situationMatch = prdText.match(/## Situation\s+([\s\S]*?)(?=## |$)/);
  const problemMatch = prdText.match(/## Problem\s+([\s\S]*?)(?=## |$)/);
  const approachMatch = prdText.match(/## Approach\s+([\s\S]*?)(?=## |$)/);
  const resultsMatch = prdText.match(/## Results\s+([\s\S]*?)(?=## |$)/);
  const constraintsMatch = prdText.match(/## Constraints\s+([\s\S]*?)(?=## |$)/);

  if (situationMatch || problemMatch) {
    return {
      situation: situationMatch?.[1]?.trim() || fallback.situation,
      problem: problemMatch?.[1]?.trim() || fallback.problem,
      approach: approachMatch?.[1]?.trim() || fallback.approach,
      results: resultsMatch?.[1]?.trim() || fallback.results,
      constraints: constraintsMatch?.[1]?.trim() || fallback.constraints,
      generatedAt: new Date().toISOString(),
    };
  }

  return { ...fallback, generatedAt: new Date().toISOString() };
}

// ─── LLM Node Adapters ────────────────────────────────────────────────────
// Each adapter wraps a real LLM node, handling type conversion between
// graph state (SPARCPrd, @protolabsai/types) and node state (string, local types).
// When no models are injected, falls back to deterministic mock behavior.

/**
 * Classify topic adapter — wraps classifyTopicNode with type bridging.
 * Falls back to heuristic classification when no LLM models available.
 */
async function classifyTopicAdapter(
  state: AntagonisticReviewState
): Promise<Partial<AntagonisticReviewState>> {
  // Fallback: heuristic classification when no models available
  if (!state.smartModel && !state.fastModel) {
    const situationLength = state.prd.situation?.length ?? 0;
    let topicComplexity: 'simple' | 'moderate' | 'complex';
    if (situationLength < 30) {
      topicComplexity = 'simple';
    } else if (situationLength < 100) {
      topicComplexity = 'moderate';
    } else {
      topicComplexity = 'complex';
    }
    return { topicComplexity };
  }

  const prdString = serializePrd(state.prd);
  const result = await classifyTopicNode({
    prd: prdString,
    smartModel: state.smartModel,
    fastModel: state.fastModel,
  });

  if (!result.classification) {
    throw new Error('Classification failed: no result returned');
  }

  // Map complexity → topicComplexity
  const complexityMap: Record<string, 'simple' | 'moderate' | 'complex'> = {
    small: 'simple',
    medium: 'moderate',
    large: 'complex',
    architectural: 'complex',
  };

  // Map depth number → DistillationDepth enum
  const depthMap: Record<number, DistillationDepth> = {
    0: DistillationDepth.Surface,
    1: DistillationDepth.Standard,
    2: DistillationDepth.Deep,
  };

  return {
    topicComplexity: complexityMap[result.classification.complexity] || 'moderate',
    distillationDepth:
      depthMap[result.classification.distillationDepth] ?? DistillationDepth.Standard,
  };
}

/**
 * Ava review adapter — wraps avaReviewNode with type bridging.
 *
 * When agentQueryFn + projectPath are injected (server runtime), runs Ava as a
 * full agent loop: canonical persona prompt, board context, Read/Glob/Grep tools,
 * up to 10 turns. Ava can investigate the codebase and push back on capacity
 * or timeline conflicts before rendering her XML verdict.
 *
 * Falls back to single model.invoke() when only smartModel is available,
 * or to a deterministic approve mock when nothing is injected.
 */
async function avaReviewAdapter(
  state: AntagonisticReviewState
): Promise<Partial<AntagonisticReviewState>> {
  // Fallback: deterministic review when nothing is available
  if (!state.smartModel && !state.fastModel && !state.agentQueryFn) {
    const avaReview: ReviewerPerspective = {
      reviewer: 'ava',
      overallVerdict: 'approve',
      sections: [
        {
          section: 'feasibility',
          verdict: 'approve',
          comments: 'Implementation is feasible with current resources.',
        },
      ],
      generalComments: 'Approved from operational perspective.',
      completedAt: new Date().toISOString(),
    };
    return { avaReview };
  }

  const prdString = serializePrd(state.prd);

  // Agent loop path: full persona + tools + board context
  if (state.agentQueryFn && state.projectPath) {
    const systemPrompt = getAvaPrompt({});
    const boardSection = state.boardContext
      ? `\n\n## Current Board State\n${state.boardContext}`
      : '';

    const userPrompt = `You are conducting an operational review of the following PRD for protoLabs.${boardSection}

## PRD to Review
${prdString}

## Your Task
Review this PRD as Chief of Staff. You have Read, Glob, and Grep tools available to investigate the codebase when it's relevant to your assessment.

Assess these areas:
1. **Capacity** — Given the current board state, is there bandwidth to execute this?
2. **Risk** — Technical risks, external dependencies, potential blockers
3. **Tech Debt** — Does this add to or reduce technical debt?
4. **Feasibility** — Is this implementable with our current stack?
5. **Alignment** — Does this conflict with other in-flight work or committed timelines?

Be direct. If the board is already at capacity, say so explicitly. If this conflicts with a feature already in progress, name it. Your job is to protect the team from overcommitment. Do not approve plans that cannot realistically be delivered given current load.

After your investigation, produce your review in this XML format — no markdown fences, no extra text:

<review>
  <reviewer>Ava</reviewer>
  <verdict>approve|approve-with-concerns|revise|reject</verdict>
  <sections>
    <section>
      <area>Capacity|Risk|Tech Debt|Feasibility|Alignment</area>
      <assessment>Brief assessment of this area</assessment>
      <concerns>
        <item>Specific concern</item>
      </concerns>
      <recommendations>
        <item>Recommendation</item>
      </recommendations>
    </section>
  </sections>
  <comments>Overall summary — be explicit about capacity and timeline alignment</comments>
  <timestamp>${new Date().toISOString()}</timestamp>
</review>`;

    const result = await state.agentQueryFn({
      prompt: userPrompt,
      systemPrompt,
      cwd: state.projectPath,
      maxTurns: 10,
      allowedTools: ['Read', 'Glob', 'Grep'],
    });

    const nodeReview = parseReviewXml(result.text, 'AvaReviewAgent');
    return {
      avaReview: mapNodeReviewToGraphReview(nodeReview, 'ava'),
    };
  }

  // Single-turn LangChain path (smartModel available but no agentQueryFn)
  const result = await avaReviewNode({
    prd: prdString,
    smartModel: state.smartModel,
    fastModel: state.fastModel,
  });

  if (!result.avaReview) {
    throw new Error('Ava review failed: no result returned');
  }

  return {
    avaReview: mapNodeReviewToGraphReview(result.avaReview, 'ava'),
    avaTokenUsage: result.tokenUsage,
  };
}

/**
 * Jon review adapter — wraps jonReviewNode with type bridging.
 *
 * When agentQueryFn + projectPath are injected, runs Jon as a full agent loop:
 * canonical GTM persona prompt, board context, Ava's review as context, and
 * Read/Glob/Grep tools. Jon applies protoLabs' brand/strategic filter — he will
 * push back if the plan doesn't align with open-source positioning, overloads
 * the team, or lacks a compelling business case given what's already in flight.
 *
 * Falls back to single model.invoke() when only smartModel is available.
 */
async function jonReviewAdapter(
  state: AntagonisticReviewState
): Promise<Partial<AntagonisticReviewState>> {
  // Fallback: deterministic review when nothing is available
  if (!state.smartModel && !state.fastModel && !state.agentQueryFn) {
    const jonReview: ReviewerPerspective = {
      reviewer: 'jon',
      overallVerdict: 'concern',
      sections: [
        {
          section: 'market-positioning',
          verdict: 'concern',
          comments: 'Market positioning needs strengthening.',
          issues: ['Competitive analysis incomplete'],
        },
      ],
      generalComments: 'Concerns about market fit and business case.',
      completedAt: new Date().toISOString(),
    };
    return { jonReview };
  }

  const prdString = serializePrd(state.prd);

  // Agent loop path: full GTM persona + tools + board + Ava's context
  if (state.agentQueryFn && state.projectPath) {
    const systemPrompt = getJonPrompt({});
    const boardSection = state.boardContext
      ? `\n\n## Current Board State\n${state.boardContext}`
      : '';

    // Serialize Ava's review as readable context for Jon
    const avaSection = state.avaReview
      ? `\n\n## Ava's Operational Review (verdict: ${state.avaReview.overallVerdict})\n${state.avaReview.sections
          .map(
            (s) =>
              `- **${s.section}**: ${s.comments}${s.issues?.length ? `\n  Concerns: ${s.issues.join('; ')}` : ''}`
          )
          .join('\n')}\nOverall: ${state.avaReview.generalComments}`
      : '';

    const userPrompt = `You are conducting a business and strategic review of the following PRD for protoLabs.${boardSection}${avaSection}

## PRD to Review
${prdString}

## Your Task
Review this PRD as Jon, protoLabs' GTM Specialist. You have Read, Glob, and Grep tools to consult project docs if needed.

Apply the protoLabs filter:
- Open-source first, no SaaS language, no paywalls
- Josh orchestrates, agents implement — does this PRD reflect that philosophy?
- Every feature should strengthen our portfolio proof points (protoMaker, MythXEngine, SVGVal)
- "One effort, many surfaces" — does this create content/demo opportunities?

Assess:
1. **Customer Impact** — What problem does this solve? Who benefits?
2. **ROI** — Cost vs benefit, especially given what's already on the board
3. **Market Positioning** — Alignment with protoLabs brand and open-source strategy
4. **Priority** — Is this the right thing to build NOW given current commitments?

Push back if: this distracts from in-flight work, lacks a compelling story, contradicts our open-source positioning, or the ROI doesn't justify the capacity cost relative to other backlog items.

After your review, produce your verdict in this XML format — no markdown fences:

<review>
  <reviewer>Jon</reviewer>
  <verdict>approve|approve-with-concerns|revise|reject</verdict>
  <sections>
    <section>
      <area>Customer Impact|ROI|Market Positioning|Priority</area>
      <assessment>Brief assessment</assessment>
      <concerns>
        <item>Specific concern</item>
      </concerns>
      <recommendations>
        <item>Recommendation</item>
      </recommendations>
    </section>
  </sections>
  <comments>Strategic summary — explicit about priority and positioning fit</comments>
  <timestamp>${new Date().toISOString()}</timestamp>
</review>`;

    const result = await state.agentQueryFn({
      prompt: userPrompt,
      systemPrompt,
      cwd: state.projectPath,
      maxTurns: 10,
      allowedTools: ['Read', 'Glob', 'Grep'],
    });

    const nodeReview = parseReviewXml(result.text, 'JonReviewAgent');
    return {
      jonReview: mapNodeReviewToGraphReview(nodeReview, 'jon'),
    };
  }

  // Single-turn LangChain path
  const nodeAvaReview = state.avaReview ? mapGraphReviewToNodeReview(state.avaReview) : undefined;

  const result = await jonReviewNode({
    prd: prdString,
    avaReview: nodeAvaReview,
    smartModel: state.smartModel,
    fastModel: state.fastModel,
  });

  if (!result.jonReview) {
    throw new Error('Jon review failed: no result returned');
  }

  return {
    jonReview: mapNodeReviewToGraphReview(result.jonReview, 'jon'),
    jonTokenUsage: result.tokenUsage,
  };
}

/**
 * Consolidate adapter — wraps consolidateNode with type bridging.
 * Maps PROCEED/MODIFY/REJECT → approve/concern/block and parses finalPRD string → SPARCPrd.
 * Falls back to deterministic consolidation when no LLM models available.
 */
async function consolidateAdapter(
  state: AntagonisticReviewState
): Promise<Partial<AntagonisticReviewState>> {
  // Fallback: deterministic consolidation when no models available
  if (!state.smartModel && !state.fastModel) {
    const hitlRequired = !state.consensus || state.finalVerdict !== 'approve';
    return {
      consolidatedPrd: { ...state.prd, generatedAt: new Date().toISOString() },
      hitlRequired,
    };
  }

  const prdString = serializePrd(state.prd);

  // Map reviews to node-local format
  const nodeAvaReview = state.avaReview ? mapGraphReviewToNodeReview(state.avaReview) : undefined;
  const nodeJonReview = state.jonReview ? mapGraphReviewToNodeReview(state.jonReview) : undefined;

  const result = await consolidateNode({
    prd: prdString,
    avaReview: nodeAvaReview,
    jonReview: nodeJonReview,
    // pairReviews omitted — graph PairReviewResult format is incompatible with node ReviewerPerspective
    smartModel: state.smartModel,
    fastModel: state.fastModel,
  });

  if (!result.consolidatedReview) {
    throw new Error('Consolidation failed: no result returned');
  }

  // Map verdict: PROCEED/MODIFY/REJECT → approve/concern/block
  const verdictMap: Record<string, 'approve' | 'concern' | 'block'> = {
    PROCEED: 'approve',
    MODIFY: 'concern',
    REJECT: 'block',
  };

  const finalVerdict = verdictMap[result.consolidatedReview.verdict] || 'concern';
  const hitlRequired = finalVerdict !== 'approve' || !!state.hitlRequired;

  // Parse finalPRD string back to SPARCPrd
  let consolidatedPrd: SPARCPrd;
  try {
    consolidatedPrd = parsePrdString(result.consolidatedReview.finalPRD, state.prd);
  } catch {
    consolidatedPrd = { ...state.prd, generatedAt: new Date().toISOString() };
  }

  return { consolidatedPrd, finalVerdict, hitlRequired, consolidateTokenUsage: result.tokenUsage };
}

// ─── Routing Functions ─────────────────────────────────────────────────────

/**
 * Routing function for check_consensus node.
 * If both reviewers agree and approve, skip resolution and go straight to consolidate.
 */
function routeConsensus(state: AntagonisticReviewState): string {
  if (state.consensus && state.finalVerdict === 'approve') {
    return 'consolidate';
  }
  return 'resolution';
}

/**
 * Routing function for check_hitl node.
 * If hitlRequired=true, route to human_review (will be interrupted); otherwise done.
 */
function routeHitl(state: AntagonisticReviewState): string {
  if (state.hitlRequired) {
    return 'human_review';
  }
  return 'done';
}

/**
 * Human review node - paused via interruptBefore for HITL approval.
 * When resumed, any provided hitlFeedback will already be in the state.
 */
async function humanReview(
  _state: AntagonisticReviewState
): Promise<Partial<AntagonisticReviewState>> {
  return {};
}

// ─── Graph Builder ─────────────────────────────────────────────────────────

/**
 * Creates the antagonistic review graph
 *
 * @param enableCheckpointing - Whether to enable state persistence (default: true)
 * @returns Compiled LangGraph runnable
 */
export function createAntagonisticReviewGraph(enableCheckpointing = true) {
  const checkpointer = enableCheckpointing ? new MemorySaver() : undefined;

  const builder = new GraphBuilder<AntagonisticReviewState>({
    stateAnnotation: AntagonisticReviewStateAnnotation,
    enableCheckpointing,
    checkpointer,
  });

  // Add all nodes — LLM adapters for classify/ava/jon/consolidate
  builder
    .addNode('classify_topic', classifyTopicAdapter)
    .addNode('aggregate_pairs', aggregatePairs)
    .addNode('ava_review', avaReviewAdapter)
    .addNode('jon_review', jonReviewAdapter)
    .addNode('check_consensus', checkConsensus)
    .addNode('resolution', resolution)
    .addNode('consolidate', consolidateAdapter)
    .addNode('check_hitl', checkHitl)
    .addNode('human_review', humanReview)
    .addNode('done', async () => ({}));

  // Add nodes that return Command (Send pattern) directly via StateGraph
  const stateGraph = builder.getGraph();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (stateGraph as any).addNode('fan_out_pairs', fanOutPairs, {
    ends: ['pair_review', 'aggregate_pairs'],
  });

  // pair_review node - invokes the pair review subgraph with pairConfig from Send()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (stateGraph as any).addNode('pair_review', async (state: any) => {
    if (!state.pairConfig) {
      throw new Error('[PairReview] pairConfig not provided via Send()');
    }

    // Create and invoke the pair review node with the provided config
    const pairReviewFn = createPairReviewNode(state.pairConfig);
    return await pairReviewFn(state);
  });

  // Wire the flow: classify -> fan_out_pairs -> [pair_review] -> aggregate -> ava -> jon -> check_consensus
  builder
    .setEntryPoint('classify_topic')
    .addEdge('classify_topic', 'fan_out_pairs')
    // fan_out_pairs uses Command with Send() for dynamic routing to pair_review
    // pair_review automatically routes back to aggregate_pairs (via Send() pattern)
    .addEdge('pair_review', 'aggregate_pairs')
    .addEdge('aggregate_pairs', 'ava_review')
    .addEdge('ava_review', 'jon_review')
    .addEdge('jon_review', 'check_consensus');

  // Conditional: consensus + approve -> skip resolution, otherwise -> resolve
  builder.addConditionalEdge('check_consensus', routeConsensus, {
    consolidate: 'consolidate',
    resolution: 'resolution',
  });

  // Resolution flows to consolidate
  builder.addEdge('resolution', 'consolidate');

  // Consolidate flows to check_hitl
  builder.addEdge('consolidate', 'check_hitl');

  // Conditional: hitlRequired -> human_review (interrupt), otherwise -> done
  builder.addConditionalEdge('check_hitl', routeHitl, {
    human_review: 'human_review',
    done: 'done',
  });

  // Human review flows to done (after human intervention)
  builder.addEdge('human_review', 'done');

  // Done is the finish point
  builder.setFinishPoint('done');

  // Compile with interruptBefore to pause at human_review for HITL
  const graph = builder.getGraph();
  return graph.compile({
    checkpointer,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    interruptBefore: ['human_review'] as any,
  });
}

/**
 * Default graph instance with checkpointing enabled
 */
export const antagonisticReviewGraph = createAntagonisticReviewGraph();
