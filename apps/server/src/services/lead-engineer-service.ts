/**
 * Lead Engineer Service — Production Phase Nerve Center
 *
 * Orchestrates the full execution lifecycle for a project:
 * 1. Triggers from project:lifecycle:launched event or MCP tool
 * 2. Starts auto-mode and subscribes to the event bus
 * 3. Maintains a WorldState (board + agents + PRs + metrics)
 * 4. Evaluates fast-path rules on every event (pure functions, no LLM)
 * 5. On project completion: CeremonyService handles retro, we handle metrics
 * 6. Guards crew members from duplicating work on managed projects
 * 7. Per-feature state machine (INTAKE → PLAN → EXECUTE → REVIEW → MERGE → DEPLOY → ESCALATE)
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { createLogger, atomicWriteJson, readJsonWithRecovery } from '@automaker/utils';
import { getAutomakerDir, getFeatureDir } from '@automaker/platform';
import type {
  EventType,
  Feature,
  LeadWorldState,
  LeadFeatureSnapshot,
  LeadAgentSnapshot,
  LeadPRSnapshot,
  LeadMilestoneSnapshot,
  LeadRuleAction,
  LeadEngineerSession,
  LeadRuleLogEntry,
  ExecuteOptions,
  AgentRole,
  GoalGateResult,
  WorkflowSettings,
} from '@automaker/types';
import type { EventEmitter } from '../lib/events.js';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { ProjectService } from './project-service.js';
import type { ProjectLifecycleService } from './project-lifecycle-service.js';
import type { SettingsService } from './settings-service.js';
import type { MetricsService } from './metrics-service.js';
import type { CodeRabbitResolverService } from './coderabbit-resolver-service.js';
import type { PRFeedbackService } from './pr-feedback-service.js';
import { DEFAULT_RULES, evaluateRules } from './lead-engineer-rules.js';
import { getWorkflowSettings } from '../lib/settings-helpers.js';
import type { PipelineCheckpointService } from './pipeline-checkpoint-service.js';
import type { ContextFidelityService } from './context-fidelity-service.js';
import { simpleQuery } from '../providers/simple-query-service.js';
import { resolveModelString } from '@automaker/model-resolver';

const execAsync = promisify(exec);
const logger = createLogger('LeadEngineerService');

const WORLD_STATE_REFRESH_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RULE_LOG_ENTRIES = 200;

// Budget constants for processors
const EXECUTE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_PR_ITERATIONS = 2;
const MAX_TOTAL_REMEDIATION_CYCLES = 4;
const MERGE_RETRY_DELAY_MS = 60 * 1000; // 60 seconds
const REVIEW_POLL_DELAY_MS = 30 * 1000; // 30 seconds

/**
 * Service context injected into state processors.
 * Provides access to real services without circular dependencies.
 */
export interface ProcessorServiceContext {
  events: EventEmitter;
  featureLoader: FeatureLoader;
  autoModeService: AutoModeService;
  prFeedbackService?: PRFeedbackService;
  checkpointService?: PipelineCheckpointService;
  contextFidelityService?: ContextFidelityService;
}

// ────────────────────────── Feature State Machine ──────────────────────────

/**
 * Feature processing states for the state machine.
 * Each feature flows through these states from INTAKE to completion or ESCALATE.
 */
export type FeatureProcessingState =
  | 'INTAKE'
  | 'PLAN'
  | 'EXECUTE'
  | 'REVIEW'
  | 'MERGE'
  | 'DEPLOY'
  | 'ESCALATE';

/**
 * State transition result
 */
export interface StateTransitionResult {
  /** Next state to transition to (null = terminal state) */
  nextState: FeatureProcessingState | null;
  /** Whether processing should continue */
  shouldContinue: boolean;
  /** Optional reason for the transition */
  reason?: string;
  /** Optional data to pass to next state */
  context?: Record<string, unknown>;
}

/**
 * State processor context - data available to all states
 */
export interface StateContext {
  feature: Feature;
  projectPath: string;
  options: ExecuteOptions;
  retryCount: number;
  planRequired: boolean;
  assignedPersona?: AgentRole;
  planOutput?: string;
  prNumber?: number;
  ciStatus?: 'pending' | 'passing' | 'failing';
  remediationAttempts: number;
  mergeRetryCount: number;
  planRetryCount: number;
  escalationReason?: string;
  reviewFeedback?: string;
  siblingReflections?: string[];
}

/**
 * State processor interface - each state implements this
 */
export interface StateProcessor {
  /** Called when entering this state */
  enter(ctx: StateContext): Promise<void>;
  /** Process the state and determine next transition */
  process(ctx: StateContext): Promise<StateTransitionResult>;
  /** Called when exiting this state */
  exit(ctx: StateContext): Promise<void>;
}

/**
 * INTAKE State: Load feature, classify complexity, assign persona, validate deps
 */
class IntakeProcessor implements StateProcessor {
  constructor(private serviceContext: ProcessorServiceContext) {}

  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[INTAKE] Processing feature: ${ctx.feature.id}`, {
      title: ctx.feature.title,
      complexity: ctx.feature.complexity,
    });
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    const { feature } = ctx;

    // Validate dependencies against real feature state
    if (feature.dependencies && feature.dependencies.length > 0) {
      const allFeatures = await this.serviceContext.featureLoader.getAll(ctx.projectPath);
      const unmetDeps: string[] = [];

      for (const depId of feature.dependencies) {
        const dep = allFeatures.find((f) => f.id === depId);
        if (!dep || (dep.status !== 'done' && dep.status !== 'verified')) {
          unmetDeps.push(depId);
        }
      }

      if (unmetDeps.length > 0) {
        ctx.escalationReason = `Unmet dependencies: ${unmetDeps.join(', ')}`;
        logger.warn(`[INTAKE] Feature has ${unmetDeps.length} unmet dependencies`, {
          featureId: feature.id,
          unmetDeps,
        });
        return {
          nextState: 'ESCALATE',
          shouldContinue: false,
          reason: ctx.escalationReason,
        };
      }

      logger.info(`[INTAKE] All ${feature.dependencies.length} dependencies satisfied`);
    }

    // Classify complexity if not already set
    if (!feature.complexity) {
      ctx.feature.complexity = 'medium';
      logger.info('[INTAKE] Assigned default complexity: medium');
    }

    // Assign persona based on feature domain
    ctx.assignedPersona = this.assignPersona(feature);
    logger.info(`[INTAKE] Assigned persona: ${ctx.assignedPersona}`);

    // Determine if PLAN phase is needed
    ctx.planRequired = this.requiresPlan(feature);

    // Mark feature as in_progress on the board
    await this.serviceContext.featureLoader.update(ctx.projectPath, ctx.feature.id, {
      status: 'in_progress',
    });
    logger.info('[INTAKE] Feature status updated to in_progress');

    if (ctx.planRequired) {
      logger.info('[INTAKE] Feature requires PLAN phase');
      return {
        nextState: 'PLAN',
        shouldContinue: true,
        reason: 'Complex feature requires planning',
      };
    }

    return {
      nextState: 'EXECUTE',
      shouldContinue: true,
      reason: 'Simple feature, skip planning',
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[INTAKE] Completed intake processing');
  }

  private assignPersona(feature: Feature): AgentRole {
    const title = feature.title?.toLowerCase() || '';
    const description = feature.description?.toLowerCase() || '';

    if (title.includes('test') || description.includes('test')) {
      return 'qa-engineer';
    }
    if (title.includes('docs') || description.includes('documentation')) {
      return 'docs-engineer';
    }
    if (title.includes('ui') || title.includes('frontend') || description.includes('component')) {
      return 'frontend-engineer';
    }
    if (title.includes('api') || title.includes('backend') || description.includes('service')) {
      return 'backend-engineer';
    }
    if (
      title.includes('deploy') ||
      title.includes('ci') ||
      description.includes('infrastructure')
    ) {
      return 'devops-engineer';
    }
    if (feature.complexity === 'architectural') {
      return 'engineering-manager';
    }

    return 'backend-engineer';
  }

  private requiresPlan(feature: Feature): boolean {
    if (feature.complexity === 'architectural') return true;
    if (feature.complexity === 'large') return true;
    const filesToModify = (feature as { filesToModify?: string[] }).filesToModify;
    if (filesToModify && filesToModify.length >= 3) return true;
    return false;
  }
}

/**
 * PLAN State: Agent researches codebase, produces plan. Factor-based antagonistic gate.
 */
class PlanProcessor implements StateProcessor {
  private readonly MAX_PLAN_RETRIES = 2;

  constructor(private _serviceContext: ProcessorServiceContext) {}

  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[PLAN] Starting planning phase for feature: ${ctx.feature.id}`, {
      planRetryCount: ctx.planRetryCount,
    });
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    const { feature } = ctx;

    logger.info('[PLAN] Generating implementation plan via simpleQuery (haiku)', {
      featureId: feature.id,
      title: feature.title,
    });

    try {
      const result = await simpleQuery({
        prompt: `Create a concise implementation plan for this feature.

**Title:** ${feature.title || 'Untitled'}
**Description:** ${feature.description || 'No description provided'}
**Complexity:** ${feature.complexity || 'medium'}

Produce a plan with:
1. Key files to modify or create
2. Implementation steps (ordered)
3. Testing approach
4. Risk areas or edge cases

Keep it focused and actionable. If the feature description is too vague or unclear to plan, respond with "UNCLEAR:" followed by what's missing.`,
        model: resolveModelString('haiku'),
        cwd: ctx.projectPath,
        systemPrompt:
          'You are a senior software engineer creating implementation plans. Be concise and specific.',
        maxTurns: 1,
        allowedTools: [],
      });

      ctx.planOutput = result.text;
    } catch (err) {
      logger.warn('[PLAN] simpleQuery failed, using feature description as plan', err);
      ctx.planOutput = `Feature: ${feature.title}\n\n${feature.description || 'Implement as described.'}`;
    }

    // Validate plan quality
    const gateResult = this.validatePlan(ctx);

    if (!gateResult.approved) {
      logger.warn('[PLAN] Plan validation failed', { reason: gateResult.reason });

      if (gateResult.shouldRetry && ctx.planRetryCount < this.MAX_PLAN_RETRIES) {
        ctx.planRetryCount++;
        return {
          nextState: 'PLAN',
          shouldContinue: true,
          reason: `Plan needs revision: ${gateResult.reason}`,
          context: { gateReason: gateResult.reason },
        };
      }

      ctx.escalationReason = `Plan rejected after ${ctx.planRetryCount} retries: ${gateResult.reason}`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: false,
        reason: ctx.escalationReason,
      };
    }

    logger.info(`[PLAN] Plan approved (${ctx.planOutput.length} chars)`);

    return {
      nextState: 'EXECUTE',
      shouldContinue: true,
      reason: 'Plan approved',
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[PLAN] Planning phase completed');
  }

  private validatePlan(ctx: StateContext): {
    approved: boolean;
    shouldRetry: boolean;
    reason?: string;
  } {
    const plan = ctx.planOutput || '';

    // Plan must be non-empty and substantive
    if (plan.length < 100) {
      return { approved: false, shouldRetry: true, reason: 'Plan too short (<100 chars)' };
    }

    // If LLM flagged the feature as unclear
    if (plan.startsWith('UNCLEAR:')) {
      return {
        approved: false,
        shouldRetry: false,
        reason: `Feature requirements unclear: ${plan.slice(8).trim()}`,
      };
    }

    return { approved: true, shouldRetry: false };
  }
}

