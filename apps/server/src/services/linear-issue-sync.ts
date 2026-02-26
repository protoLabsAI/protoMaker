/**
 * Linear Issue Sync
 *
 * Handles push-direction sync of individual features to Linear issues:
 * - Feature creation  -> create Linear issue
 * - Status change     -> update Linear issue workflow state
 * - PR merge          -> comment + mark Done
 * - Dependency sync   -> create issue relations
 */

import { createLogger } from '@protolabs-ai/utils';
import type { Feature } from '@protolabs-ai/types';
import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { ProjectService } from './project-service.js';
import { LinearMCPClient } from './linear-mcp-client.js';
import { mapAutomakerStatusToLinear } from './linear-state-mapper.js';
import type { SyncMetadata, SyncGuards, FeatureEventPayload } from './linear-sync-types.js';

const logger = createLogger('LinearIssueSync');

export class LinearIssueSync {
  private settingsService: SettingsService | null = null;
  private featureLoader: FeatureLoader | null = null;
  private projectService: ProjectService | null = null;
  private guards!: SyncGuards;

  initialize(
    settingsService: SettingsService,
    featureLoader: FeatureLoader,
    guards: SyncGuards,
    projectService?: ProjectService
  ): void {
    this.settingsService = settingsService;
    this.featureLoader = featureLoader;
    this.guards = guards;
    this.projectService = projectService ?? null;
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  async onFeatureCreated(payload: FeatureEventPayload): Promise<void> {
    const { featureId, projectPath } = payload;

    if (!this.guards.shouldSync(featureId)) return;

    const syncEnabled = await this.guards.isProjectSyncEnabled(projectPath);
    if (!syncEnabled) {
      logger.debug(`Linear sync not enabled for project ${projectPath}`);
      return;
    }

    if (!this.featureLoader) {
      logger.error('FeatureLoader not initialized');
      return;
    }

    const startTime = Date.now();

    try {
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) {
        logger.error(`Feature ${featureId} not found`);
        return;
      }

      if (feature.linearIssueId) {
        logger.info(`Feature ${featureId} already has Linear issue ${feature.linearIssueId}`);
        return;
      }

      this.guards.markSyncing(featureId);

      const issueResult = await this.createLinearIssue(projectPath, feature);

      await this.featureLoader.update(projectPath, featureId, {
        linearIssueId: issueResult.issueId,
        linearIssueUrl: issueResult.issueUrl,
      });

      await this.syncDependencies(projectPath, feature, issueResult.issueId);

      const metadata: SyncMetadata = {
        featureId,
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'success',
        linearIssueId: issueResult.issueId,
        syncCount: 1,
        syncSource: 'automaker',
        syncDirection: 'push',
      };
      this.guards.updateSyncMetadata(metadata);
      this.guards.recordOperation(featureId, 'push', 'success', Date.now() - startTime, false);

      if (this.guards.emitter) {
        this.guards.emitter.emit('linear:sync:completed', {
          featureId,
          direction: 'push',
          conflictDetected: false,
          timestamp: new Date().toISOString(),
        });
      }

      logger.info(
        `Successfully synced feature ${featureId} to Linear issue ${issueResult.issueId}`
      );
    } catch (error) {
      logger.error(`Failed to sync feature ${featureId} to Linear:`, error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.guards.recordOperation(
        featureId,
        'push',
        'error',
        Date.now() - startTime,
        false,
        errorMsg
      );

      const metadata: SyncMetadata = {
        featureId,
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'error',
        errorMessage: errorMsg,
        syncCount: 0,
      };
      this.guards.updateSyncMetadata(metadata);

      if (this.guards.emitter) {
        this.guards.emitter.emit('linear:sync:error', {
          featureId,
          direction: 'push',
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      this.guards.unmarkSyncing(featureId);
    }
  }

  async onFeatureStatusChanged(payload: FeatureEventPayload): Promise<void> {
    const { featureId, projectPath, status } = payload;

    if (!this.guards.shouldSync(featureId)) return;

    const syncEnabled = await this.guards.isProjectSyncEnabled(projectPath);
    if (!syncEnabled) {
      logger.debug(`Linear sync not enabled for project ${projectPath}`);
      return;
    }

    if (!this.settingsService) {
      logger.error('SettingsService not initialized');
      return;
    }

    const settings = await this.settingsService.getProjectSettings(projectPath);
    if (settings.integrations?.linear?.syncOnStatusChange === false) {
      logger.debug(`Status change sync disabled for project ${projectPath}`);
      return;
    }

    if (!this.featureLoader) {
      logger.error('FeatureLoader not initialized');
      return;
    }

    const startTime = Date.now();

    try {
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) {
        logger.error(`Feature ${featureId} not found`);
        return;
      }

      if (!feature.linearIssueId) {
        logger.debug(`Feature ${featureId} has no Linear issue ID, skipping status sync`);
        return;
      }

      this.guards.markSyncing(featureId);

      const lastMetadata = this.guards.getSyncMetadata(featureId);
      if (lastMetadata?.linearIssueId === feature.linearIssueId) {
        const currentLinearState = await this.getIssueState(projectPath, feature.linearIssueId);
        const newLinearState = mapAutomakerStatusToLinear(status || feature.status || 'backlog');

        if (currentLinearState === newLinearState) {
          logger.debug(`Status unchanged for feature ${featureId}, skipping sync`);
          return;
        }
      }

      await this.updateIssueStatus(
        projectPath,
        feature.linearIssueId,
        status || feature.status || 'backlog'
      );

      const existingMetadata = this.guards.getSyncMetadata(featureId);
      const metadata: SyncMetadata = {
        featureId,
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'success',
        linearIssueId: feature.linearIssueId,
        syncCount: (existingMetadata?.syncCount || 0) + 1,
        syncSource: 'automaker',
        syncDirection: 'push',
      };
      this.guards.updateSyncMetadata(metadata);
      this.guards.recordOperation(featureId, 'push', 'success', Date.now() - startTime, false);

      if (this.guards.emitter) {
        this.guards.emitter.emit('linear:sync:completed', {
          featureId,
          direction: 'push',
          conflictDetected: false,
          timestamp: new Date().toISOString(),
        });
      }

      logger.info(
        `Successfully synced status change for feature ${featureId} to Linear issue ${feature.linearIssueId}`
      );
    } catch (error) {
      logger.error(`Failed to sync status change for feature ${featureId}:`, error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.guards.recordOperation(
        featureId,
        'push',
        'error',
        Date.now() - startTime,
        false,
        errorMsg
      );

      const metadata: SyncMetadata = {
        featureId,
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'error',
        errorMessage: errorMsg,
        syncCount: 0,
      };
      this.guards.updateSyncMetadata(metadata);

      if (this.guards.emitter) {
        this.guards.emitter.emit('linear:sync:error', {
          featureId,
          direction: 'push',
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      this.guards.unmarkSyncing(featureId);
    }
  }

  async onFeatureDeleted(payload: FeatureEventPayload): Promise<void> {
    const { featureId, projectPath } = payload;
    const feature = payload.feature;

    // Guard: skip if feature has no linked Linear issue
    if (!feature?.linearIssueId) return;

    if (!this.guards.shouldSync(featureId)) return;

    const syncEnabled = await this.guards.isProjectSyncEnabled(projectPath);
    if (!syncEnabled) {
      logger.debug(`Linear sync not enabled for project ${projectPath}`);
      return;
    }

    if (!this.settingsService) {
      logger.error('SettingsService not initialized');
      return;
    }

    this.guards.markSyncing(featureId);
    const startTime = Date.now();

    try {
      const settings = await this.settingsService.getProjectSettings(projectPath);
      const teamId = settings.integrations?.linear?.teamId;

      if (teamId) {
        try {
          const canceledStateId = await this.getWorkflowStateId(projectPath, teamId, 'Canceled');
          const linearAccessToken = await this.resolveLinearToken(projectPath);

          const mutation = `
            mutation UpdateIssue($id: String!, $stateId: String!) {
              issueUpdate(id: $id, input: { stateId: $stateId }) {
                success
                issue { id state { name } }
              }
            }
          `;

          const variables = { id: feature.linearIssueId, stateId: canceledStateId };
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);

          try {
            const response = await fetch('https://api.linear.app/graphql', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: this.formatLinearAuth(linearAccessToken),
              },
              body: JSON.stringify({ query: mutation, variables }),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
              throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
            }

            const result = (await response.json()) as {
              data?: {
                issueUpdate?: {
                  success: boolean;
                  issue?: { id: string; state?: { name: string } };
                };
              };
              errors?: Array<{ message: string }>;
            };

            if (result.errors) {
              throw new Error(
                `Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`
              );
            }

            if (!result.data?.issueUpdate?.success) {
              throw new Error('Failed to update Linear issue status');
            }

            logger.info(`Moved Linear issue ${feature.linearIssueId} to Canceled`);
          } catch (err) {
            clearTimeout(timeoutId);
            throw err;
          }
        } catch (err) {
          logger.warn(
            `[LinearIssueSync] No 'Canceled' state found or failed to update issue ${feature.linearIssueId}; skipping state change`
          );
        }
      } else {
        logger.warn(
          `[LinearIssueSync] No team ID configured for project ${projectPath}; skipping state change`
        );
      }

      await this.addCommentToIssue(
        projectPath,
        feature.linearIssueId,
        'Feature was deleted from the Automaker board.'
      );

      this.guards.recordOperation(featureId, 'push', 'success', Date.now() - startTime, false);

      logger.info(
        `Successfully synced deletion for feature ${featureId} to Linear issue ${feature.linearIssueId}`
      );
    } catch (error) {
      logger.error(`[LinearIssueSync] Failed to sync deletion for ${featureId}:`, error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.guards.recordOperation(
        featureId,
        'push',
        'error',
        Date.now() - startTime,
        false,
        errorMsg
      );
    } finally {
      this.guards.unmarkSyncing(featureId);
    }
  }

  async onPRMerged(payload: FeatureEventPayload): Promise<void> {
    const { featureId, projectPath, prUrl, prNumber, mergedBy } = payload;

    if (!this.guards.shouldSync(featureId)) return;

    const syncEnabled = await this.guards.isProjectSyncEnabled(projectPath);
    if (!syncEnabled) {
      logger.debug(`Linear sync not enabled for project ${projectPath}`);
      return;
    }

    if (!this.settingsService) {
      logger.error('SettingsService not initialized');
      return;
    }

    const settings = await this.settingsService.getProjectSettings(projectPath);
    if (settings.integrations?.linear?.commentOnCompletion === false) {
      logger.debug(`Comment on completion disabled for project ${projectPath}`);
      return;
    }

    if (!this.featureLoader) {
      logger.error('FeatureLoader not initialized');
      return;
    }

    this.guards.markSyncing(featureId);
    const startTime = Date.now();

    try {
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) {
        logger.error(`Feature ${featureId} not found`);
        return;
      }

      if (!feature.linearIssueId) {
        logger.debug(`Feature ${featureId} has no Linear issue ID, skipping PR merge sync`);
        return;
      }

      const agentName = mergedBy || 'agent';
      const prLink = prUrl && prNumber ? `[#${prNumber}](${prUrl})` : prUrl || `#${prNumber}`;
      const timestamp = new Date().toISOString();
      const commentBody = `✅ PR merged: ${prLink} by ${agentName}. Feature complete.`;

      await this.addCommentToIssue(projectPath, feature.linearIssueId, commentBody);

      const currentState = await this.getIssueState(projectPath, feature.linearIssueId);
      if (currentState !== 'Done') {
        await this.updateIssueStatus(projectPath, feature.linearIssueId, 'done');
      }

      const existingMetadata = this.guards.getSyncMetadata(featureId);
      const metadata: SyncMetadata = {
        featureId,
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'success',
        linearIssueId: feature.linearIssueId,
        syncCount: (existingMetadata?.syncCount || 0) + 1,
        syncSource: 'automaker',
        syncDirection: 'push',
      };
      this.guards.updateSyncMetadata(metadata);
      this.guards.recordOperation(featureId, 'push', 'success', Date.now() - startTime, false);

      if (this.guards.emitter) {
        this.guards.emitter.emit('linear:sync:completed', {
          featureId,
          direction: 'push',
          conflictDetected: false,
          timestamp,
        });
      }

      logger.info(
        `Successfully synced PR merge for feature ${featureId} to Linear issue ${feature.linearIssueId}`
      );
    } catch (error) {
      logger.error(`Failed to sync PR merge for feature ${featureId}:`, error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.guards.recordOperation(
        featureId,
        'push',
        'error',
        Date.now() - startTime,
        false,
        errorMsg
      );

      const metadata: SyncMetadata = {
        featureId,
        lastSyncTimestamp: Date.now(),
        lastSyncStatus: 'error',
        errorMessage: errorMsg,
        syncCount: 0,
      };
      this.guards.updateSyncMetadata(metadata);

      if (this.guards.emitter) {
        this.guards.emitter.emit('linear:sync:error', {
          featureId,
          direction: 'push',
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
      }
    } finally {
      this.guards.unmarkSyncing(featureId);
    }
  }

  // -------------------------------------------------------------------------
  // Linear API helpers
  // -------------------------------------------------------------------------

  private async resolveLinearToken(projectPath: string): Promise<string> {
    if (!this.settingsService) throw new Error('SettingsService not initialized');

    const settings = await this.settingsService.getProjectSettings(projectPath);
    const linearConfig = settings.integrations?.linear;

    if (linearConfig?.agentToken) return linearConfig.agentToken;
    if (linearConfig?.apiKey) return linearConfig.apiKey;

    const envToken = process.env.LINEAR_API_KEY || process.env.LINEAR_API_TOKEN;
    if (envToken) return envToken;

    throw new Error(
      'No Linear API token configured. Set agentToken (OAuth), apiKey (settings), or LINEAR_API_KEY/LINEAR_API_TOKEN (env var).'
    );
  }

  private formatLinearAuth(token: string): string {
    return token.startsWith('lin_api_') ? token : `Bearer ${token}`;
  }

  async formatIssueDescription(projectPath: string, feature: Feature): Promise<string> {
    const sections: string[] = [];

    sections.push(feature.description || 'No description provided');

    if (feature.prdMetadata) {
      sections.push('\n---\n## 📋 PRD Context');

      if (this.projectService && feature.projectSlug) {
        try {
          const project = await this.projectService.getProject(projectPath, feature.projectSlug);
          if (project?.prd) {
            const { prd } = project;
            sections.push('\n### Situation');
            sections.push(prd.situation || 'N/A');
            sections.push('\n### Problem');
            sections.push(prd.problem || 'N/A');
            sections.push('\n### Approach');
            sections.push(prd.approach || 'N/A');
            sections.push('\n### Results');
            sections.push(prd.results || 'N/A');
            sections.push('\n### Constraints');
            sections.push(prd.constraints || 'N/A');
          }
        } catch (error) {
          logger.debug(
            `Could not fetch project PRD: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    }

    if (feature.milestoneSlug && this.projectService && feature.projectSlug) {
      try {
        const project = await this.projectService.getProject(projectPath, feature.projectSlug);
        const milestone = project?.milestones?.find((m) => m.slug === feature.milestoneSlug);
        if (milestone) {
          sections.push('\n---\n## 🎯 Milestone Context');
          sections.push(`**Milestone:** ${milestone.title}`);
          sections.push(`**Description:** ${milestone.description}`);
          sections.push(`**Status:** ${milestone.status}`);
          if (milestone.dependencies && milestone.dependencies.length > 0) {
            sections.push(`**Dependencies:** ${milestone.dependencies.join(', ')}`);
          }
        }
      } catch (error) {
        logger.debug(
          `Could not fetch milestone context: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    if (this.projectService && feature.projectSlug && feature.milestoneSlug) {
      try {
        const project = await this.projectService.getProject(projectPath, feature.projectSlug);
        const milestone = project?.milestones?.find((m) => m.slug === feature.milestoneSlug);
        const phase = milestone?.phases?.find((p) => p.featureId === feature.id);

        if (phase?.acceptanceCriteria && phase.acceptanceCriteria.length > 0) {
          sections.push('\n---\n## ✅ Acceptance Criteria');
          phase.acceptanceCriteria.forEach((criterion) => {
            sections.push(`- [ ] ${criterion}`);
          });
        }
      } catch (error) {
        logger.debug(
          `Could not fetch acceptance criteria: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    if (this.projectService && feature.projectSlug) {
      try {
        const project = await this.projectService.getProject(projectPath, feature.projectSlug);
        if (project?.reviewComments && project.reviewComments.length > 0) {
          sections.push('\n---\n## 🔍 Review Verdicts');

          const avaComments = project.reviewComments.filter((c) => c.author === 'ava');
          const jonComments = project.reviewComments.filter((c) => c.author === 'jon');

          if (avaComments.length > 0) {
            sections.push('\n### Ava (Operational Review)');
            avaComments.forEach((comment) => {
              const emoji =
                comment.type === 'approval'
                  ? '✅'
                  : comment.type === 'change-requested'
                    ? '⚠️'
                    : '💡';
              sections.push(
                `${emoji} **${comment.type}** ${comment.section ? `(${comment.section})` : ''}: ${comment.content}`
              );
            });
          }

          if (jonComments.length > 0) {
            sections.push('\n### Jon (Market Review)');
            jonComments.forEach((comment) => {
              const emoji =
                comment.type === 'approval'
                  ? '✅'
                  : comment.type === 'change-requested'
                    ? '⚠️'
                    : '💡';
              sections.push(
                `${emoji} **${comment.type}** ${comment.section ? `(${comment.section})` : ''}: ${comment.content}`
              );
            });
          }
        }
      } catch (error) {
        logger.debug(
          `Could not fetch review verdicts: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    if (feature.costUsd !== undefined && feature.costUsd > 0) {
      sections.push('\n---\n## 💰 Estimated Cost');
      sections.push(`**Total Cost:** $${feature.costUsd.toFixed(4)} USD`);

      if (feature.executionHistory && feature.executionHistory.length > 0) {
        sections.push(`**Executions:** ${feature.executionHistory.length}`);
        const totalTokens = feature.executionHistory.reduce(
          (sum, exec) => sum + (exec.inputTokens || 0) + (exec.outputTokens || 0),
          0
        );
        sections.push(`**Total Tokens:** ${totalTokens.toLocaleString()}`);
      }
    }

    sections.push('\n---\n_Synced from Automaker_');
    return sections.join('\n');
  }

  private async createLinearIssue(
    projectPath: string,
    feature: Feature
  ): Promise<{ issueId: string; issueUrl: string }> {
    if (!this.settingsService) throw new Error('SettingsService not initialized');
    if (!this.featureLoader) throw new Error('FeatureLoader not initialized');

    const settings = await this.settingsService.getProjectSettings(projectPath);
    const linearAccessToken = await this.resolveLinearToken(projectPath);
    const teamId = settings.integrations?.linear?.teamId;

    if (!teamId) throw new Error('No Linear team ID found in settings');

    const linearPriority = feature.priority ?? 3;
    const title = feature.title || 'Untitled Feature';
    const description = await this.formatIssueDescription(projectPath, feature);

    let parentId: string | undefined;
    if (feature.epicId) {
      const parentFeature = await this.featureLoader.get(projectPath, feature.epicId);
      if (parentFeature?.linearIssueId) {
        parentId = parentFeature.linearIssueId;
        logger.debug(
          `Setting parentId ${parentId} for child feature with epicId ${feature.epicId}`
        );
      }
    }

    const mutation = `
      mutation CreateIssue($teamId: String!, $title: String!, $description: String!, $priority: Int!, $parentId: String) {
        issueCreate(input: { teamId: $teamId, title: $title, description: $description, priority: $priority, parentId: $parentId }) {
          success
          issue {
            id
            url
          }
        }
      }
    `;

    const variables = { teamId, title, description, priority: linearPriority, parentId };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.formatLinearAuth(linearAccessToken),
        },
        body: JSON.stringify({ query: mutation, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as {
        data?: { issueCreate?: { success: boolean; issue?: { id: string; url: string } } };
        errors?: Array<{ message: string }>;
      };

      if (result.errors) {
        throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
      }

      if (!result.data?.issueCreate?.success || !result.data.issueCreate.issue) {
        throw new Error('Failed to create Linear issue');
      }

      return {
        issueId: result.data.issueCreate.issue.id,
        issueUrl: result.data.issueCreate.issue.url,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Linear API request timed out after 30s');
      }
      throw error;
    }
  }

  async updateLinearIssue(projectPath: string, issueId: string, feature: Feature): Promise<void> {
    if (!this.settingsService) throw new Error('SettingsService not initialized');

    const linearAccessToken = await this.resolveLinearToken(projectPath);
    const description = await this.formatIssueDescription(projectPath, feature);
    const title = feature.title || 'Untitled Feature';
    const priority = feature.priority ?? 3;

    const mutation = `
      mutation UpdateIssue($id: String!, $title: String, $description: String, $priority: Int) {
        issueUpdate(id: $id, input: { title: $title, description: $description, priority: $priority }) {
          success
          issue { id url }
        }
      }
    `;

    const variables = { id: issueId, title, description, priority };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.formatLinearAuth(linearAccessToken),
        },
        body: JSON.stringify({ query: mutation, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as {
        data?: { issueUpdate?: { success: boolean; issue?: { id: string; url: string } } };
        errors?: Array<{ message: string }>;
      };

      if (result.errors) {
        throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
      }

      if (!result.data?.issueUpdate?.success) {
        throw new Error('Failed to update Linear issue');
      }

      logger.info(`Updated Linear issue ${issueId} with enhanced formatting`);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Linear API request timed out after 30s');
      }
      throw error;
    }
  }

  async getIssueState(projectPath: string, issueId: string): Promise<string> {
    if (!this.settingsService) throw new Error('SettingsService not initialized');

    const linearAccessToken = await this.resolveLinearToken(projectPath);

    const query = `
      query GetIssue($id: String!) {
        issue(id: $id) { id state { name } }
      }
    `;

    const variables = { id: issueId };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.formatLinearAuth(linearAccessToken),
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as {
        data?: { issue?: { state?: { name: string } } };
        errors?: Array<{ message: string }>;
      };

      if (result.errors) {
        throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
      }

      return result.data?.issue?.state?.name || 'Backlog';
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Linear API request timed out after 30s');
      }
      throw error;
    }
  }

  async updateIssueStatus(projectPath: string, issueId: string, status: string): Promise<void> {
    if (!this.settingsService) throw new Error('SettingsService not initialized');

    const settings = await this.settingsService.getProjectSettings(projectPath);
    const linearAccessToken = await this.resolveLinearToken(projectPath);
    const teamId = settings.integrations?.linear?.teamId;

    if (!teamId) throw new Error('No Linear team ID found in settings');

    const linearStateName = mapAutomakerStatusToLinear(status);
    const stateId = await this.getWorkflowStateId(projectPath, teamId, linearStateName);

    const mutation = `
      mutation UpdateIssue($id: String!, $stateId: String!) {
        issueUpdate(id: $id, input: { stateId: $stateId }) {
          success
          issue { id state { name } }
        }
      }
    `;

    const variables = { id: issueId, stateId };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.formatLinearAuth(linearAccessToken),
        },
        body: JSON.stringify({ query: mutation, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as {
        data?: {
          issueUpdate?: { success: boolean; issue?: { id: string; state?: { name: string } } };
        };
        errors?: Array<{ message: string }>;
      };

      if (result.errors) {
        throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
      }

      if (!result.data?.issueUpdate?.success) {
        throw new Error('Failed to update Linear issue status');
      }

      logger.info(`Updated Linear issue ${issueId} to state: ${linearStateName}`);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Linear API request timed out after 30s');
      }
      throw error;
    }
  }

  async getWorkflowStateId(
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

    const variables = { teamId };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.formatLinearAuth(linearAccessToken),
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as {
        data?: { team?: { states?: { nodes: Array<{ id: string; name: string }> } } };
        errors?: Array<{ message: string }>;
      };

      if (result.errors) {
        throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
      }

      const states = result.data?.team?.states?.nodes || [];
      const state = states.find((s) => s.name === stateName);

      if (!state) {
        throw new Error(`Workflow state "${stateName}" not found in Linear team ${teamId}`);
      }

      return state.id;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Linear API request timed out after 30s');
      }
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

    const variables = { issueId, body: commentBody };

    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.formatLinearAuth(linearAccessToken),
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
    }

    const result = (await response.json()) as {
      data?: { commentCreate?: { success: boolean; comment?: { id: string; body: string } } };
      errors?: Array<{ message: string }>;
    };

    if (result.errors) {
      throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    if (!result.data?.commentCreate?.success) {
      throw new Error('Failed to add comment to Linear issue');
    }

    logger.info(`Added comment to Linear issue ${issueId}`);
  }

  async syncDependencies(projectPath: string, feature: Feature, issueId: string): Promise<void> {
    if (!feature.dependencies || feature.dependencies.length === 0) {
      logger.debug(`Feature ${feature.id} has no dependencies to sync`);
      return;
    }

    if (!this.settingsService || !this.featureLoader) {
      logger.warn('SettingsService or FeatureLoader not initialized, skipping dependency sync');
      return;
    }

    try {
      const client = new LinearMCPClient(this.settingsService, projectPath);
      const existingRelations = await client.getIssueRelations(issueId);
      const existingRelatedIds = new Set(existingRelations.map((r) => r.id));

      let createdCount = 0;
      let skippedCount = 0;

      for (const dependencyId of feature.dependencies) {
        try {
          const dependencyFeature = await this.featureLoader.get(projectPath, dependencyId);

          if (!dependencyFeature) {
            logger.warn(`Dependency feature ${dependencyId} not found, skipping relation creation`);
            continue;
          }

          if (!dependencyFeature.linearIssueId) {
            logger.debug(
              `Dependency feature ${dependencyId} has no Linear issue ID yet, skipping relation`
            );
            continue;
          }

          if (existingRelatedIds.has(dependencyFeature.linearIssueId)) {
            logger.debug(
              `Relation already exists: ${issueId} → ${dependencyFeature.linearIssueId}, skipping`
            );
            skippedCount++;
            continue;
          }

          await client.createIssueRelation({
            issueId,
            relatedIssueId: dependencyFeature.linearIssueId,
            type: 'blocks',
          });
          createdCount++;
        } catch (error) {
          logger.warn(
            `Failed to create issue relation for dependency ${dependencyId}:`,
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
      }

      logger.info(
        `Synced dependencies for feature ${feature.id}: ${createdCount} created, ${skippedCount} skipped (duplicates)`
      );
    } catch (error) {
      logger.error(
        `Failed to sync dependencies for feature ${feature.id}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
}
