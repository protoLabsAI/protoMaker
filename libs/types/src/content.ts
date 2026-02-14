/**
 * Content Generation Types
 *
 * Types for the content generation flow system
 */

import { z } from 'zod';

/**
 * Content type - determines the style and structure of generated content
 */
export type ContentType = 'blog' | 'doc' | 'training-data';

/**
 * Content configuration for generation
 */
export interface ContentConfig {
  /** Type of content to generate */
  type: ContentType;
  /** Target audience for the content */
  targetAudience: string;
  /** Tone/style of writing (e.g., "technical", "casual", "formal") */
  tone: string;
  /** Target length in words */
  length: number;
}

/**
 * A single section in the content outline
 */
export interface Section {
  /** Section title */
  title: string;
  /** Key points to cover in this section */
  keyPoints: string[];
  /** Estimated word count for this section */
  estimatedWordCount: number;
  /** References to research content needed for this section */
  requiredReferences: string[];
  /** Suggested code examples (if applicable) */
  suggestedCodeExamples?: string[];
}

/**
 * Structured outline for content generation
 */
export interface Outline {
  /** Overall title/topic of the content */
  title: string;
  /** Brief summary of what the content will cover */
  summary: string;
  /** Ordered list of sections */
  sections: Section[];
  /** Total estimated word count */
  totalWordCount: number;
  /** When the outline was created */
  createdAt: string;
}

/**
 * Zod schema for Section validation
 */
export const SectionSchema = z.object({
  title: z.string().min(1, 'Section title is required'),
  keyPoints: z.array(z.string()).min(1, 'At least one key point is required'),
  estimatedWordCount: z.number().positive('Word count must be positive'),
  requiredReferences: z.array(z.string()),
  suggestedCodeExamples: z.array(z.string()).optional(),
});

/**
 * Zod schema for Outline validation
 */
export const OutlineSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  summary: z.string().min(1, 'Summary is required'),
  sections: z.array(SectionSchema).min(1, 'At least one section is required'),
  totalWordCount: z.number().positive('Total word count must be positive'),
  createdAt: z.string(),
});

/**
 * Research summary input for outline planning
 */
export interface ResearchSummary {
  /** The research topic */
  topic: string;
  /** Summary of research findings */
  summary: string;
  /** Context gathered during research */
  context?: string;
  /** Analysis of the research */
  analysis?: string;
}
