/**
 * Unit tests for DispatchCooldown
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DispatchCooldown } from '@/lib/goap/dispatch-cooldown.js';

describe('DispatchCooldown', () => {
  let cooldown: DispatchCooldown;

  beforeEach(() => {
    vi.useFakeTimers();
    cooldown = new DispatchCooldown({ cooldownWindowMs: 300_000 }); // 5 min
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('buildKey', () => {
    it('should build key from action only', () => {
      expect(DispatchCooldown.buildKey('fleet_incident_response')).toBe('fleet_incident_response');
    });

    it('should build key from action+agent', () => {
      expect(DispatchCooldown.buildKey('fleet_incident_response', 'agent-1')).toBe(
        'fleet_incident_response:agent-1'
      );
    });

    it('should build key from action+agent+skill', () => {
      expect(DispatchCooldown.buildKey('fleet_incident_response', 'agent-1', 'bug_triage')).toBe(
        'fleet_incident_response:agent-1:bug_triage'
      );
    });
  });

  describe('check', () => {
    it('should not suppress when no prior firing', () => {
      const result = cooldown.check('action:agent:skill');
      expect(result.suppressed).toBe(false);
    });

    it('should suppress within cooldown window', () => {
      cooldown.recordFiring('action:agent:skill');
      vi.advanceTimersByTime(60_000); // 1 min

      const result = cooldown.check('action:agent:skill');
      expect(result.suppressed).toBe(true);
      expect(result.remainingMs).toBe(240_000); // 4 min remaining
      expect(result.reason).toContain('Cooldown active');
    });

    it('should not suppress after cooldown expires', () => {
      cooldown.recordFiring('action:agent:skill');
      vi.advanceTimersByTime(300_001); // 5 min + 1ms

      const result = cooldown.check('action:agent:skill');
      expect(result.suppressed).toBe(false);
    });

    it('should track independent keys separately', () => {
      cooldown.recordFiring('action:agent-1:skill-a');
      vi.advanceTimersByTime(60_000);

      expect(cooldown.check('action:agent-1:skill-a').suppressed).toBe(true);
      expect(cooldown.check('action:agent-2:skill-b').suppressed).toBe(false);
    });
  });

  describe('checkAndRecord', () => {
    it('should record firing when not suppressed', () => {
      const result = cooldown.checkAndRecord('action:agent:skill');
      expect(result.suppressed).toBe(false);

      // Subsequent check should be suppressed
      expect(cooldown.check('action:agent:skill').suppressed).toBe(true);
    });

    it('should increment suppressed count on repeated attempts', () => {
      cooldown.checkAndRecord('action:agent:skill');

      cooldown.checkAndRecord('action:agent:skill');
      cooldown.checkAndRecord('action:agent:skill');

      const entries = cooldown.getEntries();
      expect(entries[0].suppressedCount).toBe(2);
    });
  });

  describe('prune', () => {
    it('should remove expired entries', () => {
      cooldown.recordFiring('key-1');
      vi.advanceTimersByTime(100_000);
      cooldown.recordFiring('key-2');
      vi.advanceTimersByTime(200_001); // key-1 now expired (300001ms), key-2 still active

      const pruned = cooldown.prune();
      expect(pruned).toBe(1);
      expect(cooldown.getEntries()).toHaveLength(1);
      expect(cooldown.getEntries()[0].key).toBe('key-2');
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cooldown.recordFiring('key-1');
      cooldown.recordFiring('key-2');
      cooldown.clear();
      expect(cooldown.getEntries()).toHaveLength(0);
    });
  });

  describe('5-minute cooldown window', () => {
    it('should enforce exactly 5-minute cooldown for fleet_incident_response', () => {
      const key = DispatchCooldown.buildKey('fleet_incident_response', 'agent-x', 'bug_triage');
      cooldown.recordFiring(key);

      // At 4:59 — still suppressed
      vi.advanceTimersByTime(299_000);
      expect(cooldown.check(key).suppressed).toBe(true);

      // At 5:00 — cooldown expires
      vi.advanceTimersByTime(1_000);
      expect(cooldown.check(key).suppressed).toBe(false);
    });
  });
});
