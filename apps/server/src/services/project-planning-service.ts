/**
 * Project Planning Service
 *
 * Orchestrates the LangGraph project planning flow through Linear's agent protocol.
 * Listens for `linear:project:created` events to start planning, and
 * `linear:agent-session:prompted` events to resume at HITL checkpoints.
 *
 * Flow:
 *   1. New Linear project → create agent session → start flow
 *   2. Flow runs until HITL checkpoint → create/update document → ask user via elicitation
 *   3. User responds → prompted webhook → inject response into flow state → resume
 *   4. Repeat until all HITL gates pass → create issues → done
 */

import { createLogger } from '@protolabs-ai/utils';
import {
  createProjectPlanningFlow,
  createLinearIssueCreator,
  type ProjectPlanningFlowConfig,
  type ProjectPlanningState,
  type HITLResponse,
  type PlanningArtifact,
  type PlanningStage,
} from '@protolabs-ai/flows';
import type { ConversationSurface } from '@protolabs-ai/types';
import type { EventEmitter } from '../lib/events.js';
import type { SettingsService } from './settings-service.js';
import { LinearMCPClient } from './linear-mcp-client.js';

const logger = createLogger('ProjectPlanningService');

/**
 * Inbound event from webhook — project created in Linear
 */
interface ProjectCreatedEvent {
  projectId: string;
  name: string;
  description: string;
  state: string;
  teamId?: string;
  teamName?: string;
  url?: string;
  createdAt: string;
}

/**
 * Inbound event from webhook — user responded to agent elicitation
 */
interface SessionPromptedEvent {
  sessionId: string;
  issueId: string;
  prompt?: string;
}

/**
 * Maps planning stages to the checkpoint names the HITL router uses
 */
const STAGE_TO_CHECKPOINT: Record<string, string> = {
  planning_doc_review: 'planning_doc',
  research_doc_review: 'research_doc',
  prd_review: 'prd',
  milestone_review: 'milestones',
};

/**
 * Plan steps shown in Linear's session plan UI
 */
const PLAN_STEPS = [
  { content: 'Research codebase', status: 'pending' as const },
  { content: 'Create planning document', status: 'pending' as const },
  { content: 'Deep research', status: 'pending' as const },
  { content: 'Generate SPARC PRD', status: 'pending' as const },
  { content: 'Plan milestones & phases', status: 'pending' as const },
  { content: 'Create Linear issues', status: 'pending' as const },
];

/**
 * Maps planning stages to plan step indices for progress tracking
 */
const STAGE_TO_STEP_INDEX: Record<string, number> = {
  researching: 0,
  planning_doc_review: 1,
  deep_researching: 2,
  research_doc_review: 2,
  prd_review: 3,
  milestone_review: 4,
  creating_issues: 5,
  completed: 5,
};

/**
 * Active planning session — tracks a flow run in progress
 */
interface ActivePlanning {
  sessionId: string;
  projectId: string;
  projectName: string;
  flow: ReturnType<typeof createProjectPlanningFlow>;
  state: Partial<ProjectPlanningState>;
  /** Document IDs created for each checkpoint */
  documents: Record<string, string>;
  startedAt: string;
}

export class ProjectPlanningService {
  private events: EventEmitter;
  private settingsService?: SettingsService;
  private surface: ConversationSurface | null = null;
  private projectPath: string;
  private flowConfig: ProjectPlanningFlowConfig;

  /** Active planning sessions, keyed by sessionId */
  private activePlannings = new Map<string, ActivePlanning>();
  /** Maps Linear project IDs to session IDs (for routing prompted events) */
  private projectToSession = new Map<string, string>();

  private unsubscribe?: () => void;
  private isStarted = false;

