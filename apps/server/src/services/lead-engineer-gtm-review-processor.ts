/**
 * GTM Review Processor — Content Feature Review via Cindi
 *
 * Routes content features through Cindi (content specialist) for antagonistic review
 * instead of the standard PR-approval-based ReviewProcessor.
 *
 * Score >= 75 → MERGE (content approved)
 * Score < 75  → EXECUTE (revision required)
 */

import { createLogger } from '@protolabs-ai/utils';
import { DynamicAgentExecutor } from './dynamic-agent-executor.js';
import type { AgentFactoryService } from './agent-factory-service.js';
import type {
  ProcessorServiceContext,
  StateContext,
  StateProcessor,
  StateTransitionResult,
} from './lead-engineer-types.js';

const logger = createLogger('GtmReviewProcessor');

const GTM_REVIEW_SCORE_THRESHOLD = 75;

export class GtmReviewProcessor implements StateProcessor {
  private executor: DynamicAgentExecutor;

  constructor(
    private serviceContext: ProcessorServiceContext,
    private agentFactoryService: AgentFactoryService
  ) {
    this.executor = new DynamicAgentExecutor(serviceContext.events);
  }

  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[GTM REVIEW] Starting content review for feature: ${ctx.feature.id}`);
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    const cindiConfig = this.agentFactoryService.createFromTemplate('cindi', ctx.projectPath);
    const prompt = this.buildReviewPrompt(ctx);

    let result;
    try {
      result = await this.executor.execute(cindiConfig, { prompt });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[GTM REVIEW] Cindi review execution failed: ${errorMsg}`);
      ctx.escalationReason = `GTM review execution failed: ${errorMsg}`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: true,
        reason: ctx.escalationReason,
      };
    }

    if (!result.success) {
      logger.error(`[GTM REVIEW] Cindi review failed: ${result.error}`);
      ctx.escalationReason = `GTM review failed: ${result.error}`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: true,
        reason: ctx.escalationReason,
      };
    }

    const score = this.parseConsensusScore(result.output);
    logger.info(`[GTM REVIEW] Consensus score: ${score}`, {
      featureId: ctx.feature.id,
      threshold: GTM_REVIEW_SCORE_THRESHOLD,
    });

    if (score >= GTM_REVIEW_SCORE_THRESHOLD) {
      return {
        nextState: 'MERGE',
        shouldContinue: true,
        reason: `GTM review passed (score: ${score})`,
      };
    }

    // Score below threshold — send back to EXECUTE for revision
    ctx.reviewFeedback = this.extractFeedback(result.output);
    logger.info(`[GTM REVIEW] Score below threshold, requesting revision`, {
      featureId: ctx.feature.id,
      score,
    });

    return {
      nextState: 'EXECUTE',
      shouldContinue: true,
      reason: `GTM review requires revision (score: ${score})`,
      context: { remediation: true },
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[GTM REVIEW] Content review phase completed');
  }

  private buildReviewPrompt(ctx: StateContext): string {
    const { feature } = ctx;
    return `You are Cindi, a content specialist and antagonistic reviewer for protoLabs.

Review this content feature for quality, clarity, accuracy, and audience fit.

**Feature Title:** ${feature.title}

**Feature Description:** ${feature.description || '(no description)'}
${ctx.reviewFeedback ? `\n**Previous Feedback:**\n${ctx.reviewFeedback}\n` : ''}
---

**Your Task:**

Perform an antagonistic review of this content feature. Assess:

1. **Clarity**: Is the content clear and well-structured?
2. **Accuracy**: Is the information accurate and well-researched?
3. **Audience Fit**: Does it serve the target audience effectively?
4. **Quality**: Is the writing quality high enough for publication?
5. **Completeness**: Does it cover the topic adequately?

**Output Format:**

## Review

[Your detailed review]

## Concerns

- [List specific concerns]

## Recommendations

- [List actionable recommendations]

## Consensus Score

SCORE: [0-100]

(0 = completely unacceptable, 100 = publication-ready)

Be candid. A score >= 75 means the content is ready to merge. Below 75 means it needs revision.`;
  }

  /**
   * Parse consensus score from Cindi's review output.
   * Looks for "SCORE: N" pattern.
   */
  private parseConsensusScore(output: string): number {
    const match = output.match(/SCORE:\s*(\d+)/i);
    if (match) {
      const score = parseInt(match[1], 10);
      if (!isNaN(score) && score >= 0 && score <= 100) {
        return score;
      }
    }
    // Default to 0 if no score found — conservative, requires revision
    logger.warn('[GTM REVIEW] Could not parse consensus score from output, defaulting to 0');
    return 0;
  }

  /**
   * Extract feedback text from review output for the next execution cycle.
   */
  private extractFeedback(output: string): string {
    const reviewMatch = output.match(/## Review\s+([\s\S]*?)(?=##|$)/);
    const concernsMatch = output.match(/## Concerns\s+([\s\S]*?)(?=##|$)/);
    const recsMatch = output.match(/## Recommendations\s+([\s\S]*?)(?=##|$)/);

    const parts: string[] = [];
    if (reviewMatch) parts.push(`**Review:**\n${reviewMatch[1].trim()}`);
    if (concernsMatch) parts.push(`**Concerns:**\n${concernsMatch[1].trim()}`);
    if (recsMatch) parts.push(`**Recommendations:**\n${recsMatch[1].trim()}`);

    return parts.join('\n\n') || output.slice(0, 2000);
  }
}