/**
 * EXECUTE State: Agent runs in worktree. Monitor. On failure → retry with context or ESCALATE.
 *
 * Calls autoModeService.executeFeature() directly (bypasses the auto-loop's
 * leadEngineerService.process() delegation, avoiding infinite recursion).
 * Waits for completion via event listener with a 30-minute timeout.
 */
class ExecuteProcessor implements StateProcessor {
  private readonly MAX_RETRIES = 3;
  private readonly MAX_BUDGET_USD = 10.0;

  constructor(private serviceContext: ProcessorServiceContext) {}

  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[EXECUTE] Starting execution for feature: ${ctx.feature.id}`, {
      retryCount: ctx.retryCount,
      persona: ctx.assignedPersona,
    });
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    // Check budget
    const totalCost = ctx.feature.costUsd || 0;
    if (totalCost > this.MAX_BUDGET_USD) {
      ctx.escalationReason = `Budget exceeded: $${totalCost.toFixed(2)}`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: false,
        reason: ctx.escalationReason,
      };
    }

    // Check retry limit
    if (ctx.retryCount >= this.MAX_RETRIES) {
      ctx.escalationReason = `Max retries exceeded (${this.MAX_RETRIES})`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: false,
        reason: ctx.escalationReason,
      };
    }

    // Shape prior context via ContextFidelityService (if available)
    if (
      this.serviceContext.contextFidelityService &&
      (ctx.retryCount > 0 || ctx.remediationAttempts > 0)
    ) {
      try {
        const outputPath = path.join(
          getFeatureDir(ctx.projectPath, ctx.feature.id),
          'agent-output.md'
        );
        const fs = await import('node:fs/promises');
        const priorOutput = await fs.readFile(outputPath, 'utf-8').catch(() => '');

        if (priorOutput) {
          const mode = this.serviceContext.contextFidelityService.resolveMode('EXECUTE', {
            isRetry: ctx.retryCount > 0,
            isRemediation: ctx.remediationAttempts > 0,
            hasPlan: !!ctx.planOutput,
          });
          const shaped = await this.serviceContext.contextFidelityService.shape(priorOutput, mode);
          if (shaped) {
            ctx.planOutput =
              (ctx.planOutput ? ctx.planOutput + '\n\n' : '') +
              `## Prior Agent Output (${mode} mode)\n\n${shaped}`;
          }
          logger.info(`[EXECUTE] Shaped prior context (mode: ${mode}, ${shaped.length} chars)`);
        }
      } catch (err) {
        logger.warn('[EXECUTE] Context fidelity shaping failed:', err);
      }
    }

    // Load reflections from completed sibling features for feed-forward context
    try {
      const allFeatures = await this.serviceContext.featureLoader.getAll(ctx.projectPath);
      const siblings = allFeatures.filter(
        (f) =>
          f.id !== ctx.feature.id &&
          (f.status === 'done' || f.status === 'verified') &&
          (ctx.feature.epicId
            ? f.epicId === ctx.feature.epicId
            : f.projectSlug === ctx.feature.projectSlug)
      );
      const recent = siblings
        .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
        .slice(0, 3);

      const reflections: string[] = [];
      const fs = await import('node:fs/promises');
      for (const sib of recent) {
        try {
          const content = await fs.readFile(
            path.join(getFeatureDir(ctx.projectPath, sib.id), 'reflection.md'),
            'utf-8'
          );
          if (content.trim()) reflections.push(content.trim());
        } catch {
          /* no reflection yet */
        }
      }
      if (reflections.length > 0) {
        ctx.siblingReflections = reflections;
        logger.info(`[EXECUTE] Loaded ${reflections.length} sibling reflections`);
      }
    } catch (err) {
      logger.warn('[EXECUTE] Failed to load sibling reflections:', err);
    }

    logger.info('[EXECUTE] Launching agent via autoModeService.executeFeature()', {
      featureId: ctx.feature.id,
      retryCount: ctx.retryCount,
    });

    // Wait for agent completion via event listener
    const result = await this.waitForCompletion(ctx);

    if (!result.success) {
      ctx.retryCount++;
      logger.warn('[EXECUTE] Execution failed, will retry', {
        retryCount: ctx.retryCount,
        error: result.error,
      });

      return {
        nextState: 'EXECUTE',
        shouldContinue: true,
        reason: `Execution failed: ${result.error || 'unknown'}`,
      };
    }

    // Reload feature to capture updated costUsd, prNumber, etc.
    const updated = await this.serviceContext.featureLoader.get(ctx.projectPath, ctx.feature.id);
    if (updated) {
      ctx.feature = updated;
      if (updated.prNumber) ctx.prNumber = updated.prNumber;
    }

    return {
      nextState: 'REVIEW',
      shouldContinue: true,
      reason: 'Execution completed, moving to review',
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[EXECUTE] Execution phase completed');
  }

  /**
   * Execute the feature and wait for a completion event.
   * Uses executeFeature() directly (not through process()) to avoid recursion.
   */
  private waitForCompletion(ctx: StateContext): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      let unsubscribe: (() => void) | null = null;
      let timedOut = false;

      const timeout = setTimeout(() => {
        timedOut = true;
        if (unsubscribe) unsubscribe();
        resolve({ success: false, error: 'Execution timed out after 30 minutes' });
      }, EXECUTE_TIMEOUT_MS);

      // Subscribe to completion events for this feature
      unsubscribe = this.serviceContext.events.subscribe((type: EventType, payload: unknown) => {
        const p = payload as Record<string, unknown> | null;
        if (p?.featureId !== ctx.feature.id) return;

        if (type === 'feature:completed' || type === 'feature:stopped') {
          clearTimeout(timeout);
          if (!timedOut) {
            if (unsubscribe) unsubscribe();
            resolve({ success: true });
          }
        } else if (type === 'feature:error') {
          clearTimeout(timeout);
          if (!timedOut) {
            if (unsubscribe) unsubscribe();
            resolve({
              success: false,
              error: (p?.error as string) || 'Agent execution failed',
            });
          }
        }
      });

      // Build recovery context from plan output, review feedback, and sibling reflections
      const contextParts: string[] = [];
      if (ctx.planOutput) {
        contextParts.push(`## Implementation Plan\n\n${ctx.planOutput}`);
      }
      if (ctx.reviewFeedback) {
        contextParts.push(
          `## Review Feedback (Changes Requested)\n\nAddress these issues:\n\n${ctx.reviewFeedback}`
        );
      }
      if (ctx.siblingReflections && ctx.siblingReflections.length > 0) {
        contextParts.push(
          `## Learnings from Prior Features\n\nApply relevant lessons:\n\n${ctx.siblingReflections.join('\n\n---\n\n')}`
        );
      }
      const recoveryContext = contextParts.length > 0 ? contextParts.join('\n\n') : undefined;

      // Start execution (bypasses lead engineer delegation — calls executeFeature directly)
      this.serviceContext.autoModeService
        .executeFeature(ctx.projectPath, ctx.feature.id, true, false, undefined, {
          recoveryContext,
          retryCount: ctx.retryCount,
        })
        .catch((err: unknown) => {
          clearTimeout(timeout);
          if (!timedOut && unsubscribe) {
            unsubscribe();
            resolve({
              success: false,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        });
    });
  }
}

/**
 * REVIEW State: PR created. CI runs. If fails → back to EXECUTE (bounded). If passes → MERGE.
 *
 * Queries PRFeedbackService for tracked PR state. Falls back to gh CLI if needed.
 */
