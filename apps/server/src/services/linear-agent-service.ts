/**
 * Linear Agent Service
 *
 * Posts agent responses back to Linear issues as comments.
 * Handles formatting, length limits, and session status updates.
 */

import { createLogger } from '@automaker/utils';
import type { SettingsService } from './settings-service.js';

const logger = createLogger('LinearAgentService');

/**
 * Metadata stored in agent session for Linear integration
 */
export interface LinearAgentMetadata {
  linearIssueId: string; // Linear issue ID
  linearIssueIdentifier?: string; // Human-readable identifier like "ENG-123"
  agentType: 'jon' | 'ava'; // Agent type for routing
  teamId?: string; // Linear team ID
}

/**
 * LinearAgentService - Posts agent responses to Linear issues
 *
 * This service:
 * - Formats agent responses as markdown
 * - Posts comments to Linear issues via GraphQL
 * - Handles long responses with summary + detail
 * - Updates agent session status
 */
export class LinearAgentService {
  /** Maximum comment length before truncating (Linear soft limit) */
  private readonly MAX_COMMENT_LENGTH = 10000;

  /** Summary length for truncated responses */
  private readonly SUMMARY_LENGTH = 500;

  private settingsService?: SettingsService;
  private projectPath?: string;

  /**
   * Set settings service and project path for accessing OAuth token
   */
  setSettingsService(settingsService: SettingsService, projectPath: string): void {
    this.settingsService = settingsService;
    this.projectPath = projectPath;
  }

  /**
   * Process agent response and post to Linear issue
   */
  async processAgentResponse(params: {
    linearIssueId: string;
    linearIssueIdentifier?: string;
    agentType: 'jon' | 'ava';
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
    const agentLabel = agentType === 'jon' ? '🎯 Jon' : '🤖 Ava';

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
   * Post comment to Linear issue via GraphQL mutation
   *
   * Uses the OAuth token from settings to create a comment.
   */
  private async postLinearComment(issueId: string, body: string): Promise<void> {
    if (!this.settingsService || !this.projectPath) {
      throw new Error('LinearAgentService not initialized with settings service');
    }

    // Get OAuth token from settings
    const settings = await this.settingsService.getProjectSettings(this.projectPath);
    const linearAccessToken = settings.integrations?.linear?.agentToken;

    if (!linearAccessToken) {
      throw new Error('No Linear OAuth token found in settings');
    }

    // GraphQL mutation to create comment
    const mutation = `
      mutation CreateComment($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
          success
          comment {
            id
            body
          }
        }
      }
    `;

    const variables = {
      issueId,
      body,
    };

    // Call Linear GraphQL API
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${linearAccessToken}`,
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as {
      data?: { commentCreate?: { success: boolean } };
      errors?: Array<{ message: string }>;
    };

    if (result.errors) {
      throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    if (!result.data?.commentCreate?.success) {
      throw new Error('Failed to create Linear comment');
    }

    logger.info(`Successfully posted comment to Linear issue ${issueId}`);
  }
}
