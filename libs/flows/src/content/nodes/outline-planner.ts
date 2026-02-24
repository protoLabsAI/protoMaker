/**
 * Outline Planner Node
 *
 * Takes research summary and content config, generates a structured outline
 * with sections for parallel content generation. Includes HITL interrupt for
 * outline approval/modification.
 */

import { createLogger } from '@protolabs-ai/utils';
import {
  OutlineSchema,
  type Outline,
  type ContentConfig,
  type ResearchSummary,
} from '@protolabs-ai/types';
import { getOutlinePlannerPrompt } from '@protolabs-ai/prompts';
import { wrapProviderWithTracing } from '@protolabs-ai/observability';
import type { ContentState } from '../content-flow.js';
import { copilotkitEmitState, emitHeartbeat } from '../copilotkit-utils.js';

const logger = createLogger('outline-planner');

/**
 * Outline planner node - generates structured outline from research
 */
export async function outlinePlannerNode(state: ContentState): Promise<Partial<ContentState>> {
  logger.info('[outline-planner] Generating content outline...');

  const { researchSummary, contentConfig, provider, config } = state;

  // Emit state to CopilotKit
  if (config) {
    await copilotkitEmitState(config, {
      currentActivity: 'Generating content outline',
      progress: 0,
    });
  }

  if (!researchSummary) {
    throw new Error('No research summary available for outline planning');
  }

  if (!contentConfig) {
    throw new Error('No content configuration available for outline planning');
  }

  if (!provider) {
    throw new Error('No LLM provider available for outline planning');
  }

  try {
    // Build the prompt
    const systemPrompt = getOutlinePlannerPrompt({
      researchSummary,
      contentConfig,
    });

    logger.debug('[outline-planner] Invoking LLM with tracing...');

    // Emit heartbeat for long-running operation
    if (config) {
      await emitHeartbeat(config, 'Invoking LLM for outline generation');
    }

    // Create traced LLM invocation
    const messages = [
      {
        role: 'user' as const,
        content: 'Generate the content outline as specified.',
      },
    ];

    // Invoke provider with tracing
    const generator = provider.invoke({
      systemPrompt,
      messages,
      model: state.model || 'claude-sonnet-4-5-20250929',
      temperature: 0.7,
    });

    // Wrap with Langfuse tracing
    const tracedGenerator = wrapProviderWithTracing(
      generator,
      state.tracingConfig || { enabled: false },
      {
        model: state.model || 'claude-sonnet-4-5-20250929',
        traceName: 'outline-planner',
        sessionId: state.sessionId,
        metadata: {
          topic: researchSummary.topic,
          contentType: contentConfig.type,
          targetLength: contentConfig.length,
        },
        tags: ['content-generation', 'outline-planning'],
        input: { researchSummary, contentConfig },
      }
    );

    // Collect response
    let responseText = '';
    for await (const message of tracedGenerator) {
      if (message.type === 'content_block_delta' && message.delta.type === 'text_delta') {
        responseText += message.delta.text;
      }
    }

    logger.debug('[outline-planner] LLM response received, parsing JSON...');

    // Parse JSON response
    const parsed = JSON.parse(responseText);

    // Validate with Zod schema
    const outline: Outline = OutlineSchema.parse(parsed);

    logger.info('[outline-planner] Outline generated successfully');
    logger.info(`  Title: ${outline.title}`);
    logger.info(`  Sections: ${outline.sections.length}`);
    logger.info(`  Total words: ${outline.totalWordCount}`);

    // Emit completion state
    if (config) {
      await copilotkitEmitState(config, {
        currentActivity: 'Outline generation complete',
        progress: 100,
      });
    }

    return {
      outline,
      outlineGeneratedAt: new Date().toISOString(),
      needsApproval: true, // Flag for HITL interrupt
    };
  } catch (error) {
    logger.error('[outline-planner] Failed to generate outline:', error);
    throw new Error(
      `Outline planning failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Human approval node - pauses for outline review
 */
export function outlineApprovalNode(state: ContentState): Partial<ContentState> {
  logger.info('[outline-approval] Awaiting human approval...');

  if (!state.outline) {
    throw new Error('No outline available for approval');
  }

  // This node simply sets a flag that the graph will check
  // The actual approval happens when the graph is resumed with approved=true
  return {
    awaitingApproval: true,
  };
}

/**
 * Router function - determines if outline needs approval
 */
export function routeAfterOutlinePlanning(state: ContentState): string {
  if (state.needsApproval && !state.approved) {
    return 'outline_approval';
  }
  return 'next_step'; // Continue to section generation or other steps
}

/**
 * Router after approval - check if approved or rejected
 */
export function routeAfterApproval(state: ContentState): string {
  if (state.approved) {
    return 'next_step';
  }
  if (state.modifiedOutline) {
    return 'outline_planner'; // Regenerate with modifications
  }
  return '__end__'; // Rejected, end flow
}
