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
          await this.deps.featureLoader.update(session.projectPath, action.featureId, {
            status: 'backlog',
          });
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
          await execAsync(`gh pr merge ${action.prNumber} --auto --squash`, {
            cwd: session.projectPath,
            timeout: 30000,
          });
          const pr = session.worldState.openPRs.find((p) => p.featureId === action.featureId);
          if (pr) pr.autoMergeEnabled = true;
          logger.info(`Enabled auto-merge on PR #${action.prNumber}`);
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
          await this.deps.autoModeService.startAutoLoopForProject(
            action.projectPath,
            null,
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

    for (const action of allActions) {
      this.executeAction(session, action).catch((err) => {
        logger.error(`Action execution failed (${action.type}):`, err);
      });
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
