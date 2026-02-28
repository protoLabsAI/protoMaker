/**
 * ExecutionService - Handles feature execution logic extracted from AutoModeService.
 *
 * Responsible for:
 * - executeFeature: full lifecycle of a single feature run
 * - executePipelineSteps / executePipelineStep: post-implementation pipeline steps
 * - runAgent: low-level agent streaming
 * - buildFeaturePrompt / buildTaskPrompt / buildPipelineStepPrompt: prompt assembly
 * - getPlanningPromptPrefix / extractTitleFromDescription: prompt helpers
 * - recordLearningsFromFeature: post-success learning extraction
 * - getHeapUsagePercent: memory monitoring helper
 */

import * as v8 from 'node:v8';
import { ProviderFactory } from '../../providers/provider-factory.js';
import { simpleQuery } from '../../providers/simple-query-service.js';
import { StreamObserver } from '../stream-observer-service.js';
import { getWorkflowSettings } from '../../lib/settings-helpers.js';
import { setFeatureContext } from '@protolabs-ai/error-tracking';
import { LoopDetectedError } from '../auto-mode-service.js';

import type {
  ExecuteOptions,
  Feature,
  ExecutionRecord,
  PipelineStep,
  PipelineSummary,
  ThinkingLevel,
  PlanningMode,
  ExecutionContext,
  ActionProposal,
} from '@protolabs-ai/types';
import { DEFAULT_PHASE_MODELS, isClaudeModel, stripProviderPrefix } from '@protolabs-ai/types';
import {
  buildPromptWithImages,
  classifyError,
  loadContextFiles,
  appendLearning,
  recordMemoryUsage,
  createLogger,
  type DedupChecker,
  type IndexRebuilder,
} from '@protolabs-ai/utils';
import {
  resolveModelString,
  resolvePhaseModel,
  DEFAULT_MODELS,
} from '@protolabs-ai/model-resolver';
import { getFeatureDir } from '@protolabs-ai/platform';
import { rebaseWorktreeOnMain } from '@protolabs-ai/git-utils';
import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import path from 'path';
import * as secureFs from '../../lib/secure-fs.js';
import type { EventEmitter } from '../../lib/events.js';
import { ensureCleanWorktree } from '../../lib/worktree-guard.js';
import {
  agentCostTotal,
  agentExecutionDuration,
  activeAgentsCount,
  agentTokensInputTotal,
  agentTokensOutputTotal,
  agentExecutionsTotal,
} from '../../lib/prometheus.js';
import { createAutoModeOptions, validateWorkingDirectory } from '../../lib/sdk-options.js';
import { FeatureLoader } from '../feature-loader.js';
import type { SettingsService } from '../settings-service.js';
import type { AuthorityService } from '../authority-service.js';
import { pipelineService } from '../pipeline-service.js';
import {
  getAutoLoadClaudeMdSetting,
  filterClaudeMdFromContext,
  getMCPServersFromSettings,
  getPromptCustomization,
  getProviderByModelId,
} from '../../lib/settings-helpers.js';
import { RecoveryService } from '../recovery-service.js';
import { checkAndRecoverUncommittedWork } from '../worktree-recovery-service.js';
import { gitWorkflowService } from '../git-workflow-service.js';
import { graphiteService } from '../graphite-service.js';
import type { KnowledgeStoreService } from '../knowledge-store-service.js';

import type {
  RunningFeature,
  ParsedTask,
  PlanSpec,
  IAutoModeCallbacks,
  ExecuteFeatureOptions,
} from './execution-types.js';

const logger = createLogger('AutoMode');

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Module-level helpers (ported from auto-mode-service.ts)
// ---------------------------------------------------------------------------

/**
 * Complexity-to-turns mapping.
 * Maps feature complexity to appropriate max turns for agent execution.
 * Higher complexity = more turns allowed.
 */
export const COMPLEXITY_TURNS: Record<string, number> = {
  small: 200,
  medium: 500,
  large: 750,
  architectural: 1000,
};

/**
 * Get the max turns for a feature based on its complexity.
 * Per-feature maxTurns override takes precedence.
 * Failure escalation: after error_max_turns, turns are bumped (1.5x first, 2x+opus second).
 */
export function getTurnsForFeature(feature: {
  maxTurns?: number;
  complexity?: string;
  failureCount?: number;
}): number {
  // Explicit per-feature override takes precedence
  if (feature.maxTurns && feature.maxTurns > 0) {
    return feature.maxTurns;
  }

  const baseTurns = COMPLEXITY_TURNS[feature.complexity ?? 'medium'] ?? COMPLEXITY_TURNS.medium;

  // After failures, escalate turns (the model escalation is handled by getModelForFeature)
  const failureCount = feature.failureCount ?? 0;
  if (failureCount >= 2) {
    // 2+ failures: double the turns
    return Math.min(baseTurns * 2, 2000);
  }
  if (failureCount >= 1) {
    // 1 failure: 1.5x the turns
    return Math.min(Math.round(baseTurns * 1.5), 1500);
  }

  return baseTurns;
}

/**
 * Parse tasks from generated spec content.
 * Looks for the ```tasks code block and extracts task lines.
 * Format: - [ ] T###: Description | File: path/to/file
 */
export function parseTasksFromSpec(specContent: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];

  // Extract content within ```tasks ... ``` block
  const tasksBlockMatch = specContent.match(/```tasks\s*([\s\S]*?)```/);
  if (!tasksBlockMatch) {
    // Try fallback: look for task lines anywhere in content
    const taskLines = specContent.match(/- \[ \] T\d{3}:.*$/gm);
    if (!taskLines) {
      return tasks;
    }
    // Parse fallback task lines
    let currentPhase: string | undefined;
    for (const line of taskLines) {
      const parsed = parseTaskLine(line, currentPhase);
      if (parsed) {
        tasks.push(parsed);
      }
    }
    return tasks;
  }

  const tasksContent = tasksBlockMatch[1];
  const lines = tasksContent.split('\n');

  let currentPhase: string | undefined;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check for phase header (e.g., "## Phase 1: Foundation")
    const phaseMatch = trimmedLine.match(/^##\s*(.+)$/);
    if (phaseMatch) {
      currentPhase = phaseMatch[1].trim();
      continue;
    }

    // Check for task line
    if (trimmedLine.startsWith('- [ ]')) {
      const parsed = parseTaskLine(trimmedLine, currentPhase);
      if (parsed) {
        tasks.push(parsed);
      }
    }
  }

  return tasks;
}

/**
 * Parse a single task line.
 * Format: - [ ] T###: Description | File: path/to/file
 */
export function parseTaskLine(line: string, currentPhase?: string): ParsedTask | null {
  // Match pattern: - [ ] T###: Description | File: path
  const taskMatch = line.match(/- \[ \] (T\d{3}):\s*([^|]+)(?:\|\s*File:\s*(.+))?$/);
  if (!taskMatch) {
    // Try simpler pattern without file
    const simpleMatch = line.match(/- \[ \] (T\d{3}):\s*(.+)$/);
    if (simpleMatch) {
      return {
        id: simpleMatch[1],
        description: simpleMatch[2].trim(),
        phase: currentPhase,
        status: 'pending',
      };
    }
    return null;
  }

  return {
    id: taskMatch[1],
    description: taskMatch[2].trim(),
    filePath: taskMatch[3]?.trim(),
    phase: currentPhase,
    status: 'pending',
  };
}

