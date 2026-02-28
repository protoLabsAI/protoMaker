/**
 * Content Creation Flow
 *
 * Multi-format output pipeline with 7 phases:
 * Research(parallel) → AntagonisticReview → Outline → AntagonisticReview → Generation(parallel) → Assembly → AntagonisticReview → Output(parallel)
 *
 * Features:
 * - 3 antagonistic review gates with automatic quality checks
 * - Revision loops with max 2 retries per phase
 * - Send() for parallel research, generation, review, and output phases
 * - Runs end-to-end without human intervention by default
 * - Optional HITL can be re-enabled via config flag
 * - Configurable via ContentConfig
 */

import {
  StateGraph,
  Annotation,
  Send,
  Command,
  interrupt,
  MemorySaver,
} from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createLogger } from '@protolabs-ai/utils';
import { resolveModelString } from '@protolabs-ai/model-resolver';
import { LangfuseClient } from '@protolabs-ai/observability';
import { isLangfuseReady } from './langfuse-guard.js';
import { wrapSubgraph } from '../graphs/utils/subgraph-wrapper.js';
import {
  createSectionWriterGraph,
  type SectionSpec,
  type ResearchFindings,
  type ContentStyleConfig,
  type ContentSection,
  SectionWriterState,
} from './subgraphs/section-writer.js';
import {
  createAntagonisticReviewerGraph,
  type ReviewResult,
  AntagonisticReviewerState,
} from './subgraphs/antagonistic-reviewer.js';

const logger = createLogger('ContentCreationFlow');

/**
 * Content configuration
 */
export interface ContentConfig {
  topic: string;
  format: 'tutorial' | 'reference' | 'guide';
  tone: 'technical' | 'conversational' | 'formal';
  audience: 'beginner' | 'intermediate' | 'expert';
  outputFormats: Array<'markdown' | 'html' | 'pdf'>;
  smartModel: BaseChatModel;
  fastModel: BaseChatModel;
  smartModelName?: string;
  fastModelName?: string;
  langfuseClient?: LangfuseClient;
  enableHITL?: boolean; // Optional flag to re-enable human-in-the-loop gates (default: false)
  maxRetries?: number; // Maximum retries per phase (default: 2)
}

/**
 * Outline structure
 */
export interface Outline {
  title: string;
  sections: Array<{
    id: string;
    title: string;
    description: string;
    includeCodeExamples?: boolean;
    targetLength?: number;
  }>;
}

/**
 * Research result for a single query
 */
export interface ResearchResult {
  query: string;
  findings: ResearchFindings;
}

/**
 * Review feedback for a section
 */
export interface ReviewFeedback {
  sectionId: string;
  approved: boolean;
  feedback?: string;
}

/**
 * Output result for a single format
 */
export interface OutputResult {
  format: 'markdown' | 'html' | 'pdf';
  content: string;
  success: boolean;
  error?: string;
}

/**
 * Content Creation Flow state
 */
export const ContentCreationState = Annotation.Root({
  // Input configuration
  config: Annotation<ContentConfig>,

  // Phase 1: Research (parallel)
  researchQueries: Annotation<string[]>,
  researchResults: Annotation<ResearchResult[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  researchReview: Annotation<ReviewResult | undefined>,
  researchRetryCount: Annotation<number>,
  researchApproved: Annotation<boolean>,
  researchFeedback: Annotation<string | undefined>,

  // Phase 2: Outline
  outline: Annotation<Outline | undefined>,
  outlineReview: Annotation<ReviewResult | undefined>,
  outlineRetryCount: Annotation<number>,
  outlineApproved: Annotation<boolean>,
  outlineFeedback: Annotation<string | undefined>,

  // Phase 3: Generation (parallel)
  sections: Annotation<ContentSection[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),

  // Phase 4: Assembly
  assembledContent: Annotation<string | undefined>,

  // Phase 5: Review (parallel)
  reviewFeedback: Annotation<ReviewFeedback[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  finalReview: Annotation<ReviewResult | undefined>,
  finalRetryCount: Annotation<number>,
  reviewApproved: Annotation<boolean>,
  finalReviewFeedback: Annotation<string | undefined>,

  // Phase 6: Output (parallel)
  outputs: Annotation<OutputResult[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),

  // Tracing
  traceId: Annotation<string | undefined>,

  // Error handling
  error: Annotation<string | undefined>,

  // User-edited content from HITL resume
  userEditedContent: Annotation<string | undefined>,
});

export type ContentCreationStateType = typeof ContentCreationState.State;

// ============================================================================
// Phase 1: Research (parallel)
// ============================================================================

/**
 * Generate research queries based on topic using LLM
 */
async function generateQueriesNode(
  state: ContentCreationStateType
): Promise<Partial<ContentCreationStateType>> {
  const { config } = state;

  logger.info(`Generating research queries for topic: ${config.topic}`);

  const prompt = `You are a research strategist for a ${config.format} aimed at ${config.audience}-level readers.

Topic: ${config.topic}

Generate 4-6 specific, focused research queries that would help write a comprehensive ${config.format} on this topic. Each query should target a different angle:
- Core concepts and fundamentals
- Practical techniques and patterns
- Real-world examples and case studies
- Common pitfalls and how to avoid them
- Advanced or emerging aspects

Return ONLY a JSON array of strings, no markdown formatting. Example:
["query 1", "query 2", "query 3"]`;

  try {
    const startTime = new Date();
    const response = await config.smartModel.invoke([{ role: 'user', content: prompt }]);
    const endTime = new Date();

    // Track generation in Langfuse
    if (isLangfuseReady(config.langfuseClient) && state.traceId) {
      config.langfuseClient.createGeneration({
        traceId: state.traceId,
        name: 'generate_queries',
        model: config.smartModelName ?? resolveModelString('sonnet'),
        input: prompt,
        output:
          typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content),
        metadata: { phase: 'research', node: 'generate_queries' },
        startTime,
        endTime,
      });
    }

    const content =
      typeof response.content === 'string'
        ? response.content
        : Array.isArray(response.content)
          ? response.content
              .filter((c) => (c as Record<string, unknown>).type === 'text')
              .map((c) => ((c as Record<string, unknown>).text as string) || '')
              .join('')
          : String(response.content);

    // Parse JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const queries = JSON.parse(jsonMatch[0]) as string[];
      logger.info(`Generated ${queries.length} research queries`);
      return { researchQueries: queries };
    }
  } catch (error) {
    logger.warn('Failed to generate queries via LLM, using fallback:', error);
  }

  // Fallback queries if LLM fails
  return {
    researchQueries: [
      `Core concepts and fundamentals of ${config.topic}`,
      `Best practices and common patterns for ${config.topic}`,
      `Advanced techniques and real-world examples in ${config.topic}`,
      `Common pitfalls and edge cases in ${config.topic}`,
    ],
  };
}

