/**
 * Jon Research Tree Node
 *
 * GTM research tree using wrapSubgraph() for Jon's triage and synthesis.
 * Implements parallel fan-out to subordinate nodes (Cindi for market research)
 * via Send() pattern, with world state integration from Discord/Linear/launches.
 *
 * Flow:
 * 1. Jon triage: Analyze idea with world state context
 * 2. Fan-out GTM: Parallel Send() to Cindi/market research nodes
 * 3. Aggregate GTM: Collect parallel research results
 * 4. Jon synthesis: ROI perspective and final recommendation
 */

import { Send, Command } from '@langchain/langgraph';
import type { Idea } from '@automaker/types';

/**
 * World state context for research
 * Aggregates signals from Discord, Linear, and product launches
 */
export interface WorldStateContext {
  /** Discord channel activity and user feedback */
  discordSignals?: {
    recentTopics: string[];
    userRequests: string[];
    painPoints: string[];
  };

  /** Linear issue trends and priorities */
  linearSignals?: {
    openIssues: number;
    topLabels: string[];
    recentMilestones: string[];
  };

  /** Recent product launches and market timing */
  launchSignals?: {
    recentFeatures: string[];
    competitorMoves: string[];
    marketTrends: string[];
  };
}

/**
 * GTM research result from subordinate node
 */
export interface GTMResearchResult {
  researcher: string;
  focus: string;
  marketAnalysis?: string;
  competitorInsights?: string;
  opportunityScore?: number;
  risks?: string[];
  timestamp: string;
}

/**
 * State for idea processing research flow
 */
export interface IdeaProcessingState {
  /** The idea being evaluated */
  idea: Idea;

  /** World state context (Discord/Linear/launches) */
  worldState?: WorldStateContext;

  /** Jon's triage analysis */
  jonTriage?: {
    priority: 'low' | 'medium' | 'high';
    gtmRelevance: boolean;
    reasoning: string;
    timestamp: string;
  };

  /** GTM research results (parallel collection) */
  gtmResearch?: GTMResearchResult[];

  /** Jon's final synthesis with ROI perspective */
  jonSynthesis?: {
    recommendation: 'proceed' | 'defer' | 'reject';
    roiEstimate?: string;
    marketFit?: string;
    strategicAlignment?: string;
    nextSteps?: string[];
    timestamp: string;
  };

  /** LLM models for nodes */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  smartModel?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fastModel?: any;
}

/**
 * Jon Triage Node
 *
 * Analyzes the idea with world state context to determine if GTM research is needed.
 * Timeout: 30s
 *
 * @param state - Idea processing state
 * @returns Updated state with Jon's triage
 */
