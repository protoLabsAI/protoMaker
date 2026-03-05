/**
 * Project Lifecycle Service
 *
 * Orchestrates the full project lifecycle:
 * idea -> dedup -> PRD -> review -> milestones -> features -> auto-mode
 */

import type {
  LifecycleInitiateResult,
  LifecycleApproveResult,
  LifecycleLaunchResult,
  LifecycleStatus,
  ProjectLifecyclePhase,
} from '@protolabsai/types';
import { createLogger, slugify } from '@protolabsai/utils';
import type { SettingsService } from './settings-service.js';
import type { ProjectService } from './project-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';
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

  /**
   * Initiate a project: create local project entry
   */
  async initiate(
    projectPath: string,
    title: string,
    ideaDescription: string
  ): Promise<LifecycleInitiateResult> {
    const localSlug = slugify(title);

    // Create local project
    await this.projectService.createProject(projectPath, {
      slug: localSlug,
      title,
      goal: ideaDescription,
    });

    this.events.emit('project:lifecycle:initiated', {
      projectPath,
      slug: localSlug,
      title,
      hasDuplicates: false,
    });

    logger.info(`Initiated project: ${title}`);

    return {
      duplicates: [],
      localSlug,
      hasDuplicates: false,
    };
  }

  /**
   * Approve PRD: create features from milestones
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

    await this.projectService.updateProject(projectPath, projectSlug, {
      status: 'active',
    });

    this.events.emit('project:lifecycle:prd-approved', {
      projectPath,
      slug: projectSlug,
      featuresCreated: result.featuresCreated,
      epicsCreated: Object.keys(result.milestoneEpicMap).length,
    });

    logger.info(`Approved PRD for ${projectSlug}: ${result.featuresCreated} features`);

    return {
      featuresCreated: result.featuresCreated,
      epicsCreated: Object.keys(result.milestoneEpicMap).length,
    };
  }

  /**
   * Launch project: start auto-mode
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
      projectSlug,
      featuresInBacklog: backlogFeatures.length,
      autoModeStarted,
    });

    logger.info(
      `Launched project ${projectSlug}: ${backlogFeatures.length} features, auto-mode=${autoModeStarted}`
    );

    return {
      autoModeStarted,
      featuresInBacklog: backlogFeatures.length,
    };
  }

  /**
   * Get lifecycle status: read local state
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
    } else {
      // Project exists but has no PRD yet -- suggest generating one
      phase = 'idea';
      nextActions.push('generate_project_prd');
    }

    return {
      phase,
      nextActions,
      boardSummary,
      hasPrd,
      hasMilestones,
      hasFeatures,
    };
  }
}