/**
 * Increment research retry counter
 */
async function incrementResearchRetryNode(
  state: ContentCreationStateType
): Promise<Partial<ContentCreationStateType>> {
  const currentCount = state.researchRetryCount || 0;
  const newCount = currentCount + 1;
  logger.info(`Incrementing research retry count to ${newCount}`);
  // NOTE: Do NOT output researchResults: [] here. The state uses an append
  // reducer ((left, right) => [...left, ...right]), so [] merges as a no-op.
  // Previous results remain and accumulate across retries, which is the
  // intended behavior — the reviewer re-evaluates ALL accumulated research.
  return {
    researchRetryCount: newCount,
  };
}

/**
 * Increment outline retry counter
 */
async function incrementOutlineRetryNode(
  state: ContentCreationStateType
): Promise<Partial<ContentCreationStateType>> {
  const currentCount = state.outlineRetryCount || 0;
  const newCount = currentCount + 1;
  logger.info(`Incrementing outline retry count to ${newCount}`);
  return {
    outlineRetryCount: newCount,
  };
}

/**
 * Increment final content retry counter
 */
async function incrementFinalRetryNode(
  state: ContentCreationStateType
): Promise<Partial<ContentCreationStateType>> {
  const currentCount = state.finalRetryCount || 0;
  const newCount = currentCount + 1;
  logger.info(`Incrementing final content retry count to ${newCount}`);
  // NOTE: Do NOT output sections: [] here. Same append reducer issue as
  // researchResults — [] merges as no-op, previous sections persist.
  return {
    finalRetryCount: newCount,
  };
}

/**
 * Fan out to parallel research tasks using Send()
 */
async function fanOutResearchNode(state: ContentCreationStateType) {
  const { researchQueries, config } = state;
  const sends: Send[] = [];

  for (const query of researchQueries) {
    sends.push(new Send('research_delegate', { ...state, query }));
  }

  logger.info(`Fanning out ${researchQueries.length} research queries`);

  return new Command({ goto: sends });
}

/**
 * Research delegate - executes a single research query using LLM
 */
