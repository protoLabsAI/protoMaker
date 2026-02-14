/**
 * SectionWriter Subgraph
 *
 * Generates a single content section with isolated message state.
 * Features:
 * - Model fallback chain (smart → fast)
 * - Retry loop with Zod validation (max 2 retries)
 * - Langfuse tracing per generation
 * - Returns typed ContentSection
 */

import { StateGraph, Annotation } from '@langchain/langgraph';
import { z } from 'zod';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createLogger } from '@automaker/utils';
import { LangfuseClient } from '@automaker/observability';

const logger = createLogger('SectionWriter');

/**
 * Code example schema
 */
const CodeExampleSchema = z.object({
  language: z.string(),
  code: z.string(),
  explanation: z.string().optional(),
});

/**
 * Content section schema for validation
 */
const ContentSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  codeExamples: z.array(CodeExampleSchema).optional(),
  references: z.array(z.string()).optional(),
});

export type ContentSection = z.infer<typeof ContentSectionSchema>;
export type CodeExample = z.infer<typeof CodeExampleSchema>;

/**
 * Section specification input
 */
export interface SectionSpec {
  id: string;
  title: string;
  description: string;
  includeCodeExamples?: boolean;
  targetLength?: number; // words
}

/**
 * Research findings relevant to section
 */
export interface ResearchFindings {
  facts: string[];
  examples: string[];
  references: string[];
}

/**
 * Content style configuration
 */
export interface ContentStyleConfig {
  tone: 'technical' | 'conversational' | 'formal';
  audience: 'beginner' | 'intermediate' | 'expert';
  format: 'tutorial' | 'reference' | 'guide';
}

/**
 * SectionWriter state with message isolation
 */
export const SectionWriterState = Annotation.Root({
  // Input
  sectionSpec: Annotation<SectionSpec>,
  researchFindings: Annotation<ResearchFindings>,
  styleConfig: Annotation<ContentStyleConfig>,
  smartModel: Annotation<BaseChatModel>,
  fastModel: Annotation<BaseChatModel>,
  langfuseClient: Annotation<LangfuseClient | undefined>,
  traceId: Annotation<string | undefined>,

  // Isolated message state
  messages: Annotation<Array<{ role: string; content: string }>>,

  // Internal state
  currentModel: Annotation<'smart' | 'fast'>,
  retryCount: Annotation<number>,
  validationError: Annotation<string | undefined>,

  // Output
  section: Annotation<ContentSection | undefined>,
  error: Annotation<string | undefined>,
});

export type SectionWriterStateType = typeof SectionWriterState.State;

/**
 * Generate section content using the current model
 */
