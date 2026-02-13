/**
 * Example: Prompt Management with Langfuse
 *
 * This example demonstrates how to:
 * - Load prompts from Langfuse with versioning
 * - Use fallback prompts when Langfuse is unavailable
 * - Track prompt usage with metadata
 *
 * Run this example:
 * ```bash
 * # With Langfuse credentials (optional)
 * export LANGFUSE_PUBLIC_KEY=pk-...
 * export LANGFUSE_SECRET_KEY=sk-...
 * export LANGFUSE_BASE_URL=https://cloud.langfuse.com  # optional
 *
 * # Run the example
 * npx tsx libs/observability/examples/prompt-management.ts
 * ```
 */

import { LangfuseClient } from '../src/langfuse/client.js';
import type { PromptConfig } from '../src/langfuse/types.js';

// Initialize Langfuse client with environment variables
// If credentials are missing, the client will work in fallback mode
const langfuse = new LangfuseClient({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
  enabled: true,
});

/**
 * Example 1: Basic prompt fetching with fallback
 */
async function basicPromptFetching() {
  console.log('\n=== Example 1: Basic Prompt Fetching ===\n');

  // Define a prompt configuration with fallback
  const promptConfig: PromptConfig = {
    name: 'code-review-prompt',
    version: 1, // Optional: fetch specific version
    fallbackPrompt: `You are a code reviewer. Analyze the following code and provide feedback on:
- Code quality and readability
- Potential bugs or issues
- Performance considerations
- Best practices

Code to review:
{{code}}`,
    variables: {
      code: 'function add(a, b) { return a + b; }',
    },
  };

  // Try to fetch from Langfuse
  const prompt = await langfuse.getPrompt(promptConfig.name, promptConfig.version);

  if (prompt) {
    console.log('✓ Loaded prompt from Langfuse');
    console.log('Prompt:', prompt.prompt);
    console.log('Version:', prompt.version);
  } else {
    console.log('✓ Using fallback prompt (Langfuse unavailable)');
    console.log('Fallback prompt:', promptConfig.fallbackPrompt);
  }

  // In production, you would use this prompt with your LLM
  const finalPrompt = prompt?.prompt || promptConfig.fallbackPrompt;

  // Replace variables
  let processedPrompt = finalPrompt;
  if (promptConfig.variables) {
    for (const [key, value] of Object.entries(promptConfig.variables)) {
      processedPrompt = processedPrompt.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }
  }

  console.log('\nProcessed prompt ready for LLM:');
  console.log(processedPrompt);
}

/**
 * Example 2: Versioned prompts with tracking
 */
async function versionedPrompts() {
  console.log('\n=== Example 2: Versioned Prompts ===\n');

  // Fetch latest version (no version specified)
  const latestPrompt = await langfuse.getPrompt('feature-implementation');

  if (latestPrompt) {
    console.log('✓ Loaded latest version from Langfuse');
    console.log('Version:', latestPrompt.version);
    console.log('Config:', latestPrompt.config);
  } else {
    console.log('✓ Langfuse unavailable - using fallback mode');
    console.log('In production, use a hardcoded fallback prompt');
  }

  // Fetch specific version (for A/B testing or rollback)
  const v2Prompt = await langfuse.getPrompt('feature-implementation', 2);

  if (v2Prompt) {
    console.log('\n✓ Loaded version 2 from Langfuse');
    console.log('Version:', v2Prompt.version);
  } else {
    console.log('\nVersion 2 not found or Langfuse unavailable');
  }
}

/**
 * Example 3: Prompt usage with tracing
 */
async function promptWithTracing() {
  console.log('\n=== Example 3: Prompt Usage with Tracing ===\n');

  const traceId = `trace-${Date.now()}`;
  const promptName = 'bug-fix-prompt';

  // Create a trace for this prompt execution
  const trace = langfuse.createTrace({
    id: traceId,
    name: 'Bug Fix Agent',
    userId: 'agent-001',
    sessionId: 'session-123',
    metadata: {
      featureId: 'feature-456',
      repository: 'automaker/automaker',
    },
    tags: ['bug-fix', 'agent'],
  });

  if (trace) {
    console.log('✓ Created trace:', traceId);
  } else {
    console.log('✓ Tracing unavailable (fallback mode)');
  }

  // Fetch the prompt
  const prompt = await langfuse.getPrompt(promptName);

  // Simulate LLM generation (this would be actual API call in production)
  const startTime = new Date();
  const mockCompletion = 'The bug is caused by...';
  const endTime = new Date();

  // Log the generation
  const generation = langfuse.createGeneration({
    traceId,
    name: 'bug-analysis',
    model: 'claude-sonnet-4-5',
    modelParameters: {
      temperature: 0.7,
      maxTokens: 2000,
    },
    input: prompt?.prompt || 'Fallback prompt',
    output: mockCompletion,
    usage: {
      promptTokens: 150,
      completionTokens: 300,
      totalTokens: 450,
    },
    metadata: {
      promptName,
      promptVersion: prompt?.version,
    },
    startTime,
    endTime,
  });

  if (generation) {
    console.log('✓ Logged generation to trace');
  }

  console.log('\nExecution complete');
  console.log('- Latency:', endTime.getTime() - startTime.getTime(), 'ms');
  console.log('- Tokens used: 450');

  // Flush events to Langfuse
  await langfuse.flush();
  console.log('✓ Flushed events to Langfuse');
}

/**
 * Example 4: Best practices for fallback mode
 */
async function fallbackBestPractices() {
  console.log('\n=== Example 4: Fallback Best Practices ===\n');

  // Always check if Langfuse is available
  if (langfuse.isAvailable()) {
    console.log('✓ Langfuse is available and enabled');
  } else {
    console.log('✓ Running in fallback mode');
    console.log('  Reasons:');
    console.log('  - Missing LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY');
    console.log('  - Langfuse initialization failed');
    console.log('  - Explicitly disabled via config');
  }

  // Best practice: Always provide fallback prompts
  const promptConfig: PromptConfig = {
    name: 'my-prompt',
    fallbackPrompt: 'This is a hardcoded fallback prompt that works offline',
  };

  const prompt = await langfuse.getPrompt(promptConfig.name);
  const finalPrompt = prompt?.prompt || promptConfig.fallbackPrompt;

  console.log('\n✓ Final prompt ready for use:');
  console.log(finalPrompt);
  console.log('\n✓ Your application works with or without Langfuse!');
}

// Run all examples
async function main() {
  console.log('🚀 Langfuse Prompt Management Examples\n');
  console.log(`Langfuse Status: ${langfuse.isAvailable() ? '✓ Connected' : '✗ Fallback Mode'}\n`);

  await basicPromptFetching();
  await versionedPrompts();
  await promptWithTracing();
  await fallbackBestPractices();

  // Cleanup
  await langfuse.shutdown();
  console.log('\n✓ Shutdown complete');
}

main().catch(console.error);
