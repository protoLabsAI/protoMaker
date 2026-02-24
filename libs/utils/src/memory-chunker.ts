/**
 * Memory Chunker
 *
 * Utility for parsing and chunking markdown files for knowledge store ingestion.
 * Splits on ## headings with a max token limit, with fallback to paragraph-based splitting.
 */

import { parseFrontmatter } from './memory-loader.js';

const MAX_TOKENS_PER_CHUNK = 500;
const TOKENS_PER_WORD = 1.3; // Approximate token-to-word ratio

/**
 * A parsed chunk from a markdown file
 */
export interface MemoryChunk {
  /** Heading text (if from a ## heading) */
  heading?: string;

  /** Content of the chunk */
  content: string;

  /** Index of this chunk within the source file */
  chunkIndex: number;

  /** Tags from frontmatter (only on first chunk) */
  tags?: string[];

  /** Importance from frontmatter (only on first chunk) */
  importance?: number;
}

/**
 * Estimate token count from text using word count approximation
 */
function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.ceil(words * TOKENS_PER_WORD);
}

/**
 * Split content into chunks at paragraph boundaries up to max tokens
 */
function splitByParagraphs(content: string, maxTokens: number): string[] {
  const chunks: string[] = [];
  const paragraphs = content.split(/\n\n+/);

  let currentChunk = '';
  let currentTokens = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = estimateTokens(paragraph);

    // If adding this paragraph exceeds max, save current chunk and start new one
    if (currentTokens + paragraphTokens > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
      currentTokens = 0;
    }

    // If a single paragraph exceeds max, split it by sentences
    if (paragraphTokens > maxTokens) {
      const sentences = paragraph.split(/\.(?:\s+|$)/);
      for (const sentence of sentences) {
        const sentenceText = sentence.trim() + (sentence.trim() ? '.' : '');
        const sentenceTokens = estimateTokens(sentenceText);

        if (currentTokens + sentenceTokens > maxTokens && currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
          currentTokens = 0;
        }

        currentChunk += (currentChunk ? ' ' : '') + sentenceText;
        currentTokens += sentenceTokens;
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      currentTokens += paragraphTokens;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Parse and chunk a markdown file
 *
 * Strategy:
 * 1. Parse frontmatter (tags, importance)
 * 2. Split on ## headings if present
 * 3. Each chunk = heading + content up to MAX_TOKENS_PER_CHUNK
 * 4. Fallback to paragraph-based splitting if no ## headings
 * 5. Frontmatter metadata only attached to first chunk
 *
 * @param fileContent - Full content of the markdown file
 * @returns Array of chunks with metadata
 */
export function chunkMarkdownFile(fileContent: string): MemoryChunk[] {
  const chunks: MemoryChunk[] = [];

  // Parse frontmatter
  const { body: contentWithoutFrontmatter, metadata } = parseFrontmatter(fileContent);

  const tags = Array.isArray(metadata?.tags)
    ? (metadata.tags as string[])
    : typeof metadata?.tags === 'string'
      ? [metadata.tags as string]
      : undefined;

  const importance =
    typeof metadata?.importance === 'number'
      ? (metadata.importance as number)
      : typeof metadata?.importance === 'string'
        ? parseFloat(metadata.importance as string)
        : undefined;

  // Try to split by ## headings
  const headingSections = contentWithoutFrontmatter.split(/^## /m);

  // If we found heading sections (first element is content before first heading)
  if (headingSections.length > 1) {
    for (let i = 0; i < headingSections.length; i++) {
      const section = headingSections[i];
      if (!section.trim()) continue;

      // First section might be content before any headings
      if (i === 0 && section.trim()) {
        const textChunks = splitByParagraphs(section.trim(), MAX_TOKENS_PER_CHUNK);
        for (const textChunk of textChunks) {
          chunks.push({
            content: textChunk,
            chunkIndex: chunks.length,
            tags: chunks.length === 0 ? tags : undefined,
            importance: chunks.length === 0 ? importance : undefined,
          });
        }
        continue;
      }

      // Extract heading and content
      const firstNewline = section.indexOf('\n');
      const heading =
        firstNewline >= 0 ? section.substring(0, firstNewline).trim() : section.trim();
      const sectionContent = firstNewline >= 0 ? section.substring(firstNewline + 1).trim() : '';

      // Split section content if it exceeds max tokens
      const fullContent = `## ${heading}\n\n${sectionContent}`;
      const contentTokens = estimateTokens(fullContent);

      if (contentTokens <= MAX_TOKENS_PER_CHUNK) {
        // Fits in one chunk
        chunks.push({
          heading,
          content: fullContent,
          chunkIndex: chunks.length,
          tags: chunks.length === 0 ? tags : undefined,
          importance: chunks.length === 0 ? importance : undefined,
        });
      } else {
        // Need to split this section into multiple chunks
        const textChunks = splitByParagraphs(sectionContent, MAX_TOKENS_PER_CHUNK);
        for (let j = 0; j < textChunks.length; j++) {
          chunks.push({
            heading: j === 0 ? heading : `${heading} (cont'd ${j})`,
            content: j === 0 ? `## ${heading}\n\n${textChunks[j]}` : textChunks[j],
            chunkIndex: chunks.length,
            tags: chunks.length === 0 ? tags : undefined,
            importance: chunks.length === 0 ? importance : undefined,
          });
        }
      }
    }
  } else {
    // No ## headings found - fallback to paragraph-based splitting
    const textChunks = splitByParagraphs(contentWithoutFrontmatter.trim(), MAX_TOKENS_PER_CHUNK);
    for (const textChunk of textChunks) {
      chunks.push({
        content: textChunk,
        chunkIndex: chunks.length,
        tags: chunks.length === 0 ? tags : undefined,
        importance: chunks.length === 0 ? importance : undefined,
      });
    }
  }

  return chunks;
}
