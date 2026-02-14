/**
 * Test script for the Content Creation Flow with Antagonistic Review
 *
 * Runs the full autonomous pipeline with Anthropic models in straight-through mode
 * (no HITL interrupts — auto-approved). The pipeline includes:
 * - Research and content generation
 * - Antagonistic review for quality validation
 * - Output validation (HTML entities, duplicate headings, review scores)
 *
 * Usage: npx tsx scripts/test-content-flow.ts
 *
 * Validates:
 * - No HTML entities in code blocks
 * - No duplicate headings
 * - Antagonistic review scores >= 75%
 * - Output written to /tmp with quality report
 */

import 'dotenv/config';
import { StateGraph, Annotation, Send, Command } from '@langchain/langgraph';
import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  createSectionWriterGraph,
  SectionWriterState,
} from '../libs/flows/src/content/subgraphs/section-writer.js';
import { wrapSubgraph } from '../libs/flows/src/graphs/utils/subgraph-wrapper.js';
import type {
  SectionSpec,
  ResearchFindings,
  ContentStyleConfig,
  ContentSection,
} from '../libs/flows/src/content/subgraphs/section-writer.js';

// ============================================================================
// Types
// ============================================================================

interface ContentConfig {
  topic: string;
  format: 'tutorial' | 'reference' | 'guide';
  tone: 'technical' | 'conversational' | 'formal';
  audience: 'beginner' | 'intermediate' | 'expert';
  outputFormats: Array<'markdown' | 'html' | 'pdf'>;
  smartModel: BaseChatModel;
  fastModel: BaseChatModel;
}

interface Outline {
  title: string;
  sections: Array<{
    id: string;
    title: string;
    description: string;
    includeCodeExamples?: boolean;
    targetLength?: number;
  }>;
}

interface ResearchResult {
  query: string;
  findings: ResearchFindings;
}

interface ReviewFeedback {
  sectionId: string;
  approved: boolean;
  feedback?: string;
  score?: number;
}

interface QualityReport {
  htmlEntityViolations: string[];
  duplicateHeadings: string[];
  reviewScores: { section: string; score: number }[];
  averageReviewScore: number;
  passed: boolean;
}

interface OutputResult {
  format: 'markdown' | 'html' | 'pdf';
  content: string;
  success: boolean;
  error?: string;
}

// ============================================================================
// State
// ============================================================================

