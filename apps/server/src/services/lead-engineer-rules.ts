/**
 * Lead Engineer fast-path rules
 *
 * Pure functions only. No service imports. Only types.
 * Each rule evaluates a WorldState + event and returns zero or more actions.
 */

import type {
  LeadWorldState,
  LeadRuleAction,
  LeadFastPathRule,
  LeadFeatureSnapshot,
} from '@protolabsai/types';

// ────────────────────────── Thresholds ──────────────────────────

const ORPHANED_IN_PROGRESS_MS = 4 * 60 * 60 * 1000; // 4 hours
const STUCK_AGENT_MS = 2 * 60 * 60 * 1000; // 2 hours
const STALE_REVIEW_MS = 30 * 60 * 1000; // 30 minutes
const REMEDIATION_STALL_MS = 60 * 60 * 1000; // 1 hour

// ────────────────────────── Helper ──────────────────────────

function featureFromPayload(
  worldState: LeadWorldState,
  payload: unknown
): LeadFeatureSnapshot | undefined {
  const p = payload as Record<string, unknown> | null;
  const id = p?.featureId as string | undefined;
  if (!id) return undefined;
  return worldState.features[id];
}

// ────────────────────────── Rules ──────────────────────────

/**
 * mergedNotDone — Features in review with a merged PR should be moved to done.
 * Absorbed from: board-janitor
 */
export const mergedNotDone: LeadFastPathRule = {
  name: 'mergedNotDone',
  description: 'Feature in review with merged PR → move to done',
  triggers: ['feature:pr-merged', 'feature:status-changed'],

  evaluate(worldState, _eventType, payload): LeadRuleAction[] {
    const feature = featureFromPayload(worldState, payload);
    if (!feature) return [];
    if (feature.status === 'review' && feature.prMergedAt) {
      return [{ type: 'move_feature', featureId: feature.id, toStatus: 'done' }];
    }
    return [];
  },
};

/**
 * orphanedInProgress — In-progress >4h with no running agent → reset to backlog.
 * Absorbed from: board-janitor
 */
export const orphanedInProgress: LeadFastPathRule = {
  name: 'orphanedInProgress',
  description: 'In-progress >4h with no running agent → reset to backlog',
  triggers: ['feature:error', 'feature:stopped', 'lead-engineer:rule-evaluated'],

  evaluate(worldState, _eventType, payload): LeadRuleAction[] {
    const actions: LeadRuleAction[] = [];
    const now = Date.now();
    const runningFeatureIds = new Set(worldState.agents.map((a) => a.featureId));

    // If triggered by a specific feature event, check just that feature
    const feature = featureFromPayload(worldState, payload);
    const candidates = feature ? [feature] : Object.values(worldState.features);

    for (const f of candidates) {
      if (f.status !== 'in_progress') continue;
      if (runningFeatureIds.has(f.id)) continue;
      if (!f.startedAt) continue;

      const age = now - new Date(f.startedAt).getTime();
      if (age > ORPHANED_IN_PROGRESS_MS) {
        const hours = Math.round(age / (60 * 60 * 1000));

        // Features with repeated failures get blocked instead of reset
        // to prevent infinite retry loops
        if (f.failureCount && f.failureCount >= 3) {
          actions.push({
            type: 'move_feature',
            featureId: f.id,
            toStatus: 'blocked',
          });
          actions.push({
            type: 'log',
            level: 'warn',
            message: `orphanedInProgress: ${f.id} blocked after ${f.failureCount} failures (orphaned ${hours}h)`,
          });
        } else {
          actions.push({
            type: 'reset_feature',
            featureId: f.id,
            reason: `Orphaned in-progress for ${hours}h with no running agent`,
          });
        }
      }
    }
    return actions;
  },
};

/**
 * staleDeps — Blocked feature with all deps done → unblock (move to backlog).
 * Absorbed from: board-janitor
 */
