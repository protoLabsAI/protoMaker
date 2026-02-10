/**
 * Audit Trail Service - Persistent logging for authority system actions
 *
 * Provides an append-only audit trail of every proposal, decision, approval,
 * and escalation in the authority system. Stored as JSONL (one JSON object per line)
 * in .automaker/authority/audit.jsonl.
 *
 * Also tracks trust evolution: successful actions increase trust score,
 * escalations and failures decrease it. When score crosses threshold,
 * trust level is automatically promoted.
 */

import path from 'path';
import { createLogger } from '@automaker/utils';
import { getAutomakerDir } from '@automaker/platform';
import type { EventEmitter } from '../lib/events.js';
import type { AuthorityService } from './authority-service.js';
import * as secureFs from '../lib/secure-fs.js';

const logger = createLogger('AuditService');

const AUDIT_FILE = 'audit.jsonl';
const AUTHORITY_DIR = 'authority';

/** Trust score thresholds for auto-promotion */
const TRUST_PROMOTION_THRESHOLDS: Record<number, number> = {
  1: 20, // 20 successful actions to promote 1 → 2
  2: 50, // 50 successful actions to promote 2 → 3
};

/** Points awarded/deducted per event type */
const TRUST_SCORE_DELTAS: Record<string, number> = {
  approved: 1,
  auto_approved: 1,
  denied: -2,
  escalated: -1,
  approval_resolved_approve: 2,
  approval_resolved_reject: -1,
};

interface AuditEntry {
  timestamp: string;
  projectPath: string;
  eventType: string;
  agentId?: string;
  role?: string;
  action?: string;
  target?: string;
  risk?: string;
  verdict?: string;
  reason?: string;
  requestId?: string;
  resolution?: string;
  resolvedBy?: string;
  metadata?: Record<string, unknown>;
  // Decision tracking fields
  isDecision?: boolean;
  decisionType?: string;
  tags?: string[];
  relatedDecisions?: string[];
  supersededBy?: string;
  decisionId?: string; // Unique ID for this decision (for relatedDecisions/supersededBy references)
}

/** In-memory trust scores per agent (persisted via authority service) */
interface TrustScore {
  score: number;
  successCount: number;
  failureCount: number;
  escalationCount: number;
}

export class AuditService {
  private readonly events: EventEmitter;
  private authorityService: AuthorityService | null = null;
  private initialized = false;

  /** In-memory trust scores keyed by `${projectPath}:${agentId}` */
  private trustScores = new Map<string, TrustScore>();

  constructor(events: EventEmitter) {
    this.events = events;
  }

  /**
   * Initialize audit service. Subscribes to all authority events.
   */
  initialize(authorityService: AuthorityService): void {
    if (this.initialized) return;
    this.initialized = true;
    this.authorityService = authorityService;

    this.events.subscribe((type, payload) => {
      const data = payload as Record<string, unknown>;
      const projectPath = data.projectPath as string | undefined;

      switch (type) {
        case 'authority:proposal-submitted':
          void this.logProposal(data, projectPath);
          break;
        case 'authority:approved':
          void this.logApproved(data, projectPath);
          break;
        case 'authority:rejected':
          void this.logRejected(data, projectPath);
          break;
        case 'authority:awaiting-approval':
          void this.logAwaitingApproval(data, projectPath);
          break;
        case 'authority:agent-registered':
          void this.logAgentRegistered(data, projectPath);
          break;
        case 'authority:trust-updated':
          void this.logTrustUpdated(data, projectPath);
          break;
        case 'authority:idea-injected':
          void this.logIdeaInjected(data, projectPath);
          break;
      }
    });

    logger.info('Audit service initialized');
  }

  /**
   * Query audit entries for a project.
   */
  async query(
    projectPath: string,
    options?: {
      eventType?: string;
      agentId?: string;
      limit?: number;
      since?: string;
    }
  ): Promise<AuditEntry[]> {
    const entries = await this.readAuditLog(projectPath);
    let filtered = entries;

    if (options?.eventType) {
      filtered = filtered.filter((e) => e.eventType === options.eventType);
    }

    if (options?.agentId) {
      filtered = filtered.filter((e) => e.agentId === options.agentId);
    }

    if (options?.since) {
      const sinceDate = new Date(options.since).getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= sinceDate);
    }

