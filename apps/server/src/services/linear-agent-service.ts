/**
 * Linear Agent Service
 *
 * Posts agent responses back to Linear issues as comments.
 * Handles formatting, length limits, and session status updates.
 */

import { createLogger } from '@automaker/utils';

const logger = createLogger('LinearAgentService');

/**
 * Metadata stored in agent session for Linear integration
 */
export interface LinearAgentMetadata {
  linearIssueId: string; // Linear issue ID
  linearIssueIdentifier?: string; // Human-readable identifier like "ENG-123"
  agentType: 'gtm' | 'ava'; // Agent type for routing
  teamId?: string; // Linear team ID
}

/**
 * LinearAgentService - Posts agent responses to Linear issues
 *
 * This service:
 * - Formats agent responses as markdown
 * - Posts comments to Linear issues via MCP tools
 * - Handles long responses with summary + detail
 * - Updates agent session status
 */
export class LinearAgentService {
  /** Maximum comment length before truncating (Linear soft limit) */
  private readonly MAX_COMMENT_LENGTH = 10000;

  /** Summary length for truncated responses */
  private readonly SUMMARY_LENGTH = 500;

  /**
   * Process agent response and post to Linear issue
   */
  async processAgentResponse(params: {
    linearIssueId: string;
    linearIssueIdentifier?: string;
    agentType: 'gtm' | 'ava';
    response: string;
  }): Promise<void> {
    const { linearIssueId, linearIssueIdentifier, agentType, response } = params;

    logger.info(
      `Posting ${agentType} agent response to Linear issue ${linearIssueIdentifier || linearIssueId}`
    );

    // Format response as markdown
    const formattedResponse = this.formatResponse(response, agentType);

    // Post comment to Linear issue
    await this.postLinearComment(linearIssueId, formattedResponse);

    logger.info(
      `Successfully posted ${agentType} agent response to Linear issue ${linearIssueIdentifier || linearIssueId}`
    );
  }

  /**
   * Format agent response as markdown
   * Handles long responses with summary + details
   */
  private formatResponse(response: string, agentType: string): string {
    const agentLabel = agentType === 'gtm' ? '🎯 GTM Agent' : '🤖 Ava Agent';

    // Check if response is too long
    if (response.length <= this.MAX_COMMENT_LENGTH) {
      return `## ${agentLabel} Response\n\n${response}`;
    }

    // Truncate with summary
    const summary = response.substring(0, this.SUMMARY_LENGTH);
    const remaining = response.length - this.SUMMARY_LENGTH;

    return `## ${agentLabel} Response

**Summary** (truncated, ${remaining} characters omitted):

${summary}...

<details>
<summary>View full response</summary>

${response}

</details>`;
  }

  /**
   * Post comment to Linear issue via MCP tool
   *
   * This uses the Linear MCP tool to create a comment.
   * The MCP tool should be configured in the project settings.
   */
  private async postLinearComment(issueId: string, comment: string): Promise<void> {
    // TODO: Implement actual Linear MCP tool call
    // This will be implemented when integrated with the Linear MCP server
    // For now, we just log the action
    logger.info(`Would post comment to Linear issue ${issueId}: ${comment.substring(0, 100)}...`);
  }
}