/**
 * Sleep helper (module-level so methods can call it without `this`).
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);

    // If signal is provided and already aborted, reject immediately
    if (signal?.aborted) {
      clearTimeout(timeout);
      reject(new Error('Aborted'));
      return;
    }

    // Listen for abort signal
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          reject(new Error('Aborted'));
        },
        { once: true }
      );
    }
  });
}

// ---------------------------------------------------------------------------
// ExecutionService
// ---------------------------------------------------------------------------

export class ExecutionService {
  constructor(
    private readonly events: EventEmitter,
    private readonly settingsService: SettingsService | null,
    private readonly featureLoader: FeatureLoader,
    private readonly authorityService: AuthorityService | null,
    private readonly recoveryService: RecoveryService,
    private readonly knowledgeStoreService: KnowledgeStoreService | null,
    private readonly runningFeatures: Map<string, RunningFeature>,
    private readonly retryTimers: Map<string, NodeJS.Timeout>,
    private readonly heapStopThreshold: number,
    private readonly heapAbortThreshold: number,
    private readonly callbacks: IAutoModeCallbacks
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Execute a single feature.
   * @param projectPath - The main project path
   * @param featureId - The feature ID to execute
   * @param useWorktrees - Whether to use worktrees for isolation
   * @param isAutoMode - Whether this is running in auto mode
   */
  async executeFeature(
    projectPath: string,
    featureId: string,
    useWorktrees = false,
    isAutoMode = false,
    providedWorktreePath?: string,
    options?: ExecuteFeatureOptions
  ): Promise<void> {
    if (this.runningFeatures.has(featureId)) {
      const existing = this.runningFeatures.get(featureId);
      const runtime = existing ? Math.floor((Date.now() - existing.startTime) / 1000) : 0;
      logger.warn(
        `Feature ${featureId} is already running (runtime: ${runtime}s). Skipping duplicate execution.`
      );
      throw new Error(
        `Feature ${featureId} is already running (${runtime}s). If this is stale, restart the server or stop the feature first.`
      );
    }

    // Add to running features immediately to prevent duplicate execution race condition
    // We'll update branchName right after loading the feature (minimizes null window)
    const abortController = new AbortController();
    const tempRunningFeature: RunningFeature = {
      featureId,
      projectPath,
      worktreePath: null,
      branchName: null, // Will be updated immediately after feature load
      abortController,
      isAutoMode,
      startTime: Date.now(),
      retryCount: options?.retryCount ?? 0,
      previousErrors: options?.previousErrors ?? [],
      recoveryContext: options?.recoveryContext,
    };
    this.runningFeatures.set(featureId, tempRunningFeature);
    activeAgentsCount.set(this.runningFeatures.size);

    // Save execution state when feature starts
    if (isAutoMode) {
      await this.callbacks.saveExecutionState(projectPath);
    }

    // Declare feature outside try block so it's available in catch for error reporting
    let feature: Feature | null = null;

    // Execution tracking — declared outside try for catch block access
    const executionId = randomUUID();
    const executionStartedAt = new Date().toISOString();
    let startingCostUsd = 0;

    try {
      // Validate that project path is allowed using centralized validation
      validateWorkingDirectory(projectPath);

      // Load feature details and immediately update branchName
      // This minimizes the window where branchName is null
      feature = await this.callbacks.loadFeature(projectPath, featureId);
      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      // Set feature context for Sentry error tracking
      setFeatureContext(feature);

      // Guard: refuse to execute features in terminal states.
      // This prevents zombie loops where done/verified features keep getting restarted
      // by health checks, reconciliation, or stale retry timers.
      const TERMINAL_STATUSES = new Set(['done', 'verified', 'completed', 'review']);
      if (TERMINAL_STATUSES.has(feature.status ?? '')) {
        logger.warn(
          `Refusing to execute feature ${featureId} — already in terminal status "${feature.status}". ` +
            `Removing from running features.`
        );
        this.runningFeatures.delete(featureId);
        return;
      }

      // Capture starting cost for execution-specific cost tracking
      startingCostUsd = feature.costUsd ?? 0;

      // Update branchName immediately after loading
      tempRunningFeature.branchName = feature.branchName ?? null;

      // Check if feature has existing context - if so, resume instead of starting fresh
      // Skip this check if we're already being called with a continuation prompt (from resumeFeature)
      if (!options?.continuationPrompt) {
        // If feature has an approved plan but we don't have a continuation prompt yet,
        // we should build one to ensure it proceeds with multi-agent execution
        if (feature.planSpec?.status === 'approved') {
          logger.info(`Feature ${featureId} has approved plan, building continuation prompt`);

          // Get customized prompts from settings
          const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');
          const planContent = feature.planSpec.content || '';

          // Build continuation prompt using centralized template
          let continuationPrompt = prompts.taskExecution.continuationAfterApprovalTemplate;
          continuationPrompt = continuationPrompt.replace(/\{\{userFeedback\}\}/g, '');
          continuationPrompt = continuationPrompt.replace(/\{\{approvedPlan\}\}/g, planContent);

          // Recursively call executeFeature with the continuation prompt
          // Remove from running features temporarily, it will be added back
          this.runningFeatures.delete(featureId);
          return this.executeFeature(
            projectPath,
            featureId,
            useWorktrees,
            isAutoMode,
            providedWorktreePath,
            {
              continuationPrompt,
            }
          );
        }

        const hasExistingContext = await this.callbacks.contextExists(projectPath, featureId);
        if (hasExistingContext) {
          logger.info(
            `Feature ${featureId} has existing context, resuming instead of starting fresh`
          );
          // Remove from running features temporarily, resumeFeature will add it back
          this.runningFeatures.delete(featureId);
          return this.callbacks.resumeFeature(projectPath, featureId, useWorktrees);
        }
      }

      // Derive workDir from feature.branchName
      // Worktrees should already be created when the feature is added/edited
      let worktreePath: string | null = null;
      const branchName = feature.branchName;

      if (useWorktrees && branchName) {
        // Try to find existing worktree for this branch
        worktreePath = await this.callbacks.findExistingWorktreeForBranch(projectPath, branchName);

        if (worktreePath) {
          logger.info(`Using existing worktree for branch "${branchName}": ${worktreePath}`);
        } else {
          // Auto-create worktree if it doesn't exist
          logger.info(`Auto-creating worktree for branch "${branchName}"`);
          worktreePath = await this.callbacks.createWorktreeForBranch(
            projectPath,
            branchName,
            feature
          );
          if (worktreePath) {
            logger.info(`Created worktree for branch "${branchName}": ${worktreePath}`);
          } else {
            logger.warn(`Failed to create worktree for branch "${branchName}", using project path`);
          }
        }
      }

      // Ensure workDir is always an absolute path for cross-platform compatibility
      const workDir = worktreePath ? path.resolve(worktreePath) : path.resolve(projectPath);

      // CRITICAL: Rebase worktree onto latest origin/main before agent execution
      // This prevents agents from executing against stale code when PRs merge in quick succession
      if (worktreePath) {
        try {
          logger.info(`Rebasing worktree onto latest origin/main: ${worktreePath}`);
          const rebaseResult = await rebaseWorktreeOnMain(worktreePath);

          if (!rebaseResult.success) {
            if (rebaseResult.hasConflicts) {
              logger.warn(
                `Worktree has merge conflicts with main. Agent will execute on stale base. ` +
                  `Feature: ${featureId}, Branch: ${branchName}`
              );
            } else {
              logger.warn(
                `Rebase failed (${rebaseResult.error}). Agent will execute on current base. ` +
                  `Feature: ${featureId}`
              );
            }
          } else {
            logger.info(`Worktree successfully rebased onto latest origin/main`);
          }
        } catch (rebaseError) {
          // Log error but don't fail execution - agent can still work on stale base
          logger.error(
            `Unexpected error during pre-execution rebase for ${featureId}:`,
            rebaseError
          );
        }
      }

      // Validate that working directory is allowed using centralized validation
      validateWorkingDirectory(workDir);

      // Update running feature with actual worktree info
      tempRunningFeature.worktreePath = worktreePath;

      // Authority system policy check: verify permission before starting this feature
      if (this.authorityService && this.settingsService) {
        try {
          const projectSettings = await this.settingsService.getProjectSettings(projectPath);
          if (projectSettings.authoritySystem?.enabled) {
            const proposal: ActionProposal = {
              who: 'auto-mode',
              what: 'transition_status',
              target: featureId,
              justification: `Auto-mode starting feature: ${feature.title || featureId}`,
              risk: 'low',
              statusTransition: { from: feature.status || 'backlog', to: 'in_progress' },
            };

            const decision = await this.authorityService.submitProposal(proposal, projectPath);
            if (decision.verdict !== 'allow') {
              logger.info(`Authority denied feature start: ${decision.reason}`);
              this.runningFeatures.delete(featureId);
              this.callbacks.emitAutoModeEvent('auto_mode_feature_skipped', {
                featureId,
                projectPath,
                reason: decision.reason,
                verdict: decision.verdict,
              });
              return;
            }
          }
        } catch (policyError) {
          // Log but proceed with execution if the policy check itself fails.
          // This prevents the authority system from becoming a single point of failure.
          logger.error('Authority policy check failed, proceeding with execution:', policyError);
        }
      }

      // Update feature status to in_progress BEFORE emitting event
      // This ensures the frontend sees the updated status when it reloads features
      await this.callbacks.updateFeatureStatus(projectPath, featureId, 'in_progress');

      // Emit feature start event AFTER status update so frontend sees correct status
      this.callbacks.emitAutoModeEvent('auto_mode_feature_start', {
        featureId,
        projectPath,
        branchName: feature.branchName ?? null,
        feature: {
          id: featureId,
          title: feature.title || 'Loading...',
          description: feature.description || 'Feature is starting',
        },
      });

      // Load autoLoadClaudeMd setting to determine context loading strategy
      const autoLoadClaudeMd = await getAutoLoadClaudeMdSetting(
        projectPath,
        this.settingsService,
        '[AutoMode]'
      );

      // Get customized prompts from settings
      const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');

      // Build the prompt - use continuation prompt if provided (for recovery after plan approval)
      let prompt: string;
      // Load project context files (CLAUDE.md, CODE_QUALITY.md, etc.) and memory files
      // Context loader uses task context to select relevant memory files
      const contextResult = await loadContextFiles({
        projectPath,
        fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
        taskContext: {
          title: feature.title ?? '',
          description: feature.description ?? '',
        },
      });

      // When autoLoadClaudeMd is enabled, filter out CLAUDE.md to avoid duplication
      // (SDK handles CLAUDE.md via settingSources), but keep other context files like CODE_QUALITY.md
      // Note: contextResult.formattedPrompt now includes both context AND memory
      const combinedSystemPrompt = filterClaudeMdFromContext(contextResult, autoLoadClaudeMd);

      if (options?.continuationPrompt) {
        // Continuation prompt is used when recovering from a plan approval
        // The plan was already approved, so skip the planning phase
        prompt = options.continuationPrompt;
        logger.info(`Using continuation prompt for feature ${featureId}`);
      } else {
        // Normal flow: build prompt with planning phase
        const featurePrompt = this.buildFeaturePrompt(feature, prompts.taskExecution);
        const planningPrefix = await this.getPlanningPromptPrefix(feature);
        prompt = planningPrefix + featurePrompt;

        // Add recovery context if this is a retry attempt
        if (options?.recoveryContext) {
          const recoverySection = `\n\n## Recovery Context\n\nThis is retry attempt #${options.retryCount ?? 1}. The previous attempt failed with the following context:\n\n${options.recoveryContext}\n\nPlease address these issues in your implementation.\n`;
          prompt = recoverySection + prompt;
          logger.info(
            `Added recovery context for feature ${featureId} (retry #${options.retryCount})`
          );
        }

        // Emit planning mode info
        if (feature.planningMode && feature.planningMode !== 'skip') {
          this.callbacks.emitAutoModeEvent('planning_started', {
            featureId: feature.id,
            mode: feature.planningMode,
            message: `Starting ${feature.planningMode} planning phase`,
          });
        }
      }

      // Extract image paths from feature
      const imagePaths = feature.imagePaths?.map((img) =>
        typeof img === 'string' ? img : img.path
      );

      // Get model based on feature complexity and failure count
      const modelResult = await this.callbacks.getModelForFeature(feature, projectPath);
      const maxTurns = getTurnsForFeature(feature);
      const provider = ProviderFactory.getProviderNameForModel(modelResult.model);
      logger.info(
        `Executing feature ${featureId} with model: ${modelResult.model}, maxTurns: ${maxTurns}, provider: ${provider} in ${workDir}`
      );

      // Store model and provider in running feature for tracking
      tempRunningFeature.model = modelResult.model;
      tempRunningFeature.provider = provider;

      // Persist the resolved model to the feature JSON so the UI can display it
      await this.featureLoader.update(projectPath, featureId, { model: modelResult.model });

      // Sync and restack the branch before agent execution
      // This keeps the branch fresh and reduces merge conflicts
      if (branchName && useWorktrees) {
        logger.info(`Syncing branch ${branchName} before agent execution...`);
        this.callbacks.emitAutoModeEvent('sync_started', {
          featureId,
          branchName,
          message: `Syncing branch ${branchName} with parent...`,
        });

        const syncResult = await graphiteService.syncAndRestack(workDir, branchName);

        if (syncResult.success) {
          logger.info(`Branch ${branchName} synced successfully`);
          this.callbacks.emitAutoModeEvent('sync_completed', {
            featureId,
            branchName,
            message: 'Branch synchronized successfully',
          });
        } else if (syncResult.conflicts) {
          // Conflicts detected - emit warning but continue (non-blocking)
          logger.warn(`Branch ${branchName} has conflicts after sync: ${syncResult.error}`);
          this.callbacks.emitAutoModeEvent('sync_warning', {
            featureId,
            branchName,
            message: `Sync encountered conflicts: ${syncResult.error}. Agent will attempt to resolve.`,
            warning: true,
          });
        } else {
          // Graphite unavailable or failed — fall back to plain git rebase
          // This is the critical path: without this, agents start on stale code
          // when dependency PRs have merged since the worktree was created
          logger.info(
            `Graphite sync unavailable for ${branchName}, falling back to git fetch + rebase`
          );
          try {
            await execAsync('git fetch origin', { cwd: workDir, timeout: 30000 });
            await execAsync('git rebase origin/main', { cwd: workDir, timeout: 60000 });
            logger.info(`Branch ${branchName} rebased onto origin/main via git fallback`);
            this.callbacks.emitAutoModeEvent('sync_completed', {
              featureId,
              branchName,
              message: 'Branch rebased onto origin/main (git fallback)',
            });
          } catch (rebaseError) {
            const rebaseMsg =
              rebaseError instanceof Error ? rebaseError.message : String(rebaseError);
            // If rebase fails (conflicts), abort and let agent work on current state
            if (rebaseMsg.includes('conflict') || rebaseMsg.includes('CONFLICT')) {
              logger.warn(`Git rebase encountered conflicts for ${branchName}, aborting rebase`);
              try {
                await execAsync('git rebase --abort', { cwd: workDir, timeout: 10000 });
              } catch {
                // Abort failed — not much we can do
              }
              this.callbacks.emitAutoModeEvent('sync_warning', {
                featureId,
                branchName,
                message: `Rebase conflicts detected. Agent will work on current branch state.`,
                warning: true,
              });
            } else {
              logger.warn(`Git rebase failed for ${branchName}: ${rebaseMsg}`);
              this.callbacks.emitAutoModeEvent('sync_warning', {
                featureId,
                branchName,
                message: `Git rebase failed: ${rebaseMsg}. Continuing with agent execution.`,
                warning: true,
              });
            }
          }
        }
      }

      // Run the agent with the feature's model and images
      // Context files are passed as system prompt for higher priority
      // On retries, try to resume from the previous session if available
      const resumeSessionId = tempRunningFeature.retryCount > 0 ? feature.lastSessionId : undefined;
      if (resumeSessionId) {
        logger.info(
          `Resuming feature ${featureId} from session ${resumeSessionId} (retry #${tempRunningFeature.retryCount})`
        );
      }

      await this.runAgent(
        workDir,
        featureId,
        prompt,
        abortController,
        projectPath,
        imagePaths,
        modelResult.model,
        {
          projectPath,
          planningMode: feature.planningMode,
          requirePlanApproval: feature.requirePlanApproval,
          systemPrompt: combinedSystemPrompt || undefined,
          autoLoadClaudeMd,
          thinkingLevel: feature.thinkingLevel,
          branchName: feature.branchName ?? null,
          maxTurns,
          resume: resumeSessionId,
          providerId: modelResult.providerId,
        }
      );

      // Post-agent hook: detect and recover uncommitted work
      // Runs immediately after agent exits (before pipeline/git workflow steps)
      // so that stranded work is committed and a PR is created if the agent
      // completed implementation but failed to run its own git workflow step.
      if (worktreePath) {
        const recoveryResult = await checkAndRecoverUncommittedWork(feature, workDir);
        if (recoveryResult.detected) {
          if (recoveryResult.recovered) {
            // Recovery committed, pushed, and created a PR.
            // Update feature status to 'review' and emit completion so
            // lead-engineer-service waitForCompletion resolves.
            logger.info(
              `[PostAgentHook] Recovered uncommitted work for ${featureId}: PR at ${recoveryResult.prUrl}`
            );
            await this.featureLoader.update(projectPath, featureId, {
              status: 'review',
              prUrl: recoveryResult.prUrl,
              ...(recoveryResult.prNumber !== undefined && {
                prNumber: recoveryResult.prNumber,
              }),
              ...(recoveryResult.prCreatedAt && { prCreatedAt: recoveryResult.prCreatedAt }),
            });
            this.callbacks.emitAutoModeEvent('auto_mode_git_workflow', {
              featureId,
              pushed: true,
              prUrl: recoveryResult.prUrl,
              prNumber: recoveryResult.prNumber,
              projectPath,
            });
            this.events.emit('feature:completed', {
              projectPath,
              featureId,
              featureTitle: feature.title,
              status: 'review',
            });
            return;
          } else {
            // Recovery failed — mark as blocked and surface error to waitForCompletion
            const reason = `git workflow failed — uncommitted work in worktree at ${workDir}: ${recoveryResult.error ?? 'unknown'}`;
            logger.warn(
              `[PostAgentHook] Recovery failed for ${featureId}: ${recoveryResult.error}`
            );
            await this.featureLoader.update(projectPath, featureId, {
              status: 'blocked',
              statusChangeReason: reason,
              failureCount: (feature.failureCount ?? 0) + 1,
            });
            this.events.emit('feature:error', {
              projectPath,
              featureId,
              error: reason,
            });
            return;
          }
        }
      }

      // Check for pipeline steps and execute them
      const pipelineConfig = await pipelineService.getPipelineConfig(projectPath);
      const sortedSteps = [...(pipelineConfig?.steps || [])].sort((a, b) => a.order - b.order);

      if (sortedSteps.length > 0) {
        // Execute pipeline steps sequentially
        await this.executePipelineSteps(
          projectPath,
          featureId,
          feature,
          sortedSteps,
          workDir,
          abortController,
          autoLoadClaudeMd
        );
      }

      // Determine final status based on testing mode:
      // - skipTests=false (automated testing): go directly to 'verified' (no manual verify needed)
      // - skipTests=true (manual verification): go to 'waiting_approval' for manual review
      const finalStatus = feature.skipTests ? 'waiting_approval' : 'verified';

      // Ensure worktree is clean before marking as verified
      await ensureCleanWorktree(workDir, featureId, feature.branchName ?? 'main');

      await this.callbacks.updateFeatureStatus(projectPath, featureId, finalStatus);

      // Record success to reset consecutive failure tracking
      this.callbacks.recordSuccessForProject(projectPath, feature?.branchName ?? null);

      // Capture execution record on success
      try {
        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - tempRunningFeature.startTime;
        const currentFeature = await this.featureLoader.get(projectPath, featureId);
        // Calculate execution-specific cost delta (not cumulative cost)
        const executionCostUsd = Math.max(0, (currentFeature?.costUsd ?? 0) - startingCostUsd);
        const record: ExecutionRecord = {
          id: executionId,
          startedAt: executionStartedAt,
          completedAt,
          durationMs,
          costUsd: executionCostUsd,
          model: modelResult.model,
          success: true,
          trigger: isAutoMode ? (tempRunningFeature.retryCount > 0 ? 'retry' : 'auto') : 'manual',
        };
        const history = currentFeature?.executionHistory ?? [];
        await this.featureLoader.update(projectPath, featureId, {
          executionHistory: [...history, record],
        });

        // Increment Prometheus metrics
        if (record.costUsd) {
          agentCostTotal.inc({ feature_id: featureId, model: record.model }, record.costUsd);
        }
        if (record.durationMs) {
          agentExecutionDuration.observe(
            { feature_id: featureId, complexity: currentFeature?.complexity || 'medium' },
            record.durationMs / 1000
          );
        }
        if (record.inputTokens) {
          agentTokensInputTotal.inc({ model: record.model }, record.inputTokens);
        }
        if (record.outputTokens) {
          agentTokensOutputTotal.inc({ model: record.model }, record.outputTokens);
        }
        agentExecutionsTotal.inc({
          model: record.model,
          complexity: currentFeature?.complexity || 'medium',
          success: 'true',
        });
      } catch (recordError) {
        logger.warn(`Failed to save execution record for ${featureId}:`, recordError);
      }

      // Record learnings and memory usage after successful feature completion
      try {
        const featureDir = getFeatureDir(projectPath, featureId);
        const outputPath = path.join(featureDir, 'agent-output.md');
        let agentOutput = '';
        try {
          const outputContent = await secureFs.readFile(outputPath, 'utf-8');
          agentOutput =
            typeof outputContent === 'string' ? outputContent : outputContent.toString();
        } catch {
          // Agent output might not exist yet
        }

        // Extract and save summary to feature for real-time display on kanban cards
        if (agentOutput) {
          const extractedSummary = this.extractSummaryFromOutput(agentOutput);
          if (extractedSummary) {
            try {
              await this.featureLoader.update(projectPath, featureId, {
                summary: extractedSummary,
              });
              logger.info(
                `Saved summary for feature ${featureId} (${extractedSummary.length} chars)`
              );
            } catch (summaryError) {
              logger.warn(`Failed to save summary for feature ${featureId}:`, summaryError);
            }
          }
        }

        // Record memory usage if we loaded any memory files
        if (contextResult.memoryFiles.length > 0 && agentOutput) {
          await recordMemoryUsage(
            projectPath,
            contextResult.memoryFiles,
            agentOutput,
            true, // success
            secureFs as Parameters<typeof recordMemoryUsage>[4]
          );
        }

        // Extract and record learnings from the agent output
        await this.recordLearningsFromFeature(projectPath, feature, agentOutput);
      } catch (learningError) {
        logger.warn('Failed to record learnings:', learningError);
      }

      // Run git workflow (commit, push, PR) if enabled
      let gitWorkflowResult: Awaited<
        ReturnType<typeof gitWorkflowService.runPostCompletionWorkflow>
      > = null;
      if (this.settingsService) {
        try {
          const settings = await this.settingsService.getGlobalSettings();

          // Look up epic branch name if feature belongs to an epic
          let epicBranchName: string | undefined;
          if (feature.epicId && !feature.isEpic) {
            const epicFeature = await this.featureLoader.get(projectPath, feature.epicId);
            epicBranchName = epicFeature?.branchName;
            if (epicBranchName) {
              logger.info(`Feature ${featureId} belongs to epic, PR will target ${epicBranchName}`);
            }
          }

          gitWorkflowResult = await gitWorkflowService.runPostCompletionWorkflow(
            projectPath,
            featureId,
            feature,
            workDir,
            settings,
            epicBranchName,
            this.events
          );
          if (gitWorkflowResult) {
            // Check if git workflow encountered conflicts
            if (gitWorkflowResult.error && gitWorkflowResult.error.includes('conflict')) {
              this.callbacks.emitAutoModeEvent('auto_mode_progress', {
                featureId,
                featureName: feature.title,
                message: `Git workflow warning: ${gitWorkflowResult.error}`,
                projectPath,
              });
            }

            this.callbacks.emitAutoModeEvent('auto_mode_git_workflow', {
              featureId,
              committed: gitWorkflowResult.commitHash,
              pushed: gitWorkflowResult.pushed,
              prUrl: gitWorkflowResult.prUrl,
              prNumber: gitWorkflowResult.prNumber,
              prAlreadyExisted: gitWorkflowResult.prAlreadyExisted,
              projectPath,
            });

            // Transition feature to 'review' or 'done' based on merge status
            if (gitWorkflowResult.prUrl) {
              const updates: Record<string, unknown> = {
                prUrl: gitWorkflowResult.prUrl,
                prNumber: gitWorkflowResult.prNumber,
              };

              // Set PR creation timestamp
              if (gitWorkflowResult.prCreatedAt) {
                updates.prCreatedAt = gitWorkflowResult.prCreatedAt;
              }

              // If PR was auto-merged, set merge timestamp and status to 'done'
              if (gitWorkflowResult.merged && gitWorkflowResult.prMergedAt) {
                updates.status = 'done';
                updates.prMergedAt = gitWorkflowResult.prMergedAt;

                // Calculate review duration if prCreatedAt is available
                if (gitWorkflowResult.prCreatedAt) {
                  const createdAt = new Date(gitWorkflowResult.prCreatedAt);
                  const mergedAt = new Date(gitWorkflowResult.prMergedAt);
                  updates.prReviewDurationMs = mergedAt.getTime() - createdAt.getTime();
                }
              } else {
                // PR created but not merged - transition to 'review'
                updates.status = 'review';
              }

              await this.featureLoader.update(projectPath, featureId, updates);
            }
          }
        } catch (gitError) {
          logger.warn(`Git workflow failed for ${featureId}:`, gitError);
          // Don't fail the feature - git workflow is best-effort
          // Store the error on the feature for UI visibility (non-blocking)
          this.featureLoader
            .update(projectPath, featureId, {
              gitWorkflowError: {
                message: gitError instanceof Error ? gitError.message : String(gitError),
                timestamp: new Date().toISOString(),
              },
            })
            .catch((e) => logger.warn(`Failed to persist git workflow error for ${featureId}:`, e));
        }
      }

      const gitInfo = gitWorkflowResult?.commitHash
        ? ` | Committed: ${gitWorkflowResult.commitHash}${gitWorkflowResult.pushed ? ', pushed' : ''}${gitWorkflowResult.prUrl ? `, PR: ${gitWorkflowResult.prUrl}` : ''}`
        : '';

      const runtimeSec = tempRunningFeature
        ? Math.round((Date.now() - tempRunningFeature.startTime) / 1000)
        : 0;
      this.callbacks.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        featureName: feature.title,
        branchName: feature.branchName ?? null,
        passes: true,
        message: `Feature completed in ${runtimeSec}s${finalStatus === 'verified' ? ' - auto-verified' : ''}${gitInfo}`,
        projectPath,
        model: tempRunningFeature?.model,
        provider: tempRunningFeature?.provider,
      });
    } catch (error) {
      const errorInfo = classifyError(error);

      // Capture execution record on failure (skip aborts — not real executions)
      if (!errorInfo.isAbort && tempRunningFeature.startTime) {
        try {
          const completedAt = new Date().toISOString();
          const durationMs = Date.now() - tempRunningFeature.startTime;
          const currentFeature = await this.featureLoader.get(projectPath, featureId);
          // Calculate execution-specific cost delta (not cumulative cost)
          const executionCostUsd = Math.max(0, (currentFeature?.costUsd ?? 0) - startingCostUsd);
          const record: ExecutionRecord = {
            id: executionId,
            startedAt: executionStartedAt,
            completedAt,
            durationMs,
            costUsd: executionCostUsd,
            model: tempRunningFeature.model || 'unknown',
            success: false,
            error: errorInfo.message,
            trigger: isAutoMode ? (tempRunningFeature.retryCount > 0 ? 'retry' : 'auto') : 'manual',
          };
          const history = currentFeature?.executionHistory ?? [];
          await this.featureLoader.update(projectPath, featureId, {
            executionHistory: [...history, record],
          });

          // Increment Prometheus metrics
          if (record.costUsd) {
            agentCostTotal.inc({ feature_id: featureId, model: record.model }, record.costUsd);
          }
          if (record.durationMs) {
            agentExecutionDuration.observe(
              { feature_id: featureId, complexity: currentFeature?.complexity || 'medium' },
              record.durationMs / 1000
            );
          }
          if (record.inputTokens) {
            agentTokensInputTotal.inc({ model: record.model }, record.inputTokens);
          }
          if (record.outputTokens) {
            agentTokensOutputTotal.inc({ model: record.model }, record.outputTokens);
          }
          agentExecutionsTotal.inc({
            model: record.model,
            complexity: currentFeature?.complexity || 'medium',
            success: 'false',
          });
        } catch (recordError) {
          logger.warn(`Failed to save execution record for ${featureId}:`, recordError);
        }
      }

      if (error instanceof LoopDetectedError && feature && tempRunningFeature) {
        // Loop detected: retry with recovery guidance
        const MAX_LOOP_RETRIES = 2;
        if (tempRunningFeature.retryCount < MAX_LOOP_RETRIES) {
          logger.warn(
            `Loop detected for ${featureId} (${error.loopSignature}). Retrying with recovery context.`
          );
          this.runningFeatures.delete(featureId);
          const currentRetryCount = tempRunningFeature.retryCount;
          const retryTimer = setTimeout(() => {
            this.retryTimers.delete(featureId);
            this.executeFeature(projectPath, featureId, useWorktrees, isAutoMode, undefined, {
              retryCount: currentRetryCount + 1,
              previousErrors: [...(tempRunningFeature.previousErrors || []), error.message],
              recoveryContext: `You were repeating the same actions in a loop (${error.loopSignature.split(':')[0]}). Try a different approach to accomplish the task.`,
            }).catch((retryErr) => {
              logger.error(`Loop recovery retry failed for ${featureId}:`, retryErr);
            });
          }, 5000);
          this.retryTimers.set(featureId, retryTimer);
        } else {
          logger.error(`Feature ${featureId} looped ${MAX_LOOP_RETRIES} times, giving up.`);
          await this.callbacks.updateFeatureStatus(projectPath, featureId, 'failed');
          this.callbacks.emitAutoModeEvent('auto_mode_feature_complete', {
            featureId,
            featureName: feature.title,
            branchName: feature.branchName ?? null,
            passes: false,
            message: `Feature stuck in loop after ${MAX_LOOP_RETRIES} retries`,
            projectPath,
          });
        }
      } else if (errorInfo.isAbort) {
        this.callbacks.emitAutoModeEvent('auto_mode_feature_complete', {
          featureId,
          featureName: feature?.title,
          branchName: feature?.branchName ?? null,
          passes: false,
          message: 'Feature stopped by user',
          projectPath,
        });
      } else if (errorInfo.type === 'max_turns' && feature && tempRunningFeature) {
        const retryScheduled = await this.handleTurnEscalation(
          featureId,
          projectPath,
          feature,
          tempRunningFeature,
          useWorktrees,
          providedWorktreePath,
          errorInfo
        );
        if (retryScheduled) {
          return;
        }
      } else {
        logger.error(`Feature ${featureId} failed:`, error);

        // Build execution context for recovery analysis
        const executionContext: ExecutionContext = {
          featureId,
          projectPath,
          worktreePath: tempRunningFeature?.worktreePath ?? undefined,
          retryCount: tempRunningFeature?.retryCount ?? 0,
          previousErrors: tempRunningFeature?.previousErrors ?? [],
          runningTime: tempRunningFeature ? Date.now() - tempRunningFeature.startTime : 0,
        };

        // Analyze failure and determine recovery strategy
        const failureAnalysis = await this.recoveryService.analyzeFailure(
          error,
          errorInfo,
          executionContext
        );

        // Execute recovery strategy
        const recoveryResult = await this.recoveryService.executeRecovery(
          featureId,
          failureAnalysis,
          projectPath
        );

        if (recoveryResult.shouldRetry && failureAnalysis.isRetryable && tempRunningFeature) {
          // Recovery suggests retry - schedule it with context
          logger.info(
            `Recovery for feature ${featureId}: scheduling retry (attempt ${tempRunningFeature.retryCount + 1}/${failureAnalysis.maxRetries})`
          );

          this.callbacks.emitAutoModeEvent('auto_mode_progress', {
            featureId,
            featureName: feature?.title,
            message: `Recovery: ${recoveryResult.actionTaken}`,
            projectPath,
          });

          // Wait for the suggested delay before retry
          if (failureAnalysis.suggestedDelay > 0) {
            await new Promise((resolve) => setTimeout(resolve, failureAnalysis.suggestedDelay));
          }

          // Remove from running features so retry can start
          this.runningFeatures.delete(featureId);

          // Capture values for closure before setImmediate
          const currentRetryCount = tempRunningFeature.retryCount;
          const newPreviousErrors = [...tempRunningFeature.previousErrors, errorInfo.message];

          // Use setImmediate to avoid stack overflow on deep retry chains
          setImmediate(() => {
            this.executeFeature(
              projectPath,
              featureId,
              useWorktrees,
              isAutoMode,
              providedWorktreePath,
              {
                retryCount: currentRetryCount + 1,
                previousErrors: newPreviousErrors,
                recoveryContext: recoveryResult.retryContext,
              }
            ).catch((retryError) => {
              logger.error(`Retry failed for feature ${featureId}:`, retryError);
            });
          });

          // Return early - don't move to backlog or track as failure
          return;
        }

        // Recovery didn't suggest retry or not retryable - fall back to original behavior
        // Increment failure count for model escalation on retry
        let newFailureCount = 0;
        if (feature) {
          newFailureCount = (feature.failureCount ?? 0) + 1;
          await this.featureLoader.update(projectPath, featureId, {
            failureCount: newFailureCount,
          });
          logger.info(`Feature ${featureId} failure count: ${newFailureCount}`);
        }

        // Detect git commit / pre-commit hook failures. These are deterministic — retrying
        // immediately will fail again and cause a retry storm. Apply exponential backoff
        // (min 30s, max 5min). After MAX_GIT_COMMIT_RETRIES attempts, leave blocked for
        // human review rather than continuing to burn API calls on a doomed loop.
        const GIT_COMMIT_FAILURE_PATTERNS = [
          'git commit',
          'git workflow failed',
          'pre-commit',
          'hook failed',
          'lint-staged',
        ];
        const MAX_GIT_COMMIT_RETRIES = 3;
        const isGitCommitFailure = GIT_COMMIT_FAILURE_PATTERNS.some((p) =>
          errorInfo.message.toLowerCase().includes(p)
        );

        if (isGitCommitFailure) {
          if (newFailureCount >= MAX_GIT_COMMIT_RETRIES) {
            logger.warn(
              `[GitCommitFailure] Feature ${featureId} blocked after ${newFailureCount} ` +
                `git commit failures — requires human intervention`
            );
            await this.featureLoader.update(projectPath, featureId, {
              status: 'blocked',
              statusChangeReason: `Git commit hook failure (${newFailureCount} attempts) — blocked for human review`,
            });
            this.callbacks.emitAutoModeEvent('auto_mode_error', {
              featureId,
              featureName: feature?.title,
              branchName: feature?.branchName ?? null,
              error: `Git commit hook failure (${newFailureCount} attempts) — blocked for human review`,
              errorType: 'git_commit_failure',
              projectPath,
            });
          } else {
            // Exponential backoff: 30s → 60s → 120s … max 5min
            const backoffMs = Math.min(30_000 * Math.pow(2, newFailureCount - 1), 300_000);
            logger.warn(
              `[GitCommitFailure] Feature ${featureId} git commit failed ` +
                `(attempt ${newFailureCount}), retrying in ${Math.round(backoffMs / 1000)}s`
            );
            const capturedId = featureId;
            const retryTimer = setTimeout(() => {
              this.retryTimers.delete(capturedId);
              this.callbacks
                .updateFeatureStatus(projectPath, capturedId, 'backlog')
                .catch((err) =>
                  logger.error(
                    `[GitCommitFailure] Failed to reset feature ${capturedId} to backlog after backoff:`,
                    err
                  )
                );
            }, backoffMs);
            this.retryTimers.set(featureId, retryTimer);
            this.callbacks.emitAutoModeEvent('auto_mode_error', {
              featureId,
              featureName: feature?.title,
              branchName: feature?.branchName ?? null,
              error: `Git commit failure — retrying in ${Math.round(backoffMs / 1000)}s (attempt ${newFailureCount})`,
              errorType: 'git_commit_failure',
              projectPath,
            });
          }
        } else {
          await this.callbacks.updateFeatureStatus(projectPath, featureId, 'backlog');
          this.callbacks.emitAutoModeEvent('auto_mode_error', {
            featureId,
            featureName: feature?.title,
            branchName: feature?.branchName ?? null,
            error: errorInfo.message,
            errorType: errorInfo.type,
            projectPath,
            recoveryAttempted: true,
            recoveryAction: recoveryResult.actionTaken,
            failureCategory: failureAnalysis.category,
          });
        }

        // Track this failure and check if we should pause auto mode
        // This handles both specific quota/rate limit errors AND generic failures
        // that may indicate quota exhaustion (SDK doesn't always return useful errors)
        const featureBranch = feature?.branchName ?? null;
        const shouldPause = this.callbacks.trackFailureAndCheckPauseForProject(
          projectPath,
          featureBranch,
          {
            type: errorInfo.type,
            message: errorInfo.message,
          }
        );

        if (shouldPause) {
          this.callbacks.signalShouldPauseForProject(projectPath, featureBranch, {
            type: errorInfo.type,
            message: errorInfo.message,
          });
        }
      }
    } finally {
      logger.info(`Feature ${featureId} execution ended, cleaning up runningFeatures`);
      abortController?.abort();

      // Only delete if the current entry is still the one we created
      // (delegated executions may have created a new entry)
      const current = this.runningFeatures.get(featureId);
      if (current === tempRunningFeature) {
        this.runningFeatures.delete(featureId);
        activeAgentsCount.set(this.runningFeatures.size);
      }

      // Update execution state after feature completes
      if (this.callbacks.getAutoLoopRunning() && projectPath) {
        await this.callbacks.saveExecutionState(projectPath);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Handle the max_turns error case: save progress, escalate turns, and retry.
   * Returns true if a retry was scheduled (caller should return early).
   */
  private async handleTurnEscalation(
    featureId: string,
    projectPath: string,
    feature: Feature,
    tempRunningFeature: RunningFeature,
    useWorktrees: boolean,
    providedWorktreePath: string | undefined,
    errorInfo: { type: string; message: string }
  ): Promise<boolean> {
    // Save uncommitted work so the retry agent picks up where this one left off
    if (tempRunningFeature.worktreePath && feature.branchName) {
      const savedHash = await gitWorkflowService.saveAgentProgress(
        tempRunningFeature.worktreePath,
        feature,
        feature.branchName
      );
      if (savedHash) {
        logger.info(
          `Saved agent progress checkpoint (${savedHash}) before max-turns retry for feature ${featureId}`
        );
      }
    }

    const MAX_MAX_TURNS_RETRIES = 3;
    const currentFailures = feature.failureCount ?? 0;
    const newFailureCount = currentFailures + 1;

    if (tempRunningFeature.retryCount >= MAX_MAX_TURNS_RETRIES) {
      logger.error(
        `Feature ${featureId} hit max turns limit ${MAX_MAX_TURNS_RETRIES} times, giving up.`
      );
      // Persist terminal status so the feature doesn't stay stuck in running/in-progress
      await this.callbacks.updateFeatureStatus(projectPath, featureId, 'failed');
      await this.featureLoader.update(projectPath, featureId, {
        error: `Exceeded max-turns retry limit (${MAX_MAX_TURNS_RETRIES} retries)`,
        lastFailureTime: new Date().toISOString(),
      });
      this.callbacks.emitAutoModeEvent('auto_mode_feature_complete', {
        featureId,
        featureName: feature.title,
        branchName: feature.branchName ?? null,
        passes: false,
        message: `Feature exceeded max-turns retry limit (${MAX_MAX_TURNS_RETRIES} retries)`,
        projectPath,
      });
      return false;
    }

    const escalatedTurns = getTurnsForFeature({
      ...feature,
      failureCount: newFailureCount,
    });

    logger.warn(
      `Feature ${featureId} hit max turns limit (failure #${newFailureCount}). ` +
        `Escalating turns to ${escalatedTurns} for retry.`
    );

    await this.featureLoader.update(projectPath, featureId, {
      failureCount: newFailureCount,
    });

    this.callbacks.emitAutoModeEvent('auto_mode_progress', {
      featureId,
      featureName: feature.title,
      message: `Hit turn limit. Retrying with ${escalatedTurns} turns (attempt ${newFailureCount + 1}).`,
      projectPath,
    });

    // Remove from running features and retry with escalated turns using backoff
    this.runningFeatures.delete(featureId);

    // Capture values for closure before setTimeout
    const currentRetryCount = tempRunningFeature.retryCount;
    const currentPreviousErrors = tempRunningFeature.previousErrors;
    const backoffMs = Math.min(1000 * Math.pow(2, currentRetryCount), 30_000);
    const retryTimer = setTimeout(() => {
      this.retryTimers.delete(featureId);
      this.executeFeature(
        projectPath,
        featureId,
        useWorktrees,
        tempRunningFeature.isAutoMode,
        providedWorktreePath,
        {
          retryCount: currentRetryCount + 1,
          previousErrors: [...currentPreviousErrors, errorInfo.message],
        }
      ).catch((retryError) => {
        logger.error(`Max-turns retry failed for feature ${featureId}:`, retryError);
      });
    }, backoffMs);
    this.retryTimers.set(featureId, retryTimer);
    return true;
  }

  /**
   * Execute pipeline steps sequentially after initial feature implementation.
   */
  async executePipelineSteps(
    projectPath: string,
    featureId: string,
    feature: Feature,
    steps: PipelineStep[],
    workDir: string,
    abortController: AbortController,
    autoLoadClaudeMd: boolean
  ): Promise<void> {
    logger.info(`Executing ${steps.length} pipeline step(s) for feature ${featureId}`);

    // Get customized prompts from settings
    const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');

    // Load context files once with feature context for smart memory selection
    const contextResult = await loadContextFiles({
      projectPath,
      fsModule: secureFs as Parameters<typeof loadContextFiles>[0]['fsModule'],
      taskContext: {
        title: feature.title ?? '',
        description: feature.description ?? '',
      },
    });
    const contextFilesPrompt = filterClaudeMdFromContext(contextResult, autoLoadClaudeMd);

    // Load previous agent output for context continuity
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, 'agent-output.md');
    let previousContext = '';
    try {
      previousContext = (await secureFs.readFile(contextPath, 'utf-8')) as string;
    } catch {
      // No previous context
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      previousContext = await this.executePipelineStep(
        projectPath,
        featureId,
        feature,
        step,
        i,
        steps.length,
        workDir,
        abortController,
        autoLoadClaudeMd,
        previousContext,
        prompts,
        contextFilesPrompt
      );
    }

    logger.info(`All pipeline steps completed for feature ${featureId}`);
  }

  /**
   * Execute a single pipeline step.
   * Returns the updated previousContext after the step completes.
   */
  private async executePipelineStep(
    projectPath: string,
    featureId: string,
    feature: Feature,
    step: PipelineStep,
    stepIndex: number,
    totalSteps: number,
    workDir: string,
    abortController: AbortController,
    autoLoadClaudeMd: boolean,
    previousContext: string,
    prompts: {
      taskExecution: {
        implementationInstructions: string;
        playwrightVerificationInstructions: string;
      };
    },
    contextFilesPrompt: string
  ): Promise<string> {
    const pipelineStatus = `pipeline_${step.id}`;

    // Update feature status to current pipeline step
    await this.callbacks.updateFeatureStatus(projectPath, featureId, pipelineStatus);

    this.callbacks.emitAutoModeEvent('auto_mode_progress', {
      featureId,
      branchName: feature.branchName ?? null,
      content: `Starting pipeline step ${stepIndex + 1}/${totalSteps}: ${step.name}`,
      projectPath,
    });

    this.callbacks.emitAutoModeEvent('pipeline_step_started', {
      featureId,
      stepId: step.id,
      stepName: step.name,
      stepIndex,
      totalSteps,
      projectPath,
    });

    // Build prompt for this pipeline step
    const prompt = this.buildPipelineStepPrompt(
      step,
      feature,
      previousContext,
      prompts.taskExecution
    );

    // Get model based on feature complexity and failure count
    const modelResult = await this.callbacks.getModelForFeature(feature, projectPath);

    // Run the agent for this pipeline step
    await this.runAgent(
      workDir,
      featureId,
      prompt,
      abortController,
      projectPath,
      undefined, // no images for pipeline steps
      modelResult.model,
      {
        projectPath,
        planningMode: 'skip', // Pipeline steps don't need planning
        requirePlanApproval: false,
        previousContent: previousContext,
        systemPrompt: contextFilesPrompt || undefined,
        autoLoadClaudeMd,
        thinkingLevel: feature.thinkingLevel,
        providerId: modelResult.providerId,
      }
    );

    // Load updated context for next step
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, 'agent-output.md');
    let updatedContext = previousContext;
    try {
      updatedContext = (await secureFs.readFile(contextPath, 'utf-8')) as string;
    } catch {
      // No context update
    }

    // Extract and accumulate pipeline step summary
    if (updatedContext) {
      const stepSummary = this.extractSummaryFromOutput(updatedContext);
      if (stepSummary) {
        try {
          const currentFeature = await this.featureLoader.get(projectPath, featureId);
          if (currentFeature) {
            const existingSummaries = currentFeature.pipelineSummaries ?? [];
            await this.featureLoader.update(projectPath, featureId, {
              pipelineSummaries: [
                ...existingSummaries,
                {
                  stepId: step.id,
                  stepName: step.name,
                  summary: stepSummary,
                  completedAt: new Date().toISOString(),
                },
              ],
            });
          }
        } catch (summaryError) {
          logger.warn(`Failed to save pipeline step summary for ${featureId}:`, summaryError);
        }
      }
    }

    this.callbacks.emitAutoModeEvent('pipeline_step_complete', {
      featureId,
      stepId: step.id,
      stepName: step.name,
      stepIndex,
      totalSteps,
      projectPath,
    });

    logger.info(
      `Pipeline step ${stepIndex + 1}/${totalSteps} (${step.name}) completed for feature ${featureId}`
    );

    return updatedContext;
  }

  /**
   * Build the prompt for a pipeline step.
   */
  private buildPipelineStepPrompt(
    step: PipelineStep,
    feature: Feature,
    previousContext: string,
    taskExecutionPrompts: {
      implementationInstructions: string;
      playwrightVerificationInstructions: string;
    }
  ): string {
    let prompt = `## Pipeline Step: ${step.name}

This is an automated pipeline step following the initial feature implementation.

### Feature Context
${this.buildFeaturePrompt(feature, taskExecutionPrompts)}

`;

    if (previousContext) {
      prompt += `### Previous Work
The following is the output from the previous work on this feature:

${previousContext}

`;
    }

    prompt += `### Pipeline Step Instructions
${step.instructions}

### Task
Complete the pipeline step instructions above. Review the previous work and apply the required changes or actions.`;

    return prompt;
  }

  /**
   * Run the agent for a feature or pipeline step.
   */
  async runAgent(
    workDir: string,
    featureId: string,
    prompt: string,
    abortController: AbortController,
    projectPath: string,
    imagePaths?: string[],
    model?: string,
    options?: {
      projectPath?: string;
      planningMode?: PlanningMode;
      requirePlanApproval?: boolean;
      previousContent?: string;
      systemPrompt?: string;
      autoLoadClaudeMd?: boolean;
      thinkingLevel?: ThinkingLevel;
      branchName?: string | null;
      maxTurns?: number;
      resume?: string;
      /** Provider ID from PhaseModelEntry for explicit provider lookup */
      providerId?: string;
    }
  ): Promise<void> {
    const finalProjectPath = options?.projectPath || projectPath;
    const branchName = options?.branchName ?? null;
    const planningMode = options?.planningMode || 'skip';
    const previousContent = options?.previousContent;

    // Validate vision support before processing images
    const effectiveModel = model || 'claude-sonnet-4-20250514';
    if (imagePaths && imagePaths.length > 0) {
      const supportsVision = ProviderFactory.modelSupportsVision(effectiveModel);
      if (!supportsVision) {
        throw new Error(
          `This model (${effectiveModel}) does not support image input. ` +
            `Please switch to a model that supports vision (like Claude models), or remove the images and try again.`
        );
      }
    }

    // Check if this planning mode can generate a spec/plan that needs approval
    // - spec and full always generate specs
    // - lite only generates approval-ready content when requirePlanApproval is true
    const planningModeRequiresApproval =
      planningMode === 'spec' ||
      planningMode === 'full' ||
      (planningMode === 'lite' && options?.requirePlanApproval === true);
    const requiresApproval = planningModeRequiresApproval && options?.requirePlanApproval === true;

    // CI/CD Mock Mode: Return early with mock response when AUTOMAKER_MOCK_AGENT is set
    // This prevents actual API calls during automated testing
    if (process.env.AUTOMAKER_MOCK_AGENT === 'true') {
      logger.info(`MOCK MODE: Skipping real agent execution for feature ${featureId}`);

      // Simulate some work being done
      await sleep(500);

      // Emit mock progress events to simulate agent activity
      this.callbacks.emitAutoModeEvent('auto_mode_progress', {
        featureId,
        content: 'Mock agent: Analyzing the codebase...',
      });

      await sleep(300);

      this.callbacks.emitAutoModeEvent('auto_mode_progress', {
        featureId,
        content: 'Mock agent: Implementing the feature...',
      });

      await sleep(300);

      // Create a mock file with "yellow" content as requested in the test
      const mockFilePath = path.join(workDir, 'yellow.txt');
      await secureFs.writeFile(mockFilePath, 'yellow');

      this.callbacks.emitAutoModeEvent('auto_mode_progress', {
        featureId,
        content: "Mock agent: Created yellow.txt file with content 'yellow'",
      });

      await sleep(200);

      // Save mock agent output
      const featureDirForOutput = getFeatureDir(projectPath, featureId);
      const outputPath = path.join(featureDirForOutput, 'agent-output.md');

      const mockOutput = `# Mock Agent Output

## Summary
This is a mock agent response for CI/CD testing.

## Changes Made
- Created \`yellow.txt\` with content "yellow"

## Notes
This mock response was generated because AUTOMAKER_MOCK_AGENT=true was set.
`;

      await secureFs.mkdir(path.dirname(outputPath), { recursive: true });
      await secureFs.writeFile(outputPath, mockOutput);

      logger.info(`MOCK MODE: Completed mock execution for feature ${featureId}`);
      return;
    }

    // Load autoLoadClaudeMd setting (project setting takes precedence over global)
    // Use provided value if available, otherwise load from settings
    const autoLoadClaudeMd =
      options?.autoLoadClaudeMd !== undefined
        ? options.autoLoadClaudeMd
        : await getAutoLoadClaudeMdSetting(finalProjectPath, this.settingsService, '[AutoMode]');

    // Load MCP servers from settings (global setting only)
    const mcpServers = await getMCPServersFromSettings(this.settingsService, '[AutoMode]');

    // Build SDK options using centralized configuration for feature implementation
    const sdkOptions = createAutoModeOptions({
      cwd: workDir,
      model: model,
      abortController,
      autoLoadClaudeMd,
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
      thinkingLevel: options?.thinkingLevel,
      maxTurns: options?.maxTurns,
      resume: options?.resume,
    });

    // Extract model, maxTurns, and allowedTools from SDK options
    const finalModel = sdkOptions.model!;
    const maxTurns = sdkOptions.maxTurns;
    const allowedTools = sdkOptions.allowedTools as string[] | undefined;

    logger.info(
      `runAgent called for feature ${featureId} with model: ${finalModel}, planningMode: ${planningMode}, requiresApproval: ${requiresApproval}`
    );

    // Get provider for this model
    const provider = ProviderFactory.getProviderForModel(finalModel);

    // Strip provider prefix - providers should receive bare model IDs
    const bareModel = stripProviderPrefix(finalModel);

    logger.info(
      `Using provider "${provider.getName()}" for model "${finalModel}" (bare: ${bareModel})`
    );

    // Build prompt content with images using utility
    const { content: promptContent } = await buildPromptWithImages(
      prompt,
      imagePaths,
      workDir,
      false // don't duplicate paths in text
    );

    // Debug: Log if system prompt is provided
    if (options?.systemPrompt) {
      logger.info(
        `System prompt provided (${options.systemPrompt.length} chars), first 200 chars:\n${options.systemPrompt.substring(0, 200)}...`
      );
    }

    // Get credentials for API calls (model comes from request, no phase model)
    const credentials = await this.settingsService?.getCredentials();

    // Try to find a provider for the model (if it's a provider model like "GLM-4.7")
    // This allows users to select provider models in the Auto Mode / Feature execution
    let claudeCompatibleProvider:
      | import('@protolabs-ai/types').ClaudeCompatibleProvider
      | undefined;
    let providerResolvedModel: string | undefined;
    if (finalModel && this.settingsService) {
      // If providerId is explicitly set (from agentExecutionModel phase setting),
      // look up the provider directly instead of scanning by model string
      if (options?.providerId) {
        const globalSettings = await this.settingsService.getGlobalSettings();
        const directProvider = globalSettings.claudeCompatibleProviders?.find(
          (p) => p.id === options.providerId && p.enabled !== false
        );
        if (directProvider) {
          claudeCompatibleProvider = directProvider;
          const modelConfig = directProvider.models?.find(
            (m) => m.id === finalModel || m.id.toLowerCase() === finalModel.toLowerCase()
          );
          if (modelConfig?.mapsToClaudeModel) {
            providerResolvedModel = resolveModelString(modelConfig.mapsToClaudeModel);
          }
          logger.info(
            `[AutoMode] Using explicit provider "${directProvider.name}" (id: ${options.providerId}) for model "${finalModel}"` +
              (providerResolvedModel ? ` -> resolved to "${providerResolvedModel}"` : '')
          );
        }
      }

      // Fallback: scan all providers by model ID
      if (!claudeCompatibleProvider) {
        const providerResult = await getProviderByModelId(
          finalModel,
          this.settingsService,
          '[AutoMode]'
        );
        if (providerResult.provider) {
          claudeCompatibleProvider = providerResult.provider;
          providerResolvedModel = providerResult.resolvedModel;
          logger.info(
            `[AutoMode] Using provider "${providerResult.provider.name}" for model "${finalModel}"` +
              (providerResolvedModel ? ` -> resolved to "${providerResolvedModel}"` : '')
          );
        }
      }
    }

    // Use the resolved model if available (from mapsToClaudeModel), otherwise use bareModel
    const effectiveBareModel = providerResolvedModel
      ? stripProviderPrefix(providerResolvedModel)
      : bareModel;

    const executeOptions: ExecuteOptions = {
      prompt: promptContent,
      model: effectiveBareModel,
      maxTurns: maxTurns,
      cwd: workDir,
      allowedTools: allowedTools,
      abortController,
      systemPrompt: sdkOptions.systemPrompt,
      settingSources: sdkOptions.settingSources,
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined, // Pass MCP servers configuration
      thinkingLevel: options?.thinkingLevel, // Pass thinking level for extended thinking
      credentials, // Pass credentials for resolving 'credentials' apiKeySource
      claudeCompatibleProvider, // Pass provider for alternative endpoint configuration (GLM, MiniMax, etc.)
      sdkSessionId: options?.resume, // Forward resume session ID for session continuity
    };

    // Execute via provider
    logger.info(`Starting stream for feature ${featureId}...`);
    const stream = provider.executeQuery(executeOptions);
    logger.info(`Stream created, starting to iterate...`);
    // Initialize with previous content if this is a follow-up, with a separator
    let responseText = previousContent
      ? `${previousContent}\n\n---\n\n## Follow-up Session\n\n`
      : '';
    let specDetected = false;

    // Agent output goes to .automaker directory
    // Note: We use projectPath here, not workDir, because workDir might be a worktree path
    const featureDirForOutput = getFeatureDir(projectPath, featureId);
    const outputPath = path.join(featureDirForOutput, 'agent-output.md');
    const rawOutputPath = path.join(featureDirForOutput, 'raw-output.jsonl');

    // Raw output logging is configurable via environment variable
    // Set AUTOMAKER_DEBUG_RAW_OUTPUT=true to enable raw stream event logging
    const enableRawOutput =
      process.env.AUTOMAKER_DEBUG_RAW_OUTPUT === 'true' ||
      process.env.AUTOMAKER_DEBUG_RAW_OUTPUT === '1';

    // Incremental file writing state
    let writeTimeout: ReturnType<typeof setTimeout> | null = null;
    const WRITE_DEBOUNCE_MS = 500; // Batch writes every 500ms
    const RESPONSE_TEXT_MAX_SIZE = 5 * 1024 * 1024; // 5MB threshold for responseText
    let responseTextFlushedToFile = false; // Track if we've hit the threshold

    // Raw output accumulator for debugging (NDJSON format)
    let rawOutputLines: string[] = [];
    let rawWriteTimeout: ReturnType<typeof setTimeout> | null = null;

    // Helper to append raw stream event for debugging (only when enabled)
    const appendRawEvent = (event: unknown): void => {
      if (!enableRawOutput) return;

      try {
        const timestamp = new Date().toISOString();
        const rawLine = JSON.stringify({ timestamp, event }, null, 4); // Pretty print for readability
        rawOutputLines.push(rawLine);

        // Debounced write of raw output
        if (rawWriteTimeout) {
          clearTimeout(rawWriteTimeout);
        }
        rawWriteTimeout = setTimeout(async () => {
          try {
            await secureFs.mkdir(path.dirname(rawOutputPath), { recursive: true });
            await secureFs.appendFile(rawOutputPath, rawOutputLines.join('\n') + '\n');
            rawOutputLines = []; // Clear after writing
          } catch (error) {
            logger.error(`Failed to write raw output for ${featureId}:`, error);
          }
        }, WRITE_DEBOUNCE_MS);
      } catch {
        // Ignore serialization errors
      }
    };

    // Helper to write current responseText to file
    const writeToFile = async (): Promise<void> => {
      try {
        await secureFs.mkdir(path.dirname(outputPath), { recursive: true });
        await secureFs.writeFile(outputPath, responseText);
      } catch (error) {
        // Log but don't crash - file write errors shouldn't stop execution
        logger.error(`Failed to write agent output for ${featureId}:`, error);
      }
    };

    // Debounced write - schedules a write after WRITE_DEBOUNCE_MS
    const scheduleWrite = (): void => {
      if (writeTimeout) {
        clearTimeout(writeTimeout);
      }
      writeTimeout = setTimeout(() => {
        writeToFile();
      }, WRITE_DEBOUNCE_MS);
    };

    // Heartbeat logging so "silent" model calls are visible.
    // Some runs can take a while before the first streamed message arrives.
    const streamStartTime = Date.now();
    let receivedAnyStreamMessage = false;
    const STREAM_HEARTBEAT_MS = 15_000;
    const streamHeartbeat = setInterval(() => {
      if (receivedAnyStreamMessage) return;
      const elapsedSeconds = Math.round((Date.now() - streamStartTime) / 1000);
      logger.info(
        `Waiting for first model response for feature ${featureId} (${elapsedSeconds}s elapsed)...`
      );
    }, STREAM_HEARTBEAT_MS);

    // Memory monitoring heartbeat - check heap usage every 30 seconds during execution
    const MEMORY_CHECK_MS = 30_000;
    const memoryHeartbeat = setInterval(() => {
      const heapUsage = this.getHeapUsagePercent();
      if (heapUsage >= this.heapAbortThreshold) {
        logger.error(
          `[Agent ${featureId}] Critical heap usage (${Math.round(heapUsage * 100)}%), aborting agent`
        );
        abortController.abort();
      } else if (heapUsage >= this.heapStopThreshold) {
        logger.warn(
          `[Agent ${featureId}] High heap usage (${Math.round(heapUsage * 100)}%) during execution`
        );
      }
    }, MEMORY_CHECK_MS);

    // Stream observer for loop and stall detection (can be disabled via workflow settings)
    const workflowSettings = await getWorkflowSettings(
      projectPath,
      this.settingsService,
      '[AutoMode]'
    );
    const loopDetectionEnabled = workflowSettings.pipeline.loopDetectionEnabled;
    const streamObserver = loopDetectionEnabled ? new StreamObserver() : null;
    let loopDetected = false;

    // Wrap stream processing in try/finally to ensure timeout cleanup on any error/abort
    try {
      streamLoop: for await (const msg of stream) {
        receivedAnyStreamMessage = true;
        // Log raw stream event for debugging
        appendRawEvent(msg);

        logger.info(`Stream message received:`, msg.type, msg.subtype || '');
        if (msg.type === 'assistant' && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              const newText = block.text || '';

              // Skip empty text
              if (!newText) continue;

              // Feed text to stream observer for stall detection (if enabled)
              streamObserver?.onTextChunk(newText);

              // Note: Cursor-specific dedup (duplicate blocks, accumulated text) is now
              // handled in CursorProvider.deduplicateTextBlocks() for cleaner separation

              // Only add separator when we're at a natural paragraph break:
              // - Previous text ends with sentence terminator AND new text starts a new thought
              // - Don't add separators mid-word or mid-sentence (for streaming providers like Cursor)
              if (responseText.length > 0 && newText.length > 0) {
                const lastChar = responseText.slice(-1);
                const endsWithSentence = /[.!?:]\s*$/.test(responseText);
                const endsWithNewline = /\n\s*$/.test(responseText);
                const startsNewParagraph = /^[\n#\-*>]/.test(newText);

                // Add paragraph break only at natural boundaries
                if (
                  !endsWithNewline &&
                  (endsWithSentence || startsNewParagraph) &&
                  !/[a-zA-Z0-9]/.test(lastChar) // Not mid-word
                ) {
                  responseText += '\n\n';
                }
              }
              responseText += newText;

              // Check if responseText exceeds threshold and flush to disk
              if (
                !responseTextFlushedToFile &&
                Buffer.byteLength(responseText, 'utf8') > RESPONSE_TEXT_MAX_SIZE
              ) {
                logger.info(
                  `responseText exceeded ${RESPONSE_TEXT_MAX_SIZE / (1024 * 1024)}MB for feature ${featureId}, flushing to disk`
                );
                // Flush to disk immediately
                await writeToFile();
                // Keep only last 100KB in memory for context
                const keepSize = 100 * 1024;
                const textBuffer = Buffer.from(responseText, 'utf8');
                if (textBuffer.length > keepSize) {
                  const truncatedBuffer = textBuffer.subarray(textBuffer.length - keepSize);
                  responseText = `[...previous content flushed to disk...]\n\n${truncatedBuffer.toString('utf8')}`;
                }
                responseTextFlushedToFile = true;
              }

              // Check for authentication errors in the response
              if (
                block.text &&
                (block.text.includes('Invalid API key') ||
                  block.text.includes('authentication_failed') ||
                  block.text.includes('Fix external API key'))
              ) {
                throw new Error(
                  'Authentication failed: Invalid or expired API key. ' +
                    "Please check your ANTHROPIC_API_KEY, or run 'claude login' to re-authenticate."
                );
              }

              // Schedule incremental file write (debounced)
              scheduleWrite();

              // Check for [SPEC_GENERATED] marker in planning modes (spec or full)
              if (
                planningModeRequiresApproval &&
                !specDetected &&
                responseText.includes('[SPEC_GENERATED]')
              ) {
                specDetected = true;

                // Extract plan content (everything before the marker)
                const markerIndex = responseText.indexOf('[SPEC_GENERATED]');
                const planContent = responseText.substring(0, markerIndex).trim();

                // Parse tasks from the generated spec (for spec and full modes)
                // Use let since we may need to update this after plan revision
                let parsedTasks = parseTasksFromSpec(planContent);
                const tasksTotal = parsedTasks.length;

                logger.info(`Parsed ${tasksTotal} tasks from spec for feature ${featureId}`);
                if (parsedTasks.length > 0) {
                  logger.info(`Tasks: ${parsedTasks.map((t) => t.id).join(', ')}`);
                }

                // Update planSpec status to 'generated' and save content with parsed tasks
                await this.callbacks.updateFeaturePlanSpec(projectPath, featureId, {
                  status: 'generated',
                  content: planContent,
                  version: 1,
                  generatedAt: new Date().toISOString(),
                  reviewedByUser: false,
                  tasks: parsedTasks,
                  tasksTotal,
                  tasksCompleted: 0,
                });

                let approvedPlanContent = planContent;
                let userFeedback: string | undefined;
                let currentPlanContent = planContent;
                let planVersion = 1;

                // Only pause for approval if requirePlanApproval is true
                if (requiresApproval) {
                  // ========================================
                  // PLAN REVISION LOOP
                  // Keep regenerating plan until user approves
                  // ========================================
                  let planApproved = false;

                  while (!planApproved) {
                    logger.info(
                      `Spec v${planVersion} generated for feature ${featureId}, waiting for approval`
                    );

                    // CRITICAL: Register pending approval BEFORE emitting event
                    const approvalPromise = this.callbacks.waitForPlanApproval(
                      featureId,
                      projectPath
                    );

                    // Emit plan_approval_required event
                    this.callbacks.emitAutoModeEvent('plan_approval_required', {
                      featureId,
                      projectPath,
                      branchName,
                      planContent: currentPlanContent,
                      planningMode,
                      planVersion,
                    });

                    // Wait for user response
                    try {
                      const approvalResult = await approvalPromise;

                      if (approvalResult.approved) {
                        // User approved the plan
                        logger.info(`Plan v${planVersion} approved for feature ${featureId}`);
                        planApproved = true;

                        // If user provided edits, use the edited version
                        if (approvalResult.editedPlan) {
                          approvedPlanContent = approvalResult.editedPlan;
                          await this.callbacks.updateFeaturePlanSpec(projectPath, featureId, {
                            content: approvalResult.editedPlan,
                          });
                        } else {
                          approvedPlanContent = currentPlanContent;
                        }

                        // Capture any additional feedback for implementation
                        userFeedback = approvalResult.feedback;

                        // Emit approval event
                        this.callbacks.emitAutoModeEvent('plan_approved', {
                          featureId,
                          projectPath,
                          branchName,
                          hasEdits: !!approvalResult.editedPlan,
                          planVersion,
                        });
                      } else {
                        // User rejected - check if they provided feedback for revision
                        const hasFeedback =
                          approvalResult.feedback && approvalResult.feedback.trim().length > 0;
                        const hasEdits =
                          approvalResult.editedPlan && approvalResult.editedPlan.trim().length > 0;

                        if (!hasFeedback && !hasEdits) {
                          // No feedback or edits = explicit cancel
                          logger.info(
                            `Plan rejected without feedback for feature ${featureId}, cancelling`
                          );
                          throw new Error('Plan cancelled by user');
                        }

                        // User wants revisions - regenerate the plan
                        logger.info(
                          `Plan v${planVersion} rejected with feedback for feature ${featureId}, regenerating...`
                        );
                        planVersion++;

                        // Emit revision event
                        this.callbacks.emitAutoModeEvent('plan_revision_requested', {
                          featureId,
                          projectPath,
                          branchName,
                          feedback: approvalResult.feedback,
                          hasEdits: !!hasEdits,
                          planVersion,
                        });

                        // Build revision prompt
                        let revisionPrompt = `The user has requested revisions to the plan/specification.

## Previous Plan (v${planVersion - 1})
${hasEdits ? approvalResult.editedPlan : currentPlanContent}

## User Feedback
${approvalResult.feedback || 'Please revise the plan based on the edits above.'}

## Instructions
Please regenerate the specification incorporating the user's feedback.
Keep the same format with the \`\`\`tasks block for task definitions.
After generating the revised spec, output:
"[SPEC_GENERATED] Please review the revised specification above."
`;

                        // Update status to regenerating
                        await this.callbacks.updateFeaturePlanSpec(projectPath, featureId, {
                          status: 'generating',
                          version: planVersion,
                        });

                        // Make revision call
                        const revisionStream = provider.executeQuery({
                          prompt: revisionPrompt,
                          model: bareModel,
                          maxTurns: maxTurns || 100,
                          cwd: workDir,
                          allowedTools: allowedTools,
                          abortController,
                          mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
                          credentials, // Pass credentials for resolving 'credentials' apiKeySource
                          claudeCompatibleProvider, // Pass provider for alternative endpoint configuration
                        });

                        let revisionText = '';
                        for await (const msg of revisionStream) {
                          if (msg.type === 'assistant' && msg.message?.content) {
                            for (const block of msg.message.content) {
                              if (block.type === 'text') {
                                revisionText += block.text || '';
                                this.callbacks.emitAutoModeEvent('auto_mode_progress', {
                                  featureId,
                                  content: block.text,
                                });
                              }
                            }
                          } else if (msg.type === 'error') {
                            throw new Error(msg.error || 'Error during plan revision');
                          } else if (msg.type === 'result' && msg.subtype === 'success') {
                            revisionText += msg.result || '';
                          }
                        }

                        // Extract new plan content
                        const markerIndex = revisionText.indexOf('[SPEC_GENERATED]');
                        if (markerIndex > 0) {
                          currentPlanContent = revisionText.substring(0, markerIndex).trim();
                        } else {
                          currentPlanContent = revisionText.trim();
                        }

                        // Re-parse tasks from revised plan
                        const revisedTasks = parseTasksFromSpec(currentPlanContent);
                        logger.info(`Revised plan has ${revisedTasks.length} tasks`);

                        // Update planSpec with revised content
                        await this.callbacks.updateFeaturePlanSpec(projectPath, featureId, {
                          status: 'generated',
                          content: currentPlanContent,
                          version: planVersion,
                          tasks: revisedTasks,
                          tasksTotal: revisedTasks.length,
                          tasksCompleted: 0,
                        });

                        // Update parsedTasks for implementation
                        parsedTasks = revisedTasks;

                        responseText += revisionText;
                      }
                    } catch (error) {
                      if ((error as Error).message.includes('cancelled')) {
                        throw error;
                      }
                      throw new Error(`Plan approval failed: ${(error as Error).message}`);
                    }
                  }
                } else {
                  // Auto-approve: requirePlanApproval is false, just continue without pausing
                  logger.info(
                    `Spec generated for feature ${featureId}, auto-approving (requirePlanApproval=false)`
                  );

                  // Emit info event for frontend
                  this.callbacks.emitAutoModeEvent('plan_auto_approved', {
                    featureId,
                    projectPath,
                    branchName,
                    planContent,
                    planningMode,
                  });

                  approvedPlanContent = planContent;
                }

                // CRITICAL: After approval, we need to make a second call to continue implementation
                // The agent is waiting for "approved" - we need to send it and continue
                logger.info(
                  `Making continuation call after plan approval for feature ${featureId}`
                );

                // Update planSpec status to approved (handles both manual and auto-approval paths)
                await this.callbacks.updateFeaturePlanSpec(projectPath, featureId, {
                  status: 'approved',
                  approvedAt: new Date().toISOString(),
                  reviewedByUser: requiresApproval,
                });

                // ========================================
                // MULTI-AGENT TASK EXECUTION
                // Each task gets its own focused agent call
                // ========================================

                if (parsedTasks.length > 0) {
                  logger.info(
                    `Starting multi-agent execution: ${parsedTasks.length} tasks for feature ${featureId}`
                  );

                  // Get customized prompts for task execution
                  const taskPrompts = await getPromptCustomization(
                    this.settingsService,
                    '[AutoMode]'
                  );

                  // Execute each task with a separate agent
                  for (let taskIndex = 0; taskIndex < parsedTasks.length; taskIndex++) {
                    const task = parsedTasks[taskIndex];

                    // Check for abort
                    if (abortController.signal.aborted) {
                      throw new Error('Feature execution aborted');
                    }

                    // Emit task started
                    logger.info(`Starting task ${task.id}: ${task.description}`);
                    this.callbacks.emitAutoModeEvent('auto_mode_task_started', {
                      featureId,
                      projectPath,
                      branchName,
                      taskId: task.id,
                      taskDescription: task.description,
                      taskIndex,
                      tasksTotal: parsedTasks.length,
                    });

                    // Update planSpec with current task
                    await this.callbacks.updateFeaturePlanSpec(projectPath, featureId, {
                      currentTaskId: task.id,
                    });

                    // Build focused prompt for this specific task
                    const taskPrompt = this.buildTaskPrompt(
                      task,
                      parsedTasks,
                      taskIndex,
                      approvedPlanContent,
                      taskPrompts.taskExecution.taskPromptTemplate,
                      userFeedback
                    );

                    // Execute task with dedicated agent
                    const taskStream = provider.executeQuery({
                      prompt: taskPrompt,
                      model: bareModel,
                      maxTurns: Math.min(maxTurns || 100, 50), // Limit turns per task
                      cwd: workDir,
                      allowedTools: allowedTools,
                      abortController,
                      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
                      credentials, // Pass credentials for resolving 'credentials' apiKeySource
                      claudeCompatibleProvider, // Pass provider for alternative endpoint configuration
                    });

                    // Process task stream
                    for await (const msg of taskStream) {
                      if (msg.type === 'assistant' && msg.message?.content) {
                        for (const block of msg.message.content) {
                          if (block.type === 'text') {
                            responseText += block.text || '';
                            this.callbacks.emitAutoModeEvent('auto_mode_progress', {
                              featureId,
                              branchName,
                              content: block.text,
                            });
                          } else if (block.type === 'tool_use') {
                            this.callbacks.emitAutoModeEvent('auto_mode_tool', {
                              featureId,
                              branchName,
                              tool: block.name,
                              input: block.input,
                            });
                          }
                        }
                      } else if (msg.type === 'error') {
                        throw new Error(msg.error || `Error during task ${task.id}`);
                      } else if (msg.type === 'result' && msg.subtype === 'success') {
                        responseText += msg.result || '';
                      }
                    }

                    // Emit task completed
                    logger.info(`Task ${task.id} completed for feature ${featureId}`);
                    this.callbacks.emitAutoModeEvent('auto_mode_task_complete', {
                      featureId,
                      projectPath,
                      branchName,
                      taskId: task.id,
                      tasksCompleted: taskIndex + 1,
                      tasksTotal: parsedTasks.length,
                    });

                    // Update planSpec with progress
                    await this.callbacks.updateFeaturePlanSpec(projectPath, featureId, {
                      tasksCompleted: taskIndex + 1,
                    });

                    // Check for phase completion (group tasks by phase)
                    if (task.phase) {
                      const nextTask = parsedTasks[taskIndex + 1];
                      if (!nextTask || nextTask.phase !== task.phase) {
                        // Phase changed, emit phase complete
                        const phaseMatch = task.phase.match(/Phase\s*(\d+)/i);
                        if (phaseMatch) {
                          this.callbacks.emitAutoModeEvent('auto_mode_phase_complete', {
                            featureId,
                            projectPath,
                            branchName,
                            phaseNumber: parseInt(phaseMatch[1], 10),
                          });
                        }
                      }
                    }
                  }

                  logger.info(`All ${parsedTasks.length} tasks completed for feature ${featureId}`);
                } else {
                  // No parsed tasks - fall back to single-agent execution
                  logger.info(
                    `No parsed tasks, using single-agent execution for feature ${featureId}`
                  );

                  // Get customized prompts for continuation
                  const taskPrompts = await getPromptCustomization(
                    this.settingsService,
                    '[AutoMode]'
                  );
                  let continuationPrompt =
                    taskPrompts.taskExecution.continuationAfterApprovalTemplate;
                  continuationPrompt = continuationPrompt.replace(
                    /\{\{userFeedback\}\}/g,
                    userFeedback || ''
                  );
                  continuationPrompt = continuationPrompt.replace(
                    /\{\{approvedPlan\}\}/g,
                    approvedPlanContent
                  );

                  const continuationStream = provider.executeQuery({
                    prompt: continuationPrompt,
                    model: bareModel,
                    maxTurns: maxTurns,
                    cwd: workDir,
                    allowedTools: allowedTools,
                    abortController,
                    mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
                    credentials, // Pass credentials for resolving 'credentials' apiKeySource
                    claudeCompatibleProvider, // Pass provider for alternative endpoint configuration
                  });

                  for await (const msg of continuationStream) {
                    if (msg.type === 'assistant' && msg.message?.content) {
                      for (const block of msg.message.content) {
                        if (block.type === 'text') {
                          responseText += block.text || '';
                          this.callbacks.emitAutoModeEvent('auto_mode_progress', {
                            featureId,
                            branchName,
                            content: block.text,
                          });
                        } else if (block.type === 'tool_use') {
                          this.callbacks.emitAutoModeEvent('auto_mode_tool', {
                            featureId,
                            branchName,
                            tool: block.name,
                            input: block.input,
                          });
                        }
                      }
                    } else if (msg.type === 'error') {
                      throw new Error(msg.error || 'Unknown error during implementation');
                    } else if (msg.type === 'result' && msg.subtype === 'success') {
                      responseText += msg.result || '';
                    }
                  }
                }

                logger.info(`Implementation completed for feature ${featureId}`);
                // Exit the original stream loop since continuation is done
                break streamLoop;
              }

              // Only emit progress for non-marker text (marker was already handled above)
              if (!specDetected) {
                logger.info(
                  `Emitting progress event for ${featureId}, content length: ${block.text?.length || 0}`
                );
                this.callbacks.emitAutoModeEvent('auto_mode_progress', {
                  featureId,
                  branchName,
                  content: block.text,
                });
              }
            } else if (block.type === 'tool_use') {
              // Feed tool use to stream observer for loop detection (if enabled)
              if (streamObserver) {
                streamObserver.onToolUse(block.name || 'unknown', block.input);

                // Check if observer detected a loop or stall
                const abortCheck = streamObserver.shouldAbort();
                if (abortCheck.abort) {
                  logger.warn(
                    `Stream observer triggered abort for ${featureId}: ${abortCheck.reason}`
                  );
                  loopDetected = true;

                  // Emit loop detection event
                  this.events.emit(
                    'pipeline:loop-detected' as import('@protolabs-ai/types').EventType,
                    {
                      featureId,
                      loopSignature: streamObserver.getLoopSignature() || 'unknown',
                      actionTaken: 'abort_and_retry',
                    }
                  );

                  abortController.abort();
                  break streamLoop;
                }
              }

              // Emit event for real-time UI
              this.callbacks.emitAutoModeEvent('auto_mode_tool', {
                featureId,
                branchName,
                tool: block.name,
                input: block.input,
              });

              // Also add to file output for persistence
              if (responseText.length > 0 && !responseText.endsWith('\n')) {
                responseText += '\n';
              }
              responseText += `\n🔧 Tool: ${block.name}\n`;
              if (block.input) {
                responseText += `Input: ${JSON.stringify(block.input, null, 2)}\n`;
              }
              scheduleWrite();
            }
          }
        } else if (msg.type === 'error') {
          // Handle error messages
          throw new Error(msg.error || 'Unknown error');
        } else if (msg.type === 'result' && msg.subtype === 'success') {
          // Don't replace responseText - the accumulated content is the full history
          // The msg.result is just a summary which would lose all tool use details
          // Just ensure final write happens
          scheduleWrite();

          // Capture cost and session_id from SDK result
          const resultMsg = msg as unknown as { total_cost_usd?: number; session_id?: string };
          if (typeof resultMsg.total_cost_usd === 'number' && resultMsg.total_cost_usd > 0) {
            try {
              const currentFeature = await this.featureLoader.get(projectPath, featureId);
              const previousCost: number = currentFeature?.costUsd ?? 0;
              await this.featureLoader.update(projectPath, featureId, {
                costUsd: previousCost + resultMsg.total_cost_usd,
              });
              logger.info(
                `Feature ${featureId} cost: $${resultMsg.total_cost_usd.toFixed(4)} (total: $${(previousCost + resultMsg.total_cost_usd).toFixed(4)})`
              );
            } catch (costError) {
              logger.warn(`Failed to store cost for feature ${featureId}:`, costError);
            }
          }
          // Store session_id for potential resume
          if (resultMsg.session_id) {
            try {
              await this.featureLoader.update(projectPath, featureId, {
                lastSessionId: resultMsg.session_id,
              });
            } catch {
              // Non-critical
            }
          }
        } else if (msg.type === 'result' && msg.subtype === 'error_max_turns') {
          // Agent ran out of turns - capture session_id for resume, then throw for retry
          scheduleWrite();
          const errorResult = msg as unknown as {
            session_id?: string;
            total_cost_usd?: number;
          };
          if (errorResult.session_id || errorResult.total_cost_usd) {
            try {
              const updates: Record<string, unknown> = {};
              if (errorResult.session_id) {
                updates.lastSessionId = errorResult.session_id;
              }
              if (
                typeof errorResult.total_cost_usd === 'number' &&
                errorResult.total_cost_usd > 0
              ) {
                const currentFeature = await this.featureLoader.get(projectPath, featureId);
                const previousCost: number = currentFeature?.costUsd ?? 0;
                updates.costUsd = previousCost + errorResult.total_cost_usd;
              }
              await this.featureLoader.update(projectPath, featureId, updates);
            } catch {
              // Non-critical
            }
          }
          throw new Error(
            `error_max_turns: Agent exhausted max turns limit. The feature may need more turns to complete.`
          );
        }
      }

      // Final write - ensure all accumulated content is saved (on success path)
      await writeToFile();

      // If loop was detected, throw a recognizable error for retry with recovery context
      if (loopDetected) {
        const loopSig = streamObserver?.getLoopSignature() || 'unknown';
        throw new LoopDetectedError(
          `Agent loop detected (${loopSig}). Aborting for retry with recovery guidance.`,
          loopSig
        );
      }

      // Flush remaining raw output (only if enabled, on success path)
      if (enableRawOutput && rawOutputLines.length > 0) {
        try {
          await secureFs.mkdir(path.dirname(rawOutputPath), { recursive: true });
          await secureFs.appendFile(rawOutputPath, rawOutputLines.join('\n') + '\n');
        } catch (error) {
          logger.error(`Failed to write final raw output for ${featureId}:`, error);
        }
      }
    } finally {
      clearInterval(streamHeartbeat);
      clearInterval(memoryHeartbeat);
      // ALWAYS clear pending timeouts to prevent memory leaks
      // This runs on success, error, or abort
      if (writeTimeout) {
        clearTimeout(writeTimeout);
        writeTimeout = null;
      }
      if (rawWriteTimeout) {
        clearTimeout(rawWriteTimeout);
        rawWriteTimeout = null;
      }

      // Save Langfuse trace ID to feature for observability linking
      const providerWithTrace = provider as unknown as { getLastTraceId?: () => string | null };
      if (typeof providerWithTrace.getLastTraceId === 'function') {
        const lastTraceId = providerWithTrace.getLastTraceId();
        if (lastTraceId) {
          try {
            await this.featureLoader.update(projectPath, featureId, { lastTraceId });
          } catch (traceErr) {
            logger.warn(`Failed to save traceId for ${featureId}:`, traceErr);
          }
        }
      }
    }
  }

  /**
   * Build the main feature implementation prompt.
   */
  buildFeaturePrompt(
    feature: Feature,
    taskExecutionPrompts: {
      implementationInstructions: string;
      playwrightVerificationInstructions: string;
    }
  ): string {
    const title = this.extractTitleFromDescription(feature.description);

    let prompt = `## Feature Implementation Task

**Feature ID:** ${feature.id}
**Title:** ${title}
**Description:** ${feature.description}
`;

    if (feature.spec) {
      prompt += `
**Specification:**
${feature.spec}
`;
    }

    // Add images note (like old implementation)
    if (feature.imagePaths && feature.imagePaths.length > 0) {
      const imagesList = feature.imagePaths
        .map((img, idx) => {
          const imgPath = typeof img === 'string' ? img : img.path;
          const filename =
            typeof img === 'string'
              ? imgPath.split('/').pop()
              : img.filename || imgPath.split('/').pop();
          const mimeType = typeof img === 'string' ? 'image/*' : img.mimeType || 'image/*';
          return `   ${idx + 1}. ${filename} (${mimeType})\n      Path: ${imgPath}`;
        })
        .join('\n');

      prompt += `
**Context Images Attached:**
The user has attached ${feature.imagePaths.length} image(s) for context. These images are provided both visually (in the initial message) and as files you can read:

${imagesList}

You can use the Read tool to view these images at any time during implementation. Review them carefully before implementing.
`;
    }

    // Add verification instructions based on testing mode
    if (feature.skipTests) {
      // Manual verification - just implement the feature
      prompt += `\n${taskExecutionPrompts.implementationInstructions}`;
    } else {
      // Automated testing - implement and verify with Playwright
      prompt += `\n${taskExecutionPrompts.implementationInstructions}\n\n${taskExecutionPrompts.playwrightVerificationInstructions}`;
    }

    return prompt;
  }

  /**
   * Extract a title from feature description (first line or truncated).
   */
  extractTitleFromDescription(description: string): string {
    if (!description || !description.trim()) {
      return 'Untitled Feature';
    }

    // Get first line, or first 60 characters if no newline
    const firstLine = description.split('\n')[0].trim();
    if (firstLine.length <= 60) {
      return firstLine;
    }

    // Truncate to 60 characters and add ellipsis
    return firstLine.substring(0, 57) + '...';
  }

  /**
   * Get the planning prompt prefix based on feature's planning mode.
   */
  async getPlanningPromptPrefix(feature: Feature): Promise<string> {
    const mode = feature.planningMode || 'skip';

    if (mode === 'skip') {
      return ''; // No planning phase
    }

    // Load prompts from settings (no caching - allows hot reload of custom prompts)
    const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');
    const planningPrompts: Record<string, string> = {
      lite: prompts.autoMode.planningLite,
      lite_with_approval: prompts.autoMode.planningLiteWithApproval,
      spec: prompts.autoMode.planningSpec,
      full: prompts.autoMode.planningFull,
    };

    // For lite mode, use the approval variant if requirePlanApproval is true
    let promptKey: string = mode;
    if (mode === 'lite' && feature.requirePlanApproval === true) {
      promptKey = 'lite_with_approval';
    }

    const planningPrompt = planningPrompts[promptKey];
    if (!planningPrompt) {
      return '';
    }

    return planningPrompt + '\n\n---\n\n## Feature Request\n\n';
  }

  /**
   * Build a focused prompt for a single task in multi-agent execution.
   */
  private buildTaskPrompt(
    task: ParsedTask,
    allTasks: ParsedTask[],
    taskIndex: number,
    planContent: string,
    taskPromptTemplate: string,
    userFeedback?: string
  ): string {
    const completedTasks = allTasks.slice(0, taskIndex);
    const remainingTasks = allTasks.slice(taskIndex + 1);

    // Build completed tasks string
    const completedTasksStr =
      completedTasks.length > 0
        ? `### Already Completed (${completedTasks.length} tasks)\n${completedTasks.map((t) => `- [x] ${t.id}: ${t.description}`).join('\n')}\n`
        : '';

    // Build remaining tasks string
    const remainingTasksStr =
      remainingTasks.length > 0
        ? `### Coming Up Next (${remainingTasks.length} tasks remaining)\n${remainingTasks
            .slice(0, 3)
            .map((t) => `- [ ] ${t.id}: ${t.description}`)
            .join(
              '\n'
            )}${remainingTasks.length > 3 ? `\n... and ${remainingTasks.length - 3} more tasks` : ''}\n`
        : '';

    // Build user feedback string
    const userFeedbackStr = userFeedback ? `### User Feedback\n${userFeedback}\n` : '';

    // Use centralized template with variable substitution
    let prompt = taskPromptTemplate;
    prompt = prompt.replace(/\{\{taskId\}\}/g, task.id);
    prompt = prompt.replace(/\{\{taskDescription\}\}/g, task.description);
    prompt = prompt.replace(/\{\{taskFilePath\}\}/g, task.filePath || '');
    prompt = prompt.replace(/\{\{taskPhase\}\}/g, task.phase || '');
    prompt = prompt.replace(/\{\{completedTasks\}\}/g, completedTasksStr);
    prompt = prompt.replace(/\{\{remainingTasks\}\}/g, remainingTasksStr);
    prompt = prompt.replace(/\{\{userFeedback\}\}/g, userFeedbackStr);
    prompt = prompt.replace(/\{\{planContent\}\}/g, planContent);

    return prompt;
  }

  /**
   * Extract summary text from agent output using common patterns.
   * Mirrors the client-side extractSummary() logic in log-parser.ts.
   */
  private extractSummaryFromOutput(output: string): string | null {
    if (!output?.trim()) return null;

    // Try <summary> tags first (preferred format from agent system prompt)
    const summaryTagMatch = output.match(/<summary>([\s\S]*?)<\/summary>/);
    if (summaryTagMatch) return summaryTagMatch[1].trim();

    // Try markdown ## Summary section
    const summaryHeaderMatch = output.match(/^##\s+Summary\s*\n([\s\S]*?)(?=\n##\s+|$)/m);
    if (summaryHeaderMatch) return summaryHeaderMatch[1].trim();

    // Try other summary headers (Feature, Changes, Implementation)
    const otherHeaderMatch = output.match(
      /^##\s+(Feature|Changes|Implementation)\s*\n([\s\S]*?)(?=\n##\s+|$)/m
    );
    if (otherHeaderMatch) return `## ${otherHeaderMatch[1]}\n${otherHeaderMatch[2].trim()}`;

    // Try "All tasks completed..." intro lines
    const introMatch = output.match(/(^|\n)(All tasks completed[\s\S]*?)(?=\n🔧|\n📋|\n⚡|\n❌|$)/);
    if (introMatch) return introMatch[2].trim();

    // Try "I've/I have successfully completed..." intro lines
    const completionMatch = output.match(
      /(^|\n)((I've|I have) (successfully |now )?(completed|finished|implemented)[\s\S]*?)(?=\n🔧|\n📋|\n⚡|\n❌|$)/
    );
    if (completionMatch) return completionMatch[2].trim();

    return null;
  }

  /**
   * Extract and record learnings from a completed feature.
   * Uses a quick Claude call to identify important decisions and patterns.
   */
  private async recordLearningsFromFeature(
    projectPath: string,
    feature: Feature,
    agentOutput: string
  ): Promise<void> {
    if (!agentOutput || agentOutput.length < 100) {
      // Not enough output to extract learnings from
      logger.debug(
        `Skipping learning extraction - output too short (${agentOutput?.length || 0} chars)`
      );
      return;
    }

    logger.info(
      `Extracting learnings from feature "${feature.title}" (${agentOutput.length} chars)`
    );

    // Limit output to avoid token limits
    const truncatedOutput = agentOutput.length > 10000 ? agentOutput.slice(-10000) : agentOutput;

    // Get customized prompts from settings
    const prompts = await getPromptCustomization(this.settingsService, '[AutoMode]');

    // Build user prompt using centralized template with variable substitution
    let userPrompt = prompts.taskExecution.learningExtractionUserPromptTemplate;
    userPrompt = userPrompt.replace(/\{\{featureTitle\}\}/g, feature.title || '');
    userPrompt = userPrompt.replace(/\{\{implementationLog\}\}/g, truncatedOutput);

    try {
      // Get model from phase settings
      const settings = await this.settingsService?.getGlobalSettings();
      const phaseModelEntry =
        settings?.phaseModels?.memoryExtractionModel || DEFAULT_PHASE_MODELS.memoryExtractionModel;
      const { model } = resolvePhaseModel(phaseModelEntry);
      const hasClaudeKey = Boolean(process.env.ANTHROPIC_API_KEY);
      let resolvedModel = model;

      if (isClaudeModel(model) && !hasClaudeKey) {
        const fallbackModel = feature.model
          ? resolveModelString(feature.model, DEFAULT_MODELS.autoMode)
          : null;
        if (fallbackModel && !isClaudeModel(fallbackModel)) {
          logger.debug(
            `Claude not configured for memory extraction; using feature model "${fallbackModel}".`
          );
          resolvedModel = fallbackModel;
        } else {
          logger.debug(
            'Claude not configured for memory extraction; skipping learning extraction.'
          );
          return;
        }
      }

      const result = await simpleQuery({
        prompt: userPrompt,
        model: resolvedModel,
        cwd: projectPath,
        maxTurns: 1,
        allowedTools: [],
        systemPrompt: prompts.taskExecution.learningExtractionSystemPrompt,
      });

      const responseText = result.text;

      logger.debug(`Learning extraction response: ${responseText.length} chars`);
      logger.debug(`Response preview: ${responseText.substring(0, 300)}`);

      // Parse the response - handle JSON in markdown code blocks or raw
      let jsonStr: string | null = null;

      // First try to find JSON in markdown code blocks
      const codeBlockMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        logger.debug('Found JSON in code block');
        jsonStr = codeBlockMatch[1];
      } else {
        // Fall back to finding balanced braces containing "learnings"
        // Use a more precise approach: find the opening brace before "learnings"
        const learningsIndex = responseText.indexOf('"learnings"');
        if (learningsIndex !== -1) {
          // Find the opening brace before "learnings"
          const braceStart = responseText.lastIndexOf('{', learningsIndex);
          if (braceStart !== -1) {
            // Find matching closing brace
            let braceCount = 0;
            let braceEnd = -1;
            for (let i = braceStart; i < responseText.length; i++) {
              if (responseText[i] === '{') braceCount++;
              if (responseText[i] === '}') braceCount--;
              if (braceCount === 0) {
                braceEnd = i;
                break;
              }
            }
            if (braceEnd !== -1) {
              jsonStr = responseText.substring(braceStart, braceEnd + 1);
            }
          }
        }
      }

      if (!jsonStr) {
        logger.debug('Could not extract JSON from response');
        return;
      }

      logger.debug(`Extracted JSON: ${jsonStr.substring(0, 200)}`);

      let parsed: { learnings?: unknown[] };
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        logger.warn('Failed to parse learnings JSON:', jsonStr.substring(0, 200));
        return;
      }

      if (!parsed.learnings || !Array.isArray(parsed.learnings)) {
        logger.debug('No learnings array in parsed response');
        return;
      }

      logger.debug(`Found ${parsed.learnings.length} potential learnings`);

      // Valid learning types
      const validTypes = new Set(['decision', 'learning', 'pattern', 'gotcha']);

      // Create deduplication checker if knowledge store is available
      const dedupThreshold = settings?.knowledgeDedupThreshold ?? -0.5;
      const dedupChecker: DedupChecker | undefined = this.knowledgeStoreService
        ? async (
            projPath: string,
            learning: import('@protolabs-ai/utils').LearningEntry,
            targetFile: string
          ) => {
            if (!this.knowledgeStoreService) return false;

            try {
              // Search for similar chunks in the target memory file
              const similarChunks = this.knowledgeStoreService.findSimilarChunks(
                projPath,
                learning.content,
                `.automaker/memory/${targetFile}`,
                1
              );

              if (similarChunks.length > 0 && similarChunks[0].score < dedupThreshold) {
                logger.debug(
                  `Duplicate detected: score=${similarChunks[0].score} < threshold=${dedupThreshold}`
                );
                return true;
              }

              return false;
            } catch (error) {
              logger.warn('Error checking for duplicates:', error);
              return false; // On error, allow the learning to be written
            }
          }
        : undefined;

      // Create index rebuilder if knowledge store is available
      const indexRebuilder: IndexRebuilder | undefined = this.knowledgeStoreService
        ? async (projPath: string) => {
            if (!this.knowledgeStoreService) return;

            try {
              logger.debug('Rebuilding knowledge store index after learning append');
              this.knowledgeStoreService.rebuildIndex(projPath);
            } catch (error) {
              logger.warn('Error rebuilding knowledge store index:', error);
            }
          }
        : undefined;

      // Track unique categories for compaction check
      const updatedCategories = new Set<string>();

      // Record each learning
      for (const item of parsed.learnings) {
        // Validate required fields with proper type narrowing
        if (!item || typeof item !== 'object') continue;

        const learning = item as Record<string, unknown>;
        if (
          !learning.category ||
          typeof learning.category !== 'string' ||
          !learning.content ||
          typeof learning.content !== 'string' ||
          !learning.content.trim()
        ) {
          continue;
        }

        // Validate and normalize type
        const typeStr = typeof learning.type === 'string' ? learning.type : 'learning';
        const learningType = validTypes.has(typeStr)
          ? (typeStr as 'decision' | 'learning' | 'pattern' | 'gotcha')
          : 'learning';

        logger.debug(`Appending learning: category=${learning.category}, type=${learningType}`);
        await appendLearning(
          projectPath,
          {
            category: learning.category,
            type: learningType,
            content: learning.content.trim(),
            context: typeof learning.context === 'string' ? learning.context : undefined,
            why: typeof learning.why === 'string' ? learning.why : undefined,
            rejected: typeof learning.rejected === 'string' ? learning.rejected : undefined,
            tradeoffs: typeof learning.tradeoffs === 'string' ? learning.tradeoffs : undefined,
            breaking: typeof learning.breaking === 'string' ? learning.breaking : undefined,
          },
          secureFs as Parameters<typeof appendLearning>[2],
          dedupChecker,
          indexRebuilder
        );

        // Track category for compaction check
        const sanitizedCategory = learning.category
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');
        updatedCategories.add(`${sanitizedCategory || 'general'}.md`);
      }

      // Check each updated category for compaction
      if (this.knowledgeStoreService && updatedCategories.size > 0) {
        for (const categoryFile of updatedCategories) {
          try {
            await this.knowledgeStoreService.compactCategory(projectPath, categoryFile);
          } catch (error) {
            logger.warn(`Failed to compact category ${categoryFile}:`, error);
          }
        }
      }

      const validLearnings = parsed.learnings.filter(
        (l) => l && typeof l === 'object' && (l as Record<string, unknown>).content
      );
      if (validLearnings.length > 0) {
        logger.info(`Recorded ${parsed.learnings.length} learning(s) from feature ${feature.id}`);
      }
    } catch (error) {
      logger.warn(`Failed to extract learnings from feature ${feature.id}:`, error);
    }
  }

  /**
   * Check current heap usage and return percentage.
   */
  getHeapUsagePercent(): number {
    const memoryUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    // Use heap_size_limit (actual max from --max-old-space-size) instead of heapTotal
    // (current allocation). V8 grows heapTotal conservatively, so heapUsed/heapTotal
    // is naturally 70-90% even for idle processes — causing false positives that
    // silently block all agent starts.
    return memoryUsage.heapUsed / heapStats.heap_size_limit;
  }

  /**
   * Simple helper for emitting auto_mode_progress events via callbacks.
   */
  private streamProgress(
    featureId: string,
    branchName: string | null,
    content: string | undefined
  ): void {
    this.callbacks.emitAutoModeEvent('auto_mode_progress', {
      featureId,
      branchName,
      content,
    });
  }
}