class ReviewProcessor implements StateProcessor {
  constructor(private serviceContext: ProcessorServiceContext) {}

  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[REVIEW] PR review started for feature: ${ctx.feature.id}`, {
      prNumber: ctx.prNumber,
    });
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    // Reload feature to get latest prNumber
    const fresh = await this.serviceContext.featureLoader.get(ctx.projectPath, ctx.feature.id);
    if (fresh) {
      ctx.feature = fresh;
      if (fresh.prNumber) ctx.prNumber = fresh.prNumber;
    }

    // No PR means something is wrong
    if (!ctx.prNumber) {
      ctx.escalationReason = 'No PR number found after execution';
      return {
        nextState: 'ESCALATE',
        shouldContinue: false,
        reason: ctx.escalationReason,
      };
    }

    // Query PRFeedbackService for tracked PR state (falls back to gh CLI)
    const reviewState = await this.getPRReviewState(ctx);

    logger.info('[REVIEW] PR status check', {
      featureId: ctx.feature.id,
      prNumber: ctx.prNumber,
      reviewState,
      remediationAttempts: ctx.remediationAttempts,
    });

    if (reviewState === 'approved') {
      return {
        nextState: 'MERGE',
        shouldContinue: true,
        reason: 'PR approved, CI passing',
      };
    }

    if (reviewState === 'changes_requested') {
      // Concurrency guard: if PRFeedbackService is already remediating this feature,
      // defer to it — wait and re-check instead of launching a competing agent.
      if (this.serviceContext.prFeedbackService?.isFeatureRemediating(ctx.feature.id)) {
        logger.info('[REVIEW] PRFeedbackService is already remediating this feature, deferring', {
          featureId: ctx.feature.id,
        });
        await new Promise((r) => setTimeout(r, REVIEW_POLL_DELAY_MS));
        return {
          nextState: 'REVIEW',
          shouldContinue: true,
          reason: 'Deferring to PRFeedbackService remediation',
        };
      }

      // Check remediation budget
      if (ctx.remediationAttempts >= MAX_TOTAL_REMEDIATION_CYCLES) {
        ctx.escalationReason = `Max remediation cycles exceeded (${MAX_TOTAL_REMEDIATION_CYCLES})`;
        return {
          nextState: 'ESCALATE',
          shouldContinue: false,
          reason: ctx.escalationReason,
        };
      }

      // Check iteration budget
      const trackedPR = this.getTrackedPR(ctx);
      if (trackedPR && trackedPR.iterationCount > MAX_PR_ITERATIONS) {
        ctx.escalationReason = `Max PR iterations exceeded (${MAX_PR_ITERATIONS})`;
        return {
          nextState: 'ESCALATE',
          shouldContinue: false,
          reason: ctx.escalationReason,
        };
      }

      // Fetch review comments so the agent knows what to fix
      try {
        const { stdout } = await execAsync(
          `gh pr view ${ctx.prNumber} --json reviews --jq '[.reviews[] | select(.state == "CHANGES_REQUESTED") | .body] | join("\\n---\\n")'`,
          { cwd: ctx.projectPath, timeout: 15000 }
        );
        const feedback = stdout.trim();
        if (feedback) {
          ctx.reviewFeedback = feedback;
          logger.info(`[REVIEW] Captured review feedback (${feedback.length} chars)`);
        }
      } catch (err) {
        logger.warn('[REVIEW] Failed to fetch review comments:', err);
      }

      ctx.remediationAttempts++;
      return {
        nextState: 'EXECUTE',
        shouldContinue: true,
        reason: 'Changes requested, remediating',
        context: { remediation: true },
      };
    }

    // Status is 'pending' or 'commented' — wait and re-check
    logger.info(`[REVIEW] PR pending review, waiting ${REVIEW_POLL_DELAY_MS / 1000}s`, {
      prNumber: ctx.prNumber,
    });
    await new Promise((r) => setTimeout(r, REVIEW_POLL_DELAY_MS));

    return {
      nextState: 'REVIEW',
      shouldContinue: true,
      reason: 'PR pending, re-checking',
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[REVIEW] Review phase completed');
  }

  private async getPRReviewState(ctx: StateContext): Promise<string> {
    const trackedPR = this.getTrackedPR(ctx);
    if (trackedPR?.reviewState) return trackedPR.reviewState;

    // Fallback: query gh CLI when PRFeedbackService hasn't tracked the PR yet
    if (!ctx.prNumber) return 'pending';

    try {
      const { stdout } = await execAsync(
        `gh pr view ${ctx.prNumber} --json reviewDecision,statusCheckRollup --jq '{decision: .reviewDecision, checks: [(.statusCheckRollup // [])[] | .conclusion]}'`,
        { cwd: ctx.projectPath, timeout: 15000 }
      );

      const data = JSON.parse(stdout.trim());

      if (data.decision === 'APPROVED') return 'approved';
      if (data.decision === 'CHANGES_REQUESTED') return 'changes_requested';

      // No review required + all checks pass → treat as approved (required_approving_review_count: 0)
      const checks = (data.checks || []) as string[];
      if (checks.length > 0 && checks.every((c: string) => c === 'SUCCESS')) {
        return 'approved';
      }

      return 'pending';
    } catch (err) {
      logger.warn(`[REVIEW] gh CLI fallback failed for PR #${ctx.prNumber}:`, err);
      return 'pending';
    }
  }

  private getTrackedPR(ctx: StateContext) {
    if (!this.serviceContext.prFeedbackService) return undefined;
    const prs = this.serviceContext.prFeedbackService.getTrackedPRs();
    return prs.find((pr) => pr.featureId === ctx.feature.id || pr.prNumber === ctx.prNumber);
  }
}

/**
 * MERGE State: Auto-merge via gh CLI. Update board. GH→Linear sync.
 */
class MergeProcessor implements StateProcessor {
  constructor(private serviceContext: ProcessorServiceContext) {}

  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[MERGE] Starting merge for feature: ${ctx.feature.id}`, {
      prNumber: ctx.prNumber,
    });
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    const MAX_MERGE_RETRIES = 5;

    if (!ctx.prNumber) {
      ctx.escalationReason = 'No PR number available for merge';
      return {
        nextState: 'ESCALATE',
        shouldContinue: false,
        reason: ctx.escalationReason,
      };
    }

    if (ctx.mergeRetryCount >= MAX_MERGE_RETRIES) {
      ctx.escalationReason = `Merge failed after ${MAX_MERGE_RETRIES} retries for PR #${ctx.prNumber}`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: false,
        reason: ctx.escalationReason,
      };
    }

    logger.info(
      `[MERGE] Attempting to merge PR #${ctx.prNumber} (attempt ${ctx.mergeRetryCount + 1}/${MAX_MERGE_RETRIES})`
    );

    try {
      // Use --squash without --auto: we're in MERGE state after REVIEW approved,
      // so checks should have passed. This ensures merge completes immediately.
      await execAsync(`gh pr merge ${ctx.prNumber} --squash`, {
        cwd: ctx.projectPath,
        timeout: 60000,
      });

      // Verify merge actually completed
      const { stdout: mergeCheck } = await execAsync(
        `gh pr view ${ctx.prNumber} --json merged --jq '.merged'`,
        { cwd: ctx.projectPath, timeout: 15000 }
      );

      if (mergeCheck.trim() !== 'true') {
        ctx.mergeRetryCount++;
        logger.warn(`[MERGE] PR #${ctx.prNumber} merge command succeeded but PR not yet merged`);
        await new Promise((r) => setTimeout(r, MERGE_RETRY_DELAY_MS));
        return {
          nextState: 'MERGE',
          shouldContinue: true,
          reason: 'Merge queued but not yet completed, retrying',
        };
      }

      // Update feature status
      await this.serviceContext.featureLoader.update(ctx.projectPath, ctx.feature.id, {
        status: 'done',
      });

      // Emit merge event
      this.serviceContext.events.emit('feature:pr-merged' as EventType, {
        featureId: ctx.feature.id,
        prNumber: ctx.prNumber,
        projectPath: ctx.projectPath,
      });

      logger.info(`[MERGE] PR #${ctx.prNumber} merged successfully`);

      return {
        nextState: 'DEPLOY',
        shouldContinue: true,
        reason: 'PR merged successfully',
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);

      // If checks are still pending, wait and retry
      if (errMsg.includes('check') || errMsg.includes('pending') || errMsg.includes('required')) {
        ctx.mergeRetryCount++;
        logger.info(
          `[MERGE] Checks pending on PR #${ctx.prNumber}, waiting ${MERGE_RETRY_DELAY_MS / 1000}s`
        );
        await new Promise((r) => setTimeout(r, MERGE_RETRY_DELAY_MS));
        return {
          nextState: 'MERGE',
          shouldContinue: true,
          reason: 'Checks pending, retrying merge',
        };
      }

      ctx.escalationReason = `Merge failed: ${errMsg}`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: false,
        reason: ctx.escalationReason,
      };
    }
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[MERGE] Merge completed');
  }
}

/**
 * DEPLOY State: Verify feature is marked done after merge.
 */
class DeployProcessor implements StateProcessor {
  constructor(private serviceContext: ProcessorServiceContext) {}

  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[DEPLOY] Deployment verification for feature: ${ctx.feature.id}`);
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    // Reload feature to verify final status
    const fresh = await this.serviceContext.featureLoader.get(ctx.projectPath, ctx.feature.id);
    if (fresh) ctx.feature = fresh;

    if (fresh && fresh.status !== 'done' && fresh.status !== 'verified') {
      await this.serviceContext.featureLoader.update(ctx.projectPath, ctx.feature.id, {
        status: 'done',
      });
      logger.info(`[DEPLOY] Updated feature status to done`);
    }

    // Emit completion event (board janitor and other listeners use this)
    this.serviceContext.events.emit('feature:completed' as EventType, {
      featureId: ctx.feature.id,
      projectPath: ctx.projectPath,
      prNumber: ctx.prNumber,
      source: 'lead_engineer_deploy',
    });

    // Checkpoint cleanup is handled by FeatureStateMachine post-loop (line ~1237)

    // Log final cost summary
    const finalCost = ctx.feature.costUsd || 0;
    logger.info(`[DEPLOY] Feature ${ctx.feature.id} completed`, {
      title: ctx.feature.title,
      costUsd: finalCost,
      retryCount: ctx.retryCount,
      remediationAttempts: ctx.remediationAttempts,
    });

    // Fire-and-forget reflection (non-blocking)
    void this.generateReflection(ctx);

    return {
      nextState: null,
      shouldContinue: false,
      reason: 'Feature deployed and verified',
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[DEPLOY] Deployment verification completed');
  }

  private async generateReflection(ctx: StateContext): Promise<void> {
    try {
      const featureDir = getFeatureDir(ctx.projectPath, ctx.feature.id);
      const fs = await import('node:fs/promises');

      // Read agent output tail for outcome context
      let agentOutputTail = '';
      try {
        const full = await fs.readFile(path.join(featureDir, 'agent-output.md'), 'utf-8');
        agentOutputTail = full.length > 2000 ? full.slice(-2000) : full;
      } catch {
        /* no output file */
      }

      const summary = [
        `Feature: ${ctx.feature.title}`,
        `Cost: $${(ctx.feature.costUsd || 0).toFixed(2)}`,
        `Retries: ${ctx.retryCount} | Remediation cycles: ${ctx.remediationAttempts}`,
        ctx.reviewFeedback ? `PR feedback received: ${ctx.reviewFeedback.slice(0, 500)}` : '',
        `Execution history: ${JSON.stringify(
          ctx.feature.executionHistory?.map((e) => ({
            model: e.model,
            success: e.success,
            durationMs: e.durationMs,
            costUsd: e.costUsd,
          })) || []
        )}`,
        agentOutputTail ? `\nAgent output (tail):\n${agentOutputTail}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const result = await simpleQuery({
        prompt: `You are a concise engineering retrospective analyst. Given this feature's execution data, write a brief reflection (under 200 words) covering:
1. **Outcome**: What was built, success or partial success
2. **Efficiency**: Cost/retry count reasonable? Wasted cycles?
3. **Lessons**: 1-2 specific, actionable takeaways for the next feature
4. **Pitfalls**: Anything the next agent should avoid
Be specific. No generic advice.

Feature Data:
${summary}`,
        model: 'haiku',
        cwd: ctx.projectPath,
        maxTurns: 1,
        allowedTools: [],
        traceContext: {
          featureId: ctx.feature.id,
          featureName: ctx.feature.title,
          agentRole: 'reflection',
        },
      });

