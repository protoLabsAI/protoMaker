/**
 * Research Subgraph with Parallel Workers
 *
 * Dispatcher fans out to parallel research workers based on enabled content types.
 * Aggregator deduplicates and scores findings by relevance.
 */

import { StateGraph, Annotation, Send, Command, MemorySaver } from '@langchain/langgraph';

/**
 * Content configuration - which research types are enabled
 */
export interface ContentConfig {
  webSearch?: boolean;
  codebaseAnalysis?: boolean;
  documentationReview?: boolean;
  apiExploration?: boolean;
}

/**
 * Individual research finding
 */
export interface ResearchFinding {
  type: 'web' | 'codebase' | 'documentation' | 'api';
  content: string;
  relevanceScore: number;
  source?: string;
}

/**
 * Consolidated research summary
 */
export interface ResearchSummary {
  findings: ResearchFinding[];
  totalFindings: number;
  averageRelevance: number;
  completedAt: string;
}

/**
 * Research subgraph state
 */
export const ResearchSubgraphState = Annotation.Root({
  query: Annotation<string>,
  contentConfig: Annotation<ContentConfig>,
  findings: Annotation<ResearchFinding[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  summary: Annotation<ResearchSummary | undefined>,
  needsReview: Annotation<boolean>,
});

type ResearchSubgraphStateType = typeof ResearchSubgraphState.State;

/**
 * Dispatcher node - fans out to parallel workers based on enabled research types
 * Returns Send[] for dynamic parallelism
 */
async function dispatcherNode(state: ResearchSubgraphStateType) {
  const { query, contentConfig } = state;
  const sends: Send[] = [];

  // Fan out to enabled research types
  if (contentConfig.webSearch) {
    sends.push(new Send('web_worker', { ...state, workerType: 'web' }));
  }

  if (contentConfig.codebaseAnalysis) {
    sends.push(new Send('codebase_worker', { ...state, workerType: 'codebase' }));
  }

  if (contentConfig.documentationReview) {
    sends.push(new Send('documentation_worker', { ...state, workerType: 'documentation' }));
  }

  if (contentConfig.apiExploration) {
    sends.push(new Send('api_worker', { ...state, workerType: 'api' }));
  }

  // If no workers enabled, go directly to aggregator
  if (sends.length === 0) {
    return new Command({ goto: 'aggregator' });
  }

  return new Command({ goto: sends });
}

/**
 * Web search worker - simulates web research
 */
async function webWorkerNode(
  state: ResearchSubgraphStateType & { workerType: string }
): Promise<Partial<ResearchSubgraphStateType>> {
  const { query } = state;

  // Simulate web search findings
  const findings: ResearchFinding[] = [
    {
      type: 'web',
      content: `Web result 1 for: ${query}`,
      relevanceScore: 0.85,
      source: 'https://example.com/article1',
    },
    {
      type: 'web',
      content: `Web result 2 for: ${query}`,
      relevanceScore: 0.72,
      source: 'https://example.com/article2',
    },
  ];

  return { findings };
}

/**
 * Codebase analysis worker - simulates code analysis
 */
async function codebaseWorkerNode(
  state: ResearchSubgraphStateType & { workerType: string }
): Promise<Partial<ResearchSubgraphStateType>> {
  const { query } = state;

  const findings: ResearchFinding[] = [
    {
      type: 'codebase',
      content: `Codebase pattern found for: ${query}`,
      relevanceScore: 0.91,
      source: 'src/lib/module.ts',
    },
  ];

  return { findings };
}

/**
 * Documentation review worker - simulates doc analysis
 */
async function documentationWorkerNode(
  state: ResearchSubgraphStateType & { workerType: string }
): Promise<Partial<ResearchSubgraphStateType>> {
  const { query } = state;

  const findings: ResearchFinding[] = [
    {
      type: 'documentation',
      content: `Documentation insight for: ${query}`,
      relevanceScore: 0.88,
      source: 'docs/api-reference.md',
    },
  ];

  return { findings };
}

/**
 * API exploration worker - simulates API research
 */
async function apiWorkerNode(
  state: ResearchSubgraphStateType & { workerType: string }
): Promise<Partial<ResearchSubgraphStateType>> {
  const { query } = state;

  const findings: ResearchFinding[] = [
    {
      type: 'api',
      content: `API endpoint found for: ${query}`,
      relevanceScore: 0.79,
      source: '/api/v1/endpoint',
    },
  ];

  return { findings };
}

/**
 * Deduplicates findings by content similarity
 * Simple implementation using exact content matching
 */
function deduplicateFindings(findings: ResearchFinding[]): ResearchFinding[] {
  const seen = new Set<string>();
  const deduplicated: ResearchFinding[] = [];

  for (const finding of findings) {
    // Use content + type as deduplication key
    const key = `${finding.type}:${finding.content}`;

    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(finding);
    }
  }

  return deduplicated;
}

