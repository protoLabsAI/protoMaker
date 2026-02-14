/**
 * Content output type schemas for AutoMaker content generation.
 *
 * Defines Zod schemas for all content types:
 * - BlogPost: title, slug, frontmatter, sections, SEO metadata
 * - TechDoc: title, sections, code examples, API references
 * - TrainingExample: input, output, metadata (HuggingFace format)
 * - HFDatasetRow: messages array in chat format
 *
 * All types include a discriminated 'type' field for ContentType union.
 */

import { z } from 'zod';

/**
 * Blog post frontmatter schema — metadata shown at the top of blog posts.
 */
const BlogPostFrontmatterSchema = z.object({
  /** Post author name */
  author: z.string().optional(),
  /** ISO 8601 publication date */
  publishedAt: z.string().optional(),
  /** ISO 8601 last update date */
  updatedAt: z.string().optional(),
  /** Post category */
  category: z.string().optional(),
  /** Array of topic tags */
  tags: z.array(z.string()).optional(),
  /** Featured image URL */
  coverImage: z.string().optional(),
  /** Featured image alt text */
  coverImageAlt: z.string().optional(),
  /** Estimated reading time in minutes */
  readingTime: z.number().int().positive().optional(),
});

/**
 * SEO metadata schema for search engine optimization.
 */
const SEOMetadataSchema = z.object({
  /** Meta description (150-160 chars recommended) */
  description: z.string(),
  /** OpenGraph title (can differ from main title) */
  ogTitle: z.string().optional(),
  /** OpenGraph description */
  ogDescription: z.string().optional(),
  /** OpenGraph image URL */
  ogImage: z.string().optional(),
  /** Twitter card type */
  twitterCard: z.enum(['summary', 'summary_large_image', 'app', 'player']).optional(),
  /** Canonical URL to prevent duplicate content */
  canonicalUrl: z.string().optional(),
  /** Array of keywords */
  keywords: z.array(z.string()).optional(),
});

/**
 * Content section schema — used in both BlogPost and TechDoc.
 * Represents a single section with heading and content.
 */
const ContentSectionSchema = z.object({
  /** Section heading (h2, h3, etc.) */
  heading: z.string(),
  /** Markdown content for this section */
  content: z.string(),
  /** Optional heading level (default: 2 for h2) */
  level: z.number().int().min(1).max(6).optional(),
  /** Optional section ID for anchor links */
  id: z.string().optional(),
});

/**
 * Code example schema for technical documentation.
 */
const CodeExampleSchema = z.object({
  /** Programming language for syntax highlighting */
  language: z.string(),
  /** Source code */
  code: z.string(),
  /** Optional description/explanation */
  description: z.string().optional(),
  /** Optional example title */
  title: z.string().optional(),
  /** Optional file path or name */
  filename: z.string().optional(),
});

/**
 * API reference entry schema for technical documentation.
 */
const APIReferenceSchema = z.object({
  /** Function/method/class name */
  name: z.string(),
  /** Full type signature */
  signature: z.string(),
  /** Description of what it does */
  description: z.string(),
  /** Parameter descriptions */
  parameters: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        description: z.string(),
        optional: z.boolean().optional(),
        defaultValue: z.string().optional(),
      })
    )
    .optional(),
  /** Return value description */
  returns: z
    .object({
      type: z.string(),
      description: z.string(),
    })
    .optional(),
  /** Usage examples */
  examples: z.array(CodeExampleSchema).optional(),
});

/**
 * Chat message schema for HuggingFace dataset format.
 */
const ChatMessageSchema = z.object({
  /** Role: system, user, or assistant */
  role: z.enum(['system', 'user', 'assistant']),
  /** Message content */
  content: z.string(),
});

/**
 * Training example metadata schema.
 */
const TrainingMetadataSchema = z.object({
  /** Source of this example (e.g., "generated", "manual", "extracted") */
  source: z.string().optional(),
  /** Quality score (0-1) */
  quality: z.number().min(0).max(1).optional(),
  /** Difficulty level */
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  /** Domain or topic area */
  domain: z.string().optional(),
  /** ISO 8601 creation date */
  createdAt: z.string().optional(),
  /** Agent or author that created this example */
  createdBy: z.string().optional(),
});

/**
 * Blog post schema — full structured blog post with metadata.
 */
export const BlogPostSchema = z.object({
  /** Discriminator field */
  type: z.literal('blog-post'),
  /** Post title */
  title: z.string(),
  /** URL-friendly slug */
  slug: z.string(),
  /** Frontmatter metadata */
  frontmatter: BlogPostFrontmatterSchema,
  /** Array of content sections */
  sections: z.array(ContentSectionSchema),
  /** SEO metadata */
  seoMetadata: SEOMetadataSchema,
  /** Optional lead/excerpt (shown in list views) */
  excerpt: z.string().optional(),
});

/**
 * Technical documentation schema — structured docs with code examples and API refs.
 */
export const TechDocSchema = z.object({
  /** Discriminator field */
  type: z.literal('tech-doc'),
  /** Document title */
  title: z.string(),
  /** Array of content sections */
  sections: z.array(ContentSectionSchema),
  /** Code examples */
  codeExamples: z.array(CodeExampleSchema).optional(),
  /** API reference entries */
  apiReferences: z.array(APIReferenceSchema).optional(),
  /** Optional document category/type */
  category: z.string().optional(),
  /** Optional tags */
  tags: z.array(z.string()).optional(),
});

/**
 * Training example schema — input/output pair for fine-tuning.
 */
export const TrainingExampleSchema = z.object({
  /** Discriminator field */
  type: z.literal('training-example'),
  /** Input prompt or user message */
  input: z.string(),
  /** Expected output or assistant response */
  output: z.string(),
  /** Metadata about this example */
  metadata: TrainingMetadataSchema.optional(),
  /** Tags for categorization and filtering */
  tags: z.array(z.string()).optional(),
});

/**
 * HuggingFace dataset row schema — messages array in chat format.
 */
export const HFDatasetRowSchema = z.object({
  /** Discriminator field */
  type: z.literal('hf-dataset-row'),
  /** Array of chat messages (system, user, assistant) */
  messages: z.array(ChatMessageSchema),
  /** Optional metadata for filtering/analysis */
  metadata: TrainingMetadataSchema.optional(),
});

/**
 * Discriminated union of all content types.
 * Discriminated by the 'type' field.
 */
export const ContentTypeSchema = z.discriminatedUnion('type', [
  BlogPostSchema,
  TechDocSchema,
  TrainingExampleSchema,
  HFDatasetRowSchema,
]);

/**
 * Inferred TypeScript types from Zod schemas.
 */
export type BlogPostFrontmatter = z.infer<typeof BlogPostFrontmatterSchema>;
export type SEOMetadata = z.infer<typeof SEOMetadataSchema>;
export type ContentSection = z.infer<typeof ContentSectionSchema>;
export type CodeExample = z.infer<typeof CodeExampleSchema>;
export type APIReference = z.infer<typeof APIReferenceSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type TrainingMetadata = z.infer<typeof TrainingMetadataSchema>;

export type BlogPost = z.infer<typeof BlogPostSchema>;
export type TechDoc = z.infer<typeof TechDocSchema>;
export type TrainingExample = z.infer<typeof TrainingExampleSchema>;
export type HFDatasetRow = z.infer<typeof HFDatasetRowSchema>;

/** Union type for all content types */
export type ContentType = z.infer<typeof ContentTypeSchema>;
