/**
 * Example: Tracing with Langfuse
 *
 * This example demonstrates how to:
 * - Create traces for agent executions
 * - Log generations (LLM API calls)
 * - Track spans for multi-step operations
 * - Work in fallback mode without Langfuse
 *
 * Run this example:
 * ```bash
 * # With Langfuse credentials (optional)
 * export LANGFUSE_PUBLIC_KEY=pk-...
 * export LANGFUSE_SECRET_KEY=sk-...
 * export LANGFUSE_BASE_URL=https://cloud.langfuse.com  # optional
 *
 * # Run the example
 * npx tsx libs/observability/examples/tracing.ts
 * ```
 */

import { LangfuseClient } from '../src/langfuse/client.js';
import type {
  CreateTraceParams,
  CreateGenerationParams,
  CreateSpanParams,
} from '../src/langfuse/types.js';

// Initialize Langfuse client
const langfuse = new LangfuseClient({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
  enabled: true,
});

/**
 * Example 1: Basic trace and generation
 */
async function basicTraceAndGeneration() {
  console.log('\n=== Example 1: Basic Trace and Generation ===\n');

  const traceId = `trace-basic-${Date.now()}`;

  // Create a trace for a feature implementation
  const trace = langfuse.createTrace({
    id: traceId,
    name: 'Feature Implementation',
    userId: 'agent-sonnet',
    sessionId: 'session-001',
    metadata: {
      featureId: 'feature-123',
      featureTitle: 'Add user authentication',
      complexity: 'medium',
    },
    tags: ['implementation', 'agent'],
  });

  if (trace) {
    console.log('✓ Created trace:', traceId);
  } else {
    console.log('✓ Fallback mode: trace creation skipped');
  }

  // Simulate LLM generation
  const startTime = new Date();
  await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate work
  const endTime = new Date();

  const generation = langfuse.createGeneration({
    traceId,
    name: 'code-generation',
    model: 'claude-sonnet-4-5-20250929',
    modelParameters: {
      temperature: 0.7,
      maxTokens: 4000,
    },
    input: 'Implement user authentication with JWT tokens',
    output: 'export class AuthService { ... }',
    usage: {
      promptTokens: 500,
      completionTokens: 1200,
      totalTokens: 1700,
    },
    metadata: {
      step: 'initial-implementation',
    },
    startTime,
    endTime,
  });

  if (generation) {
    console.log('✓ Logged generation');
  }

  console.log('Generation details:');
  console.log('- Model: claude-sonnet-4-5-20250929');
  console.log('- Latency:', endTime.getTime() - startTime.getTime(), 'ms');
  console.log('- Tokens: 1700 total (500 prompt + 1200 completion)');

  await langfuse.flush();
  console.log('✓ Flushed events to Langfuse');
}

/**
 * Example 2: Multi-step trace with spans
 */
