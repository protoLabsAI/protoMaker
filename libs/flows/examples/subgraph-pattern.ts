#!/usr/bin/env tsx

/**
 * Subgraph Pattern Example
 *
 * This example demonstrates how to compose complex workflows using subgraphs:
 * - Creating reusable graph components
 * - Nesting graphs within graphs
 * - Sharing state between parent and child graphs
 * - Building modular, maintainable workflows
 *
 * Usage: npm run example:subgraph
 */

import { Annotation, StateGraph } from '@langchain/langgraph';
import { createLogger } from '@protolabs-ai/utils';

const logger = createLogger('subgraph-pattern');

// Parent graph state - the top-level workflow
const ParentState = Annotation.Root({
  input: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  preprocessed: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  validated: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => false,
  }),
  processed: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  output: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  steps: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
});

// Validation subgraph state - specialized for validation logic
const ValidationState = Annotation.Root({
  data: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  isValid: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => false,
  }),
  errors: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
});

// Processing subgraph state - specialized for data processing
const ProcessingState = Annotation.Root({
  input: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  transformed: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  enriched: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  output: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
});

// === VALIDATION SUBGRAPH ===

function checkLength(state: typeof ValidationState.State) {
  logger.info('   🔍 Validation: Checking length...');
  const isValid = state.data.length >= 5;
  return {
    isValid,
    errors: isValid ? [] : ['Data too short (minimum 5 characters)'],
  };
}

function checkFormat(state: typeof ValidationState.State) {
  logger.info('   🔍 Validation: Checking format...');

  // Only check format if previous validation passed
  if (!state.isValid) {
    return {};
  }

  const hasAlpha = /[a-zA-Z]/.test(state.data);
  return {
    isValid: hasAlpha,
    errors: hasAlpha ? [] : ['Data must contain letters'],
  };
}

function validationResult(state: typeof ValidationState.State) {
  logger.info(`   ✅ Validation result: ${state.isValid ? 'PASSED' : 'FAILED'}`);
  if (state.errors.length > 0) {
    logger.info(`   ❌ Errors: ${state.errors.join(', ')}`);
  }
  return {};
}

/**
 * Build the validation subgraph
 */
function createValidationSubgraph() {
  const subgraph = new StateGraph(ValidationState);

  subgraph.addNode('check_length', checkLength);
  subgraph.addNode('check_format', checkFormat);
  subgraph.addNode('result', validationResult);

  subgraph.setEntryPoint('check_length');
  subgraph.addEdge('check_length', 'check_format');
  subgraph.addEdge('check_format', 'result');
  subgraph.setFinishPoint('result');

  return subgraph.compile();
}

// === PROCESSING SUBGRAPH ===

function transform(state: typeof ProcessingState.State) {
  logger.info('   ⚙️  Processing: Transforming data...');
  const transformed = state.input.toUpperCase();
  return { transformed };
}

function enrich(state: typeof ProcessingState.State) {
  logger.info('   ⚙️  Processing: Enriching data...');
  const enriched = `[PROCESSED] ${state.transformed}`;
  return { enriched };
}

function formatOutput(state: typeof ProcessingState.State) {
  logger.info('   ⚙️  Processing: Formatting output...');
  const output = `${state.enriched} [COMPLETE]`;
  return { output };
}

/**
 * Build the processing subgraph
 */
function createProcessingSubgraph() {
  const subgraph = new StateGraph(ProcessingState);

  subgraph.addNode('transform', transform);
  subgraph.addNode('enrich', enrich);
  subgraph.addNode('format', formatOutput);

  subgraph.setEntryPoint('transform');
  subgraph.addEdge('transform', 'enrich');
  subgraph.addEdge('enrich', 'format');
  subgraph.setFinishPoint('format');

  return subgraph.compile();
}

// === PARENT GRAPH NODES ===

function preprocess(state: typeof ParentState.State) {
  logger.info('📝 Preprocessing input...');
  const preprocessed = state.input.trim();
  return {
    preprocessed,
    steps: ['Preprocessed input'],
  };
}

/**
 * Node that invokes the validation subgraph
 */
async function validate(state: typeof ParentState.State) {
  logger.info('🔐 Running validation subgraph...');

  const validationGraph = createValidationSubgraph();

  // Map parent state to subgraph input
  const validationInput = {
    data: state.preprocessed,
    isValid: false,
    errors: [],
  };

  // Invoke the subgraph
  const validationResult = await validationGraph.invoke(validationInput);

  // Map subgraph output back to parent state
  return {
    validated: validationResult.isValid,
    steps: ['Validation complete'],
  };
}