export const staleDeps: LeadFastPathRule = {
  name: 'staleDeps',
  description: 'Blocked + all deps done → unblock',
  triggers: ['feature:status-changed'],

  evaluate(worldState, _eventType, payload): LeadRuleAction[] {
    const actions: LeadRuleAction[] = [];

    // When a feature status changes (e.g., dep moves to 'done'), check ALL blocked
    // features — not just the payload feature. The payload is the feature that changed,
    // which is typically the dependency, not the dependent.
    const changedFeature = featureFromPayload(worldState, payload);
    const changedId = changedFeature?.id;

    const candidates = Object.values(worldState.features).filter(
      (f) => f.status === 'blocked' && f.dependencies && f.dependencies.length > 0
    );

    for (const feature of candidates) {
      // If we know which feature changed, only check features that depend on it
      if (changedId && !feature.dependencies!.includes(changedId)) continue;

      const allDepsDone = feature.dependencies!.every((depId) => {
        const dep = worldState.features[depId];
        if (!dep) return false;
        // Foundation deps require done (merged) — 'review' is NOT sufficient
        if (dep.isFoundation) {
          return dep.status === 'done' || dep.status === 'completed' || dep.status === 'verified';
        }
        // Non-foundation deps: 'review' is sufficient to unblock
        return (
          dep.status === 'done' ||
          dep.status === 'completed' ||
          dep.status === 'verified' ||
          dep.status === 'review'
        );
      });

      if (allDepsDone) {
        actions.push({ type: 'unblock_feature', featureId: feature.id });
      }
    }
    return actions;
  },
};

/**
 * autoModeHealth — Backlog >0 + auto-mode not running → restart auto-mode.
 * Absorbed from: ava-check
 */
export const autoModeHealth: LeadFastPathRule = {
  name: 'autoModeHealth',
  description: 'Backlog >0 + auto-mode not running → restart auto-mode',
  triggers: ['auto-mode:stopped', 'auto-mode:idle'],

  evaluate(worldState): LeadRuleAction[] {
    const backlogCount = worldState.boardCounts['backlog'] || 0;
    if (backlogCount > 0 && !worldState.autoModeRunning) {
      return [
        {
          type: 'restart_auto_mode',
          projectPath: worldState.projectPath,
          maxConcurrency: worldState.maxConcurrency,
        },
      ];
    }
    return [];
  },
};

/**
 * staleReview — In review >30min with no auto-merge → enable auto-merge.
 * Absorbed from: pr-maintainer
 */
export const staleReview: LeadFastPathRule = {
  name: 'staleReview',
  description: 'In review >30min + no auto-merge → enable auto-merge',
  triggers: ['feature:status-changed', 'lead-engineer:rule-evaluated'],

  evaluate(worldState, _eventType, payload): LeadRuleAction[] {
    const actions: LeadRuleAction[] = [];
    const now = Date.now();

    const feature = featureFromPayload(worldState, payload);
    const candidates = feature ? [feature] : Object.values(worldState.features);

    for (const f of candidates) {
      if (f.status !== 'review') continue;
      if (!f.prNumber) continue;

      // Check if PR already has auto-merge
      const pr = worldState.openPRs.find((p) => p.featureId === f.id);
      if (pr?.autoMergeEnabled) continue;

      // Check age
      const reviewStart = f.prCreatedAt;
      if (!reviewStart) continue;
      const age = now - new Date(reviewStart).getTime();
      if (age > STALE_REVIEW_MS) {
        actions.push({
          type: 'enable_auto_merge',
          featureId: f.id,
          prNumber: f.prNumber,
        });
      }
    }
    return actions;
  },
};

/**
 * stuckAgent — Agent running >2h → send "wrap up" message.
 * Absorbed from: ava-check
 */
export const stuckAgent: LeadFastPathRule = {
  name: 'stuckAgent',
  description: 'Agent running >2h → abort and resume with wrap-up guidance',
  triggers: ['lead-engineer:rule-evaluated'],

  evaluate(worldState): LeadRuleAction[] {
    const actions: LeadRuleAction[] = [];
    const now = Date.now();

    for (const agent of worldState.agents) {
      const age = now - new Date(agent.startTime).getTime();
      if (age > STUCK_AGENT_MS) {
        const hours = Math.round((age / (60 * 60 * 1000)) * 10) / 10;
        actions.push({
          type: 'abort_and_resume',
          featureId: agent.featureId,
          resumePrompt: `You were running for ${hours}h and were stopped by the supervisor. Please wrap up your current work efficiently: commit changes, create a PR, and finish. If you are stuck, try a simpler approach.`,
        });
      }
    }
    return actions;
  },
};

