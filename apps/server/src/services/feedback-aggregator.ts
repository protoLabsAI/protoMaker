/**
 * Feedback Aggregator - Build agent continuation prompts from PR review feedback
 *
 * Constructs structured prompts that guide agents through:
 * - Addressing human and bot review feedback
 * - Evaluating per-thread feedback decisions (accept/deny)
 * - Fixing CI check failures
 */

import { createLogger } from '@protolabs-ai/utils';
import type { FeatureLoader } from './feature-loader.js';
import type { PRReviewInfo, ThreadFeedbackItem } from './pr-status-checker.js';

const logger = createLogger('FeedbackAggregator');

const MAX_AGENT_OUTPUT_LENGTH = 50_000;
const KEEP_AGENT_OUTPUT_LENGTH = 40_000;

export class FeedbackAggregator {
  constructor(private readonly featureLoader: FeatureLoader) {}

  /**
   * Build a simple continuation prompt from plain feedback text.
   * Used for COMMENTED reviews with extracted feedback text.
   */
  async buildFeedbackPrompt(
    feedback: string,
    prNumber: number,
    iterationCount: number,
    featureId: string,
    projectPath: string
  ): Promise<string> {
    const previousContext = await this.loadPreviousContext(projectPath, featureId, iterationCount);

    return `${previousContext}## PR Review Feedback - Iteration ${iterationCount}

Your pull request #${prNumber} has received review feedback. Please address the following issues:

${feedback}

**Important Instructions:**
- Only fix the issues mentioned in the review above
- Do not refactor or change unrelated code
- Commit your fixes to the same branch (the worktree is already set up)
- The fixes will be pushed to the existing PR #${prNumber}
- After fixing, verify the changes work correctly

This is iteration ${iterationCount} of the review cycle. Focus on addressing the feedback precisely.`;
  }

  /**
   * Build a structured remediation prompt with per-thread evaluation requirements.
   * Instructs the agent to evaluate each feedback thread before making changes.
   */
  async buildRemediationPrompt(
    threads: ThreadFeedbackItem[],
    prNumber: number,
    iterationCount: number,
    featureId: string,
    projectPath: string
  ): Promise<string> {
    const previousContext = await this.loadPreviousContext(projectPath, featureId, iterationCount);

    const humanThreads = threads.filter((t) => !t.isBot);
    const botThreads = threads.filter((t) => t.isBot);

    let threadSection = '## Review Threads to Evaluate\n\n';
    threadSection +=
      '**IMPORTANT**: You MUST evaluate each thread below and output your decision in the exact format shown.\n\n';

    if (humanThreads.length > 0) {
      threadSection += '### Human Review Feedback (Higher Priority)\n\n';
      threadSection +=
        'Human feedback should be given higher weight as it reflects team standards and context.\n\n';
      for (const thread of humanThreads) {
        threadSection += this.formatThreadForEvaluation(thread);
      }
    }

    if (botThreads.length > 0) {
      threadSection += '### CodeRabbit/Bot Feedback\n\n';
      threadSection +=
        'Bot feedback may be useful but should be critically evaluated. Deny if it contradicts project standards.\n\n';
      for (const thread of botThreads) {
        threadSection += this.formatThreadForEvaluation(thread);
      }
    }

    const evaluationInstructions = `## Evaluation Instructions

For EACH thread above, you MUST output your decision using this exact XML format:

\`\`\`xml
<thread_evaluation>
  <thread_id>THREAD_ID_HERE</thread_id>
  <decision>accept|deny</decision>
  <reasoning>Your explanation for why you accept or deny this feedback</reasoning>
  <planned_fix>If accepted, describe what fix you will implement</planned_fix>
</thread_evaluation>
\`\`\`

### Evaluation Criteria

Ask yourself these questions for each thread:
1. **Correctness**: Does this feedback improve code correctness or fix a real bug?
2. **Project Alignment**: Is it aligned with project conventions and standards?
3. **Effort Justified**: Is the implementation effort justified by the improvement?
4. **Risk Assessment**: Could implementing this introduce regression or new issues?

### Severity-Specific Guidance

**CRITICAL Threads:**
- These represent serious issues (security, data loss, major bugs)
- Give strong weight to accepting these unless there's clear evidence of error
- Denying critical feedback triggers emergency escalation to humans
- Only deny if you have high confidence the feedback is incorrect or harmful

**WARNING Threads:**
- These represent important but non-critical issues
- Use balanced judgment - accept if beneficial, deny if not aligned with project goals
- Denying warning feedback triggers high-priority escalation for review

**SUGGESTION Threads:**
- These are recommendations, not requirements
- Feel free to deny if they don't align with project patterns or add little value
- Lower escalation priority for denials

### When to DENY feedback

You may DENY feedback that:
- Is purely stylistic preference without substance
- Contradicts established project standards or patterns
- Would introduce regression or break existing functionality
- Requires disproportionate effort for minimal benefit
- Is already addressed in your previous work
- **IMPORTANT**: Be extra cautious when denying CRITICAL severity feedback

### Process

1. First, output ALL your \`<thread_evaluation>\` blocks
2. Then, implement the fixes for threads you ACCEPTED
3. Commit your changes to the same branch
4. The fixes will be pushed to PR #${prNumber}
`;

    return `${previousContext}## PR Review Feedback - Iteration ${iterationCount}

Your pull request #${prNumber} has received review feedback that requires your critical evaluation.

${threadSection}

${evaluationInstructions}

This is iteration ${iterationCount} of the review cycle. Be judicious - not all feedback needs to be accepted.`;
  }

