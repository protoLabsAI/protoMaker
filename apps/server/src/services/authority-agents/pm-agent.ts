/**
 * PM Authority Agent - Product Manager AI Agent
 *
 * First AI executive in the authority hierarchy. Responsible for:
 * - Picking up injected ideas (workItemState='idea')
 * - AI-powered PRD review (clarity, feasibility, scope, missing details)
 * - Approving ideas or suggesting changes with feedback loop
 * - Transitioning ideas through: idea → pm_review → approved (or pm_changes_requested)
 * - Creating epics for large features once approved
 *
 * The PM agent listens for 'authority:idea-injected' events and processes
 * ideas through the authority proposal system, respecting trust and policy.
 *
 * Review loop:
 *   1. CTO submits idea with spec-level description
 *   2. PM reviews via AI → APPROVE or SUGGEST_CHANGES
 *   3. If SUGGEST_CHANGES: posts feedback to Discord thread, waits for CTO
 *   4. CTO approves or revises → PM re-reviews
 *   5. On APPROVE: transitions to 'approved', ProjM picks up for decomposition
 *
 * All state transitions go through AuthorityService.submitProposal() so they
 * are subject to policy checks and approval workflows.
 */

import type { Feature } from '@automaker/types';
import type { AuthorityAgent } from '@automaker/types';
import { createLogger } from '@automaker/utils';
import type { EventEmitter } from '../../lib/events.js';
import type { AuthorityService } from '../authority-service.js';
import type { FeatureLoader } from '../feature-loader.js';
import { simpleQuery } from '../../providers/simple-query-service.js';

const logger = createLogger('PMAgent');

/** How long to wait before processing a new idea (debounce) */
const IDEA_PROCESSING_DELAY_MS = 2000;

/** Model to use for PM reviews */
const PM_REVIEW_MODEL = 'claude-sonnet-4-20250514';

interface IdeaInjectedPayload {
  projectPath: string;
  featureId: string;
  title: string;
  description: string;
  injectedBy: string;
  injectedAt: string;
}

/** Result of an AI-powered PRD review */
interface PMReviewResult {
  verdict: 'approve' | 'suggest_changes';
  feedback: string;
  suggestedDescription?: string;
  complexity: 'small' | 'medium' | 'large' | 'architectural';
  milestones?: Array<{
    title: string;
    description: string;
  }>;
}

export class PMAuthorityAgent {
  private readonly events: EventEmitter;
  private readonly authorityService: AuthorityService;
  private readonly featureLoader: FeatureLoader;

  /** Registered agent identities per project */
  private agents = new Map<string, AuthorityAgent>();

  /** Track initialized projects to avoid double-registration */
  private initializedProjects = new Set<string>();

  /** Track which ideas are being processed to avoid duplicates */
  private processing = new Set<string>();

  /** Whether the global event listener has been registered */
  private listenerRegistered = false;

  constructor(
    events: EventEmitter,
    authorityService: AuthorityService,
    featureLoader: FeatureLoader
  ) {
    this.events = events;
    this.authorityService = authorityService;
    this.featureLoader = featureLoader;

    // Register the global idea listener once
    this.registerEventListener();
  }

  /**
   * Register a single global event listener for idea-injected and CTO approval events.
   * Routes to the correct project-specific handler.
   */
  private registerEventListener(): void {
    if (this.listenerRegistered) return;
    this.listenerRegistered = true;

    this.events.subscribe((type, payload) => {
      if (type === 'authority:idea-injected') {
        const idea = payload as IdeaInjectedPayload;
        if (this.initializedProjects.has(idea.projectPath)) {
          this.handleIdeaInjected(idea);
        }
      }

      // CTO approved an idea after PM suggested changes
      if (type === 'authority:cto-approved-idea') {
        const data = payload as {
          projectPath: string;
          featureId: string;
          updatedDescription?: string;
        };
        if (this.initializedProjects.has(data.projectPath)) {
          void this.handleCTOApproval(data.projectPath, data.featureId, data.updatedDescription);
        }
      }
    });
  }

  /**
   * Initialize the PM agent for a project.
   * Registers as an authority agent and starts listening for ideas.
   * Safe to call multiple times - subsequent calls are no-ops.
   */
  async initialize(projectPath: string): Promise<void> {
    if (this.initializedProjects.has(projectPath)) {
      return;
    }

    // Register as PM authority agent for this project
    const agent = await this.authorityService.registerAgent('product-manager', projectPath);
    this.agents.set(projectPath, agent);
    this.initializedProjects.add(projectPath);
    logger.info(`PM agent registered for project: ${agent.id}`);

    // Scan for any existing unprocessed ideas
    await this.scanForUnprocessedIdeas(projectPath);
  }

