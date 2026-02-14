/**
 * Output Generator Nodes
 *
 * Parallel output nodes that generate different formats from content:
 * - MarkdownOutputNode: Final markdown with frontmatter
 * - HFDatasetNode: HuggingFace-compatible JSONL training data
 * - MetadataNode: SEO metadata and content analysis
 *
 * All nodes execute in parallel via Send() with results collected via fileReducer.
 */

import { z } from 'zod';

/**
 * Zod Schemas for validation
 */

// Markdown frontmatter schema
export const MarkdownFrontmatterSchema = z.object({
  title: z.string(),
  date: z.string(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  draft: z.boolean().optional(),
});

export type MarkdownFrontmatter = z.infer<typeof MarkdownFrontmatterSchema>;

// HuggingFace chat message schema
export const HFChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

export type HFChatMessage = z.infer<typeof HFChatMessageSchema>;

// HuggingFace dataset entry schema (JSONL format)
export const HFDatasetEntrySchema = z.object({
  messages: z.array(HFChatMessageSchema),
  source: z.string().optional(),
  metadata: z
    .object({
      section: z.string().optional(),
      type: z.enum(['qa', 'instruction', 'explanation']),
    })
    .optional(),
});

export type HFDatasetEntry = z.infer<typeof HFDatasetEntrySchema>;

// SEO metadata schema
export const SEOMetadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  keywords: z.array(z.string()),
  readTime: z.number(), // in minutes
  summary: z.string(),
  tags: z.array(z.string()),
  category: z.string().optional(),
});

export type SEOMetadata = z.infer<typeof SEOMetadataSchema>;

/**
 * Output state interface
 */
export interface OutputState {
  content: string; // Raw content to process
  title?: string;
  author?: string;
  outputFiles?: Array<{
    path: string;
    content: string;
    type: 'markdown' | 'jsonl' | 'json';
  }>;
}

/**
 * MarkdownOutputNode - Generates final markdown with frontmatter
 */
export async function markdownOutputNode(state: OutputState): Promise<Partial<OutputState>> {
  const { content, title, author } = state;

  // Generate frontmatter
  const frontmatter: MarkdownFrontmatter = {
    title: title || 'Untitled Document',
    date: new Date().toISOString(),
    author: author || undefined,
    tags: extractTags(content),
    category: extractCategory(content),
    draft: false,
  };

  // Validate frontmatter
  const validatedFrontmatter = MarkdownFrontmatterSchema.parse(frontmatter);

  // Format frontmatter as YAML
  const frontmatterYaml = Object.entries(validatedFrontmatter)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}:\n${value.map((v) => `  - ${v}`).join('\n')}`;
      }
      if (typeof value === 'boolean') {
        return `${key}: ${value}`;
      }
      return `${key}: ${JSON.stringify(value)}`;
    })
    .join('\n');

  // Combine frontmatter and content
  const markdownOutput = `---
${frontmatterYaml}
---

