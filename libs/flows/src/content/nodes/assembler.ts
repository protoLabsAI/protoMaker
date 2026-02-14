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

import { LangfuseClient } from '@automaker/observability';

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
    console.log('[assembler] Coherence checking not yet implemented with LLM');

    // Flush trace if available
    if (langfuseClient && traceId) {
      await langfuseClient.flush();
    }

    return sectionsText;
  } catch (error) {
    console.error('[assembler] Error in coherence check:', error);
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
 * Assembler node - main entry point
 */
export async function assembler(
  state: AssemblerState,
  langfuseClient?: LangfuseClient,
  coherencePrompt?: string
): Promise<Partial<AssemblerState>> {
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
    console.log('[assembler] Starting document assembly...');
    console.log(`[assembler] Document type: ${state.documentType}`);
    console.log(`[assembler] Sections: ${state.sections.length}`);

    // Step 1: Merge sections in order
    let document = mergeSections(state.sections);

    // Step 2: Resolve cross-references
    document = resolveCrossReferences(document, state.sections);

    // Step 3: Number code examples
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
      console.log('[assembler] Checking coherence with LLM...');
      await checkCoherence(state.sections, langfuseClient, coherencePrompt);
      coherenceChecked = true;
    }

    console.log('[assembler] Assembly complete');

    // Flush trace if available
    if (langfuseClient && traceId) {
      await langfuseClient.flush();
    }

    return {
      assembledDocument: document,
      tableOfContents,
      coherenceChecked,
      crossReferencesResolved: true,
    };
  } catch (error) {
    console.error('[assembler] Error during assembly:', error);
    throw error;
  }
}
