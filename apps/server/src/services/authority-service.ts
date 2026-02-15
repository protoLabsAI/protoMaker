/**
 * Authority Service - Trust-based policy enforcement for agent actions
 *
 * Bridges the authority system types (organizational workflows) with the
 * policy engine (fast permission checks). Manages agent registration,
 * trust profiles, action proposals, and approval workflows.
 *
 * Persistence: Stores state in {projectPath}/.automaker/authority/
 * Events: Emits authority:* events for real-time UI updates
 */

import path from 'path';
import { randomUUID } from 'crypto';
import type {
  AuthorityRole,
  TrustLevel,
  RiskLevel,
  ActionProposal,
  PolicyDecision,
  ApprovalRequest,
  TrustProfile,
  PolicyConfig,
  AuthorityAgent,
  PolicyActionType,
  AgentTrustProfile,
  EngineActionProposal,
  PolicyAction,
} from '@automaker/types';
import { AUTHORITY_TO_ROLE_NAME } from '@automaker/types';
import { checkPolicy, DEFAULT_POLICY_CONFIG } from './policy-engine.js';
import { createLogger, atomicWriteJson, readJsonWithRecovery } from '@automaker/utils';
import { getAutomakerDir } from '@automaker/platform';
import type { EventEmitter } from '../lib/events.js';
import * as secureFs from '../lib/secure-fs.js';

const logger = createLogger('AuthorityService');

// ============================================================================
// Internal Types
// ============================================================================

/**
 * RegisteredAgent - Runtime extension of AuthorityAgent with project context.
 * The base AuthorityAgent type lacks projectPath and createdAt, which we need
 * for multi-project agent tracking and audit trails.
 */
interface RegisteredAgent extends AuthorityAgent {
  /** Project this agent is registered under */
  projectPath: string;
  /** ISO timestamp of agent creation */
  createdAt: string;
}

/**
 * PersistedState - Shape of each JSON file stored under .automaker/authority/
 */
interface AgentsFile {
  agents: RegisteredAgent[];
}

interface TrustProfilesFile {
  profiles: TrustProfile[];
}

interface ApprovalQueueFile {
  requests: ApprovalRequest[];
}

// ============================================================================
// Constants
// ============================================================================

/** Directory name for authority data within .automaker/ */
const AUTHORITY_DIR = 'authority';

/** File names for persisted state */
const AGENTS_FILE = 'agents.json';
const TRUST_PROFILES_FILE = 'trust-profiles.json';
const APPROVAL_QUEUE_FILE = 'approval-queue.json';

/** Default trust level assigned to each role on registration */
const DEFAULT_TRUST_BY_ROLE: Record<AuthorityRole, TrustLevel> = {
  cto: 3,
  'product-manager': 1,
  'project-manager': 1,
  'engineering-manager': 1,
  'principal-engineer': 2,
};

/** Maximum risk level each trust level can handle without requiring approval */
const MAX_RISK_BY_TRUST: Record<TrustLevel, RiskLevel> = {
  0: 'low',
  1: 'low',
  2: 'medium',
  3: 'high',
};

/**
 * Maps PolicyActionType (authority) to PolicyAction (engine).
 * Only the subset of actions recognized by the engine are mapped;
 * unmapped authority actions fall back to 'create_work' as a safe default.
 */
const ACTION_TYPE_TO_ENGINE_ACTION: Partial<Record<PolicyActionType, PolicyAction>> = {
  create_work: 'create_work',
  assign_work: 'assign',
  change_scope: 'change_scope',
  block_release: 'block_release',
  modify_architecture: 'modify_architecture',
  approve_work: 'approve_work',
};

// ============================================================================
// AuthorityService
// ============================================================================

export class AuthorityService {
  private readonly events: EventEmitter;

  /** In-memory cache keyed by projectPath */
  private agents: Map<string, RegisteredAgent[]> = new Map();
  private trustProfiles: Map<string, TrustProfile[]> = new Map();
  private approvalQueues: Map<string, ApprovalRequest[]> = new Map();
  private initialized: Set<string> = new Set();

  constructor(events: EventEmitter) {
    this.events = events;
  }