  /**
   * Handle a newly injected idea.
   * Debounces processing to avoid rapid-fire API calls.
   */
  private handleIdeaInjected(idea: IdeaInjectedPayload): void {
    if (this.processing.has(idea.featureId)) {
      logger.debug(`Already processing idea ${idea.featureId}, skipping`);
      return;
    }

    logger.info(`New idea received: "${idea.title}" (${idea.featureId})`);

    // Delay slightly to allow for any rapid-fire injections
    setTimeout(() => {
      void this.processIdea(idea.projectPath, idea.featureId);
    }, IDEA_PROCESSING_DELAY_MS);
  }

  /**
   * Scan for features with workItemState='idea' that haven't been processed yet.
   * Also picks up features in 'pm_changes_requested' that may need re-review.
   */
  private async scanForUnprocessedIdeas(projectPath: string): Promise<void> {
    try {
      const features = await this.featureLoader.getAll(projectPath);
      const unprocessedIdeas = features.filter((f) => f.workItemState === 'idea');

      if (unprocessedIdeas.length > 0) {
        logger.info(`Found ${unprocessedIdeas.length} unprocessed ideas on startup`);
        for (const idea of unprocessedIdeas) {
          void this.processIdea(projectPath, idea.id);
        }
      }
    } catch (error) {
      logger.error('Failed to scan for unprocessed ideas:', error);
    }
  }