async function researchDelegateNode(
  state: ContentCreationStateType & { query: string }
): Promise<Partial<ContentCreationStateType>> {
  const { query, config } = state;

  logger.info(`Researching: ${query}`);

  const prompt = `You are a thorough researcher preparing material for a ${config.format} on "${config.topic}" for ${config.audience}-level readers.

Research query: ${query}

Provide detailed, substantive research findings. Be specific — include real concepts, actual techniques, concrete examples, and credible references. Do NOT use placeholder text.

Return your findings as JSON with this exact structure:
{
  "facts": ["fact1", "fact2", ...],
  "examples": ["example1", "example2", ...],
  "references": ["reference1", "reference2", ...]
}

Requirements:
- facts: 5-8 specific, substantive facts with real detail (not "Fact about X")
- examples: 3-5 concrete, illustrative examples with enough detail to be useful
- references: 3-5 credible sources, methodologies, or frameworks that support the facts

Return ONLY the JSON object, no markdown formatting.`;

  try {
    const startTime = new Date();
    const response = await config.smartModel.invoke([{ role: 'user', content: prompt }]);
    const endTime = new Date();

    // Track generation in Langfuse
    if (isLangfuseReady(config.langfuseClient) && state.traceId) {
      config.langfuseClient.createGeneration({
        traceId: state.traceId,
        name: `research_delegate:${query.slice(0, 40)}`,
        model: config.smartModelName ?? resolveModelString('sonnet'),
        input: prompt,
        output:
          typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content),
        metadata: { phase: 'research', node: 'research_delegate', query },
        startTime,
        endTime,
      });
    }

    const content =
      typeof response.content === 'string'
        ? response.content
        : Array.isArray(response.content)
          ? response.content
              .filter((c) => (c as Record<string, unknown>).type === 'text')
              .map((c) => ((c as Record<string, unknown>).text as string) || '')
              .join('')
          : String(response.content);

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ResearchFindings;
      const findings: ResearchFindings = {
        facts: parsed.facts || [],
        examples: parsed.examples || [],
        references: parsed.references || [],
      };
      logger.info(
        `Research complete: ${findings.facts.length} facts, ${findings.examples.length} examples`
      );
      return { researchResults: [{ query, findings }] };
    }
  } catch (error) {
    logger.warn(`Failed to research "${query}" via LLM:`, error);
  }

  // Fallback if LLM fails
  return {
    researchResults: [
      {
        query,
        findings: {
          facts: [`Research on "${query}" could not be completed`],
          examples: [],
          references: [],
        },
      },
    ],
  };
}

/**
 * Antagonistic review #1 - research quality review
 */
async function researchReviewNode(
  state: ContentCreationStateType
): Promise<Partial<ContentCreationStateType>> {
  const { researchResults, config } = state;

  logger.info(`Reviewing research quality: ${researchResults.length} results`);

  // Format research results for review
  const researchContent = researchResults
    .map(
      (r) => `
## Query: ${r.query}

### Facts
${r.findings.facts.map((f) => `- ${f}`).join('\n')}

### Examples
${r.findings.examples.map((e) => `- ${e}`).join('\n')}

### References
${r.findings.references.map((ref) => `- ${ref}`).join('\n')}
`
    )
    .join('\n\n');

  // Use antagonistic reviewer subgraph
  const reviewGraph = createAntagonisticReviewerGraph();

  type ReviewInput = typeof AntagonisticReviewerState.State;
  type ReviewOutput = typeof AntagonisticReviewerState.State;

  const wrappedReviewer = wrapSubgraph<ContentCreationStateType, ReviewInput, ReviewOutput>(
    reviewGraph,
    (flowState) => ({
      mode: 'research' as const,
      content: researchContent,
      researchFindings: undefined,
      smartModel: flowState.config.smartModel,
      result: undefined,
      error: undefined,
    }),
    (subState) => ({
      researchReview: subState.result,
    })
  );

  const result = await wrappedReviewer(state);

  return result;
}

/**
 * HITL interrupt #1 - optional human review of research (only if enableHITL=true)
 *
 * When the graph resumes after interrupt, the state will contain
 * researchApproved and optionally researchFeedback, set by the caller.
 * If userEditedContent is set, the research findings are updated with user edits.
 * This node triggers an interrupt when critical issues are found.
 */
async function researchHitlNode(
  state: ContentCreationStateType
): Promise<Partial<ContentCreationStateType>> {
  const { researchReview, researchApproved, userEditedContent, researchResults, config } = state;

  logger.info(
    `Research HITL: Review score ${researchReview?.percentage.toFixed(1)}%, approved=${researchApproved}`
  );

  // Only interrupt if HITL is enabled and there are critical issues
  if (config.enableHITL && researchReview && researchReview.criticalIssues.length > 0) {
    // Format research content for display
    const researchContent = researchResults
      .map(
        (r) => `
## Query: ${r.query}

### Facts
${r.findings.facts.map((f) => `- ${f}`).join('\n')}

### Examples
${r.findings.examples.map((e) => `- ${e}`).join('\n')}

### References
${r.findings.references.map((ref) => `- ${ref}`).join('\n')}
`
      )
      .join('\n\n');

    logger.info('Research has critical issues, triggering HITL interrupt');
    interrupt({
      type: 'review_approval',
      phase: 'research',
      reviewResult: researchReview,
      content: researchContent,
    });
  }

  // If user provided edited content, attempt to parse it as updated research results
  if (userEditedContent && researchApproved) {
    try {
      const edited = JSON.parse(userEditedContent) as ResearchResult[];
      logger.info(`Research HITL: Using user-edited research with ${edited.length} results`);
      return { researchResults: edited, userEditedContent: undefined };
    } catch {
      // Not valid JSON — treat as feedback text, keep existing research
      logger.info('Research HITL: User edit is not valid research JSON, treating as feedback');
    }
  }

  return { userEditedContent: undefined };
}

/**
 * Route after research review
 */