      const content = `# Reflection: ${ctx.feature.title}\n\n_Generated: ${new Date().toISOString()}_\n_Cost: $${(ctx.feature.costUsd || 0).toFixed(2)} | Retries: ${ctx.retryCount} | Remediation: ${ctx.remediationAttempts}_\n\n${result.text}\n`;
      const reflectionPath = path.join(featureDir, 'reflection.md');
      await fs.writeFile(reflectionPath, content, 'utf-8');

      this.serviceContext.events.emit('feature:reflection:complete' as EventType, {
        featureId: ctx.feature.id,
        projectPath: ctx.projectPath,
        reflectionPath,
      });
      logger.info(`[DEPLOY] Reflection generated for feature ${ctx.feature.id}`);
    } catch (err) {
      logger.warn(`[DEPLOY] Reflection generation failed:`, err);
    }
  }
}

/**
 * ESCALATE State: Too many failures, budget exceeded, needs different expertise.
 * Moves feature to blocked status and emits escalation signal.
 */
class EscalateProcessor implements StateProcessor {
  constructor(private serviceContext: ProcessorServiceContext) {}

  async enter(ctx: StateContext): Promise<void> {
    logger.warn(`[ESCALATE] Escalating feature: ${ctx.feature.id}`, {
      reason: ctx.escalationReason,
    });
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    // Move feature to blocked
    await this.serviceContext.featureLoader.update(ctx.projectPath, ctx.feature.id, {
      status: 'blocked',
    });

    // Emit escalation signal
    this.serviceContext.events.emit('escalation:signal-received' as EventType, {
      source: 'lead_engineer_state_machine',
      severity: 'high',
      type: 'feature_escalated',
      context: {
        featureId: ctx.feature.id,
        featureTitle: ctx.feature.title,
        reason: ctx.escalationReason,
        retryCount: ctx.retryCount,
        remediationAttempts: ctx.remediationAttempts,
        projectPath: ctx.projectPath,
      },
      deduplicationKey: `escalate_${ctx.feature.id}`,
      timestamp: new Date().toISOString(),
    });

    logger.warn(`[ESCALATE] Feature ${ctx.feature.id} moved to blocked`, {
      reason: ctx.escalationReason,
      retryCount: ctx.retryCount,
      remediationAttempts: ctx.remediationAttempts,
    });

    return {
      nextState: null,
      shouldContinue: false,
      reason: 'Feature escalated',
    };
  }

  async exit(_ctx: StateContext): Promise<void> {
    logger.info('[ESCALATE] Escalation completed');
  }
}

// ────────────────────────── Goal Gates ──────────────────────────

/**
 * A goal gate validator: pure function that checks preconditions
 * before or postconditions after a state transition.
 */
export interface GoalGateValidator {
  /** Unique gate identifier */
  gateId: string;
  /** Human-readable description */
  description: string;
  /** Evaluate the gate. Returns { passed, reason } */
  evaluate: (ctx: StateContext) => { passed: boolean; reason: string };
  /** State to retry from on failure (optional — defaults to ESCALATE) */
  retryTarget?: FeatureProcessingState;
}

/**
 * Default goal gate definitions for state transitions.
 */
const DEFAULT_GOAL_GATES: Map<string, GoalGateValidator> = new Map([
  [
    'execute-entry',
    {
      gateId: 'execute-entry',
      description: 'Feature must have a description and all dependencies met before execution',
      evaluate: (ctx: StateContext) => {
        if (!ctx.feature.description && !ctx.feature.title) {
          return { passed: false, reason: 'Feature has no description or title' };
        }
        return { passed: true, reason: 'Feature ready for execution' };
      },
    },
  ],
  [
    'execute-exit',
    {
      gateId: 'execute-exit',
      description: 'Feature must have a PR number after execution',
      evaluate: (ctx: StateContext) => {
        if (!ctx.prNumber && !ctx.feature.prNumber) {
          return { passed: false, reason: 'No PR created during execution' };
        }
        return { passed: true, reason: 'PR exists' };
      },
      retryTarget: 'EXECUTE',
    },
  ],
  [
    'review-exit',
    {
      gateId: 'review-exit',
      description: 'PR must be approved before moving to merge',
      evaluate: (_ctx: StateContext) => {
        // This is checked inside ReviewProcessor already, but the gate
        // provides a declarative verification layer
        return { passed: true, reason: 'Review state validated by processor' };
      },
    },
  ],
  [
    'merge-exit',
    {
      gateId: 'merge-exit',
      description: 'PR must be confirmed merged',
      evaluate: (_ctx: StateContext) => {
        // Merge confirmation happens inside MergeProcessor via gh CLI
        return { passed: true, reason: 'Merge confirmed by processor' };
      },
      retryTarget: 'MERGE',
    },
  ],
]);

/**
 * Feature State Machine
 *
 * Processes a single feature through states from INTAKE to completion.
 * Replaces the inner loop of auto-mode's executeFeature().
 *
 * Enhanced with:
 * - Goal gates: validate pre/post conditions on each transition
 * - Checkpointing: persist state after each successful transition
 * - Pipeline events: emit typed events for observability
 */
export class FeatureStateMachine {
  private readonly processors: Map<FeatureProcessingState, StateProcessor>;
  private readonly goalGates: Map<string, GoalGateValidator>;
  private checkpointService?: PipelineCheckpointService;
  private events?: EventEmitter;

  constructor(
    serviceContext: ProcessorServiceContext,
    opts?: {
      checkpointService?: PipelineCheckpointService;
      events?: EventEmitter;
      goalGatesEnabled?: boolean;
    }
  ) {
    this.processors = new Map<FeatureProcessingState, StateProcessor>();
    this.processors.set('INTAKE', new IntakeProcessor(serviceContext));
    this.processors.set('PLAN', new PlanProcessor(serviceContext));
    this.processors.set('EXECUTE', new ExecuteProcessor(serviceContext));
    this.processors.set('REVIEW', new ReviewProcessor(serviceContext));
    this.processors.set('MERGE', new MergeProcessor(serviceContext));
    this.processors.set('DEPLOY', new DeployProcessor(serviceContext));
    this.processors.set('ESCALATE', new EscalateProcessor(serviceContext));

    // Initialize goal gates (can be disabled via settings)
    this.goalGates = opts?.goalGatesEnabled === false ? new Map() : new Map(DEFAULT_GOAL_GATES);
    this.checkpointService = opts?.checkpointService;
    this.events = opts?.events;
  }

