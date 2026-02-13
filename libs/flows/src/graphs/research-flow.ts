import { StateGraph, END, MemorySaver, Annotation } from '@langchain/langgraph';
import { gatherContextNode } from './nodes/gather-context.js';
import { analyzeNode } from './nodes/analyze.js';
import { summarizeNode } from './nodes/summarize.js';

/**
 * State shape for the research flow
 */
export interface ResearchState {
  topic: string;
  context?: string;
  analysis?: string;
  summary?: string;
  gatheredAt?: string;
  analyzedAt?: string;
  summarizedAt?: string;
  completed?: boolean;
}

// Define state annotation for LangGraph
const ResearchStateAnnotation = Annotation.Root({
  topic: Annotation<string>,
  context: Annotation<string>,
  analysis: Annotation<string>,
  summary: Annotation<string>,
  gatheredAt: Annotation<string>,
  analyzedAt: Annotation<string>,
  summarizedAt: Annotation<string>,
  completed: Annotation<boolean>,
});

/**
 * Creates a research flow graph
 * Flow: START → gather_context → analyze → summarize → END
 *
 * @returns Compiled state graph with memory checkpointing
 */
export function createResearchFlow() {
  // Create state graph with annotation
  const workflow = new StateGraph(ResearchStateAnnotation);

  // Add nodes
  workflow.addNode('gather_context', gatherContextNode);
  workflow.addNode('analyze', analyzeNode);
  workflow.addNode('summarize', summarizeNode);

  // Set entry point
  (workflow as any).setEntryPoint('gather_context');

  // Add edges to define flow
  (workflow as any).addEdge('gather_context', 'analyze');
  (workflow as any).addEdge('analyze', 'summarize');
  (workflow as any).addEdge('summarize', END);

  // Compile with memory saver for checkpointing
  const checkpointer = new MemorySaver();
  const app = workflow.compile({ checkpointer });

  return app;
}
