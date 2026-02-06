/**
 * Policy and Trust Types - Authorization and decision-making for Automaker agents
 *
 * This file contains TWO layers of types:
 * 1. Policy Engine Types - Used by @automaker/policy-engine for checkPolicy() evaluation
 * 2. Authority System Types - Used by the authority service for organizational workflows
 *
 * The engine types are optimized for fast policy checks (short role codes, indexed permission matrix).
 * The authority types are optimized for organizational clarity (full role names, approval workflows).
 */

// ============================================================================
// POLICY ENGINE TYPES
// Used by @automaker/policy-engine checkPolicy() function
// ============================================================================

/**
 * AgentRoleName - Short role codes for policy engine permission matrix
 * Maps to AuthorityRole: CTO=cto, PM=product-manager, ProjM=project-manager, etc.
 */
export type AgentRoleName = 'CTO' | 'PM' | 'ProjM' | 'EM' | 'PE';

/**
 * PolicyAction - Actions evaluated by the policy engine
 */
export type PolicyAction =
  | 'create_work'
  | 'assign'
  | 'change_scope'
  | 'block_release'
  | 'modify_architecture'
  | 'approve_work';

/**
 * PolicyDecisionType - Outcome types from policy engine evaluation
 */
export type PolicyDecisionType = 'allow' | 'deny' | 'require_approval';

/**
 * WorkflowStatus - Status values used in transition guards
 * Includes both board statuses and authority pipeline workItemState values
 */
export type WorkflowStatus =
  | 'backlog'
  | 'in_progress'
  | 'review'
  | 'done'
  | 'blocked'
  | 'idea'
  | 'pm_review'
  | 'pm_changes_requested'
  | 'approved'
  | 'planned'
  | 'ready';

/**
 * AgentTrustProfile - Agent's trust credentials for policy evaluation
 * Passed to checkPolicy() to determine what the agent can do
 */
export interface AgentTrustProfile {
  /** Agent identifier */
  agentId: string;
  /** Agent role (short code) */
  role: AgentRoleName;
  /** Maximum risk level this agent can handle without approval */
  maxRiskLevel: RiskLevel;
  /** Custom overrides for specific actions */
  customPermissions?: Partial<Record<PolicyAction, boolean>>;
}

/**
 * EngineActionProposal - Proposal evaluated by the policy engine
 * Focused on the action itself, not the organizational context
 */
export interface EngineActionProposal {
  /** The action being proposed */
  action: PolicyAction;
  /** Risk level of this specific action */
  actionRisk: RiskLevel;
  /** Current workflow status (if applicable) */
  currentStatus?: WorkflowStatus;
  /** Target workflow status (if applicable) */
  targetStatus?: WorkflowStatus;
  /** Additional context for the action */
  context?: Record<string, unknown>;
}

/**
 * PermissionMatrixEntry - Role capabilities in the permission matrix
 */
export interface PermissionMatrixEntry {
  /** Actions allowed for this role */
  allowedActions: PolicyAction[];
  /** Maximum risk level without approval */
  maxRisk: RiskLevel;
  /** Per-action risk overrides */
  actionRiskLimits?: Partial<Record<PolicyAction, RiskLevel>>;
}

/**
 * PermissionMatrix - Maps roles to their capabilities
 */
export type PermissionMatrix = Record<AgentRoleName, PermissionMatrixEntry>;

/**
 * StatusTransitionGuard - Guards for status transitions
 */
export interface StatusTransitionGuard {
  /** Source status */
  from: WorkflowStatus;
  /** Target status */
  to: WorkflowStatus;
  /** Roles allowed to make this transition */
  allowedRoles: AgentRoleName[];
  /** Minimum risk level required for approval */
  requiresApprovalAbove?: RiskLevel;
}

/**
 * EnginePolicyConfig - Configuration for the policy engine
 */
export interface EnginePolicyConfig {
  /** Permission matrix for role-based access */
  permissionMatrix: PermissionMatrix;
  /** Status transition guards */
  statusTransitions?: StatusTransitionGuard[];
  /** Whether to enforce strict risk gating */
  strictRiskGating?: boolean;
}

/**
 * EnginePolicyDecision - Detailed result from the policy engine
 * Includes diagnostic information for debugging and audit
 */
export interface EnginePolicyDecision {
  /** The decision outcome */
  decision: PolicyDecisionType;
  /** Reason for the decision */
  reason: string;
  /** Whether role has permission for the action */
  hasPermission: boolean;
  /** Whether transition is allowed (if applicable) */
  transitionAllowed: boolean;
  /** Whether risk gate was triggered */
  riskGateTriggered: boolean;
  /** Additional details about the decision */
  details?: {
    /** Agent's maximum risk level */
    agentMaxRisk?: RiskLevel;
    /** Action's risk level */
    actionRisk?: RiskLevel;
    /** Permission level risk limit */
    permissionRiskLimit?: RiskLevel;
  };
}

// ============================================================================
// AUTHORITY SYSTEM TYPES
// Used by the authority service for organizational workflows
// ============================================================================

/**
 * TrustLevel - Determines the autonomy level for an agent or role
 * Ranges from manual approval-required to full autonomous execution
 */
export type TrustLevel = 0 | 1 | 2 | 3;

/**
 * RiskLevel - Categorizes the risk impact of an action
 * Used by both engine and authority system
 * 'critical' is engine-only (for CTO-level unlimited risk)
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * AuthorityRole - Available organizational roles for policy definitions
 * Maps to team members and their responsibilities
 */