/**
 * capacityRestart — Feature completed + agents < max + backlog > 0 + auto-mode stopped → restart.
 * Absorbed from: ava-check
 */
export const capacityRestart: LeadFastPathRule = {
  name: 'capacityRestart',
  description: 'Agents < max + backlog > 0 + auto-mode stopped → restart',
  triggers: ['feature:completed', 'feature:pr-merged'],

  evaluate(worldState): LeadRuleAction[] {
    const backlogCount = worldState.boardCounts['backlog'] || 0;
    if (
      backlogCount > 0 &&
      !worldState.autoModeRunning &&
      worldState.agents.length < worldState.maxConcurrency
    ) {
      return [
        {
          type: 'restart_auto_mode',
          projectPath: worldState.projectPath,
          maxConcurrency: worldState.maxConcurrency,
        },
      ];
    }
    return [];
  },
};

/**
 * projectCompleting — All features done → transition to completing state.
 */
export const projectCompleting: LeadFastPathRule = {
  name: 'projectCompleting',
  description: 'All features done → trigger project completion',
  triggers: ['project:completed'],

  evaluate(worldState): LeadRuleAction[] {
    const total = worldState.metrics.totalFeatures;
    const completed = worldState.metrics.completedFeatures;
    if (total > 0 && completed >= total) {
      return [{ type: 'project_completing' }];
    }
    return [];
  },
};

/**
 * prApproved — PR approved → enable auto-merge + resolve threads directly.
 */
export const prApproved: LeadFastPathRule = {
  name: 'prApproved',
  description: 'PR approved → enable auto-merge + resolve unresolved threads',
  triggers: ['pr:approved', 'github:pr:approved'],

  evaluate(worldState, _eventType, payload): LeadRuleAction[] {
    const actions: LeadRuleAction[] = [];
    const feature = featureFromPayload(worldState, payload);
    if (!feature) return [];
    if (!feature.prNumber) return [];

    const pr = worldState.openPRs.find((p) => p.featureId === feature.id);

    // Enable auto-merge if not already enabled
    if (!pr?.autoMergeEnabled) {
      actions.push({
        type: 'enable_auto_merge',
        featureId: feature.id,
        prNumber: feature.prNumber,
      });
    }

    // Resolve threads directly if any are unresolved
    if (pr && (pr.unresolvedThreads ?? 0) > 0) {
      actions.push({
        type: 'resolve_threads_direct',
        featureId: feature.id,
        prNumber: feature.prNumber,
      });
    }

    return actions;
  },
};

/**
 * threadsBlocking — Merge blocked by critical threads → resolve directly.
 */
export const threadsBlocking: LeadFastPathRule = {
  name: 'threadsBlocking',
  description: 'Merge blocked by critical threads → resolve directly',
  triggers: ['pr:merge-blocked-critical-threads'],

  evaluate(worldState, _eventType, payload): LeadRuleAction[] {
    const feature = featureFromPayload(worldState, payload);
    if (!feature) return [];
    if (!feature.prNumber) return [];

    return [
      {
        type: 'resolve_threads_direct',
        featureId: feature.id,
        prNumber: feature.prNumber,
      },
    ];
  },
};

/**
 * remediationStalled — Feature remediating >1h → reset to backlog for retry.
 */
export const remediationStalled: LeadFastPathRule = {
  name: 'remediationStalled',
  description: 'Remediation in-progress >1h → reset to backlog',
  triggers: ['lead-engineer:rule-evaluated'],

  evaluate(worldState): LeadRuleAction[] {
    const actions: LeadRuleAction[] = [];
    const now = Date.now();

    for (const pr of worldState.openPRs) {
      if (!pr.isRemediating) continue;

      const feature = worldState.features[pr.featureId];
      if (!feature) continue;

      // Use feature startedAt or PR creation time as proxy for remediation start
      const startTime = feature.startedAt || pr.prCreatedAt;
      if (!startTime) continue;

      const age = now - new Date(startTime).getTime();
      if (age > REMEDIATION_STALL_MS) {
        actions.push({
          type: 'reset_feature',
          featureId: pr.featureId,
          reason: `PR remediation stalled for >${Math.round(age / (60 * 60 * 1000))}h`,
        });
      }
    }

    return actions;
  },
};