  /**
   * Process a feature through the state machine.
   * This replaces the inner loop of auto-mode's executeFeature().
   */
  async processFeature(
    feature: Feature,
    projectPath: string,
    options: ExecuteOptions,
    resumeFromCheckpoint?: {
      state: FeatureProcessingState;
      restoredContext?: Partial<StateContext>;
    }
  ): Promise<{ finalState: FeatureProcessingState; context: StateContext }> {
    const ctx: StateContext = {
      feature,
      projectPath,
      options,
      retryCount: 0,
      planRequired: false,
      remediationAttempts: 0,
      mergeRetryCount: 0,
      planRetryCount: 0,
      // Merge any restored context from checkpoint
      ...resumeFromCheckpoint?.restoredContext,
    };

    let currentState: FeatureProcessingState = resumeFromCheckpoint?.state || 'INTAKE';
    let transitionCount = 0;
    const MAX_TRANSITIONS = 20;
    const completedStates: string[] = [];
    const goalGateResults: GoalGateResult[] = [];

    if (resumeFromCheckpoint) {
      logger.info('Resuming feature processing from checkpoint', {
        featureId: feature.id,
        resumeState: currentState,
      });
    } else {
      logger.info('Starting feature processing', {
        featureId: feature.id,
        title: feature.title,
        initialState: currentState,
      });
    }

    while (currentState && transitionCount < MAX_TRANSITIONS) {
      const processor = this.processors.get(currentState);
      if (!processor) {
        logger.error(`No processor found for state: ${currentState}`);
        break;
      }

      try {
        // Evaluate entry gate
        const entryGate = this.goalGates.get(`${currentState.toLowerCase()}-entry`);
        if (entryGate) {
          const gateResult = entryGate.evaluate(ctx);
          const goalResult: GoalGateResult = {
            gateId: entryGate.gateId,
            state: currentState,
            passed: gateResult.passed,
            reason: gateResult.reason,
            retryTarget: entryGate.retryTarget,
          };
          goalGateResults.push(goalResult);

          this.emitPipelineEvent('pipeline:goal-gate-evaluated', {
            featureId: feature.id,
            gateId: entryGate.gateId,
            passed: gateResult.passed,
            reason: gateResult.reason,
          });

          if (!gateResult.passed) {
            logger.warn(`Entry gate failed for ${currentState}`, {
              gateId: entryGate.gateId,
              reason: gateResult.reason,
            });
            const target = entryGate.retryTarget || 'ESCALATE';
            ctx.escalationReason = `Goal gate failed: ${gateResult.reason}`;
            currentState = target;
            transitionCount++;
            continue;
          }
        }

        this.emitPipelineEvent('pipeline:state-entered', {
          featureId: feature.id,
          state: currentState,
          fromState: completedStates[completedStates.length - 1] || null,
          timestamp: new Date().toISOString(),
        });

        await processor.enter(ctx);
        const result = await processor.process(ctx);
        await processor.exit(ctx);

        // Evaluate exit gate
        const exitGate = this.goalGates.get(`${currentState.toLowerCase()}-exit`);
        if (exitGate && result.nextState && result.nextState !== 'ESCALATE') {
          const gateResult = exitGate.evaluate(ctx);
          const goalResult: GoalGateResult = {
            gateId: exitGate.gateId,
            state: currentState,
            passed: gateResult.passed,
            reason: gateResult.reason,
            retryTarget: exitGate.retryTarget,
          };
          goalGateResults.push(goalResult);

          this.emitPipelineEvent('pipeline:goal-gate-evaluated', {
            featureId: feature.id,
            gateId: exitGate.gateId,
            passed: gateResult.passed,
            reason: gateResult.reason,
          });

          if (!gateResult.passed) {
            logger.warn(`Exit gate failed for ${currentState}`, {
              gateId: exitGate.gateId,
              reason: gateResult.reason,
            });
            const target = exitGate.retryTarget || 'ESCALATE';
            ctx.escalationReason = `Goal gate failed: ${gateResult.reason}`;
            currentState = target;
            transitionCount++;
            continue;
          }
        }

        completedStates.push(currentState);

        logger.info('State transition', {
          from: currentState,
          to: result.nextState || 'DONE',
          reason: result.reason,
          shouldContinue: result.shouldContinue,
        });

        // Save checkpoint after successful transition
        if (this.checkpointService && result.nextState) {
          try {
            await this.checkpointService.save(
              projectPath,
              feature.id,
              result.nextState,
              ctx,
              completedStates,
              goalGateResults
            );
            this.emitPipelineEvent('pipeline:checkpoint-saved', {
              featureId: feature.id,
              state: result.nextState,
              checkpointId: `${feature.id}-${result.nextState}`,
            });
          } catch (err) {
            logger.error('Failed to save checkpoint', { error: err });
          }
        }

        if (!result.shouldContinue || !result.nextState) {
          logger.info('Feature processing completed', {
            featureId: feature.id,
            finalState: currentState,
            transitionCount,
          });
          break;
        }

        currentState = result.nextState;
        transitionCount++;
      } catch (error) {
        logger.error('Error processing state', {
          state: currentState,
          error: error instanceof Error ? error.message : String(error),
        });

        ctx.escalationReason = `Unexpected error in ${currentState}: ${error instanceof Error ? error.message : String(error)}`;
        currentState = 'ESCALATE';
      }
    }

    if (transitionCount >= MAX_TRANSITIONS) {
      logger.error('Max transitions exceeded, escalating', {
        featureId: feature.id,
        transitionCount,
      });
      currentState = 'ESCALATE';
      ctx.escalationReason = 'Max state transitions exceeded';
    }

    // Clean up checkpoint on terminal states
    if (this.checkpointService && (currentState === 'DEPLOY' || currentState === 'ESCALATE')) {
      try {
        await this.checkpointService.delete(projectPath, feature.id);
      } catch {
        // Non-critical
      }
    }

    return { finalState: currentState, context: ctx };
  }

  /**
   * Get the processor for a specific state (for testing or custom workflows)
   */
  getProcessor(state: FeatureProcessingState): StateProcessor | undefined {
    return this.processors.get(state);
  }

  /**
   * Register a custom processor (allows extending the state machine)
   */
  registerProcessor(state: FeatureProcessingState, processor: StateProcessor): void {
    this.processors.set(state, processor);
    logger.info(`Registered custom processor for state: ${state}`);
  }

  private emitPipelineEvent(type: string, payload: Record<string, unknown>): void {
    if (this.events) {
      this.events.emit(type as EventType, payload);
    }
  }
}

// ────────────────────────── Session Management ──────────────────────────

/**
 * Persisted session data (subset of LeadEngineerSession)
 */
interface PersistedSessionData {
  projectPath: string;
  projectSlug: string;
  maxConcurrency: number;
  startedAt: string;
}

const SUPERVISOR_CHECK_MS = 30 * 1000; // 30 seconds
const SUPERVISOR_WARN_RUNTIME_MS = 45 * 60 * 1000; // 45 minutes
const SUPERVISOR_ABORT_COST_USD = 15;

export class LeadEngineerService {
  private sessions = new Map<string, LeadEngineerSession>();
  private unsubscribe: (() => void) | null = null;
  private refreshIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private supervisorIntervals = new Map<string, ReturnType<typeof setInterval>>();

  /** Features currently being processed through the LE state machine */
  private activeFeatures = new Set<string>();

  private discordBotService?: {
    sendToChannel(channelId: string, content: string): Promise<boolean>;
  };

  private codeRabbitResolver?: CodeRabbitResolverService;
  private prFeedbackService?: PRFeedbackService;
  private checkpointService?: PipelineCheckpointService;
  private contextFidelityService?: ContextFidelityService;

  constructor(
    private events: EventEmitter,
    private featureLoader: FeatureLoader,
    private autoModeService: AutoModeService,
    private projectService: ProjectService,
    private projectLifecycleService: ProjectLifecycleService,
    private settingsService: SettingsService,
    private metricsService: MetricsService
  ) {}

  /**
   * Set pipeline checkpoint service for crash recovery.
   */
  setCheckpointService(service: PipelineCheckpointService): void {
    this.checkpointService = service;
  }

  /**
   * Set context fidelity service for shaping prior context on retries.
   */
  setContextFidelityService(service: ContextFidelityService): void {
    this.contextFidelityService = service;
  }

  /**
   * Set Discord bot service for post_discord action.
   */
  setDiscordBot(bot: {
    sendToChannel(channelId: string, content: string): Promise<boolean>;
  }): void {
    this.discordBotService = bot;
  }

  /**
   * Set CodeRabbit resolver service for direct thread resolution.
   */
  setCodeRabbitResolver(resolver: CodeRabbitResolverService): void {
    this.codeRabbitResolver = resolver;
  }

  /**
   * Set PR Feedback service for state machine review checks.
   */
  setPRFeedbackService(service: PRFeedbackService): void {
    this.prFeedbackService = service;
  }

  /**
   * Subscribe to events for auto-start and routing.
   * Restores any active sessions from disk.
   */
  async initialize(): Promise<void> {
    // Auto-start when a project is launched
    this.unsubscribe = this.events.subscribe((type: EventType, payload: unknown) => {
      if (type === 'project:lifecycle:launched') {
        const p = payload as { projectPath?: string; projectSlug?: string } | null;
        if (p?.projectPath && p?.projectSlug) {
          this.start(p.projectPath, p.projectSlug).catch((err) => {
            logger.error(`Auto-start failed for ${p.projectSlug}:`, err);
          });
        }
        return;
      }

      // Route all events to managed sessions
      this.onEvent(type, payload);
    });

    // Restore sessions from disk
    await this.restoreSessions();

    logger.info('LeadEngineerService initialized');
  }

  /**
   * Clean up subscriptions and stop all sessions.
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    for (const [projectPath] of this.sessions) {
      this.stopSession(projectPath);
    }
    this.sessions.clear();

    logger.info('LeadEngineerService destroyed');
  }

  /**
   * Start managing a project through the production phase.
   */
  async start(
    projectPath: string,
    projectSlug: string,
    opts?: { maxConcurrency?: number }
  ): Promise<LeadEngineerSession> {
    if (this.sessions.has(projectPath)) {
      const existing = this.sessions.get(projectPath)!;
      logger.warn(`Already managing project at ${projectPath}, returning existing session`);
      return existing;
    }

    logger.info(`Starting Lead Engineer for ${projectSlug} at ${projectPath}`);

    // Build initial world state
    const worldState = await this.buildWorldState(projectPath, projectSlug, opts?.maxConcurrency);

    // Create session
    const session: LeadEngineerSession = {
      projectPath,
      projectSlug,
      flowState: 'running',
      worldState,
      startedAt: new Date().toISOString(),
      ruleLog: [],
      actionsTaken: 0,
    };

    this.sessions.set(projectPath, session);

    // Start auto-mode if not already running
    if (!worldState.autoModeRunning && (worldState.boardCounts['backlog'] || 0) > 0) {
      try {
        await this.projectLifecycleService.launch(projectPath, projectSlug, opts?.maxConcurrency);
      } catch (err) {
        logger.warn(`Failed to start auto-mode for ${projectSlug}:`, err);
      }
    }

    // Set up periodic world state refresh
    const interval = setInterval(async () => {
      try {
        const s = this.sessions.get(projectPath);
        if (!s || s.flowState !== 'running') return;

        s.worldState = await this.buildWorldState(
          projectPath,
          projectSlug,
          s.worldState.maxConcurrency
        );

        // Evaluate periodic rules (stuckAgent, staleReview, orphanedInProgress)
        this.evaluateAndExecute(s, 'lead-engineer:rule-evaluated', {});
      } catch (err) {
        logger.error(`WorldState refresh failed for ${projectSlug}:`, err);
      }
    }, WORLD_STATE_REFRESH_MS);
    this.refreshIntervals.set(projectPath, interval);

    // Set up supervisor interval — checks agent runtime and cost every 30s
    // Respects workflow settings: can be disabled and thresholds configured
    const workflowSettings = await getWorkflowSettings(
      projectPath,
      this.settingsService,
      '[LeadEngineer]'
    );
    if (workflowSettings.pipeline.supervisorEnabled) {
      const supervisorInterval = setInterval(() => {
        try {
          const s = this.sessions.get(projectPath);
          if (!s || s.flowState !== 'running') return;
          this.supervisorCheck(s, workflowSettings);
        } catch (err) {
          logger.error(`Supervisor check failed for ${projectSlug}:`, err);
        }
      }, SUPERVISOR_CHECK_MS);
      this.supervisorIntervals.set(projectPath, supervisorInterval);
    } else {
      logger.info(`[LeadEngineer] Supervisor disabled for ${projectSlug} via workflow settings`);
    }

    // Save session to disk
    await this.saveSession(session);

    this.events.emit('lead-engineer:started', { projectPath, projectSlug });
    logger.info(`Lead Engineer started for ${projectSlug}`);

    return session;
  }

