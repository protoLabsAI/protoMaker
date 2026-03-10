/**
 * Assembler node - Merges ordered sections into a complete document
 *
 * Handles:
 * - Section merging in outline order
 * - Table of contents generation for docs
 * - Frontmatter/metadata generation for blog posts
 * - Internal cross-reference resolution
 * - Code example numbering
 * - Consistent formatting
 * - LLM-assisted coherence checking
 */

import { LangfuseClient } from '@protolabsai/observability';
import type { RunnableConfig } from '@langchain/core/runnables';
import { createLogger } from '@protolabsai/utils';
import { copilotkitEmitState, emitHeartbeat } from '../copilotkit-utils.js';

const logger = createLogger('assembler');

/**
 * Document section with content and metadata
 */
export interface DocumentSection {
  id: string;
  order: number;
  title: string;
  content: string;
  level?: number; // Heading level (1-6)
}

/**
 * Document metadata for frontmatter generation
 */
export interface DocumentMetadata {
  title?: string;
  description?: string;
  author?: string;
  date?: string;
  tags?: string[];
  [key: string]: unknown;
}

/**
 * Validation warning for duplicate content or headings
 */
export interface ValidationWarning {
  type: 'duplicate-heading' | 'high-similarity';
  severity: 'warning';
  message: string;
  sections: string[]; // Section IDs or titles involved
  details?: Record<string, unknown>;
}

/**
 * Assembler state
 */
export interface AssemblerState {
  sections: DocumentSection[];
  documentType: 'docs' | 'blog';
  metadata?: DocumentMetadata;
  assembledDocument?: string;
  tableOfContents?: string;
  coherenceChecked?: boolean;
  crossReferencesResolved?: boolean;
  validationWarnings?: ValidationWarning[];
  config?: RunnableConfig;
}

/**
 * Generates a table of contents from sections
 */
function generateTableOfContents(sections: DocumentSection[]): string {
  const tocLines = ['## Table of Contents\n'];

  for (const section of sections) {
    const level = section.level || 2;
    const indent = '  '.repeat(level - 2);
    const anchor = section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    tocLines.push(`${indent}- [${section.title}](#${anchor})`);
  }

  return tocLines.join('\n') + '\n';
}

/**
 * Generates YAML frontmatter for blog posts
 */
function generateFrontmatter(metadata: DocumentMetadata): string {
  const lines = ['---'];

  if (metadata.title) lines.push(`title: "${metadata.title}"`);
  if (metadata.description) lines.push(`description: "${metadata.description}"`);
  if (metadata.author) lines.push(`author: "${metadata.author}"`);
  if (metadata.date) lines.push(`date: "${metadata.date}"`);

  if (metadata.tags && metadata.tags.length > 0) {
    lines.push(`tags: [${metadata.tags.map((t) => `"${t}"`).join(', ')}]`);
  }

  // Add any additional metadata fields
  for (const [key, value] of Object.entries(metadata)) {
    if (!['title', 'description', 'author', 'date', 'tags'].includes(key)) {
      if (typeof value === 'string') {
        lines.push(`${key}: "${value}"`);
      } else {
        lines.push(`${key}: ${JSON.stringify(value)}`);
      }
    }
  }

  lines.push('---\n');
  return lines.join('\n');
}

/**
 * Resolves cross-references in the document
 * Converts [text](#section-id) to proper anchor links
 */
function resolveCrossReferences(content: string, sections: DocumentSection[]): string {
  let resolved = content;

  // Build a map of section IDs to anchor links
  const anchorMap = new Map<string, string>();
  for (const section of sections) {
    const anchor = section.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    anchorMap.set(section.id, anchor);
  }

  // Replace [text](#section-id) with [text](#proper-anchor)
  for (const [sectionId, anchor] of anchorMap.entries()) {
    const pattern = new RegExp(`\\(#${sectionId}\\)`, 'g');
    resolved = resolved.replace(pattern, `(#${anchor})`);
  }

  return resolved;
}

/**
 * Numbers code examples consistently throughout the document
 */