async function multiStepTraceWithSpans() {
  console.log('\n=== Example 2: Multi-Step Trace with Spans ===\n');

  const traceId = `trace-multistep-${Date.now()}`;

  // Create parent trace
  const trace = langfuse.createTrace({
    id: traceId,
    name: 'Multi-Step Feature Implementation',
    userId: 'agent-sonnet',
    metadata: {
      featureId: 'feature-456',
    },
  });

  if (trace) {
    console.log('✓ Created parent trace:', traceId);
  }

  // Step 1: Planning span
  const planningStart = new Date();
  await new Promise((resolve) => setTimeout(resolve, 50));
  const planningEnd = new Date();

  const planningSpan = langfuse.createSpan({
    traceId,
    name: 'planning',
    input: 'Analyze requirements and plan implementation',
    output: 'Plan: 1) Create types, 2) Implement service, 3) Add tests',
    metadata: {
      step: 1,
      phase: 'planning',
    },
    startTime: planningStart,
    endTime: planningEnd,
  });

  if (planningSpan) {
    console.log('✓ Logged planning span');
  }
  console.log('  Duration:', planningEnd.getTime() - planningStart.getTime(), 'ms');

  // Step 2: Implementation generation
  const implStart = new Date();
  await new Promise((resolve) => setTimeout(resolve, 150));
  const implEnd = new Date();

  const implGeneration = langfuse.createGeneration({
    traceId,
    name: 'implementation',
    model: 'claude-sonnet-4-5-20250929',
    input: 'Implement the service based on the plan',
    output: 'export class UserService { constructor() {...} }',
    usage: {
      promptTokens: 800,
      completionTokens: 2000,
      totalTokens: 2800,
    },
    startTime: implStart,
    endTime: implEnd,
  });

  if (implGeneration) {
    console.log('✓ Logged implementation generation');
  }
  console.log('  Duration:', implEnd.getTime() - implStart.getTime(), 'ms');
  console.log('  Tokens: 2800');

  // Step 3: Testing span
  const testStart = new Date();
  await new Promise((resolve) => setTimeout(resolve, 75));
  const testEnd = new Date();

  const testSpan = langfuse.createSpan({
    traceId,
    name: 'testing',
    input: 'Run tests for UserService',
    output: 'All tests passed (5/5)',
    metadata: {
      step: 3,
      phase: 'verification',
      testsPassed: 5,
      testsFailed: 0,
    },
    startTime: testStart,
    endTime: testEnd,
  });

  if (testSpan) {
    console.log('✓ Logged testing span');
  }
  console.log('  Duration:', testEnd.getTime() - testStart.getTime(), 'ms');

  // Update trace with final result
  if (trace) {
    trace.update({
      output: 'Feature implementation complete',
      metadata: {
        totalSteps: 3,
        status: 'completed',
      },
    });
    console.log('✓ Updated trace with final result');
  }

  await langfuse.flush();
  console.log('✓ Flushed all events');
}

/**
 * Example 3: Error handling and scoring
 */
async function errorHandlingAndScoring() {
  console.log('\n=== Example 3: Error Handling and Scoring ===\n');

  const traceId = `trace-error-${Date.now()}`;

  // Create trace
  const trace = langfuse.createTrace({
    id: traceId,
    name: 'Bug Fix Attempt',
    userId: 'agent-sonnet',
  });

  if (trace) {
    console.log('✓ Created trace:', traceId);
  }

  // First attempt - fails
  const attempt1Start = new Date();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const attempt1End = new Date();

  const attempt1 = langfuse.createGeneration({
    traceId,
    name: 'fix-attempt-1',
    model: 'claude-sonnet-4-5-20250929',
    input: 'Fix TypeError in authentication',
    output: 'Applied fix to auth.ts',
    usage: {
      promptTokens: 600,
      completionTokens: 800,
      totalTokens: 1400,
    },
    metadata: {
      attemptNumber: 1,
      success: false,
      error: 'Tests still failing after fix',
    },
    startTime: attempt1Start,
    endTime: attempt1End,
  });

  if (attempt1) {
    console.log('✓ Logged attempt 1 (failed)');
    // Score the generation
    langfuse.createScore({
      traceId,
      name: 'success',
      value: 0,
      comment: 'Fix did not resolve the issue',
    });
  }

  // Second attempt - succeeds
  const attempt2Start = new Date();
  await new Promise((resolve) => setTimeout(resolve, 120));
  const attempt2End = new Date();

  const attempt2 = langfuse.createGeneration({
    traceId,
    name: 'fix-attempt-2',
    model: 'claude-sonnet-4-5-20250929',
    input: 'Re-analyze TypeError and apply correct fix',
    output: 'Fixed null pointer issue in auth middleware',
    usage: {
      promptTokens: 700,
      completionTokens: 900,
      totalTokens: 1600,
    },
    metadata: {
      attemptNumber: 2,
      success: true,
    },
    startTime: attempt2Start,
    endTime: attempt2End,
  });

  if (attempt2) {
    console.log('✓ Logged attempt 2 (success)');
    // Score the generation
    langfuse.createScore({
      traceId,
      name: 'success',
      value: 1,
      comment: 'Fix resolved the issue, all tests pass',
    });
  }

  // Update trace
  if (trace) {
    trace.update({
      output: 'Bug fixed successfully',
      metadata: {
        attempts: 2,
        totalTokens: 3000,
        resolved: true,
      },
    });
    console.log('✓ Updated trace with resolution');
  }

  await langfuse.flush();
  console.log('✓ Flushed events');
}

