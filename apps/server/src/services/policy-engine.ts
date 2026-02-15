/**
 * Policy engine — inlined from former @automaker/policy-engine package.
 *
 * Trust-based authorization: permission matrix, status transition guards,
 * and risk gating for agent actions.
 */

import type {
  EngineActionProposal,
  AgentTrustProfile,
  EnginePolicyConfig,
  EnginePolicyDecision,
  PermissionMatrix,
  PermissionMatrixEntry,
  StatusTransitionGuard,
  RiskLevel,
} from '@automaker/types';

// ---------------------------------------------------------------------------
// Risk level comparison
// ---------------------------------------------------------------------------

const RISK_LEVEL_ORDER = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
} as const;

function compareRiskLevels(
  a: keyof typeof RISK_LEVEL_ORDER,
  b: keyof typeof RISK_LEVEL_ORDER
): number {
  return RISK_LEVEL_ORDER[a] - RISK_LEVEL_ORDER[b];
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

export const DEFAULT_PERMISSION_MATRIX: PermissionMatrix = {
  CTO: {
    allowedActions: [
      'create_work',
      'assign',
      'change_scope',
      'block_release',
      'modify_architecture',
      'approve_work',
    ],
    maxRisk: 'critical',
  },
  PM: {
    allowedActions: ['create_work', 'change_scope'],
    maxRisk: 'medium',
  },
  ProjM: {
    allowedActions: ['create_work', 'assign'],
    maxRisk: 'medium',
  },
  EM: {
    allowedActions: ['assign', 'block_release'],
    maxRisk: 'high',
  },
  PE: {
    allowedActions: ['modify_architecture', 'approve_work', 'block_release'],
    maxRisk: 'high',
  },
};

export const DEFAULT_STATUS_TRANSITIONS: StatusTransitionGuard[] = [
  // Anyone can move to backlog
  {
    from: 'in_progress',
    to: 'backlog',
    allowedRoles: ['CTO', 'PM', 'ProjM', 'EM', 'PE'],
  },
  {
    from: 'review',
    to: 'backlog',
    allowedRoles: ['CTO', 'PM', 'ProjM', 'EM', 'PE'],
  },
  // Work assignment transitions
  {
    from: 'backlog',
    to: 'in_progress',
    allowedRoles: ['CTO', 'ProjM', 'EM'],
  },
  // Review transitions - need approval role
  {
    from: 'in_progress',
    to: 'review',
    allowedRoles: ['CTO', 'PE', 'EM'],
  },
  // Completion - need approval authority
  {
    from: 'review',
    to: 'done',
    allowedRoles: ['CTO', 'PE'],
    requiresApprovalAbove: 'medium',
  },
  // Blocking work
  {
    from: 'in_progress',
    to: 'blocked',
    allowedRoles: ['CTO', 'EM', 'PE'],
  },
  {
    from: 'review',
    to: 'blocked',
    allowedRoles: ['CTO', 'EM', 'PE'],
  },
  // Unblocking
  {
    from: 'blocked',
    to: 'in_progress',
    allowedRoles: ['CTO', 'EM', 'PE'],
  },

  // === Authority pipeline workItemState transitions ===

  // PM reviews ideas
  {
    from: 'idea',
    to: 'pm_review',
    allowedRoles: ['CTO', 'PM'],
  },
  // PM approves idea
  {
    from: 'pm_review',
    to: 'approved',
    allowedRoles: ['CTO', 'PM'],
  },
  // PM requests changes from CTO
  {
    from: 'pm_review',
    to: 'pm_changes_requested',
    allowedRoles: ['CTO', 'PM'],
  },
  // CTO resubmits after PM changes requested
  {
    from: 'pm_changes_requested',
    to: 'pm_review',
    allowedRoles: ['CTO', 'PM'],
  },
  // ProjM decomposes approved idea into tasks
  {
    from: 'approved',
    to: 'planned',
    allowedRoles: ['CTO', 'ProjM'],
  },
  // ProjM marks planned work as ready for execution
  {
    from: 'planned',
    to: 'ready',
    allowedRoles: ['CTO', 'ProjM'],
  },
  // EM assigns ready work to engineers
  {
    from: 'ready',
    to: 'in_progress',
    allowedRoles: ['CTO', 'EM'],
  },
];

export const DEFAULT_POLICY_CONFIG: EnginePolicyConfig = {
  permissionMatrix: DEFAULT_PERMISSION_MATRIX,
  statusTransitions: DEFAULT_STATUS_TRANSITIONS,
  strictRiskGating: true,
};

// ---------------------------------------------------------------------------
// Policy check helpers
// ---------------------------------------------------------------------------

function checkPermission(
  trustProfile: AgentTrustProfile,
  proposal: EngineActionProposal,
  config: EnginePolicyConfig
): { hasPermission: boolean; permissionEntry?: PermissionMatrixEntry } {
  const permissionEntry = config.permissionMatrix[trustProfile.role];
  if (!permissionEntry) {
    return { hasPermission: false };
  }

  if (trustProfile.customPermissions?.[proposal.action] !== undefined) {
    return {
      hasPermission: trustProfile.customPermissions[proposal.action] ?? false,
      permissionEntry,
    };
  }

  const hasPermission = permissionEntry.allowedActions.includes(proposal.action);
  return { hasPermission, permissionEntry };
}

function checkStatusTransition(
  trustProfile: AgentTrustProfile,
  proposal: EngineActionProposal,
  config: EnginePolicyConfig
): { allowed: boolean; guard?: StatusTransitionGuard } {
  if (!proposal.currentStatus || !proposal.targetStatus) {
    return { allowed: true };
  }

  if (!config.statusTransitions || config.statusTransitions.length === 0) {
    return { allowed: true };
  }

  const guard = config.statusTransitions.find(
    (g) => g.from === proposal.currentStatus && g.to === proposal.targetStatus
  );

  if (!guard) {
    return { allowed: false };
  }

  const allowed = guard.allowedRoles.includes(trustProfile.role);
  return { allowed, guard };
}

function checkRiskGating(
  trustProfile: AgentTrustProfile,
  proposal: EngineActionProposal,
  permissionEntry: PermissionMatrixEntry,
  guard: StatusTransitionGuard | undefined
): {
  gateTriggered: boolean;
  reason?: string;
  details: {
    agentMaxRisk: RiskLevel;
    actionRisk: RiskLevel;
    permissionRiskLimit?: RiskLevel;
  };
} {
  const details = {
    agentMaxRisk: trustProfile.maxRiskLevel,
    actionRisk: proposal.actionRisk,
    permissionRiskLimit: permissionEntry.actionRiskLimits?.[proposal.action],
  };

  if (compareRiskLevels(proposal.actionRisk, trustProfile.maxRiskLevel) > 0) {
    return {
      gateTriggered: true,
      reason: `Action risk (${proposal.actionRisk}) exceeds agent max risk (${trustProfile.maxRiskLevel})`,
      details,
    };
  }

  if (details.permissionRiskLimit) {
    if (compareRiskLevels(proposal.actionRisk, details.permissionRiskLimit) > 0) {
      return {
        gateTriggered: true,
        reason: `Action risk (${proposal.actionRisk}) exceeds permission risk limit (${details.permissionRiskLimit})`,
        details,
      };
    }
  }

  if (guard?.requiresApprovalAbove) {
    if (compareRiskLevels(proposal.actionRisk, guard.requiresApprovalAbove) > 0) {
      return {
        gateTriggered: true,
        reason: `Action risk (${proposal.actionRisk}) requires approval above ${guard.requiresApprovalAbove}`,
        details,
      };
    }
  }

  return {
    gateTriggered: false,
    details,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Evaluate an action proposal against policy configuration:
 * 1. Permission matrix (does role have permission for action?)
 * 2. Status transition guards (is transition allowed?)
 * 3. Risk gating (does action risk exceed agent's limits?)
 */
export function checkPolicy(
  proposal: EngineActionProposal,
  trustProfile: AgentTrustProfile,
  config: EnginePolicyConfig
): EnginePolicyDecision {
  const { hasPermission, permissionEntry } = checkPermission(trustProfile, proposal, config);

  if (!hasPermission) {
    return {
      decision: 'deny',
      reason: `Role ${trustProfile.role} does not have permission for action ${proposal.action}`,
      hasPermission: false,
      transitionAllowed: true,
      riskGateTriggered: false,
    };
  }

  const { allowed: transitionAllowed, guard } = checkStatusTransition(
    trustProfile,
    proposal,
    config
  );

  if (!transitionAllowed) {
    return {
      decision: 'deny',
      reason: `Role ${trustProfile.role} cannot transition from ${proposal.currentStatus} to ${proposal.targetStatus}`,
      hasPermission: true,
      transitionAllowed: false,
      riskGateTriggered: false,
    };
  }

  const riskCheck = checkRiskGating(trustProfile, proposal, permissionEntry!, guard);

  if (riskCheck.gateTriggered) {
    return {
      decision: 'require_approval',
      reason: riskCheck.reason!,
      hasPermission: true,
      transitionAllowed: true,
      riskGateTriggered: true,
      details: riskCheck.details,
    };
  }

  return {
    decision: 'allow',
    reason: 'All policy checks passed',
    hasPermission: true,
    transitionAllowed: true,
    riskGateTriggered: false,
    details: riskCheck.details,
  };
}