const TestFlowState = Annotation.Root({
  config: Annotation<ContentConfig>,
  researchQueries: Annotation<string[]>,
  researchResults: Annotation<ResearchResult[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  outline: Annotation<Outline | undefined>,
  sections: Annotation<ContentSection[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  assembledContent: Annotation<string | undefined>,
  reviewFeedback: Annotation<ReviewFeedback[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  qualityReport: Annotation<QualityReport | undefined>,
  outputs: Annotation<OutputResult[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  error: Annotation<string | undefined>,
});

type TestFlowStateType = typeof TestFlowState.State;

// ============================================================================
// Nodes
// ============================================================================

async function generateQueries(state: TestFlowStateType): Promise<Partial<TestFlowStateType>> {
  const { config } = state;
  console.log(`  [queries] Generating research queries for: ${config.topic}`);

  const researchQueries = [
    `Core concepts of ${config.topic}`,
    `Best practices for ${config.topic}`,
    `Advanced patterns in ${config.topic}`,
  ];

  return { researchQueries };
}

async function fanOutResearch(state: TestFlowStateType) {
  const sends = state.researchQueries.map(
    (query) => new Send('research_delegate', { ...state, query })
  );
  console.log(`  [fan-out] Dispatching ${sends.length} research queries`);
  return new Command({ goto: sends });
}

async function researchDelegate(
  state: TestFlowStateType & { query: string }
): Promise<Partial<TestFlowStateType>> {
  const { query } = state;
  console.log(`  [research] ${query.substring(0, 60)}...`);

  // Mock research — in production this would use web search tools
  const findings: ResearchFindings = {
    facts: [
      `LangGraph provides StateGraph for building multi-agent flows with typed state`,
      `Send() API enables dynamic parallel fan-out to subgraphs`,
      `Reducers define how concurrent node outputs merge safely`,
    ],
    examples: [
      `const graph = new StateGraph(MyState); graph.addNode('worker', workerFn);`,
      `new Send('delegate', { ...state, task: specificTask })`,
    ],
    references: [
      `LangGraph documentation: State Management`,
      `LangGraph JS SDK: @langchain/langgraph`,
    ],
  };

  return { researchResults: [{ query, findings }] };
}

async function generateOutline(state: TestFlowStateType): Promise<Partial<TestFlowStateType>> {
  const { config } = state;
  console.log(`  [outline] Generating outline for: ${config.topic}`);

  const outline: Outline = {
    title: `Guide to ${config.topic}`,
    sections: [
      {
        id: 'intro',
        title: 'Introduction to LangGraph',
        description: 'What LangGraph is and why it matters for multi-agent coordination',
        includeCodeExamples: false,
        targetLength: 200,
      },
      {
        id: 'state-management',
        title: 'State Management with Annotations',
        description: 'How to define typed state with Annotation.Root and reducers',
        includeCodeExamples: true,
        targetLength: 400,
      },
      {
        id: 'parallel-patterns',
        title: 'Parallel Execution with Send()',
        description: 'Fan-out patterns for concurrent task execution using Send() API',
        includeCodeExamples: true,
        targetLength: 400,
      },
    ],
  };

  return { outline };
}

async function fanOutGeneration(state: TestFlowStateType) {
  const { outline } = state;
  if (!outline) throw new Error('No outline');

  const sends = outline.sections.map(
    (section) => new Send('generation_delegate', { ...state, sectionSpec: section })
  );
  console.log(`  [fan-out] Dispatching ${sends.length} section generations`);
  return new Command({ goto: sends });
}

async function generationDelegate(
  state: TestFlowStateType & { sectionSpec: SectionSpec }
): Promise<Partial<TestFlowStateType>> {
  const { sectionSpec, config, researchResults } = state;
  console.log(`  [generate] Section: ${sectionSpec.title}`);

  const relevantResearch =
    researchResults.length > 0
      ? researchResults[0].findings
      : { facts: [], examples: [], references: [] };

  const styleConfig: ContentStyleConfig = {
    tone: config.tone,
    audience: config.audience,
    format: config.format,
  };

  // Use the SectionWriter subgraph — this makes the real LLM call
  const compiledSectionWriter = createSectionWriterGraph().compile();

  type SWInput = typeof SectionWriterState.State;
  type SWOutput = typeof SectionWriterState.State;

  const wrappedWriter = wrapSubgraph<
    TestFlowStateType & { sectionSpec: SectionSpec },
    SWInput,
    SWOutput
  >(
    compiledSectionWriter,
    (flowState) => ({
      sectionSpec: flowState.sectionSpec,
      researchFindings: relevantResearch,
      styleConfig,
      smartModel: flowState.config.smartModel,
      fastModel: flowState.config.fastModel,
      langfuseClient: undefined,
      traceId: undefined,
      messages: [],
      currentModel: 'smart' as const,
      retryCount: 0,
      validationError: undefined,
      section: undefined,
      error: undefined,
    }),
    (subState) => ({
      sections: subState.section ? [subState.section] : [],
    })
  );

  return await wrappedWriter({ ...state, sectionSpec });
}

async function assemble(state: TestFlowStateType): Promise<Partial<TestFlowStateType>> {
  const { sections, outline } = state;
  console.log(`  [assemble] Combining ${sections.length} sections`);

  if (!outline) return { error: 'No outline' };

  const sortedSections = outline.sections
    .map((spec) => sections.find((s) => s.id === spec.id))
    .filter((s): s is ContentSection => s !== undefined);

  const assembledContent = `# ${outline.title}\n\n${sortedSections
    .map((section) => {
      let content = `## ${section.title}\n\n${section.content}`;
      if (section.codeExamples?.length) {
        content += '\n\n### Examples\n\n';
        content += section.codeExamples
          .map((ex) => {
            let c = `\`\`\`${ex.language}\n${ex.code}\n\`\`\``;
            if (ex.explanation) c += `\n\n${ex.explanation}`;
            return c;
          })
          .join('\n\n');
      }
      return content;
    })
    .join('\n\n')}\n`;

  return { assembledContent };
}

async function fanOutReview(state: TestFlowStateType) {
  const sends = state.sections.map((section) => new Send('review_delegate', { ...state, section }));
  console.log(`  [fan-out] Dispatching ${sends.length} section reviews`);
  return new Command({ goto: sends });
}

async function reviewDelegate(
  state: TestFlowStateType & { section: ContentSection }
): Promise<Partial<TestFlowStateType>> {
  const { section } = state;

  // Simulate antagonistic review with scoring
  // In production, this would use the AntagonisticReviewService
  const score = calculateContentQualityScore(section);
  const approved = score >= 75;

  console.log(
    `  [review] ${section.title}: score=${score}% ${approved ? 'APPROVED' : 'NEEDS_WORK'}`
  );

  return {
    reviewFeedback: [{ sectionId: section.id, approved, score }],
  };
}

/**
 * Calculate content quality score based on antagonistic review criteria
 * Returns a score from 0-100
 */
function calculateContentQualityScore(section: ContentSection): number {
  let score = 100;
  const content = section.content || '';

  // Check for HTML entities in code blocks (critical issue)
  const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
  const hasHtmlEntities = codeBlocks.some((block) => /&[a-z]+;|&#\d+;/i.test(block));
  if (hasHtmlEntities) {
    score -= 30; // Major deduction for HTML entities
  }

  // Check for very short content (quality concern)
  if (content.length < 100) {
    score -= 20;
  }

  // Check for missing code examples when expected
  if (section.codeExamples && section.codeExamples.length === 0) {
    score -= 15;
  }

  // Add bonus for good structure
  const hasHeadings = /^#{1,6}\s+/m.test(content);
  if (hasHeadings) {
    score += 5;
  }

  // Add bonus for examples
  if (section.codeExamples && section.codeExamples.length > 0) {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

async function validateQuality(state: TestFlowStateType): Promise<Partial<TestFlowStateType>> {
  const { assembledContent, reviewFeedback } = state;
  console.log(`  [validate] Checking content quality`);

  if (!assembledContent) {
    return {
      qualityReport: {
        htmlEntityViolations: [],
        duplicateHeadings: [],
        reviewScores: [],
        averageReviewScore: 0,
        passed: false,
      },
    };
  }

  // Check for HTML entities in code blocks
  const htmlEntityViolations: string[] = [];
  const codeBlockRegex = /```[\s\S]*?```/g;
  const codeBlocks = assembledContent.match(codeBlockRegex) || [];

  codeBlocks.forEach((block, index) => {
    const htmlEntityMatch = block.match(/&[a-z]+;|&#\d+;/gi);
    if (htmlEntityMatch) {
      htmlEntityViolations.push(
        `Code block ${index + 1}: Found HTML entities: ${htmlEntityMatch.join(', ')}`
      );
    }
  });

  // Check for duplicate headings
  const duplicateHeadings: string[] = [];
  const headingRegex = /^#{1,6}\s+(.+)$/gm;
  const headings: string[] = [];
  let match;

  while ((match = headingRegex.exec(assembledContent)) !== null) {
    const heading = match[1].trim();
    if (headings.includes(heading)) {
      duplicateHeadings.push(heading);
    }
    headings.push(heading);
  }

  // Extract review scores
  const reviewScores = reviewFeedback
    .filter((r) => r.score !== undefined)
    .map((r) => ({ section: r.sectionId, score: r.score || 0 }));

  const averageReviewScore =
    reviewScores.length > 0
      ? reviewScores.reduce((sum, r) => sum + r.score, 0) / reviewScores.length
      : 0;

  // Check if quality standards are met
  const passed =
    htmlEntityViolations.length === 0 && duplicateHeadings.length === 0 && averageReviewScore >= 75;

  const report: QualityReport = {
    htmlEntityViolations,
    duplicateHeadings,
    reviewScores,
    averageReviewScore,
    passed,
  };

  console.log(`  [validate] Average score: ${averageReviewScore.toFixed(1)}%`);
  console.log(`  [validate] HTML entity violations: ${htmlEntityViolations.length}`);
  console.log(`  [validate] Duplicate headings: ${duplicateHeadings.length}`);
  console.log(`  [validate] Overall: ${passed ? 'PASSED' : 'FAILED'}`);

  return { qualityReport: report };
}

async function fanOutOutput(state: TestFlowStateType) {
  const sends = state.config.outputFormats.map(
    (format) => new Send('output_delegate', { ...state, outputFormat: format })
  );
  console.log(`  [fan-out] Dispatching ${sends.length} output formats`);
  return new Command({ goto: sends });
}

async function outputDelegate(
  state: TestFlowStateType & { outputFormat: string }
): Promise<Partial<TestFlowStateType>> {
  const { outputFormat, assembledContent } = state;
  console.log(`  [output] Format: ${outputFormat}`);

  if (!assembledContent) {
    return {
      outputs: [{ format: outputFormat as any, content: '', success: false, error: 'No content' }],
    };
  }

  let content = assembledContent;
  if (outputFormat === 'html') {
    content = `<html><body>${assembledContent.replace(/\n/g, '<br>')}</body></html>`;
  }

  return {
    outputs: [{ format: outputFormat as any, content, success: true }],
  };
}

async function complete(state: TestFlowStateType): Promise<Partial<TestFlowStateType>> {
  console.log(`  [complete] ${state.outputs.length} outputs generated`);
  return {};
}

// ============================================================================
// Graph
// ============================================================================

function buildTestFlow() {
  const graph = new StateGraph(TestFlowState);

  graph.addNode('generate_queries', generateQueries);
  graph.addNode('fan_out_research', fanOutResearch, { ends: ['research_delegate'] });
  graph.addNode('research_delegate', researchDelegate);
  graph.addNode('generate_outline', generateOutline);
  graph.addNode('fan_out_generation', fanOutGeneration, { ends: ['generation_delegate'] });
  graph.addNode('generation_delegate', generationDelegate);
  graph.addNode('assemble', assemble);
  graph.addNode('fan_out_review', fanOutReview, { ends: ['review_delegate'] });
  graph.addNode('review_delegate', reviewDelegate);
  graph.addNode('validate_quality', validateQuality);
  graph.addNode('fan_out_output', fanOutOutput, { ends: ['output_delegate'] });
  graph.addNode('output_delegate', outputDelegate);
  graph.addNode('complete', complete);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = graph as any;

  // Wire the flow (no HITL interrupts — straight through with quality validation)
  g.setEntryPoint('generate_queries');
  g.addEdge('generate_queries', 'fan_out_research');
  g.addEdge('research_delegate', 'generate_outline');
  g.addEdge('generate_outline', 'fan_out_generation');
  g.addEdge('generation_delegate', 'assemble');
  g.addEdge('assemble', 'fan_out_review');
  g.addEdge('review_delegate', 'validate_quality');
  g.addEdge('validate_quality', 'fan_out_output');
  g.addEdge('output_delegate', 'complete');
  g.setFinishPoint('complete');

  return graph.compile();
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  const smartModel = new ChatAnthropic({
    model: 'claude-sonnet-4-5-20250929',
    anthropicApiKey: apiKey,
    maxTokens: 4096,
  });

  const fastModel = new ChatAnthropic({
    model: 'claude-haiku-4-5-20251001',
    anthropicApiKey: apiKey,
    maxTokens: 2048,
  });

  console.log('=== Content Creation Flow Test with Antagonistic Review ===');
  console.log('Smart model: claude-sonnet-4-5-20250929');
  console.log('Fast model:  claude-haiku-4-5-20251001');
  console.log('Mode: straight-through (no HITL interrupts)');
  console.log('Quality checks: HTML entities, duplicate headings, review scores >= 75%');
  console.log('');

  const flow = buildTestFlow();
  const startTime = Date.now();

  try {
    const result = await flow.invoke({
      config: {
        topic: 'LangGraph State Machines for Multi-Agent Coordination',
        format: 'tutorial' as const,
        tone: 'technical' as const,
        audience: 'intermediate' as const,
        outputFormats: ['markdown' as const],
        smartModel,
        fastModel,
      },
      researchQueries: [],
      researchResults: [],
      outline: undefined,
      sections: [],
      assembledContent: undefined,
      reviewFeedback: [],
      outputs: [],
      qualityReport: undefined,
      error: undefined,
    });

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    console.log('=== Results ===');
    console.log(`Total time: ${totalTime}s`);
    console.log(`Sections: ${result.sections?.length || 0}`);
    console.log(`Outputs: ${result.outputs?.length || 0}`);
    console.log(`Error: ${result.error || 'none'}`);

    if (result.sections?.length > 0) {
      console.log('');
      console.log('--- Generated Sections ---');
      for (const s of result.sections) {
        console.log(
          `  ${s.id}: "${s.title}" (${s.content?.length || 0} chars, ${s.codeExamples?.length || 0} code examples)`
        );
      }
    }

    if (result.assembledContent) {
      console.log('');
      console.log(`--- Assembled Content (${result.assembledContent.length} chars) ---`);
      console.log(result.assembledContent.substring(0, 800));
      if (result.assembledContent.length > 800) console.log('...(truncated)');
    }

    // Display quality report
    if (result.qualityReport) {
      const report = result.qualityReport;
      console.log('');
      console.log('=== Quality Report ===');
      console.log(`Average Review Score: ${report.averageReviewScore.toFixed(1)}%`);
      console.log(`HTML Entity Violations: ${report.htmlEntityViolations.length}`);
      if (report.htmlEntityViolations.length > 0) {
        report.htmlEntityViolations.forEach((v) => console.log(`  - ${v}`));
      }
      console.log(`Duplicate Headings: ${report.duplicateHeadings.length}`);
      if (report.duplicateHeadings.length > 0) {
        report.duplicateHeadings.forEach((h) => console.log(`  - ${h}`));
      }
      console.log('');
      console.log('Review Scores by Section:');
      report.reviewScores.forEach((s) => {
        const status = s.score >= 75 ? '✓' : '✗';
        console.log(`  ${status} ${s.section}: ${s.score}%`);
      });
      console.log('');
      console.log(`Overall Quality Check: ${report.passed ? '✓ PASSED' : '✗ FAILED'}`);
    }

    // Write full output and quality report
    if (result.outputs?.length > 0) {
      const { writeFileSync } = await import('fs');
      const mdOutput = result.outputs.find((o: OutputResult) => o.format === 'markdown');
      if (mdOutput?.content) {
        const outputPath = '/tmp/content-flow-output.md';
        writeFileSync(outputPath, mdOutput.content);
        console.log(`\nFull output: ${outputPath} (${mdOutput.content.length} chars)`);

        // Write quality report
        if (result.qualityReport) {
          const reportPath = '/tmp/content-flow-quality-report.json';
          writeFileSync(reportPath, JSON.stringify(result.qualityReport, null, 2));
          console.log(`Quality report: ${reportPath}`);
        }
      }
    }

    // Exit with error code if quality check failed
    if (result.qualityReport && !result.qualityReport.passed) {
      console.error('\n❌ Quality check failed. See report above for details.');
      process.exit(1);
    }
  } catch (error) {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\nFlow failed after ${totalTime}s:`, error);
    process.exit(1);
  }
}

main().catch(console.error);