  // --------------------------------------------------------------------------
  // Initialization & Persistence
  // --------------------------------------------------------------------------

  /**
   * Load persisted state for a project from disk.
   * Safe to call multiple times; subsequent calls are no-ops.
   */
  async initialize(projectPath: string): Promise<void> {
    if (this.initialized.has(projectPath)) {
      return;
    }

    const authorityDir = this.getAuthorityDir(projectPath);
    await this.ensureAuthorityDir(authorityDir);

    this.agents.set(projectPath, await this.loadAgents(authorityDir));
    this.trustProfiles.set(projectPath, await this.loadTrustProfiles(authorityDir));
    this.approvalQueues.set(projectPath, await this.loadApprovalQueue(authorityDir));

    this.initialized.add(projectPath);
    logger.info(`Authority service initialized for project: ${projectPath}`);
  }

  // --------------------------------------------------------------------------
  // Agent Registration
  // --------------------------------------------------------------------------

  /**
   * Register a new agent with a given role.
   * Assigns default trust level based on role and creates a corresponding trust profile.
   */
  async registerAgent(role: AuthorityRole, projectPath: string): Promise<AuthorityAgent> {
    await this.initialize(projectPath);

    const trustLevel = DEFAULT_TRUST_BY_ROLE[role];
    const maxRisk = MAX_RISK_BY_TRUST[trustLevel];

    const agent: RegisteredAgent = {
      id: randomUUID(),
      role,
      status: 'active',
      trust: trustLevel,
      subAgentIds: [],
      projectPath,
      createdAt: new Date().toISOString(),
    };

    const agents = this.getAgentsForProject(projectPath);
    agents.push(agent);
    await this.persistAgents(projectPath);

    // Create a trust profile for this agent
    const profile: TrustProfile = {
      role,
      trustLevel,
      maxRiskAllowed: maxRisk,
      stats: {
        totalActions: 0,
        approvedActions: 0,
        deniedActions: 0,
        escalatedActions: 0,
      },
    };

    const profiles = this.getTrustProfilesForProject(projectPath);
    profiles.push(profile);
    await this.persistTrustProfiles(projectPath);

    this.events.emit('authority:agent-registered', {
      projectPath,
      agent: this.toPublicAgent(agent),
    });

    logger.info(`Agent registered: ${agent.id} (${role}) with trust level ${trustLevel}`);
    return this.toPublicAgent(agent);
  }

  // --------------------------------------------------------------------------
  // Proposal Submission
  // --------------------------------------------------------------------------

  /**
   * Submit an action proposal for policy evaluation.
   *
   * Flow:
   * 1. Find the proposing agent
   * 2. Bridge the authority proposal to an engine proposal
   * 3. Call checkPolicy() for a fast permission check
   * 4. Map the engine decision to an authority PolicyDecision
   * 5. If require_approval, queue an ApprovalRequest
   * 6. Emit the appropriate event
   */
  async submitProposal(proposal: ActionProposal, projectPath: string): Promise<PolicyDecision> {
    await this.initialize(projectPath);

    const agent = this.findAgentById(proposal.who, projectPath);
    if (!agent) {
      const decision: PolicyDecision = {
        verdict: 'deny',
        reason: `Agent ${proposal.who} is not registered`,
      };
      this.events.emit('authority:proposal-submitted', {
        projectPath,
        proposal,
        decision,
      });
      return decision;
    }

    const engineProposal = this.bridgeToEngineProposal(proposal, agent);
    const trustProfile = this.buildAgentTrustProfile(agent);
    const engineDecision = checkPolicy(engineProposal, trustProfile, DEFAULT_POLICY_CONFIG);

    const decision = this.mapEngineDecision(engineDecision);

    // Update trust profile stats
    this.updateProfileStats(agent.role, decision.verdict, projectPath);

    this.events.emit('authority:proposal-submitted', {
      projectPath,
      proposal,
      decision,
    });

    if (decision.verdict === 'allow') {
      this.events.emit('authority:approved', {
        projectPath,
        proposal,
        decision,
      });
    } else if (decision.verdict === 'deny') {
      this.events.emit('authority:rejected', {
        projectPath,
        proposal,
        decision,
      });
    } else if (decision.verdict === 'require_approval') {
      const request = await this.queueApprovalRequest(proposal, projectPath);
      decision.approver = request.id;
      this.events.emit('authority:awaiting-approval', {
        projectPath,
        proposal,
        decision,
        requestId: request.id,
      });
    }

    return decision;
  }

