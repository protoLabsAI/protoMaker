/**
 * Linear Project Sync
 *
 * Handles push-direction sync of Automaker projects to Linear projects:
 * - Project scaffolded  -> create Linear project + milestones
 * - Status changed      -> update Linear project status/progress
 * - syncProjectToLinear -> full milestone sync with issue assignment
 * - Custom workflow state management
 */

import { createLogger } from '@protolabs-ai/utils';
import type { Feature, Project } from '@protolabs-ai/types';
import type { SettingsService } from './settings-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { ProjectService } from './project-service.js';
import { LinearMCPClient } from './linear-mcp-client.js';
import { mapProjectStatusToLinear } from './linear-state-mapper.js';
import type {
  SyncGuards,
  ProjectScaffoldedPayload,
  ProjectStatusChangedPayload,
} from './linear-sync-types.js';

const logger = createLogger('LinearProjectSync');

export class LinearProjectSync {
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
  // Event handlers (called by orchestrator)
  // -------------------------------------------------------------------------

  async handleProjectScaffolded(payload: ProjectScaffoldedPayload): Promise<void> {
    logger.debug('Received project:scaffolded event', {
      projectSlug: payload.projectSlug,
      projectTitle: payload.projectTitle,
    });
    await this.onProjectScaffolded(payload);
  }

  async handleProjectStatusChanged(payload: ProjectStatusChangedPayload): Promise<void> {
    logger.debug('Received project:status-changed event', {
      projectSlug: payload.projectSlug,
      status: payload.status,
    });
    await this.syncProjectStatusToLinear(payload.projectPath, payload.projectSlug, payload.status);
  }

  // -------------------------------------------------------------------------
  // Core project sync logic
  // -------------------------------------------------------------------------