/**
 * Aggregator node - receives all findings via reducer, deduplicates, scores by relevance
 * Produces consolidated ResearchSummary
 */
async function aggregatorNode(
  state: ResearchSubgraphStateType
): Promise<Partial<ResearchSubgraphStateType>> {
  const { findings } = state;

  // Deduplicate findings
  const deduplicated = deduplicateFindings(findings);

  // Sort by relevance score (descending)
  const sorted = deduplicated.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Calculate average relevance
  const averageRelevance =
    sorted.length > 0 ? sorted.reduce((sum, f) => sum + f.relevanceScore, 0) / sorted.length : 0;

  // Create summary
  const summary: ResearchSummary = {
    findings: sorted,
    totalFindings: sorted.length,
    averageRelevance,
    completedAt: new Date().toISOString(),
  };

  return {
    summary,
    needsReview: true, // Trigger HITL interrupt
  };
}

/**
 * HITL review decision node - routes to human review or completion
 */
function shouldReview(state: ResearchSubgraphStateType): string {
  return state.needsReview ? 'human_review' : '__end__';
}

/**
 * Human review node - placeholder for HITL interrupt point
 */
async function humanReviewNode(
  state: ResearchSubgraphStateType
): Promise<Partial<ResearchSubgraphStateType>> {
  // This is the HITL interrupt point
  // In production, this would pause for human review
  return {
    needsReview: false, // Clear flag after review
  };
}

/**
 * Creates the research subgraph with parallel workers
 */
export function createResearchSubgraph() {
  const graph = new StateGraph(ResearchSubgraphState);

  // Add nodes
  graph.addNode('dispatcher', dispatcherNode, {
    ends: ['web_worker', 'codebase_worker', 'documentation_worker', 'api_worker', 'aggregator'],
  });
  graph.addNode('web_worker', webWorkerNode);
  graph.addNode('codebase_worker', codebaseWorkerNode);
  graph.addNode('documentation_worker', documentationWorkerNode);
  graph.addNode('api_worker', apiWorkerNode);
  graph.addNode('aggregator', aggregatorNode);
  graph.addNode('human_review', humanReviewNode);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = graph as any;

  // Define flow
  g.setEntryPoint('dispatcher');

  // All workers flow to aggregator
  g.addEdge('web_worker', 'aggregator');
  g.addEdge('codebase_worker', 'aggregator');
  g.addEdge('documentation_worker', 'aggregator');
  g.addEdge('api_worker', 'aggregator');

  // Aggregator to conditional review
  g.addConditionalEdges('aggregator', shouldReview, {
    human_review: 'human_review' as any,
    __end__: '__end__' as any,
  });

  // After review, end
  g.setFinishPoint('human_review' as any);

  // Compile with MemorySaver checkpointer
  const checkpointer = new MemorySaver();
  const compiled = graph.compile({ checkpointer, interruptBefore: ['human_review' as any] });

  return compiled;
}

/**
 * Type export for compiled subgraph
 */
export type ResearchSubgraph = ReturnType<typeof createResearchSubgraph>;
