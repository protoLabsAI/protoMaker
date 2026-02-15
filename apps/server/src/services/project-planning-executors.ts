/**
 * Project Planning Executor Factory
 *
 * Creates a ProjectPlanningFlowConfig with real LLM-powered executors.
 * This is the production wiring that replaces mock executors with actual
 * ChatAnthropic models.
 *
 * Used by: server index.ts when initializing ProjectPlanningService
 */

import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatAnthropic } from '@langchain/anthropic';
import {
  type ProjectPlanningFlowConfig,
  createLLMResearchExecutor,
  createLLMPlanningDocGenerator,
  createLLMDeepResearchExecutor,
  createLLMPRDGenerator,
  createLLMMilestonePlanner,
} from '@automaker/flows';
import { createLogger } from '@automaker/utils';

const logger = createLogger('ProjectPlanningExecutors');

/**
 * Create ChatAnthropic models for planning flow.
 *
 * Uses sonnet for all planning tasks (smart model).
 * The double cast is needed due to LangChain type mismatch on the 'profile' property
 * — same pattern used in ContentFlowService and AntagonisticReviewAdapter.
 */
function createModels(): { smartModel: BaseChatModel; fastModel: BaseChatModel } {
  const smartModel = new ChatAnthropic({
    model: 'claude-sonnet-4-5-20250929',
    temperature: 0.7,
    maxTokens: 8192,
  }) as unknown as BaseChatModel;

  const fastModel = new ChatAnthropic({
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.5,
    maxTokens: 4096,
  }) as unknown as BaseChatModel;

  return { smartModel, fastModel };
}

/**
 * Creates a ProjectPlanningFlowConfig with real LLM executors.
 *
 * All 5 planning executors use the smart model (sonnet) by default.
 * The IssueCreator is NOT included here — it's injected separately
 * by ProjectPlanningService using the LinearMCPClient.
 */
export function createLLMProjectPlanningConfig(): ProjectPlanningFlowConfig {
  const { smartModel } = createModels();

  logger.info('Created LLM-powered project planning executors (sonnet)');

  return {
    researchExecutor: createLLMResearchExecutor(smartModel),
    planningDocGenerator: createLLMPlanningDocGenerator(smartModel),
    deepResearchExecutor: createLLMDeepResearchExecutor(smartModel),
    prdGenerator: createLLMPRDGenerator(smartModel),
    milestonePlanner: createLLMMilestonePlanner(smartModel),
    enableCheckpointing: true,
    // issueCreator intentionally omitted — ProjectPlanningService injects
    // the real Linear issue creator using LinearMCPClient
  };
}