  constructor(
    events: EventEmitter,
    projectPath: string,
    flowConfig?: ProjectPlanningFlowConfig,
    settingsService?: SettingsService
  ) {
    this.events = events;
    this.settingsService = settingsService;
    this.projectPath = projectPath;

    // If settingsService is provided, inject a real Linear issue creator
    if (settingsService && !flowConfig?.issueCreator) {
      const client = new LinearMCPClient(settingsService, projectPath);
      const issueCreator = createLinearIssueCreator({
        createIssue: (opts) => client.createIssue(opts),
        createProjectMilestone: (opts) => client.createProjectMilestone(opts),
        assignIssueToMilestone: (a, b) => client.assignIssueToMilestone(a, b),
      });
      this.flowConfig = { ...flowConfig, issueCreator };
    } else {
      this.flowConfig = flowConfig || {};
    }
  }

  start(): void {
    if (this.isStarted) return;

    logger.info('Starting ProjectPlanningService');
    this.unsubscribe = this.events.subscribe((type, payload) => {
      if (type === 'linear:project:created') {
        void this.handleProjectCreated(payload as ProjectCreatedEvent);
      } else if (type === 'linear:agent-session:prompted') {
        void this.handleSessionPrompted(payload as SessionPromptedEvent);
      }
    });
    this.isStarted = true;
  }

  stop(): void {
    if (!this.isStarted) return;
    logger.info('Stopping ProjectPlanningService');
    this.unsubscribe?.();
    this.isStarted = false;
  }

  /**
   * Get the status of an active planning session
   */
  getStatus(sessionId: string): ActivePlanning | undefined {
    return this.activePlannings.get(sessionId);
  }

  // ─── Event Handlers ───────────────────────────────────────────

  /**
   * Handle new project creation — start the planning flow
   */
  private async handleProjectCreated(event: ProjectCreatedEvent): Promise<void> {
    const { projectId, name, description, teamId, teamName, url } = event;
    logger.info(`New project "${name}" (${projectId}) — starting planning flow`);

    try {
      // Step 1: Create an agent session on a tracking issue or the project itself
      // For now, we create a proactive session. In the future, this could
      // be tied to a specific planning issue within the project.
      const sessionId = `planning-${projectId}-${Date.now()}`;

      this.projectToSession.set(projectId, sessionId);

      // Step 3: Acknowledge and set plan
      await this.surface?.acknowledge(sessionId, `Starting project planning for "${name}"...`);
      await this.surface?.updatePlan?.(sessionId, [...PLAN_STEPS]);

      // Step 4: Create and compile the flow
      const flow = createProjectPlanningFlow(this.flowConfig);

      // Step 5: Set initial state
      const initialState: Partial<ProjectPlanningState> = {
        stage: 'received',
        projectInput: {
          projectId,
          name,
          description: description || '',
          teamId,
          teamName,
          url,
        },
        sessionId,
        projectPath: this.projectPath,
        milestones: [],
        hitlResponses: [],
        createdIssueIds: [],
        errors: [],
        revisionCounts: {},
      };

      // Step 6: Track the planning session
      const planning: ActivePlanning = {
        sessionId,
        projectId,
        projectName: name,
        flow,
        state: initialState,
        documents: {},
        startedAt: new Date().toISOString(),
      };
      this.activePlannings.set(sessionId, planning);

      // Step 7: Run the flow until a HITL checkpoint
      await this.runFlowUntilHitl(planning);
    } catch (error) {
      logger.error(`Failed to start planning for project "${name}":`, error);
    }
  }

  /**
   * Handle user response to an elicitation — resume the flow
   */
  private async handleSessionPrompted(event: SessionPromptedEvent): Promise<void> {
    const { sessionId, prompt } = event;

    // Find the active planning for this session
    const planning = this.activePlannings.get(sessionId);
    if (!planning) {
      // Not a planning session — let the general router handle it
      return;
    }

    logger.info(`Received response for planning session ${sessionId}: ${prompt?.substring(0, 80)}`);

    try {
      await this.surface?.acknowledge(sessionId, 'Processing your feedback...');

      // Parse the user's response into a HITL decision
      const hitlResponse = this.parseUserResponse(prompt || '', planning.state.stage as string);

      // Inject the response into flow state
      planning.state = {
        ...planning.state,
        latestHitlResponse: hitlResponse,
      };

      // Resume the flow
      await this.runFlowUntilHitl(planning);
    } catch (error) {
      logger.error(`Failed to process response for session ${sessionId}:`, error);
      await this.surface
        ?.reportError(
          sessionId,
          `Failed to process your response: ${error instanceof Error ? error.message : String(error)}`
        )
        .catch((e: unknown) => logger.error('Failed to report error:', e));
    }
  }