  /**
   * Build a continuation prompt for fixing CI failures.
   */
  async buildCIFixPrompt(
    prNumber: number,
    iteration: number,
    failedChecks: Array<{ name: string; conclusion: string; output: string }>,
    featureId: string,
    projectPath: string
  ): Promise<string> {
    const previousContext = await this.loadPreviousContext(projectPath, featureId, iteration);

    const checksDetails =
      failedChecks.length > 0
        ? failedChecks
            .map((check) => `### ${check.name}\n**Status:** ${check.conclusion}\n\n${check.output}`)
            .join('\n\n')
        : 'Check details not available. Run CI checks locally to debug.';

    return `${previousContext}## CI Failure - Fix Required (Iteration ${iteration})

Your pull request #${prNumber} has CI check failures. Please fix the following issues:

${checksDetails}

**Important Instructions:**
- Fix only the CI failures mentioned above
- Run tests locally to verify the fixes work
- Commit your fixes to the same branch (worktree is already set up)
- The fixes will be pushed to the existing PR #${prNumber}
- After fixing, CI will run again automatically

This is CI fix iteration ${iteration}.`;
  }

  /**
   * Build a structured thread feedback prompt from review threads.
   * Groups threads by human/bot and formats them with severity info.
   */
  buildThreadFeedbackPrompt(prNumber: number, threads: ThreadFeedbackItem[]): string {
    if (threads.length === 0) {
      return 'No review threads found.';
    }

    const botThreads = threads.filter((t) => t.isBot);
    const humanThreads = threads.filter((t) => !t.isBot);

    let prompt = '## Review Thread Feedback\n\n';

    if (humanThreads.length > 0) {
      prompt += '### Human Review Feedback\n\n';
      humanThreads.forEach((item, idx) => {
        prompt += this.formatFeedbackItem(idx + 1, item);
      });
      prompt += '\n';
    }

    if (botThreads.length > 0) {
      prompt += '### CodeRabbit Review Feedback\n\n';
      botThreads.forEach((item, idx) => {
        prompt += this.formatFeedbackItem(idx + 1, item);
      });
      prompt += '\n';
    }

    prompt += `\n**Instructions:**
For each item above, respond with either:
- "Accept #N" to implement the suggested fix
- "Deny #N" with a brief justification

After making your decisions, implement the accepted fixes.`;

    return prompt;
  }

