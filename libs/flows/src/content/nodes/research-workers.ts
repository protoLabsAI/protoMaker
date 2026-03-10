/**
 * Research Workers - Parallel research node implementations
 *
 * Three worker nodes that execute in parallel via Send():
 * 1. WebResearchWorker - synthesizes web findings into structured ResearchFinding objects
 * 2. CodebaseResearchWorker - analyzes codebase context relevant to the content topic
 * 3. ExistingContentWorker - checks for existing related content to avoid duplication
 *
 * Each worker returns findings via appendReducer with model fallback support.
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage } from '@langchain/core/messages';
import type { RunnableConfig } from '@langchain/core/runnables';
import { createLogger } from '@protolabsai/utils';
import { copilotkitEmitState, emitHeartbeat } from '../copilotkit-utils.js';

const logger = createLogger('research-workers');

/**
 * Structured research finding
 */
export interface ResearchFinding {
  source: 'web' | 'codebase' | 'existing_content';
  topic: string;
  content: string;
  relevance: 'high' | 'medium' | 'low';
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Error finding for tracking failures
 */
export interface ErrorFinding {
  worker: string;
  error: string;
  timestamp: string;
  attemptedModel?: string;
}

/**
 * State interface for research workers
 */
export interface ResearchWorkerState {
  topic: string;
  query?: string;
  findings: ResearchFinding[];
  errors: ErrorFinding[];
  smartModel?: BaseChatModel;
  fastModel?: BaseChatModel;
  config?: RunnableConfig;
}

/**
 * Model fallback configuration
 */
interface ModelFallbackConfig {
  primary: BaseChatModel | undefined;
  fallback: BaseChatModel | undefined;
}

/**
 * Executes an LLM call with model fallback chain: smart → fast
 *
 * @param config - Model fallback configuration
 * @param promptFn - Function that takes a model and returns a promise with the result
 * @param workerName - Name of the worker for error tracking
 * @returns Result from the LLM call or throws if all models fail
 */
async function executeWithFallback<T>(
  config: ModelFallbackConfig,
  promptFn: (model: BaseChatModel) => Promise<T>,
  workerName: string
): Promise<T> {
  const models: Array<{ model: BaseChatModel | undefined; name: string }> = [
    { model: config.primary, name: 'smart' },
    { model: config.fallback, name: 'fast' },
  ];

  let lastError: Error | undefined;

  for (const { model, name } of models) {
    if (!model) continue;

    try {
      return await promptFn(model);
    } catch (error) {
      logger.warn(
        `[${workerName}] Model ${name} failed:`,
        error instanceof Error ? error.message : String(error)
      );
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error(`All models failed for ${workerName}`);
}

/**
 * WebResearchWorker - Takes a research query, uses LLM to synthesize web findings
 * into structured ResearchFinding objects
 *
 * @param state - Research worker state
 * @returns Partial state with new findings or errors
 */
export async function webResearchWorker(
  state: ResearchWorkerState
): Promise<Partial<ResearchWorkerState>> {
  const { topic, query, smartModel, fastModel, config } = state;
  const workerName = 'WebResearchWorker';

  logger.info(`[${workerName}] Starting web research for topic: "${topic}"`);

  // Emit state to CopilotKit
  if (config) {
    await copilotkitEmitState(config, {
      currentActivity: `Researching web sources for: ${topic}`,
      progress: 0,
    });
  }

  try {
    const searchQuery = query || topic;

    // Emit heartbeat for long-running operation
    if (config) {
      await emitHeartbeat(config, `Executing web search for: ${searchQuery}`);
    }

    // Execute with model fallback
    const result = await executeWithFallback(
      { primary: smartModel, fallback: fastModel },
      async (model) => {
        // In a real implementation, this would call a web search API
        // For now, we'll use the LLM to simulate findings
        const response = await model.invoke([
          {
            role: 'user',
            content: `Research query: "${searchQuery}". Provide 3 key findings from web research about this topic. Format each as: [FINDING] content [RELEVANCE] high/medium/low`,
          },
        ]);

        return response.content.toString();
      },
      workerName
    );

    // Parse the LLM response into structured findings
    const findings: ResearchFinding[] = [];
    const findingMatches = result.matchAll(/\[FINDING\](.*?)\[RELEVANCE\]\s*(high|medium|low)/gi);

    for (const match of findingMatches) {
      findings.push({
        source: 'web',
        topic,
        content: match[1].trim(),
        relevance: match[2].toLowerCase() as 'high' | 'medium' | 'low',
        timestamp: new Date().toISOString(),
        metadata: { query: searchQuery },
      });
    }

    // If no structured findings were parsed, create a fallback finding
    if (findings.length === 0) {
      findings.push({
        source: 'web',
        topic,
        content: result.substring(0, 500), // Truncate for safety
        relevance: 'medium',
        timestamp: new Date().toISOString(),
        metadata: { query: searchQuery, fallback: true },
      });
    }

    logger.info(`[${workerName}] Successfully gathered ${findings.length} findings`);

    // Emit completion state
    if (config) {
      await copilotkitEmitState(config, {
        currentActivity: `Completed web research for: ${topic}`,
        progress: 100,
      });
    }

    return { findings };
  } catch (error) {
    logger.error(`[${workerName}] Failed:`, error);

    // Graceful degradation - return error finding instead of crashing
    const errorFinding: ErrorFinding = {
      worker: workerName,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    };

    return { errors: [errorFinding] };
  }
}

/**
 * CodebaseResearchWorker - Analyzes codebase context relevant to the content topic
 *
 * @param state - Research worker state
 * @returns Partial state with new findings or errors
 */
export async function codebaseResearchWorker(
  state: ResearchWorkerState
): Promise<Partial<ResearchWorkerState>> {
  const { topic, smartModel, fastModel, config } = state;
  const workerName = 'CodebaseResearchWorker';

  logger.info(`[${workerName}] Starting codebase analysis for topic: "${topic}"`);

  // Emit state to CopilotKit
  if (config) {
    await copilotkitEmitState(config, {
      currentActivity: `Analyzing codebase for: ${topic}`,
      progress: 0,
    });
  }

  try {
    // Emit heartbeat for long-running operation
    if (config) {
      await emitHeartbeat(config, `Analyzing code patterns for: ${topic}`);
    }
    // Execute with model fallback
    const result = await executeWithFallback(
      { primary: smartModel, fallback: fastModel },
      async (model) => {
        // In a real implementation, this would analyze actual codebase files
        const response = await model.invoke([
          {
            role: 'user',
            content: `Analyze codebase for topic: "${topic}". Identify 3 relevant code patterns, files, or architectural considerations. Format each as: [FINDING] content [RELEVANCE] high/medium/low`,
          },
        ]);

        return response.content.toString();
      },
      workerName
    );

    // Parse the LLM response into structured findings
    const findings: ResearchFinding[] = [];
    const findingMatches = result.matchAll(/\[FINDING\](.*?)\[RELEVANCE\]\s*(high|medium|low)/gi);

    for (const match of findingMatches) {
      findings.push({
        source: 'codebase',
        topic,
        content: match[1].trim(),
        relevance: match[2].toLowerCase() as 'high' | 'medium' | 'low',
        timestamp: new Date().toISOString(),
        metadata: { analysisType: 'code_pattern' },
      });
    }

    // Fallback if no structured findings
    if (findings.length === 0) {
      findings.push({
        source: 'codebase',
        topic,
        content: result.substring(0, 500),
        relevance: 'medium',
        timestamp: new Date().toISOString(),
        metadata: { fallback: true },
      });
    }

    logger.info(
      `[${workerName}] Successfully analyzed codebase, found ${findings.length} findings`
    );

    // Emit completion state
    if (config) {
      await copilotkitEmitState(config, {
        currentActivity: `Completed codebase analysis for: ${topic}`,
        progress: 100,
      });
    }

    return { findings };
  } catch (error) {
    logger.error(`[${workerName}] Failed:`, error);

    const errorFinding: ErrorFinding = {
      worker: workerName,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    };

    return { errors: [errorFinding] };
  }
}

/**
 * ExistingContentWorker - Checks for existing related content to avoid duplication
 * and find cross-reference opportunities
 *
 * @param state - Research worker state
 * @returns Partial state with new findings or errors
 */
export async function existingContentWorker(
  state: ResearchWorkerState
): Promise<Partial<ResearchWorkerState>> {
  const { topic, smartModel, fastModel, config } = state;
  const workerName = 'ExistingContentWorker';

  logger.info(`[${workerName}] Starting existing content check for topic: "${topic}"`);

  // Emit state to CopilotKit
  if (config) {
    await copilotkitEmitState(config, {
      currentActivity: `Checking existing content for: ${topic}`,
      progress: 0,
    });
  }

  try {
    // Emit heartbeat for long-running operation
    if (config) {
      await emitHeartbeat(config, `Searching for related content: ${topic}`);
    }
    // Execute with model fallback
    const result = await executeWithFallback(
      { primary: smartModel, fallback: fastModel },
      async (model) => {
        // In a real implementation, this would search existing documentation/content
        const response = await model.invoke([
          {
            role: 'user',
            content: `Check for existing content related to: "${topic}". Identify 2-3 pieces of existing content, potential duplications, or cross-reference opportunities. Format each as: [FINDING] content [RELEVANCE] high/medium/low`,
          },
        ]);

        return response.content.toString();
      },
      workerName
    );

    // Parse the LLM response into structured findings
    const findings: ResearchFinding[] = [];
    const findingMatches = result.matchAll(/\[FINDING\](.*?)\[RELEVANCE\]\s*(high|medium|low)/gi);

    for (const match of findingMatches) {
      findings.push({
        source: 'existing_content',
        topic,
        content: match[1].trim(),
        relevance: match[2].toLowerCase() as 'high' | 'medium' | 'low',
        timestamp: new Date().toISOString(),
        metadata: { checkType: 'duplication_and_crossref' },
      });
    }

    // Fallback if no structured findings
    if (findings.length === 0) {
      findings.push({
        source: 'existing_content',
        topic,
        content: result.substring(0, 500),
        relevance: 'medium',
        timestamp: new Date().toISOString(),
        metadata: { fallback: true },
      });
    }

    logger.info(
      `[${workerName}] Successfully checked existing content, found ${findings.length} findings`
    );

    // Emit completion state
    if (config) {
      await copilotkitEmitState(config, {
        currentActivity: `Completed existing content check for: ${topic}`,
        progress: 100,
      });
    }

    return { findings };
  } catch (error) {
    logger.error(`[${workerName}] Failed:`, error);

    const errorFinding: ErrorFinding = {
      worker: workerName,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    };

    return { errors: [errorFinding] };
  }
}

/**
 * Simple test chat model that returns predefined responses
 */
class TestChatModel extends BaseChatModel {
  private responses: string[];
  private currentIndex = 0;

  constructor(responses: string[]) {
    super({});
    this.responses = responses;
  }

  _llmType(): string {
    return 'test';
  }

  async _generate(messages: BaseMessage[]): Promise<any> {
    const response = this.responses[this.currentIndex % this.responses.length];
    this.currentIndex++;

    return {
      generations: [
        {
          text: response,
          message: new AIMessage(response),
        },
      ],
    };
  }
}

/**
 * Creates default models for testing purposes
 * Uses TestChatModel to allow testing without real API calls
 */
export function createTestModels(): { smartModel: BaseChatModel; fastModel: BaseChatModel } {
  return {
    smartModel: new TestChatModel([
      '[FINDING] Test finding 1 from smart model [RELEVANCE] high\n[FINDING] Test finding 2 from smart model [RELEVANCE] medium',
    ]),
    fastModel: new TestChatModel([
      '[FINDING] Test finding 1 from fast model [RELEVANCE] medium\n[FINDING] Test finding 2 from fast model [RELEVANCE] low',
    ]),
  };
}
