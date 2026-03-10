/**
 * Lead Engineer — Execute State Processor
 *
 * Runs the feature agent in a worktree and waits for completion.
 * On failure, retries with accumulated context. On success, advances to REVIEW.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { createLogger } from '@protolabsai/utils';
import { getAutomakerDir, getFeatureDir } from '@protolabsai/platform';
import type { EventType, PipelinePhase } from '@protolabsai/types';
import type {
  ProcessorServiceContext,
  StateContext,
  StateProcessor,
  StateTransitionResult,
} from './lead-engineer-types.js';
import { EXECUTE_TIMEOUT_MS, MAX_AGENT_RETRIES, MAX_INFRA_RETRIES } from './lead-engineer-types.js';
import type { VerifiedTrajectory } from '@protolabsai/types';

const execAsync = promisify(exec);
const logger = createLogger('LeadEngineerService');

/**
 * EXECUTE State: Agent runs in worktree. Monitor. On failure → retry with context or ESCALATE.
 *
 * Calls autoModeService.executeFeature() directly (bypasses the auto-loop's
 * leadEngineerService.process() delegation, avoiding infinite recursion).
 * Waits for completion via event listener with a 30-minute timeout.
 */
export class ExecuteProcessor implements StateProcessor {
  private readonly MAX_BUDGET_USD = 10.0;

  constructor(private serviceContext: ProcessorServiceContext) {}

  /**
   * Resolve the effective max agent retries for this project.
   * Reads from project workflow settings when the settings service is available,
   * falling back to the module-level constant so behaviour is unchanged for
   * projects that haven't customised this value.
   */
  private async resolveMaxAgentRetries(projectPath: string): Promise<number> {
    try {
      if (this.serviceContext.settingsService) {
        const settings = await this.serviceContext.settingsService.getProjectSettings(projectPath);
        const configured = settings.workflow?.pipeline?.maxAgentRetries;
        if (typeof configured === 'number' && configured > 0) {
          return configured;
        }
      }
    } catch {
      /* non-fatal — fall back to constant */
    }
    return MAX_AGENT_RETRIES;
  }

  /**
   * Resolve the effective cost cap (maxCostUsdPerFeature) for this project.
   * Returns undefined when not configured (cap is off).
   */
  private async resolveMaxCostUsdPerFeature(projectPath: string): Promise<number | undefined> {
    try {
      if (this.serviceContext.settingsService) {
        const settings = await this.serviceContext.settingsService.getProjectSettings(projectPath);
        const configured = (
          settings.workflow as typeof settings.workflow & { maxCostUsdPerFeature?: number }
        )?.maxCostUsdPerFeature;
        if (typeof configured === 'number' && configured > 0) {
          return configured;
        }
      }
    } catch {
      /* non-fatal — cap is off */
    }
    return undefined;
  }

  /**
   * Resolve the effective runtime cap (maxRuntimeMinutesPerFeature) for this project.
   * Returns the configured value, defaulting to 60 minutes.
   */
  private async resolveMaxRuntimeMinutesPerFeature(projectPath: string): Promise<number> {
    const DEFAULT_RUNTIME_MINUTES = 60;
    try {
      if (this.serviceContext.settingsService) {
        const settings = await this.serviceContext.settingsService.getProjectSettings(projectPath);
        const configured = (
          settings.workflow as typeof settings.workflow & { maxRuntimeMinutesPerFeature?: number }
        )?.maxRuntimeMinutesPerFeature;
        if (typeof configured === 'number' && configured > 0) {
          return configured;
        }
      }
    } catch {
      /* non-fatal — fall back to default */
    }
    return DEFAULT_RUNTIME_MINUTES;
  }

  /**
   * Resolve the effective max infra retries for this project.
   * Reads from project workflow settings when the settings service is available,
   * falling back to the module-level constant so behaviour is unchanged for
   * projects that haven't customised this value.
   */
  private async resolveMaxInfraRetries(projectPath: string): Promise<number> {
    try {
      if (this.serviceContext.settingsService) {
        const settings = await this.serviceContext.settingsService.getProjectSettings(projectPath);
        const configured = settings.workflow?.pipeline?.maxInfraRetries;
        if (typeof configured === 'number' && configured > 0) {
          return configured;
        }
      }
    } catch {
      /* non-fatal — fall back to constant */
    }
    return MAX_INFRA_RETRIES;
  }

  async enter(ctx: StateContext): Promise<void> {
    logger.info(`[EXECUTE] Starting execution for feature: ${ctx.feature.id}`, {
      retryCount: ctx.retryCount,
      persona: ctx.assignedPersona,
    });
    this.serviceContext.events.emit('pipeline:phase-entered' as EventType, {
      featureId: ctx.feature.id,
      projectPath: ctx.projectPath,
      phase: 'EXECUTE' as PipelinePhase,
      branch: 'ops' as const,
      timestamp: new Date().toISOString(),
    });
  }

  async process(ctx: StateContext): Promise<StateTransitionResult> {
    // Check budget
    const totalCost = ctx.feature.costUsd || 0;
    if (totalCost > this.MAX_BUDGET_USD) {
      ctx.escalationReason = `Budget exceeded: $${totalCost.toFixed(2)}`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: true,
        reason: ctx.escalationReason,
      };
    }