  /**
   * Format a thread for the evaluation prompt (XML decision output format).
   */
  formatThreadForEvaluation(thread: ThreadFeedbackItem): string {
    const severity = thread.severity.toUpperCase();
    const location = thread.location
      ? `${thread.location.path}${thread.location.line ? `:${thread.location.line}` : ''}`
      : 'general';
    const category = thread.category ? ` [${thread.category}]` : '';
    const fix = thread.suggestedFix ? `\n   **Suggested Fix:** ${thread.suggestedFix}` : '';

    return `**Thread ID:** \`${thread.threadId}\`
**Severity:** ${severity}${category}
**Location:** ${location}
**Feedback:** ${thread.message}${fix}

---

`;
  }

  /**
   * Format a thread as a numbered feedback item.
   */
  formatFeedbackItem(number: number, item: ThreadFeedbackItem): string {
    const severity = item.severity.toUpperCase();
    const location = item.location
      ? `${item.location.path}${item.location.line ? `:${item.location.line}` : ''}`
      : 'general';
    const category = item.category ? ` [${item.category}]` : '';
    const fix = item.suggestedFix ? `\n   **Suggested Fix:** ${item.suggestedFix}` : '';

    return `${number}. **[${severity}]${category}** ${location}
   ${item.message}${fix}
   Thread ID: \`${item.threadId}\`

`;
  }

  /**
   * Analyze a COMMENTED review for actionable content.
   * Returns true if the review contains items that require agent remediation.
   */
  isCommentedReviewActionable(reviewInfo: PRReviewInfo): boolean {
    const codeRabbitComments = reviewInfo.comments.filter((c) =>
      c.author.toLowerCase().includes('coderabbit')
    );

    if (codeRabbitComments.length > 0) {
      const actionableCodeRabbit = codeRabbitComments.some((c) => {
        const body = c.body.toLowerCase();
        if (body.includes('walk-through') || body.includes('summary')) return false;
        return (
          body.includes('severity:') ||
          body.includes('suggestion:') ||
          body.includes('🚨') ||
          body.includes('⚠️') ||
          body.includes('```')
        );
      });

      if (actionableCodeRabbit) {
        logger.info('COMMENTED review contains actionable CodeRabbit suggestions');
        return true;
      }
    }

    const humanComments = reviewInfo.comments.filter(
      (c) =>
        !c.author.toLowerCase().includes('coderabbit') && !c.author.toLowerCase().includes('bot')
    );

    if (humanComments.length > 0) {
      const actionableHuman = humanComments.some((c) => {
        const body = c.body.toLowerCase();
        return (
          body.includes('should') ||
          body.includes('must') ||
          body.includes('needs') ||
          body.includes('fix') ||
          body.includes('change') ||
          body.includes('update') ||
          body.includes('remove') ||
          body.includes('add')
        );
      });

      if (actionableHuman) {
        logger.info('COMMENTED review contains actionable human feedback');
        return true;
      }
    }

    logger.info('COMMENTED review has no actionable content');
    return false;
  }

  private async loadPreviousContext(
    projectPath: string,
    featureId: string,
    iterationCount: number
  ): Promise<string> {
    try {
      const agentOutput = await this.featureLoader.getAgentOutput(projectPath, featureId);
      if (!agentOutput) return '';

      let truncatedOutput = agentOutput;
      if (agentOutput.length > MAX_AGENT_OUTPUT_LENGTH) {
        truncatedOutput = agentOutput.slice(-KEEP_AGENT_OUTPUT_LENGTH);
        logger.info(
          `Truncated agent output from ${agentOutput.length} to ${KEEP_AGENT_OUTPUT_LENGTH} chars for ${featureId}`
        );
      }

      return `## Your Previous Work (Iteration ${iterationCount - 1})

Below is the output from your previous work on this feature. Review it to understand what you've already done:

${truncatedOutput}

---

`;
    } catch {
      logger.debug(`No previous agent output found for ${featureId} (likely first iteration)`);
      return '';
    }
  }
}
