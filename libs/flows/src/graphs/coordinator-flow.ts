/**
 * Coordinator Flow
 *
 * Orchestrates researcher and analyzer subgraphs with message isolation.
 * Demonstrates Send() for dynamic fan-out parallelism.
 */

import { StateGraph, Annotation, Send, Command } from '@langchain/langgraph';
import { wrapSubgraph } from './utils/subgraph-wrapper.js';
import { createResearcherGraph, ResearcherState } from './subgraphs/researcher.js';
import { createAnalyzerGraph, AnalyzerState } from './subgraphs/analyzer.js';

export const CoordinatorState = Annotation.Root({
  task: Annotation<string>,
  researchQueries: Annotation<string[]>,
  analysisData: Annotation<string[]>,
  researchResults: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  analysisResults: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  finalReport: Annotation<string | undefined>,
  mode: Annotation<'parallel' | 'sequential'>,
});

type CoordinatorStateType = typeof CoordinatorState.State;

/**
 * Planning node - determines what work needs to be done
 */
async function planningNode(state: CoordinatorStateType): Promise<Partial<CoordinatorStateType>> {
  const { task } = state;

  // Generate research queries based on task
  const researchQueries = [
    `Research aspect 1 of: ${task}`,
    `Research aspect 2 of: ${task}`,
    `Research aspect 3 of: ${task}`,
  ];

  // Generate analysis data
  const analysisData = [`Data set 1 for ${task}`, `Data set 2 for ${task}`];

  return {
    researchQueries,
    analysisData,
  };
}

/**
 * Fan-out node - dynamically sends work to subgraphs using Send()
 * Demonstrates dynamic parallelism pattern
 */
async function fanOutNode(state: CoordinatorStateType) {
  const { researchQueries, analysisData, mode } = state;
  const sends: Send[] = [];

  if (mode === 'parallel') {
    // Parallel mode: fan out to all subgraphs at once
    for (const query of researchQueries) {
      sends.push(new Send('research_delegate', { ...state, query, mode: 'parallel' }));
    }

    for (const data of analysisData) {
      sends.push(new Send('analyze_delegate', { ...state, data, mode: 'parallel' }));
    }
  } else {
    // Sequential mode: research first
    for (const query of researchQueries) {
      sends.push(new Send('research_delegate', { ...state, query, mode: 'sequential' }));
    }
  }

  return new Command({ goto: sends });
}

/**
 * Research delegate node - wraps researcher subgraph with isolation
 */
async function researchDelegateNode(
  state: CoordinatorStateType & { query: string }
): Promise<Partial<CoordinatorStateType>> {
  const { query } = state;

  // Create and compile isolated subgraph
  const researcherGraph = createResearcherGraph();
  const compiled = researcherGraph.compile();

  type ResearcherInput = typeof ResearcherState.State;
  type ResearcherOutput = typeof ResearcherState.State;

  const wrappedResearcher = wrapSubgraph<
    CoordinatorStateType & { query: string },
    ResearcherInput,
    ResearcherOutput
  >(
    compiled,
    (coordState) => ({
      query: coordState.query,
      findings: [],
      messages: [],
      result: undefined,
    }),
    (subState) => ({
      researchResults: [subState.result || ''],
    })
  );

  const result = await wrappedResearcher({ ...state, query });

  return result;
}

/**
 * Analyze delegate node - wraps analyzer subgraph with isolation
 */
async function analyzeDelegateNode(
  state: CoordinatorStateType & { data: string }
): Promise<Partial<CoordinatorStateType>> {
  const { data } = state;

  // Create and compile isolated subgraph
  const analyzerGraph = createAnalyzerGraph();
  const compiled = analyzerGraph.compile();

  type AnalyzerInput = typeof AnalyzerState.State;
  type AnalyzerOutput = typeof AnalyzerState.State;

  const wrappedAnalyzer = wrapSubgraph<
    CoordinatorStateType & { data: string },
    AnalyzerInput,
    AnalyzerOutput
  >(
    compiled,
    (coordState) => ({
      data: coordState.data,
      insights: [],
      messages: [],
      result: undefined,
    }),
    (subState) => ({
      analysisResults: [subState.result || ''],
    })
  );

  const result = await wrappedAnalyzer({ ...state, data });

  return result;
}

/**
 * Sequential analysis node - runs analysis after research completes
 */
async function sequentialAnalysisNode(state: CoordinatorStateType) {
  const { analysisData } = state;
  const sends: Send[] = [];

  for (const data of analysisData) {
    sends.push(new Send('analyze_delegate', { ...state, data, mode: 'sequential' }));
  }

  return new Command({ goto: sends });
}

/**
 * Aggregation node - combines results from all subgraphs
 */
async function aggregationNode(
  state: CoordinatorStateType
): Promise<Partial<CoordinatorStateType>> {
  const { researchResults, analysisResults, task } = state;

  const finalReport = `
=== Final Report for: ${task} ===

Research Results (${researchResults.length}):
${researchResults.map((r, i) => `\n${i + 1}. ${r}`).join('')}

Analysis Results (${analysisResults.length}):
${analysisResults.map((r, i) => `\n${i + 1}. ${r}`).join('')}

=== End Report ===
`.trim();

  return {
    finalReport,
  };
}

/**
 * Creates the coordinator flow graph
 */
export function createCoordinatorGraph() {
  const graph = new StateGraph(CoordinatorState);

  // Add nodes
  graph.addNode('planning', planningNode);
  // fan_out returns Send[], declare potential destinations
  graph.addNode('fan_out', fanOutNode, { ends: ['research_delegate', 'analyze_delegate'] });
  graph.addNode('research_delegate', researchDelegateNode);
  graph.addNode('analyze_delegate', analyzeDelegateNode);
  // sequential_analysis returns Send[], declare potential destinations
  graph.addNode('sequential_analysis', sequentialAnalysisNode, { ends: ['analyze_delegate'] });
  graph.addNode('aggregation', aggregationNode);

  // Define flow
  graph.setEntryPoint('planning' as '__start__');
  graph.addConditionalEdges('planning' as '__start__', (state) => state.mode, {
    parallel: 'fan_out' as '__start__',
    sequential: 'fan_out' as '__start__',
  });

  // fan_out returns Send[] which automatically routes to delegate nodes
  graph.addConditionalEdges('research_delegate' as '__start__', (state) => state.mode, {
    parallel: 'aggregation' as '__start__',
    sequential: 'sequential_analysis' as '__start__',
  });

  graph.addEdge('analyze_delegate' as '__start__', 'aggregation' as '__start__');
  graph.setFinishPoint('aggregation' as '__start__');

  return graph;
}
