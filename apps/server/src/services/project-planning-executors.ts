/**
 * Project Planning Executor Factory
 *
 * Creates a ProjectPlanningFlowConfig with real LLM-powered executors.
 * This is the production wiring that replaces mock executors with actual
 * LangChain models resolved from settings.
 *
 * Used by: server index.ts when initializing ProjectPlanningService
 */

import {
  type ProjectPlanningFlowConfig,
  createLLMResearchExecutor,
  createLLMPlanningDocGenerator,
  createLLMDeepResearchExecutor,
  createLLMPRDGenerator,
  createLLMMilestonePlanner,
} from '@protolabs-ai/flows';
import { createLogger } from '@protolabs-ai/utils';
import { createFlowModel } from '../lib/flow-model-factory.js';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('ProjectPlanningExecutors');

/**
 * Creates a ProjectPlanningFlowConfig with real LLM executors.
 *
 * The model for all planning executors is resolved from the 'specGenerationModel'
 * phase setting, applying project-level overrides when projectPath is provided.
 *
 * All 5 planning executors use the smart model by default.
 * The IssueCreator is NOT included here — it's injected separately
 * by ProjectPlanningService using the LinearMCPClient.
 *
 * @param services - Services container with settingsService for model resolution
 * @param projectPath - Optional project path for per-project model overrides
 * @returns Promise resolving to ProjectPlanningFlowConfig with LLM executors
 */
export async function createLLMProjectPlanningConfig(
  services?: { settingsService: SettingsService | null | undefined },
  projectPath?: string
): Promise<ProjectPlanningFlowConfig> {
  const { model: smartModel } = await createFlowModel(
    'specGenerationModel',
    projectPath,
    services ?? { settingsService: undefined }
  );

  logger.info('Created LLM-powered project planning executors (specGenerationModel)');

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
