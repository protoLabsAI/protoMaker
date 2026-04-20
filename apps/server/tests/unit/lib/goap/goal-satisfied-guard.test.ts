/**
 * Unit tests for GoalSatisfiedGuard
 *
 * Covers the pre-dispatch goal predicate evaluation that prevents
 * corrective GOAP actions from firing when the target goal is already met.
 *
 * Regression cases: GitHub #147 (investigate_orphaned_skills with orphanedSkillCount=0)
 * and #148 (fleet_incident_response after fleet.no_agent_stuck resolved).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GoalSatisfiedGuard,
  createGoalSatisfiedGuard,
  BUILTIN_GOAL_PREDICATES,
} from '@/lib/goap/goal-satisfied-guard.js';

describe('GoalSatisfiedGuard', () => {
  let guard: GoalSatisfiedGuard;

  beforeEach(() => {
    guard = new GoalSatisfiedGuard();
  });

  describe('register / getRegisteredSkills', () => {
    it('should start empty', () => {
      expect(guard.getRegisteredSkills()).toHaveLength(0);
    });

    it('should register a predicate and return skill ID', () => {
      guard.register('my_skill', () => false, 'my.goal', 'test description');
      expect(guard.getRegisteredSkills()).toContain('my_skill');
    });

    it('should return goal name for registered skill', () => {
      guard.register('my_skill', () => false, 'my.goal', 'test description');
      expect(guard.getGoalName('my_skill')).toBe('my.goal');
    });

    it('should return undefined goal name for unknown skill', () => {
      expect(guard.getGoalName('unknown_skill')).toBeUndefined();
    });
  });

  describe('evaluate — unknown skill', () => {
    it('should allow dispatch when no predicate registered for skill', () => {
      const result = guard.evaluate('unknown_skill', { some_key: 0 });
      expect(result.satisfied).toBe(false);
      expect(result.skillId).toBe('unknown_skill');
    });
  });

  describe('evaluate — goal satisfied', () => {
    it('should block dispatch when predicate returns true', () => {
      guard.register(
        'check_health',
        (state) => state['health_issues'] === 0,
        'system.healthy',
        'no health issues detected'
      );

      const result = guard.evaluate('check_health', { health_issues: 0 });
      expect(result.satisfied).toBe(true);
      expect(result.skillId).toBe('check_health');
      expect(result.goalName).toBe('system.healthy');
      expect(result.reason).toContain('system.healthy');
    });
  });

  describe('evaluate — goal not satisfied', () => {
    it('should allow dispatch when predicate returns false', () => {
      guard.register(
        'check_health',
        (state) => state['health_issues'] === 0,
        'system.healthy',
        'no health issues detected'
      );

      const result = guard.evaluate('check_health', { health_issues: 3 });
      expect(result.satisfied).toBe(false);
      expect(result.goalName).toBe('system.healthy');
    });
  });

  describe('evaluate — empty world state', () => {
    it('should not satisfy goal when world state has no matching key', () => {
      guard.register(
        'my_skill',
        (state) => typeof state['count'] === 'number' && state['count'] === 0,
        'my.goal',
        'count is zero'
      );

      // World state missing the key entirely — predicate returns false
      const result = guard.evaluate('my_skill', {});
      expect(result.satisfied).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all registered predicates', () => {
      guard.register('skill_a', () => true, 'goal.a', 'desc a');
      guard.register('skill_b', () => false, 'goal.b', 'desc b');
      guard.clear();
      expect(guard.getRegisteredSkills()).toHaveLength(0);
    });
  });
});

// ─── Built-in predicates ──────────────────────────────────────────────────────

describe('createGoalSatisfiedGuard (built-in predicates)', () => {
  let guard: GoalSatisfiedGuard;

  beforeEach(() => {
    guard = createGoalSatisfiedGuard();
  });

  it('should register all built-in skills', () => {
    const skills = guard.getRegisteredSkills();
    for (const { skillId } of BUILTIN_GOAL_PREDICATES) {
      expect(skills).toContain(skillId);
    }
  });

  describe('investigate_orphaned_skills (GitHub #147)', () => {
    it('should block dispatch when orphaned_skill_count is 0', () => {
      const result = guard.evaluate('investigate_orphaned_skills', { orphaned_skill_count: 0 });
      expect(result.satisfied).toBe(true);
      expect(result.goalName).toBe('fleet.no_skill_orphaned');
    });

    it('should allow dispatch when orphaned_skill_count > 0', () => {
      const result = guard.evaluate('investigate_orphaned_skills', { orphaned_skill_count: 3 });
      expect(result.satisfied).toBe(false);
    });

    it('should block dispatch when fleet_no_skill_orphaned boolean is true', () => {
      const result = guard.evaluate('investigate_orphaned_skills', {
        fleet_no_skill_orphaned: true,
      });
      expect(result.satisfied).toBe(true);
    });

    it('should allow dispatch when fleet_no_skill_orphaned boolean is false', () => {
      const result = guard.evaluate('investigate_orphaned_skills', {
        fleet_no_skill_orphaned: false,
      });
      expect(result.satisfied).toBe(false);
    });

    it('should allow dispatch when world state has no relevant key', () => {
      const result = guard.evaluate('investigate_orphaned_skills', { other_key: 0 });
      expect(result.satisfied).toBe(false);
    });
  });

  describe('fleet_incident_response (GitHub #148)', () => {
    it('should block dispatch when stuck_agent_count is 0', () => {
      const result = guard.evaluate('fleet_incident_response', { stuck_agent_count: 0 });
      expect(result.satisfied).toBe(true);
      expect(result.goalName).toBe('fleet.no_agent_stuck');
    });

    it('should allow dispatch when stuck_agent_count > 0', () => {
      const result = guard.evaluate('fleet_incident_response', { stuck_agent_count: 2 });
      expect(result.satisfied).toBe(false);
    });

    it('should block dispatch when fleet_no_agent_stuck boolean is true', () => {
      const result = guard.evaluate('fleet_incident_response', { fleet_no_agent_stuck: true });
      expect(result.satisfied).toBe(true);
    });

    it('should allow dispatch when fleet_no_agent_stuck boolean is false', () => {
      const result = guard.evaluate('fleet_incident_response', { fleet_no_agent_stuck: false });
      expect(result.satisfied).toBe(false);
    });

    it('should allow dispatch when world state has no relevant key', () => {
      const result = guard.evaluate('fleet_incident_response', { other_key: 'value' });
      expect(result.satisfied).toBe(false);
    });
  });

  describe('does not block non-goal-related skills', () => {
    it('should allow dispatch for skills with no registered predicate', () => {
      const result = guard.evaluate('deploy_feature', { stuck_agent_count: 0 });
      expect(result.satisfied).toBe(false);
    });
  });
});