function routeAfterResearchReview(state: ContentCreationStateType): string {
  const { config, researchReview, researchApproved, researchFeedback } = state;
  const researchRetryCount = state.researchRetryCount || 0;
  const maxRetries = config.maxRetries ?? 2;

  // If HITL is enabled, check manual approval first
  if (config.enableHITL) {
    if (researchApproved) {
      logger.info('Research manually approved, proceeding to outline');
      return 'approved';
    }

    if (researchFeedback) {
      if (researchRetryCount >= maxRetries) {
        logger.warn('Research max retries reached, failing');
        return 'failed';
      }
      logger.info('Research needs manual revision, restarting research phase');
      return 'revise';
    }
  }

  // Automatic review check
  if (!researchReview) {
    logger.error('No research review result available');
    return 'failed';
  }

  if (researchReview.passed) {
    logger.info(`Research passed automatic review (${researchReview.percentage.toFixed(1)}%)`);
    return 'approved';
  }

  // Failed review - check retry count
  if (researchRetryCount >= maxRetries) {
    logger.warn(
      `Research failed review and max retries reached (${researchRetryCount}/${maxRetries})`
    );
    return 'failed';
  }

  logger.info(
    `Research failed review (${researchReview.percentage.toFixed(1)}%), retry ${researchRetryCount + 1}/${maxRetries}`
  );
  return 'revise';
}

// ============================================================================
// Phase 2: Outline
// ============================================================================

/**
 * Generate content outline based on research using LLM
 */
async function generateOutlineNode(
  state: ContentCreationStateType
): Promise<Partial<ContentCreationStateType>> {
  const { config, researchResults } = state;

  logger.info('Generating content outline');

  // Compile research summaries
  const researchSummary = researchResults
    .map((r) => {
      const f = r.findings;
      return `**${r.query}**\n- Facts: ${f.facts.join('; ')}\n- Examples: ${f.examples.join('; ')}`;
    })
    .join('\n\n');

  const prompt = `You are a content architect creating the outline for a ${config.format} aimed at ${config.audience}-level readers.

Topic: ${config.topic}
Tone: ${config.tone}
Format: ${config.format}

Research findings:
${researchSummary}

Create a detailed content outline with 4-7 sections. Each section should build on the previous one.

Return ONLY a JSON object with this exact structure:
{
  "title": "The article title",
  "sections": [
    {
      "id": "section-slug",
      "title": "Section Title",
      "description": "What this section covers and its key points",
      "includeCodeExamples": true,
      "targetLength": 500
    }
  ]
}

Guidelines:
- Start with a compelling introduction that hooks the reader
- Build from foundational concepts to advanced insights
- End with a conclusion or actionable takeaways
- includeCodeExamples: true for technical sections, false for narrative
- targetLength: 150-300 for intro/conclusion, 400-800 for body sections
- Total target: 2000-4000 words across all sections

Return ONLY the JSON, no markdown formatting.`;

  try {
    const startTime = new Date();
    const response = await config.smartModel.invoke([{ role: 'user', content: prompt }]);
    const endTime = new Date();

    // Track generation in Langfuse
    if (isLangfuseReady(config.langfuseClient) && state.traceId) {
      config.langfuseClient.createGeneration({
        traceId: state.traceId,
        name: 'generate_outline',
        model: config.smartModelName ?? resolveModelString('sonnet'),
        input: prompt,
        output:
          typeof response.content === 'string'
            ? response.content
            : JSON.stringify(response.content),
        metadata: { phase: 'outline', node: 'generate_outline', topic: config.topic },
        startTime,
        endTime,
      });
    }

    const content =
      typeof response.content === 'string'
        ? response.content
        : Array.isArray(response.content)
          ? response.content
              .filter((c) => (c as Record<string, unknown>).type === 'text')
              .map((c) => ((c as Record<string, unknown>).text as string) || '')
              .join('')
          : String(response.content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Outline;
      if (parsed.title && parsed.sections?.length > 0) {
        logger.info(`Generated outline: "${parsed.title}" with ${parsed.sections.length} sections`);
        return { outline: parsed };
      }
    }
  } catch (error) {
    logger.warn('Failed to generate outline via LLM, using fallback:', error);
  }

  // Fallback outline if LLM fails
  return {
    outline: {
      title: `Guide to ${config.topic}`,
      sections: [
        {
          id: 'intro',
          title: 'Introduction',
          description: `Overview of ${config.topic}`,
          includeCodeExamples: false,
          targetLength: 250,
        },
        {
          id: 'core-concepts',
          title: 'Core Concepts',
          description: `Fundamental ideas behind ${config.topic}`,
          includeCodeExamples: true,
          targetLength: 600,
        },
        {
          id: 'in-practice',
          title: 'In Practice',
          description: `Real-world application of ${config.topic}`,
          includeCodeExamples: true,
          targetLength: 600,
        },
        {
          id: 'conclusion',
          title: 'Conclusion',
          description: `Key takeaways and next steps`,
          includeCodeExamples: false,
          targetLength: 250,
        },
      ],
    },
  };
}

/**
 * Antagonistic review #2 - outline structure review
 */
