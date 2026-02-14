/**
 * Project Lifecycle Service
 *
 * Orchestrates the full project lifecycle with Linear as the source of truth:
 * idea → dedup → Linear project → PRD → review → milestones → features → auto-mode
 */

import type {
  LifecycleInitiateResult,
  LifecycleApproveResult,
  LifecycleLaunchResult,
  LifecycleStatus,
  LifecycleCollectResult,
  ProjectLifecyclePhase,
  Milestone,
} from '@automaker/types';
import { createLogger, slugify } from '@automaker/utils';
import type { SettingsService } from './settings-service.js';
import type { ProjectService } from './project-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';
import { LinearMCPClient } from './linear-mcp-client.js';
import { orchestrateProjectFeatures, loadProject } from './project-orchestration-service.js';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('ProjectLifecycle');

export class ProjectLifecycleService {
  constructor(
    private settingsService: SettingsService,
    private projectService: ProjectService,
    private featureLoader: FeatureLoader,
    private autoModeService: AutoModeService,
    private events: EventEmitter
  ) {}

  private getLinearClient(projectPath: string): LinearMCPClient {
    return new LinearMCPClient(this.settingsService, projectPath);
  }

  private async getTeamId(projectPath: string): Promise<string> {
    const settings = await this.settingsService.getProjectSettings(projectPath);
    const teamId = settings.integrations?.linear?.teamId;
    if (!teamId) {
      throw new Error(
        'Linear teamId not configured. Set integrations.linear.teamId in project settings.'
      );
    }
    return teamId;
  }

  /**
   * Initiate a project: dedup check + create Linear project + write idea doc
   */
  async initiate(
    projectPath: string,
    title: string,
    ideaDescription: string
  ): Promise<LifecycleInitiateResult> {
    const client = this.getLinearClient(projectPath);
    const teamId = await this.getTeamId(projectPath);

    // Search for duplicates
    const existingProjects = await client.searchProjects(title);

    const duplicates = existingProjects.map((p) => ({
      id: p.id,
      name: p.name,
      url: p.url,
    }));

    if (duplicates.length > 0) {
      this.events.emit('project:lifecycle:initiated', {
        projectPath,
        title,
        hasDuplicates: true,
        duplicateCount: duplicates.length,
      });

      return {
        linearProjectId: '',
        linearProjectUrl: '',
        duplicates,
        localSlug: slugify(title),
        hasDuplicates: true,
      };
    }

    // Create Linear project
    const result = await client.createProject({
      name: title,
      description: ideaDescription,
      teamIds: [teamId],
    });

    // Set status to planned
    await client.updateProject(result.projectId, { status: 'planned' });

    const localSlug = slugify(title);

    // Create local project cache
    await this.projectService.createProject(projectPath, {
      slug: localSlug,
      title,
      goal: ideaDescription,
    });

    // Update local project with Linear IDs
    await this.projectService.updateProject(projectPath, localSlug, {
      linearProjectId: result.projectId,
      linearProjectUrl: result.url,
    });

    this.events.emit('project:lifecycle:initiated', {
      projectPath,
      slug: localSlug,
      linearProjectId: result.projectId,
      title,
      hasDuplicates: false,
    });

    logger.info(`Initiated project: ${title} → Linear ${result.projectId}`);

    return {
      linearProjectId: result.projectId,
      linearProjectUrl: result.url || '',
      duplicates: [],
      localSlug,
      hasDuplicates: false,
    };
  }

  /**
   * Approve PRD: create features from milestones + sync to Linear
   */
  async approvePrd(
    projectPath: string,
    projectSlug: string,
    options?: {
      createEpics?: boolean;
      setupDependencies?: boolean;
    }
  ): Promise<LifecycleApproveResult> {
    const project = await loadProject(projectPath, projectSlug);
    if (!project) {
      throw new Error(`Project "${projectSlug}" not found`);
    }

    if (!project.milestones || project.milestones.length === 0) {
      throw new Error('Project has no milestones. Generate a PRD first.');
    }

    // Create board features from project milestones
    const result = await orchestrateProjectFeatures(
      project,
      {
        projectPath,
        projectSlug,
        createEpics: options?.createEpics ?? true,
        setupDependencies: options?.setupDependencies ?? true,
        initialStatus: 'backlog',
      },
      this.featureLoader,
      this.events
    );

    // Sync milestones to Linear if project has a Linear ID
    const linearMilestones: Array<{ id: string; name: string }> = [];
    if (project.linearProjectId) {
      const client = this.getLinearClient(projectPath);
      const updatedMilestones: Milestone[] = [...project.milestones];

      for (let i = 0; i < project.milestones.length; i++) {
        const milestone = project.milestones[i];
        try {
          const msResult = await client.createProjectMilestone({
            projectId: project.linearProjectId,
            name: milestone.title,
            description: milestone.description,
            sortOrder: milestone.number,
          });
          linearMilestones.push({ id: msResult.id, name: msResult.name });
          // Persist the Linear milestone ID back
          updatedMilestones[i] = { ...milestone, linearMilestoneId: msResult.id };
        } catch (error) {
          logger.warn(`Failed to create Linear milestone: ${milestone.title}`, error);
        }
      }

      // Persist milestone IDs to project.json
      await this.projectService.updateProject(projectPath, projectSlug, {
        status: 'active',
        milestones: updatedMilestones,
      });
    } else {
      // Update project status without milestone changes
      await this.projectService.updateProject(projectPath, projectSlug, {
        status: 'active',
      });
    }

    this.events.emit('project:lifecycle:prd-approved', {
      projectPath,
      slug: projectSlug,
      featuresCreated: result.featuresCreated,
      epicsCreated: Object.keys(result.milestoneEpicMap).length,
    });

    logger.info(
      `Approved PRD for ${projectSlug}: ${result.featuresCreated} features, ${linearMilestones.length} Linear milestones`
    );

    return {
      featuresCreated: result.featuresCreated,
      epicsCreated: Object.keys(result.milestoneEpicMap).length,
      linearMilestones,
    };
  }

