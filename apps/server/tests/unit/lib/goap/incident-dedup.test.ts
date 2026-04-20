/**
 * Unit tests for IncidentDedup
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IncidentDedup } from '@/lib/goap/incident-dedup.js';

describe('IncidentDedup', () => {
  let dedup: IncidentDedup;

  beforeEach(() => {
    dedup = new IncidentDedup();
  });

  describe('buildKey', () => {
    it('should build composite key from agent+skill', () => {
      expect(IncidentDedup.buildKey('agent-1', 'bug_triage')).toBe('agent-1:bug_triage');
    });
  });

  describe('checkForExisting', () => {
    it('should return not duplicate when no incidents exist', () => {
      const result = dedup.checkForExisting('agent-1', 'bug_triage');
      expect(result.isDuplicate).toBe(false);
    });

    it('should detect duplicate for open incident with matching key', () => {
      dedup.registerIncident({
        id: 'INC-001',
        agentId: 'agent-1',
        skillId: 'bug_triage',
        status: 'open',
        createdAt: Date.now(),
      });

      const result = dedup.checkForExisting('agent-1', 'bug_triage');
      expect(result.isDuplicate).toBe(true);
      expect(result.existingIncident?.id).toBe('INC-001');
    });

    it('should detect duplicate for investigating incident', () => {
      dedup.registerIncident({
        id: 'INC-002',
        agentId: 'agent-1',
        skillId: 'deploy',
        status: 'investigating',
        createdAt: Date.now(),
      });

      const result = dedup.checkForExisting('agent-1', 'deploy');
      expect(result.isDuplicate).toBe(true);
    });

    it('should not flag resolved incidents as duplicates', () => {
      dedup.registerIncident({
        id: 'INC-003',
        agentId: 'agent-1',
        skillId: 'bug_triage',
        status: 'open',
        createdAt: Date.now(),
      });
      dedup.resolveIncident('INC-003');

      const result = dedup.checkForExisting('agent-1', 'bug_triage');
      expect(result.isDuplicate).toBe(false);
    });

    it('should not cross-contaminate between different agent+skill pairs', () => {
      dedup.registerIncident({
        id: 'INC-004',
        agentId: 'agent-1',
        skillId: 'bug_triage',
        status: 'open',
        createdAt: Date.now(),
      });

      expect(dedup.checkForExisting('agent-2', 'bug_triage').isDuplicate).toBe(false);
      expect(dedup.checkForExisting('agent-1', 'deploy').isDuplicate).toBe(false);
    });
  });

  describe('registerIncident', () => {
    it('should register new incident and return it', () => {
      const result = dedup.registerIncident({
        id: 'INC-005',
        agentId: 'agent-1',
        skillId: 'code_review',
        status: 'open',
        createdAt: 1000,
      });

      expect(result.id).toBe('INC-005');
      expect(result.duplicateCount).toBe(0);
    });

    it('should return existing incident instead of creating duplicate', () => {
      dedup.registerIncident({
        id: 'INC-006',
        agentId: 'agent-1',
        skillId: 'code_review',
        status: 'open',
        createdAt: 1000,
      });

      const result = dedup.registerIncident({
        id: 'INC-007',
        agentId: 'agent-1',
        skillId: 'code_review',
        status: 'open',
        createdAt: 2000,
      });

      // Should return original, not the new one
      expect(result.id).toBe('INC-006');
      expect(result.duplicateCount).toBe(1);
    });
  });

  describe('resolveIncident', () => {
    it('should resolve and remove from dedup index', () => {
      dedup.registerIncident({
        id: 'INC-008',
        agentId: 'agent-1',
        skillId: 'test',
        status: 'open',
        createdAt: Date.now(),
      });

      const resolved = dedup.resolveIncident('INC-008');
      expect(resolved).toBe(true);

      const incident = dedup.getIncident('INC-008');
      expect(incident?.status).toBe('resolved');

      // New incident should now be allowed
      expect(dedup.checkForExisting('agent-1', 'test').isDuplicate).toBe(false);
    });

    it('should return false for unknown incident', () => {
      expect(dedup.resolveIncident('INC-999')).toBe(false);
    });
  });

  describe('getOpenIncidents', () => {
    it('should return only open and investigating incidents', () => {
      dedup.registerIncident({
        id: 'INC-010',
        agentId: 'a1',
        skillId: 's1',
        status: 'open',
        createdAt: 1000,
      });
      dedup.registerIncident({
        id: 'INC-011',
        agentId: 'a2',
        skillId: 's2',
        status: 'investigating',
        createdAt: 2000,
      });
      dedup.registerIncident({
        id: 'INC-012',
        agentId: 'a3',
        skillId: 's3',
        status: 'open',
        createdAt: 3000,
      });
      dedup.resolveIncident('INC-012');

      const open = dedup.getOpenIncidents();
      expect(open).toHaveLength(2);
      expect(open.map((i) => i.id).sort()).toEqual(['INC-010', 'INC-011']);
    });
  });

  describe('getTotalSuppressedCount', () => {
    it('should track total suppressed duplicates across all incidents', () => {
      dedup.registerIncident({
        id: 'INC-020',
        agentId: 'a1',
        skillId: 's1',
        status: 'open',
        createdAt: 1000,
      });

      // 3 duplicate attempts for same agent+skill
      dedup.checkForExisting('a1', 's1');
      dedup.checkForExisting('a1', 's1');
      dedup.checkForExisting('a1', 's1');

      expect(dedup.getTotalSuppressedCount()).toBe(3);
    });
  });

  describe('prevents INC-003 through INC-018 scenario', () => {
    it('should prevent 16 duplicate incidents from being filed', () => {
      // First incident is legitimate
      dedup.registerIncident({
        id: 'INC-003',
        agentId: 'auto-triage-sweep',
        skillId: 'bug_triage',
        status: 'open',
        createdAt: Date.now(),
      });

      // Simulate 15 more attempts (INC-004 through INC-018)
      const suppressedIds: string[] = [];
      for (let i = 4; i <= 18; i++) {
        const result = dedup.registerIncident({
          id: `INC-${String(i).padStart(3, '0')}`,
          agentId: 'auto-triage-sweep',
          skillId: 'bug_triage',
          status: 'open',
          createdAt: Date.now() + i * 1000,
        });
        if (result.id === 'INC-003') {
          suppressedIds.push(`INC-${String(i).padStart(3, '0')}`);
        }
      }

      expect(suppressedIds).toHaveLength(15);
      expect(dedup.getOpenIncidents()).toHaveLength(1);
      expect(dedup.getOpenIncidents()[0].id).toBe('INC-003');
    });
  });
});