async function generateNode(
  state: SectionWriterStateType
): Promise<Partial<SectionWriterStateType>> {
  const {
    sectionSpec,
    researchFindings,
    styleConfig,
    smartModel,
    fastModel,
    currentModel,
    messages,
    langfuseClient,
    traceId,
    retryCount,
  } = state;

  const model = currentModel === 'smart' ? smartModel : fastModel;
  const modelName = currentModel === 'smart' ? 'smart-model' : 'fast-model';

  logger.info(`Generating section "${sectionSpec.title}" with ${modelName} (retry: ${retryCount})`);

  // Build generation prompt
  const prompt = buildSectionPrompt(sectionSpec, researchFindings, styleConfig);

  // Create trace if Langfuse is available
  const generationStartTime = new Date();
  let generationId: string | undefined;

  if (langfuseClient?.isAvailable() && traceId) {
    generationId = `gen-${Date.now()}`;
    langfuseClient.createGeneration({
      traceId,
      id: generationId,
      name: 'section-generation',
      model: modelName,
      input: prompt,
      metadata: {
        sectionId: sectionSpec.id,
        sectionTitle: sectionSpec.title,
        modelTier: currentModel,
        retryCount,
      },
      startTime: generationStartTime,
    });
  }

  try {
    // Invoke model
    const response = await model.invoke([{ role: 'user', content: prompt }]);

    // Extract content from response - handle both string and array formats
    let content = '';
    if (typeof response.content === 'string') {
      content = response.content;
    } else if (Array.isArray(response.content)) {
      // LangChain can return content as array of objects
      content = response.content
        .map((c: any) => (typeof c === 'string' ? c : c.text || ''))
        .join('');
    }

    const generationEndTime = new Date();

    // Parse JSON response
    let parsedSection: ContentSection;
    try {
      parsedSection = JSON.parse(content);
    } catch (parseError) {
      throw new Error(`Failed to parse JSON response: ${parseError}`);
    }

    // Update trace with successful generation
    if (langfuseClient?.isAvailable() && traceId && generationId) {
      langfuseClient.createGeneration({
        traceId,
        id: generationId,
        name: 'section-generation',
        model: modelName,
        input: prompt,
        output: content,
        metadata: {
          sectionId: sectionSpec.id,
          sectionTitle: sectionSpec.title,
          modelTier: currentModel,
          retryCount,
          success: true,
        },
        startTime: generationStartTime,
        endTime: generationEndTime,
      });
      await langfuseClient.flush();
    }

    // Add message to isolated state
    const newMessages = [
      ...messages,
      { role: 'user', content: prompt },
      { role: 'assistant', content: `Generated section: ${sectionSpec.title}` },
    ];

    return {
      section: parsedSection,
      messages: newMessages,
      error: undefined,
      validationError: undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Generation failed with ${modelName}: ${errorMessage}`);

    const generationEndTime = new Date();

    // Update trace with error
    if (langfuseClient?.isAvailable() && traceId && generationId) {
      langfuseClient.createGeneration({
        traceId,
        id: generationId,
        name: 'section-generation',
        model: modelName,
        input: prompt,
        output: '',
        metadata: {
          sectionId: sectionSpec.id,
          sectionTitle: sectionSpec.title,
          modelTier: currentModel,
          retryCount,
          success: false,
          error: errorMessage,
        },
        startTime: generationStartTime,
        endTime: generationEndTime,
      });
      await langfuseClient.flush();
    }

    return {
      error: errorMessage,
      validationError: undefined,
    };
  }
}

/**
 * Validate generated section against schema
 */
async function validateNode(
  state: SectionWriterStateType
): Promise<Partial<SectionWriterStateType>> {
  const { section, messages } = state;

  if (!section) {
    return {
      validationError: 'No section to validate',
    };
  }

  try {
    // Validate with Zod schema
    ContentSectionSchema.parse(section);

    logger.info(`Section validation passed: ${section.title}`);

    const newMessages = [
      ...messages,
      { role: 'assistant', content: 'Section validation passed' },
    ];

    return {
      validationError: undefined,
      messages: newMessages,
    };
  } catch (error) {
    const validationError =
      error instanceof z.ZodError ? error.issues.map((e) => e.message).join(', ') : String(error);

    logger.warn(`Section validation failed: ${validationError}`);

    return {
      validationError,
    };
  }
}

/**
 * Route after validation - retry, fallback, or complete
 */
function routeAfterValidation(state: SectionWriterStateType): string {
  const { validationError, error, currentModel, retryCount } = state;

  // Success - validation passed
  if (!validationError && !error) {
    return 'complete';
  }

  // Max retries reached
  if (retryCount >= 2) {
    logger.error('Max retries reached, failing section generation');
    return 'complete';
  }

  // If smart model failed, try fast model
  if (currentModel === 'smart' && error) {
    logger.info('Falling back to fast model');
    return 'fallback';
  }

  // Retry with same model
  logger.info('Retrying with same model');
  return 'retry';
}

/**
 * Retry node - increment retry count
 */
async function retryNode(
  state: SectionWriterStateType
): Promise<Partial<SectionWriterStateType>> {
  return {
    retryCount: state.retryCount + 1,
  };
}

/**
 * Fallback node - switch to fast model
 */
async function fallbackNode(
  state: SectionWriterStateType
): Promise<Partial<SectionWriterStateType>> {
  return {
    currentModel: 'fast',
    retryCount: state.retryCount + 1,
  };
}

/**
 * Complete node - finalize section
 */
async function completeNode(
  state: SectionWriterStateType
): Promise<Partial<SectionWriterStateType>> {
  const { section, error, validationError, messages } = state;

  if (!section || error || validationError) {
    const finalError = error || validationError || 'Unknown error';
    logger.error(`Section generation failed: ${finalError}`);

    const newMessages = [
      ...messages,
      { role: 'assistant', content: `Section generation failed: ${finalError}` },
    ];

    return {
      error: finalError,
      messages: newMessages,
    };
  }

  logger.info(`Section generation complete: ${section.title}`);

  const newMessages = [...messages, { role: 'assistant', content: 'Section generation complete' }];

  return {
    messages: newMessages,
  };
}

/**
 * Build generation prompt from inputs
 */
function buildSectionPrompt(
  spec: SectionSpec,
  findings: ResearchFindings,
  style: ContentStyleConfig
): string {
  const codeExampleNote = spec.includeCodeExamples
    ? 'Include relevant code examples with explanations.'
    : 'Do not include code examples.';

  const targetLengthNote = spec.targetLength
    ? `Target length: approximately ${spec.targetLength} words.`
    : '';

  return `Generate a content section with the following specifications:

**Section Title:** ${spec.title}
**Description:** ${spec.description}
${targetLengthNote}
${codeExampleNote}

**Style Guidelines:**
- Tone: ${style.tone}
- Audience: ${style.audience}
- Format: ${style.format}

**Research Findings:**
${findings.facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

**Examples:**
${findings.examples.map((e, i) => `${i + 1}. ${e}`).join('\n')}

**References:**
${findings.references.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Return the section as JSON matching this schema:
{
  "id": "${spec.id}",
  "title": "string",
  "content": "string (markdown)",
  "codeExamples": [{ "language": "string", "code": "string", "explanation": "string?" }] (optional),
  "references": ["string"] (optional)
}`;
}

/**
 * Creates the SectionWriter subgraph
 */
export function createSectionWriterGraph() {
  const graph = new StateGraph(SectionWriterState);

  // Add nodes
  graph.addNode('generate', generateNode);
  graph.addNode('validate', validateNode);
  graph.addNode('retry', retryNode);
  graph.addNode('fallback', fallbackNode);
  graph.addNode('complete', completeNode);

  // Define edges
  graph.setEntryPoint('generate' as '__start__');
  graph.addEdge('generate' as '__start__', 'validate' as '__start__');
  graph.addConditionalEdges('validate' as '__start__', routeAfterValidation, {
    complete: 'complete' as '__start__',
    retry: 'retry' as '__start__',
    fallback: 'fallback' as '__start__',
  });
  graph.addEdge('retry' as '__start__', 'generate' as '__start__');
  graph.addEdge('fallback' as '__start__', 'generate' as '__start__');
  graph.setFinishPoint('complete' as '__start__');

  return graph;
}

/**
 * Convenience function to execute section generation
 */
export async function executeSectionWriter(
  spec: SectionSpec,
  findings: ResearchFindings,
  style: ContentStyleConfig,
  smartModel: BaseChatModel,
  fastModel: BaseChatModel,
  langfuseClient?: LangfuseClient,
  traceId?: string
): Promise<ContentSection | undefined> {
  const graph = createSectionWriterGraph();
  const compiled = graph.compile();

  const initialState: SectionWriterStateType = {
    sectionSpec: spec,
    researchFindings: findings,
    styleConfig: style,
    smartModel,
    fastModel,
    langfuseClient,
    traceId,
    messages: [],
    currentModel: 'smart',
    retryCount: 0,
    validationError: undefined,
    section: undefined,
    error: undefined,
  };

  const result = await compiled.invoke(initialState);
  return result.section;
}