/**
 * classifiedRecovery — Escalated feature with retryable failure → auto-retry.
 * Uses FailureClassifier analysis from the escalation event payload.
 */
export const classifiedRecovery: LeadFastPathRule = {
  name: 'classifiedRecovery',
  description: 'Escalated feature with retryable failure → auto-retry',
  triggers: ['escalation:signal-received'],

  evaluate(worldState, _eventType, payload): LeadRuleAction[] {
    const event = payload as Record<string, unknown> | null;
    if (!event) return [];

    // Only handle feature_escalated events from the state machine
    if (event.type !== 'feature_escalated') return [];

    const inner = event.context as Record<string, unknown> | undefined;
    if (!inner) return [];

    const featureId = inner.featureId as string | undefined;
    if (!featureId) return [];

    // Verify feature exists in world state
    const feature = worldState.features[featureId];
    if (!feature) return [];

    const failureAnalysis = inner.failureAnalysis as
      | {
          category: string;
          isRetryable: boolean;
          suggestedDelay: number;
          maxRetries: number;
          explanation: string;
          confidence: number;
        }
      | undefined;

    if (!failureAnalysis) return [];

    const retryCount = (inner.retryCount as number) || 0;

    // Auto-retry if: retryable + under max retries + high confidence
    if (
      failureAnalysis.isRetryable &&
      retryCount < failureAnalysis.maxRetries &&
      failureAnalysis.confidence >= 0.7
    ) {
      return [
        {
          type: 'reset_feature',
          featureId,
          reason: `Auto-retry: ${failureAnalysis.category} — ${failureAnalysis.explanation} (retry ${retryCount + 1}/${failureAnalysis.maxRetries})`,
        },
      ];
    }

    // Non-retryable or max retries exceeded — leave blocked
    return [];
  },
};

/**
 * hitlFormResponse — Handle lead_engineer HITL form responses.
 * Routes retry/provide_context/skip/close responses to the appropriate actions.
 */
export const hitlFormResponse: LeadFastPathRule = {
  name: 'hitlFormResponse',
  description: 'HITL form response from lead_engineer caller → retry/provide_context/skip/close',
  triggers: ['lead-engineer:hitl-response'],

  evaluate(worldState, _eventType, payload): LeadRuleAction[] {
    const event = payload as Record<string, unknown> | null;
    if (!event) return [];

    const featureId = event.featureId as string | undefined;
    if (!featureId) return [];

    const feature = worldState.features[featureId];
    if (!feature) return [];

    const response = event.response as Record<string, unknown>[] | undefined;
    if (!response?.length) return [];

    const step0 = response[0];
    const action = step0.resolution as string | undefined;
    if (!action) return [];

    const ruleActions: LeadRuleAction[] = [];

    switch (action) {
      case 'retry': {
        ruleActions.push({
          type: 'update_feature',
          featureId,
          updates: {
            failureCount: 0,
            statusChangeReason: 'Retried via HITL form',
          },
        });
        ruleActions.push({ type: 'move_feature', featureId, toStatus: 'backlog' });
        break;
      }

      case 'provide_context': {
        // Context input is in step 2 (response[1]), not step 1
        const step1 = response[1] as Record<string, unknown> | undefined;
        const context = (step1?.context as string | undefined)?.trim();
        ruleActions.push({
          type: 'update_feature',
          featureId,
          updates: {
            failureCount: 0,
            statusChangeReason: context
              ? `Retried with additional context via HITL form: ${context}`
              : 'Retried with additional context via HITL form',
          },
        });
        ruleActions.push({ type: 'move_feature', featureId, toStatus: 'backlog' });
        break;
      }

      case 'skip': {
        ruleActions.push({
          type: 'update_feature',
          featureId,
          updates: { statusChangeReason: 'Skipped via HITL form' },
        });
        ruleActions.push({ type: 'move_feature', featureId, toStatus: 'done' });
        break;
      }

      case 'close': {
        ruleActions.push({
          type: 'update_feature',
          featureId,
          updates: { awaitingGatePhase: null },
        });
        break;
      }

      default:
        break;
    }

    return ruleActions;
  },
};