  /**
   * Stop managing a project.
   */
  async stop(projectPath: string): Promise<void> {
    const session = this.sessions.get(projectPath);
    if (!session) {
      logger.warn(`No session found for ${projectPath}`);
      return;
    }

    this.stopSession(projectPath);
    session.flowState = 'stopped';
    session.stoppedAt = new Date().toISOString();
    this.sessions.delete(projectPath);

    // Remove session from disk
    await this.removeSession(projectPath);

    this.events.emit('lead-engineer:stopped', {
      projectPath,
      projectSlug: session.projectSlug,
    });

    logger.info(`Lead Engineer stopped for ${session.projectSlug}`);
  }

  /**
   * Get session for a project.
   */
  getSession(projectPath: string): LeadEngineerSession | undefined {
    return this.sessions.get(projectPath);
  }

  /**
   * Get all active sessions.
   */
  getAllSessions(): LeadEngineerSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Check if a project is managed by Lead Engineer.
   * Used by crew members to skip managed projects.
   */
  isManaged(projectPath: string): boolean {
    return this.sessions.has(projectPath);
  }

  /**
   * Get all managed project paths.
   */
  getManagedProjectPaths(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Check if a feature is actively being processed by the LE state machine.
   * Used by PRFeedbackService to avoid launching competing remediation agents.
   */
  isFeatureActive(featureId: string): boolean {
    return this.activeFeatures.has(featureId);
  }

  /**
   * Process a feature through the state machine.
   * This method is called by AutoModeService instead of the monolithic executeFeature().
   * Delegates to the FeatureStateMachine which handles all state transitions,
   * PR maintenance, and board consistency.
   *
   * @param projectPath - The project path
   * @param featureId - The feature ID to process
   * @param options - Execution options (model, useWorktrees, etc.)
   * @returns Promise that resolves when processing completes
   */
  async process(projectPath: string, featureId: string, options: ExecuteOptions): Promise<void> {
    logger.info(`[LeadEngineer] Processing feature ${featureId}`, {
      projectPath,
      model: options.model,
    });

    this.activeFeatures.add(featureId);
    try {
      // Load the feature
      const feature = await this.featureLoader.get(projectPath, featureId);
      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      // Check for existing checkpoint (crash recovery)
      let resumeFromCheckpoint:
        | { state: FeatureProcessingState; restoredContext?: Partial<StateContext> }
        | undefined;

      if (this.checkpointService) {
        const checkpoint = await this.checkpointService.load(projectPath, featureId);
        if (checkpoint) {
          logger.info(
            `[LeadEngineer] Found checkpoint for ${featureId}, resuming from ${checkpoint.currentState}`
          );
          const restoredContext = this.checkpointService.restoreContext(checkpoint);
          resumeFromCheckpoint = {
            state: checkpoint.currentState as FeatureProcessingState,
            restoredContext,
          };
        }
      }

      // Build service context for processors
      const serviceContext: ProcessorServiceContext = {
        events: this.events,
        featureLoader: this.featureLoader,
        autoModeService: this.autoModeService,
        prFeedbackService: this.prFeedbackService,
        checkpointService: this.checkpointService,
        contextFidelityService: this.contextFidelityService,
      };

      // Read workflow settings to control pipeline features
      const workflowSettings = await getWorkflowSettings(
        projectPath,
        this.settingsService,
        '[LeadEngineer]'
      );

      // Create state machine with checkpoint and event support
      const stateMachine = new FeatureStateMachine(serviceContext, {
        checkpointService: workflowSettings.pipeline.checkpointEnabled
          ? this.checkpointService
          : undefined,
        events: this.events,
        goalGatesEnabled: workflowSettings.pipeline.goalGatesEnabled,
      });
      const result = await stateMachine.processFeature(
        feature,
        projectPath,
        options,
        resumeFromCheckpoint
      );

      logger.info(`[LeadEngineer] Feature processing completed`, {
        featureId,
        finalState: result.finalState,
        escalated: result.finalState === 'ESCALATE',
      });

      // Emit completion event for the world state to react to
      this.events.emit('lead-engineer:feature-processed' as EventType, {
        projectPath,
        featureId,
        finalState: result.finalState,
        success: result.finalState !== 'ESCALATE',
      });
    } catch (error: unknown) {
      logger.error(`[LeadEngineer] Feature processing failed`, {
        featureId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.activeFeatures.delete(featureId);
    }
  }

  // ────────────────────────── Private ──────────────────────────

  /**
   * Get the path to the session persistence file.
   */
  private getSessionFilePath(projectPath: string): string {
    const automakerDir = getAutomakerDir(projectPath);
    return path.join(automakerDir, 'lead-engineer-sessions.json');
  }

  /**
   * Save session to disk.
   */
  private async saveSession(session: LeadEngineerSession): Promise<void> {
    try {
      const filePath = this.getSessionFilePath(session.projectPath);

      const data: PersistedSessionData = {
        projectPath: session.projectPath,
        projectSlug: session.projectSlug,
        maxConcurrency: session.worldState.maxConcurrency,
        startedAt: session.startedAt,
      };

      await atomicWriteJson(filePath, data);
      logger.debug(`Saved session to disk: ${session.projectSlug}`);
    } catch (err) {
      logger.error(`Failed to save session for ${session.projectSlug}:`, err);
    }
  }

  /**
   * Remove session from disk.
   */
  private async removeSession(projectPath: string): Promise<void> {
    try {
      const filePath = this.getSessionFilePath(projectPath);
      const fs = await import('node:fs/promises');
      await fs.unlink(filePath);
      logger.debug(`Removed session from disk: ${projectPath}`);
    } catch (err) {
      // Ignore ENOENT errors (file doesn't exist)
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error(`Failed to remove session for ${projectPath}:`, err);
      }
    }
  }

  /**
   * Restore sessions from disk on server startup.
   */
  private async restoreSessions(): Promise<void> {
    // Scan for session files in all potential project directories
    // For now, we need to find projects that have session files
    // We'll iterate through features to find unique project paths
    try {
      const allProjects = await this.findProjectsWithSessions();

      for (const projectPath of allProjects) {
        try {
          const filePath = this.getSessionFilePath(projectPath);
          const result = await readJsonWithRecovery<PersistedSessionData | null>(filePath, null);

          if (!result.data) {
            continue;
          }

          const data = result.data;

          // Check if project is already completed (race condition check)
          const isCompleted = await this.isProjectCompleted(data.projectPath);
          if (isCompleted) {
            logger.info(
              `Project ${data.projectSlug} was completed during downtime, not restoring session`
            );
            await this.removeSession(data.projectPath);
            continue;
          }

          // Restore the session
          logger.info(`Restoring Lead Engineer session for ${data.projectSlug}`);
          await this.start(data.projectPath, data.projectSlug, {
            maxConcurrency: data.maxConcurrency,
          });
        } catch (err) {
          logger.error(`Failed to restore session for ${projectPath}:`, err);
        }
      }
    } catch (err) {
      logger.error('Failed to restore sessions:', err);
    }
  }

  /**
   * Find all projects that have session files.
   */
  private async findProjectsWithSessions(): Promise<string[]> {
    const projects: string[] = [];

    try {
      // Get all features to find unique project paths
      // This is a heuristic - in production, you'd want a better way to enumerate projects
      const _features = await this.featureLoader.getAll(process.cwd());
      const projectPaths = new Set<string>();

      // For now, we'll just check the current project
      // In a multi-project setup, you'd scan all projects
      projectPaths.add(process.cwd());

      // Check each project for a session file
      for (const projectPath of projectPaths) {
        try {
          const filePath = this.getSessionFilePath(projectPath);
          const fs = await import('node:fs/promises');
          await fs.access(filePath);
          projects.push(projectPath);
        } catch {
          // No session file for this project
        }
      }
    } catch (err) {
      logger.warn('Failed to enumerate projects for session restore:', err);
    }

    return projects;
  }

  /**
   * Check if a project is completed (all features done).
   */
  private async isProjectCompleted(projectPath: string): Promise<boolean> {
    try {
      const features = await this.featureLoader.getAll(projectPath);

      // If there are no features, consider it completed
      if (features.length === 0) {
        return true;
      }

      // Check if all features are done or verified
      const allCompleted = features.every((f) => f.status === 'done' || f.status === 'verified');

      return allCompleted;
    } catch {
      // If we can't determine, assume not completed
      return false;
    }
  }

  private stopSession(projectPath: string): void {
    const interval = this.refreshIntervals.get(projectPath);
    if (interval) {
      clearInterval(interval);
      this.refreshIntervals.delete(projectPath);
    }
    const supervisorInterval = this.supervisorIntervals.get(projectPath);
    if (supervisorInterval) {
      clearInterval(supervisorInterval);
      this.supervisorIntervals.delete(projectPath);
    }
  }

  /**
   * Supervisor check: evaluate agent runtime and cost, take corrective action.
   * Uses configurable thresholds from WorkflowSettings when provided.
   */
  private supervisorCheck(session: LeadEngineerSession, settings?: WorkflowSettings): void {
    const now = Date.now();

    // Use settings thresholds or fall back to hardcoded constants
    const abortCostUsd = settings?.pipeline.maxAgentCostUsd ?? SUPERVISOR_ABORT_COST_USD;
    const warnCostUsd = abortCostUsd * 0.53; // ~53% of abort threshold as warning
    const warnRuntimeMs =
      (settings?.pipeline.maxAgentRuntimeMinutes ?? SUPERVISOR_WARN_RUNTIME_MS / 60000) * 60000;
    const abortRuntimeMs = warnRuntimeMs * 2; // abort at 2x the warning threshold

    for (const agent of session.worldState.agents) {
      const runtimeMs = now - new Date(agent.startTime).getTime();
      const feature = session.worldState.features[agent.featureId];
      const costUsd = feature?.costUsd ?? 0;

      // Cost abort
      if (costUsd >= abortCostUsd) {
        logger.warn(
          `[Supervisor] Aborting ${agent.featureId}: cost $${costUsd.toFixed(2)} exceeds limit ($${abortCostUsd})`
        );
        this.executeAction(session, {
          type: 'abort_and_resume',
          featureId: agent.featureId,
          resumePrompt: `Budget limit reached ($${costUsd.toFixed(2)}). Wrap up immediately: commit what you have, create a PR, and stop.`,
        }).catch((err) => logger.error('Supervisor abort failed:', err));
        continue;
      }

      // Runtime abort
      if (runtimeMs >= abortRuntimeMs) {
        const minutes = Math.round(runtimeMs / 60000);
        logger.warn(`[Supervisor] Aborting ${agent.featureId}: running ${minutes}min`);
        this.executeAction(session, {
          type: 'abort_and_resume',
          featureId: agent.featureId,
          resumePrompt: `You have been running for ${minutes} minutes. Wrap up: commit changes, create a PR, and finish.`,
        }).catch((err) => logger.error('Supervisor abort failed:', err));
        continue;
      }

      // Cost warning
      if (costUsd >= warnCostUsd) {
        logger.info(`[Supervisor] Warning: ${agent.featureId} cost $${costUsd.toFixed(2)}`);
        this.events.emit('pipeline:supervisor-action' as EventType, {
          featureId: agent.featureId,
          action: 'cost_warning',
          reason: `Agent cost $${costUsd.toFixed(2)} approaching limit ($${abortCostUsd})`,
        });
      }

      // Runtime warning
      if (runtimeMs >= warnRuntimeMs) {
        const minutes = Math.round(runtimeMs / 60000);
        logger.info(`[Supervisor] Warning: ${agent.featureId} running ${minutes}min`);
        this.events.emit('pipeline:supervisor-action' as EventType, {
          featureId: agent.featureId,
          action: 'runtime_warning',
          reason: `Agent running for ${minutes} minutes`,
        });
      }
    }
  }

  /**
   * Route an event to the appropriate session.
   */
  private onEvent(type: EventType, payload: unknown): void {
    const p = payload as Record<string, unknown> | null;
    const projectPath = p?.projectPath as string | undefined;

    if (projectPath) {
      const session = this.sessions.get(projectPath);
      if (session && session.flowState === 'running') {
        this.updateWorldStateFromEvent(session.worldState, type, payload);
        this.evaluateAndExecute(session, type, payload);
      }
      return;
    }

    // For events without projectPath (e.g., auto-mode events), try to match by featureId
    const featureId = p?.featureId as string | undefined;
    if (featureId) {
      for (const session of this.sessions.values()) {
        if (session.flowState !== 'running') continue;
        if (session.worldState.features[featureId]) {
          this.updateWorldStateFromEvent(session.worldState, type, payload);
          this.evaluateAndExecute(session, type, payload);
          return;
        }
      }
    }
  }

  /**
   * Build a complete WorldState from scratch.
   */
  private async buildWorldState(
    projectPath: string,
    projectSlug: string,
    maxConcurrency?: number
  ): Promise<LeadWorldState> {
    const features = await this.featureLoader.getAll(projectPath);

    // Board counts
    const boardCounts: Record<string, number> = {};
    for (const f of features) {
      const status = f.status || 'backlog';
      boardCounts[status] = (boardCounts[status] || 0) + 1;
    }

    // Feature snapshots
    const featureMap: Record<string, LeadFeatureSnapshot> = {};
    for (const f of features) {
      featureMap[f.id] = this.featureToSnapshot(f);
    }

    // Running agents
    const agents: LeadAgentSnapshot[] = [];
    try {
      const runningAgents = await this.autoModeService.getRunningAgents();
      for (const a of runningAgents) {
        if (a.projectPath === projectPath) {
          agents.push({
            featureId: a.featureId,
            startTime: new Date(a.startTime).toISOString(),
            branch: a.branchName ?? undefined,
          });
        }
      }
    } catch {
      // Running agents API may fail
    }

    // Open PRs — check auto-merge status
    const openPRs: LeadPRSnapshot[] = [];
    const reviewFeatures = features.filter((f) => f.status === 'review' && f.prNumber);
    for (const f of reviewFeatures) {
      const prSnapshot: LeadPRSnapshot = {
        featureId: f.id,
        prNumber: f.prNumber!,
        prUrl: f.prUrl,
        prCreatedAt: f.prCreatedAt,
      };

      // Check auto-merge status via gh CLI
      try {
        const { stdout } = await execAsync(`gh pr view ${f.prNumber} --json autoMergeRequest`, {
          cwd: projectPath,
          timeout: 10000,
        });
        const data = JSON.parse(stdout);
        prSnapshot.autoMergeEnabled = !!data.autoMergeRequest;
      } catch {
        // gh CLI may fail — leave autoMergeEnabled undefined
      }

      openPRs.push(prSnapshot);
    }

    // Milestones
    const milestones: LeadMilestoneSnapshot[] = [];
    try {
      const project = await this.projectService.getProject(projectPath, projectSlug);
      if (project?.milestones) {
        for (const ms of project.milestones) {
          const totalPhases = ms.phases?.length || 0;
          // Count completed phases by checking if their linked features are done
          const completedPhases =
            ms.phases?.filter((p) => {
              if (!p.featureId) return false;
              const f = featureMap[p.featureId];
              return f && (f.status === 'done' || f.status === 'verified');
            }).length || 0;
          milestones.push({
            slug: ms.slug || ms.title.toLowerCase().replace(/\s+/g, '-'),
            title: ms.title,
            totalPhases,
            completedPhases,
          });
        }
      }
    } catch {
      // Project may not have milestones
    }

    // Metrics
    const completedFeatures = features.filter(
      (f) => f.status === 'done' || f.status === 'verified'
    ).length;
    const totalCostUsd = features.reduce((sum, f) => sum + (f.costUsd || 0), 0);

    let avgCycleTimeMs: number | undefined;
    try {
      const metrics = await this.metricsService.getProjectMetrics(projectPath);
      avgCycleTimeMs = metrics.avgCycleTimeMs > 0 ? metrics.avgCycleTimeMs : undefined;
    } catch {
      // Metrics may not be available
    }

    // Auto-mode status
    const activeProjects = this.autoModeService.getActiveAutoLoopProjects();
    const autoModeRunning = activeProjects.includes(projectPath);

    // Resolve max concurrency
    let resolvedMaxConcurrency = maxConcurrency || 1;
    try {
      const settings = await this.settingsService.getGlobalSettings();
      resolvedMaxConcurrency = maxConcurrency || settings.maxConcurrency || 1;
    } catch {
      // Fallback
    }

    return {
      projectPath,
      projectSlug,
      updatedAt: new Date().toISOString(),
      boardCounts,
      features: featureMap,
      agents,
      openPRs,
      milestones,
      metrics: {
        totalFeatures: features.length,
        completedFeatures,
        totalCostUsd,
        avgCycleTimeMs,
      },
      autoModeRunning,
      maxConcurrency: resolvedMaxConcurrency,
    };
  }

  /**
   * Incrementally patch WorldState from a single event.
   */
  private updateWorldStateFromEvent(
    state: LeadWorldState,
    type: EventType,
    payload: unknown
  ): void {
    const p = payload as Record<string, unknown> | null;
    const featureId = p?.featureId as string | undefined;
    const now = new Date().toISOString();

    state.updatedAt = now;

    switch (type) {
      case 'feature:status-changed': {
        if (featureId && state.features[featureId]) {
          const newStatus = p?.newStatus as string | undefined;
          if (newStatus) {
            const oldStatus = state.features[featureId].status;
            state.features[featureId].status = newStatus;

            // Update board counts
            if (oldStatus) {
              state.boardCounts[oldStatus] = Math.max(0, (state.boardCounts[oldStatus] || 0) - 1);
            }
            state.boardCounts[newStatus] = (state.boardCounts[newStatus] || 0) + 1;

            // Update metrics
            if (newStatus === 'done' || newStatus === 'verified') {
              state.metrics.completedFeatures++;
              state.features[featureId].completedAt = now;
            }
          }
        }
        break;
      }

      case 'feature:started': {
        if (featureId && state.features[featureId]) {
          state.features[featureId].status = 'in_progress';
          state.features[featureId].startedAt = now;
          state.agents.push({ featureId, startTime: now });
        }
        break;
      }

      case 'feature:completed':
      case 'feature:stopped':
      case 'feature:error': {
        if (featureId) {
          state.agents = state.agents.filter((a) => a.featureId !== featureId);
        }
        break;
      }

      case 'feature:pr-merged': {
        if (featureId && state.features[featureId]) {
          state.features[featureId].prMergedAt = now;
          state.openPRs = state.openPRs.filter((pr) => pr.featureId !== featureId);
        }
        break;
      }

      case 'auto-mode:started': {
        state.autoModeRunning = true;
        break;
      }

      case 'auto-mode:stopped': {
        state.autoModeRunning = false;
        break;
      }

      case 'pr:approved':
      case 'github:pr:approved': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) pr.reviewState = 'approved';
        }
        break;
      }

      case 'pr:changes-requested':
      case 'github:pr:changes-requested': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) pr.reviewState = 'changes_requested';
        }
        break;
      }

      case 'pr:ci-failure': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) pr.ciStatus = 'failing';
        }
        break;
      }

      case 'pr:remediation-started': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) {
            pr.isRemediating = true;
            pr.remediationCount = (pr.remediationCount || 0) + 1;
          }
        }
        break;
      }

      case 'pr:remediation-completed': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) pr.isRemediating = false;
        }
        break;
      }

      case 'pr:remediation-failed': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) pr.isRemediating = false;
        }
        break;
      }

      case 'pr:threads-resolved': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) pr.unresolvedThreads = 0;
        }
        break;
      }

      case 'pr:merge-blocked-critical-threads': {
        if (featureId) {
          const pr = this.findOrCreatePR(state, featureId, p);
          if (pr) {
            pr.unresolvedThreads =
              (p?.unresolvedCount as number) ?? (p?.threadCount as number) ?? 1;
          }
        }
        break;
      }
    }
  }

  /**
   * Find or create a PR snapshot for a feature.
   * Handles events arriving before the WorldState refresh populates the PR.
   */
  private findOrCreatePR(
    state: LeadWorldState,
    featureId: string,
    payload: Record<string, unknown> | null
  ): LeadPRSnapshot | undefined {
    let pr = state.openPRs.find((p) => p.featureId === featureId);
    if (!pr) {
      const prNumber = (payload?.prNumber as number) ?? state.features[featureId]?.prNumber;
      if (!prNumber) return undefined;
      pr = { featureId, prNumber };
      state.openPRs.push(pr);
    }
    return pr;
  }

  /**
   * Evaluate rules and execute resulting actions.
   */
  private evaluateAndExecute(
    session: LeadEngineerSession,
    eventType: string,
    payload: unknown
  ): void {
    const actions = evaluateRules(DEFAULT_RULES, session.worldState, eventType, payload);

    if (actions.length === 0) return;

    // Determine which rules produced actions (for logging)
    for (const rule of DEFAULT_RULES) {
      if (!rule.triggers.includes(eventType)) continue;
      const ruleActions = rule.evaluate(session.worldState, eventType, payload);
      if (ruleActions.length > 0) {
        const entry: LeadRuleLogEntry = {
          timestamp: new Date().toISOString(),
          ruleName: rule.name,
          eventType,
          actions: ruleActions,
        };
        session.ruleLog.push(entry);

        this.events.emit('lead-engineer:rule-evaluated', {
          projectPath: session.projectPath,
          ruleName: rule.name,
          eventType,
          actionCount: ruleActions.length,
        });
      }
    }

    // Cap rule log size
    if (session.ruleLog.length > MAX_RULE_LOG_ENTRIES) {
      session.ruleLog = session.ruleLog.slice(-MAX_RULE_LOG_ENTRIES);
    }

    // Execute all actions
    for (const action of actions) {
      this.executeAction(session, action).catch((err) => {
        logger.error(`Action execution failed (${action.type}):`, err);
      });
    }
  }

  /**
   * Execute a single rule action.
   */
  private async executeAction(session: LeadEngineerSession, action: LeadRuleAction): Promise<void> {
    session.actionsTaken++;

    this.events.emit('lead-engineer:action-executed', {
      projectPath: session.projectPath,
      actionType: action.type,
      details: action as unknown as Record<string, unknown>,
    });

    switch (action.type) {
      case 'move_feature': {
        try {
          await this.featureLoader.update(session.projectPath, action.featureId, {
            status: action.toStatus,
          });
          logger.info(`Moved feature ${action.featureId} to ${action.toStatus}`);
        } catch (err) {
          logger.error(`Failed to move feature ${action.featureId}:`, err);
        }
        break;
      }

      case 'reset_feature': {
        try {
          await this.featureLoader.update(session.projectPath, action.featureId, {
            status: 'backlog',
          });
          logger.info(`Reset feature ${action.featureId}: ${action.reason}`);

          this.events.emit('escalation:signal-received', {
            source: 'lead_engineer',
            severity: 'medium',
            type: 'feature_reset',
            context: {
              featureId: action.featureId,
              projectPath: session.projectPath,
              reason: action.reason,
            },
            deduplicationKey: `reset_feature_${action.featureId}`,
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          logger.error(`Failed to reset feature ${action.featureId}:`, err);
        }
        break;
      }

      case 'unblock_feature': {
        try {
          await this.featureLoader.update(session.projectPath, action.featureId, {
            status: 'backlog',
          });
          logger.info(`Unblocked feature ${action.featureId}`);
        } catch (err) {
          logger.error(`Failed to unblock feature ${action.featureId}:`, err);
        }
        break;
      }

      case 'enable_auto_merge': {
        try {
          await execAsync(`gh pr merge ${action.prNumber} --auto --squash`, {
            cwd: session.projectPath,
            timeout: 30000,
          });
          // Update in-memory PR snapshot so staleReview doesn't re-fire
          const pr = session.worldState.openPRs.find((p) => p.featureId === action.featureId);
          if (pr) pr.autoMergeEnabled = true;
          logger.info(`Enabled auto-merge on PR #${action.prNumber}`);
        } catch (err) {
          logger.warn(`Failed to enable auto-merge on PR #${action.prNumber}:`, err);
        }
        break;
      }

      case 'resolve_threads_direct': {
        if (!this.codeRabbitResolver) {
          logger.warn('CodeRabbitResolverService not available, cannot resolve threads directly');
          break;
        }
        try {
          const result = await this.codeRabbitResolver.resolveThreads(
            session.projectPath,
            action.prNumber
          );
          logger.info(
            `Resolved ${result.resolvedCount}/${result.totalThreads} threads on PR #${action.prNumber}`
          );
        } catch (err) {
          logger.warn(`Failed to resolve threads on PR #${action.prNumber}:`, err);
        }
        break;
      }

      case 'resolve_threads': {
        this.events.emit('escalation:signal-received', {
          source: 'pr_feedback',
          severity: 'medium',
          type: 'thread_resolution_requested',
          context: {
            featureId: action.featureId,
            prNumber: action.prNumber,
            projectPath: session.projectPath,
          },
          deduplicationKey: `resolve_threads_${action.prNumber}`,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case 'restart_auto_mode': {
        try {
          await this.autoModeService.startAutoLoopForProject(
            action.projectPath,
            null, // branchName
            action.maxConcurrency || session.worldState.maxConcurrency
          );
          session.worldState.autoModeRunning = true;
          logger.info(`Restarted auto-mode for ${action.projectPath}`);
        } catch (err) {
          logger.warn(`Failed to restart auto-mode:`, err);
        }
        break;
      }

      case 'stop_agent': {
        try {
          await this.autoModeService.stopFeature(action.featureId);
          logger.info(`Stopped agent for feature ${action.featureId}`);
        } catch (err) {
          logger.warn(`Failed to stop agent for ${action.featureId}:`, err);
        }
        break;
      }

      case 'send_agent_message': {
        try {
          await this.autoModeService.followUpFeature(
            session.projectPath,
            action.featureId,
            action.message
          );
          logger.info(`Sent message to agent for feature ${action.featureId}`);
        } catch (err) {
          logger.warn(`Failed to send message to agent ${action.featureId}:`, err);
        }
        break;
      }

      case 'abort_and_resume': {
        try {
          logger.info(`Supervisor: abort_and_resume for ${action.featureId}`);
          await this.autoModeService.stopFeature(action.featureId);
          // Brief delay for cleanup
          await new Promise((r) => setTimeout(r, 5000));
          await this.autoModeService.executeFeature(
            session.projectPath,
            action.featureId,
            true,
            false,
            undefined,
            { recoveryContext: action.resumePrompt }
          );

          this.events.emit('pipeline:supervisor-action' as EventType, {
            featureId: action.featureId,
            action: 'abort_and_resume',
            reason: action.resumePrompt,
          });

          this.events.emit('escalation:signal-received', {
            source: 'lead_engineer',
            severity: 'medium',
            type: 'agent_abort_and_resume',
            context: {
              featureId: action.featureId,
              projectPath: session.projectPath,
              resumePrompt: action.resumePrompt,
            },
            deduplicationKey: `abort_resume_${action.featureId}`,
            timestamp: new Date().toISOString(),
          });

          logger.info(`Supervisor: resumed agent for ${action.featureId}`);
        } catch (err) {
          logger.warn(`Supervisor: abort_and_resume failed for ${action.featureId}:`, err);
        }
        break;
      }

      case 'post_discord': {
        if (this.discordBotService) {
          await this.discordBotService
            .sendToChannel(action.channelId, action.message)
            .catch((err) => logger.warn(`Failed to post to Discord: ${err}`));
        }
        break;
      }

      case 'log': {
        logger[action.level](`[Rule] ${action.message}`);
        break;
      }

      case 'escalate_llm': {
        this.events.emit('escalation:signal-received', {
          source: 'lead_engineer_escalation',
          severity: 'high',
          type: 'lead_engineer_escalation',
          context: {
            ...action.context,
            projectPath: session.projectPath,
            reason: action.reason,
          },
          deduplicationKey: `le_escalation_${session.projectPath}_${Date.now()}`,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      case 'project_completing': {
        await this.handleProjectCompleting(session);
        break;
      }
    }
  }

  /**
   * Handle project completion: transition to completing state.
   * CeremonyService handles retro + Discord automatically (already subscribed to project:completed).
   * Lead Engineer aggregates final metrics.
   */
  private async handleProjectCompleting(session: LeadEngineerSession): Promise<void> {
    session.flowState = 'completing';
    this.events.emit('lead-engineer:project-completing', {
      projectPath: session.projectPath,
      projectSlug: session.projectSlug,
    });

    logger.info(`Project ${session.projectSlug} completing — aggregating final metrics`);

    // Refresh final world state
    try {
      session.worldState = await this.buildWorldState(
        session.projectPath,
        session.projectSlug,
        session.worldState.maxConcurrency
      );
    } catch (err) {
      logger.error(`Failed to build final world state:`, err);
    }

    // Emit completion event
    this.events.emit('lead-engineer:project-completed', {
      projectPath: session.projectPath,
      projectSlug: session.projectSlug,
    });

    // Transition to idle
    session.flowState = 'idle';

    // Clean up
    this.stopSession(session.projectPath);
    this.sessions.delete(session.projectPath);

    // Remove session from disk
    await this.removeSession(session.projectPath);

    this.events.emit('lead-engineer:stopped', {
      projectPath: session.projectPath,
      projectSlug: session.projectSlug,
    });

    logger.info(`Project ${session.projectSlug} completed. Lead Engineer session ended.`);
  }

  /**
   * Convert a Feature to a LeadFeatureSnapshot.
   */
  private featureToSnapshot(f: Feature): LeadFeatureSnapshot {
    return {
      id: f.id,
      title: f.title,
      status: (f.status as string) || 'backlog',
      branchName: f.branchName,
      prNumber: f.prNumber,
      prUrl: f.prUrl,
      prCreatedAt: f.prCreatedAt,
      prMergedAt: f.prMergedAt,
      costUsd: f.costUsd,
      failureCount: f.failureCount,
      dependencies: f.dependencies,
      epicId: f.epicId,
      isEpic: f.isEpic,
      complexity: f.complexity,
      startedAt: f.startedAt,
      completedAt: f.completedAt,
    };
  }
}