  // --------------------------------------------------------------------------
  // Approval Resolution
  // --------------------------------------------------------------------------

  /**
   * Resolve a pending approval request.
   * Only pending requests can be resolved.
   */
  async resolveApproval(
    requestId: string,
    resolution: 'approve' | 'reject' | 'modify',
    resolvedBy: string,
    projectPath: string
  ): Promise<ApprovalRequest | null> {
    await this.initialize(projectPath);

    const queue = this.getApprovalQueueForProject(projectPath);
    const request = queue.find((r) => r.id === requestId);

    if (!request) {
      logger.warn(`Approval request not found: ${requestId}`);
      return null;
    }

    if (request.status !== 'pending') {
      logger.warn(`Approval request ${requestId} is already ${request.status}`);
      return request;
    }

    const newStatus = resolution === 'approve' ? 'approved' : 'denied';
    request.status = newStatus;
    request.resolution = {
      decidedBy: resolvedBy,
      decidedAt: new Date().toISOString(),
      reason: `${resolution} by ${resolvedBy}`,
    };

    await this.persistApprovalQueue(projectPath);

    const eventType = resolution === 'approve' ? 'authority:approved' : 'authority:rejected';
    this.events.emit(eventType, {
      projectPath,
      proposal: request.proposal,
      requestId,
      resolvedBy,
      resolution,
    });

    // Update stats based on resolution
    const agent = this.findAgentById(request.proposal.who, projectPath);
    if (agent) {
      const statVerdict = resolution === 'approve' ? 'allow' : 'deny';
      this.updateProfileStats(agent.role, statVerdict, projectPath);
    }

    logger.info(`Approval request ${requestId} resolved: ${resolution} by ${resolvedBy}`);
    return request;
  }

  // --------------------------------------------------------------------------
  // Action Execution (Placeholder)
  // --------------------------------------------------------------------------

  /**
   * Placeholder for delegating approved actions to FeatureLoader/AutoMode.
   * In a full implementation, this would route to the appropriate service
   * based on the action type.
   */
  async executeAction(proposal: ActionProposal): Promise<void> {
    logger.info(`Executing action: ${proposal.what} on ${proposal.target} by ${proposal.who}`);
    // Future: delegate to FeatureLoader, AutoModeService, etc.
  }

  // --------------------------------------------------------------------------
  // Query Methods
  // --------------------------------------------------------------------------

  /**
   * Get all pending approval requests for a project.
   */
  async getPendingApprovals(projectPath: string): Promise<ApprovalRequest[]> {
    await this.initialize(projectPath);
    return this.getApprovalQueueForProject(projectPath).filter((r) => r.status === 'pending');
  }

  /**
   * Get all registered agents for a project.
   */
  async getAgents(projectPath: string): Promise<AuthorityAgent[]> {
    await this.initialize(projectPath);
    return this.getAgentsForProject(projectPath).map((a) => this.toPublicAgent(a));
  }

  // --------------------------------------------------------------------------
  // Trust Management
  // --------------------------------------------------------------------------