/**
 * rollbackTriggered — Feature in DONE/DEPLOY with health degradation signal → escalate.
 * Fires when the health monitor or DORA metrics emits a degradation signal for a
 * recently-deployed feature. Calls rollback logic and transitions feature to ESCALATE.
 */
export const rollbackTriggered: LeadFastPathRule = {
  name: 'rollbackTriggered',
  description:
    'Feature in done/deploy with health degradation signal → move to escalate for rollback',
  triggers: ['feature:health-degraded', 'health:signal'],

  evaluate(worldState, _eventType, payload): LeadRuleAction[] {
    const event = payload as Record<string, unknown> | null;
    if (!event) return [];

    const featureId = event.featureId as string | undefined;
    if (!featureId) return [];

    const feature = worldState.features[featureId];
    if (!feature) return [];

    // Only trigger for features that have been deployed (done or deploy status)
    if (feature.status !== 'done' && feature.status !== 'deploy') return [];

    // Feature must have a merged PR to be rollbackable
    if (!feature.prMergedAt || !feature.prNumber) return [];

    return [
      {
        type: 'update_feature',
        featureId,
        updates: {
          statusChangeReason: `Health degradation detected after deploy — rollback triggered for PR #${feature.prNumber}`,
        },
      },
      {
        type: 'move_feature',
        featureId,
        toStatus: 'blocked',
      },
      {
        type: 'log',
        level: 'warn',
        message: `rollbackTriggered: feature ${featureId} (PR #${feature.prNumber}) escalated due to health degradation signal`,
      },
      {
        type: 'escalate_llm',
        reason: `Health degradation detected for deployed feature ${featureId} (PR #${feature.prNumber}). Rollback required.`,
        context: { featureId, prNumber: feature.prNumber, prMergedAt: feature.prMergedAt },
      },
    ];
  },
};

/**
 * missingCIChecks — PR waiting >30min for required CI checks that have never registered.
 * Surfaces a diagnostic warning with the missing check names and a suggested cause
 * (e.g., a CI workflow configured to only trigger on PRs targeting a different base branch).
 */
export const missingCIChecks: LeadFastPathRule = {
  name: 'missingCIChecks',
  description:
    'PR waiting >30min for required CI checks that never registered → log diagnostic warning',
  triggers: ['pr:missing-ci-checks'],

  evaluate(_worldState, _eventType, payload): LeadRuleAction[] {
    const event = payload as Record<string, unknown> | null;
    if (!event) return [];

    const featureId = event.featureId as string | undefined;
    const prNumber = event.prNumber as number | undefined;
    const baseBranch = event.baseBranch as string | undefined;
    const missingChecks = event.missingChecks as string[] | undefined;
    const waitingMinutes = event.waitingMinutes as number | undefined;
    const possibleCause = event.possibleCause as string | undefined;

    if (!featureId || !prNumber || !missingChecks?.length) return [];

    return [
      {
        type: 'log',
        level: 'warn',
        message:
          `PR #${prNumber} (feature ${featureId}) has been waiting ${waitingMinutes ?? '?'} min — ` +
          `required CI checks have never registered: [${missingChecks.join(', ')}]. ` +
          `Base branch: ${baseBranch ?? 'unknown'}. ` +
          `Possible cause: ${possibleCause ?? 'CI workflow may target a different branch'}`,
      },
    ];
  },
};

// ────────────────────────── Error Budget Rule ──────────────────────────

/**
 * errorBudgetExhausted — Error budget exhausted: log warning to surface condition.
 *
 * Fires when `worldState.errorBudgetExhausted` is true.
 * Emits a warn log so the condition is visible in server logs and the rule log.
 * The actual pickup restriction (only bug-fix features) is enforced by
 * FeatureScheduler reading errorBudgetExhausted from world state.
 */
