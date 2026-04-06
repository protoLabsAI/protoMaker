/**
 * PlanningService — orchestrates the full planning pipeline for A2A `plan` / `plan_resume` skills.
 *
 * Flow:
 *   1. Draft SPARC PRD from idea text (LLM call)
 *   2. Run AntagonisticReviewService.executeReview() — Ava (operational) vs Jon (strategic)
 *   3. If both verdicts approve with high confidence, auto-approve (skip HITL)
 *   4. Otherwise publish HITLRequest back to Workstacean bus (or fall back to HITLFormService)
 *   5. Return immediately with { status: "pending_approval", correlationId }
 *
 *   On resume:
 *   1. Look up stored PlanState by correlationId
 *   2. Apply decision (approve / reject / modify)
 *   3. If approved: create project + features on board, stamp correlationId
 *   4. Return { status: "created", projectSlug, featureCount }
 */

import { createLogger } from '@protolabsai/utils';
import type { SPARCPrd, ConsolidatedReview, ReviewResult } from '@protolabsai/types';
import type { AntagonisticReviewService } from './antagonistic-review-service.js';
import type { ProjectService } from './project-service.js';
import type { FeatureLoader } from './feature-loader.js';
import type { EventEmitter } from '../lib/events.js';
import { resolveModelString } from '@protolabsai/model-resolver';
import { simpleQuery } from '../providers/simple-query-service.js';
import { slugify } from '@protolabsai/utils';
import { PlanStore } from './plan-store.js';

const logger = createLogger('PlanningService');

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HITLRequest {
  type: 'hitl_request';
  correlationId: string;
  title: string;
  summary: string;
  avaVerdict?: { score: number; concerns: string[]; verdict: string };
  jonVerdict?: { score: number; concerns: string[]; verdict: string };
  options: string[];
  expiresAt: string;
  replyTopic: string;
  sourceMeta?: { interface: string; channelId?: string; userId?: string };
}

export interface PlanState {
  correlationId: string;
  idea: string;
  prd: SPARCPrd;
  review: ConsolidatedReview;
  projectPath: string;
  replyTopic?: string;
  source?: { interface: string; channelId?: string; userId?: string };
  createdAt: string;
}

export interface StartPlanOptions {
  correlationId: string;
  idea: string;
  replyTopic?: string;
  source?: { interface: string; channelId?: string; userId?: string };
  projectPath: string;
}

export interface ResumePlanOptions {
  correlationId: string;
  decision: 'approve' | 'reject' | 'modify';
  feedback?: string;
  projectPath: string;
}

export interface StartPlanResult {
  status: 'pending_approval' | 'created';
  correlationId: string;
  projectSlug?: string;
  featureCount?: number;
}

export interface ResumePlanResult {
  status: 'created' | 'rejected' | 'pending_approval';
  correlationId?: string;
  projectSlug?: string;
  featureCount?: number;
}

// ─── Bus publish utility ────────────────────────────────────────────────────

/**
 * Publish a message to the Workstacean bus via HTTP POST.
 * Falls back to logging if the bus is unreachable.
 *
 * TODO: Replace with a proper Workstacean client when the bus HTTP publish
 * endpoint is finalized. Currently assumes POST /publish with JSON body.
 */