async function outlineReviewNode(
  state: ContentCreationStateType
): Promise<Partial<ContentCreationStateType>> {
  const { outline, config } = state;

  if (!outline) {
    return {
      error: 'No outline available for review',
    };
  }

  logger.info(`Reviewing outline structure: "${outline.title}"`);

  // Format outline for review
  const outlineContent = `
# ${outline.title}

${outline.sections
  .map(
    (s) => `
## ${s.title}

${s.description}

- Include code examples: ${s.includeCodeExamples ? 'Yes' : 'No'}
- Target length: ${s.targetLength} words
`
  )
  .join('\n')}
`;

  // Use antagonistic reviewer subgraph
  const reviewGraph = createAntagonisticReviewerGraph();

  type ReviewInput = typeof AntagonisticReviewerState.State;
  type ReviewOutput = typeof AntagonisticReviewerState.State;

  const wrappedReviewer = wrapSubgraph<ContentCreationStateType, ReviewInput, ReviewOutput>(
    reviewGraph,
    (flowState) => ({
      mode: 'outline' as const,
      content: outlineContent,
      researchFindings: undefined,
      smartModel: flowState.config.smartModel,
      result: undefined,
      error: undefined,
    }),
    (subState) => ({
      outlineReview: subState.result,
    })
  );

  const result = await wrappedReviewer(state);

  return result;
}

/**
 * HITL interrupt #2 - optional human review of outline (only if enableHITL=true)
 *
 * On resume, state contains outlineApproved and optionally outlineFeedback.
 * If userEditedContent is set, the outline is replaced with the user's edits.
 */
async function outlineHitlNode(
  state: ContentCreationStateType
): Promise<Partial<ContentCreationStateType>> {
  const { outlineReview, outlineApproved, userEditedContent, outline, config } = state;

  logger.info(
    `Outline HITL: Review score ${outlineReview?.percentage.toFixed(1)}%, approved=${outlineApproved}`
  );

  // Only interrupt if HITL is enabled and there are critical issues
  if (config.enableHITL && outlineReview && outlineReview.criticalIssues.length > 0 && outline) {
    // Format outline for display
    const outlineContent = `
# ${outline.title}

${outline.sections
  .map(
    (s) => `
## ${s.title}

${s.description}

- Include code examples: ${s.includeCodeExamples ? 'Yes' : 'No'}
- Target length: ${s.targetLength} words
`
  )
  .join('\n')}
`;

    logger.info('Outline has critical issues, triggering HITL interrupt');
    interrupt({
      type: 'review_approval',
      phase: 'outline',
      reviewResult: outlineReview,
      content: outlineContent,
    });
  }

  // If user provided edited content, attempt to parse it as an updated outline
  if (userEditedContent && outlineApproved) {
    try {
      const edited = JSON.parse(userEditedContent) as Outline;
      logger.info(
        `Outline HITL: Using user-edited outline with ${edited.sections.length} sections`
      );
      return { outline: edited, userEditedContent: undefined };
    } catch {
      // Not valid JSON — treat as feedback text, keep existing outline
      logger.info('Outline HITL: User edit is not valid outline JSON, treating as feedback');
    }
  }

  return { userEditedContent: undefined };
}

/**
 * Route after outline review
 */
function routeAfterOutlineReview(state: ContentCreationStateType): string {
  const { config, outlineReview, outlineApproved, outlineFeedback } = state;
  const outlineRetryCount = state.outlineRetryCount || 0;
  const maxRetries = config.maxRetries ?? 2;

  // If HITL is enabled, check manual approval first
  if (config.enableHITL) {
    if (outlineApproved) {
      logger.info('Outline manually approved, proceeding to generation');
      return 'approved';
    }

    if (outlineFeedback) {
      if (outlineRetryCount >= maxRetries) {
        logger.warn('Outline max retries reached, failing');
        return 'failed';
      }
      logger.info('Outline needs manual revision, regenerating');
      return 'revise';
    }
  }

  // Automatic review check
  if (!outlineReview) {
    logger.error('No outline review result available');
    return 'failed';
  }

  if (outlineReview.passed) {
    logger.info(`Outline passed automatic review (${outlineReview.percentage.toFixed(1)}%)`);
    return 'approved';
  }

  // Failed review - check retry count
  if (outlineRetryCount >= maxRetries) {
    logger.warn(
      `Outline failed review and max retries reached (${outlineRetryCount}/${maxRetries})`
    );
    return 'failed';
  }

  logger.info(
    `Outline failed review (${outlineReview.percentage.toFixed(1)}%), retry ${outlineRetryCount + 1}/${maxRetries}`
  );
  return 'revise';
}

// ============================================================================
// Phase 3: Generation (parallel)
// ============================================================================

/**
 * Fan out to parallel section generation using Send()
 */
async function fanOutGenerationNode(state: ContentCreationStateType) {
  const { outline } = state;

  if (!outline) {
    throw new Error('No outline available for generation');
  }

  const sends: Send[] = [];

  for (const section of outline.sections) {
    sends.push(new Send('generation_delegate', { ...state, sectionSpec: section }));
  }

  logger.info(`Fanning out ${outline.sections.length} section generations`);

  return new Command({ goto: sends });
}