${content}`;

  return {
    outputFiles: [
      {
        path: 'output.md',
        content: markdownOutput,
        type: 'markdown',
      },
    ],
  };
}

/**
 * HFDatasetNode - Converts content to HuggingFace JSONL training data
 */
export async function hfDatasetNode(state: OutputState): Promise<Partial<OutputState>> {
  const { content, title } = state;

  const entries: HFDatasetEntry[] = [];

  // Extract Q&A pairs from content
  const qaPairs = extractQAPairs(content);
  for (const qa of qaPairs) {
    const entry: HFDatasetEntry = {
      messages: [
        {
          role: 'system',
          content: 'You are a helpful technical assistant.',
        },
        {
          role: 'user',
          content: qa.question,
        },
        {
          role: 'assistant',
          content: qa.answer,
        },
      ],
      source: title || 'generated',
      metadata: {
        type: 'qa',
        section: qa.section,
      },
    };

    // Validate entry
    const validatedEntry = HFDatasetEntrySchema.parse(entry);
    entries.push(validatedEntry);
  }

  // Extract instruction-following examples from how-to sections
  const instructions = extractInstructions(content);
  for (const instr of instructions) {
    const entry: HFDatasetEntry = {
      messages: [
        {
          role: 'system',
          content: 'You are a helpful technical assistant.',
        },
        {
          role: 'user',
          content: instr.instruction,
        },
        {
          role: 'assistant',
          content: instr.response,
        },
      ],
      source: title || 'generated',
      metadata: {
        type: 'instruction',
        section: instr.section,
      },
    };

    // Validate entry
    const validatedEntry = HFDatasetEntrySchema.parse(entry);
    entries.push(validatedEntry);
  }

  // Convert to JSONL format (one JSON object per line)
  const jsonlContent = entries.map((entry) => JSON.stringify(entry)).join('\n');

  return {
    outputFiles: [
      {
        path: 'training_data.jsonl',
        content: jsonlContent,
        type: 'jsonl',
      },
    ],
  };
}

/**
 * MetadataNode - Generates SEO metadata and content analysis
 */
export async function metadataNode(state: OutputState): Promise<Partial<OutputState>> {
  const { content, title } = state;

  // Generate metadata
  const metadata: SEOMetadata = {
    title: title || extractTitleFromContent(content),
    description: generateDescription(content),
    keywords: extractKeywords(content),
    readTime: estimateReadTime(content),
    summary: generateSummary(content),
    tags: extractTags(content),
    category: extractCategory(content),
  };

  // Validate metadata
  const validatedMetadata = SEOMetadataSchema.parse(metadata);

  return {
    outputFiles: [
      {
        path: 'metadata.json',
        content: JSON.stringify(validatedMetadata, null, 2),
        type: 'json',
      },
    ],
  };
}

/**
 * Helper functions for content extraction and analysis
 */

function extractTags(content: string): string[] {
  // Extract tags from common patterns: #tag, tags: [...], etc.
  const tags = new Set<string>();

  // Match hashtags
  const hashtagMatches = content.match(/#[\w-]+/g);
  if (hashtagMatches) {
    hashtagMatches.forEach((tag) => tags.add(tag.slice(1).toLowerCase()));
  }

  // Match code keywords (basic heuristic)
  const codeKeywords = [
    'typescript',
    'javascript',
    'python',
    'react',
    'nodejs',
    'api',
    'database',
    'testing',
  ];
  codeKeywords.forEach((keyword) => {
    if (content.toLowerCase().includes(keyword)) {
      tags.add(keyword);
    }
  });

  return Array.from(tags).slice(0, 10); // Limit to 10 tags
}

function extractCategory(content: string): string | undefined {
  // Simple heuristic: look for category keywords
  const categories = {
    tutorial: /\b(tutorial|guide|how[\s-]?to|step[\s-]?by[\s-]?step)\b/i,
    reference: /\b(reference|documentation|api|spec)\b/i,
    article: /\b(article|post|blog)\b/i,
    example: /\b(example|demo|sample)\b/i,
  };

  for (const [category, pattern] of Object.entries(categories)) {
    if (pattern.test(content)) {
      return category;
    }
  }

  return undefined;
}

interface QAPair {
  question: string;
  answer: string;
  section?: string;
}

function extractQAPairs(content: string): QAPair[] {
  const pairs: QAPair[] = [];

  // Match Q&A patterns: "Q:", "Question:", "A:", "Answer:"
  const qaPattern =
    /(?:Q(?:uestion)?[:.]?\s*)(.*?)\s*(?:A(?:nswer)?[:.]?\s*)(.*?)(?=(?:Q(?:uestion)?[:.]|\n\n|$))/gis;

  let match;
  while ((match = qaPattern.exec(content)) !== null) {
    pairs.push({
      question: match[1].trim(),
      answer: match[2].trim(),
    });
  }

  // Match heading + paragraph patterns (FAQ style)
  const headingPattern = /^#+\s+(.+?)\??\s*\n+(.+?)(?=\n#+|\n\n|\Z)/gms;
  while ((match = headingPattern.exec(content)) !== null) {
    const heading = match[1].trim();
    const contentAfter = match[2].trim();

    // Only treat as Q&A if heading is question-like
    if (heading.match(/\b(what|how|why|when|where|which|who|can|should|does)\b/i)) {
      pairs.push({
        question: heading,
        answer: contentAfter,
        section: heading,
      });
    }
  }

  return pairs;
}

interface Instruction {
  instruction: string;
  response: string;
  section?: string;
}

function extractInstructions(content: string): Instruction[] {
  const instructions: Instruction[] = [];

  // Match imperative headings followed by steps/explanation
  const imperativePattern =
    /^#+\s+((?:How to|Create|Build|Setup|Configure|Install|Deploy|Update|Add|Remove).+?)\s*\n+(.+?)(?=\n#+|\n\n\n|\Z)/gms;

  let match;
  while ((match = imperativePattern.exec(content)) !== null) {
    const heading = match[1].trim();
    const steps = match[2].trim();

    instructions.push({
      instruction: heading,
      response: steps,
      section: heading,
    });
  }

  return instructions;
}

function extractTitleFromContent(content: string): string {
  // Try to find first H1 heading
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // Fallback: first line
  const firstLine = content.split('\n')[0];
  return firstLine.slice(0, 100).trim() || 'Untitled Document';
}

function generateDescription(content: string): string {
  // Find first paragraph after title
  const lines = content.split('\n');
  let description = '';

  for (const line of lines) {
    // Skip headings and empty lines
    if (line.trim() && !line.trim().startsWith('#')) {
      description = line.trim();
      break;
    }
  }

  // Limit to 160 characters (SEO best practice)
  if (description.length > 160) {
    description = description.slice(0, 157) + '...';
  }

  return description || 'No description available';
}

function extractKeywords(content: string): string[] {
  // Simple keyword extraction based on frequency
  const words = content
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 4); // Filter short words

  // Count word frequency
  const frequency = new Map<string, number>();
  words.forEach((word) => {
    frequency.set(word, (frequency.get(word) || 0) + 1);
  });

  // Get top keywords
  const keywords = Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);

  return keywords;
}

function estimateReadTime(content: string): number {
  // Average reading speed: 200 words per minute
  const words = content.split(/\s+/).length;
  const minutes = Math.ceil(words / 200);
  return Math.max(1, minutes);
}

function generateSummary(content: string): string {
  // Extract first 3 paragraphs as summary
  const paragraphs: string[] = [];
  let currentParagraph = '';

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip headings
    if (trimmed.startsWith('#')) {
      continue;
    }

    if (trimmed) {
      currentParagraph += (currentParagraph ? ' ' : '') + trimmed;
    } else if (currentParagraph) {
      paragraphs.push(currentParagraph);
      currentParagraph = '';

      if (paragraphs.length >= 3) {
        break;
      }
    }
  }

  if (currentParagraph && paragraphs.length < 3) {
    paragraphs.push(currentParagraph);
  }

  const summary = paragraphs.join('\n\n');

  // Limit to 500 characters
  if (summary.length > 500) {
    return summary.slice(0, 497) + '...';
  }

  return summary || 'No summary available';
}