async function publishToBus(topic: string, payload: unknown): Promise<void> {
  const busUrl = process.env['WORKSTACEAN_URL'] ?? 'http://workstacean:3000';
  const busApiKey = process.env['WORKSTACEAN_API_KEY'] ?? '';

  try {
    const res = await fetch(`${busUrl}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(busApiKey ? { 'X-API-Key': busApiKey } : {}),
      },
      body: JSON.stringify({ topic, payload }),
    });

    if (!res.ok) {
      logger.warn(`Bus publish to "${topic}" returned ${res.status}: ${await res.text()}`);
    } else {
      logger.info(`Published to bus topic "${topic}"`);
    }
  } catch (err) {
    // Bus unreachable — log but don't fail the pipeline
    logger.warn(`Bus publish to "${topic}" failed (bus may not be running):`, err);
  }
}

// ─── PRD drafting ───────────────────────────────────────────────────────────

const SPARC_DRAFT_SYSTEM = `You are a senior product manager at protoLabs. Generate a SPARC PRD from a raw idea.

You MUST respond with ONLY a valid JSON object — no markdown, no code fences, no preamble.
The JSON object must have exactly these 5 string fields:

{
  "situation": "Current state and context...",
  "problem": "The core problem to solve...",
  "approach": "How we'll solve it...",
  "results": "Expected outcomes and success criteria...",
  "constraints": "Technical/business constraints and non-goals..."
}

Each section should be 2-4 paragraphs of rich, actionable content. Be specific, not generic.`;

async function draftPRD(idea: string, projectPath: string): Promise<SPARCPrd> {
  const result = await simpleQuery({
    prompt: `Draft a SPARC PRD for the following idea. Respond with ONLY a JSON object.\n\nIdea: ${idea}`,
    systemPrompt: SPARC_DRAFT_SYSTEM,
    model: resolveModelString('sonnet'),
    cwd: projectPath,
    maxTurns: 1,
    allowedTools: [],
    traceContext: { agentRole: 'prd-drafter', phase: 'plan' },
  });

  const text = result.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to extract PRD JSON from LLM response');
  }

  const raw = JSON.parse(jsonMatch[0]) as {
    situation: string;
    problem: string;
    approach: string;
    results: string;
    constraints: string;
  };

  return {
    situation: raw.situation || '',
    problem: raw.problem || '',
    approach: raw.approach || '',
    results: raw.results || '',
    constraints: raw.constraints || '',
    generatedAt: new Date().toISOString(),
  };
}

// ─── Verdict parsing helpers ────────────────────────────────────────────────

/** Estimate a numeric score (1-5) from a review verdict string */
function estimateScore(review: ReviewResult): number {
  const verdict = (review.verdict || '').toUpperCase();
  if (verdict.includes('APPROVE') && !verdict.includes('CONDITION')) return 4.5;
  if (verdict.includes('APPROVE')) return 3.5;
  if (verdict.includes('REJECT')) return 1.5;
  return 3.0;
}

/** Check if a review auto-approves (score > 4.0 and no blocking concerns) */
function isAutoApprove(review: ReviewResult): boolean {
  const score = estimateScore(review);
  const verdict = (review.verdict || '').toUpperCase();
  return score > 4.0 && !verdict.includes('REJECT') && !verdict.includes('BLOCK');
}

// ─── Service ────────────────────────────────────────────────────────────────

export class PlanningService {
  private antagonisticReview: AntagonisticReviewService;
  private projectService: ProjectService;
  private featureLoader: FeatureLoader;
  private events: EventEmitter;

  /** SQLite-backed plan store — survives server restarts. */
  private planStore: PlanStore;

  constructor(deps: {
    antagonisticReview: AntagonisticReviewService;
    projectService: ProjectService;
    featureLoader: FeatureLoader;
    events: EventEmitter;
  }) {
    this.antagonisticReview = deps.antagonisticReview;
    this.projectService = deps.projectService;
    this.featureLoader = deps.featureLoader;
    this.events = deps.events;
    this.planStore = new PlanStore();
  }

  /**
   * Start a new plan from a raw idea.
   *
   * 1. Drafts a SPARC PRD from the idea
   * 2. Runs antagonistic review (Ava vs Jon)
   * 3. If both auto-approve: creates project immediately
   * 4. Otherwise: publishes HITLRequest and returns pending
   */
  async startPlan(options: StartPlanOptions): Promise<StartPlanResult> {
    const { correlationId, idea, replyTopic, source, projectPath } = options;

    logger.info(
      `[plan] Starting plan for correlationId=${correlationId}: "${idea.slice(0, 80)}..."`
    );

    // 1. Draft SPARC PRD
    let prd: SPARCPrd;
    try {
      prd = await draftPRD(idea, projectPath);
      logger.info(`[plan] PRD drafted for correlationId=${correlationId}`);
    } catch (err) {
      logger.error(`[plan] PRD drafting failed for correlationId=${correlationId}:`, err);
      throw err;
    }

    // 2. Run antagonistic review
    const prdId = `plan-${correlationId}`;
    let review: ConsolidatedReview;
    try {
      review = await this.antagonisticReview.executeReview({
        prd,
        prdId,
        projectPath,
      });
      logger.info(
        `[plan] Antagonistic review completed for correlationId=${correlationId}, success=${review.success}`
      );
    } catch (err) {
      logger.error(`[plan] Antagonistic review failed for correlationId=${correlationId}:`, err);
      throw err;
    }

    // 3. Check if both reviewers auto-approve (high confidence)
    const avaApproves =
      review.success && review.avaReview.success && isAutoApprove(review.avaReview);
    const jonApproves =
      review.success && review.jonReview.success && isAutoApprove(review.jonReview);

    if (avaApproves && jonApproves) {
      logger.info(
        `[plan] Both reviewers auto-approved for correlationId=${correlationId} — creating project`
      );
      const result = await this.createBoardArtifacts(correlationId, prd, review, projectPath);
      return {
        status: 'created',
        correlationId,
        projectSlug: result.projectSlug,
        featureCount: result.featureCount,
      };
    }

    // 4. Store plan state for resume
    const planState: PlanState = {
      correlationId,
      idea,
      prd,
      review,
      projectPath,
      replyTopic,
      source,
      createdAt: new Date().toISOString(),
    };
    this.planStore.save(correlationId, planState);

    // 5. Publish HITLRequest
    const hitlRequest: HITLRequest = {
      type: 'hitl_request',
      correlationId,
      title: `Plan Review: ${idea.slice(0, 60)}${idea.length > 60 ? '...' : ''}`,
      summary: review.resolution || 'Review completed. Awaiting human decision.',
      avaVerdict: {
        score: estimateScore(review.avaReview),
        concerns: review.avaReview.concerns ?? [],
        verdict: review.avaReview.verdict || 'unknown',
      },
      jonVerdict: {
        score: estimateScore(review.jonReview),
        concerns: review.jonReview.concerns ?? [],
        verdict: review.jonReview.verdict || 'unknown',
      },
      options: ['approve', 'reject', 'modify'],
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
      replyTopic: replyTopic || `plan.hitl.${correlationId}`,
      sourceMeta: source,
    };

    if (replyTopic) {
      // Publish back to the Workstacean bus
      await publishToBus(replyTopic, hitlRequest);
    } else {
      // No bus topic — log the HITL request (caller can poll via plan_resume)
      logger.info(
        `[plan] No replyTopic — HITLRequest for correlationId=${correlationId} stored locally. ` +
          `Use plan_resume to approve/reject.`
      );
    }

    // Emit event for any local listeners (UI, Discord, etc.)
    this.events.emit('plan:hitl-requested', {
      correlationId,
      title: hitlRequest.title,
      summary: hitlRequest.summary,
    });

    return { status: 'pending_approval', correlationId };
  }

  /**
   * Resume a plan after HITL decision.
   *
   * 1. Look up stored PlanState
   * 2. If reject: clean up and return
   * 3. If approve/modify: create board artifacts
   */
  async resumePlan(options: ResumePlanOptions): Promise<ResumePlanResult> {
    const { correlationId, decision, feedback, projectPath } = options;

    logger.info(`[plan_resume] Resuming correlationId=${correlationId}, decision=${decision}`);

    const planState = this.planStore.get(correlationId);
    if (!planState) {
      throw new Error(
        `No pending plan found for correlationId="${correlationId}". ` +
          `It may have expired or already been processed.`
      );
    }

    if (decision === 'reject') {
      this.planStore.delete(correlationId);
      this.events.emit('plan:rejected', { correlationId });
      logger.info(`[plan_resume] Plan rejected for correlationId=${correlationId}`);
      return { status: 'rejected' };
    }

    // For "modify": re-draft PRD with feedback, re-run antagonistic review, re-emit HITL gate
    if (decision === 'modify' && feedback) {
      logger.info(
        `[plan_resume] Modify requested for correlationId=${correlationId}, re-running pipeline`
      );

      const resolvedProjectPath = projectPath || planState.projectPath;

      // Re-draft PRD incorporating feedback
      let prd: SPARCPrd;
      try {
        prd = await draftPRD(
          `${planState.idea}\n\n---\nModification feedback from review:\n${feedback}`,
          resolvedProjectPath
        );
        logger.info(
          `[plan_resume] PRD re-drafted with feedback for correlationId=${correlationId}`
        );
      } catch (err) {
        logger.error(`[plan_resume] PRD re-draft failed for correlationId=${correlationId}:`, err);
        throw err;
      }

      // Re-run antagonistic review
      const prdId = `plan-${correlationId}-mod`;
      let review: ConsolidatedReview;
      try {
        review = await this.antagonisticReview.executeReview({
          prd,
          prdId,
          projectPath: resolvedProjectPath,
        });
        logger.info(
          `[plan_resume] Re-review completed for correlationId=${correlationId}, success=${review.success}`
        );
      } catch (err) {
        logger.error(`[plan_resume] Re-review failed for correlationId=${correlationId}:`, err);
        throw err;
      }

      // Check if both reviewers now auto-approve
      const avaApproves =
        review.success && review.avaReview.success && isAutoApprove(review.avaReview);
      const jonApproves =
        review.success && review.jonReview.success && isAutoApprove(review.jonReview);

      if (avaApproves && jonApproves) {
        logger.info(
          `[plan_resume] Both reviewers auto-approved after modify for correlationId=${correlationId}`
        );
        this.planStore.delete(correlationId);
        const result = await this.createBoardArtifacts(
          correlationId,
          prd,
          review,
          resolvedProjectPath
        );
        this.events.emit('plan:created', {
          correlationId,
          projectSlug: result.projectSlug,
          featureCount: result.featureCount,
        });
        return {
          status: 'created',
          correlationId,
          projectSlug: result.projectSlug,
          featureCount: result.featureCount,
        };
      }

      // Update stored state with new PRD and review
      const updatedState: PlanState = {
        ...planState,
        prd,
        review,
        projectPath: resolvedProjectPath,
        createdAt: new Date().toISOString(),
      };
      this.planStore.save(correlationId, updatedState);

      // Re-emit HITLRequest
      const hitlRequest: HITLRequest = {
        type: 'hitl_request',
        correlationId,
        title: `Plan Review (modified): ${planState.idea.slice(0, 50)}${planState.idea.length > 50 ? '...' : ''}`,
        summary: review.resolution || 'Modified review completed. Awaiting human decision.',
        avaVerdict: {
          score: estimateScore(review.avaReview),
          concerns: review.avaReview.concerns ?? [],
          verdict: review.avaReview.verdict || 'unknown',
        },
        jonVerdict: {
          score: estimateScore(review.jonReview),
          concerns: review.jonReview.concerns ?? [],
          verdict: review.jonReview.verdict || 'unknown',
        },
        options: ['approve', 'reject', 'modify'],
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        replyTopic: planState.replyTopic || `plan.hitl.${correlationId}`,
        sourceMeta: planState.source,
      };

      if (planState.replyTopic) {
        await publishToBus(planState.replyTopic, hitlRequest);
      }

      this.events.emit('plan:hitl-requested', {
        correlationId,
        title: hitlRequest.title,
        summary: hitlRequest.summary,
      });

      return { status: 'pending_approval', correlationId };
    }

    // For "approve" (or "modify" without feedback — treat as approve):
    const result = await this.createBoardArtifacts(
      correlationId,
      planState.prd,
      planState.review,
      projectPath || planState.projectPath
    );

    // Clean up stored state
    this.planStore.delete(correlationId);

    this.events.emit('plan:created', {
      correlationId,
      projectSlug: result.projectSlug,
      featureCount: result.featureCount,
    });

    logger.info(
      `[plan_resume] Project created: slug=${result.projectSlug}, features=${result.featureCount}`
    );

    return {
      status: 'created',
      correlationId,
      projectSlug: result.projectSlug,
      featureCount: result.featureCount,
    };
  }

  /**
   * Create project + features on the board from an approved PRD.
   * Stamps correlationId on the project description and feature descriptions.
   */
  private async createBoardArtifacts(
    correlationId: string,
    prd: SPARCPrd,
    review: ConsolidatedReview,
    projectPath: string
  ): Promise<{ projectSlug: string; featureCount: number }> {
    // Derive a slug from the PRD situation (first meaningful sentence)
    const titleSeed =
      prd.situation
        .split(/[.!?\n]/)[0]
        ?.trim()
        .slice(0, 50) || `plan-${correlationId.slice(0, 8)}`;
    const projectSlug = slugify(titleSeed, 40);
    const projectTitle = titleSeed;

    // Create the project with PRD and correlationId stamped in description
    const project = await this.projectService.createProject(projectPath, {
      slug: projectSlug,
      title: projectTitle,
      goal: prd.problem,
      description: `<!-- correlationId: ${correlationId} -->\n\n${prd.approach}`,
      prd: {
        ...prd,
        approvedAt: new Date().toISOString(),
      },
      milestones: [],
    });

    logger.info(`[plan] Created project: ${project.slug} (correlationId=${correlationId})`);

    // Create an epic feature representing the whole plan
    const epicFeature = await this.featureLoader.create(projectPath, {
      title: `[Plan] ${projectTitle}`,
      description:
        `SPARC PRD plan from antagonistic review.\n\n` +
        `**Situation:** ${prd.situation.slice(0, 200)}...\n\n` +
        `**Approach:** ${prd.approach.slice(0, 200)}...\n\n` +
        `<!-- correlationId: ${correlationId} -->`,
      status: 'backlog',
      isEpic: true,
      epicColor: '#6366f1',
      projectSlug: project.slug,
      complexity: 'medium',
    });

    // Emit feature:created event
    this.events.broadcast('feature:created', {
      featureId: epicFeature.id,
      featureName: epicFeature.title,
      projectPath,
      feature: epicFeature,
    });

    // TODO: Break the PRD approach into milestones/phases and create child features.
    // For now we create a single epic. Future: use ProjM agent or LLM to decompose.
    const featureCount = 1;

    return { projectSlug: project.slug, featureCount };
  }

  /**
   * Check if a plan is pending for a given correlationId.
   */
  hasPendingPlan(correlationId: string): boolean {
    return this.planStore.has(correlationId);
  }

  /**
   * Get a pending plan state (for inspection / debugging).
   */
  getPlanState(correlationId: string): PlanState | null {
    return this.planStore.get(correlationId);
  }
}