export const errorBudgetExhausted: LeadFastPathRule = {
  name: 'errorBudgetExhausted',
  description:
    'Error budget exhausted — log warning (scheduler restricts pickup to bug-fix features)',
  triggers: [
    'feature:pr-merged',
    'pr:ci-failure',
    'pr:remediation-started',
    'lead-engineer:rule-evaluated',
  ],

  evaluate(worldState): LeadRuleAction[] {
    if (!worldState.errorBudgetExhausted) return [];

    return [
      {
        type: 'log',
        level: 'warn',
        message:
          'errorBudgetExhausted: change fail rate exceeds threshold — ' +
          'auto-mode restricted to bug-fix features until the budget recovers',
      },
    ];
  },
};

// ────────────────────────── Review Queue Monitor ──────────────────────────

/** Default maximum PRs allowed in review state before pausing pickup */
const DEFAULT_MAX_PENDING_REVIEWS = 5;

/**
 * ReviewQueueMonitor — tracks review queue depth over time.
 *
 * Records a timestamped sample each time the queue depth is checked.
 * Exposes helpers for determining whether the queue is saturated.
 */
export class ReviewQueueMonitor {
  /** Chronological history of review queue depth samples */
  readonly history: Array<{ timestamp: number; depth: number }> = [];

  /** Maximum number of historical samples to keep */
  private readonly maxHistory: number;

  constructor(maxHistory = 100) {
    this.maxHistory = maxHistory;
  }

  /**
   * Record the current review queue depth.
   * @param depth Number of features currently in review state
   */
  record(depth: number): void {
    this.history.push({ timestamp: Date.now(), depth });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * Return the most recently recorded depth, or 0 if no samples.
   */
  currentDepth(): number {
    return this.history.length > 0 ? this.history[this.history.length - 1].depth : 0;
  }

  /**
   * Return true if the current depth meets or exceeds the threshold.
   */
  isSaturated(threshold: number): boolean {
    return this.currentDepth() >= threshold;
  }
}

/**
 * reviewQueueSaturated — Pause auto-mode feature pickup when the review queue is full.
 *
 * Fires when the number of features in 'review' state meets or exceeds
 * `maxPendingReviews` (from WorkflowSettings, default 5). Emits a log action
 * to surface the condition. The actual pickup pause is enforced in FeatureScheduler
 * by checking the review queue depth before starting new features.
 */
export const reviewQueueSaturated: LeadFastPathRule = {
  name: 'reviewQueueSaturated',
  description:
    'Review queue depth >= maxPendingReviews → log saturation (pickup paused by scheduler)',
  triggers: ['feature:status-changed', 'feature:pr-merged', 'lead-engineer:rule-evaluated'],

  evaluate(worldState, _eventType, _payload): LeadRuleAction[] {
    const reviewCount = Object.values(worldState.features).filter(
      (f) => f.status === 'review'
    ).length;

    const threshold =
      (worldState as LeadWorldState & { maxPendingReviews?: number }).maxPendingReviews ??
      DEFAULT_MAX_PENDING_REVIEWS;

    if (reviewCount >= threshold) {
      return [
        {
          type: 'log',
          level: 'warn',
          message: `reviewQueueSaturated: ${reviewCount}/${threshold} PRs in review — auto-mode feature pickup paused until queue drains`,
        },
      ];
    }

    return [];
  },
};

// ────────────────────────── Exports ──────────────────────────

/** Default set of fast-path rules */
export const DEFAULT_RULES: LeadFastPathRule[] = [
  mergedNotDone,
  orphanedInProgress,
  staleDeps,
  autoModeHealth,
  staleReview,
  stuckAgent,
  capacityRestart,
  projectCompleting,
  prApproved,
  threadsBlocking,
  remediationStalled,
  classifiedRecovery,
  hitlFormResponse,
  missingCIChecks,
  rollbackTriggered,
  reviewQueueSaturated,
  errorBudgetExhausted,
];

/**
 * Evaluate all applicable rules for an event.
 * Returns the union of all actions from matching rules.
 */
export function evaluateRules(
  rules: LeadFastPathRule[],
  worldState: LeadWorldState,
  eventType: string,
  eventPayload: unknown
): LeadRuleAction[] {
  const actions: LeadRuleAction[] = [];
  for (const rule of rules) {
    if (!rule.triggers.includes(eventType)) continue;
    const ruleActions = rule.evaluate(worldState, eventType, eventPayload);
    actions.push(...ruleActions);
  }
  return actions;
}
