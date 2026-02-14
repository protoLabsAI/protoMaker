/**
 * Assess Risks Node
 *
 * Identifies and scores project risks from gathered metrics.
 * Uses heuristic rules for deterministic risk identification.
 *
 * Risk categories:
 * - technical: Code quality, build failures, agent errors
 * - resource: Memory, cost, agent capacity
 * - dependency: Blocking chains, unsatisfied deps
 * - timeline: Velocity trends, stale features
 * - quality: PR conflicts, review backlog
 */

import type { ProjectStatusState, RiskFactor } from '../types.js';

let riskIdCounter = 0;

function createRisk(
  category: RiskFactor['category'],
  severity: RiskFactor['severity'],
  description: string,
  mitigation?: string,
  affectedFeatures?: string[]
): RiskFactor {
  return {
    id: `risk-${++riskIdCounter}`,
    category,
    severity,
    description,
    mitigation,
    affectedFeatures,
  };
}

/**
 * Assess risks node — deterministic heuristic analysis
 */
export async function assessRisks(state: ProjectStatusState): Promise<Partial<ProjectStatusState>> {
  if (state.error) return {};

  const risks: RiskFactor[] = [];
  riskIdCounter = 0;

  // ─── Resource Risks ────────────────────────────────────────────────────

  if (state.agentMetrics) {
    if (state.agentMetrics.totalCostUsd > 20) {
      risks.push(
        createRisk(
          'resource',
          'medium',
          `Total agent cost is $${state.agentMetrics.totalCostUsd.toFixed(2)} — approaching budget threshold`,
          'Consider using Haiku for simpler features to reduce costs'
        )
      );
    }

    if (state.agentMetrics.failureRate > 0.2) {
      risks.push(
        createRisk(
          'technical',
          'high',
          `Agent failure rate at ${(state.agentMetrics.failureRate * 100).toFixed(0)}% — wasting compute`,
          'Review failed agent outputs, improve prompts or escalate model tier'
        )
      );
    }
  }

  // ─── Dependency Risks ──────────────────────────────────────────────────

  if (state.dependencyMetrics) {
    const chains = state.dependencyMetrics.blockingChains;
    if (chains.length > 0) {
      for (const chain of chains) {
        risks.push(
          createRisk(
            'dependency',
            chain.blockedBy.length > 2 ? 'high' : 'medium',
            `Feature "${chain.blocked}" is blocked by ${chain.blockedBy.length} dependencies`,
            'Prioritize dependency features or consider removing unnecessary dependencies',
            [chain.blocked, ...chain.blockedBy]
          )
        );
      }
    }

    const unsatisfied =
      state.dependencyMetrics.totalDependencies - state.dependencyMetrics.satisfiedDependencies;
    if (unsatisfied > state.dependencyMetrics.totalDependencies * 0.5) {
      risks.push(
        createRisk(
          'dependency',
          'high',
          `More than half of dependencies are unsatisfied (${unsatisfied}/${state.dependencyMetrics.totalDependencies})`,
          'Review dependency graph for correctness, consider parallelizing independent features'
        )
      );
    }
  }

  // ─── Timeline Risks ────────────────────────────────────────────────────

  if (state.boardMetrics) {
    if (state.boardMetrics.staleFeatures.length >= 3) {
      risks.push(
        createRisk(
          'timeline',
          'high',
          `${state.boardMetrics.staleFeatures.length} stale features — work is stalling`,
          'Check for blocked agents, consider restarting or reassigning',
          state.boardMetrics.staleFeatures
        )
      );
    }

    if (state.boardMetrics.completionPercentage < 30 && state.boardMetrics.totalFeatures > 10) {
      risks.push(
        createRisk(
          'timeline',
          'medium',
          `Only ${state.boardMetrics.completionPercentage}% complete with ${state.boardMetrics.totalFeatures} features`,
          'Consider scope reduction or increasing concurrency'
        )
      );
    }
  }

  // ─── Quality Risks ─────────────────────────────────────────────────────

  if (state.prMetrics) {
    if (state.prMetrics.conflicting > 2) {
      risks.push(
        createRisk(
          'quality',
          'high',
          `${state.prMetrics.conflicting} PRs have merge conflicts — merge pipeline is jammed`,
          'Rebase conflicting PRs in dependency order, merge oldest first'
        )
      );
    }

    if (state.prMetrics.pendingReview > 5) {
      risks.push(
        createRisk(
          'quality',
          'medium',
          `${state.prMetrics.pendingReview} PRs pending review — review backlog growing`,
          'Enable auto-merge for PRs that pass CI checks'
        )
      );
    }
  }

  return { risks };
}
