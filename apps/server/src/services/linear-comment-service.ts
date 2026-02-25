/**
 * Linear Comment Service
 *
 * Handles comment routing and PRD workflows:
 * - linear:comment:created → route comment to approval/instruction/followup handlers
 * - authority:pm-prd-ready → post PRD back to Linear issue as a comment
 * - createPRDReviewIssue → create a Linear issue for PRD human review
 */

import { createLogger } from '@protolabs-ai/utils';
import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { SyncGuards, CommentCreatedPayload } from './linear-sync-types.js';

const logger = createLogger('LinearCommentService');

export class LinearCommentService {
  private settingsService: SettingsService | null = null;
  private featureLoader: FeatureLoader | null = null;
  private guards!: SyncGuards;

  initialize(
    settingsService: SettingsService,
    featureLoader: FeatureLoader,
    guards: SyncGuards
  ): void {
    this.settingsService = settingsService;
    this.featureLoader = featureLoader;
    this.guards = guards;
  }

  // -------------------------------------------------------------------------
  // Event handlers (called by orchestrator)
  // -------------------------------------------------------------------------

  async handleCommentCreated(payload: CommentCreatedPayload): Promise<void> {
    logger.debug('Received linear:comment:created event', {
      commentId: payload.commentId,
      issueId: payload.issueId,
      userName: payload.user?.name,
    });
    await this.onCommentCreated(payload);
  }

  handlePrdReady(payload: { projectPath?: string; featureId?: string; prd?: string }): void {
    const { projectPath, featureId, prd } = payload;
    if (!projectPath || !featureId || !prd || !this.featureLoader) return;

    this.postPrdToLinear(projectPath, featureId, prd).catch((err) => {
      logger.warn(`Failed to post PRD to Linear for feature ${featureId}:`, err);
    });
  }

  // -------------------------------------------------------------------------
  // Comment routing
  // -------------------------------------------------------------------------

  private async onCommentCreated(payload: CommentCreatedPayload): Promise<void> {
    const { commentId, issueId, body, user } = payload;

    if (!issueId) {
      logger.debug(`Comment ${commentId} has no issueId, skipping`);
      return;
    }

    if (!this.featureLoader) {
      logger.error('FeatureLoader not initialized');
      return;
    }

    try {
      const projectPath = process.cwd();
      const feature = await this.featureLoader.findByLinearIssueId(projectPath, issueId);

      if (!feature) {
        logger.debug(`No feature found for Linear issue ${issueId}, skipping comment routing`);
        return;
      }

      logger.info(`Processing comment for feature ${feature.id}`, {
        commentId,
        issueId,
        userName: user?.name,
      });

      const commentLower = body.toLowerCase().trim();

      if (this.isApprovalComment(commentLower)) {
        logger.info(`Approval comment detected on issue ${issueId}`);
        if (this.guards.emitter) {
          this.guards.emitter.emit('linear:approval:detected', {
            issueId,
            title: feature.title,
            description: feature.description,
            approvalState: 'Comment Approval',
            detectedAt: new Date().toISOString(),
          });
        }
        return;
      }

      if (this.isInstructionComment(commentLower)) {
        logger.info(`Instruction comment detected for feature ${feature.id}`);
        const updatedDescription = `${feature.description}\n\n---\n\n**Additional Instructions from ${user?.name || 'Linear'}:**\n${body}`;
        await this.featureLoader.update(projectPath, feature.id, {
          description: updatedDescription,
        });

        if (this.guards.emitter) {
          this.guards.emitter.emit('linear:comment:instruction', {
            featureId: feature.id,
            issueId,
            commentBody: body,
            userName: user?.name,
          });
        }
        return;
      }

      // Default: treat as agent follow-up reply
      logger.info(`Treating comment as agent follow-up for feature ${feature.id}`);
      if (this.guards.emitter) {
        this.guards.emitter.emit('linear:comment:followup', {
          featureId: feature.id,
          projectPath,
          commentBody: body,
          userName: user?.name,
          issueId,
        });
      }
    } catch (error) {
      logger.error(`Failed to process comment ${commentId}:`, error);
    }
  }

  private isApprovalComment(commentLower: string): boolean {
    const approvalKeywords = [
      'approve',
      'approved',
      'looks good',
      'lgtm',
      'ship it',
      'go ahead',
      'proceed',
      'green light',
    ];
    return approvalKeywords.some((keyword) => commentLower.includes(keyword));
  }

  private isInstructionComment(commentLower: string): boolean {
    const instructionKeywords = [
      'please',
      'can you',
      'could you',
      'make sure',
      'also',
      'additionally',
      'instead',
      'change',
      'update',
      'modify',
      'add',
      'remove',
      'fix',
    ];
    return instructionKeywords.some((keyword) => commentLower.includes(keyword));
  }

  // -------------------------------------------------------------------------
  // PRD workflows
  // -------------------------------------------------------------------------

  private async postPrdToLinear(
    projectPath: string,
    featureId: string,
    prd: string
  ): Promise<void> {
    const feature = await this.featureLoader!.get(projectPath, featureId);
    if (!feature?.linearIssueId) {
      logger.debug(`Feature ${featureId} has no linearIssueId, skipping PRD comment`);
      return;
    }

    const MAX_PRD_LENGTH = 4000;
    const truncatedPrd =
      prd.length > MAX_PRD_LENGTH ? prd.slice(0, MAX_PRD_LENGTH) + '\n\n…(truncated)' : prd;
    const commentBody = `## PRD Generated\n\n${truncatedPrd}`;

    await this.addCommentToIssue(projectPath, feature.linearIssueId, commentBody);
    logger.info(`Posted PRD to Linear issue ${feature.linearIssueId} for feature ${featureId}`);
  }