/**
 * Generation delegate - generates a single section using SectionWriter subgraph
 */
async function generationDelegateNode(
  state: ContentCreationStateType & { sectionSpec: SectionSpec }
): Promise<Partial<ContentCreationStateType>> {
  const { sectionSpec, config, researchResults, traceId } = state;

  logger.info(`Generating section: ${sectionSpec.title}`);

  // Find relevant research for this section
  const relevantResearch =
    researchResults.length > 0
      ? researchResults[0].findings
      : {
          facts: [],
          examples: [],
          references: [],
        };

  // Prepare style config
  const styleConfig: ContentStyleConfig = {
    tone: config.tone,
    audience: config.audience,
    format: config.format,
  };

  // Use SectionWriter subgraph with wrapper
  const compiledSectionWriter = createSectionWriterGraph().compile();

  type SectionWriterInput = typeof SectionWriterState.State;
  type SectionWriterOutput = typeof SectionWriterState.State;

  const wrappedSectionWriter = wrapSubgraph<
    ContentCreationStateType & { sectionSpec: SectionSpec },
    SectionWriterInput,
    SectionWriterOutput
  >(
    compiledSectionWriter,
    (flowState) => ({
      sectionSpec: flowState.sectionSpec,
      researchFindings: relevantResearch,
      styleConfig,
      smartModel: flowState.config.smartModel,
      fastModel: flowState.config.fastModel,
      langfuseClient: flowState.config.langfuseClient,
      traceId: flowState.traceId,
      messages: [],
      currentModel: 'smart',
      retryCount: 0,
      validationError: undefined,
      section: undefined,
      error: undefined,
    }),
    (subState) => ({
      sections: subState.section ? [subState.section] : [],
    })
  );

  const result = await wrappedSectionWriter({ ...state, sectionSpec });

  return result;
}

// ============================================================================
// Phase 4: Assembly
// ============================================================================

/**
 * Assemble all sections into final content
 */
async function assembleNode(
  state: ContentCreationStateType
): Promise<Partial<ContentCreationStateType>> {
  const { sections, outline } = state;

  logger.info(`Assembling ${sections.length} sections`);

  if (!outline) {
    return {
      error: 'No outline available for assembly',
    };
  }

  // Sort sections by outline order
  const sortedSections = outline.sections
    .map((spec) => sections.find((s) => s.id === spec.id))
    .filter((s): s is ContentSection => s !== undefined);

  // Assemble into markdown
  const assembledContent = `# ${outline.title}

${sortedSections
  .map((section) => {
    let sectionContent = `## ${section.title}\n\n${section.content}`;

    if (section.codeExamples && section.codeExamples.length > 0) {
      sectionContent += '\n\n### Examples\n\n';
      sectionContent += section.codeExamples
        .map((ex) => {
          let exampleContent = `\`\`\`${ex.language}\n${ex.code}\n\`\`\``;
          if (ex.explanation) {
            exampleContent += `\n\n${ex.explanation}`;
          }
          return exampleContent;
        })
        .join('\n\n');
    }

    if (section.references && section.references.length > 0) {
      sectionContent += '\n\n### References\n\n';
      sectionContent += section.references.map((ref) => `- ${ref}`).join('\n');
    }

    return sectionContent;
  })
  .join('\n\n')}