  /**
   * Update an agent's trust level and corresponding max risk allowance.
   */
  async updateTrustLevel(
    agentId: string,
    newTrustLevel: TrustLevel,
    projectPath: string
  ): Promise<AuthorityAgent | null> {
    await this.initialize(projectPath);

    const agents = this.getAgentsForProject(projectPath);
    const agent = agents.find((a) => a.id === agentId);

    if (!agent) {
      logger.warn(`Agent not found for trust update: ${agentId}`);
      return null;
    }

    const previousTrust = agent.trust;
    agent.trust = newTrustLevel;
    await this.persistAgents(projectPath);

    // Update the corresponding trust profile's max risk
    const newMaxRisk = MAX_RISK_BY_TRUST[newTrustLevel];
    const profiles = this.getTrustProfilesForProject(projectPath);
    const profile = profiles.find((p) => p.role === agent.role);
    if (profile) {
      profile.trustLevel = newTrustLevel;
      profile.maxRiskAllowed = newMaxRisk;
      await this.persistTrustProfiles(projectPath);
    }

    this.events.emit('authority:trust-updated', {
      projectPath,
      agentId,
      previousTrust,
      newTrustLevel,
      role: agent.role,
    });

    logger.info(
      `Trust updated for agent ${agentId}: ${previousTrust} -> ${newTrustLevel} (max risk: ${newMaxRisk})`
    );
    return this.toPublicAgent(agent);
  }

  // --------------------------------------------------------------------------
  // Bridge: Authority Types -> Engine Types
  // --------------------------------------------------------------------------

  /**
   * Convert an authority-layer ActionProposal into the engine-layer EngineActionProposal
   * that checkPolicy() expects. This bridges the two type systems.
   */
  private bridgeToEngineProposal(
    proposal: ActionProposal,
    agent: RegisteredAgent
  ): EngineActionProposal {
    const engineAction = this.mapToEngineAction(proposal.what);

    const engineProposal: EngineActionProposal = {
      action: engineAction,
      actionRisk: proposal.risk,
    };

    if (proposal.statusTransition) {
      engineProposal.currentStatus = proposal.statusTransition
        .from as EngineActionProposal['currentStatus'];
      engineProposal.targetStatus = proposal.statusTransition
        .to as EngineActionProposal['targetStatus'];
    }

    return engineProposal;
  }

  /**
   * Build an AgentTrustProfile from a RegisteredAgent for policy engine evaluation.
   */
  private buildAgentTrustProfile(agent: RegisteredAgent): AgentTrustProfile {
    const roleName = AUTHORITY_TO_ROLE_NAME[agent.role];
    const maxRisk = MAX_RISK_BY_TRUST[agent.trust];

    return {
      agentId: agent.id,
      role: roleName,
      maxRiskLevel: maxRisk,
    };
  }

  /**
   * Map a PolicyActionType (authority, broad set) to a PolicyAction (engine, narrow set).
   * Actions not directly recognized by the engine default to 'create_work'.
   */
  private mapToEngineAction(actionType: PolicyActionType): PolicyAction {
    return ACTION_TYPE_TO_ENGINE_ACTION[actionType] ?? 'create_work';
  }

  /**
   * Map an EnginePolicyDecision back to the authority-layer PolicyDecision.
   */
  private mapEngineDecision(engineDecision: ReturnType<typeof checkPolicy>): PolicyDecision {
    return {
      verdict: engineDecision.decision,
      reason: engineDecision.reason,
    };
  }

  // --------------------------------------------------------------------------
  // Stats Tracking
  // --------------------------------------------------------------------------

  /**
   * Update trust profile statistics after a decision is made.
   */
  private updateProfileStats(role: AuthorityRole, verdict: string, projectPath: string): void {
    const profiles = this.getTrustProfilesForProject(projectPath);
    const profile = profiles.find((p) => p.role === role);
    if (!profile) return;

    profile.stats.totalActions++;

    switch (verdict) {
      case 'allow':
        profile.stats.approvedActions++;
        break;
      case 'deny':
        profile.stats.deniedActions++;
        break;
      case 'require_approval':
        profile.stats.escalatedActions++;
        break;
    }

    // Fire and forget persistence - don't block the caller
    void this.persistTrustProfiles(projectPath);
  }

  // --------------------------------------------------------------------------
  // Approval Queue
  // --------------------------------------------------------------------------

  /**
   * Create and persist an approval request for a proposal that requires human review.
   */
  private async queueApprovalRequest(
    proposal: ActionProposal,
    projectPath: string
  ): Promise<ApprovalRequest> {
    const request: ApprovalRequest = {
      id: randomUUID(),
      proposal,
      status: 'pending',
    };

    const queue = this.getApprovalQueueForProject(projectPath);
    queue.push(request);
    await this.persistApprovalQueue(projectPath);

    logger.info(`Approval request queued: ${request.id} for action ${proposal.what}`);
    return request;
  }

