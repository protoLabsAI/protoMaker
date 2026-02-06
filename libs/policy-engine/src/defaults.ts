/**
 * Default policy configuration
 */

import type { PermissionMatrix, StatusTransitionGuard, EnginePolicyConfig } from '@automaker/types';

/**
 * Default permission matrix defining role capabilities
 *
 * - CTO: Full access, all actions, all risk levels
 * - PM (Product Manager): Can create work and change scope, but not assign or block releases
 * - ProjM (Project Manager): Can create work and assign, but not change scope
 * - EM (Engineering Manager): Can assign and block releases for quality, but not create work
 * - PE (Principal Engineer): Can modify architecture, approve work, and block releases
 */
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

/**
 * Default status transition guards
 */
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

/**
 * Default policy configuration
 */
export const DEFAULT_POLICY_CONFIG: EnginePolicyConfig = {
  permissionMatrix: DEFAULT_PERMISSION_MATRIX,
  statusTransitions: DEFAULT_STATUS_TRANSITIONS,
  strictRiskGating: true,
};

/**
 * Risk level ordering for comparison
 */
export const RISK_LEVEL_ORDER = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
} as const;

/**
 * Compare two risk levels
 * @returns positive if a > b, negative if a < b, 0 if equal
 */
export function compareRiskLevels(
  a: keyof typeof RISK_LEVEL_ORDER,
  b: keyof typeof RISK_LEVEL_ORDER
): number {
  return RISK_LEVEL_ORDER[a] - RISK_LEVEL_ORDER[b];
}
