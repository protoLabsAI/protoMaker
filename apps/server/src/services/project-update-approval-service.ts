/**
 * Project Update Approval Service
 *
 * Detects when Josh posts a project update in Linear containing an approval
 * signal (e.g. "approved", "lgtm", "ship it") and triggers the project
 * lifecycle pipeline: approve PRD → create features → launch auto-mode.
 *
 * Also handles approval via comments on project updates.
 */

import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../lib/events.js';
import type { ProjectLifecycleService } from './project-lifecycle-service.js';
import type { ProjectService } from './project-service.js';
import type { SettingsService } from './settings-service.js';
import { LinearMCPClient } from './linear-mcp-client.js';

const logger = createLogger('ProjectUpdateApproval');

/** Approval keywords (case-insensitive) */
const APPROVAL_KEYWORDS = ['approved', 'lgtm', 'ship it', 'go ahead', 'looks good', 'approve'];

/** Emoji approval signals */
const APPROVAL_EMOJIS = ['\u{1F44D}', '\u{2705}', '\u{1F680}']; // 👍, ✅, 🚀

/** Payload from linear:project-update:created event */
interface ProjectUpdateCreatedPayload {
  updateId: string;
  projectId: string;
  body: string;
  health?: string;
  user?: { id: string; name: string; email?: string };
  userId?: string;
  url?: string;
  createdAt: string;
}

/** Payload from linear:comment:created event */
interface CommentCreatedPayload {
  commentId: string;
  issueId?: string;
  body: string;
  user?: { id: string; name: string; email?: string };
  createdAt: string;
}

export class ProjectUpdateApprovalService {
  private unsubscribe: (() => void) | null = null;
  private appUserId: string | null = null;

  constructor(
    private events: EventEmitter,
    private lifecycleService: ProjectLifecycleService,
    private projectService: ProjectService,
    private settingsService: SettingsService,
    private projectPath: string
  ) {}

  /**
   * Start listening for project update events
   */
  start(): void {
    if (this.unsubscribe) return;

    // Cache the app user ID for self-filtering
    this.resolveAppUserId().catch((err) => {
      logger.warn('Could not resolve app user ID for self-filtering:', err);
    });

    this.unsubscribe = this.events.subscribe((type, payload) => {
      if (type === 'linear:project-update:created') {
        void this.handleProjectUpdateCreated(payload as ProjectUpdateCreatedPayload);
      }
    });

    logger.info('ProjectUpdateApprovalService started');
  }

  /**
   * Stop listening
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /**
   * Resolve the authenticated app's user ID to filter self-authored updates
   */
  private async resolveAppUserId(): Promise<void> {
    try {
      const client = new LinearMCPClient(this.settingsService, this.projectPath);
      this.appUserId = await client.getAppUserId();
      logger.info(`Resolved app user ID: ${this.appUserId}`);
    } catch {
      // Non-critical — we'll just skip self-filtering
    }
  }

  /**
   * Handle a new project update posted in Linear
   */
  private async handleProjectUpdateCreated(payload: ProjectUpdateCreatedPayload): Promise<void> {
    const { updateId, projectId, body, user, userId } = payload;

    // Filter out self-authored updates
    const authorId = userId || user?.id;
    if (this.appUserId && authorId === this.appUserId) {
      logger.debug(`Ignoring self-authored project update ${updateId}`);
      return;
    }

    // Find the local project matching this Linear project ID
    const match = await this.projectService.findByLinearProjectId(this.projectPath, projectId);
    if (!match) {
      logger.debug(`No local project found for Linear project ${projectId}, ignoring update`);
      return;
    }

    const { project, slug } = match;

    logger.info(`Project update received for "${project.title}" from ${user?.name || 'unknown'}`, {
      updateId,
      projectId,
      bodyPreview: body?.substring(0, 100),
    });

    // Check if the body contains an approval signal
    if (this.isApprovalSignal(body)) {
      logger.info(
        `Approval signal detected in project update for "${project.title}" — triggering pipeline`
      );

      this.events.emit('linear:project-update:approved', {
        updateId,
        projectId,
        projectSlug: slug,
        projectTitle: project.title,
        approvedBy: user?.name || 'unknown',
        body,
      });

      await this.triggerApprovalPipeline(slug, project.title, updateId);
    } else {
      // Non-approval update — post an acknowledgment
      logger.info(`Non-approval project update for "${project.title}", posting acknowledgment`);
      await this.postAcknowledgment(updateId, project.title, user?.name);
    }
  }

  /**
   * Check if a text body contains an approval signal
   */
  private isApprovalSignal(body: string): boolean {
    if (!body) return false;
    const lower = body.toLowerCase().trim();

    // Check for keyword matches
    for (const keyword of APPROVAL_KEYWORDS) {
      if (lower.includes(keyword)) return true;
    }

    // Check for emoji signals
    for (const emoji of APPROVAL_EMOJIS) {
      if (body.includes(emoji)) return true;
    }

    return false;
  }

  /**
   * Trigger the full approval pipeline: approvePrd → launch
   */
  private async triggerApprovalPipeline(
    projectSlug: string,
    projectTitle: string,
    updateId: string
  ): Promise<void> {
    try {
      // Step 1: Approve PRD and create features
      logger.info(`Approving PRD for "${projectTitle}"...`);
      const approveResult = await this.lifecycleService.approvePrd(this.projectPath, projectSlug);
      logger.info(
        `PRD approved: ${approveResult.featuresCreated} features, ${approveResult.epicsCreated} epics`
      );

      // Step 2: Launch auto-mode
      logger.info(`Launching auto-mode for "${projectTitle}"...`);
      const launchResult = await this.lifecycleService.launch(this.projectPath, projectSlug);
      logger.info(
        `Auto-mode launched: ${launchResult.featuresInBacklog} features queued, auto-mode=${launchResult.autoModeStarted}`
      );

      // Step 3: Post confirmation to the project update
      const client = new LinearMCPClient(this.settingsService, this.projectPath);
      await client
        .addProjectUpdateComment(
          updateId,
          [
            `**Pipeline triggered by approval**`,
            '',
            `- ${approveResult.featuresCreated} features created`,
            `- ${approveResult.epicsCreated} epics created`,
            `- ${approveResult.linearMilestones.length} Linear milestones synced`,
            `- Auto-mode: ${launchResult.autoModeStarted ? 'started' : 'not started'}`,
            `- Features in backlog: ${launchResult.featuresInBacklog}`,
          ].join('\n')
        )
        .catch((err) => {
          logger.warn('Failed to post confirmation comment:', err);
        });
    } catch (error) {
      logger.error(`Approval pipeline failed for "${projectTitle}":`, error);

      // Post error to the project update
      try {
        const client = new LinearMCPClient(this.settingsService, this.projectPath);
        await client.addProjectUpdateComment(
          updateId,
          `**Pipeline error:** ${error instanceof Error ? error.message : String(error)}`
        );
      } catch (commentError) {
        logger.warn('Failed to post error comment:', commentError);
      }
    }
  }

  /**
   * Post an acknowledgment comment on a non-approval project update
   */
  private async postAcknowledgment(
    updateId: string,
    projectTitle: string,
    authorName?: string
  ): Promise<void> {
    try {
      const client = new LinearMCPClient(this.settingsService, this.projectPath);
      await client.addProjectUpdateComment(
        updateId,
        `Noted! Update for **${projectTitle}** from ${authorName || 'team'} received. ` +
          `Reply with "approved" to trigger the build pipeline.`
      );
    } catch (error) {
      logger.warn('Failed to post acknowledgment:', error);
    }
  }
}