  /**
   * Launch project: set Linear status to started + start auto-mode
   */
  async launch(
    projectPath: string,
    projectSlug: string,
    maxConcurrency?: number
  ): Promise<LifecycleLaunchResult> {
    const project = await this.projectService.getProject(projectPath, projectSlug);
    if (!project) {
      throw new Error(`Project "${projectSlug}" not found`);
    }

    // Count backlog features
    const features = await this.featureLoader.getAll(projectPath);
    const backlogFeatures = features.filter((f) => f.status === 'backlog');

    if (backlogFeatures.length === 0) {
      throw new Error('No features in backlog. Approve the PRD first to create features.');
    }

    // Update Linear project status to started
    if (project.linearProjectId) {
      const client = this.getLinearClient(projectPath);
      await client.updateProject(project.linearProjectId, { status: 'started' });
    }

    // Start auto-mode
    let autoModeStarted = false;
    try {
      await this.autoModeService.startAutoLoopForProject(projectPath, null, maxConcurrency);
      autoModeStarted = true;
    } catch (error) {
      logger.warn('Failed to start auto-mode:', error);
    }

    this.events.emit('project:lifecycle:launched', {
      projectPath,
      slug: projectSlug,
      featuresInBacklog: backlogFeatures.length,
      autoModeStarted,
    });

    logger.info(
      `Launched project ${projectSlug}: ${backlogFeatures.length} features, auto-mode=${autoModeStarted}`
    );

    return {
      autoModeStarted,
      featuresInBacklog: backlogFeatures.length,
      linearProjectUrl: project.linearProjectUrl || '',
    };
  }

  /**
   * Get lifecycle status: read Linear + local state
   */
  async getStatus(projectPath: string, projectSlug: string): Promise<LifecycleStatus> {
    const project = await this.projectService.getProject(projectPath, projectSlug);

    // Determine board state (count all statuses including blocked/verified)
    const features = await this.featureLoader.getAll(projectPath);
    const boardSummary = {
      backlog: features.filter((f) => f.status === 'backlog').length,
      inProgress: features.filter((f) => f.status === 'in_progress').length,
      review: features.filter((f) => f.status === 'review').length,
      done: features.filter((f) => f.status === 'done' || f.status === 'verified').length,
    };
    const blockedCount = features.filter((f) => f.status === 'blocked').length;

    const hasFeatures = features.length > 0;
    const hasPrd = !!project?.prd;
    const hasMilestones = (project?.milestones?.length ?? 0) > 0;
    const allDone =
      hasFeatures &&
      boardSummary.backlog === 0 &&
      boardSummary.inProgress === 0 &&
      boardSummary.review === 0 &&
      blockedCount === 0 &&
      boardSummary.done > 0;

    // Determine phase
    let phase: ProjectLifecyclePhase | 'unknown' = 'unknown';
    const nextActions: string[] = [];

    if (!project) {
      phase = 'unknown';
      nextActions.push('initiate_project');
    } else if (project.status === 'completed' || allDone) {
      phase = 'completed';
    } else if (hasFeatures && boardSummary.backlog > 0) {
      phase = 'prd-approved';
      nextActions.push('launch_project');
    } else if (hasFeatures && (boardSummary.inProgress > 0 || boardSummary.review > 0)) {
      phase = 'started';
    } else if (hasMilestones && !hasFeatures) {
      phase = 'prd-approved';
      nextActions.push('approve_project_prd');
    } else if (hasPrd && !hasMilestones) {
      phase = 'idea-approved';
      nextActions.push('approve_project_prd');
    } else if (project.linearProjectId) {
      phase = 'idea';
      nextActions.push('generate_project_prd');
    } else {
      phase = 'idea';
      nextActions.push('initiate_project');
    }

    return {
      phase,
      linearStatus: project?.status,
      linearLabels: [],
      nextActions,
      linearUrl: project?.linearProjectUrl,
      boardSummary,
      hasPrd,
      hasMilestones,
      hasFeatures,
    };
  }

  /**
   * Collect related Linear issues into the project
   */
  async collectRelated(
    projectPath: string,
    projectSlug: string,
    linearProjectId: string,
    issueIds: string[]
  ): Promise<LifecycleCollectResult> {
    const client = this.getLinearClient(projectPath);

    let collected = 0;
    for (const issueId of issueIds) {
      try {
        await client.addIssueToProject(issueId, linearProjectId);
        collected++;
      } catch (error) {
        logger.warn(`Failed to add issue ${issueId} to project:`, error);
      }
    }

    this.events.emit('project:lifecycle:phase-changed', {
      projectPath,
      slug: projectSlug,
      linearProjectId,
      issuesCollected: collected,
      action: 'collect-related',
    });

    return {
      issuesCollected: collected,
      issuesAssigned: collected,
    };
  }
}