/**
 * Node that invokes the processing subgraph
 */
async function process(state: typeof ParentState.State) {
  logger.info('⚡ Running processing subgraph...');

  const processingGraph = createProcessingSubgraph();

  // Map parent state to subgraph input
  const processingInput = {
    input: state.preprocessed,
    transformed: '',
    enriched: '',
    output: '',
  };

  // Invoke the subgraph
  const processingResult = await processingGraph.invoke(processingInput);

  // Map subgraph output back to parent state
  return {
    processed: processingResult.output,
    steps: ['Processing complete'],
  };
}

function finalize(state: typeof ParentState.State) {
  logger.info('🎯 Finalizing output...');
  return {
    output: state.processed,
    steps: ['Finalized'],
  };
}

/**
 * Router - only process if validation passed
 */
function routeAfterValidation(state: typeof ParentState.State): string {
  if (state.validated) {
    return 'process';
  }
  return '__end__';
}

/**
 * Build and run the parent graph with subgraphs
 */
async function main() {
  logger.info('🚀 LangGraph Subgraph Pattern Example\n');

  // Build parent workflow
  const workflow = new StateGraph(ParentState);

  workflow.addNode('preprocess', preprocess);
  workflow.addNode('validate', validate);
  workflow.addNode('process', process);
  workflow.addNode('finalize', finalize);

  workflow.setEntryPoint('preprocess');
  workflow.addEdge('preprocess', 'validate');

  workflow.addConditionalEdges('validate', routeAfterValidation, {
    process: 'process',
    __end__: '__end__',
  });

  workflow.addEdge('process', 'finalize');
  workflow.addEdge('finalize', '__end__');

  const app = workflow.compile();

  logger.info('Graph structure:');
  logger.info('  preprocess → validate → [valid?] → process → finalize');
  logger.info('                         ↘ [invalid] → end\n');
  logger.info('  Subgraphs:');
  logger.info('    validate: check_length → check_format → result');
  logger.info('    process:  transform → enrich → format\n');

  // Example 1: Valid input
  logger.info('═══════════════════════════════════════════');
  logger.info('Example 1: Valid input\n');

  let result = await app.invoke({
    input: '  hello world  ',
    preprocessed: '',
    validated: false,
    processed: '',
    output: '',
    steps: [],
  });

  logger.info('\n📊 Final state:');
  logger.info(`   Input: "${result.input}"`);
  logger.info(`   Output: "${result.output}"`);
  logger.info(`   Steps: ${result.steps.join(' → ')}`);
  logger.info(`   Validated: ${result.validated}`);

  // Example 2: Invalid input (too short)
  logger.info('\n═══════════════════════════════════════════');
  logger.info('Example 2: Invalid input (too short)\n');

  result = await app.invoke({
    input: 'hi',
    preprocessed: '',
    validated: false,
    processed: '',
    output: '',
    steps: [],
  });

  logger.info('\n📊 Final state:');
  logger.info(`   Input: "${result.input}"`);
  logger.info(`   Output: "${result.output}"`);
  logger.info(`   Steps: ${result.steps.join(' → ')}`);
  logger.info(`   Validated: ${result.validated}`);

  // Example 3: Invalid input (no letters)
  logger.info('\n═══════════════════════════════════════════');
  logger.info('Example 3: Invalid input (no letters)\n');

  result = await app.invoke({
    input: '12345',
    preprocessed: '',
    validated: false,
    processed: '',
    output: '',
    steps: [],
  });

  logger.info('\n📊 Final state:');
  logger.info(`   Input: "${result.input}"`);
  logger.info(`   Output: "${result.output}"`);
  logger.info(`   Steps: ${result.steps.join(' → ')}`);
  logger.info(`   Validated: ${result.validated}`);

  logger.info('\n✨ Subgraph pattern example complete!');
  logger.info('\n💡 Key takeaways:');
  logger.info('   - Subgraphs are independent, reusable workflows');
  logger.info('   - Parent graph invokes subgraphs as regular nodes');
  logger.info('   - State mapping happens at subgraph boundaries');
  logger.info('   - Each subgraph can have its own state schema');
}

// Run the example
main().catch((error) => {
  logger.error('Error running subgraph pattern example:', error);
  process.exit(1);
});