  /**
   * Process an idea through the PM review pipeline:
   * 1. Transition idea → pm_review (submit proposal)
   * 2. Run AI-powered review of the PRD/description
   * 3. If approved: transition pm_review → approved, emit event
   * 4. If changes needed: transition pm_review → pm_changes_requested, emit event
   *    Wait for CTO to approve or revise (handled by handleCTOApproval)
   */
  private async processIdea(projectPath: string, featureId: string): Promise<void> {
    if (this.processing.has(featureId)) return;
    this.processing.add(featureId);

    try {
      const agent = this.agents.get(projectPath);
      if (!agent) {
        logger.error(`PM agent not initialized for project: ${projectPath}`);
        return;
      }

      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) {
        logger.warn(`Feature ${featureId} not found, skipping`);
        return;
      }

      if (feature.workItemState !== 'idea') {
        logger.debug(
          `Feature ${featureId} is not in 'idea' state (${feature.workItemState}), skipping`
        );
        return;
      }

      logger.info(`Processing idea: "${feature.title}" (${featureId})`);

      // Step 1: Propose transition idea → pm_review
      const reviewDecision = await this.authorityService.submitProposal(
        {
          who: agent.id,
          what: 'transition_status',
          target: featureId,
          justification: `PM agent beginning AI-powered review of idea: "${feature.title}"`,
          risk: 'low',
          statusTransition: { from: 'idea', to: 'pm_review' },
        },
        projectPath
      );

      if (reviewDecision.verdict === 'deny') {
        logger.warn(`PM review transition denied for ${featureId}: ${reviewDecision.reason}`);
        return;
      }

      if (reviewDecision.verdict === 'require_approval') {
        logger.info(`PM review transition requires approval for ${featureId}`);
        return;
      }

      // Transition approved - update workItemState
      await this.featureLoader.update(projectPath, featureId, {
        workItemState: 'pm_review',
      });

      this.events.emit('authority:pm-review-started', {
        projectPath,
        featureId,
        agentId: agent.id,
      });

      // Step 2: Run AI-powered review
      const review = await this.reviewIdea(feature, projectPath);

      // Step 3: Handle review verdict
      if (review.verdict === 'approve') {
        await this.handleApproval(projectPath, featureId, feature, review, agent);
      } else {
        await this.handleChangesRequested(projectPath, featureId, feature, review, agent);
      }
    } catch (error) {
      logger.error(`Failed to process idea ${featureId}:`, error);
    } finally {
      this.processing.delete(featureId);
    }
  }

  /**
   * Run AI-powered review of an idea/PRD.
   * Uses Claude to evaluate clarity, feasibility, scope, and missing details.
   */
  private async reviewIdea(feature: Feature, projectPath: string): Promise<PMReviewResult> {
    const title = feature.title || 'Untitled';
    const description = feature.description || '';

    // Gather text file contents if attached
    const attachmentContext = (feature.textFilePaths || [])
      .map((f) => `\n--- Attached file: ${f.filename} ---\n${f.content}`)
      .join('\n');

    const fullDescription = description + attachmentContext;

    const systemPrompt = `You are a senior Product Manager reviewing a Product Requirements Document (PRD) / feature idea.

Your job is to evaluate the idea and either APPROVE it or SUGGEST CHANGES.

Evaluate on these criteria:
1. **Clarity**: Is the description clear enough for engineers to implement?
2. **Feasibility**: Is this technically achievable? Are there obvious blockers?
3. **Scope**: Is the scope appropriate? Not too broad, not too narrow?
4. **Missing Details**: Are acceptance criteria, edge cases, or key requirements missing?
5. **Milestones**: Can this be broken into logical milestones for iterative delivery?

You MUST respond with valid JSON matching this schema:
{
  "verdict": "approve" | "suggest_changes",
  "feedback": "Your detailed feedback explaining the decision",
  "suggestedDescription": "If suggesting changes, provide the improved description here. Omit if approving.",
  "complexity": "small" | "medium" | "large" | "architectural",
  "milestones": [
    { "title": "Milestone name", "description": "What this milestone covers" }
  ]
}

Guidelines:
- APPROVE if the description is clear, scoped, and actionable even if not perfect
- SUGGEST_CHANGES only if there are significant gaps that would block implementation
- Always suggest milestones (even for small features, at least 1 milestone)
- Keep feedback constructive and specific
- The suggestedDescription should be a complete, improved version (not a diff)`;

    const prompt = `Review this feature idea:

**Title:** ${title}

**Description:**
${fullDescription}

Provide your review as JSON.`;

    try {
      const result = await simpleQuery({
        prompt,
        systemPrompt,
        model: PM_REVIEW_MODEL,
        cwd: projectPath,
        maxTurns: 1,
        allowedTools: [],
      });

      // Parse the JSON response
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('PM review did not return valid JSON, falling back to approve');
        return this.fallbackReview(feature);
      }

      const parsed = JSON.parse(jsonMatch[0]) as PMReviewResult;

      // Validate required fields
      if (!parsed.verdict || !parsed.feedback || !parsed.complexity) {
        logger.warn('PM review missing required fields, falling back');
        return this.fallbackReview(feature);
      }

      // Ensure milestones exist
      if (!parsed.milestones || parsed.milestones.length === 0) {
        parsed.milestones = [
          {
            title: title,
            description: feature.description || title,
          },
        ];
      }

      return parsed;
    } catch (error) {
      logger.error('AI review failed, falling back to heuristic:', error);
      return this.fallbackReview(feature);
    }
  }

  /**
   * Fallback review when AI is unavailable.
   * Uses simple heuristics (word count, structure) to auto-approve or flag.
   */
  private fallbackReview(feature: Feature): PMReviewResult {
    const description = feature.description || '';
    const title = feature.title || 'Untitled';
    const wordCount = description.split(/\s+/).length;

    // Auto-approve if description has reasonable length and structure
    const hasStructure = /[-*•]|\d+[.)]/.test(description);
    const isDetailed = wordCount > 30;

    let complexity: PMReviewResult['complexity'] = 'small';
    if (wordCount > 500 || /\b(architecture|infrastructure|migration)\b/i.test(description)) {
      complexity = 'architectural';
    } else if (wordCount > 200) {
      complexity = 'large';
    } else if (wordCount > 50) {
      complexity = 'medium';
    }

    if (isDetailed && hasStructure) {
      return {
        verdict: 'approve',
        feedback: 'Auto-approved: Description is detailed and structured.',
        complexity,
        milestones: [{ title, description: description.slice(0, 200) }],
      };
    }

    if (wordCount < 10) {
      return {
        verdict: 'suggest_changes',
        feedback:
          'The description is too brief. Please provide more detail about what needs to be built, acceptance criteria, and expected behavior.',
        suggestedDescription: `## ${title}\n\n**Description:**\n${description}\n\n**TODO: Add the following:**\n- Detailed requirements\n- Acceptance criteria\n- Expected behavior\n- Edge cases to consider`,
        complexity,
        milestones: [{ title, description }],
      };
    }

    return {
      verdict: 'approve',
      feedback: 'Auto-approved via heuristic (AI unavailable).',
      complexity,
      milestones: [{ title, description: description.slice(0, 200) }],
    };
  }

  /**
   * Handle an approved idea: transition to 'approved' state.
   */
  private async handleApproval(
    projectPath: string,
    featureId: string,
    feature: Feature,
    review: PMReviewResult,
    agent: AuthorityAgent
  ): Promise<void> {
    // Propose transition pm_review → approved
    const approvedDecision = await this.authorityService.submitProposal(
      {
        who: agent.id,
        what: 'transition_status',
        target: featureId,
        justification: `PM approved: "${feature.title}". ${review.feedback}`,
        risk: 'low',
        statusTransition: { from: 'pm_review', to: 'approved' },
      },
      projectPath
    );

    if (approvedDecision.verdict === 'deny') {
      logger.warn(`Approved transition denied for ${featureId}: ${approvedDecision.reason}`);
      return;
    }

    if (approvedDecision.verdict === 'require_approval') {
      logger.info(`Approved transition requires CTO approval for ${featureId}`);
      return;
    }

    // Transition to approved
    await this.featureLoader.update(projectPath, featureId, {
      workItemState: 'approved',
      complexity: review.complexity,
    });

    this.events.emit('authority:pm-review-approved', {
      projectPath,
      featureId,
      agentId: agent.id,
      feedback: review.feedback,
      complexity: review.complexity,
      milestones: review.milestones,
    });

    // Also emit research-completed for backward compatibility with ProjM
    this.events.emit('authority:pm-research-completed', {
      projectPath,
      featureId,
      agentId: agent.id,
      analysis: {
        complexity: review.complexity,
        milestones: review.milestones,
      },
    });

    logger.info(`Idea "${feature.title}" approved by PM → ready for decomposition`);
  }

  /**
   * Handle changes requested: transition to 'pm_changes_requested', post feedback.
   */
  private async handleChangesRequested(
    projectPath: string,
    featureId: string,
    feature: Feature,
    review: PMReviewResult,
    agent: AuthorityAgent
  ): Promise<void> {
    // Update feature with PM's suggested improvements
    const updates: Partial<Feature> = {
      workItemState: 'pm_changes_requested' as Feature['workItemState'],
      complexity: review.complexity,
    };

    // Store the PM's suggested description so CTO can see it
    if (review.suggestedDescription) {
      updates.description = review.suggestedDescription;
    }

    await this.featureLoader.update(projectPath, featureId, updates);

    this.events.emit('authority:pm-review-changes-requested', {
      projectPath,
      featureId,
      agentId: agent.id,
      feedback: review.feedback,
      suggestedDescription: review.suggestedDescription,
      complexity: review.complexity,
      milestones: review.milestones,
    });

    logger.info(`PM requested changes for "${feature.title}": ${review.feedback}`);
  }

  /**
   * Handle CTO approval after PM suggested changes.
   * CTO can approve as-is or provide an updated description.
   * Re-runs AI review if description was updated, or proceeds to approval if accepted.
   */
  private async handleCTOApproval(
    projectPath: string,
    featureId: string,
    updatedDescription?: string
  ): Promise<void> {
    if (this.processing.has(featureId)) return;
    this.processing.add(featureId);

    try {
      const agent = this.agents.get(projectPath);
      if (!agent) return;

      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) return;

      if (feature.workItemState !== 'pm_changes_requested') {
        logger.debug(`Feature ${featureId} not in pm_changes_requested state, skipping`);
        return;
      }

      // If CTO provided an updated description, update the feature and re-review
      if (updatedDescription) {
        await this.featureLoader.update(projectPath, featureId, {
          description: updatedDescription,
          workItemState: 'pm_review',
        });

        // Re-run the review with the updated description
        const updatedFeature = { ...feature, description: updatedDescription };
        const review = await this.reviewIdea(updatedFeature, projectPath);

        if (review.verdict === 'approve') {
          await this.handleApproval(projectPath, featureId, updatedFeature, review, agent);
        } else {
          await this.handleChangesRequested(projectPath, featureId, updatedFeature, review, agent);
        }
      } else {
        // CTO approved PM's suggestion as-is
        const review: PMReviewResult = {
          verdict: 'approve',
          feedback: 'CTO approved PM suggestions.',
          complexity: (feature.complexity as PMReviewResult['complexity']) || 'medium',
          milestones: [
            {
              title: feature.title || 'Untitled',
              description: (feature.description || '').slice(0, 200),
            },
          ],
        };

        await this.featureLoader.update(projectPath, featureId, {
          workItemState: 'pm_review',
        });

        await this.handleApproval(projectPath, featureId, feature, review, agent);
      }
    } catch (error) {
      logger.error(`Failed to handle CTO approval for ${featureId}:`, error);
    } finally {
      this.processing.delete(featureId);
    }
  }

  /**
   * Get the registered agent for a project.
   */
  getAgent(projectPath: string): AuthorityAgent | null {
    return this.agents.get(projectPath) ?? null;
  }
}