  // ─── Flow Execution ───────────────────────────────────────────

  /**
   * Run the flow from current state until it reaches a HITL checkpoint or completes.
   *
   * This invokes the compiled LangGraph flow. After each invocation, we check the
   * resulting stage. If it's a review stage, we pause and elicit user input.
   * If it's completed or error, we finish.
   */
  private async runFlowUntilHitl(planning: ActivePlanning): Promise<void> {
    const { sessionId, flow } = planning;

    try {
      // Run the flow with current state
      const result = await flow.invoke(planning.state);
      planning.state = result;

      const stage = result.stage as PlanningStage;
      logger.info(`Flow reached stage: ${stage}`);

      // Update plan progress
      await this.updatePlanProgress(sessionId, stage);

      // Check what stage we landed on
      if (stage === 'completed') {
        await this.handleFlowCompleted(planning);
      } else if (stage === 'error') {
        await this.handleFlowError(planning);
      } else if (STAGE_TO_CHECKPOINT[stage]) {
        // We're at a HITL checkpoint — present artifact and ask for review
        await this.presentArtifactForReview(planning, stage);
      } else {
        // Processing stage — flow should continue automatically
        // This shouldn't happen with our graph design, but handle it
        logger.warn(`Unexpected stage "${stage}" — attempting to continue`);
        await this.runFlowUntilHitl(planning);
      }
    } catch (error) {
      logger.error(`Flow execution error for session ${sessionId}:`, error);
      await this.surface
        ?.reportError(
          sessionId,
          `Planning flow error: ${error instanceof Error ? error.message : String(error)}`
        )
        .catch((e: unknown) => logger.error('Failed to report error:', e));
    }
  }

  /**
   * Present an artifact document to the user and ask for review.
   */
  private async presentArtifactForReview(
    planning: ActivePlanning,
    stage: PlanningStage
  ): Promise<void> {
    const { sessionId, state } = planning;
    const checkpoint = STAGE_TO_CHECKPOINT[stage];

    // Get the artifact for this stage
    const artifact = this.getArtifactForStage(state, stage);
    if (!artifact) {
      logger.error(`No artifact found for stage ${stage}`);
      await this.surface?.reportError(sessionId, `Internal error: no artifact for stage ${stage}`);
      return;
    }

    // Create or update the document in Linear
    let documentId = planning.documents[checkpoint];
    if (documentId) {
      await this.surface?.updateDocument?.(documentId, artifact.content, artifact.title);
    } else {
      const doc = await this.surface?.createDocument?.(sessionId, artifact.title, artifact.content);
      if (doc) {
        documentId = doc.id;
        planning.documents[checkpoint] = documentId;
      }
    }

    // Show progress
    await this.surface?.showProgress(sessionId, 'Review required', artifact.title);

    // Ask the user to review
    const revisionCount = (state.revisionCounts as Record<string, number>)?.[checkpoint] || 0;
    const revisionNote =
      revisionCount > 0 ? ` (revision ${revisionCount} — max 3 before auto-approve)` : '';

    await this.surface?.askQuestion(
      sessionId,
      `Please review the **${artifact.title}**${revisionNote}.\n\nThe document has been saved to your project. You can:\n- **Approve** to continue to the next step\n- **Revise** with specific feedback\n- **Cancel** to stop the planning process`,
      [
        { label: 'Approve', description: 'Continue to the next step', value: 'approve' },
        {
          label: 'Revise',
          description: 'Provide feedback for revision',
          value: 'revise',
        },
        { label: 'Cancel', description: 'Stop the planning process', value: 'cancel' },
      ]
    );

    logger.info(`Presented ${artifact.title} for review at checkpoint "${checkpoint}"`);
  }