  // --------------------------------------------------------------------------
  // In-Memory Accessors (with safe defaults)
  // --------------------------------------------------------------------------

  private getAgentsForProject(projectPath: string): RegisteredAgent[] {
    if (!this.agents.has(projectPath)) {
      this.agents.set(projectPath, []);
    }
    return this.agents.get(projectPath)!;
  }

  private getTrustProfilesForProject(projectPath: string): TrustProfile[] {
    if (!this.trustProfiles.has(projectPath)) {
      this.trustProfiles.set(projectPath, []);
    }
    return this.trustProfiles.get(projectPath)!;
  }

  private getApprovalQueueForProject(projectPath: string): ApprovalRequest[] {
    if (!this.approvalQueues.has(projectPath)) {
      this.approvalQueues.set(projectPath, []);
    }
    return this.approvalQueues.get(projectPath)!;
  }

  private findAgentById(agentId: string, projectPath: string): RegisteredAgent | undefined {
    return this.getAgentsForProject(projectPath).find((a) => a.id === agentId);
  }

  /**
   * Strip internal fields (projectPath, createdAt) to return the public AuthorityAgent type.
   */
  private toPublicAgent(agent: RegisteredAgent): AuthorityAgent {
    const { projectPath: _pp, createdAt: _ca, ...publicAgent } = agent;
    return publicAgent;
  }

  // --------------------------------------------------------------------------
  // File System Helpers
  // --------------------------------------------------------------------------

  private getAuthorityDir(projectPath: string): string {
    return path.join(getAutomakerDir(projectPath), AUTHORITY_DIR);
  }

  private async ensureAuthorityDir(authorityDir: string): Promise<void> {
    if (!secureFs.existsSync(authorityDir)) {
      await secureFs.mkdir(authorityDir, { recursive: true });
    }
  }

  // --------------------------------------------------------------------------
  // Persistence: Load
  // --------------------------------------------------------------------------

  private async loadAgents(authorityDir: string): Promise<RegisteredAgent[]> {
    const filePath = path.join(authorityDir, AGENTS_FILE);
    const result = await readJsonWithRecovery<AgentsFile>(filePath, { agents: [] });
    return result.data?.agents ?? [];
  }

  private async loadTrustProfiles(authorityDir: string): Promise<TrustProfile[]> {
    const filePath = path.join(authorityDir, TRUST_PROFILES_FILE);
    const result = await readJsonWithRecovery<TrustProfilesFile>(filePath, { profiles: [] });
    return result.data?.profiles ?? [];
  }

  private async loadApprovalQueue(authorityDir: string): Promise<ApprovalRequest[]> {
    const filePath = path.join(authorityDir, APPROVAL_QUEUE_FILE);
    const result = await readJsonWithRecovery<ApprovalQueueFile>(filePath, { requests: [] });
    return result.data?.requests ?? [];
  }

  // --------------------------------------------------------------------------
  // Persistence: Save
  // --------------------------------------------------------------------------

  private async persistAgents(projectPath: string): Promise<void> {
    const filePath = path.join(this.getAuthorityDir(projectPath), AGENTS_FILE);
    const data: AgentsFile = { agents: this.getAgentsForProject(projectPath) };
    await atomicWriteJson(filePath, data, { createDirs: true });
  }

  private async persistTrustProfiles(projectPath: string): Promise<void> {
    const filePath = path.join(this.getAuthorityDir(projectPath), TRUST_PROFILES_FILE);
    const data: TrustProfilesFile = { profiles: this.getTrustProfilesForProject(projectPath) };
    await atomicWriteJson(filePath, data, { createDirs: true });
  }

  private async persistApprovalQueue(projectPath: string): Promise<void> {
    const filePath = path.join(this.getAuthorityDir(projectPath), APPROVAL_QUEUE_FILE);
    const data: ApprovalQueueFile = { requests: this.getApprovalQueueForProject(projectPath) };
    await atomicWriteJson(filePath, data, { createDirs: true });
  }
}
