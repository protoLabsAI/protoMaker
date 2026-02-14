/**
 * Content Creation Flow
 *
 * Multi-format output pipeline with 7 phases:
 * Research(parallel) → HITL → Outline → HITL → Generation(parallel) → Assembly → Review(parallel) → HITL → Output(parallel)
 *
 * Features:
 * - 3 HITL interrupts for human oversight
 * - Send() for parallel research, generation, review, and output phases
 * - MemorySaver checkpointer for resume after interrupts
 * - Configurable via ContentConfig
 */

import { StateGraph, Annotation, Send, Command, MemorySaver } from '@langchain/langgraph';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createLogger } from '@automaker/utils';
import { LangfuseClient } from '@automaker/observability';
import { wrapSubgraph } from '../graphs/utils/subgraph-wrapper.js';
import {
  createSectionWriterGraph,
  type SectionSpec,
  type ResearchFindings,
  type ContentStyleConfig,
  type ContentSection,
  SectionWriterState,
} from './subgraphs/section-writer.js';

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
  langfuseClient?: LangfuseClient;
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
  researchApproved: Annotation<boolean>,
  researchFeedback: Annotation<string | undefined>,

  // Phase 2: Outline
  outline: Annotation<Outline | undefined>,
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
});

export type ContentCreationStateType = typeof ContentCreationState.State;

// ============================================================================
// Phase 1: Research (parallel)
// ============================================================================

/**
 * Generate research queries based on topic
 */
