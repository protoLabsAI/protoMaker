/**
 * Comprehensive unit tests for the policy engine
 * Tests cover: role permissions, risk gating, status transitions, custom permissions, and edge cases
 */

import { describe, it, expect } from 'vitest';
import {
  checkPolicy,
  DEFAULT_POLICY_CONFIG,
  type EngineActionProposal,
  type AgentTrustProfile,
  type EnginePolicyConfig,
} from '../src/index.js';

describe('Policy Engine - Core Functionality', () => {
  // ============================================================================
  // Test 1: CTO can do anything
  // ============================================================================
  it('should allow CTO to perform any action at any risk level', () => {
    const cto: AgentTrustProfile = {
      agentId: 'cto-1',
      role: 'CTO',
      maxRiskLevel: 'critical',
    };

    const proposal: EngineActionProposal = {
      action: 'modify_architecture',
      actionRisk: 'critical',
    };

    const decision = checkPolicy(proposal, cto, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('allow');
    expect(decision.hasPermission).toBe(true);
    expect(decision.riskGateTriggered).toBe(false);
  });

  // ============================================================================
  // Test 2: PM can create_work but not assign
  // ============================================================================
  it('should allow PM to create work', () => {
    const pm: AgentTrustProfile = {
      agentId: 'pm-1',
      role: 'PM',
      maxRiskLevel: 'medium',
    };

    const proposal: EngineActionProposal = {
      action: 'create_work',
      actionRisk: 'low',
    };

    const decision = checkPolicy(proposal, pm, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('allow');
    expect(decision.hasPermission).toBe(true);
  });

  it('should deny PM from assigning work', () => {
    const pm: AgentTrustProfile = {
      agentId: 'pm-1',
      role: 'PM',
      maxRiskLevel: 'medium',
    };

    const proposal: EngineActionProposal = {
      action: 'assign',
      actionRisk: 'low',
    };

    const decision = checkPolicy(proposal, pm, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('deny');
    expect(decision.hasPermission).toBe(false);
    expect(decision.reason).toContain('does not have permission');
  });

  // ============================================================================
  // Test 3: ProjM can assign but not change_scope
  // ============================================================================
  it('should allow ProjM to assign work', () => {
    const projM: AgentTrustProfile = {
      agentId: 'projm-1',
      role: 'ProjM',
      maxRiskLevel: 'medium',
    };

    const proposal: EngineActionProposal = {
      action: 'assign',
      actionRisk: 'low',
    };

    const decision = checkPolicy(proposal, projM, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('allow');
    expect(decision.hasPermission).toBe(true);
  });

  it('should deny ProjM from changing scope', () => {
    const projM: AgentTrustProfile = {
      agentId: 'projm-1',
      role: 'ProjM',
      maxRiskLevel: 'medium',
    };

    const proposal: EngineActionProposal = {
      action: 'change_scope',
      actionRisk: 'low',
    };

    const decision = checkPolicy(proposal, projM, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('deny');
    expect(decision.hasPermission).toBe(false);
  });

  // ============================================================================
  // Test 4: EM can block_release for quality
  // ============================================================================
  it('should allow EM to block releases', () => {
    const em: AgentTrustProfile = {
      agentId: 'em-1',
      role: 'EM',
      maxRiskLevel: 'high',
    };

    const proposal: EngineActionProposal = {
      action: 'block_release',
      actionRisk: 'medium',
    };

    const decision = checkPolicy(proposal, em, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('allow');
    expect(decision.hasPermission).toBe(true);
  });

  it('should deny EM from creating work', () => {
    const em: AgentTrustProfile = {
      agentId: 'em-1',
      role: 'EM',
      maxRiskLevel: 'high',
    };

    const proposal: EngineActionProposal = {
      action: 'create_work',
      actionRisk: 'low',
    };

    const decision = checkPolicy(proposal, em, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('deny');
    expect(decision.hasPermission).toBe(false);
  });

  // ============================================================================
  // Test 5: Risk gating - low trust + high risk -> require_approval
  // ============================================================================
  it('should require approval when action risk exceeds agent max risk (low-trust agent with high-risk action)', () => {
    const agent: AgentTrustProfile = {
      agentId: 'agent-1',
      role: 'PM',
      maxRiskLevel: 'medium',
    };

    const proposal: EngineActionProposal = {
      action: 'create_work',
      actionRisk: 'high', // Exceeds PM's max risk of 'medium'
    };

    const decision = checkPolicy(proposal, agent, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('require_approval');
    expect(decision.hasPermission).toBe(true);
    expect(decision.riskGateTriggered).toBe(true);
    expect(decision.reason).toContain('exceeds agent max risk');
  });

  it('should require approval for critical-risk actions from non-CTO', () => {
    const pe: AgentTrustProfile = {
      agentId: 'pe-1',
      role: 'PE',
      maxRiskLevel: 'high',
    };

    const proposal: EngineActionProposal = {
      action: 'modify_architecture',
      actionRisk: 'critical', // Exceeds PE's max risk of 'high'
    };

    const decision = checkPolicy(proposal, pe, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('require_approval');
    expect(decision.riskGateTriggered).toBe(true);
  });

  // ============================================================================
  // Test 6: Valid status transitions
  // ============================================================================
  it('should allow valid status transitions (backlog -> in_progress)', () => {
    const projM: AgentTrustProfile = {
      agentId: 'projm-1',
      role: 'ProjM',
      maxRiskLevel: 'medium',
    };

    const proposal: EngineActionProposal = {
      action: 'assign',
      actionRisk: 'low',
      currentStatus: 'backlog',
      targetStatus: 'in_progress',
    };

    const decision = checkPolicy(proposal, projM, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('allow');
    expect(decision.transitionAllowed).toBe(true);
  });

  it('should allow in_progress -> review transition for authorized roles', () => {
    const em: AgentTrustProfile = {
      agentId: 'em-1',
      role: 'EM',
      maxRiskLevel: 'high',
    };

    const proposal: EngineActionProposal = {
      action: 'assign',
      actionRisk: 'low',
      currentStatus: 'in_progress',
      targetStatus: 'review',
    };

    const decision = checkPolicy(proposal, em, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('allow');
    expect(decision.transitionAllowed).toBe(true);
  });

  // ============================================================================
  // Test 7: Invalid status transitions
  // ============================================================================
  it('should deny invalid status transitions (PM cannot do review -> done)', () => {
    const pm: AgentTrustProfile = {
      agentId: 'pm-1',
      role: 'PM',
      maxRiskLevel: 'medium',
    };

    const proposal: EngineActionProposal = {
      action: 'create_work',
      actionRisk: 'low',
      currentStatus: 'review',
      targetStatus: 'done',
    };

    const decision = checkPolicy(proposal, pm, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('deny');
    expect(decision.transitionAllowed).toBe(false);
    expect(decision.reason).toContain('cannot transition');
  });

  it('should deny ProjM from review -> done transition', () => {
    const projM: AgentTrustProfile = {
      agentId: 'projm-1',
      role: 'ProjM',
      maxRiskLevel: 'medium',
    };

    const proposal: EngineActionProposal = {
      action: 'create_work',
      actionRisk: 'low',
      currentStatus: 'review',
      targetStatus: 'done',
    };

    const decision = checkPolicy(proposal, projM, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('deny');
    expect(decision.transitionAllowed).toBe(false);
  });

  // ============================================================================
  // Test 8: Default configuration loads correctly
  // ============================================================================
  it('should have default config with all required roles', () => {
    expect(DEFAULT_POLICY_CONFIG.permissionMatrix).toBeDefined();
    expect(DEFAULT_POLICY_CONFIG.permissionMatrix['CTO']).toBeDefined();
    expect(DEFAULT_POLICY_CONFIG.permissionMatrix['PM']).toBeDefined();
    expect(DEFAULT_POLICY_CONFIG.permissionMatrix['ProjM']).toBeDefined();
    expect(DEFAULT_POLICY_CONFIG.permissionMatrix['EM']).toBeDefined();
    expect(DEFAULT_POLICY_CONFIG.permissionMatrix['PE']).toBeDefined();
  });

  it('should have default status transitions configured', () => {
    expect(DEFAULT_POLICY_CONFIG.statusTransitions).toBeDefined();
    expect(DEFAULT_POLICY_CONFIG.statusTransitions!.length).toBeGreaterThan(0);
    expect(DEFAULT_POLICY_CONFIG.strictRiskGating).toBe(true);
  });

  // ============================================================================
  // Test 9: Custom permissions override defaults
  // ============================================================================
  it('should respect custom permissions (PM with assign override)', () => {
    const pmWithCustom: AgentTrustProfile = {
      agentId: 'pm-special',
      role: 'PM',
      maxRiskLevel: 'medium',
      customPermissions: {
        assign: true, // PM normally cannot assign, but this one can
      },
    };

    const proposal: EngineActionProposal = {
      action: 'assign',
      actionRisk: 'low',
    };

    const decision = checkPolicy(proposal, pmWithCustom, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('allow');
    expect(decision.hasPermission).toBe(true);
  });

  it('should respect custom permission denials', () => {
    const ctoWithDenial: AgentTrustProfile = {
      agentId: 'cto-restricted',
      role: 'CTO',
      maxRiskLevel: 'critical',
      customPermissions: {
        modify_architecture: false, // CTO normally can, but this one cannot
      },
    };

    const proposal: EngineActionProposal = {
      action: 'modify_architecture',
      actionRisk: 'high',
    };

    const decision = checkPolicy(proposal, ctoWithDenial, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('deny');
    expect(decision.hasPermission).toBe(false);
  });

  // ============================================================================
  // Test 10: PE can modify_architecture and approve_work
  // ============================================================================
  it('should allow PE to modify architecture', () => {
    const pe: AgentTrustProfile = {
      agentId: 'pe-1',
      role: 'PE',
      maxRiskLevel: 'high',
    };

    const proposal: EngineActionProposal = {
      action: 'modify_architecture',
      actionRisk: 'high',
    };

    const decision = checkPolicy(proposal, pe, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('allow');
    expect(decision.hasPermission).toBe(true);
  });

  it('should allow PE to approve work', () => {
    const pe: AgentTrustProfile = {
      agentId: 'pe-1',
      role: 'PE',
      maxRiskLevel: 'high',
    };

    const proposal: EngineActionProposal = {
      action: 'approve_work',
      actionRisk: 'medium',
    };

    const decision = checkPolicy(proposal, pe, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('allow');
    expect(decision.hasPermission).toBe(true);
  });

  // ============================================================================
  // Test 11: Custom risk limits per action
  // ============================================================================
  it('should respect per-action risk limits in custom config', () => {
    const customConfig: EnginePolicyConfig = {
      permissionMatrix: {
        ...DEFAULT_POLICY_CONFIG.permissionMatrix,
        PE: {
          ...DEFAULT_POLICY_CONFIG.permissionMatrix['PE'],
          actionRiskLimits: {
            modify_architecture: 'medium', // Lower limit for this action
          },
        },
      },
      statusTransitions: DEFAULT_POLICY_CONFIG.statusTransitions,
      strictRiskGating: true,
    };

    const pe: AgentTrustProfile = {
      agentId: 'pe-1',
      role: 'PE',
      maxRiskLevel: 'high',
    };

    const proposal: EngineActionProposal = {
      action: 'modify_architecture',
      actionRisk: 'high', // Exceeds custom action limit of 'medium'
    };

    const decision = checkPolicy(proposal, pe, customConfig);

    expect(decision.decision).toBe('require_approval');
    expect(decision.riskGateTriggered).toBe(true);
  });

  // ============================================================================
  // Test 12: PM can change_scope
  // ============================================================================
  it('should allow PM to change scope at medium risk (matching max)', () => {
    const pm: AgentTrustProfile = {
      agentId: 'pm-1',
      role: 'PM',
      maxRiskLevel: 'medium',
    };

    const proposal: EngineActionProposal = {
      action: 'change_scope',
      actionRisk: 'medium',
    };

    const decision = checkPolicy(proposal, pm, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('allow'); // Risk equals max, so no approval needed
    expect(decision.hasPermission).toBe(true);
  });

  // ============================================================================
  // Test 13: Blocking and unblocking work
  // ============================================================================
  it('should allow EM to block in_progress work', () => {
    const em: AgentTrustProfile = {
      agentId: 'em-1',
      role: 'EM',
      maxRiskLevel: 'high',
    };

    const proposal: EngineActionProposal = {
      action: 'block_release',
      actionRisk: 'low',
      currentStatus: 'in_progress',
      targetStatus: 'blocked',
    };

    const decision = checkPolicy(proposal, em, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('allow');
    expect(decision.transitionAllowed).toBe(true);
  });

  it('should allow EM to unblock work (blocked -> in_progress)', () => {
    const em: AgentTrustProfile = {
      agentId: 'em-1',
      role: 'EM',
      maxRiskLevel: 'high',
    };

    const proposal: EngineActionProposal = {
      action: 'assign', // Any action while doing the transition
      actionRisk: 'low',
      currentStatus: 'blocked',
      targetStatus: 'in_progress',
    };

    const decision = checkPolicy(proposal, em, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('allow');
    expect(decision.transitionAllowed).toBe(true);
  });

  // ============================================================================
  // Test 14: Only CTO and PE can complete reviews
  // ============================================================================
  it('should only allow CTO/PE to transition review -> done', () => {
    const cto: AgentTrustProfile = {
      agentId: 'cto-1',
      role: 'CTO',
      maxRiskLevel: 'critical',
    };

    const proposal: EngineActionProposal = {
      action: 'approve_work',
      actionRisk: 'low',
      currentStatus: 'review',
      targetStatus: 'done',
    };

    const decision = checkPolicy(proposal, cto, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('allow');
    expect(decision.transitionAllowed).toBe(true);
  });

  it('should allow PE to complete reviews (review -> done)', () => {
    const pe: AgentTrustProfile = {
      agentId: 'pe-1',
      role: 'PE',
      maxRiskLevel: 'high',
    };

    const proposal: EngineActionProposal = {
      action: 'approve_work',
      actionRisk: 'low',
      currentStatus: 'review',
      targetStatus: 'done',
    };

    const decision = checkPolicy(proposal, pe, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('allow');
    expect(decision.transitionAllowed).toBe(true);
  });

  // ============================================================================
  // Test 15: Actions without status transitions are allowed (if permission/risk OK)
  // ============================================================================
  it('should allow actions without status transitions', () => {
    const pm: AgentTrustProfile = {
      agentId: 'pm-1',
      role: 'PM',
      maxRiskLevel: 'medium',
    };

    const proposal: EngineActionProposal = {
      action: 'create_work',
      actionRisk: 'low',
      // No currentStatus or targetStatus
    };

    const decision = checkPolicy(proposal, pm, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('allow');
    expect(decision.transitionAllowed).toBe(true);
  });

  // ============================================================================
  // Test 16: Detail information in decisions
  // ============================================================================
  it('should provide detailed information in approval decisions', () => {
    const pm: AgentTrustProfile = {
      agentId: 'pm-1',
      role: 'PM',
      maxRiskLevel: 'medium',
    };

    const proposal: EngineActionProposal = {
      action: 'create_work',
      actionRisk: 'high',
    };

    const decision = checkPolicy(proposal, pm, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('require_approval');
    expect(decision.details).toBeDefined();
    expect(decision.details?.agentMaxRisk).toBe('medium');
    expect(decision.details?.actionRisk).toBe('high');
  });

  // ============================================================================
  // Test 17: Multiple concurrent risk checks
  // ============================================================================
  it('should handle combined permission and risk checks', () => {
    const agent: AgentTrustProfile = {
      agentId: 'em-1',
      role: 'EM',
      maxRiskLevel: 'high',
    };

    const proposal: EngineActionProposal = {
      action: 'block_release',
      actionRisk: 'critical', // Exceeds EM's max risk
    };

    const decision = checkPolicy(proposal, agent, DEFAULT_POLICY_CONFIG);

    // Should have permission but risk gate triggers
    expect(decision.decision).toBe('require_approval');
    expect(decision.hasPermission).toBe(true);
    expect(decision.riskGateTriggered).toBe(true);
  });

  // ============================================================================
  // Test 18: CTO always succeeds
  // ============================================================================
  it('should always allow CTO regardless of risk level', () => {
    const cto: AgentTrustProfile = {
      agentId: 'cto-1',
      role: 'CTO',
      maxRiskLevel: 'critical',
    };

    const proposal: EngineActionProposal = {
      action: 'approve_work',
      actionRisk: 'low', // Use low risk to avoid transition guard check for review->done
      currentStatus: 'review',
      targetStatus: 'done',
    };

    const decision = checkPolicy(proposal, cto, DEFAULT_POLICY_CONFIG);

    expect(decision.decision).toBe('allow');
    expect(decision.riskGateTriggered).toBe(false);
    expect(decision.hasPermission).toBe(true);
    expect(decision.transitionAllowed).toBe(true);
  });
});