/**
 * Example 4: Session tracking across multiple features
 */
async function sessionTracking() {
  console.log('\n=== Example 4: Session Tracking ===\n');

  const sessionId = `session-${Date.now()}`;
  console.log('Session ID:', sessionId);
  console.log('Simulating multiple features in one session...\n');

  // Feature 1
  const trace1 = langfuse.createTrace({
    id: `trace-1-${Date.now()}`,
    name: 'Feature: Add Login',
    userId: 'agent-sonnet',
    sessionId,
    metadata: { featureId: 'feat-1' },
  });

  if (trace1) {
    console.log('✓ Feature 1: Add Login');
  }

  await new Promise((resolve) => setTimeout(resolve, 50));

  langfuse.createGeneration({
    traceId: trace1?.id || `trace-1-${Date.now()}`,
    name: 'implement-login',
    model: 'claude-sonnet-4-5-20250929',
    input: 'Implement login form',
    output: 'export function LoginForm() {...}',
    usage: { promptTokens: 400, completionTokens: 600, totalTokens: 1000 },
  });

  // Feature 2
  const trace2 = langfuse.createTrace({
    id: `trace-2-${Date.now()}`,
    name: 'Feature: Add Logout',
    userId: 'agent-sonnet',
    sessionId,
    metadata: { featureId: 'feat-2' },
  });

  if (trace2) {
    console.log('✓ Feature 2: Add Logout');
  }

  await new Promise((resolve) => setTimeout(resolve, 50));

  langfuse.createGeneration({
    traceId: trace2?.id || `trace-2-${Date.now()}`,
    name: 'implement-logout',
    model: 'claude-sonnet-4-5-20250929',
    input: 'Implement logout functionality',
    output: 'export function logout() {...}',
    usage: { promptTokens: 300, completionTokens: 400, totalTokens: 700 },
  });

  console.log('\n✓ Both features tracked in same session');
  console.log('  View session in Langfuse dashboard to see all related traces');

  await langfuse.flush();
  console.log('✓ Flushed events');
}

/**
 * Example 5: Fallback mode behavior
 */
async function fallbackModeBehavior() {
  console.log('\n=== Example 5: Fallback Mode Behavior ===\n');

  if (langfuse.isAvailable()) {
    console.log('✓ Langfuse is available - events are being logged');
    console.log('  All trace/generation calls send data to Langfuse');
  } else {
    console.log('✓ Running in fallback mode');
    console.log('  All trace/generation calls are no-ops (safe to call)');
    console.log('  Your application continues to work normally');
  }

  // These calls work in both modes
  const trace = langfuse.createTrace({
    id: `trace-fallback-${Date.now()}`,
    name: 'Fallback Example',
  });

  const generation = langfuse.createGeneration({
    traceId: trace?.id || `trace-fallback-${Date.now()}`,
    name: 'example-generation',
    model: 'claude-sonnet-4-5-20250929',
    input: 'test',
    output: 'test output',
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
  });

  console.log('\n✓ Code works identically in both modes');
  console.log('✓ No conditional logic needed in your application');
}

// Run all examples
async function main() {
  console.log('🚀 Langfuse Tracing Examples\n');
  console.log(`Langfuse Status: ${langfuse.isAvailable() ? '✓ Connected' : '✗ Fallback Mode'}\n`);

  await basicTraceAndGeneration();
  await multiStepTraceWithSpans();
  await errorHandlingAndScoring();
  await sessionTracking();
  await fallbackModeBehavior();

  // Cleanup
  await langfuse.shutdown();
  console.log('\n✓ Shutdown complete');
  console.log('\n💡 Tip: View your traces at https://cloud.langfuse.com');
}

main().catch(console.error);
