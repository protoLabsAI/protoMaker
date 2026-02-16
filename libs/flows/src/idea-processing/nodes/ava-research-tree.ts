/**
 * Ava Research Tree
 *
 * Orchestrates the idea processing research flow using wrapSubgraph() pattern:
 * 1. Ava triage - Initial assessment and world state injection
 * 2. Fan-out to 4 subordinates (Frank, Sam, Kai, Matt) via Send() for parallel research
 * 3. Aggregate subordinate findings
 * 4. Ava synthesis - Consolidate all findings into actionable insights
 *
 * Uses LangGraph Send() pattern for parallel execution of subordinate research.
 */

import { Annotation, Send, Command } from '@langchain/langgraph';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { GraphBuilder } from '../../graphs/builder.js';
import { wrapSubgraph } from '../../graphs/utils/subgraph-wrapper.js';
import type {
  SubordinateResearchState,
  SubordinateResearchFinding,
  SubordinateResearchError,
  WorldStateContext,
} from './subordinate-research.js';
import {
  frankResearchWorker,
  samResearchWorker,
  kaiResearchWorker,
  mattResearchWorker,
} from './subordinate-research.js';

/**
 * Ava's triage assessment
 */
export interface AvaTriageAssessment {
  /** Priority level (high/medium/low) */
  priority: 'high' | 'medium' | 'low';
  /** Key areas to focus research on */
  focusAreas: string[];
  /** Initial complexity estimate */
  estimatedComplexity: 'small' | 'medium' | 'large' | 'architectural';
  /** Risks identified */
  risks: string[];
  /** World state considerations */
  worldStateNotes: string;
}

/**
 * Ava's synthesis result
 */
export interface AvaSynthesisResult {
  /** Consolidated findings summary */
  summary: string;
  /** Recommended next steps */
  recommendations: string[];
  /** Overall feasibility assessment */
  feasibility: 'high' | 'medium' | 'low';
  /** Key insights from subordinates */
  keyInsights: string[];
  /** Identified gaps or concerns */
  concerns: string[];
  /** Final verdict */
  verdict: 'proceed' | 'refine' | 'defer' | 'reject';
}

/**
 * Internal state for the research tree subgraph
 */
export interface ResearchTreeState {
  /** Input: Idea to research */
  idea: string;
  /** World state context (injected by Ava) */
  worldState?: WorldStateContext;
  /** Ava's initial triage */
  avaTriageAssessment?: AvaTriageAssessment;
  /** Findings from subordinates */
  subordinateFindings: SubordinateResearchFinding[];
  /** Errors from subordinates */
  errors: SubordinateResearchError[];
  /** Ava's final synthesis */
  avaSynthesis?: AvaSynthesisResult;
  /** Model configuration */
  smartModel?: BaseChatModel;
  fastModel?: BaseChatModel;
}

/**
 * State annotation for the research tree subgraph
 */
export const ResearchTreeStateAnnotation = Annotation.Root({
  idea: Annotation<string>,
  worldState: Annotation<WorldStateContext | undefined>,
  avaTriageAssessment: Annotation<AvaTriageAssessment | undefined>,
  subordinateFindings: Annotation<SubordinateResearchFinding[]>({
    reducer: (current, update) => [...(current || []), ...(update || [])],
  }),
  errors: Annotation<SubordinateResearchError[]>({
    reducer: (current, update) => [...(current || []), ...(update || [])],
  }),
  avaSynthesis: Annotation<AvaSynthesisResult | undefined>,
  smartModel: Annotation<BaseChatModel | undefined>,
  fastModel: Annotation<BaseChatModel | undefined>,
});

/**
 * Model fallback configuration
 */
interface ModelFallbackConfig {
  primary: BaseChatModel | undefined;
  fallback: BaseChatModel | undefined;
}

/**
 * Executes an LLM call with model fallback chain: smart → fast
 */
