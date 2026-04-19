/**
 * Lead Engineer — Action Executor & Supervisor
 *
 * ActionExecutor: Executes fast-path rule actions (move_feature, restart_auto_mode, etc.)
 * supervisorCheck: Monitors agent runtime and cost, aborts if thresholds are breached.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@protolabsai/utils';
import type {
  EventType,
  LeadEngineerSession,
  LeadRuleAction,
  LeadFastPathRule,
  LeadRuleLogEntry,
  WorkflowSettings,
  ActionProposal,
} from '@protolabsai/types';
import type { EventEmitter } from '../lib/events.js';
import { resolveMergeStrategy } from '../lib/merge-strategy.js';
import type { FeatureLoader } from './feature-loader.js';
import type { AutoModeService } from './auto-mode-service.js';
import type { CodeRabbitResolverService } from './coderabbit-resolver-service.js';
import type { AuthorityService } from './authority-service.js';

const execAsync = promisify(exec);
const logger = createLogger('LeadEngineerService');

const SUPERVISOR_WARN_RUNTIME_MS = 45 * 60 * 1000; // 45 minutes
const SUPERVISOR_ABORT_COST_USD = 15;

export interface ActionExecutorDeps {
  events: EventEmitter;
  featureLoader: FeatureLoader;
  autoModeService: AutoModeService;
  codeRabbitResolver?: CodeRabbitResolverService;
  discordBotService?: { sendToChannel(channelId: string, content: string): Promise<boolean> };
  authorityService?: AuthorityService;
  workflowSettings?: WorkflowSettings;
}

export class ActionExecutor {
  constructor(private deps: ActionExecutorDeps) {}

  /**
   * Execute a single rule action.
   * When authorityEnforcement is enabled, calls AuthorityService.submitProposal()
   * before executing. Actions blocked by policy are not executed.
   */
  async executeAction(session: LeadEngineerSession, action: LeadRuleAction): Promise<void> {
    // Authority enforcement pre-check
    if (this.deps.authorityService && this.deps.workflowSettings?.authorityEnforcement === true) {
      const proposal = buildProposalForAction(session, action);
      if (proposal) {
        try {
          const decision = await this.deps.authorityService.submitProposal(
            proposal,
            session.projectPath
          );
          if (decision.verdict !== 'allow') {
            logger.warn(
              `[Authority] Action blocked: type=${action.type} verdict=${decision.verdict} reason=${decision.reason}`
            );
            this.deps.events.emit('lead-engineer:action-blocked' as EventType, {
              projectPath: session.projectPath,
              actionType: action.type,
              verdict: decision.verdict,
              reason: decision.reason,
            });
            return;
          }
        } catch (err) {
          logger.error(`[Authority] submitProposal failed for action ${action.type}:`, err);
          // On authority service error, fail-open: allow the action to proceed
        }
      }
    }

    session.actionsTaken++;

    this.deps.events.emit('lead-engineer:action-executed', {
      projectPath: session.projectPath,
      actionType: action.type,
      details: action as unknown as Record<string, unknown>,
    });

    switch (action.type) {
      case 'move_feature': {
        try {
          await this.deps.featureLoader.update(session.projectPath, action.featureId, {
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
          // Before resetting to backlog, check if the feature's branch already has a merged PR.
          // This prevents zombie retry loops on already-merged work (e.g. feature manually set to
          // done after merge, but failureClassification.retryable causes classifiedRecovery to keep
          // resetting it back to backlog and spawning new agents).
          const featureSnap = session.worldState.features[action.featureId];
          if (featureSnap?.branchName) {
            const mergedPR = await this.checkBranchMergedPR(
              featureSnap.branchName,
              session.projectPath
            );
            if (mergedPR) {
              await this.deps.featureLoader.update(session.projectPath, action.featureId, {
                status: 'done',
                prMergedAt: mergedPR.mergedAt,
                ...(!featureSnap.prNumber ? { prNumber: mergedPR.number } : {}),
              });
              logger.info(
                `reset_feature skipped for ${action.featureId}: branch "${featureSnap.branchName}" ` +
                  `has merged PR #${mergedPR.number} — marked done instead of retrying`
              );
              break;
            }
          }

          await this.deps.featureLoader.resetToBacklog(
            session.projectPath,
            action.featureId,
            action.reason
          );
          logger.info(`Reset feature ${action.featureId}: ${action.reason}`);
          this.deps.events.emit('escalation:signal-received', {
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
          await this.deps.featureLoader.update(session.projectPath, action.featureId, {
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
          const mergeFlag = await resolveMergeStrategy(action.prNumber, session.projectPath);
          await execAsync(`gh pr merge ${action.prNumber} --auto ${mergeFlag}`, {
            cwd: session.projectPath,
            timeout: 30000,
          });
          const pr = session.worldState.openPRs.find((p) => p.featureId === action.featureId);
          if (pr) pr.autoMergeEnabled = true;
          logger.info(`Enabled auto-merge on PR #${action.prNumber} (${mergeFlag})`);
        } catch (err) {
          logger.warn(`Failed to enable auto-merge on PR #${action.prNumber}:`, err);
        }
        break;
      }

      case 'resolve_threads_direct': {
        if (!this.deps.codeRabbitResolver) {
          logger.warn('CodeRabbitResolverService not available, cannot resolve threads directly');
          break;
        }
        try {
          const result = await this.deps.codeRabbitResolver.resolveThreads(
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
        this.deps.events.emit('escalation:signal-received', {
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
          await this.deps.autoModeService.startAutoLoopForProject(action.projectPath, null);
          session.worldState.autoModeRunning = true;
          session.worldState.lastAutoModeRestartAt = new Date().toISOString();
          logger.info(`Restarted auto-mode for ${action.projectPath}`);
        } catch (err) {
          logger.warn(`Failed to restart auto-mode:`, err);
        }
        break;
      }

      case 'stop_agent': {
        try {
          await this.deps.autoModeService.stopFeature(action.featureId);
          logger.info(`Stopped agent for feature ${action.featureId}`);
        } catch (err) {
          logger.warn(`Failed to stop agent for ${action.featureId}:`, err);
        }
        break;
      }

      case 'send_agent_message': {
        try {
          await this.deps.autoModeService.followUpFeature(
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
          await this.deps.autoModeService.stopFeature(action.featureId);
          await new Promise((r) => setTimeout(r, 5000));
          await this.deps.autoModeService.executeFeature(
            session.projectPath,
            action.featureId,
            true,
            false,
            undefined,
            { recoveryContext: action.resumePrompt }
          );
          this.deps.events.emit('pipeline:supervisor-action' as EventType, {
            featureId: action.featureId,
            action: 'abort_and_resume',
            reason: action.resumePrompt,
          });
          this.deps.events.emit('escalation:signal-received', {
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
        if (this.deps.discordBotService) {
          await this.deps.discordBotService
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
        this.deps.events.emit('escalation:signal-received', {
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
        // Handled by LeadEngineerService.handleProjectCompleting()
        // This case is dispatched back to the service after detection
        this.deps.events.emit('lead-engineer:project-completing-requested' as EventType, {
          projectPath: session.projectPath,
          projectSlug: session.projectSlug,
        });
        break;
      }

      case 'update_feature': {
        try {
          await this.deps.featureLoader.update(
            session.projectPath,
            action.featureId,
            action.updates as Record<string, unknown>
          );
          logger.info(`Updated feature ${action.featureId}:`, action.updates);
        } catch (err) {
          logger.error(`Failed to update feature ${action.featureId}:`, err);
        }
        break;
      }

      case 'rollback_feature': {
        try {
          await this.deps.featureLoader.update(session.projectPath, action.featureId, {
            status: 'blocked',
            statusChangeReason: `Rollback: ${action.reason}`,
          });
          logger.warn(`Rolled back feature ${action.featureId}: ${action.reason}`);
          this.deps.events.emit('escalation:signal-received', {
            source: 'lead_engineer',
            severity: 'high',
            type: 'feature_rollback',
            context: {
              featureId: action.featureId,
              projectPath: action.projectPath,
              reason: action.reason,
            },
            deduplicationKey: `rollback_${action.featureId}`,
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          logger.error(`Failed to rollback feature ${action.featureId}:`, err);
        }
        break;
      }
    }
  }

  /**
   * Supervisor check: evaluate agent runtime and cost, take corrective action.
   */
  supervisorCheck(session: LeadEngineerSession, settings?: WorkflowSettings): void {
    const now = Date.now();

    const abortCostUsd = settings?.pipeline.maxAgentCostUsd ?? SUPERVISOR_ABORT_COST_USD;
    const warnCostUsd = abortCostUsd * 0.53;
    const warnRuntimeMs =
      (settings?.pipeline.maxAgentRuntimeMinutes ?? SUPERVISOR_WARN_RUNTIME_MS / 60000) * 60000;
    const abortRuntimeMs = warnRuntimeMs * 2;

    for (const agent of session.worldState.agents) {
      const runtimeMs = now - new Date(agent.startTime).getTime();
      const feature = session.worldState.features[agent.featureId];
      const costUsd = feature?.costUsd ?? 0;

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

      if (costUsd >= warnCostUsd) {
        logger.info(`[Supervisor] Warning: ${agent.featureId} cost $${costUsd.toFixed(2)}`);
        this.deps.events.emit('pipeline:supervisor-action' as EventType, {
          featureId: agent.featureId,
          action: 'cost_warning',
          reason: `Agent cost $${costUsd.toFixed(2)} approaching limit ($${abortCostUsd})`,
        });
      }

      if (runtimeMs >= warnRuntimeMs) {
        const minutes = Math.round(runtimeMs / 60000);
        logger.info(`[Supervisor] Warning: ${agent.featureId} running ${minutes}min`);
        this.deps.events.emit('pipeline:supervisor-action' as EventType, {
          featureId: agent.featureId,
          action: 'runtime_warning',
          reason: `Agent running for ${minutes} minutes`,
        });
      }
    }
  }

  /**
   * Evaluate rules against the current world state and execute resulting actions.
   * Updates the session rule log and emits rule-evaluated events.
   */
  evaluateAndExecute(
    session: LeadEngineerSession,
    rules: LeadFastPathRule[],
    eventType: string,
    payload: unknown,
    maxRuleLogEntries: number
  ): void {
    // Evaluate each rule once, collecting actions and building the rule log in a single pass
    const allActions: LeadRuleAction[] = [];

    for (const rule of rules) {
      if (!rule.triggers.includes(eventType)) continue;
      const ruleActions = rule.evaluate(session.worldState, eventType, payload);
      if (ruleActions.length > 0) {
        allActions.push(...ruleActions);
        const entry: LeadRuleLogEntry = {
          timestamp: new Date().toISOString(),
          ruleName: rule.name,
          eventType,
          actions: ruleActions,
        };
        session.ruleLog.push(entry);
        this.deps.events.emit('lead-engineer:rule-evaluated', {
          projectPath: session.projectPath,
          ruleName: rule.name,
          eventType,
          actionCount: ruleActions.length,
        });
      }
    }

    if (allActions.length === 0) return;

    if (session.ruleLog.length > maxRuleLogEntries) {
      session.ruleLog = session.ruleLog.slice(-maxRuleLogEntries);
    }

    // Deduplicate restart_auto_mode — multiple rules may emit it for the same event
    const seen = new Set<string>();
    const dedupedActions = allActions.filter((a) => {
      if (a.type === 'restart_auto_mode') {
        if (seen.has('restart_auto_mode')) return false;
        seen.add('restart_auto_mode');
      }
      return true;
    });

    for (const action of dedupedActions) {
      this.executeAction(session, action).catch((err) => {
        logger.error(`Action execution failed (${action.type}):`, err);
      });
    }
  }

  /**
   * Check if the given branch has a merged PR on GitHub.
   * Queries by branch name (head), not by prNumber, so it works even when the
   * feature's prNumber has been overwritten by a newer PR creation.
   * Returns the first merged PR found, or null if none / on error (fail-open).
   */
  private async checkBranchMergedPR(
    branchName: string,
    projectPath: string
  ): Promise<{ number: number; mergedAt: string } | null> {
    try {
      const { stdout } = await execAsync(
        `gh pr list --head "${branchName}" --state merged --json number,mergedAt --limit 1`,
        { cwd: projectPath, timeout: 15000 }
      );
      const trimmed = stdout.trim();
      if (!trimmed || trimmed === '[]' || trimmed === 'null') return null;
      const prs = JSON.parse(trimmed) as Array<{ number: number; mergedAt: string }>;
      return prs.length > 0 ? (prs[0] ?? null) : null;
    } catch {
      // Fail-open: if the GitHub check fails, proceed with normal reset
      return null;
    }
  }
}

// ============================================================================
// Authority Helpers
// ============================================================================

/**
 * Map a LeadRuleAction to an ActionProposal for authority policy evaluation.
 * Returns null for action types that don't require authority checks (e.g. log, post_discord).
 *
 * Risk assignment is conservative: actions that mutate agent state or move features
 * to done/blocked are treated as medium risk; supervisor aborts are high risk.
 * Informational-only actions (log, post_discord, escalate_llm) are skipped.
 */
function buildProposalForAction(
  session: LeadEngineerSession,
  action: LeadRuleAction
): ActionProposal | null {
  const who = 'lead-engineer';

  switch (action.type) {
    case 'move_feature':
      return {
        who,
        what: 'update_status',
        target: action.featureId,
        justification: `Lead engineer rule: move feature to ${action.toStatus}`,
        risk: action.toStatus === 'done' || action.toStatus === 'blocked' ? 'medium' : 'low',
        statusTransition: { from: 'unknown', to: action.toStatus },
      };

    case 'reset_feature':
      return {
        who,
        what: 'update_status',
        target: action.featureId,
        justification: `Lead engineer rule: reset feature — ${action.reason}`,
        risk: 'medium',
        statusTransition: { from: 'unknown', to: 'backlog' },
      };

    case 'unblock_feature':
      return {
        who,
        what: 'update_status',
        target: action.featureId,
        justification: 'Lead engineer rule: unblock feature',
        risk: 'low',
        statusTransition: { from: 'blocked', to: 'backlog' },
      };

    case 'enable_auto_merge':
      return {
        who,
        what: 'merge_pr',
        target: `PR #${action.prNumber}`,
        justification: 'Lead engineer rule: enable auto-merge on approved PR',
        risk: 'medium',
      };

    case 'stop_agent':
      return {
        who,
        what: 'assign_work',
        target: action.featureId,
        justification: 'Lead engineer rule: stop agent',
        risk: 'medium',
      };

    case 'abort_and_resume':
      return {
        who,
        what: 'assign_work',
        target: action.featureId,
        justification: `Supervisor: abort and resume — ${action.resumePrompt}`,
        risk: 'high',
      };

    case 'restart_auto_mode':
      return {
        who,
        what: 'assign_work',
        target: action.projectPath ?? session.projectPath,
        justification: 'Lead engineer rule: restart auto-mode',
        risk: 'medium',
      };

    case 'update_feature':
      return {
        who,
        what: 'update_status',
        target: action.featureId,
        justification: 'Lead engineer rule: update feature',
        risk: 'low',
      };

    case 'rollback_feature':
      return {
        who,
        what: 'update_status',
        target: action.featureId,
        justification: `Lead engineer rule: rollback feature — ${action.reason}`,
        risk: 'high',
        statusTransition: { from: 'unknown', to: 'blocked' },
      };

    // Informational / side-effect-free actions — no authority check needed
    case 'log':
    case 'post_discord':
    case 'escalate_llm':
    case 'resolve_threads':
    case 'resolve_threads_direct':
    case 'send_agent_message':
    case 'project_completing':
      return null;

    default:
      return null;
  }
}
