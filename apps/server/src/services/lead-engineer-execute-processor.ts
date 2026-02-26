/**
 * Lead Engineer — Execute State Processor
 *
 * Runs the feature agent in a worktree and waits for completion.
 * On failure, retries with accumulated context. On success, advances to REVIEW.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { createLogger } from '@protolabs-ai/utils';
import { getAutomakerDir, getFeatureDir } from '@protolabs-ai/platform';
import type { EventType } from '@protolabs-ai/types';
import type {
  ProcessorServiceContext,
  StateContext,
  StateProcessor,
  StateTransitionResult,
} from './lead-engineer-types.js';
import { EXECUTE_TIMEOUT_MS } from './lead-engineer-types.js';

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
        shouldContinue: true,
        reason: ctx.escalationReason,
      };
    }

    // Check retry limit
    if (ctx.retryCount >= this.MAX_RETRIES) {
      ctx.escalationReason = `Max retries exceeded (${this.MAX_RETRIES})`;
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

      // Subscribe to completion events for this feature (filter by both featureId and projectPath)
      unsubscribe = this.serviceContext.events.subscribe((type: EventType, payload: unknown) => {
        const p = payload as Record<string, unknown> | null;
        if (p?.featureId !== ctx.feature.id) return;
        if (p?.projectPath && p.projectPath !== ctx.projectPath) return;

        if (type === 'feature:completed') {
          clearTimeout(timeout);
          if (!timedOut) {
            if (unsubscribe) unsubscribe();
            resolve({ success: true });
          }
        } else if (type === 'feature:stopped') {
          clearTimeout(timeout);
          if (!timedOut) {
            if (unsubscribe) unsubscribe();
            resolve({
              success: false,
              error: 'Agent was stopped before completion',
            });
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