async function generateQueriesNode(
  state: ContentCreationStateType
): Promise<Partial<ContentCreationStateType>> {
  const { config } = state;

  logger.info(`Generating research queries for topic: ${config.topic}`);

  // Generate queries (in real implementation, this would use LLM)
  const researchQueries = [
    `Core concepts and fundamentals of ${config.topic}`,
    `Best practices and common patterns for ${config.topic}`,
    `Advanced techniques and edge cases in ${config.topic}`,
  ];

  return {
    researchQueries,
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
 * Research delegate - executes a single research query
 */
async function researchDelegateNode(
  state: ContentCreationStateType & { query: string }
): Promise<Partial<ContentCreationStateType>> {
  const { query } = state;

  logger.info(`Researching: ${query}`);

  // Mock research findings (in real implementation, would use tools/LLM)
  const findings: ResearchFindings = {
    facts: [`Fact 1 about ${query}`, `Fact 2 about ${query}`, `Fact 3 about ${query}`],
    examples: [`Example 1 for ${query}`, `Example 2 for ${query}`],
    references: [`Reference 1 for ${query}`, `Reference 2 for ${query}`],
  };

  const result: ResearchResult = {
    query,
    findings,
  };

  return {
    researchResults: [result],
  };
}

/**
 * HITL interrupt #1 - wait for research approval
 */
async function researchHitlNode(
  state: ContentCreationStateType
): Promise<Partial<ContentCreationStateType>> {
  const { researchResults } = state;

  logger.info(`Research HITL: ${researchResults.length} results ready for review`);

  // This node will interrupt and wait for user input
  // User provides: researchApproved, researchFeedback
  return {};
}

/**
 * Route after research HITL
 */
function routeAfterResearchHitl(state: ContentCreationStateType): string {
  const { researchApproved, researchFeedback } = state;

  if (researchApproved) {
    logger.info('Research approved, proceeding to outline');
    return 'approved';
  }

  if (researchFeedback) {
    logger.info('Research needs revision, restarting research phase');
    return 'revise';
  }

  // Default to approved if no feedback provided
  return 'approved';
}

// ============================================================================
// Phase 2: Outline
// ============================================================================

/**
 * Generate content outline based on research
 */
async function generateOutlineNode(
  state: ContentCreationStateType
): Promise<Partial<ContentCreationStateType>> {
  const { config, researchResults } = state;

  logger.info('Generating content outline');

  // Mock outline generation (in real implementation, would use LLM with research)
  const outline: Outline = {
    title: `Guide to ${config.topic}`,
    sections: [
      {
        id: 'intro',
        title: 'Introduction',
        description: `Overview of ${config.topic}`,
        includeCodeExamples: false,
        targetLength: 200,
      },
      {
        id: 'fundamentals',
        title: 'Fundamentals',
        description: `Core concepts and basics of ${config.topic}`,
        includeCodeExamples: true,
        targetLength: 500,
      },
      {
        id: 'advanced',
        title: 'Advanced Topics',
        description: `Advanced techniques and patterns in ${config.topic}`,
        includeCodeExamples: true,
        targetLength: 600,
      },
    ],
  };

  return {
    outline,
  };
}

/**
 * HITL interrupt #2 - wait for outline approval
 */
async function outlineHitlNode(
  state: ContentCreationStateType
): Promise<Partial<ContentCreationStateType>> {
  const { outline } = state;

  logger.info(`Outline HITL: "${outline?.title}" with ${outline?.sections.length} sections`);

  // This node will interrupt and wait for user input
  // User provides: outlineApproved, outlineFeedback
  return {};
}

/**
 * Route after outline HITL
 */
function routeAfterOutlineHitl(state: ContentCreationStateType): string {
  const { outlineApproved, outlineFeedback } = state;

  if (outlineApproved) {
    logger.info('Outline approved, proceeding to generation');
    return 'approved';
  }

  if (outlineFeedback) {
    logger.info('Outline needs revision, regenerating');
    return 'revise';
  }

  // Default to approved if no feedback provided
  return 'approved';
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
 * HITL interrupt #3 - wait for final review approval
 */
async function finalReviewHitlNode(
  state: ContentCreationStateType
): Promise<Partial<ContentCreationStateType>> {
  const { reviewFeedback, assembledContent } = state;

  logger.info(`Final review HITL: ${reviewFeedback.length} section reviews complete`);

  // This node will interrupt and wait for user input
  // User provides: reviewApproved, finalReviewFeedback
  return {};
}

/**
 * Route after final review HITL
 */
function routeAfterFinalReviewHitl(state: ContentCreationStateType): string {
  const { reviewApproved, finalReviewFeedback } = state;

  if (reviewApproved) {
    logger.info('Final review approved, proceeding to output');
    return 'approved';
  }

  if (finalReviewFeedback) {
    logger.info('Content needs revision, restarting generation');
    return 'revise';
  }

  // Default to approved if no feedback provided
  return 'approved';
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
 * Creates the Content Creation Flow graph
 */
export function createContentCreationFlow(config?: { checkpointer?: MemorySaver }) {
  const graph = new StateGraph(ContentCreationState);

  // Phase 1: Research (parallel)
  graph.addNode('generate_queries', generateQueriesNode);
  graph.addNode('fan_out_research', fanOutResearchNode, {
    ends: ['research_delegate'],
  });
  graph.addNode('research_delegate', researchDelegateNode);
  graph.addNode('research_hitl', researchHitlNode);

  // Phase 2: Outline
  graph.addNode('generate_outline', generateOutlineNode);
  graph.addNode('outline_hitl', outlineHitlNode);

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
  graph.addNode('final_review_hitl', finalReviewHitlNode);

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

  // Phase 1: Research
  g.addEdge('generate_queries', 'fan_out_research');
  g.addEdge('research_delegate', 'research_hitl');
  g.addConditionalEdges('research_hitl', routeAfterResearchHitl, {
    approved: 'generate_outline',
    revise: 'generate_queries',
  });

  // Phase 2: Outline
  g.addEdge('generate_outline', 'outline_hitl');
  g.addConditionalEdges('outline_hitl', routeAfterOutlineHitl, {
    approved: 'fan_out_generation',
    revise: 'generate_outline',
  });

  // Phase 3: Generation
  g.addEdge('generation_delegate', 'assemble');

  // Phase 4: Assembly
  g.addEdge('assemble', 'fan_out_review');

  // Phase 5: Review
  g.addEdge('review_delegate', 'final_review_hitl');
  g.addConditionalEdges('final_review_hitl', routeAfterFinalReviewHitl, {
    approved: 'fan_out_output',
    revise: 'fan_out_generation',
  });

  // Phase 6: Output
  g.addEdge('output_delegate', 'complete');
  g.setFinishPoint('complete');

  // Compile with MemorySaver checkpointer for HITL resume support
  const checkpointer = config?.checkpointer || new MemorySaver();
  return graph.compile({
    checkpointer,
    interruptBefore: [
      'research_hitl' as '__start__',
      'outline_hitl' as '__start__',
      'final_review_hitl' as '__start__',
    ],
  });
}