async function executeWithFallback<T>(
  config: ModelFallbackConfig,
  promptFn: (model: BaseChatModel) => Promise<T>,
  nodeName: string
): Promise<T> {
  const models: Array<{ model: BaseChatModel | undefined; name: string }> = [
    { model: config.primary, name: 'smart' },
    { model: config.fallback, name: 'fast' },
  ];

  let lastError: Error | undefined;

  for (const { model, name } of models) {
    if (!model) continue;

    try {
      return await promptFn(model);
    } catch (error) {
      console.warn(
        `[${nodeName}] Model ${name} failed:`,
        error instanceof Error ? error.message : String(error)
      );
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error(`All models failed for ${nodeName}`);
}

/**
 * Node: Ava Triage
 *
 * Ava performs initial assessment and injects world state context.
 * In a real implementation, this would fetch current system state from APIs.
 */
async function avaTriageNode(state: ResearchTreeState): Promise<Partial<ResearchTreeState>> {
  const { idea, smartModel, fastModel } = state;
  const nodeName = 'AvaTriageNode';

  console.log(`[${nodeName}] Starting Ava's triage for idea: "${idea}"`);

  try {
    // Mock world state injection - in production, fetch from APIs
    const worldState: WorldStateContext = {
      projectFeatures: [
        { id: 'feat-1', title: 'Feature A', status: 'in_progress' },
        { id: 'feat-2', title: 'Feature B', status: 'review' },
      ],
      crewStatus: [
        { name: 'Ava', status: 'healthy', lastCheck: new Date().toISOString() },
        { name: 'Frank', status: 'healthy', lastCheck: new Date().toISOString() },
      ],
      systemCapacity: {
        availableAgents: 4,
        queueDepth: 2,
        load: 0.6,
      },
      recentEvents: [
        {
          type: 'feature_completed',
          message: 'Feature X merged successfully',
          timestamp: new Date().toISOString(),
        },
      ],
    };

    // Execute with model fallback
    const result = await executeWithFallback(
      { primary: smartModel, fallback: fastModel },
      async (model) => {
        const response = await model.invoke([
          {
            role: 'user',
            content: `You are Ava, the operational lead. Perform an initial triage assessment for this idea:

Idea: "${idea}"

Current System Context:
- Active Features: ${worldState.projectFeatures?.length || 0}
- Available Agents: ${worldState.systemCapacity?.availableAgents || 0}
- Queue Depth: ${worldState.systemCapacity?.queueDepth || 0}
- System Load: ${worldState.systemCapacity?.load || 0}

Provide a structured assessment in JSON format:
{
  "priority": "high" | "medium" | "low",
  "focusAreas": ["area1", "area2", ...],
  "estimatedComplexity": "small" | "medium" | "large" | "architectural",
  "risks": ["risk1", "risk2", ...],
  "worldStateNotes": "notes about current system state and capacity"
}

Consider:
- Current system capacity and workload
- Alignment with active features
- Resource requirements
- Potential risks and dependencies`,
          },
        ]);

        return response.content.toString();
      },
      nodeName
    );

    // Parse the assessment (simplified - in production, use proper JSON parsing with validation)
    let avaTriageAssessment: AvaTriageAssessment;
    try {
      // Extract JSON from potential markdown code blocks
      let jsonStr = result.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      avaTriageAssessment = JSON.parse(jsonStr);
    } catch (error) {
      console.warn(`[${nodeName}] Failed to parse JSON, using fallback assessment`);
      // Fallback assessment
      avaTriageAssessment = {
        priority: 'medium',
        focusAreas: ['backend', 'frontend', 'data', 'performance'],
        estimatedComplexity: 'medium',
        risks: ['Unknown complexity', 'Resource requirements unclear'],
        worldStateNotes: `System at ${worldState.systemCapacity?.load || 0} load with ${worldState.systemCapacity?.availableAgents || 0} available agents`,
      };
    }

    console.log(
      `[${nodeName}] Triage complete: priority=${avaTriageAssessment.priority}, complexity=${avaTriageAssessment.estimatedComplexity}`
    );

    return {
      worldState,
      avaTriageAssessment,
    };
  } catch (error) {
    console.error(`[${nodeName}] Failed:`, error);
    throw error;
  }
}

/**
 * Node: Fan-out Engineering Research
 *
 * Dispatches parallel research tasks to 4 subordinates via Send().
 * Each subordinate receives the idea and world state context.
 */
async function fanOutEngResearchNode(state: ResearchTreeState): Promise<Command> {
  const nodeName = 'FanOutEngResearchNode';

  console.log(`[${nodeName}] Fanning out to 4 subordinates for parallel research`);

  // Create Send() commands for each subordinate
  const subordinateState: SubordinateResearchState = {
    idea: state.idea,
    worldState: state.worldState,
    subordinateFindings: [],
    errors: [],
    smartModel: state.smartModel,
    fastModel: state.fastModel,
  };

  const sends = [
    new Send('frank_research', subordinateState),
    new Send('sam_research', subordinateState),
    new Send('kai_research', subordinateState),
    new Send('matt_research', subordinateState),
  ];

  return new Command({ goto: sends });
}

/**
 * Node: Aggregate Engineering Research
 *
 * Collects findings from all subordinates.
 * This is a simple pass-through node - the reducer annotation handles aggregation.
 */
async function aggregateEngResearchNode(
  state: ResearchTreeState
): Promise<Partial<ResearchTreeState>> {
  const nodeName = 'AggregateEngResearchNode';

  console.log(
    `[${nodeName}] Aggregating findings: ${state.subordinateFindings.length} findings, ${state.errors.length} errors`
  );

  // Log findings by subordinate
  const findingsBySub = state.subordinateFindings.reduce(
    (acc, f) => {
      acc[f.source] = (acc[f.source] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.log(`[${nodeName}] Findings by subordinate:`, findingsBySub);

  // The reducer annotation automatically accumulates subordinateFindings and errors
  // This node just logs and passes through
  return {};
}

/**
 * Node: Ava Synthesis
 *
 * Ava consolidates all subordinate findings into actionable insights and recommendations.
 */
async function avaSynthesisNode(state: ResearchTreeState): Promise<Partial<ResearchTreeState>> {
  const { idea, subordinateFindings, errors, avaTriageAssessment, smartModel, fastModel } = state;
  const nodeName = 'AvaSynthesisNode';

  console.log(`[${nodeName}] Starting Ava's synthesis of research findings`);

  try {
    // Prepare subordinate findings summary
    const findingsSummary = subordinateFindings
      .map(
        (f) =>
          `[${f.source.toUpperCase()}] ${f.topic}\nFindings: ${f.findings.substring(0, 300)}...\nRelevance: ${f.relevance}`
      )
      .join('\n\n');

    const errorsSummary =
      errors.length > 0
        ? `\n\nErrors encountered:\n${errors.map((e) => `- ${e.subordinate}: ${e.error}${e.timedOut ? ' (timeout)' : ''}`).join('\n')}`
        : '';

    // Execute with model fallback
    const result = await executeWithFallback(
      { primary: smartModel, fallback: fastModel },
      async (model) => {
        const response = await model.invoke([
          {
            role: 'user',
            content: `You are Ava, the operational lead. Synthesize the research findings from your subordinates for this idea:

Idea: "${idea}"

Initial Triage Assessment:
- Priority: ${avaTriageAssessment?.priority || 'unknown'}
- Estimated Complexity: ${avaTriageAssessment?.estimatedComplexity || 'unknown'}
- Focus Areas: ${avaTriageAssessment?.focusAreas.join(', ') || 'none'}
- Risks: ${avaTriageAssessment?.risks.join(', ') || 'none'}

Subordinate Research Findings:
${findingsSummary}${errorsSummary}

Provide a comprehensive synthesis in JSON format:
{
  "summary": "Brief executive summary of all findings",
  "recommendations": ["recommendation1", "recommendation2", ...],
  "feasibility": "high" | "medium" | "low",
  "keyInsights": ["insight1", "insight2", ...],
  "concerns": ["concern1", "concern2", ...],
  "verdict": "proceed" | "refine" | "defer" | "reject"
}

Consider:
- Consensus and conflicts between subordinates
- Gaps in research or missing information
- Practicality and resource requirements
- Strategic alignment and value proposition`,
          },
        ]);

        return response.content.toString();
      },
      nodeName
    );

    // Parse the synthesis (simplified - in production, use proper JSON parsing with validation)
    let avaSynthesis: AvaSynthesisResult;
    try {
      // Extract JSON from potential markdown code blocks
      let jsonStr = result.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      avaSynthesis = JSON.parse(jsonStr);
    } catch (error) {
      console.warn(`[${nodeName}] Failed to parse JSON, using fallback synthesis`);
      // Fallback synthesis
      avaSynthesis = {
        summary: `Research completed for: ${idea}. ${subordinateFindings.length} findings collected from ${new Set(subordinateFindings.map((f) => f.source)).size} subordinates.`,
        recommendations: ['Review findings in detail', 'Conduct follow-up research if needed'],
        feasibility: 'medium',
        keyInsights: subordinateFindings.map(
          (f) => `${f.source}: ${f.findings.substring(0, 100)}...`
        ),
        concerns: errors.length > 0 ? [`${errors.length} subordinates encountered errors`] : [],
        verdict: errors.length >= 3 ? 'defer' : 'proceed',
      };
    }

    console.log(
      `[${nodeName}] Synthesis complete: verdict=${avaSynthesis.verdict}, feasibility=${avaSynthesis.feasibility}`
    );

    return { avaSynthesis };
  } catch (error) {
    console.error(`[${nodeName}] Failed:`, error);
    throw error;
  }
}

/**
 * Creates and compiles the research tree subgraph
 *
 * Flow:
 * START -> ava_triage -> fan_out_eng -> [frank, sam, kai, matt] -> aggregate_eng -> ava_synthesis -> END
 *
 * @returns Compiled subgraph ready for invocation
 */
export function createResearchTreeSubgraph() {
  const builder = new GraphBuilder<ResearchTreeState>({
    stateAnnotation: ResearchTreeStateAnnotation,
  });

  // Add regular nodes
  builder
    .addNode('ava_triage', avaTriageNode)
    .addNode('frank_research', frankResearchWorker)
    .addNode('sam_research', samResearchWorker)
    .addNode('kai_research', kaiResearchWorker)
    .addNode('matt_research', mattResearchWorker)
    .addNode('aggregate_eng', aggregateEngResearchNode)
    .addNode('ava_synthesis', avaSynthesisNode);

  // Add fan_out_eng node that returns Command (Send pattern) directly via StateGraph
  const stateGraph = builder.getGraph();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (stateGraph as any).addNode('fan_out_eng', fanOutEngResearchNode, {
    ends: ['frank_research', 'sam_research', 'kai_research', 'matt_research'],
  });

  // Flow: ava_triage -> fan_out_eng (which sends to subordinates) -> aggregate_eng -> ava_synthesis
  builder.setEntryPoint('ava_triage');
  builder.addEdge('ava_triage', 'fan_out_eng');
  builder.addEdge('frank_research', 'aggregate_eng');
  builder.addEdge('sam_research', 'aggregate_eng');
  builder.addEdge('kai_research', 'aggregate_eng');
  builder.addEdge('matt_research', 'aggregate_eng');
  builder.addEdge('aggregate_eng', 'ava_synthesis');
  builder.setFinishPoint('ava_synthesis');

  return builder.compile();
}

/**
 * Creates a wrapped research tree node for use in parent graph
 *
 * This wrapper provides state isolation using wrapSubgraph().
 * The parent graph only needs to provide the idea and models,
 * and will receive back the synthesis result.
 *
 * @returns Wrapped node function for parent graph
 */
export function createResearchTreeNode<
  TParentState extends {
    idea: string;
    researchResult?: AvaSynthesisResult;
    smartModel?: BaseChatModel;
    fastModel?: BaseChatModel;
  },
>() {
  const compiledSubgraph = createResearchTreeSubgraph();

  return wrapSubgraph<TParentState, ResearchTreeState, ResearchTreeState>(
    compiledSubgraph,
    // Input mapper: extract idea and models from parent state
    (parentState) => ({
      idea: parentState.idea,
      subordinateFindings: [],
      errors: [],
      smartModel: parentState.smartModel,
      fastModel: parentState.fastModel,
    }),
    // Output mapper: extract synthesis result
    (subgraphState) => {
      if (!subgraphState.avaSynthesis) {
        throw new Error('[ResearchTree] Subgraph completed without producing synthesis');
      }
      return {
        researchResult: subgraphState.avaSynthesis,
      } as Partial<TParentState>;
    }
  );
}

/**
 * Helper to run research tree directly (for testing)
 */
export async function runResearchTree(
  idea: string,
  smartModel?: BaseChatModel,
  fastModel?: BaseChatModel
): Promise<AvaSynthesisResult> {
  const subgraph = createResearchTreeSubgraph();

  const initialState: ResearchTreeState = {
    idea,
    subordinateFindings: [],
    errors: [],
    smartModel,
    fastModel,
  };

  const finalState = await subgraph.invoke(initialState);

  if (!finalState.avaSynthesis) {
    throw new Error('[ResearchTree] Subgraph failed to produce synthesis');
  }

  return finalState.avaSynthesis;
}
