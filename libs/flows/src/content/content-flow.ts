/**
 * Content Generation Flow State
 *
 * State definition for the content generation flow graph
 */

import { Annotation } from '@langchain/langgraph';
import type { Outline, ContentConfig, ResearchSummary } from '@automaker/types';
import type { TracingConfig } from '@automaker/observability';

/**
 * Provider interface for LLM invocation
 */
export interface LLMProvider {
  invoke(options: {
    systemPrompt: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    model: string;
    temperature?: number;
  }): AsyncGenerator<any>;
}

/**
 * State shape for the content generation flow
 */
export interface ContentState {
  /** Research summary input */
  researchSummary?: ResearchSummary;
  /** Content configuration (type, audience, tone, length) */
  contentConfig?: ContentConfig;
  /** Generated outline */
  outline?: Outline;
  /** Modified outline from human review */
  modifiedOutline?: Outline;
  /** Whether outline needs approval */
  needsApproval?: boolean;
  /** Whether outline was approved */
  approved?: boolean;
  /** Whether awaiting approval */
  awaitingApproval?: boolean;
  /** When outline was generated */
  outlineGeneratedAt?: string;
  /** LLM provider instance */
  provider?: LLMProvider;
  /** Model to use for generation */
  model?: string;
  /** Session ID for tracing */
  sessionId?: string;
  /** Tracing configuration */
  tracingConfig?: TracingConfig;
  /** Whether flow is completed */
  completed?: boolean;
}

/**
 * LangGraph state annotation for content flow
 */
export const ContentStateAnnotation = Annotation.Root({
  researchSummary: Annotation<ResearchSummary>,
  contentConfig: Annotation<ContentConfig>,
  outline: Annotation<Outline>,
  modifiedOutline: Annotation<Outline>,
  needsApproval: Annotation<boolean>,
  approved: Annotation<boolean>,
  awaitingApproval: Annotation<boolean>,
  outlineGeneratedAt: Annotation<string>,
  provider: Annotation<LLMProvider>,
  model: Annotation<string>,
  sessionId: Annotation<string>,
  tracingConfig: Annotation<TracingConfig>,
  completed: Annotation<boolean>,
});
