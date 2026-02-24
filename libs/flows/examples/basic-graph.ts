#!/usr/bin/env tsx

/**
 * Basic LangGraph StateGraph Example
 *
 * This example demonstrates the fundamental concepts of LangGraph:
 * - Defining state with annotations
 * - Creating nodes (functions that process state)
 * - Building edges to connect nodes
 * - Compiling and invoking the graph
 *
 * Usage: npm run example:basic
 */

import { Annotation, StateGraph } from '@langchain/langgraph';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('basic-graph');

// Define the state structure using Annotation
// This is the data that flows through the graph
const GraphState = Annotation.Root({
  // The input/output for this simple example
  messages: Annotation<string[]>({
    // Reducer function: how to merge new values with existing state
    reducer: (current: string[], update: string[]) => [...current, ...update],
    default: () => [],
  }),
  // Track which nodes have been visited
  visited: Annotation<string[]>({
    reducer: (current: string[], update: string[]) => [...current, ...update],
    default: () => [],
  }),
  // Simple counter to demonstrate state mutation
  counter: Annotation<number>({
    reducer: (_current: number, update: number) => update,
    default: () => 0,
  }),
});

// Define node functions - these process and update state
// Each node receives the current state and returns updates

/**
 * Entry node: Initialize the workflow
 */
function entryNode(state: typeof GraphState.State) {
  logger.info('📥 Entry Node: Starting workflow');
  return {
    messages: ['Starting workflow'],
    visited: ['entry'],
    counter: state.counter + 1,
  };
}

/**
 * Processing node: Perform some work
 */
function processNode(state: typeof GraphState.State) {
  logger.info('⚙️  Process Node: Processing data');
  logger.info(`   Current counter: ${state.counter}`);
  logger.info(`   Messages so far: ${state.messages.length}`);

  return {
    messages: ['Processing complete'],
    visited: ['process'],
    counter: state.counter + 1,
  };
}

/**
 * Validation node: Check results
 */
function validateNode(state: typeof GraphState.State) {
  logger.info('✅ Validate Node: Checking results');

  const isValid = state.messages.length >= 2;
  const message = isValid ? 'Validation passed' : 'Validation failed';

  return {
    messages: [message],
    visited: ['validate'],
    counter: state.counter + 1,
  };
}

/**
 * Exit node: Finalize workflow
 */
function exitNode(state: typeof GraphState.State) {
  logger.info('📤 Exit Node: Finalizing workflow');
  logger.info(`   Total steps: ${state.counter}`);
  logger.info(`   Nodes visited: ${state.visited.join(' → ')}`);

  return {
    messages: ['Workflow complete'],
    visited: ['exit'],
  };
}

/**
 * Build and run the graph
 */
async function main() {
  logger.info('🚀 LangGraph Basic Example\n');

  // Create a new StateGraph with our state definition
  const workflow = new StateGraph(GraphState);

  // Add nodes to the graph
  // Each node is identified by a name and associated with a function
  workflow.addNode('entry', entryNode);
  workflow.addNode('process', processNode);
  workflow.addNode('validate', validateNode);
  workflow.addNode('exit', exitNode);

  // Define edges - the flow between nodes
  // Linear flow: entry → process → validate → exit
  workflow.addEdge('entry', 'process');
  workflow.addEdge('process', 'validate');
  workflow.addEdge('validate', 'exit');

  // Set the entry point - where the graph starts
  workflow.setEntryPoint('entry');

  // Set the finish point - where the graph ends
  workflow.setFinishPoint('exit');

  // Compile the graph into a runnable
  const app = workflow.compile();

  logger.info('Graph structure:');
  logger.info('  entry → process → validate → exit\n');

  // Invoke the graph with initial state
  const result = await app.invoke({
    messages: ['Initial message'],
    visited: [],
    counter: 0,
  });

  // Display final state
  logger.info('\n📊 Final State:');
  logger.info(`   Messages: ${JSON.stringify(result.messages, null, 2)}`);
  logger.info(`   Visited: ${result.visited.join(' → ')}`);
  logger.info(`   Counter: ${result.counter}`);

  logger.info('\n✨ Example complete!');
}

// Run the example
main().catch((error) => {
  logger.error('Error running basic graph example:', error);
  process.exit(1);
});
