/**
 * Lead Engineer Fast-Path Rules
 *
 * Pure-function rules that fire synchronously in response to events.
 * No LLM calls, no service imports — just world-state + event → actions.
 */

import type { LeadFastPathRule, LeadRuleAction, LeadWorldState } from '@protolabsai/types';

// ────────────────────────── Helpers ──────────────────────────

/** Returns true if the feature was recently deployed (prMergedAt within last 24 hours). */
function isRecentlyDeployed(prMergedAt: string | undefined): boolean {
  if (!prMergedAt) return false;
  const mergedTime = new Date(prMergedAt).getTime();
  if (isNaN(mergedTime)) return false;
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  return Date.now() - mergedTime < twentyFourHoursMs;
}

// ────────────────────────── Rules ──────────────────────────

/**
 * rollbackTriggered — fast-path rule
 *
 * Fires when a health degradation signal is received and there are
 * recently-deployed features in DONE status. For each qualifying feature,
 * emits a rollback_feature action and a move_feature action to ESCALATE.
 *
 * Trigger events:
 * - health:issue-detected  (from HealthMonitorService)
 * - feature:health-degraded  (from FeatureHealthService or DORA metrics)
 */
export const rollbackTriggeredRule: LeadFastPathRule = {
  name: 'rollbackTriggered',
  description:
    'Rolls back recently-deployed features when a health degradation signal is detected. ' +
    'Moves the feature back to review and transitions Lead Engineer state to ESCALATE.',
  triggers: ['health:issue-detected', 'feature:health-degraded'],
  evaluate(
    worldState: LeadWorldState,
    _eventType: string,
    _eventPayload: unknown
  ): LeadRuleAction[] {
    const actions: LeadRuleAction[] = [];

    for (const [featureId, snapshot] of Object.entries(worldState.features)) {
      // Only target features that are DONE (deployed) with a recent merge
      if (snapshot.status !== 'done') continue;
      if (!isRecentlyDeployed(snapshot.prMergedAt)) continue;

      // Emit rollback action for this feature
      actions.push({
        type: 'rollback_feature',
        featureId,
        projectPath: worldState.projectPath,
        reason: 'Health degradation signal received after deploy',
      });

      // Update status reason before escalating
      actions.push({
        type: 'update_feature',
        featureId,
        updates: {
          statusChangeReason: 'Rollback triggered by health degradation signal',
        },
      });

      // Transition feature to ESCALATE so a human can review
      actions.push({
        type: 'move_feature',
        featureId,
        toStatus: 'blocked',
      });

      actions.push({
        type: 'log',
        level: 'warn',
        message: `rollbackTriggered: queued rollback for feature ${featureId} (recently deployed, health degraded)`,
      });
    }

    return actions;
  },
};

/**
 * All registered fast-path rules for the Lead Engineer.
 * Rules are evaluated in order; all matching rules fire.
 */
export const LEAD_ENGINEER_RULES: LeadFastPathRule[] = [rollbackTriggeredRule];
