import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuditService } from '@/services/audit-service.js';
import { AuthorityService } from '@/services/authority-service.js';
import { createEventEmitter } from '@/lib/events.js';
import * as secureFs from '@/lib/secure-fs.js';
import path from 'path';

vi.mock('@/lib/secure-fs.js');

describe('AuditService - Decision Tracking', () => {
  let auditService: AuditService;
  let authorityService: AuthorityService;
  const events = createEventEmitter();
  const testProjectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    authorityService = new AuthorityService(events);
    auditService = new AuditService(events);
    auditService.initialize(authorityService);

    // Mock file system
    vi.mocked(secureFs.existsSync).mockReturnValue(false);
    vi.mocked(secureFs.mkdir).mockResolvedValue(undefined);
    vi.mocked(secureFs.appendFile).mockResolvedValue();
    vi.mocked(secureFs.readFile).mockResolvedValue('');
    vi.mocked(secureFs.writeFile).mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('logDecision', () => {
    it('should log a decision with all metadata', async () => {
      const decision = {
        agentId: 'agent-123',
        role: 'product-manager',
        decisionType: 'prd_approval',
        action: 'approve_prd',
        target: 'feature-456',
        verdict: 'approved',
        reason: 'PRD meets all requirements',
        tags: ['prd', 'approval', 'medium'],
        metadata: {
          featureTitle: 'Test Feature',
          complexity: 'medium',
        },
      };

      const decisionId = await auditService.logDecision(testProjectPath, decision);

      expect(decisionId).toMatch(/^dec_\d+_[a-z0-9]+$/);
      expect(secureFs.appendFile).toHaveBeenCalled();

      const callArg = vi.mocked(secureFs.appendFile).mock.calls[0][1] as string;
      const logged = JSON.parse(callArg.trim());

      expect(logged.isDecision).toBe(true);
      expect(logged.decisionId).toBe(decisionId);
      expect(logged.decisionType).toBe('prd_approval');
      expect(logged.agentId).toBe('agent-123');
      expect(logged.verdict).toBe('approved');
      expect(logged.reason).toBe('PRD meets all requirements');
      expect(logged.tags).toEqual(['prd', 'approval', 'medium']);
    });

    it('should emit decision:logged event', async () => {
      const emitSpy = vi.spyOn(events, 'emit');

      const decision = {
        agentId: 'agent-123',
        role: 'product-manager',
        decisionType: 'prd_approval',
        action: 'approve_prd',
        target: 'feature-456',
        verdict: 'approved',
        reason: 'PRD meets all requirements',
      };

      const decisionId = await auditService.logDecision(testProjectPath, decision);

      expect(emitSpy).toHaveBeenCalledWith('decision:logged', {
        projectPath: testProjectPath,
        decisionId,
        agentId: 'agent-123',
        decisionType: 'prd_approval',
        verdict: 'approved',
        reason: 'PRD meets all requirements',
      });
    });

    it('should handle decision supersession', async () => {
      // Mock existing audit log with a decision to supersede
      const existingDecision = {
        timestamp: new Date().toISOString(),
        projectPath: testProjectPath,
        eventType: 'decision_logged',
        agentId: 'agent-123',
        isDecision: true,
        decisionId: 'dec_old_123',
        decisionType: 'prd_approval',
        verdict: 'approved',
        reason: 'Initial approval',
      };

      vi.mocked(secureFs.existsSync).mockReturnValue(true);
      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(existingDecision) + '\n');

      const emitSpy = vi.spyOn(events, 'emit');

      const newDecision = {
        agentId: 'agent-123',
        role: 'product-manager',
        decisionType: 'prd_approval',
        action: 'approve_prd',
        target: 'feature-456',
        verdict: 'approved',
        reason: 'Updated approval after changes',
        supersedes: 'dec_old_123',
      };

      const decisionId = await auditService.logDecision(testProjectPath, newDecision);

      expect(emitSpy).toHaveBeenCalledWith('decision:superseded', {
        projectPath: testProjectPath,
        decisionId: 'dec_old_123',
        supersededBy: decisionId,
      });

      expect(secureFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('queryDecisions', () => {
    beforeEach(() => {
      // Mock audit log with mixed entries (decisions and regular events)
      const entries = [
        {
          timestamp: '2024-01-01T10:00:00Z',
          projectPath: testProjectPath,
          eventType: 'proposal_submitted',
          agentId: 'agent-123',
        },
        {
          timestamp: '2024-01-01T10:05:00Z',
          projectPath: testProjectPath,
          eventType: 'decision_logged',
          agentId: 'agent-123',
          isDecision: true,
          decisionId: 'dec_1',
          decisionType: 'prd_approval',
          verdict: 'approved',
          reason: 'Meets requirements',
          tags: ['prd', 'approval', 'medium'],
        },
        {
          timestamp: '2024-01-01T10:10:00Z',
          projectPath: testProjectPath,
          eventType: 'approved',
          agentId: 'agent-123',
        },
        {
          timestamp: '2024-01-01T10:15:00Z',
          projectPath: testProjectPath,
          eventType: 'decision_logged',
          agentId: 'agent-456',
          isDecision: true,
          decisionId: 'dec_2',
          decisionType: 'model_escalation',
          verdict: 'escalated',
          reason: 'Complexity requires opus',
          tags: ['escalation', 'opus', 'large'],
        },
        {
          timestamp: '2024-01-01T10:20:00Z',
          projectPath: testProjectPath,
          eventType: 'decision_logged',
          agentId: 'agent-123',
          isDecision: true,
          decisionId: 'dec_3',
          decisionType: 'prd_changes_requested',
          verdict: 'changes_requested',
          reason: 'Needs more detail',
          tags: ['prd', 'changes_requested', 'small'],
        },
      ];

      vi.mocked(secureFs.existsSync).mockReturnValue(true);
      vi.mocked(secureFs.readFile).mockResolvedValue(
        entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
      );
    });

    it('should filter only decision entries', async () => {
      const decisions = await auditService.queryDecisions(testProjectPath);

      expect(decisions).toHaveLength(3);
      expect(decisions.every((d) => d.isDecision === true)).toBe(true);
    });

    it('should filter by agentId', async () => {
      const decisions = await auditService.queryDecisions(testProjectPath, {
        agentId: 'agent-123',
      });

      expect(decisions).toHaveLength(2);
      expect(decisions.every((d) => d.agentId === 'agent-123')).toBe(true);
    });

    it('should filter by decisionType', async () => {
      const decisions = await auditService.queryDecisions(testProjectPath, {
        decisionType: 'prd_approval',
      });

      expect(decisions).toHaveLength(1);
      expect(decisions[0].decisionType).toBe('prd_approval');
    });

    it('should filter by tags', async () => {
      const decisions = await auditService.queryDecisions(testProjectPath, {
        tags: ['prd'],
      });

      expect(decisions).toHaveLength(2);
      expect(decisions.every((d) => d.tags?.includes('prd'))).toBe(true);
    });

    it('should filter by multiple tags (OR logic)', async () => {
      const decisions = await auditService.queryDecisions(testProjectPath, {
        tags: ['prd', 'escalation'],
      });

      expect(decisions).toHaveLength(3);
    });

    it('should filter by time range', async () => {
      const decisions = await auditService.queryDecisions(testProjectPath, {
        since: '2024-01-01T10:12:00Z',
      });

      expect(decisions).toHaveLength(2);
    });

    it('should limit results', async () => {
      const decisions = await auditService.queryDecisions(testProjectPath, {
        limit: 2,
      });

      expect(decisions).toHaveLength(2);
    });

    it('should combine multiple filters', async () => {
      const decisions = await auditService.queryDecisions(testProjectPath, {
        agentId: 'agent-123',
        tags: ['prd'],
        limit: 1,
      });

      expect(decisions).toHaveLength(1);
      expect(decisions[0].agentId).toBe('agent-123');
      expect(decisions[0].tags).toContain('prd');
    });
  });

  describe('getDecisionChain', () => {
    beforeEach(() => {
      // Mock decision chain: dec_1 <-> dec_2 (supersedes dec_1, related to dec_1)
      const entries = [
        {
          timestamp: '2024-01-01T10:00:00Z',
          projectPath: testProjectPath,
          eventType: 'decision_logged',
          agentId: 'agent-123',
          isDecision: true,
          decisionId: 'dec_1',
          decisionType: 'prd_approval',
          verdict: 'approved',
          reason: 'Initial approval',
          supersededBy: 'dec_2',
        },
        {
          timestamp: '2024-01-01T10:05:00Z',
          projectPath: testProjectPath,
          eventType: 'decision_logged',
          agentId: 'agent-123',
          isDecision: true,
          decisionId: 'dec_2',
          decisionType: 'prd_approval',
          verdict: 'approved',
          reason: 'Updated approval',
          relatedDecisions: ['dec_1'],
        },
      ];

      vi.mocked(secureFs.existsSync).mockReturnValue(true);
      vi.mocked(secureFs.readFile).mockResolvedValue(
        entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
      );
    });

    it('should return decision chain in chronological order', async () => {
      const chain = await auditService.getDecisionChain(testProjectPath, 'dec_1');

      expect(chain).toHaveLength(2);
      expect(chain[0].decisionId).toBe('dec_1');
      expect(chain[1].decisionId).toBe('dec_2');
    });

    it('should follow supersededBy links', async () => {
      const chain = await auditService.getDecisionChain(testProjectPath, 'dec_1');

      const dec1 = chain.find((d) => d.decisionId === 'dec_1');
      const dec2 = chain.find((d) => d.decisionId === 'dec_2');

      expect(dec1?.supersededBy).toBe('dec_2');
      expect(dec2?.relatedDecisions).toContain('dec_1');
    });

    it('should return empty array for non-existent decision', async () => {
      const chain = await auditService.getDecisionChain(testProjectPath, 'dec_nonexistent');

      expect(chain).toHaveLength(0);
    });

    it('should handle single decision with no relations', async () => {
      const singleEntry = [
        {
          timestamp: '2024-01-01T10:00:00Z',
          projectPath: testProjectPath,
          eventType: 'decision_logged',
          agentId: 'agent-123',
          isDecision: true,
          decisionId: 'dec_single',
          decisionType: 'prd_approval',
          verdict: 'approved',
          reason: 'Standalone decision',
        },
      ];

      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(singleEntry[0]) + '\n');

      const chain = await auditService.getDecisionChain(testProjectPath, 'dec_single');

      expect(chain).toHaveLength(1);
      expect(chain[0].decisionId).toBe('dec_single');
    });
  });

  describe('backward compatibility', () => {
    it('should handle entries without decision fields', async () => {
      const entries = [
        {
          timestamp: '2024-01-01T10:00:00Z',
          projectPath: testProjectPath,
          eventType: 'approved',
          agentId: 'agent-123',
          verdict: 'approved',
        },
      ];

      vi.mocked(secureFs.existsSync).mockReturnValue(true);
      vi.mocked(secureFs.readFile).mockResolvedValue(JSON.stringify(entries[0]) + '\n');

      const decisions = await auditService.queryDecisions(testProjectPath);

      expect(decisions).toHaveLength(0);
    });

    it('should work with existing query method', async () => {
      const entries = [
        {
          timestamp: '2024-01-01T10:00:00Z',
          projectPath: testProjectPath,
          eventType: 'approved',
          agentId: 'agent-123',
        },
        {
          timestamp: '2024-01-01T10:05:00Z',
          projectPath: testProjectPath,
          eventType: 'decision_logged',
          agentId: 'agent-123',
          isDecision: true,
          decisionId: 'dec_1',
        },
      ];

      vi.mocked(secureFs.existsSync).mockReturnValue(true);
      vi.mocked(secureFs.readFile).mockResolvedValue(
        entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
      );

      const allEntries = await auditService.query(testProjectPath);

      expect(allEntries).toHaveLength(2);
    });
  });
});
