/**
 * Normalize Idea Node
 *
 * First node in the Idea Processing LangGraph flow. Handles:
 * - Normalizes idea format from Discord/Linear/CLI input sources
 * - Classifies complexity (trivial/standard/complex) via Sonnet
 * - Extracts structured fields (title, domain, keywords)
 * - Routes to fast path (trivial) or full research (standard/complex)
 *
 * Complexity levels:
 * - trivial: Small improvements, obvious features, < 50 LOC
 * - standard: Medium features requiring analysis, 50-500 LOC
 * - complex: Major features requiring deep research, > 500 LOC or architectural
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';

// ─── Schemas ────────────────────────────────────────────────────────────────

/**
 * Complexity classification schema
 */
export const ComplexitySchema = z.enum(['trivial', 'standard', 'complex']);
export type Complexity = z.infer<typeof ComplexitySchema>;

/**
 * Input source schema
 */
export const InputSourceSchema = z.enum(['discord', 'linear', 'cli', 'api']);
export type InputSource = z.infer<typeof InputSourceSchema>;

/**
 * Normalized idea structure
 */
export const NormalizedIdeaSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  domain: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  complexity: ComplexitySchema,
  reasoning: z.string(),
});
export type NormalizedIdea = z.infer<typeof NormalizedIdeaSchema>;

// ─── State Interface ────────────────────────────────────────────────────────

/**
 * State interface for normalize-idea node
 */
export interface NormalizeIdeaState {
  /** Raw idea text from user */
  rawIdea: string;
  /** Input source (discord/linear/cli) */
  inputSource: InputSource;
  /** Normalized and classified idea */
  normalizedIdea?: NormalizedIdea;
  /** Smart model for classification (Sonnet) */
  smartModel?: BaseChatModel;
  /** Fast model for fallback (Haiku) */
  fastModel?: BaseChatModel;
}

// ─── Model Fallback ─────────────────────────────────────────────────────────

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
      console.warn(
        `[${nodeName}] Model ${name} failed:`,
        error instanceof Error ? error.message : String(error)
      );
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error(`All models failed for ${nodeName}`);
}

// ─── Node Implementation ────────────────────────────────────────────────────

/**
 * Normalize Idea Node - Classifies and extracts structured fields from raw idea
 *
 * @param state - Node state containing raw idea and models
 * @returns Partial state with normalized idea
 */
export async function normalizeIdeaNode(
  state: NormalizeIdeaState
): Promise<Partial<NormalizeIdeaState>> {
  const { rawIdea, inputSource, smartModel, fastModel } = state;
  const nodeName = 'NormalizeIdeaNode';

  console.log(`[${nodeName}] Starting idea normalization (source: ${inputSource})`);

  try {
    // Execute with model fallback
    const result = await executeWithFallback(
      { primary: smartModel, fallback: fastModel },
      async (model) => {
        const response = await model.invoke([
          {
            role: 'user',
            content: buildNormalizationPrompt(rawIdea, inputSource),
          },
        ]);

        return response.content.toString();
      },
      nodeName
    );

    // Parse and validate the LLM response
    const normalizedIdea = parseAndValidateNormalizedIdea(result, nodeName);

    console.log(
      `[${nodeName}] Normalization complete: "${normalizedIdea.title}" (${normalizedIdea.complexity})`
    );

    return { normalizedIdea };
  } catch (error) {
    console.error(`[${nodeName}] Failed:`, error);
    throw error;
  }
}

// ─── Prompt Building ────────────────────────────────────────────────────────

/**
 * Builds the normalization prompt based on input source
 *
 * @param rawIdea - Raw idea text
 * @param inputSource - Input source type
 * @returns Formatted prompt string
 */
function buildNormalizationPrompt(rawIdea: string, inputSource: InputSource): string {
  const sourceContext = getSourceContext(inputSource);

  return `You are an AI idea analyzer. Analyze the following idea and extract structured information.

${sourceContext}

RAW IDEA:
${rawIdea}

Provide your analysis in the following JSON format:
{
  "title": "Concise title (max 200 chars)",
  "description": "Clear, detailed description of the idea",
  "domain": "Technical domain (e.g., 'frontend', 'backend', 'infrastructure', 'ai', 'ux')",
  "keywords": ["key", "words", "for", "search"],
  "complexity": "trivial" | "standard" | "complex",
  "reasoning": "Brief explanation of complexity classification"
}

COMPLEXITY GUIDELINES:
- trivial: Small improvements, obvious features, bug fixes (< 50 LOC, no research needed)
- standard: Medium features requiring analysis and planning (50-500 LOC, moderate research)
- complex: Major features requiring deep research (> 500 LOC, architectural changes, cross-cutting concerns)

EXTRACTION GUIDELINES:
- Title: Extract or generate a clear, actionable title
- Description: Clean up and expand the idea into a proper description
- Domain: Identify the primary technical domain
- Keywords: Extract 3-5 relevant keywords for search/categorization
- Complexity: Classify based on scope, impact, and unknowns

Return ONLY the JSON object, no additional text.`;
}

/**
 * Returns context-specific guidance based on input source
 *
 * @param inputSource - Input source type
 * @returns Context string for the prompt
 */
function getSourceContext(inputSource: InputSource): string {
  switch (inputSource) {
    case 'discord':
      return `INPUT SOURCE: Discord message
This may be informal, conversational, or contain message metadata. Extract the core idea.`;

    case 'linear':
      return `INPUT SOURCE: Linear issue
This may contain structured fields like title, description, labels. Extract and normalize.`;

    case 'cli':
      return `INPUT SOURCE: CLI input
This may be terse or command-like. Expand into a proper feature description.`;

    case 'api':
      return `INPUT SOURCE: API request
This may already be structured. Validate and normalize the format.`;

    default:
      return 'INPUT SOURCE: Unknown\nExtract the core idea from the provided text.';
  }
}

// ─── Response Parsing ───────────────────────────────────────────────────────

/**
 * Parse and validate LLM output as NormalizedIdea
 *
 * @param output - Raw LLM output string
 * @param nodeName - Node name for error messages
 * @returns Validated NormalizedIdea
 * @throws Error if parsing or validation fails
 */
function parseAndValidateNormalizedIdea(output: string, nodeName: string): NormalizedIdea {
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
    const validated = NormalizedIdeaSchema.parse(parsed);

    return validated;
  } catch (error) {
    console.error(`[${nodeName}] Failed to parse/validate LLM output:`, output);
    if (error instanceof z.ZodError) {
      const issues = error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`[${nodeName}] Invalid normalization format: ${issues}`);
    }
    throw new Error(
      `[${nodeName}] Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ─── Routing Helper ─────────────────────────────────────────────────────────

/**
 * Determines if the idea should route to fast path
 *
 * @param complexity - Complexity classification
 * @returns true if idea should use fast path (trivial), false for full research
 */
export function shouldUseFastPath(complexity: Complexity): boolean {
  return complexity === 'trivial';
}
