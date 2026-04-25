/**
 * Unit tests for DispatchValidator
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DispatchValidator, InvalidAgentError } from '@/lib/goap/dispatch-validator.js';

describe('DispatchValidator', () => {
  let validator: DispatchValidator;

  beforeEach(() => {
    vi.useFakeTimers();
    validator = new DispatchValidator({
      phantomAgentPatterns: ['auto-triage-sweep', 'system', 'user'],
      registryGracePeriodMs: 30_000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('phantom agent rejection', () => {
    it('should reject auto-triage-sweep', () => {
      const result = validator.validate('auto-triage-sweep');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('phantom agent pattern');
    });

    it('should reject system user accounts', () => {
      expect(validator.validate('system').valid).toBe(false);
      expect(validator.validate('user').valid).toBe(false);
    });

    it('should reject phantom agent with prefix match', () => {
      const result = validator.validate('auto-triage-sweep:sub-task');
      expect(result.valid).toBe(false);
    });

    it('should not reject legitimate agents', () => {
      validator.registerAgent('lead-engineer-1');
      expect(validator.validate('lead-engineer-1').valid).toBe(true);
    });
  });

  describe('registry validation', () => {
    it('should reject agent not in registry', () => {
      const result = validator.validate('unknown-agent');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not present in live fleet registry');
    });

    it('should accept registered agent within grace period', () => {
      validator.registerAgent('agent-1');
      expect(validator.validate('agent-1').valid).toBe(true);
    });

    it('should reject agent past grace period', () => {
      validator.registerAgent('agent-1');
      vi.advanceTimersByTime(31_000); // past 30s grace

      const result = validator.validate('agent-1');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('exceeds grace period');
    });

    it('should accept agent refreshed within grace period', () => {
      validator.registerAgent('agent-1');
      vi.advanceTimersByTime(20_000);
      validator.registerAgent('agent-1'); // refresh
      vi.advanceTimersByTime(20_000); // 40s total, but 20s since refresh

      expect(validator.validate('agent-1').valid).toBe(true);
    });
  });

  describe('refreshRegistry', () => {
    it('should add new agents and remove missing ones', () => {
      validator.registerAgent('agent-1');
      validator.registerAgent('agent-2');

      validator.refreshRegistry(['agent-2', 'agent-3']);

      expect(validator.validate('agent-1').valid).toBe(false); // removed
      expect(validator.validate('agent-2').valid).toBe(true);
      expect(validator.validate('agent-3').valid).toBe(true);
      expect(validator.getRegisteredCount()).toBe(2);
    });
  });

  describe('whitelist', () => {
    it('should bypass all validation for whitelisted agents', () => {
      validator.addWhitelist('transitioning-agent');
      expect(validator.validate('transitioning-agent').valid).toBe(true);
    });

    it('should bypass phantom check for whitelisted agents', () => {
      validator.addWhitelist('auto-triage-sweep');
      expect(validator.validate('auto-triage-sweep').valid).toBe(true);
    });

    it('should respect removal from whitelist', () => {
      validator.addWhitelist('temp-agent');
      validator.removeWhitelist('temp-agent');
      expect(validator.validate('temp-agent').valid).toBe(false);
    });
  });

  describe('validateOrThrow', () => {
    it('should throw InvalidAgentError for invalid agent', () => {
      expect(() => validator.validateOrThrow('auto-triage-sweep')).toThrow(InvalidAgentError);
    });

    it('should not throw for valid agent', () => {
      validator.registerAgent('good-agent');
      expect(() => validator.validateOrThrow('good-agent')).not.toThrow();
    });

    it('should include agent ID in error', () => {
      try {
        validator.validateOrThrow('phantom-agent');
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidAgentError);
        expect((e as InvalidAgentError).agentId).toBe('phantom-agent');
      }
    });
  });

  describe('deregisterAgent', () => {
    it('should remove agent from registry', () => {
      validator.registerAgent('agent-1');
      expect(validator.deregisterAgent('agent-1')).toBe(true);
      expect(validator.validate('agent-1').valid).toBe(false);
    });

    it('should return false for unknown agent', () => {
      expect(validator.deregisterAgent('unknown')).toBe(false);
    });
  });

  describe('getRegisteredAgents', () => {
    it('should return all registered agent IDs', () => {
      validator.registerAgent('a');
      validator.registerAgent('b');
      validator.registerAgent('c');
      expect(validator.getRegisteredAgents().sort()).toEqual(['a', 'b', 'c']);
    });
  });
});
