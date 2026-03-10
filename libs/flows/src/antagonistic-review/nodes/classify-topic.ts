/**
 * Classify Topic Node
 *
 * Analyzes a PRD to classify its complexity and determine the appropriate
 * distillation depth for the antagonistic review process.
 *
 * Complexity levels:
 * - small: Minor features, bug fixes, simple changes
 * - medium: Standard features requiring multiple components
 * - large: Major features requiring significant coordination
 * - architectural: System-wide changes affecting core architecture
 *
 * Distillation depth:
 * - 0: Ava + Jon only (fastest review for simple changes)
 * - 1: + 1 additional reviewer pair (standard review)
 * - 2: + all reviewer pairs (full scrutiny for complex/critical changes)
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('classify-topic');

/**
 * Complexity classification schema
 */
export const ComplexitySchema = z.enum(['small', 'medium', 'large', 'architectural']);
export type Complexity = z.infer<typeof ComplexitySchema>;

/**
 * Distillation depth schema
 */
export const DistillationDepthSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type DistillationDepth = z.infer<typeof DistillationDepthSchema>;

/**
 * Classification result schema
 */
export const ClassificationResultSchema = z.object({
  complexity: ComplexitySchema,
  distillationDepth: DistillationDepthSchema,
  reasoning: z.string(),
});
export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

/**
 * State interface for classify-topic node
 */
export interface ClassifyTopicState {
  prd: string;
  classification?: ClassificationResult;
  smartModel?: BaseChatModel;
  fastModel?: BaseChatModel;
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
 * @param nodeName - Name of the node for error tracking
 * @returns Result from the LLM call or throws if all models fail
 */
export async function executeWithFallback<T>(
  config: ModelFallbackConfig,
  promptFn: (model: BaseChatModel) => Promise<T>,
  nodeName: string
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
        `[${nodeName}] Model ${name} failed:`,
        error instanceof Error ? error.message : String(error)
      );
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error(`All models failed for ${nodeName}`);
}

/**
 * Classify Topic Node - Analyzes PRD complexity and determines distillation depth
 *
 * @param state - Node state containing PRD and models
 * @returns Partial state with classification result
 */
export async function classifyTopicNode(
  state: ClassifyTopicState
): Promise<Partial<ClassifyTopicState>> {
  const { prd, smartModel, fastModel } = state;
  const nodeName = 'ClassifyTopicNode';

  logger.info(`[${nodeName}] Starting PRD classification`);

  try {
    // Execute with model fallback
    const result = await executeWithFallback(
      { primary: smartModel, fallback: fastModel },
      async (model) => {
        const response = await model.invoke([
          {
            role: 'user',
            content: `You are a technical project analyzer. Analyze the following PRD and classify its complexity and determine the appropriate review distillation depth.

PRD:
${prd}

Provide your analysis in the following JSON format:
{
  "complexity": "small" | "medium" | "large" | "architectural",
  "distillationDepth": 0 | 1 | 2,
  "reasoning": "Brief explanation of your classification"
}

Complexity guidelines:
- small: Minor features, bug fixes, simple changes (< 100 LOC)
- medium: Standard features requiring multiple components (100-500 LOC)
- large: Major features requiring significant coordination (500-2000 LOC)
- architectural: System-wide changes affecting core architecture (> 2000 LOC or fundamental changes)

Distillation depth guidelines:
- 0: Ava + Jon only (for small, low-risk changes)
- 1: + 1 additional reviewer pair (for medium complexity)
- 2: + all reviewer pairs (for large/architectural or high-risk changes)

Return ONLY the JSON object, no additional text.`,
          },
        ]);

        return response.content.toString();
      },
      nodeName
    );

    // Parse and validate the LLM response
    const classification = parseAndValidateClassification(result, nodeName);

    logger.info(
      `[${nodeName}] Classification complete: ${classification.complexity} (depth: ${classification.distillationDepth})`
    );

    return { classification };
  } catch (error) {
    logger.error(`[${nodeName}] Failed:`, error);
    throw error;
  }
}

/**
 * Parse and validate LLM output as ClassificationResult
 *
 * @param output - Raw LLM output string
 * @param nodeName - Node name for error messages
 * @returns Validated ClassificationResult
 * @throws Error if parsing or validation fails
 */
function parseAndValidateClassification(output: string, nodeName: string): ClassificationResult {
  try {
    // Extract JSON from potential markdown code blocks
    let jsonStr = output.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // Parse JSON
    const parsed = JSON.parse(jsonStr);

    // Validate with Zod
    const validated = ClassificationResultSchema.parse(parsed);

    return validated;
  } catch (error) {
    logger.error(`[${nodeName}] Failed to parse/validate LLM output:`, output);
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`[${nodeName}] Invalid classification format: ${issues}`);
    }
    throw new Error(
      `[${nodeName}] Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
