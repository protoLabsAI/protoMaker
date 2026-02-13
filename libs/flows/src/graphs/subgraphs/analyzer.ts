/**
 * Analyzer Subgraph
 *
 * Handles analysis tasks with isolated message state.
 * Demonstrates subgraph pattern with message isolation.
 */

import { StateGraph, Annotation } from '@langchain/langgraph';

export const AnalyzerState = Annotation.Root({
  data: Annotation<string>,
  insights: Annotation<string[]>,
  messages: Annotation<Array<{ role: string; content: string }>>,
  result: Annotation<string | undefined>,
});

type AnalyzerStateType = typeof AnalyzerState.State;

/**
 * Analyze node - performs analysis on data
 */
async function analyzeNode(state: AnalyzerStateType): Promise<Partial<AnalyzerStateType>> {
  const { data, messages } = state;

  // Simulate analysis process
  const insights = [
    `Insight 1: ${data} contains key patterns`,
    `Insight 2: ${data} shows significant trends`,
    `Insight 3: ${data} reveals important correlations`,
  ];

  const newMessages = [
    ...messages,
    { role: 'assistant', content: `Completed analysis of data: ${data.substring(0, 50)}...` },
  ];

  return {
    insights,
    messages: newMessages,
  };
}

/**
 * Synthesize node - synthesizes insights into final result
 */
async function synthesizeNode(state: AnalyzerStateType): Promise<Partial<AnalyzerStateType>> {
  const { insights, messages } = state;

  const result = `Analysis Report:\n${insights.join('\n')}`;

  const newMessages = [
    ...messages,
    { role: 'assistant', content: 'Synthesized insights into final report' },
  ];

  return {
    result,
    messages: newMessages,
  };
}

/**
 * Creates the analyzer subgraph
 */
export function createAnalyzerGraph() {
  const graph = new StateGraph(AnalyzerState);

  // Add nodes
  graph.addNode('analyze', analyzeNode);
  graph.addNode('synthesize', synthesizeNode);

  // Define edges
  graph.setEntryPoint('analyze' as '__start__');
  graph.addEdge('analyze' as '__start__', 'synthesize' as '__start__');
  graph.setFinishPoint('synthesize' as '__start__');

  return graph;
}