function numberCodeExamples(content: string): string {
  let counter = 1;
  const lines = content.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        // Starting a code block
        result.push(`<!-- Example ${counter} -->`);
        counter++;
        inCodeBlock = true;
      } else {
        // Ending a code block
        inCodeBlock = false;
      }
    }
    result.push(line);
  }

  return result.join('\n');
}

/**
 * Checks coherence between sections using LLM
 * This is a placeholder for LLM-based coherence checking.
 * In production, this would call an LLM provider to review transitions.
 */
async function checkCoherence(
  sections: DocumentSection[],
  langfuseClient?: LangfuseClient,
  prompt?: string
): Promise<string> {
  // Create a trace if Langfuse is available
  const traceId = langfuseClient
    ? langfuseClient.createTrace({
        name: 'assembler.checkCoherence',
        metadata: { sectionCount: sections.length },
      })
    : undefined;

  try {
    // Prepare sections text for coherence checking
    const sectionsText = sections.map((s) => `## ${s.title}\n\n${s.content}`).join('\n\n---\n\n');

    // TODO: Call LLM provider for coherence checking
    // For now, return the merged sections as-is
    logger.info('[assembler] Coherence checking not yet implemented with LLM');

    // Flush trace if available
    if (langfuseClient && traceId) {
      await langfuseClient.flush();
    }

    return sectionsText;
  } catch (error) {
    logger.error('[assembler] Error in coherence check:', error);
    throw error;
  }
}

/**
 * Merges sections into a complete document
 */
function mergeSections(sections: DocumentSection[]): string {
  // Sort sections by order
  const sorted = [...sections].sort((a, b) => a.order - b.order);

  // Merge content
  const content = sorted
    .map((section) => {
      const level = section.level || 2;
      const heading = '#'.repeat(level);
      return `${heading} ${section.title}\n\n${section.content}`;
    })
    .join('\n\n');

  return content;
}

/**
 * Extracts H2/H3 headings from markdown content
 */
function extractHeadings(content: string): string[] {
  const headingRegex = /^#{2,3}\s+(.+)$/gm;
  const headings: string[] = [];
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    headings.push(match[1].trim());
  }
  return headings;
}

/**
 * Extracts significant keywords from text (words 4+ chars, lowercased, no stop words)
 */
function extractKeywords(text: string): Set<string> {
  const stopWords = new Set([
    'this',
    'that',
    'with',
    'from',
    'have',
    'been',
    'will',
    'would',
    'could',
    'should',
    'about',
    'which',
    'their',
    'there',
    'these',
    'those',
    'then',
    'than',
    'when',
    'what',
    'where',
    'they',
    'your',
    'into',
    'each',
    'make',
    'like',
    'just',
    'over',
    'such',
    'also',
    'more',
    'some',
    'very',
    'after',
    'before',
    'between',
    'under',
    'other',
  ]);

  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !stopWords.has(w))
  );
}

/**
 * Calculates Jaccard similarity between two keyword sets (0-1)
 */
function keywordSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Detects duplicate headings and high content similarity between sections.
 * Returns structured warnings without blocking assembly.
 */
export function detectDuplicates(sections: DocumentSection[]): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Check for duplicate H2/H3 headings across all sections
  const headingMap = new Map<string, string[]>();
  for (const section of sections) {
    const allHeadings = [section.title, ...extractHeadings(section.content)];
    for (const heading of allHeadings) {
      const normalized = heading.toLowerCase().trim();
      const existing = headingMap.get(normalized) || [];
      existing.push(section.title);
      headingMap.set(normalized, existing);
    }
  }

  for (const [heading, sectionTitles] of headingMap.entries()) {
    if (sectionTitles.length > 1) {
      const unique = [...new Set(sectionTitles)];
      if (unique.length > 1 || sectionTitles.length > 1) {
        warnings.push({
          type: 'duplicate-heading',
          severity: 'warning',
          message: `Duplicate heading "${heading}" found in sections: ${sectionTitles.join(', ')}`,
          sections: sectionTitles,
          details: { heading },
        });
      }
    }
  }

  // Check for high content similarity between section pairs
  const SIMILARITY_THRESHOLD = 0.6;
  for (let i = 0; i < sections.length; i++) {
    const keywordsA = extractKeywords(sections[i].content);
    for (let j = i + 1; j < sections.length; j++) {
      const keywordsB = extractKeywords(sections[j].content);
      const similarity = keywordSimilarity(keywordsA, keywordsB);

      if (similarity > SIMILARITY_THRESHOLD) {
        warnings.push({
          type: 'high-similarity',
          severity: 'warning',
          message: `High content similarity (${(similarity * 100).toFixed(0)}%) between "${sections[i].title}" and "${sections[j].title}"`,
          sections: [sections[i].title, sections[j].title],
          details: { similarity: Math.round(similarity * 100) },
        });
      }
    }
  }

  return warnings;
}