    if (options?.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  /**
   * Query decision entries for a project.
   * Filters for entries with isDecision === true and supports additional decision-specific filters.
   */
  async queryDecisions(
    projectPath: string,
    options?: {
      agentId?: string;
      decisionType?: string;
      tags?: string[]; // Match entries containing any of these tags
      since?: string;
      limit?: number;
    }
  ): Promise<AuditEntry[]> {
    const entries = await this.readAuditLog(projectPath);
    let filtered = entries.filter((e) => e.isDecision === true);

    if (options?.agentId) {
      filtered = filtered.filter((e) => e.agentId === options.agentId);
    }

    if (options?.decisionType) {
      filtered = filtered.filter((e) => e.decisionType === options.decisionType);
    }

    if (options?.tags && options.tags.length > 0) {
      filtered = filtered.filter((e) => {
        if (!e.tags || e.tags.length === 0) return false;
        return options.tags!.some((tag) => e.tags!.includes(tag));
      });
    }

    if (options?.since) {
      const sinceDate = new Date(options.since).getTime();
      filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= sinceDate);
    }

    if (options?.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  /**
   * Get decision chain (lineage) for a specific decision.
   * Returns the decision with the given ID plus all related and superseding decisions.
   */
  async getDecisionChain(projectPath: string, decisionId: string): Promise<AuditEntry[]> {
    const entries = await this.readAuditLog(projectPath);
    const decisions = entries.filter((e) => e.isDecision === true);

    const chain: AuditEntry[] = [];
    const visited = new Set<string>();

    // Find the root decision
    const rootDecision = decisions.find((d) => d.decisionId === decisionId);
    if (!rootDecision) {
      return [];
    }

    // BFS to collect all related decisions
    const queue = [rootDecision];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentId = current.decisionId || '';

      if (!currentId || visited.has(currentId)) continue;
      visited.add(currentId);
      chain.push(current);

      // Add related decisions
      if (current.relatedDecisions) {
        for (const relatedId of current.relatedDecisions) {
          const related = decisions.find((d) => d.decisionId === relatedId);
          if (related && !visited.has(relatedId)) {
            queue.push(related);
          }
        }
      }

      // Add superseding decision
      if (current.supersededBy) {
        const superseding = decisions.find((d) => d.decisionId === current.supersededBy);
        if (superseding && !visited.has(current.supersededBy)) {
          queue.push(superseding);
        }
      }

      // Add decisions superseded by this one
      const superseded = decisions.filter(
        (d) => d.supersededBy === currentId && !visited.has(d.decisionId || '')
      );
      queue.push(...superseded);
    }

    // Sort by timestamp
    return chain.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * Get trust score for an agent.
   */
  getTrustScore(projectPath: string, agentId: string): TrustScore {
    const key = `${projectPath}:${agentId}`;
    return (
      this.trustScores.get(key) || {
        score: 0,
        successCount: 0,
        failureCount: 0,
        escalationCount: 0,
      }
    );
  }

  /**
   * Log a decision with structured metadata.
   * Decisions are special audit entries marked with isDecision=true.
   *
   * @param projectPath - The project path
   * @param decision - Decision details
   * @returns The generated decision ID
   */
  async logDecision(
    projectPath: string,
    decision: {
      agentId: string;
      role: string;
      decisionType: string;
      action: string;
      target?: string;
      verdict: string;
      reason: string;
      tags?: string[];
      relatedDecisions?: string[];
      supersedes?: string; // Decision ID this supersedes
      metadata?: Record<string, unknown>;
    }
  ): Promise<string> {
    const decisionId = `dec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      projectPath,
      eventType: 'decision_logged',
      agentId: decision.agentId,
      role: decision.role,
      action: decision.action,
      target: decision.target,
      verdict: decision.verdict,
      reason: decision.reason,
      isDecision: true,
      decisionId,
      decisionType: decision.decisionType,
      tags: decision.tags || [],
      relatedDecisions: decision.relatedDecisions || [],
      metadata: decision.metadata,
    };

    // If this decision supersedes another, mark the old one
    if (decision.supersedes) {
      entry.relatedDecisions = [...(entry.relatedDecisions || []), decision.supersedes];

      // Update the superseded decision
      const entries = await this.readAuditLog(projectPath);
      const supersededEntry = entries.find(
        (e) => e.isDecision && e.decisionId === decision.supersedes
      );

      if (supersededEntry) {
        supersededEntry.supersededBy = decisionId;
        // Re-write the entire log to update the superseded entry
        // This is safe because JSONL is append-only; we're just updating one entry
        await this.rewriteAuditLog(projectPath, entries);

        this.events.emit('decision:superseded', {
          projectPath,
          decisionId: decision.supersedes,
          supersededBy: decisionId,
        });
      }
    }

    await this.appendEntry(projectPath, entry);

    this.events.emit('decision:logged', {
      projectPath,
      decisionId,
      agentId: decision.agentId,
      decisionType: decision.decisionType,
      verdict: decision.verdict,
      reason: decision.reason,
    });

    return decisionId;
  }

  // --------------------------------------------------------------------------
  // Event Handlers
  // --------------------------------------------------------------------------

  private async logProposal(data: Record<string, unknown>, projectPath?: string): Promise<void> {
    if (!projectPath) return;
    const proposal = data.proposal as Record<string, unknown> | undefined;
    await this.appendEntry(projectPath, {
      timestamp: new Date().toISOString(),
      projectPath,
      eventType: 'proposal_submitted',
      agentId: proposal?.who as string,
      action: proposal?.what as string,
      target: proposal?.target as string,
      risk: proposal?.risk as string,
    });
  }

  private async logApproved(data: Record<string, unknown>, projectPath?: string): Promise<void> {
    if (!projectPath) return;
    const proposal = data.proposal as Record<string, unknown> | undefined;
    const agentId = proposal?.who as string;

    await this.appendEntry(projectPath, {
      timestamp: new Date().toISOString(),
      projectPath,
      eventType: 'approved',
      agentId,
      action: proposal?.what as string,
      target: proposal?.target as string,
      verdict: 'approved',
      requestId: data.requestId as string | undefined,
      resolution: data.resolution as string | undefined,
      resolvedBy: data.resolvedBy as string | undefined,
    });

    // Update trust score
    if (agentId) {
      const delta = data.resolvedBy
        ? TRUST_SCORE_DELTAS.approval_resolved_approve
        : TRUST_SCORE_DELTAS.auto_approved;
      this.updateTrustScore(projectPath, agentId, delta, 'success');
    }
  }

  private async logRejected(data: Record<string, unknown>, projectPath?: string): Promise<void> {
    if (!projectPath) return;
    const proposal = data.proposal as Record<string, unknown> | undefined;
    const decision = data.decision as Record<string, unknown> | undefined;
    const agentId = proposal?.who as string;

    await this.appendEntry(projectPath, {
      timestamp: new Date().toISOString(),
      projectPath,
      eventType: 'rejected',
      agentId,
      action: proposal?.what as string,
      target: proposal?.target as string,
      verdict: 'rejected',
      reason: decision?.reason as string,
    });

    if (agentId) {
      this.updateTrustScore(projectPath, agentId, TRUST_SCORE_DELTAS.denied, 'failure');
    }
  }

  private async logAwaitingApproval(
    data: Record<string, unknown>,
    projectPath?: string
  ): Promise<void> {
    if (!projectPath) return;
    const proposal = data.proposal as Record<string, unknown> | undefined;
    const agentId = proposal?.who as string;

    await this.appendEntry(projectPath, {
      timestamp: new Date().toISOString(),
      projectPath,
      eventType: 'awaiting_approval',
      agentId,
      action: proposal?.what as string,
      target: proposal?.target as string,
      risk: proposal?.risk as string,
      requestId: data.requestId as string,
    });

    if (agentId) {
      this.updateTrustScore(projectPath, agentId, TRUST_SCORE_DELTAS.escalated, 'escalation');
    }
  }

  private async logAgentRegistered(
    data: Record<string, unknown>,
    projectPath?: string
  ): Promise<void> {
    if (!projectPath) return;
    const agent = data.agent as Record<string, unknown> | undefined;

    await this.appendEntry(projectPath, {
      timestamp: new Date().toISOString(),
      projectPath,
      eventType: 'agent_registered',
      agentId: agent?.id as string,
      role: agent?.role as string,
      metadata: { trust: agent?.trust },
    });
  }

  private async logTrustUpdated(
    data: Record<string, unknown>,
    projectPath?: string
  ): Promise<void> {
    if (!projectPath) return;
    await this.appendEntry(projectPath, {
      timestamp: new Date().toISOString(),
      projectPath,
      eventType: 'trust_updated',
      agentId: data.agentId as string,
      role: data.role as string,
      metadata: {
        previousTrust: data.previousTrust,
        newTrustLevel: data.newTrustLevel,
      },
    });
  }

  private async logIdeaInjected(
    data: Record<string, unknown>,
    projectPath?: string
  ): Promise<void> {
    if (!projectPath) return;
    await this.appendEntry(projectPath, {
      timestamp: new Date().toISOString(),
      projectPath,
      eventType: 'idea_injected',
      target: data.featureId as string,
      metadata: {
        title: data.title,
        injectedBy: data.injectedBy,
      },
    });
  }

  // --------------------------------------------------------------------------
  // Trust Evolution
  // --------------------------------------------------------------------------

  /**
   * Update trust score for an agent and check for auto-promotion.
   */
  private updateTrustScore(
    projectPath: string,
    agentId: string,
    delta: number,
    type: 'success' | 'failure' | 'escalation'
  ): void {
    const key = `${projectPath}:${agentId}`;
    const score = this.trustScores.get(key) || {
      score: 0,
      successCount: 0,
      failureCount: 0,
      escalationCount: 0,
    };

    score.score += delta;

    switch (type) {
      case 'success':
        score.successCount++;
        break;
      case 'failure':
        score.failureCount++;
        break;
      case 'escalation':
        score.escalationCount++;
        break;
    }

    this.trustScores.set(key, score);

    // Check for auto-promotion
    void this.checkTrustPromotion(projectPath, agentId, score);
  }

  /**
   * Check if an agent qualifies for trust level promotion.
   */
  private async checkTrustPromotion(
    projectPath: string,
    agentId: string,
    score: TrustScore
  ): Promise<void> {
    if (!this.authorityService) return;

    const agents = await this.authorityService.getAgents(projectPath);
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;

    const currentTrust = agent.trust;
    const threshold = TRUST_PROMOTION_THRESHOLDS[currentTrust];

    if (threshold && score.score >= threshold && currentTrust < 3) {
      const newTrust = (currentTrust + 1) as 0 | 1 | 2 | 3;

      logger.info(
        `Trust promotion triggered for agent ${agentId}: ${currentTrust} → ${newTrust} (score: ${score.score})`
      );

      await this.authorityService.updateTrustLevel(agentId, newTrust, projectPath);

      // Reset score after promotion
      score.score = 0;
    }
  }

  // --------------------------------------------------------------------------
  // File I/O
  // --------------------------------------------------------------------------

  private getAuditFilePath(projectPath: string): string {
    return path.join(getAutomakerDir(projectPath), AUTHORITY_DIR, AUDIT_FILE);
  }

  private async appendEntry(projectPath: string, entry: AuditEntry): Promise<void> {
    try {
      const filePath = this.getAuditFilePath(projectPath);

      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!secureFs.existsSync(dir)) {
        await secureFs.mkdir(dir, { recursive: true });
      }

      const line = JSON.stringify(entry) + '\n';
      await secureFs.appendFile(filePath, line);
    } catch (error) {
      logger.error('Failed to write audit entry:', error);
    }
  }

  private async readAuditLog(projectPath: string): Promise<AuditEntry[]> {
    try {
      const filePath = this.getAuditFilePath(projectPath);
      if (!secureFs.existsSync(filePath)) {
        return [];
      }

      const content = (await secureFs.readFile(filePath, 'utf-8')) as string;
      const lines = content.split('\n').filter((line: string) => line.trim());

      return lines
        .map((line) => {
          try {
            return JSON.parse(line) as AuditEntry;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is AuditEntry => entry !== null);
    } catch (error) {
      logger.error('Failed to read audit log:', error);
      return [];
    }
  }

  /**
   * Rewrite the entire audit log.
   * Used when updating existing entries (e.g., marking a decision as superseded).
   */
  private async rewriteAuditLog(projectPath: string, entries: AuditEntry[]): Promise<void> {
    try {
      const filePath = this.getAuditFilePath(projectPath);
      const lines = entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
      await secureFs.writeFile(filePath, lines);
    } catch (error) {
      logger.error('Failed to rewrite audit log:', error);
    }
  }
}