export async function jonTriage(state: IdeaProcessingState): Promise<Partial<IdeaProcessingState>> {
  const timeoutMs = 30000; // 30s timeout
  const startTime = Date.now();

  try {
    // Simulate Jon's triage analysis with world state context
    // In production, this would call an LLM with Jon's perspective
    const { idea, worldState } = state;

    // Determine if GTM research is needed based on idea category and world state
    const gtmRelevant =
      idea.category === 'growth' ||
      idea.category === 'feature' ||
      (worldState?.discordSignals?.userRequests.length ?? 0) > 0;

    const priority: 'low' | 'medium' | 'high' =
      idea.impact === 'high' && gtmRelevant ? 'high' : idea.impact === 'medium' ? 'medium' : 'low';

    // Enforce timeout
    const elapsed = Date.now() - startTime;
    if (elapsed > timeoutMs) {
      throw new Error(`Jon triage exceeded timeout (${timeoutMs}ms)`);
    }

    return {
      jonTriage: {
        priority,
        gtmRelevance: gtmRelevant,
        reasoning: `Idea "${idea.title}" assessed with world state. GTM research ${gtmRelevant ? 'recommended' : 'not needed'}.`,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('[JonTriage] Error:', error);
    // Return minimal triage on error
    return {
      jonTriage: {
        priority: 'low',
        gtmRelevance: false,
        reasoning: `Triage failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

/**
 * Fan-Out GTM Node
 *
 * Dispatches parallel GTM research tasks based on Jon's triage.
 * Uses Send() pattern for parallel execution to Cindi (market research).
 *
 * Routes to gtm_research_worker nodes with appropriate configurations.
 *
 * @param state - Idea processing state
 * @returns Command with Send[] for parallel dispatch, or goto for skip
 */
export async function fanOutGTM(state: IdeaProcessingState): Promise<Command> {
  const { jonTriage } = state;

  console.log('[FanOutGTM] Jon triage result:', jonTriage);

  // Skip GTM research if Jon determined it's not relevant
  if (!jonTriage?.gtmRelevance) {
    console.log('[FanOutGTM] GTM research not needed, skipping to synthesis');
    return new Command({ goto: 'aggregate_gtm' });
  }

  // Fan out to 2 subordinates: Cindi (market research) and a competitive analysis node
  console.log('[FanOutGTM] Fanning out to 2 GTM research workers');

  const sends = [
    // Cindi: Market research and opportunity analysis
    new Send('gtm_research_worker', {
      researcher: 'Cindi',
      focus: 'market_opportunity',
      idea: state.idea,
      worldState: state.worldState,
    }),
    // Market Analyst: Competitive landscape and positioning
    new Send('gtm_research_worker', {
      researcher: 'Market Analyst',
      focus: 'competitive_analysis',
      idea: state.idea,
      worldState: state.worldState,
    }),
  ];

  return new Command({ goto: sends });
}

/**
 * GTM Research Worker Node
 *
 * Individual research worker that performs market/competitive analysis.
 * Timeout: 30s
 *
 * This node is invoked via Send() from fanOutGTM.
 *
 * @param state - State with researcher config from Send()
 * @returns GTM research result
 */
export async function gtmResearchWorker(
  state: IdeaProcessingState & { researcher: string; focus: string }
): Promise<Partial<IdeaProcessingState>> {
  const timeoutMs = 30000; // 30s timeout
  const startTime = Date.now();

  try {
    const { researcher, focus, idea } = state;

    console.log(`[GTMResearchWorker] ${researcher} starting ${focus} research`);

    // Simulate research analysis
    // In production, this would call an LLM with researcher-specific prompt
    const result: GTMResearchResult = {
      researcher,
      focus,
      marketAnalysis:
        focus === 'market_opportunity'
          ? `Market opportunity for "${idea.title}" shows ${idea.impact} potential based on user signals.`
          : undefined,
      competitorInsights:
        focus === 'competitive_analysis'
          ? `Competitive analysis suggests ${idea.category} space has moderate competition.`
          : undefined,
      opportunityScore: idea.impact === 'high' ? 8 : idea.impact === 'medium' ? 6 : 4,
      risks: ['Market timing', 'Resource constraints'],
      timestamp: new Date().toISOString(),
    };

    // Enforce timeout
    const elapsed = Date.now() - startTime;
    if (elapsed > timeoutMs) {
      throw new Error(`GTM research worker (${researcher}) exceeded timeout (${timeoutMs}ms)`);
    }

    console.log(`[GTMResearchWorker] ${researcher} completed ${focus} research`);

    return {
      gtmResearch: [result], // Will be appended via reducer
    };
  } catch (error) {
    console.error(`[GTMResearchWorker] Error in ${state.researcher}:`, error);
    return {
      gtmResearch: [
        {
          researcher: state.researcher,
          focus: state.focus,
          marketAnalysis: `Research failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          opportunityScore: 0,
          risks: ['Research incomplete'],
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
}

/**
 * Aggregate GTM Node
 *
 * Collects and consolidates GTM research results from parallel workers.
 * Timeout: 30s
 *
 * @param state - State with gtmResearch array
 * @returns Updated state (pass-through)
 */
export async function aggregateGTM(
  state: IdeaProcessingState
): Promise<Partial<IdeaProcessingState>> {
  const timeoutMs = 30000; // 30s timeout
  const startTime = Date.now();

  try {
    const { gtmResearch = [] } = state;

    console.log(`[AggregateGTM] Collected ${gtmResearch.length} GTM research results`);

    // Enforce timeout
    const elapsed = Date.now() - startTime;
    if (elapsed > timeoutMs) {
      throw new Error(`GTM aggregation exceeded timeout (${timeoutMs}ms)`);
    }

    // Pass through - research is already in state via reducer
    return {};
  } catch (error) {
    console.error('[AggregateGTM] Error:', error);
    return {};
  }
}

/**
 * Jon Synthesis Node
 *
 * Final synthesis of idea evaluation with ROI perspective.
 * Combines Jon's triage, GTM research, and world state into recommendation.
 * Timeout: 30s
 *
 * @param state - Complete idea processing state
 * @returns Updated state with Jon's synthesis
 */
export async function jonSynthesis(
  state: IdeaProcessingState
): Promise<Partial<IdeaProcessingState>> {
  const timeoutMs = 30000; // 30s timeout
  const startTime = Date.now();

  try {
    const { idea, jonTriage, gtmResearch = [] } = state;

    console.log('[JonSynthesis] Starting synthesis with ROI perspective');

    // Calculate average opportunity score from GTM research
    const avgOpportunityScore =
      gtmResearch.length > 0
        ? gtmResearch.reduce((sum, r) => sum + (r.opportunityScore ?? 0), 0) / gtmResearch.length
        : 0;

    // Determine recommendation based on triage and GTM research
    let recommendation: 'proceed' | 'defer' | 'reject';
    if (jonTriage?.priority === 'high' && avgOpportunityScore >= 7) {
      recommendation = 'proceed';
    } else if (jonTriage?.priority === 'low' || avgOpportunityScore < 4) {
      recommendation = 'reject';
    } else {
      recommendation = 'defer';
    }

    // Synthesize ROI perspective
    const roiEstimate =
      avgOpportunityScore >= 7
        ? 'High ROI potential based on market signals and impact'
        : avgOpportunityScore >= 5
          ? 'Moderate ROI, consider timing and resources'
          : 'Low ROI, prioritize other initiatives';

    const marketFit = gtmResearch
      .map((r) => `${r.researcher}: ${r.marketAnalysis ?? r.competitorInsights ?? 'N/A'}`)
      .join('; ');

    const strategicAlignment = `Idea "${idea.title}" aligns with ${idea.category} strategy. Priority: ${jonTriage?.priority ?? 'unknown'}.`;

    const nextSteps =
      recommendation === 'proceed'
        ? ['Create feature spec', 'Validate with stakeholders', 'Estimate effort']
        : recommendation === 'defer'
          ? ['Monitor market signals', 'Reassess in next planning cycle']
          : ['Archive idea', 'Document reasoning'];

    // Enforce timeout
    const elapsed = Date.now() - startTime;
    if (elapsed > timeoutMs) {
      throw new Error(`Jon synthesis exceeded timeout (${timeoutMs}ms)`);
    }

    console.log(`[JonSynthesis] Recommendation: ${recommendation}`);

    return {
      jonSynthesis: {
        recommendation,
        roiEstimate,
        marketFit,
        strategicAlignment,
        nextSteps,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('[JonSynthesis] Error:', error);
    return {
      jonSynthesis: {
        recommendation: 'reject',
        roiEstimate: `Synthesis failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        marketFit: 'Error during analysis',
        strategicAlignment: 'Unable to assess',
        nextSteps: ['Retry analysis'],
        timestamp: new Date().toISOString(),
      },
    };
  }
}