  private async onProjectScaffolded(payload: ProjectScaffoldedPayload): Promise<void> {
    const { projectPath, projectSlug, projectTitle } = payload;

    if (!this.guards.isProjectSyncEnabled) {
      logger.debug(`Sync guards not available for project ${projectSlug}`);
      return;
    }

    const syncEnabled = await this.guards.isProjectSyncEnabled(projectPath);
    if (!syncEnabled) {
      logger.debug(`Linear sync not enabled for project ${projectPath}`);
      return;
    }

    if (!this.settingsService || !this.projectService) {
      logger.debug('SettingsService or ProjectService not initialized, skipping project sync');
      return;
    }

    const enableSettings = await this.settingsService.getProjectSettings(projectPath);
    if (!enableSettings.integrations?.linear?.enableProjectUpdates) {
      logger.debug(
        `Linear project updates disabled for project ${projectPath}, skipping scaffold sync`
      );
      return;
    }

    const startTime = Date.now();

    try {
      const project = await this.projectService.getProject(projectPath, projectSlug);
      if (!project) {
        logger.error(`Project ${projectSlug} not found`);
        return;
      }

      if (project.linearProjectId) {
        logger.info(`Project ${projectSlug} already has Linear project ${project.linearProjectId}`);
        return;
      }

      const settings = await this.settingsService.getProjectSettings(projectPath);
      const teamId = settings.integrations?.linear?.teamId;

      if (!teamId) {
        logger.debug(`No Linear team ID configured for project ${projectPath}`);
        return;
      }

      const client = new LinearMCPClient(this.settingsService, projectPath);
      const result = await client.createProject({
        name: projectTitle,
        description: project.goal,
        teamIds: [teamId],
      });

      await this.projectService.updateProject(projectPath, projectSlug, {
        linearProjectId: result.projectId,
        linearProjectUrl: result.url,
      });

      const currentSettings = await this.settingsService.getProjectSettings(projectPath);
      if (currentSettings.integrations?.linear) {
        currentSettings.integrations.linear.projectId = result.projectId;
        await this.settingsService.updateProjectSettings(projectPath, currentSettings);
      }

      // Create milestones
      if (project.milestones && project.milestones.length > 0) {
        let milestonesCreated = 0;
        for (let i = 0; i < project.milestones.length; i++) {
          const milestone = project.milestones[i];
          if (milestone.linearMilestoneId) {
            logger.debug(`Milestone ${milestone.title} already has Linear ID, skipping`);
            continue;
          }
          try {
            const milestoneResult = await client.createProjectMilestone({
              projectId: result.projectId,
              name: `M${milestone.number}: ${milestone.title}`,
              description: milestone.description,
              sortOrder: i,
            });
            milestone.linearMilestoneId = milestoneResult.id;
            milestonesCreated++;
          } catch (milestoneError) {
            logger.error(
              `Failed to create Linear milestone for ${milestone.title}:`,
              milestoneError
            );
          }
        }

        if (milestonesCreated > 0) {
          await this.projectService.updateProject(projectPath, projectSlug, {
            milestones: project.milestones,
          });
          logger.info(`Created ${milestonesCreated} Linear milestones for project ${projectSlug}`);
        }
      }

      await this.addChildFeaturesToProject(projectPath, projectSlug, result.projectId, client);
      await this.syncProjectDependencies(projectPath, projectSlug);
      await this.syncProjectStatusToLinear(projectPath, projectSlug, project.status);

      this.guards.recordOperation(
        `project:${projectSlug}`,
        'push',
        'success',
        Date.now() - startTime,
        false
      );

      if (this.guards.emitter) {
        this.guards.emitter.emit('linear:project:created', {
          projectPath,
          projectSlug,
          linearProjectId: result.projectId,
          linearProjectUrl: result.url,
          timestamp: new Date().toISOString(),
        });
      }

      logger.info(`Created Linear project for ${projectSlug}: ${result.projectId}`);
    } catch (error) {
      logger.error(`Failed to sync project ${projectSlug} to Linear:`, error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.guards.recordOperation(
        `project:${projectSlug}`,
        'push',
        'error',
        Date.now() - startTime,
        false,
        errorMsg
      );

      if (this.guards.emitter) {
        this.guards.emitter.emit('linear:sync:error', {
          projectSlug,
          direction: 'push',
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  async syncProjectStatusToLinear(
    projectPath: string,
    projectSlug: string,
    projectStatus: string
  ): Promise<void> {
    if (!this.projectService || !this.settingsService) {
      logger.debug('ProjectService or SettingsService not initialized');
      return;
    }

    const syncEnabled = await this.guards.isProjectSyncEnabled(projectPath);
    if (!syncEnabled) {
      logger.debug(`Linear sync not enabled for project ${projectPath}`);
      return;
    }

    const syncSettings = await this.settingsService.getProjectSettings(projectPath);
    if (!syncSettings.integrations?.linear?.enableProjectUpdates) {
      logger.debug(
        `Linear project updates disabled for project ${projectPath}, skipping status sync`
      );
      return;
    }

    const startTime = Date.now();

    try {
      const project = await this.projectService.getProject(projectPath, projectSlug);
      if (!project) {
        logger.error(`Project ${projectSlug} not found`);
        return;
      }

      if (!project.linearProjectId) {
        logger.debug(`Project ${projectSlug} has no Linear project ID, skipping status sync`);
        return;
      }

      const completionPercentage = await this.calculateMilestoneProgress(project);
      const linearStatus = mapProjectStatusToLinear(projectStatus);

      const client = new LinearMCPClient(this.settingsService, projectPath);
      await client.updateProject(project.linearProjectId, {
        status: linearStatus,
        progress: completionPercentage,
      });

      this.guards.recordOperation(
        `project:${projectSlug}`,
        'push',
        'success',
        Date.now() - startTime,
        false
      );

      if (this.guards.emitter) {
        this.guards.emitter.emit('linear:project:status-updated', {
          projectPath,
          projectSlug,
          linearProjectId: project.linearProjectId,
          status: projectStatus,
          linearStatus,
          progress: completionPercentage,
          timestamp: new Date().toISOString(),
        });
      }

      logger.info(
        `Synced project status for ${projectSlug} to Linear: ${linearStatus} (${completionPercentage}%)`
      );
    } catch (error) {
      logger.error(`Failed to sync project status for ${projectSlug}:`, error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.guards.recordOperation(
        `project:${projectSlug}`,
        'push',
        'error',
        Date.now() - startTime,
        false,
        errorMsg
      );

      if (this.guards.emitter) {
        this.guards.emitter.emit('linear:sync:error', {
          projectSlug,
          direction: 'push',
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  async syncProjectToLinear(
    projectPath: string,
    projectSlug: string,
    options?: { linearProjectId?: string; cleanupPlaceholders?: boolean }
  ): Promise<{
    success: boolean;
    linearProjectId: string;
    milestones: Array<{
      name: string;
      linearMilestoneId: string;
      action: 'created' | 'updated' | 'existing';
    }>;
    issuesAssigned: number;
    deletedPlaceholders: string[];
    errors: string[];
  }> {
    const startTime = Date.now();
    const errors: string[] = [];

    if (!this.projectService || !this.settingsService) {
      throw new Error('ProjectService or SettingsService not initialized');
    }

    const project = await this.projectService.getProject(projectPath, projectSlug);
    if (!project) throw new Error(`Project ${projectSlug} not found`);
    if (!project.milestones || project.milestones.length === 0) {
      throw new Error(`Project ${projectSlug} has no milestones`);
    }

    const linearProjectId = options?.linearProjectId || project.linearProjectId;
    if (!linearProjectId) {
      throw new Error(`No Linear project ID. Pass linearProjectId or set it on the project first.`);
    }

    const client = new LinearMCPClient(this.settingsService, projectPath);
    logger.info(
      `Starting project milestone sync for ${projectSlug} → Linear project ${linearProjectId}`
    );

    const existingMilestones = await client.listProjectMilestones(linearProjectId);
    const milestoneByName = new Map(existingMilestones.map((m) => [m.name, m]));
    const milestoneById = new Map(existingMilestones.map((m) => [m.id, m]));

    const milestoneResults: Array<{
      name: string;
      linearMilestoneId: string;
      action: 'created' | 'updated' | 'existing';
    }> = [];
    const matchedLinearMilestoneIds = new Set<string>();

    for (const milestone of project.milestones) {
      const milestoneName = `M${milestone.number}: ${milestone.title}`;
      try {
        if (milestone.linearMilestoneId && milestoneById.has(milestone.linearMilestoneId)) {
          const existing = milestoneById.get(milestone.linearMilestoneId)!;
          matchedLinearMilestoneIds.add(existing.id);
          if (existing.name !== milestoneName) {
            await client.updateProjectMilestone(existing.id, {
              name: milestoneName,
              description: milestone.description,
              sortOrder: milestone.number,
            });
            milestoneResults.push({
              name: milestoneName,
              linearMilestoneId: existing.id,
              action: 'updated',
            });
          } else {
            milestoneResults.push({
              name: milestoneName,
              linearMilestoneId: existing.id,
              action: 'existing',
            });
          }
          continue;
        }

        if (milestoneByName.has(milestoneName)) {
          const existing = milestoneByName.get(milestoneName)!;
          matchedLinearMilestoneIds.add(existing.id);
          milestone.linearMilestoneId = existing.id;
          milestoneResults.push({
            name: milestoneName,
            linearMilestoneId: existing.id,
            action: 'existing',
          });
          continue;
        }

        const created = await client.createProjectMilestone({
          projectId: linearProjectId,
          name: milestoneName,
          description: milestone.description,
          sortOrder: milestone.number,
        });
        milestone.linearMilestoneId = created.id;
        matchedLinearMilestoneIds.add(created.id);
        milestoneResults.push({
          name: milestoneName,
          linearMilestoneId: created.id,
          action: 'created',
        });
      } catch (error) {
        const msg = `Failed to sync milestone ${milestoneName}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(msg);
        logger.error(msg);
      }
    }

    const deletedPlaceholders: string[] = [];
    if (options?.cleanupPlaceholders) {
      for (const existing of existingMilestones) {
        if (!matchedLinearMilestoneIds.has(existing.id)) {
          try {
            await client.deleteProjectMilestone(existing.id);
            deletedPlaceholders.push(existing.name);
          } catch (error) {
            const msg = `Failed to delete placeholder ${existing.name}: ${error instanceof Error ? error.message : String(error)}`;
            errors.push(msg);
          }
        }
      }
    }

    let issuesAssigned = 0;
    try {
      const issues = await client.getProjectIssues(linearProjectId);
      const parentIssues = issues.filter((i) => !i.parent && i.children.length > 0);
      const milestoneTitleToId = new Map<string, string>();
      for (const milestone of project.milestones) {
        if (milestone.linearMilestoneId) {
          milestoneTitleToId.set(milestone.title.toLowerCase(), milestone.linearMilestoneId);
        }
      }

      const parentToMilestone = new Map<string, string>();
      for (const parentIssue of parentIssues) {
        const parentTitle = parentIssue.title.toLowerCase();
        let bestMatch: string | undefined;
        let bestMatchLen = 0;
        for (const [milestoneTitle, milestoneId] of milestoneTitleToId) {
          const titleWords = milestoneTitle.split(/\s+/);
          const matchingWords = titleWords.filter(
            (word) => word.length > 2 && parentTitle.includes(word)
          );
          if (matchingWords.length > bestMatchLen) {
            bestMatchLen = matchingWords.length;
            bestMatch = milestoneId;
          }
        }
        if (bestMatch && bestMatchLen >= 2) {
          parentToMilestone.set(parentIssue.id, bestMatch);
        }
      }

      for (const issue of issues) {
        let targetMilestoneId: string | undefined;
        if (parentToMilestone.has(issue.id)) {
          targetMilestoneId = parentToMilestone.get(issue.id);
        } else if (issue.parent && parentToMilestone.has(issue.parent.id)) {
          targetMilestoneId = parentToMilestone.get(issue.parent.id);
        }

        if (!targetMilestoneId || issue.projectMilestone?.id === targetMilestoneId) continue;

        try {
          await client.assignIssueToMilestone(issue.id, targetMilestoneId);
          issuesAssigned++;
        } catch (error) {
          errors.push(
            `Failed to assign ${issue.identifier} to milestone: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    } catch (error) {
      errors.push(
        `Failed to fetch/assign project issues: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    try {
      await this.projectService.updateProject(projectPath, projectSlug, {
        milestones: project.milestones,
        linearProjectId,
      });
    } catch (error) {
      errors.push(
        `Failed to persist milestone IDs: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    this.guards.recordOperation(
      `project:${projectSlug}`,
      'push',
      errors.length === 0 ? 'success' : 'error',
      Date.now() - startTime,
      false,
      errors.length > 0 ? errors[0] : undefined
    );

    if (this.guards.emitter) {
      this.guards.emitter.emit('linear:project:milestones-synced', {
        projectPath,
        projectSlug,
        linearProjectId,
        milestonesCreated: milestoneResults.filter((m) => m.action === 'created').length,
        milestonesUpdated: milestoneResults.filter((m) => m.action === 'updated').length,
        issuesAssigned,
        deletedPlaceholders: deletedPlaceholders.length,
        errors: errors.length,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      success: errors.length === 0,
      linearProjectId,
      milestones: milestoneResults,
      issuesAssigned,
      deletedPlaceholders,
      errors,
    };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async addChildFeaturesToProject(
    projectPath: string,
    projectSlug: string,
    linearProjectId: string,
    client: LinearMCPClient
  ): Promise<void> {
    if (!this.featureLoader) return;

    try {
      const features = await this.featureLoader.getAll(projectPath);
      const syncedFeatures = features.filter((f: Feature) => f.linearIssueId);

      if (syncedFeatures.length === 0) {
        logger.debug(`No synced features to add to Linear project for ${projectSlug}`);
        return;
      }

      let addedCount = 0;
      for (const feature of syncedFeatures) {
        try {
          await client.addIssueToProject(feature.linearIssueId!, linearProjectId);
          addedCount++;
        } catch (error) {
          logger.warn(
            `Failed to add feature ${feature.id} to Linear project ${linearProjectId}:`,
            error
          );
        }
      }

      logger.info(
        `Added ${addedCount}/${syncedFeatures.length} features to Linear project ${linearProjectId}`
      );
    } catch (error) {
      logger.error(`Failed to add child features to Linear project:`, error);
    }
  }

  private async syncProjectDependencies(projectPath: string, projectSlug: string): Promise<void> {
    if (!this.featureLoader) {
      logger.warn('FeatureLoader not initialized, skipping project dependency sync');
      return;
    }

    try {
      const features = await this.featureLoader.getAll(projectPath);
      const featuresWithDeps = features.filter(
        (f: Feature) =>
          f.linearIssueId &&
          f.dependencies &&
          f.dependencies.length > 0 &&
          f.projectSlug === projectSlug
      );

      if (featuresWithDeps.length === 0) {
        logger.debug(`No features with dependencies to sync for project ${projectSlug}`);
        return;
      }

      // Note: dependency sync per feature is handled by LinearIssueSync
      // Here we just log what would need syncing
      logger.info(
        `${featuresWithDeps.length} features with dependencies exist for project ${projectSlug}`
      );
    } catch (error) {
      logger.error(
        `Failed to sync project dependencies for ${projectSlug}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  private async calculateMilestoneProgress(project: Project): Promise<number> {
    if (!project.milestones || project.milestones.length === 0) return 0;

    if (!this.featureLoader) {
      return this.calculateMilestoneProgressFromStatus(project);
    }

    let totalPhases = 0;
    let completedPhases = 0;

    for (const milestone of project.milestones) {
      if (milestone.phases && milestone.phases.length > 0) {
        totalPhases += milestone.phases.length;
        for (const phase of milestone.phases) {
          if (phase.featureId) {
            try {
              const feature = await this.featureLoader.get(process.cwd(), phase.featureId);
              if (feature && (feature.status === 'done' || feature.status === 'verified')) {
                completedPhases++;
              }
            } catch (_error) {
              logger.debug(`Failed to get feature ${phase.featureId} for progress calculation`);
            }
          }
        }
      }
    }

    if (totalPhases === 0) return 0;
    return Math.round((completedPhases / totalPhases) * 100);
  }

  private calculateMilestoneProgressFromStatus(project: Project): number {
    if (!project.milestones || project.milestones.length === 0) return 0;
    const totalMilestones = project.milestones.length;
    const completedMilestones = project.milestones.filter((m) => m.status === 'completed').length;
    return Math.round((completedMilestones / totalMilestones) * 100);
  }

  async createCustomWorkflowStates(
    projectPath: string,
    teamId: string
  ): Promise<{ needsHumanReview?: string; escalated?: string; agentDenied?: string }> {
    if (!this.settingsService) {
      logger.warn('SettingsService not initialized, cannot create custom workflow states');
      return {};
    }

    let linearAccessToken: string;
    try {
      linearAccessToken = await this.resolveLinearToken(projectPath);
    } catch {
      logger.warn('No Linear API token configured, cannot create custom workflow states');
      return {};
    }

    const existingStates = await this.getCustomWorkflowStates(projectPath, teamId);
    if (existingStates.needsHumanReview && existingStates.escalated && existingStates.agentDenied) {
      logger.info('Custom workflow states already exist, skipping creation');
      return existingStates;
    }

    const customStateIds: { needsHumanReview?: string; escalated?: string; agentDenied?: string } =
      {};
    const statesToCreate = [
      { name: 'Needs Human Review', type: 'started', color: '#f2c94c', key: 'needsHumanReview' },
      { name: 'Escalated', type: 'started', color: '#f2994a', key: 'escalated' },
      { name: 'Agent Denied', type: 'canceled', color: '#eb5757', key: 'agentDenied' },
    ] as const;

    for (const stateConfig of statesToCreate) {
      const existingKey = stateConfig.key as keyof typeof existingStates;
      if (existingStates[existingKey]) {
        customStateIds[existingKey] = existingStates[existingKey];
        continue;
      }

      try {
        const mutation = `
          mutation CreateWorkflowState($teamId: String!, $name: String!, $type: String!, $color: String!) {
            workflowStateCreate(input: { teamId: $teamId, name: $name, type: $type, color: $color }) {
              success
              workflowState { id name type color }
            }
          }
        `;

        const variables = {
          teamId,
          name: stateConfig.name,
          type: stateConfig.type,
          color: stateConfig.color,
        };
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

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
          logger.warn(`Failed to create workflow state "${stateConfig.name}": ${response.status}`);
          continue;
        }

        const result = (await response.json()) as {
          data?: {
            workflowStateCreate?: {
              success: boolean;
              workflowState?: { id: string; name: string };
            };
          };
          errors?: Array<{ message: string }>;
        };

        if (
          result.data?.workflowStateCreate?.success &&
          result.data.workflowStateCreate.workflowState
        ) {
          const stateId = result.data.workflowStateCreate.workflowState.id;
          customStateIds[existingKey] = stateId;
          logger.info(`Created custom workflow state "${stateConfig.name}": ${stateId}`);
        }
      } catch (error) {
        logger.warn(
          `Failed to create workflow state "${stateConfig.name}": ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    if (Object.keys(customStateIds).length > 0) {
      try {
        const currentSettings = await this.settingsService.getProjectSettings(projectPath);
        if (currentSettings.integrations?.linear) {
          currentSettings.integrations.linear.customStateIds = {
            ...currentSettings.integrations.linear.customStateIds,
            ...customStateIds,
          };
          await this.settingsService.updateProjectSettings(projectPath, currentSettings);
        }
      } catch (error) {
        logger.error(
          `Failed to store custom state IDs: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return customStateIds;
  }

  async getCustomWorkflowStates(
    projectPath: string,
    teamId: string
  ): Promise<{ needsHumanReview?: string; escalated?: string; agentDenied?: string }> {
    if (!this.settingsService) return {};

    let linearAccessToken: string;
    try {
      linearAccessToken = await this.resolveLinearToken(projectPath);
    } catch {
      return {};
    }

    try {
      const query = `
        query GetWorkflowStates($teamId: String!) {
          team(id: $teamId) { id states { nodes { id name } } }
        }
      `;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

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

      if (!response.ok) return {};

      const result = (await response.json()) as {
        data?: { team?: { states?: { nodes: Array<{ id: string; name: string }> } } };
      };

      const states = result.data?.team?.states?.nodes || [];
      const customStates: { needsHumanReview?: string; escalated?: string; agentDenied?: string } =
        {};

      for (const state of states) {
        if (state.name === 'Needs Human Review') customStates.needsHumanReview = state.id;
        else if (state.name === 'Escalated') customStates.escalated = state.id;
        else if (state.name === 'Agent Denied') customStates.agentDenied = state.id;
      }

      return customStates;
    } catch {
      return {};
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
