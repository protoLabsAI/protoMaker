/**
 * Researcher Subgraph
 *
 * Handles research tasks with isolated message state.
 * Demonstrates subgraph pattern with message isolation.
 */

import { StateGraph, Annotation } from '@langchain/langgraph';

export const ResearcherState = Annotation.Root({
  query: Annotation<string>,
  findings: Annotation<string[]>,
  messages: Annotation<Array<{ role: string; content: string }>>,
  result: Annotation<string | undefined>,
});

type ResearcherStateType = typeof ResearcherState.State;

/**
 * Research node - simulates research based on query
 */
async function researchNode(state: ResearcherStateType): Promise<Partial<ResearcherStateType>> {
  const { query, messages } = state;

  // Simulate research process
  const findings = [
    `Research finding 1 for: ${query}`,
    `Research finding 2 for: ${query}`,
    `Research finding 3 for: ${query}`,
  ];

  // Add assistant message to isolated state
  const newMessages = [
    ...messages,
    { role: 'assistant', content: `Completed research for query: ${query}` },
  ];

  return {
    findings,
    messages: newMessages,
  };
}

/**
 * Compile node - compiles research findings into result
 */
async function compileNode(state: ResearcherStateType): Promise<Partial<ResearcherStateType>> {
  const { findings, messages } = state;

  const result = `Research Summary:\n${findings.join('\n')}`;

  const newMessages = [
    ...messages,
    { role: 'assistant', content: 'Compiled research findings into summary' },
  ];

  return {
    result,
    messages: newMessages,
  };
}

/**
 * Creates the researcher subgraph
 */
export function createResearcherGraph() {
  const graph = new StateGraph(ResearcherState);

  // Add nodes
  graph.addNode('research', researchNode);
  graph.addNode('compile', compileNode);

  // Define edges
  graph.setEntryPoint('research' as '__start__');
  graph.addEdge('research' as '__start__', 'compile' as '__start__');
  graph.setFinishPoint('compile' as '__start__');

  return graph;
}