  /**
   * Create a Linear issue for PRD review.
   * Called when a PRD needs human review before proceeding to planning.
   */
  async createPRDReviewIssue(
    projectPath: string,
    prdContent: string,
    reviewSummary: string,
    recommendedAction: string
  ): Promise<{ issueId: string; issueUrl: string }> {
    if (!this.settingsService) throw new Error('SettingsService not initialized');

    const settings = await this.settingsService.getProjectSettings(projectPath);
    const linearAccessToken = await this.resolveLinearToken(projectPath);
    const teamId = settings.integrations?.linear?.teamId;

    if (!teamId) throw new Error('No Linear team ID found in settings');

    const title = '🔍 PRD Review Required';
    const description = `## Review Summary
${reviewSummary}

## Recommended Action
${recommendedAction}

---

## PRD Content

${prdContent}

---

**Instructions:**
- Review the PRD content above
- If approved: Change status to **Approved** to trigger planning stage
- If changes needed: Change status to **Changes Requested** to return to PRD revision`;

    const stateId = await this.getWorkflowStateId(projectPath, teamId, 'In Review');

    const mutation = `
      mutation CreateIssue($teamId: String!, $title: String!, $description: String!, $stateId: String!, $priority: Int!) {
        issueCreate(input: { teamId: $teamId, title: $title, description: $description, stateId: $stateId, priority: $priority }) {
          success
          issue { id url }
        }
      }
    `;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.formatLinearAuth(linearAccessToken),
        },
        body: JSON.stringify({
          query: mutation,
          variables: { teamId, title, description, stateId, priority: 2 },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok)
        throw new Error(`Linear API error: ${response.status} ${response.statusText}`);

      const result = (await response.json()) as {
        data?: { issueCreate?: { success: boolean; issue?: { id: string; url: string } } };
        errors?: Array<{ message: string }>;
      };

      if (result.errors)
        throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
      if (!result.data?.issueCreate?.success || !result.data.issueCreate.issue) {
        throw new Error('Failed to create Linear PRD review issue');
      }

      logger.info(`Created PRD review issue in Linear: ${result.data.issueCreate.issue.id}`);
      return {
        issueId: result.data.issueCreate.issue.id,
        issueUrl: result.data.issueCreate.issue.url,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError')
        throw new Error('Linear API request timed out after 30s');
      throw error;
    }
  }

  async addCommentToIssue(
    projectPath: string,
    issueId: string,
    commentBody: string
  ): Promise<void> {
    if (!this.settingsService) throw new Error('SettingsService not initialized');

    const linearAccessToken = await this.resolveLinearToken(projectPath);

    const mutation = `
      mutation AddComment($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
          success
          comment { id body }
        }
      }
    `;

    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.formatLinearAuth(linearAccessToken),
      },
      body: JSON.stringify({ query: mutation, variables: { issueId, body: commentBody } }),
    });

    if (!response.ok)
      throw new Error(`Linear API error: ${response.status} ${response.statusText}`);

    const result = (await response.json()) as {
      data?: { commentCreate?: { success: boolean } };
      errors?: Array<{ message: string }>;
    };

    if (result.errors)
      throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
    if (!result.data?.commentCreate?.success)
      throw new Error('Failed to add comment to Linear issue');

    logger.info(`Added comment to Linear issue ${issueId}`);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async getWorkflowStateId(
    projectPath: string,
    teamId: string,
    stateName: string
  ): Promise<string> {
    if (!this.settingsService) throw new Error('SettingsService not initialized');

    const linearAccessToken = await this.resolveLinearToken(projectPath);

    const query = `
      query GetWorkflowStates($teamId: String!) {
        team(id: $teamId) { id states { nodes { id name } } }
      }
    `;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.formatLinearAuth(linearAccessToken),
        },
        body: JSON.stringify({ query, variables: { teamId } }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok)
        throw new Error(`Linear API error: ${response.status} ${response.statusText}`);

      const result = (await response.json()) as {
        data?: { team?: { states?: { nodes: Array<{ id: string; name: string }> } } };
        errors?: Array<{ message: string }>;
      };

      if (result.errors)
        throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);

      const states = result.data?.team?.states?.nodes || [];
      const state = states.find((s) => s.name === stateName);
      if (!state)
        throw new Error(`Workflow state "${stateName}" not found in Linear team ${teamId}`);
      return state.id;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError')
        throw new Error('Linear API request timed out after 30s');
      throw error;
    }
  }

  private async resolveLinearToken(projectPath: string): Promise<string> {
    if (!this.settingsService) throw new Error('SettingsService not initialized');

    const settings = await this.settingsService.getProjectSettings(projectPath);
    const linearConfig = settings.integrations?.linear;

    if (linearConfig?.agentToken) return linearConfig.agentToken;
    if (linearConfig?.apiKey) return linearConfig.apiKey;

    const envToken = process.env.LINEAR_API_KEY || process.env.LINEAR_API_TOKEN;
    if (envToken) return envToken;

    throw new Error('No Linear API token configured.');
  }

  private formatLinearAuth(token: string): string {
    return token.startsWith('lin_api_') ? token : `Bearer ${token}`;
  }
}
