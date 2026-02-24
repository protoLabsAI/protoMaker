#!/usr/bin/env tsx

/**
 * Human-in-the-Loop (HITL) LangGraph Example
 *
 * This example demonstrates how to pause graph execution for human approval:
 * - Using conditional edges for decision points
 * - Implementing interrupts for human review
 * - Resuming execution after approval
 * - Using checkpointers to persist state
 *
 * Usage: npm run example:hitl
 */

import { Annotation, StateGraph, MemorySaver } from '@langchain/langgraph';
import { createLogger } from '@protolabs-ai/utils';
import * as readline from 'node:readline/promises';

const logger = createLogger('hitl-graph');

// State definition with approval tracking
const HITLState = Annotation.Root({
  task: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  analysis: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  approved: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => false,
  }),
  needsReview: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => false,
  }),
  result: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  steps: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
});

/**
 * Analyze the task and determine if it needs human review
 */
function analyzeTask(state: typeof HITLState.State) {
  logger.info('🔍 Analyzing task...');

  const task = state.task;
  const analysis = `Analysis of: "${task}"`;

  // Simulate risk assessment - tasks with "delete" or "remove" need review
  const needsReview =
    task.toLowerCase().includes('delete') ||
    task.toLowerCase().includes('remove') ||
    task.toLowerCase().includes('critical');

  logger.info(`   Risk level: ${needsReview ? 'HIGH - needs review' : 'LOW - auto-approve'}`);

  return {
    analysis,
    needsReview,
    steps: ['Task analyzed'],
  };
}

/**
 * Human review checkpoint - graph execution pauses here
 */
function humanReview(state: typeof HITLState.State) {
  logger.info('\n⏸️  HUMAN REVIEW REQUIRED');
  logger.info(`   Task: ${state.task}`);
  logger.info(`   Analysis: ${state.analysis}`);

  // This node sets a flag that the interrupt check will see
  return {
    steps: ['Awaiting human review'],
  };
}

/**
 * Execute the approved task
 */
function executeTask(state: typeof HITLState.State) {
  logger.info('⚡ Executing task...');

  const result = `Task "${state.task}" completed successfully`;

  return {
    result,
    steps: ['Task executed'],
  };
}

/**
 * Router function - decides next node based on state
 */
function routeAfterAnalysis(state: typeof HITLState.State): string {
  if (state.needsReview) {
    return 'human_review';
  }
  return 'execute';
}

/**
 * Router after human review - check approval
 */
function routeAfterReview(state: typeof HITLState.State): string {
  if (state.approved) {
    return 'execute';
  }
  return '__end__';
}

/**
 * Interactive approval prompt
 */
async function getHumanApproval(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question('\n❓ Approve this task? (yes/no): ');
    return answer.toLowerCase().trim() === 'yes';
  } finally {
    rl.close();
  }
}

/**
 * Build and run the HITL graph
 */
async function main() {
  logger.info('🚀 LangGraph HITL (Human-in-the-Loop) Example\n');

  // Create checkpointer to save state between interrupts
  const checkpointer = new MemorySaver();

  // Build the workflow
  const workflow = new StateGraph(HITLState);

  // Add nodes
  workflow.addNode('analyze', analyzeTask);
  workflow.addNode('human_review', humanReview);
  workflow.addNode('execute', executeTask);

  // Set entry point
  workflow.setEntryPoint('analyze');

  // Add conditional edges
  workflow.addConditionalEdges('analyze', routeAfterAnalysis, {
    human_review: 'human_review',
    execute: 'execute',
  });

  workflow.addConditionalEdges('human_review', routeAfterReview, {
    execute: 'execute',
    __end__: '__end__',
  });

  workflow.addEdge('execute', '__end__');

  // Compile with checkpointer and interrupt before human_review
  const app = workflow.compile({
    checkpointer,
    interruptBefore: ['human_review'],
  });

  logger.info('Graph structure:');
  logger.info('  analyze → [needs review?] → human_review → execute');
  logger.info('         ↘ [auto-approve] ↗              ↘ [rejected] → end\n');

  // Example 1: Task that needs review
  logger.info('═══════════════════════════════════════════');
  logger.info('Example 1: High-risk task (needs review)\n');

  const config1 = { configurable: { thread_id: 'example-1' } };
  const input1 = {
    task: 'Delete all user data',
    approved: false,
    needsReview: false,
    analysis: '',
    result: '',
    steps: [],
  };

  // First invocation - runs until interrupt
  logger.info('First invocation (will pause for review):');
  let result = await app.invoke(input1, config1);

  logger.info('\n📊 State after analysis:');
  logger.info(`   Steps: ${result.steps.join(' → ')}`);
  logger.info(`   Needs review: ${result.needsReview}`);

  // Get human approval
  const approved = await getHumanApproval();

  // Resume with approval decision
  logger.info(`\n${approved ? '✅' : '❌'} Human decision: ${approved ? 'APPROVED' : 'REJECTED'}`);
  result = await app.invoke({ ...result, approved }, config1);

  logger.info('\n📊 Final state:');
  logger.info(`   Steps: ${result.steps.join(' → ')}`);
  if (result.result) {
    logger.info(`   Result: ${result.result}`);
  } else {
    logger.info('   Result: Task rejected by human');
  }

  // Example 2: Task that auto-approves
  logger.info('\n═══════════════════════════════════════════');
  logger.info('Example 2: Low-risk task (auto-approve)\n');

  const config2 = { configurable: { thread_id: 'example-2' } };
  const input2 = {
    task: 'Generate monthly report',
    approved: false,
    needsReview: false,
    analysis: '',
    result: '',
    steps: [],
  };

  result = await app.invoke(input2, config2);

  logger.info('\n📊 Final state:');
  logger.info(`   Steps: ${result.steps.join(' → ')}`);
  logger.info(`   Result: ${result.result}`);

  logger.info('\n✨ HITL example complete!');
}

// Run the example
main().catch((error) => {
  logger.error('Error running HITL graph example:', error);
  process.exit(1);
});