  /**
   * Handle flow completion — all milestones planned and issues created
   */
  private async handleFlowCompleted(planning: ActivePlanning): Promise<void> {
    const { sessionId, projectName, state } = planning;
    const issueCount = (state.createdIssueIds as string[])?.length || 0;
    const milestoneCount = state.milestones?.length || 0;

    logger.info(
      `Planning completed for "${projectName}": ${milestoneCount} milestones, ${issueCount} issues`
    );

    // Update plan to all completed
    const completedSteps = PLAN_STEPS.map((s) => ({ ...s, status: 'completed' as const }));
    await this.surface?.updatePlan?.(sessionId, completedSteps);

    // Send final response
    const summary = [
      `## Planning Complete: ${projectName}`,
      '',
      `Created **${milestoneCount} milestones** with **${issueCount} issues** in Linear.`,
      '',
      '### Documents Created',
      ...Object.entries(planning.documents).map(
        ([checkpoint, docId]) => `- ${checkpoint}: ${docId}`
      ),
      '',
      'The project is now ready for execution. Issues have been created in Linear with proper dependencies.',
    ].join('\n');

    await this.surface?.sendResponse(sessionId, summary);

    // Cleanup
    this.activePlannings.delete(sessionId);
    this.projectToSession.delete(planning.projectId);
  }

  /**
   * Handle flow error
   */
  private async handleFlowError(planning: ActivePlanning): Promise<void> {
    const { sessionId, state } = planning;
    const errors = (state.errors as string[]) || [];

    logger.error(`Planning flow errored: ${errors.join(', ')}`);
    await this.surface?.reportError(
      sessionId,
      `Planning encountered errors:\n${errors.map((e) => `- ${e}`).join('\n')}`
    );

    this.activePlannings.delete(sessionId);
    this.projectToSession.delete(planning.projectId);
  }

  // ─── Helpers ──────────────────────────────────────────────────

  /**
   * Parse user's text response into a structured HITL decision.
   */
  private parseUserResponse(prompt: string, currentStage: string): HITLResponse {
    const checkpoint = STAGE_TO_CHECKPOINT[currentStage] || currentStage;
    const lower = prompt.toLowerCase().trim();

    if (lower === 'approve' || lower.startsWith('approve') || lower === 'lgtm' || lower === 'yes') {
      return { decision: 'approve', checkpoint };
    }

    if (lower === 'cancel' || lower === 'stop' || lower === 'abort') {
      return { decision: 'cancel', checkpoint };
    }

    // Default: treat as revision feedback
    return {
      decision: 'revise',
      feedback: prompt,
      checkpoint,
    };
  }

  /**
   * Get the artifact document for a given stage
   */
  private getArtifactForStage(
    state: Partial<ProjectPlanningState>,
    stage: PlanningStage
  ): PlanningArtifact | undefined {
    switch (stage) {
      case 'planning_doc_review':
        return state.planningDoc as PlanningArtifact | undefined;
      case 'research_doc_review':
        return state.researchDoc as PlanningArtifact | undefined;
      case 'prd_review':
        return state.prdDoc as PlanningArtifact | undefined;
      case 'milestone_review':
        return state.milestoneDoc as PlanningArtifact | undefined;
      default:
        return undefined;
    }
  }

  /**
   * Update the Linear session plan to reflect current progress
   */
  private async updatePlanProgress(sessionId: string, stage: PlanningStage): Promise<void> {
    const stepIndex = STAGE_TO_STEP_INDEX[stage];
    if (stepIndex === undefined) return;

    const steps = PLAN_STEPS.map((step, i) => {
      if (i < stepIndex) return { ...step, status: 'completed' as const };
      if (i === stepIndex) return { ...step, status: 'inProgress' as const };
      return { ...step, status: 'pending' as const };
    });

    await this.surface?.updatePlan?.(sessionId, steps);
  }
}
