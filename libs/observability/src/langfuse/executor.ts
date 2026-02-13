import { randomUUID } from 'node:crypto';
import { createLogger } from '@automaker/utils';
import { LangfuseClient } from './client.js';
import type { PromptConfig } from './types.js';

/**
 * Options for executing a tracked prompt via the Langfuse executor
 */
interface ExecuteTrackedPromptOptions {
  version?: number;
  fallbackPrompt?: string;
  variables?: Record<string, string>;
  executor: (prompt: string, context: any) => Promise<string>;
  traceId?: string;
  traceName?: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
  tags?: string[];
  model?: string;
  modelParameters?: Record<string, any>;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
}

/**
 * Result from executing a tracked prompt
 */
interface ExecuteTrackedPromptResult {
  output: string;
  traceId: string;
  generationId: string;
  latencyMs: number;
  promptConfig?: PromptConfig;
  error?: Error;
}

const logger = createLogger('LangfuseExecutor');

/**
 * Replace variables in template string with values from context
 * Variables are in the format {{VARIABLE_NAME}}
 */
function injectVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, varName) => {
    const value = variables[varName];
    if (value === undefined) {
      logger.warn(`Variable ${varName} not found in context, keeping placeholder`);
      return match;
    }
    return value;
  });
}

/**
 * Execute a prompt with tracking via Langfuse
 * Falls back to local execution if Langfuse is unavailable
 */
export async function executeTrackedPrompt(
  client: LangfuseClient,
  promptName: string,
  options: ExecuteTrackedPromptOptions
): Promise<ExecuteTrackedPromptResult> {
  const startTime = new Date();
  const traceId = options.traceId ?? randomUUID();
  const generationId = randomUUID();

  // Try to fetch prompt from Langfuse
  let promptTemplate: string;
  let promptConfig: PromptConfig | undefined;

  if (client.isAvailable()) {
    try {
      const langfusePrompt = await client.getPrompt(promptName, options.version);

      if (langfusePrompt) {
        logger.info(`Using prompt from Langfuse: ${promptName}`);
        promptTemplate = langfusePrompt.prompt;
        promptConfig = {
          name: promptName,
          version: langfusePrompt.version,
        };
      } else {
        // Langfuse failed, use fallback
        logger.info(`Langfuse prompt fetch failed, using fallback for: ${promptName}`);
        if (!options.fallbackPrompt) {
          throw new Error(`No fallback prompt provided for ${promptName}`);
        }
        promptTemplate = options.fallbackPrompt;
      }
    } catch (error) {
      logger.error(`Error fetching prompt from Langfuse: ${promptName}`, error);
      if (!options.fallbackPrompt) {
        throw new Error(`No fallback prompt provided for ${promptName}`);
      }
      promptTemplate = options.fallbackPrompt;
    }
  } else {
    // Langfuse not available, use fallback
    logger.info(`Langfuse unavailable, using fallback for: ${promptName}`);
    if (!options.fallbackPrompt) {
      throw new Error(`No fallback prompt provided for ${promptName}`);
    }
    promptTemplate = options.fallbackPrompt;
  }

  // Inject variables
  const injectedPrompt = injectVariables(promptTemplate, options.variables ?? {});

  // Validate executor is provided
  if (!options.executor) {
    throw new Error('No executor function provided');
  }

  // Execute the prompt (caller is responsible for actual LLM call)
  // This function handles tracking/tracing but delegates execution
  const executionContext = {
    prompt: injectedPrompt,
    traceId,
    generationId,
    promptConfig,
  };

  // Create trace in Langfuse if available
  if (client.isAvailable()) {
    client.createTrace({
      id: traceId,
      name: options.traceName ?? `prompt:${promptName}`,
      userId: options.userId,
      sessionId: options.sessionId,
      metadata: {
        promptName,
        promptVersion: options.version,
        ...options.metadata,
      },
      tags: options.tags,
    });
  }

  // Execute the actual prompt (caller-provided function)
  let output: string;
  let error: Error | undefined;

  try {
    output = await options.executor(injectedPrompt, executionContext);
  } catch (err) {
    error = err as Error;
    output = '';
    logger.error(`Prompt execution failed: ${promptName}`, err);
  }

  const endTime = new Date();
  const latencyMs = endTime.getTime() - startTime.getTime();

  // Create generation span in Langfuse if available
  if (client.isAvailable()) {
    client.createGeneration({
      traceId,
      id: generationId,
      name: promptName,
      model: options.model,
      modelParameters: options.modelParameters,
      input: injectedPrompt,
      output,
      usage: options.usage,
      metadata: {
        promptName,
        latencyMs,
        error: error?.message,
        ...options.metadata,
      },
      startTime,
      endTime,
    });

    // Flush events
    await client.flush();
  }

  return {
    output,
    traceId,
    generationId,
    latencyMs,
    promptConfig,
    error,
  };
}