`;

  return {
    assembledContent,
  };
}

// ============================================================================
// Phase 5: Review (parallel)
// ============================================================================

/**
 * Fan out to parallel section review using Send()
 */
async function fanOutReviewNode(state: ContentCreationStateType) {
  const { sections } = state;
  const sends: Send[] = [];

  for (const section of sections) {
    sends.push(new Send('review_delegate', { ...state, section }));
  }

  logger.info(`Fanning out ${sections.length} section reviews`);

  return new Command({ goto: sends });
}

/**
 * Review delegate - reviews a single section
 */
async function reviewDelegateNode(
  state: ContentCreationStateType & { section: ContentSection }
): Promise<Partial<ContentCreationStateType>> {
  const { section } = state;

  logger.info(`Reviewing section: ${section.title}`);

  // Mock review (in real implementation, would use LLM or quality checks)
  const feedback: ReviewFeedback = {
    sectionId: section.id,
    approved: true,
    feedback: undefined,
  };

  return {
    reviewFeedback: [feedback],
  };
}

/**
 * Antagonistic review #3 - full content review (8 dimensions)
 */
async function finalContentReviewNode(
  state: ContentCreationStateType
): Promise<Partial<ContentCreationStateType>> {
  const { assembledContent, config } = state;

  if (!assembledContent) {
    return {
      error: 'No assembled content available for review',
    };
  }

  logger.info(`Reviewing final content (8-dimension review)`);

  // Use antagonistic reviewer subgraph
  const reviewGraph = createAntagonisticReviewerGraph();

  type ReviewInput = typeof AntagonisticReviewerState.State;
  type ReviewOutput = typeof AntagonisticReviewerState.State;

  const wrappedReviewer = wrapSubgraph<ContentCreationStateType, ReviewInput, ReviewOutput>(
    reviewGraph,
    (flowState) => ({
      mode: 'full' as const,
      content: assembledContent,
      researchFindings: undefined,
      smartModel: flowState.config.smartModel,
      result: undefined,
      error: undefined,
    }),
    (subState) => ({
      finalReview: subState.result,
    })
  );

  const result = await wrappedReviewer(state);

  return result;
}

/**
 * HITL interrupt #3 - optional human review of final content (only if enableHITL=true)
 *
 * On resume, state contains reviewApproved and optionally finalReviewFeedback.
 * If userEditedContent is set and approved, the assembled content is replaced.
 */
async function finalReviewHitlNode(
  state: ContentCreationStateType
): Promise<Partial<ContentCreationStateType>> {
  const { finalReview, reviewApproved, userEditedContent, assembledContent, config } = state;

  logger.info(
    `Final content HITL: Review score ${finalReview?.percentage.toFixed(1)}%, approved=${reviewApproved}`
  );

  // Only interrupt if HITL is enabled and there are critical issues
  if (
    config.enableHITL &&
    finalReview &&
    finalReview.criticalIssues.length > 0 &&
    assembledContent
  ) {
    logger.info('Final content has critical issues, triggering HITL interrupt');
    interrupt({
      type: 'review_approval',
      phase: 'final',
      reviewResult: finalReview,
      content: assembledContent,
    });
  }

  // If user provided edited content, replace the assembled content
  if (userEditedContent && reviewApproved) {
    logger.info(`Final HITL: Using user-edited content (${userEditedContent.length} chars)`);
    return { assembledContent: userEditedContent, userEditedContent: undefined };
  }

  return { userEditedContent: undefined };
}

/**
 * Route after final content review
 */
function routeAfterFinalReview(state: ContentCreationStateType): string {
  const { config, finalReview, reviewApproved, finalReviewFeedback } = state;
  const finalRetryCount = state.finalRetryCount || 0;
  const maxRetries = config.maxRetries ?? 2;

  // If HITL is enabled, check manual approval first
  if (config.enableHITL) {
    if (reviewApproved) {
      logger.info('Final content manually approved, proceeding to output');
      return 'approved';
    }

    if (finalReviewFeedback) {
      if (finalRetryCount >= maxRetries) {
        logger.warn('Final content max retries reached, failing');
        return 'failed';
      }
      logger.info('Final content needs manual revision, restarting generation');
      return 'revise';
    }
  }

  // Automatic review check
  if (!finalReview) {
    logger.error('No final review result available');
    return 'failed';
  }

  if (finalReview.passed) {
    logger.info(`Final content passed automatic review (${finalReview.percentage.toFixed(1)}%)`);
    return 'approved';
  }

  // Failed review - check retry count
  if (finalRetryCount >= maxRetries) {
    logger.warn(
      `Final content failed review and max retries reached (${finalRetryCount}/${maxRetries})`
    );
    return 'failed';
  }

  logger.info(
    `Final content failed review (${finalReview.percentage.toFixed(1)}%), retry ${finalRetryCount + 1}/${maxRetries}`
  );
  return 'revise';
}

// ============================================================================
// Phase 6: Output (parallel)
// ============================================================================

/**
 * Fan out to parallel output format generation using Send()
 */
async function fanOutOutputNode(state: ContentCreationStateType) {
  const { config } = state;
  const sends: Send[] = [];

  for (const format of config.outputFormats) {
    sends.push(new Send('output_delegate', { ...state, outputFormat: format }));
  }

  logger.info(`Fanning out ${config.outputFormats.length} output formats`);

  return new Command({ goto: sends });
}

/**
 * Output delegate - generates a single output format
 */
async function outputDelegateNode(
  state: ContentCreationStateType & { outputFormat: 'markdown' | 'html' | 'pdf' }
): Promise<Partial<ContentCreationStateType>> {
  const { outputFormat, assembledContent } = state;

  logger.info(`Generating output format: ${outputFormat}`);

  if (!assembledContent) {
    return {
      outputs: [
        {
          format: outputFormat,
          content: '',
          success: false,
          error: 'No assembled content available',
        },
      ],
    };
  }

  // Mock output generation (in real implementation, would convert formats)
  let content = assembledContent;

  if (outputFormat === 'html') {
    // Mock HTML conversion
    content = `<html><body>${assembledContent.replace(/\n/g, '<br>')}</body></html>`;
  } else if (outputFormat === 'pdf') {
    // Mock PDF generation
    content = `[PDF content of ${assembledContent.length} characters]`;
  }

  const result: OutputResult = {
    format: outputFormat,
    content,
    success: true,
  };

  return {
    outputs: [result],
  };
}

/**
 * Final completion node
 */
async function completeNode(
  state: ContentCreationStateType
): Promise<Partial<ContentCreationStateType>> {
  const { outputs } = state;

  logger.info(`Content creation complete: ${outputs.length} outputs generated`);

  return {};
}

// ============================================================================
// Graph Creation
// ============================================================================

/**
 * Options for creating the content creation flow
 */
export interface ContentCreationFlowOptions {
  /** Enable HITL interrupt gates. When true, the graph pauses at review nodes. */
  enableHITL?: boolean;
}

/**
 * Creates the Content Creation Flow graph
 */
export function createContentCreationFlow(options?: ContentCreationFlowOptions) {
  const { enableHITL = false } = options ?? {};
  const graph = new StateGraph(ContentCreationState);

  // Phase 1: Research (parallel)
  graph.addNode('generate_queries', generateQueriesNode);
  graph.addNode('fan_out_research', fanOutResearchNode, {
    ends: ['research_delegate'],
  });
  graph.addNode('research_delegate', researchDelegateNode);
  graph.addNode('research_review', researchReviewNode);
  graph.addNode('research_hitl', researchHitlNode);
  graph.addNode('increment_research_retry', incrementResearchRetryNode);

  // Phase 2: Outline
  graph.addNode('generate_outline', generateOutlineNode);
  graph.addNode('outline_review', outlineReviewNode);
  graph.addNode('outline_hitl', outlineHitlNode);
  graph.addNode('increment_outline_retry', incrementOutlineRetryNode);

  // Phase 3: Generation (parallel)
  graph.addNode('fan_out_generation', fanOutGenerationNode, {
    ends: ['generation_delegate'],
  });
  graph.addNode('generation_delegate', generationDelegateNode);

  // Phase 4: Assembly
  graph.addNode('assemble', assembleNode);

  // Phase 5: Review (parallel)
  graph.addNode('fan_out_review', fanOutReviewNode, {
    ends: ['review_delegate'],
  });
  graph.addNode('review_delegate', reviewDelegateNode);
  graph.addNode('final_content_review', finalContentReviewNode);
  graph.addNode('final_review_hitl', finalReviewHitlNode);
  graph.addNode('increment_final_retry', incrementFinalRetryNode);

  // Phase 6: Output (parallel)
  graph.addNode('fan_out_output', fanOutOutputNode, {
    ends: ['output_delegate'],
  });
  graph.addNode('output_delegate', outputDelegateNode);

  // Completion
  graph.addNode('complete', completeNode);

  // LangGraph's TypeScript types require node name literals that match the graph's
  // generic parameters. Since nodes are registered at runtime via addNode(), we use
  // an untyped reference for edge-building calls.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = graph as any;

  // Define flow
  g.setEntryPoint('generate_queries');

  // Phase 1: Research with antagonistic review
  g.addEdge('generate_queries', 'fan_out_research');
  g.addEdge('research_delegate', 'research_review');
  g.addEdge('research_review', 'research_hitl'); // HITL optional, only if enableHITL=true
  g.addConditionalEdges('research_hitl', routeAfterResearchReview, {
    approved: 'generate_outline',
    revise: 'increment_research_retry',
    failed: 'complete',
  });
  g.addEdge('increment_research_retry', 'generate_queries');

  // Phase 2: Outline with antagonistic review
  g.addEdge('generate_outline', 'outline_review');
  g.addEdge('outline_review', 'outline_hitl'); // HITL optional, only if enableHITL=true
  g.addConditionalEdges('outline_hitl', routeAfterOutlineReview, {
    approved: 'fan_out_generation',
    revise: 'increment_outline_retry',
    failed: 'complete',
  });
  g.addEdge('increment_outline_retry', 'generate_outline');

  // Phase 3: Generation
  g.addEdge('generation_delegate', 'assemble');

  // Phase 4: Assembly
  g.addEdge('assemble', 'fan_out_review');

  // Phase 5: Review with antagonistic review
  g.addEdge('review_delegate', 'final_content_review');
  g.addEdge('final_content_review', 'final_review_hitl'); // HITL optional, only if enableHITL=true
  g.addConditionalEdges('final_review_hitl', routeAfterFinalReview, {
    approved: 'fan_out_output',
    revise: 'increment_final_retry',
    failed: 'complete',
  });
  g.addEdge('increment_final_retry', 'fan_out_generation');

  // Phase 6: Output
  g.addEdge('output_delegate', 'complete');
  g.setFinishPoint('complete');

  // When HITL is enabled, compile with checkpointer + interruptBefore so the
  // graph can pause and resume at HITL gate nodes.
  // NOTE: HITL mode requires models to be removed from state before checkpointing
  // works fully (ChatAnthropic instances aren't serializable by MemorySaver).
  if (enableHITL) {
    const checkpointer = new MemorySaver();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (graph as any).compile({
      checkpointer,
      interruptBefore: ['research_hitl', 'outline_hitl', 'final_review_hitl'],
    });
  }

  // Autonomous mode: no checkpointer needed since the flow runs end-to-end
  // without interrupts. Avoids MemorySaver serialization issues with
  // non-serializable ChatAnthropic model instances in state.
  return graph.compile();
}