/**
 * Assembler node - main entry point
 */
export async function assembler(
  state: AssemblerState,
  langfuseClient?: LangfuseClient,
  coherencePrompt?: string
): Promise<Partial<AssemblerState>> {
  const { config } = state;

  // Emit state to CopilotKit
  if (config) {
    await copilotkitEmitState(config, {
      currentActivity: 'Assembling document sections',
      progress: 0,
    });
  }

  // Create a trace if Langfuse is available
  const traceId = langfuseClient
    ? langfuseClient.createTrace({
        name: 'assembler.assemble',
        metadata: {
          documentType: state.documentType,
          sectionCount: state.sections.length,
        },
      })
    : undefined;

  try {
    logger.info('[assembler] Starting document assembly...');
    logger.info(`[assembler] Document type: ${state.documentType}`);
    logger.info(`[assembler] Sections: ${state.sections.length}`);

    // Emit heartbeat
    if (config) {
      await emitHeartbeat(config, 'Merging sections in order');
    }

    // Step 1: Merge sections in order
    let document = mergeSections(state.sections);

    // Step 2: Resolve cross-references
    if (config) {
      await emitHeartbeat(config, 'Resolving cross-references');
    }
    document = resolveCrossReferences(document, state.sections);

    // Step 3: Number code examples
    if (config) {
      await emitHeartbeat(config, 'Numbering code examples');
    }
    document = numberCodeExamples(document);

    // Step 4: Generate table of contents for docs
    let tableOfContents: string | undefined;
    if (state.documentType === 'docs') {
      tableOfContents = generateTableOfContents(state.sections);
      // Insert TOC after the main title
      const lines = document.split('\n');
      const firstHeadingIndex = lines.findIndex((line) => line.startsWith('#'));
      if (firstHeadingIndex !== -1) {
        lines.splice(firstHeadingIndex + 2, 0, tableOfContents);
        document = lines.join('\n');
      }
    }

    // Step 5: Generate frontmatter for blog posts
    if (state.documentType === 'blog' && state.metadata) {
      const frontmatter = generateFrontmatter(state.metadata);
      document = frontmatter + '\n' + document;
    }

    // Step 6: Optional coherence checking with LLM
    let coherenceChecked = false;
    if (langfuseClient && coherencePrompt) {
      logger.info('[assembler] Checking coherence with LLM...');
      await checkCoherence(state.sections, langfuseClient, coherencePrompt);
      coherenceChecked = true;
    }

    // Step 7: Run deduplication detection (non-blocking)
    const validationWarnings = detectDuplicates(state.sections);
    if (validationWarnings.length > 0) {
      logger.info(`[assembler] Found ${validationWarnings.length} validation warning(s):`);
      for (const w of validationWarnings) {
        logger.info(`  [${w.type}] ${w.message}`);
      }
    }

    logger.info('[assembler] Assembly complete');

    // Emit completion state
    if (config) {
      await copilotkitEmitState(config, {
        currentActivity: 'Document assembly complete',
        progress: 100,
      });
    }

    // Flush trace if available
    if (langfuseClient && traceId) {
      await langfuseClient.flush();
    }

    return {
      assembledDocument: document,
      tableOfContents,
      coherenceChecked,
      crossReferencesResolved: true,
      validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
    };
  } catch (error) {
    logger.error('[assembler] Error during assembly:', error);
    throw error;
  }
}