    // Check kill conditions before proceeding with execution
    const killConditions = ctx.feature.killConditions;
    if (killConditions && killConditions.length > 0) {
      // Check if any cost-based kill condition is triggered
      const costKill = killConditions.find((condition: string) => {
        const lower = condition.toLowerCase();
        if (!lower.includes('cost') && !lower.includes('usd') && !lower.includes('$')) {
          return false;
        }
        // Extract a numeric threshold from the condition string (e.g., "$5", "5 USD", "5.00")
        const match = condition.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:usd)?/i);
        if (match) {
          const threshold = parseFloat(match[1]);
          return !isNaN(threshold) && totalCost >= threshold;
        }
        return false;
      });

      if (costKill) {
        ctx.escalationReason = `Kill condition triggered: ${costKill}`;
        logger.warn('[EXECUTE] Kill condition triggered, escalating', {
          featureId: ctx.feature.id,
          condition: costKill,
          costUsd: totalCost,
        });
        return {
          nextState: 'ESCALATE',
          shouldContinue: true,
          reason: ctx.escalationReason,
        };
      }
    }

    // Check agent retry limit (configurable via workflow settings, falls back to module constant)
    const maxAgentRetries = await this.resolveMaxAgentRetries(ctx.projectPath);
    if (ctx.retryCount >= maxAgentRetries) {
      ctx.escalationReason = `Max agent retries exceeded (${maxAgentRetries})`;
      return {
        nextState: 'ESCALATE',
        shouldContinue: true,
        reason: ctx.escalationReason,
      };
    }

    // Guard: if the feature's branch already has an open PR, skip execution and advance to REVIEW.
    // Prevents the state machine from launching a duplicate agent when the feature was already
    // submitted (e.g., blocked at SPEC_REVIEW gate, then requeued by dep-unblocking).
    if (ctx.feature.branchName) {
      try {
        // Validate branch name to prevent shell injection
        const branchName = ctx.feature.branchName;
        if (!/^[\w./-]+$/.test(branchName)) {
          logger.warn('[EXECUTE] Invalid branch name, skipping PR check:', branchName);
        } else {
          const { stdout: prJson } = await execAsync(
            `gh pr list --head "${branchName}" --state open --json number,headRefName --limit 1`,
            { cwd: ctx.projectPath, timeout: 10000 }
          );
          const prs: { number: number }[] = JSON.parse(prJson || '[]');
          if (prs.length > 0) {
            ctx.prNumber = prs[0].number;
            logger.info(
              `[EXECUTE] Feature ${ctx.feature.id} already has open PR #${ctx.prNumber} — skipping execution, transitioning to REVIEW`
            );
            await this.serviceContext.featureLoader.update(ctx.projectPath, ctx.feature.id, {
              status: 'review',
              prNumber: ctx.prNumber,
            });
            return {
              nextState: 'REVIEW',
              shouldContinue: true,
              reason: `Existing open PR #${ctx.prNumber} found — skipping re-execution`,
            };
          }
        }
      } catch (err) {
        logger.warn('[EXECUTE] Could not check for existing PR (non-fatal):', err);
      }
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

    // Load reflections from any feature using FTS5 semantic search
    try {
      let ftsResults: string[] = [];

      if (this.serviceContext.knowledgeStoreService) {
        // Build search query from feature title and description
        const query = `${ctx.feature.title} ${ctx.feature.description || ''}`.trim();

        // Skip FTS5 search if query is empty (both title and description falsy)
        if (!query) {
          logger.debug('[EXECUTE] Empty query, skipping FTS5 reflection search');
        }

        // Search for relevant reflections and agent outputs across all features
        const results = query
          ? await this.serviceContext.knowledgeStoreService.searchReflections(
              ctx.projectPath,
              query,
              5 // maxResults
            )
          : [];

        ftsResults = results.map((r) => r.chunk.content);
        if (ftsResults.length > 0) {
          ctx.siblingReflections = ftsResults;
          logger.info(`[EXECUTE] Loaded ${ftsResults.length} relevant reflections via FTS5 search`);
        }
      }

      // Fallback to legacy same-epic search if FTS unavailable or returned no results
      if (!this.serviceContext.knowledgeStoreService || ftsResults.length === 0) {
        logger.info('[EXECUTE] Using legacy sibling search (FTS unavailable or empty)');
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
          // Try structured facts.json from trajectory directory first
          let usedFacts = false;
          try {
            const factsPath = path.join(
              getAutomakerDir(ctx.projectPath),
              'trajectory',
              sib.id,
              'facts.json'
            );
            const factsContent = await fs.readFile(factsPath, 'utf-8');
            const parsed = JSON.parse(factsContent) as {
              facts: Array<{ category: string; confidence: number; content: string }>;
            };
            const qualified = (parsed.facts ?? [])
              .filter((f) => typeof f.confidence === 'number' && f.confidence >= 0.7)
              .sort((a, b) => b.confidence - a.confidence)
              .slice(0, 10);
            if (qualified.length > 0) {
              const byCategory = new Map<string, Array<{ confidence: number; content: string }>>();
              for (const fact of qualified) {
                const cat = fact.category || 'general';
                if (!byCategory.has(cat)) byCategory.set(cat, []);
                byCategory.get(cat)!.push({ confidence: fact.confidence, content: fact.content });
              }
              const lines: string[] = [];
              for (const [cat, catFacts] of byCategory) {
                lines.push(`#### ${cat}`);
                for (const { confidence, content } of catFacts) {
                  lines.push(`- [${Math.round(confidence * 100)}%] ${content}`);
                }
              }
              reflections.push(lines.join('\n'));
              usedFacts = true;
            }
          } catch {
            /* no facts.json — fall through to reflection.md */
          }

          if (!usedFacts) {
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
        }
        if (reflections.length > 0) {
          ctx.siblingReflections = reflections;
          logger.info(`[EXECUTE] Loaded ${reflections.length} sibling reflections (legacy)`);
        }
      }
    } catch (err) {
      logger.warn('[EXECUTE] Failed to load sibling reflections:', err);
    }

    // Load milestone facts (project-level knowledge accumulation)
    try {
      if (ctx.feature.projectSlug) {
        const fsPromises = await import('node:fs/promises');
        const milestoneFactsDir = path.join(
          getAutomakerDir(ctx.projectPath),
          'projects',
          ctx.feature.projectSlug,
          'milestone-facts'
        );
        let entries: string[] = [];
        try {
          const dirEntries = await fsPromises.readdir(milestoneFactsDir);
          entries = dirEntries.filter((e) => e.endsWith('.json'));
        } catch {
          // No milestone-facts directory yet — skip
        }
        if (entries.length > 0) {
          const allFacts: Array<{ content: string; category: string; confidence: number }> = [];
          for (const entry of entries) {
            try {
              const raw = await fsPromises.readFile(path.join(milestoneFactsDir, entry), 'utf-8');
              const parsed = JSON.parse(raw) as {
                facts: Array<{ content: string; category: string; confidence: number }>;
              };
              allFacts.push(...(parsed.facts ?? []));
            } catch {
              // Skip malformed files
            }
          }
          if (allFacts.length > 0) {
            // Group by category and format as Project Knowledge section
            const byCategory = new Map<string, Array<{ content: string; confidence: number }>>();
            for (const fact of allFacts) {
              const cat = fact.category || 'general';
              if (!byCategory.has(cat)) byCategory.set(cat, []);
              byCategory.get(cat)!.push({
                content: fact.content,
                confidence: fact.confidence,
              });
            }
            const lines: string[] = [
              '## Project Knowledge\n\nPatterns established in completed milestones:\n',
            ];
            for (const [cat, catFacts] of byCategory) {
              lines.push(`### ${cat}`);
              for (const { confidence, content } of catFacts) {
                lines.push(`- [${Math.round(confidence * 100)}%] ${content}`);
              }
            }
            let projectKnowledge = lines.join('\n');
            // Cap at ~2000 tokens (approx 8000 chars at 4 chars/token)
            const TOKEN_CHAR_CAP = 8000;
            if (projectKnowledge.length > TOKEN_CHAR_CAP) {
              projectKnowledge = projectKnowledge.slice(0, TOKEN_CHAR_CAP) + '\n...(truncated)';
            }
            ctx.projectKnowledge = projectKnowledge;
            logger.info(
              `[EXECUTE] Loaded project knowledge from ${entries.length} milestone fact files (${allFacts.length} facts)`
            );
          }
        }
      }
    } catch (err) {
      logger.warn('[EXECUTE] Failed to load milestone facts:', err);
    }

    // Run pre-flight checks (worktree currency, package builds, dep merge verification)
    const preFlightEnabled = await this.isPreFlightEnabled(ctx.projectPath);
    if (preFlightEnabled) {
      const preFlightResult = await this.runPreFlightChecks(ctx);
      if (!preFlightResult.passed) {
        // Pre-flight failures are infrastructure failures — do NOT burn agent retry budget
        logger.warn('[EXECUTE] Pre-flight check failed — escalating as infrastructure failure', {
          featureId: ctx.feature.id,
          reason: preFlightResult.reason,
        });
        ctx.escalationReason = `Pre-flight check failed: ${preFlightResult.reason}`;
        return {
          nextState: 'ESCALATE',
          shouldContinue: false,
          reason: ctx.escalationReason,
        };
      }
      logger.info('[EXECUTE] Pre-flight checks passed', { featureId: ctx.feature.id });
    }

    // Execution gate: check Flow Control system state before launching the agent
    const executionGateEnabled = await this.isExecutionGateEnabled(ctx.projectPath);
    if (executionGateEnabled) {
      const gateResult = await this.runExecutionGate(ctx);
      if (!gateResult.passed) {
        logger.warn('[EXECUTE] Execution gate blocked feature — returning to backlog', {
          featureId: ctx.feature.id,
          reason: gateResult.reason,
        });
        await this.serviceContext.featureLoader.update(ctx.projectPath, ctx.feature.id, {
          status: 'backlog',
          statusChangeReason: gateResult.reason,
        });
        return {
          nextState: null,
          shouldContinue: false,
          reason: gateResult.reason,
        };
      }
      logger.info('[EXECUTE] Execution gate passed', { featureId: ctx.feature.id });
    }

    logger.info('[EXECUTE] Launching agent via autoModeService.executeFeature()', {
      featureId: ctx.feature.id,
      retryCount: ctx.retryCount,
    });

    // Wait for agent completion via event listener
    const result = await this.waitForCompletion(ctx);

    if (!result.success) {
      // Check if the post-agent recovery hook blocked this feature.
      // Blocked features should escalate rather than retry — the work is stranded
      // and retrying the agent won't resolve a git/network failure.
      const currentFeature = await this.serviceContext.featureLoader
        .get(ctx.projectPath, ctx.feature.id)
        .catch(() => null);
      if (currentFeature?.status === 'blocked') {
        ctx.escalationReason =
          currentFeature.statusChangeReason ||
          'Post-agent recovery failed — uncommitted work stranded in worktree';
        logger.warn('[EXECUTE] Feature blocked by post-agent recovery hook, escalating', {
          featureId: ctx.feature.id,
          reason: ctx.escalationReason,
        });
        return {
          nextState: 'ESCALATE',
          shouldContinue: false,
          reason: ctx.escalationReason,
        };
      }

      // ── Classify the failure into one of three categories ──────────────────
      //
      //  1. FATAL infrastructure failures  → escalate immediately (human required)
      //  2. TRANSIENT infrastructure failures → retry the specific step without
      //     re-running the agent (does not consume an agent retry slot)
      //  3. Agent failures (bad code, logic errors) → retry the full agent
      //     with accumulated context
      //
      // This ensures compute budget is not wasted re-running agents when only
      // a post-flight step (git push, PR creation) failed transiently.
      // ───────────────────────────────────────────────────────────────────────

      const errorMsg = (result.error || '').toLowerCase();

      // Fatal: unrecoverable without human intervention
      const isFatalInfraFailure =
        errorMsg.includes('permission denied') ||
        errorMsg.includes('enospc') ||
        errorMsg.includes('no space left') ||
        errorMsg.includes('authentication failed') ||
        errorMsg.includes('could not resolve host') ||
        errorMsg.includes('connection refused') ||
        errorMsg.includes('worktree') ||
        errorMsg.includes('timed out');

      if (isFatalInfraFailure) {
        ctx.escalationReason = `Infrastructure failure (not retryable): ${result.error}`;
        logger.warn('[EXECUTE] Fatal infrastructure failure detected, escalating immediately', {
          featureId: ctx.feature.id,
          error: result.error,
        });
        return {
          nextState: 'ESCALATE',
          shouldContinue: false,
          reason: ctx.escalationReason,
        };
      }

      // Transient: lightweight step failures (git push lock, gh CLI error, etc.)
      // Retry without re-running the agent; uses a separate counter so agent
      // retries are preserved for actual code-quality failures.
      const isTransientInfraFailure =
        errorMsg.includes('lock file') ||
        errorMsg.includes('git push failed') ||
        errorMsg.includes('failed to create pull request') ||
        errorMsg.includes('pr creation failed') ||
        errorMsg.includes('gh: ');

      if (isTransientInfraFailure) {
        // Resolve configurable infra retry limit (falls back to module constant)
        const maxInfraRetries = await this.resolveMaxInfraRetries(ctx.projectPath);
        ctx.infraRetryCount++;
        if (ctx.infraRetryCount <= maxInfraRetries) {
          logger.warn(
            '[EXECUTE] Transient infrastructure failure, retrying step (no agent re-run)',
            {
              featureId: ctx.feature.id,
              infraRetryCount: ctx.infraRetryCount,
              maxInfraRetries,
              error: result.error,
            }
          );
          return {
            nextState: 'EXECUTE',
            shouldContinue: true,
            reason: `Transient infra failure (attempt ${ctx.infraRetryCount}/${maxInfraRetries}): ${result.error || 'unknown'}`,
          };
        }

        // Infrastructure retries exhausted — escalate
        ctx.escalationReason = `Infrastructure step failed after ${maxInfraRetries} retries: ${result.error}`;
        logger.warn('[EXECUTE] Infrastructure retries exhausted, escalating', {
          featureId: ctx.feature.id,
          infraRetryCount: ctx.infraRetryCount,
          error: result.error,
        });
        return {
          nextState: 'ESCALATE',
          shouldContinue: false,
          reason: ctx.escalationReason,
        };
      }

      // Agent failure: re-run the agent with accumulated context
      ctx.retryCount++;
      logger.warn('[EXECUTE] Agent execution failed, will retry with context', {
        retryCount: ctx.retryCount,
        maxAgentRetries,
        error: result.error,
      });

      return {
        nextState: 'EXECUTE',
        shouldContinue: true,
        reason: `Agent failed: ${result.error || 'unknown'}`,
      };
    }

    // Fire-and-forget: extract structured facts from agent output
    if (this.serviceContext.factStoreService) {
      try {
        const fs = await import('node:fs/promises');
        const outputPath = path.join(
          getFeatureDir(ctx.projectPath, ctx.feature.id),
          'agent-output.md'
        );
        const agentOutput = await fs.readFile(outputPath, 'utf-8').catch(() => '');
        this.serviceContext.factStoreService.extractAndSave(
          ctx.projectPath,
          ctx.feature.id,
          agentOutput
        );
      } catch (err) {
        logger.warn('[EXECUTE] Failed to trigger fact extraction (non-fatal):', err);
      }
    }

    // Reload feature to capture updated costUsd, prNumber, etc.
    const updated = await this.serviceContext.featureLoader.get(ctx.projectPath, ctx.feature.id);
    if (updated) {
      ctx.feature = updated;
      if (updated.prNumber) ctx.prNumber = updated.prNumber;
    }

    // ── Kill criteria: cost cap ───────────────────────────────────────────────
    const maxCostUsd = await this.resolveMaxCostUsdPerFeature(ctx.projectPath);
    if (maxCostUsd !== undefined) {
      const currentCost = ctx.feature.costUsd ?? 0;
      if (currentCost >= maxCostUsd) {
        const reason = `Cost cap exceeded: $${currentCost.toFixed(2)} >= cap $${maxCostUsd.toFixed(2)}`;
        logger.warn('[EXECUTE] Cost cap exceeded — blocking feature', {
          featureId: ctx.feature.id,
          costUsd: currentCost,
          capUsd: maxCostUsd,
        });
        await this.serviceContext.featureLoader.update(ctx.projectPath, ctx.feature.id, {
          status: 'blocked',
          statusChangeReason: reason,
        });
        this.serviceContext.events.emit('cost:exceeded' as EventType, {
          featureId: ctx.feature.id,
          projectPath: ctx.projectPath,
          costUsd: currentCost,
          capUsd: maxCostUsd,
        });
        return {
          nextState: null,
          shouldContinue: false,
          reason,
        };
      }
    }

    // ── Kill criteria: runtime cap ────────────────────────────────────────────
    const maxRuntimeMinutes = await this.resolveMaxRuntimeMinutesPerFeature(ctx.projectPath);
    if (ctx.startedAt) {
      const elapsedMs = Date.now() - new Date(ctx.startedAt).getTime();
      const elapsedMinutes = elapsedMs / 60_000;
      if (elapsedMinutes >= maxRuntimeMinutes) {
        const reason = `Runtime cap exceeded: ${elapsedMinutes.toFixed(1)} min >= cap ${maxRuntimeMinutes} min`;
        logger.warn('[EXECUTE] Runtime cap exceeded — blocking feature', {
          featureId: ctx.feature.id,
          elapsedMinutes,
          capMinutes: maxRuntimeMinutes,
        });
        await this.serviceContext.featureLoader.update(ctx.projectPath, ctx.feature.id, {
          status: 'blocked',
          statusChangeReason: reason,
        });
        this.serviceContext.events.emit('runtime:exceeded' as EventType, {
          featureId: ctx.feature.id,
          projectPath: ctx.projectPath,
          elapsedMinutes,
          capMinutes: maxRuntimeMinutes,
        });
        return {
          nextState: null,
          shouldContinue: false,
          reason,
        };
      }
    }

    // Save EXECUTE handoff — parse modified files and questions from agent output
    if (this.serviceContext.leadHandoffService) {
      try {
        const fs = await import('node:fs/promises');
        const outputPath = path.join(
          getFeatureDir(ctx.projectPath, ctx.feature.id),
          'agent-output.md'
        );
        const agentOutput = await fs.readFile(outputPath, 'utf-8').catch(() => '');
        const modifiedFiles = (
          agentOutput.match(/^(?:Modified:|Create[d]?:|\+\+\+\s+)\s*(\S+\.tsx?)/gm) || []
        )
          .map((l) => l.replace(/^(?:Modified:|Create[d]?:|\+\+\+\s+)\s*/, '').trim())
          .slice(0, 20);
        const questions = agentOutput
          .split('\n')
          .filter((l) => l.trim().endsWith('?'))
          .slice(0, 5);
        const verdictMatch = agentOutput.match(/VERDICT:\s*(APPROVE|WARN|BLOCK)/);
        const verdict = (verdictMatch?.[1] as 'APPROVE' | 'WARN' | 'BLOCK') ?? 'APPROVE';

        await this.serviceContext.leadHandoffService.saveHandoff(ctx.projectPath, ctx.feature.id, {
          phase: 'EXECUTE',
          summary: `Agent completed execution. PR: ${ctx.prNumber ? `#${ctx.prNumber}` : 'pending'}`,
          discoveries: [],
          modifiedFiles,
          outstandingQuestions: questions,
          scopeLimits: [],
          testCoverage: agentOutput.toLowerCase().includes('test')
            ? 'Tests mentioned in output'
            : 'Unknown',
          verdict,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.warn('[EXECUTE] Failed to save handoff (non-fatal):', err);
      }
    }

    // Fire-and-forget: persist trajectory for the learning flywheel
    if (this.serviceContext.trajectoryStoreService) {
      try {
        const existingTrajectories =
          await this.serviceContext.trajectoryStoreService.loadTrajectories(
            ctx.projectPath,
            ctx.feature.id
          );
        const attemptNumber = existingTrajectories.length + 1;

        const fs = await import('node:fs/promises');
        const outputPath = path.join(
          getFeatureDir(ctx.projectPath, ctx.feature.id),
          'agent-output.md'
        );
        const agentOutput = await fs.readFile(outputPath, 'utf-8').catch(() => '');

        const trajectory: VerifiedTrajectory = {
          featureId: ctx.feature.id,
          domain: 'fullstack',
          complexity: (ctx.feature.complexity as VerifiedTrajectory['complexity']) || 'medium',
          model: ctx.feature.model || 'sonnet',
          planSummary: (ctx.planOutput || '').slice(0, 500),
          executionSummary: agentOutput.slice(0, 500),
          costUsd: ctx.feature.costUsd || 0,
          durationMs: ctx.startedAt ? Date.now() - new Date(ctx.startedAt).getTime() : 0,
          retryCount: ctx.retryCount,
          verified: true,
          timestamp: new Date().toISOString(),
          attemptNumber,
        };

        this.serviceContext.trajectoryStoreService.saveTrajectory(
          ctx.projectPath,
          ctx.feature.id,
          trajectory
        );
      } catch (err) {
        logger.warn('[EXECUTE] Failed to save trajectory (non-fatal):', err);
      }
    }

    return {
      nextState: 'REVIEW',
      shouldContinue: true,
      reason: 'Execution completed, moving to review',
    };
  }

  async exit(ctx: StateContext): Promise<void> {
    logger.info('[EXECUTE] Execution phase completed');
    this.serviceContext.events.emit('pipeline:phase-completed' as EventType, {
      featureId: ctx.feature.id,
      projectPath: ctx.projectPath,
      phase: 'EXECUTE' as PipelinePhase,
      branch: 'ops' as const,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Resolve whether the execution gate is enabled for this project.
   * Reads from project workflow settings; defaults to true.
   */
  private async isExecutionGateEnabled(projectPath: string): Promise<boolean> {
    try {
      if (this.serviceContext.settingsService) {
        const settings = await this.serviceContext.settingsService.getProjectSettings(projectPath);
        if (typeof settings.workflow?.executionGate === 'boolean') {
          return settings.workflow.executionGate;
        }
      }
    } catch {
      /* non-fatal — fall through to default */
    }
    return true; // default: enabled
  }

  /**
   * Run execution gate checks before launching the agent.
   *
   * (a) Review queue depth < maxPendingReviews
   * (b) Error budget not exhausted
   * (c) CI not saturated (pending GitHub check runs < threshold)
   *
   * Returns { passed: true } on success, or { passed: false, reason } on failure.
   */
  private async runExecutionGate(ctx: StateContext): Promise<{ passed: boolean; reason?: string }> {
    const { projectPath } = ctx;

    // Resolve thresholds from workflow settings
    const DEFAULT_MAX_PENDING_REVIEWS = 5;
    const DEFAULT_MAX_PENDING_CI_RUNS = 10;
    let maxPendingReviews = DEFAULT_MAX_PENDING_REVIEWS;
    let maxPendingCiRuns = DEFAULT_MAX_PENDING_CI_RUNS;
    let errorBudgetThreshold = 0.2;
    let errorBudgetWindowDays = 7;

    try {
      if (this.serviceContext.settingsService) {
        const settings = await this.serviceContext.settingsService.getProjectSettings(projectPath);
        const workflow = settings.workflow as typeof settings.workflow & {
          maxPendingReviews?: number;
          maxPendingCiRuns?: number;
          errorBudgetThreshold?: number;
          errorBudgetWindow?: number;
        };
        if (typeof workflow?.maxPendingReviews === 'number') {
          maxPendingReviews = workflow.maxPendingReviews;
        }
        if (typeof workflow?.maxPendingCiRuns === 'number') {
          maxPendingCiRuns = workflow.maxPendingCiRuns;
        }
        if (typeof workflow?.errorBudgetThreshold === 'number') {
          errorBudgetThreshold = workflow.errorBudgetThreshold;
        }
        if (typeof workflow?.errorBudgetWindow === 'number') {
          errorBudgetWindowDays = workflow.errorBudgetWindow;
        }
      }
    } catch {
      /* non-fatal — use defaults */
    }

    // ── (a) Review queue depth ────────────────────────────────────────────────
    try {
      const allFeatures = await this.serviceContext.featureLoader.getAll(projectPath);
      const reviewDepth = allFeatures.filter((f) => f.status === 'review').length;
      if (reviewDepth >= maxPendingReviews) {
        return {
          passed: false,
          reason: `Execution gate: review queue saturated (${reviewDepth}/${maxPendingReviews} features in review)`,
        };
      }
    } catch (err) {
      logger.warn('[EXECUTE][gate] Could not check review queue depth (non-fatal):', err);
    }

    // ── (b) Error budget ──────────────────────────────────────────────────────
    try {
      const { ErrorBudgetService } = await import('./error-budget-service.js');
      const errorBudget = new ErrorBudgetService(projectPath, {
        windowDays: errorBudgetWindowDays,
        threshold: errorBudgetThreshold,
      });
      if (errorBudget.isExhausted()) {
        const state = errorBudget.getState();
        return {
          passed: false,
          reason: `Execution gate: error budget exhausted (fail rate ${(state.failRate * 100).toFixed(1)}% >= threshold ${(state.threshold * 100).toFixed(1)}%)`,
        };
      }
    } catch (err) {
      logger.warn('[EXECUTE][gate] Could not check error budget (non-fatal):', err);
    }

    // ── (c) CI saturation ─────────────────────────────────────────────────────
    try {
      const allFeatures = await this.serviceContext.featureLoader.getAll(projectPath);
      const reviewFeatures = allFeatures.filter((f) => f.status === 'review' && f.branchName);
      let pendingCiCount = 0;
      for (const f of reviewFeatures) {
        if (!f.branchName) continue;
        try {
          const { stdout } = await execAsync(
            `gh pr list --head "${f.branchName}" --state open --json number --limit 1`,
            { cwd: projectPath, timeout: 10_000 }
          );
          const prs: { number: number }[] = JSON.parse(stdout || '[]');
          if (prs.length === 0) continue;
          const prNumber = prs[0].number;
          // Count pending check runs on this PR's HEAD
          const { stdout: checksOut } = await execAsync(
            `gh pr checks ${prNumber} --json state --jq '[.[] | select(.state == "PENDING")] | length'`,
            { cwd: projectPath, timeout: 15_000 }
          );
          const pending = parseInt(checksOut.trim(), 10);
          if (!isNaN(pending)) {
            pendingCiCount += pending;
          }
        } catch {
          /* non-fatal per PR */
        }
      }
      if (pendingCiCount >= maxPendingCiRuns) {
        return {
          passed: false,
          reason: `Execution gate: CI saturated (${pendingCiCount} pending check runs >= threshold ${maxPendingCiRuns})`,
        };
      }
    } catch (err) {
      logger.warn('[EXECUTE][gate] Could not check CI saturation (non-fatal):', err);
    }

    return { passed: true };
  }

  /**
   * Resolve whether pre-flight checks are enabled for this project.
   * Reads from project workflow settings; defaults to true.
   */
  private async isPreFlightEnabled(projectPath: string): Promise<boolean> {
    try {
      if (this.serviceContext.settingsService) {
        const settings = await this.serviceContext.settingsService.getProjectSettings(projectPath);
        if (typeof settings.workflow?.preFlightChecks === 'boolean') {
          return settings.workflow.preFlightChecks;
        }
      }
    } catch {
      /* non-fatal — fall through to default */
    }
    return true; // default: enabled
  }

  /**
   * Pre-flight checklist run before the agent is launched.
   *
   * a. Worktree currency: git fetch origin + compare HEAD with origin/<baseBranch>.
   *    If the worktree is behind, attempt a rebase. On conflict, abort and escalate.
   * b. Package build: if any libs/ files changed since worktree creation, run
   *    `npm run build:packages`. On failure, escalate.
   * c. Dependency merge verification: for each dep with isFoundation=true, the dep
   *    must be 'done'/'completed'/'verified' (i.e. merged), not merely in 'review'.
   *
   * Returns { passed: true } on success, or { passed: false, reason } on failure.
   * Failures are infrastructure failures — callers must NOT burn agent retry budget.
   */
  private async runPreFlightChecks(
    ctx: StateContext
  ): Promise<{ passed: boolean; reason?: string }> {
    const { feature, projectPath } = ctx;

    // ── (a) Worktree currency check ──────────────────────────────────────────
    const worktreeDir = await this.resolveWorktreeDir(projectPath, feature.branchName);
    const workDir = worktreeDir ?? projectPath;

    try {
      logger.info('[EXECUTE][pre-flight] Fetching origin', { featureId: feature.id });
      await execAsync('git fetch origin', { cwd: workDir, timeout: 30_000 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('[EXECUTE][pre-flight] git fetch failed (non-fatal, continuing)', { msg });
      // Non-fatal: network blip should not block the agent
    }

    // Determine base branch (default to 'dev')
    let baseBranch = 'dev';
    try {
      const { stdout: upstream } = await execAsync(
        'git rev-parse --abbrev-ref --symbolic-full-name @{u}',
        { cwd: workDir, timeout: 5_000 }
      );
      const upstreamTrimmed = upstream.trim();
      if (upstreamTrimmed && upstreamTrimmed.startsWith('origin/')) {
        baseBranch = upstreamTrimmed.slice('origin/'.length);
      }
    } catch {
      /* no upstream set — use default */
    }

    try {
      const { stdout: revList } = await execAsync(
        `git rev-list --count HEAD..origin/${baseBranch}`,
        { cwd: workDir, timeout: 10_000 }
      );
      const behind = parseInt(revList.trim(), 10);
      if (!isNaN(behind) && behind > 0) {
        logger.info(
          `[EXECUTE][pre-flight] Worktree is ${behind} commits behind origin/${baseBranch}, rebasing`,
          { featureId: feature.id }
        );
        try {
          await execAsync(`git rebase origin/${baseBranch}`, { cwd: workDir, timeout: 60_000 });
          logger.info('[EXECUTE][pre-flight] Rebase succeeded', { featureId: feature.id });
        } catch (rebaseErr) {
          // Abort the rebase to leave the worktree clean
          try {
            await execAsync('git rebase --abort', { cwd: workDir, timeout: 10_000 });
          } catch {
            /* best-effort */
          }
          const rebaseMsg = rebaseErr instanceof Error ? rebaseErr.message : String(rebaseErr);
          return {
            passed: false,
            reason: `Worktree rebase onto origin/${baseBranch} failed (conflicts or error): ${rebaseMsg}`,
          };
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('[EXECUTE][pre-flight] Could not determine rev-list distance (non-fatal)', {
        msg,
      });
      // Non-fatal: if we can't determine distance, proceed
    }

    // ── (b) Package build check ───────────────────────────────────────────────
    try {
      // Check if any libs/ files changed since the worktree branch diverged from its merge base
      const { stdout: mergeBase } = await execAsync(`git merge-base HEAD origin/${baseBranch}`, {
        cwd: workDir,
        timeout: 10_000,
      }).catch(() => ({ stdout: 'HEAD~1' }));

      const { stdout: changedFiles } = await execAsync(
        `git diff --name-only ${mergeBase.trim()} HEAD`,
        { cwd: workDir, timeout: 10_000 }
      ).catch(() => ({ stdout: '' }));

      const libsChanged = changedFiles.split('\n').some((f) => f.trim().startsWith('libs/'));

      if (libsChanged) {
        logger.info('[EXECUTE][pre-flight] libs/ files changed — running npm run build:packages', {
          featureId: feature.id,
        });
        try {
          await execAsync('npm run build:packages', { cwd: projectPath, timeout: 120_000 });
          logger.info('[EXECUTE][pre-flight] Package build succeeded', { featureId: feature.id });
        } catch (buildErr) {
          const buildMsg = buildErr instanceof Error ? buildErr.message : String(buildErr);
          return {
            passed: false,
            reason: `Package build (npm run build:packages) failed after libs/ changes: ${buildMsg}`,
          };
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn('[EXECUTE][pre-flight] Package build check error (non-fatal)', { msg });
      // Non-fatal: proceed if we can't determine changed files
    }

    // ── (c) Dependency merge verification ────────────────────────────────────
    if (feature.dependencies && feature.dependencies.length > 0) {
      try {
        const allFeatures = await this.serviceContext.featureLoader.getAll(projectPath);
        const unmergedFoundationDeps: string[] = [];

        for (const depId of feature.dependencies) {
          const dep = allFeatures.find((f) => f.id === depId);
          if (!dep) {
            unmergedFoundationDeps.push(`${depId} (not found)`);
            continue;
          }
          if (dep.isFoundation) {
            // Foundation deps must be done (merged), 'review' is NOT sufficient
            const isMerged =
              dep.status === 'done' || dep.status === 'completed' || dep.status === 'verified';
            if (!isMerged) {
              unmergedFoundationDeps.push(
                `${depId} (${dep.title || depId}, status=${dep.status} — needs merge)`
              );
            }
          }
        }

        if (unmergedFoundationDeps.length > 0) {
          return {
            passed: false,
            reason: `Foundation dependencies not yet merged: ${unmergedFoundationDeps.join(', ')}`,
          };
        }

        logger.info('[EXECUTE][pre-flight] Dependency merge verification passed', {
          featureId: feature.id,
          depCount: feature.dependencies.length,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('[EXECUTE][pre-flight] Dependency check error (non-fatal)', { msg });
        // Non-fatal: if we can't load features, proceed
      }
    }

    return { passed: true };
  }

  /**
   * Resolve the worktree directory for the given branch, or null if not found.
   * Uses `git worktree list --porcelain` in the project root.
   */
  private async resolveWorktreeDir(
    projectPath: string,
    branchName: string | undefined
  ): Promise<string | null> {
    if (!branchName) return null;
    try {
      const { stdout } = await execAsync('git worktree list --porcelain', {
        cwd: projectPath,
        timeout: 10_000,
      });
      // Porcelain format: blocks separated by blank lines
      // Each block: "worktree <path>\nHEAD <sha>\nbranch refs/heads/<name>"
      const blocks = stdout.trim().split(/\n\n+/);
      for (const block of blocks) {
        const lines = block.split('\n');
        const worktreeLine = lines.find((l) => l.startsWith('worktree '));
        const branchLine = lines.find((l) => l.startsWith('branch '));
        if (!worktreeLine || !branchLine) continue;
        const worktreePath = worktreeLine.slice('worktree '.length).trim();
        const branch = branchLine.slice('branch refs/heads/'.length).trim();
        if (branch === branchName) return worktreePath;
      }
    } catch {
      /* non-fatal */
    }
    return null;
  }

  /**
   * Execute the feature and wait for a completion event.
   * Uses executeFeature() directly (not through process()) to avoid recursion.
   */
  private waitForCompletion(ctx: StateContext): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      let unsubscribe: (() => void) | null = null;
      let timedOut = false;

      // Track the execution promise so we can chain resolves through it.
      // This prevents a race condition where the EXECUTE processor retries before
      // concurrencyManager.release() runs in executeFeature()'s finally block:
      // event fires → outer promise resolves → retry calls acquire() → lease still held.
      // By chaining through executionSettled, we guarantee the finally block has run.
      let executionSettled: Promise<void> = Promise.resolve();

      const safeResolve = (result: { success: boolean; error?: string }) => {
        executionSettled.then(() => resolve(result)).catch(() => resolve(result));
      };

      const timeout = setTimeout(() => {
        timedOut = true;
        if (unsubscribe) unsubscribe();
        safeResolve({ success: false, error: 'Execution timed out after 30 minutes' });
      }, EXECUTE_TIMEOUT_MS);

      // Subscribe to completion events for this feature (filter by both featureId and projectPath)
      unsubscribe = this.serviceContext.events.subscribe((type: EventType, payload: unknown) => {
        const p = payload as Record<string, unknown> | null;
        if (p?.featureId !== ctx.feature.id) return;
        if (p?.projectPath && p.projectPath !== ctx.projectPath) return;

        if (type === 'feature:completed') {
          clearTimeout(timeout);
          if (!timedOut) {
            if (unsubscribe) unsubscribe();
            safeResolve({ success: true });
          }
        } else if (type === 'feature:stopped') {
          clearTimeout(timeout);
          if (!timedOut) {
            if (unsubscribe) unsubscribe();
            safeResolve({
              success: false,
              error: 'Agent was stopped before completion',
            });
          }
        } else if (type === 'feature:error') {
          clearTimeout(timeout);
          if (!timedOut) {
            if (unsubscribe) unsubscribe();
            safeResolve({
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
      if (ctx.projectKnowledge) {
        contextParts.push(ctx.projectKnowledge);
      }
      if (ctx.siblingReflections && ctx.siblingReflections.length > 0) {
        contextParts.push(
          `## Learnings from Prior Features\n\nApply relevant lessons:\n\n${ctx.siblingReflections.join('\n\n---\n\n')}`
        );
      }
      const recoveryContext = contextParts.length > 0 ? contextParts.join('\n\n') : undefined;

      // Start execution (bypasses lead engineer delegation — calls executeFeature directly).
      // Store as executionSettled so safeResolve waits for the concurrency lease to be
      // released before unblocking the EXECUTE processor's retry attempt.
      executionSettled = this.serviceContext.autoModeService
        .executeFeature(ctx.projectPath, ctx.feature.id, true, false, undefined, {
          recoveryContext,
          retryCount: ctx.retryCount,
        })
        .then(() => {})
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