export type AuthorityRole =
  | 'cto'
  | 'product-manager'
  | 'project-manager'
  | 'engineering-manager'
  | 'principal-engineer';

/**
 * PolicyActionType - All actions that can be controlled by policies
 * Superset of PolicyAction - includes organizational actions
 */
export type PolicyActionType =
  | 'create_work'
  | 'assign_work'
  | 'change_scope'
  | 'change_estimate'
  | 'block_release'
  | 'escalate'
  | 'transition_status'
  | 'approve_work'
  | 'delegate'
  | 'modify_architecture'
  | 'update_status'
  | 'create_pr'
  | 'merge_pr';

/**
 * ActionProposal - Request to perform a policy-controlled action
 * Submitted by agents and evaluated against policies before execution
 * Rich organizational context - gets mapped to EngineActionProposal for checkPolicy()
 */
export interface ActionProposal {
  /** Agent or entity proposing the action */
  who: string;
  /** The action being proposed */
  what: PolicyActionType;
  /** Target resource (feature ID, work item, etc.) */
  target: string;
  /** Rationale for the proposed action */
  justification: string;
  /** Risk level of this specific action */
  risk: RiskLevel;
  /** Optional status transition (if applicable) */
  statusTransition?: {
    from: string;
    to: string;
  };
}

/**
 * PolicyDecision - Result of policy evaluation
 * Determines whether an action is allowed, denied, or requires approval
 * Simplified view - EnginePolicyDecision has full diagnostics
 */
export interface PolicyDecision {
  /** Allow, deny, or require approval */
  verdict: 'allow' | 'deny' | 'require_approval';
  /** Reason for the decision */
  reason: string;
  /** ID of approver required (when verdict is require_approval) */
  approver?: string;
}

/**
 * TrustProfile - Agent or role's trust credentials and limits
 * Defines autonomy level and risk tolerance
 */
export interface TrustProfile {
  /** Role identifier */
  role: AuthorityRole;
  /** Trust level (0=Manual, 1=Assisted, 2=Conditional, 3=Autonomous) */
  trustLevel: TrustLevel;
  /** Maximum risk level allowed without approval */
  maxRiskAllowed: RiskLevel;
  /** Performance statistics for this profile */
  stats: {
    totalActions: number;
    approvedActions: number;
    deniedActions: number;
    escalatedActions: number;
  };
}

/**
 * PermissionEntry - Single permission rule mapping role, action, and risk
 * Core building block for authority system policy configuration
 */
export interface PermissionEntry {
  /** Target role */
  role: AuthorityRole;
  /** Allowed action */
  action: PolicyActionType;
  /** Whether action is allowed */
  allowed: boolean;
  /** Maximum risk level that doesn't require approval */
  maxRiskWithoutApproval: RiskLevel;
}

/**
 * StatusTransitionRule - Allowed transitions between workflow states
 * Restricts which roles can move items between statuses
 */
export interface StatusTransitionRule {
  /** Source status */
  from: string;
  /** Destination status */
  to: string;
  /** Roles allowed to perform this transition */
  allowedRoles: AuthorityRole[];
}

/**
 * PolicyConfig - Complete policy configuration for an organization
 * Aggregates permissions, transitions, trust settings, and risk thresholds
 */
export interface PolicyConfig {
  /** Permission rules (role x action x risk) */
  permissions: PermissionEntry[];
  /** Status transition rules */
  transitions: StatusTransitionRule[];
  /** Default trust level for new agents */
  defaultTrustLevel: TrustLevel;
  /** Default risk tolerance for new agents */
  defaultMaxRisk: RiskLevel;
  /** Global escalation threshold (risk level that always requires approval) */
  escalationThreshold: RiskLevel;
}

/**
 * ApprovalRequest - Pending approval for an action
 * Tracks proposals through the approval workflow
 */
export interface ApprovalRequest {
  /** Unique identifier */
  id: string;
  /** The proposed action */
  proposal: ActionProposal;
  /** Current status of the request */
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  /** Resolution details (when status is approved or denied) */
  resolution?: {
    decidedBy: string;
    decidedAt: string; // ISO timestamp
    reason: string;
  };
}

/**
 * DelegationRule - Allows one role to delegate work to another
 * Enables hierarchical delegation with action and direction constraints
 */
export interface DelegationRule {
  /** Role that can delegate */
  from: AuthorityRole;
  /** Role that can receive delegated work */
  to: AuthorityRole;
  /** Direction: 'down' (delegate to lower), 'up' (escalate), or 'lateral' (peer) */
  direction: 'down' | 'up' | 'lateral';
  /** Specific actions that can be delegated */
  allowedActions: PolicyActionType[];
}

// ============================================================================
// MAPPING UTILITIES
// Bridge between engine types and authority types
// ============================================================================

/**
 * Map from AgentRoleName (engine) to AuthorityRole (authority system)
 */
export const ROLE_NAME_TO_AUTHORITY: Record<AgentRoleName, AuthorityRole> = {
  CTO: 'cto',
  PM: 'product-manager',
  ProjM: 'project-manager',
  EM: 'engineering-manager',
  PE: 'principal-engineer',
};

/**
 * Map from AuthorityRole to AgentRoleName
 */
export const AUTHORITY_TO_ROLE_NAME: Record<AuthorityRole, AgentRoleName> = {
  cto: 'CTO',
  'product-manager': 'PM',
  'project-manager': 'ProjM',
  'engineering-manager': 'EM',
  'principal-engineer': 'PE',
};
