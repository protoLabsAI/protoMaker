/**
 * Linear Webhook Handler
 *
 * Handles inbound (pull) sync from Linear to Automaker:
 * - Linear issue updated externally → sync status/title/priority/dependencies to feature
 * - Batches all field changes into a single feature update
 * - Loop prevention: skips if last sync was from Automaker within debounce window
 */

import { createLogger } from '@protolabs-ai/utils';
import type { Feature } from '@protolabs-ai/types';
import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import { mapLinearStateToAutomaker } from './linear-state-mapper.js';
import type { SyncGuards, SyncMetadata } from './linear-sync-types.js';
import { DEBOUNCE_WINDOW_MS, CONFLICT_DETECTION_WINDOW_MS } from './linear-sync-types.js';

const logger = createLogger('LinearWebhookHandler');

export class LinearWebhookHandler {
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

  /**
   * Handle Linear issue updates (inbound sync from Linear to Automaker).
   * Syncs status, priority, title, and dependency changes in a single batched update.
   */
  async onLinearIssueUpdated(
    linearIssueId: string,
    newStateName: string,
    projectPath: string,
    options?: { title?: string; priority?: number; dueDate?: string }
  ): Promise<void> {
    const startTime = Date.now();
    let featureId = 'unknown';

    try {
      if (!this.featureLoader) {
        logger.error('FeatureLoader not initialized');
        return;
      }

      const feature = await this.featureLoader.findByLinearIssueId(projectPath, linearIssueId);
      if (!feature) {
        logger.warn(`No feature found for Linear issue ${linearIssueId}, skipping sync`);
        return;
      }

      featureId = feature.id;

      if (!this.guards.shouldSync(featureId)) return;

      const syncEnabled = await this.guards.isProjectSyncEnabled(projectPath);
      if (!syncEnabled) {
        logger.debug(`Linear sync not enabled for project ${projectPath}`);
        return;
      }

      const metadata = this.guards.getSyncMetadata(featureId);

      // Loop prevention: skip if last sync was from Automaker within debounce window
      if (metadata?.syncSource === 'automaker') {
        const timeSinceLastSync = Date.now() - (metadata.lastSyncTimestamp || 0);
        if (timeSinceLastSync < DEBOUNCE_WINDOW_MS) {
          logger.debug(
            `Skipping Linear update for ${featureId}: last sync was from Automaker ${timeSinceLastSync}ms ago`
          );
          return;
        }
      }

      // Collect all changes to batch into a single update
      const featureUpdates: Partial<Feature> = {};
      const changeDescriptions: string[] = [];

      // --- Status sync ---
      const lastLinearState = metadata?.lastLinearState;
      const stateChanged = lastLinearState !== newStateName;

      if (stateChanged) {
        const newAutomakerStatus = mapLinearStateToAutomaker(newStateName);
        if (feature.status !== newAutomakerStatus) {
          featureUpdates.status = newAutomakerStatus;
          featureUpdates.statusChangeReason = `Synced from Linear (${newStateName})`;
          changeDescriptions.push(`status: ${feature.status} → ${newAutomakerStatus}`);
        }
      }

      // --- Title sync ---
      if (options?.title !== undefined && options.title !== feature.title) {
        featureUpdates.title = options.title;
        changeDescriptions.push(`title: "${feature.title}" → "${options.title}"`);
      }

      // --- Priority sync ---
      if (options?.priority !== undefined && options.priority !== feature.priority) {
        featureUpdates.priority = options.priority as Feature['priority'];
        changeDescriptions.push(`priority: ${feature.priority ?? 'none'} → ${options.priority}`);
      }

      // --- Due date sync ---
      if (options?.dueDate !== undefined && options.dueDate !== feature.dueDate) {
        featureUpdates.dueDate = options.dueDate;
        changeDescriptions.push(`dueDate: ${feature.dueDate ?? 'none'} → ${options.dueDate}`);
      }

      // --- Dependency sync ---
      try {
        const relatedLinearIssueIds = await this.fetchIssueRelations(linearIssueId, projectPath);
        const newDependencyIds: string[] = [];

        for (const relatedIssueId of relatedLinearIssueIds) {
          const relatedFeature = await this.featureLoader.findByLinearIssueId(
            projectPath,
            relatedIssueId
          );
          if (relatedFeature) newDependencyIds.push(relatedFeature.id);
        }

        const currentDeps = feature.dependencies || [];
        const depsChanged =
          newDependencyIds.length !== currentDeps.length ||
          !newDependencyIds.every((id) => currentDeps.includes(id));

        if (depsChanged) {
          featureUpdates.dependencies = newDependencyIds;
          changeDescriptions.push(
            `dependencies: [${currentDeps.join(', ')}] → [${newDependencyIds.join(', ')}]`
          );
        }
      } catch (error) {
        logger.warn(
          `Failed to sync dependencies for feature ${featureId}:`,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }

      // If nothing changed, just update metadata and return
      if (Object.keys(featureUpdates).length === 0) {
        if (stateChanged) {
          const updatedMetadata: SyncMetadata = {
            ...metadata,
            featureId,
            lastSyncTimestamp: Date.now(),
            lastSyncStatus: 'success',
            linearIssueId,
            syncCount: (metadata?.syncCount || 0) + 1,
            syncSource: 'linear',
            syncDirection: 'pull',
            lastLinearState: newStateName,
            lastSyncedAt: Date.now(),
          };
          this.guards.updateSyncMetadata(updatedMetadata);
        }
        logger.debug(`No field changes needed for feature ${featureId}`);
        return;
      }

      this.guards.markSyncing(featureId);

      try {
        let conflictDetected = false;
        if (metadata?.lastSyncedAt) {
          const timeSinceLastSync = Date.now() - metadata.lastSyncedAt;
          if (timeSinceLastSync < CONFLICT_DETECTION_WINDOW_MS) {
            conflictDetected = true;
            logger.warn(
              `Conflict detected for feature ${featureId}: syncs from both sources within ${CONFLICT_DETECTION_WINDOW_MS}ms`
            );
          }
        }

        await this.featureLoader.update(projectPath, featureId, featureUpdates);

        // Post cancellation comment to Linear when moving to terminal state
        const lowerStateName = newStateName.toLowerCase();
        if (
          featureUpdates.status === 'done' &&
          (lowerStateName.includes('cancel') || lowerStateName.includes('duplicate')) &&
          feature.linearIssueId
        ) {
          await this.guards
            .addCommentToIssue(
              projectPath,
              feature.linearIssueId,
              `🚫 Automaker: issue marked **done** because it was moved to **${newStateName}** in Linear.`
            )
            .catch((err) => logger.warn('Failed to post cancellation comment to Linear:', err));
        }

        const updatedMetadata: SyncMetadata = {
          featureId,
          lastSyncTimestamp: Date.now(),
          lastSyncStatus: 'success',
          linearIssueId,
          syncCount: (metadata?.syncCount || 0) + 1,
          syncSource: 'linear',
          syncDirection: 'pull',
          lastLinearState: newStateName,
          lastSyncedAt: Date.now(),
          conflictDetected,
        };
        this.guards.updateSyncMetadata(updatedMetadata);
        this.guards.recordOperation(
          featureId,
          'pull',
          'success',
          Date.now() - startTime,
          conflictDetected
        );

        if (this.guards.emitter) {
          this.guards.emitter.emit('linear:sync:completed', {
            featureId,
            direction: 'pull',
            conflictDetected,
            changes: changeDescriptions,
            timestamp: new Date().toISOString(),
          });
        }

        logger.info(
          `Synced Linear issue ${linearIssueId} → feature ${featureId}: ${changeDescriptions.join(', ')}${conflictDetected ? ' (conflict detected)' : ''}`
        );
      } finally {
        this.guards.unmarkSyncing(featureId);
      }
    } catch (error) {
      logger.error(`Failed to sync Linear issue ${linearIssueId}:`, error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.guards.recordOperation(
        featureId,
        'pull',
        'error',
        Date.now() - startTime,
        false,
        errorMsg
      );

      if (this.guards.emitter) {
        this.guards.emitter.emit('linear:sync:error', {
          linearIssueId,
          direction: 'pull',
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Fetch issue relations from Linear GraphQL API.
   * Returns an array of related issue IDs (blocks, blocked-by, relates-to).
   */
  private async fetchIssueRelations(linearIssueId: string, projectPath: string): Promise<string[]> {
    if (!this.settingsService) throw new Error('SettingsService not initialized');

    const settings = await this.settingsService.getProjectSettings(projectPath);
    const linearAccessToken = settings.integrations?.linear?.agentToken;

    if (!linearAccessToken) throw new Error('No Linear OAuth token found in settings');

    const query = `
      query GetIssueRelations($id: String!) {
        issue(id: $id) {
          id
          relations {
            nodes {
              id
              type
              relatedIssue { id }
            }
          }
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
        body: JSON.stringify({ query, variables: { id: linearIssueId } }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
      }

      const result = (await response.json()) as {
        data?: {
          issue?: {
            relations?: {
              nodes: Array<{ id: string; type: string; relatedIssue?: { id: string } }>;
            };
          };
        };
        errors?: Array<{ message: string }>;
      };

      if (result.errors) {
        throw new Error(`Linear GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
      }

      const relations = result.data?.issue?.relations?.nodes || [];
      return relations
        .filter((rel) => rel.relatedIssue && ['blocks', 'blocked', 'relatedTo'].includes(rel.type))
        .map((rel) => rel.relatedIssue!.id);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Linear API request timed out after 30s');
      }
      throw error;
    }
  }

  private formatLinearAuth(token: string): string {
    return token.startsWith('lin_api_') ? token : `Bearer ${token}`;
  }
}
