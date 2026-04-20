/**
 * End-to-end test for GOAP feedback loop prevention.
 *
 * Replays the original incident cascade (14+ waves) and verifies:
 * - Goal satisfied guard blocks dispatch when goal is already met (layer 0)
 * - Cooldown suppresses repeated incidents (layer 1)
 * - Dedup prevents duplicate filing (layer 2)
 * - Registry validation blocks phantom agents (layer 3)
 * - Circuit breaker pauses after threshold (layer 4)
 * - Blast radius is contained
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DispatchCooldown } from '@/lib/goap/dispatch-cooldown.js';
import { IncidentDedup } from '@/lib/goap/incident-dedup.js';
import { DispatchValidator, InvalidAgentError } from '@/lib/goap/dispatch-validator.js';
import { AgentCircuitBreakerManager } from '@/lib/goap/agent-circuit-breaker.js';
import {
  GoalSatisfiedGuard,
  createGoalSatisfiedGuard,
  type WorldStateSnapshot,
} from '@/lib/goap/goal-satisfied-guard.js';

describe('GOAP Feedback Loop Prevention (E2E)', () => {
  let cooldown: DispatchCooldown;
  let dedup: IncidentDedup;
  let validator: DispatchValidator;
  let circuitBreaker: AgentCircuitBreakerManager;
  let goalGuard: GoalSatisfiedGuard;

  beforeEach(() => {
    vi.useFakeTimers();

    cooldown = new DispatchCooldown({ cooldownWindowMs: 300_000 });
    dedup = new IncidentDedup();
    validator = new DispatchValidator({
      phantomAgentPatterns: ['auto-triage-sweep', 'system', 'user'],
      registryGracePeriodMs: 30_000,
    });
    circuitBreaker = new AgentCircuitBreakerManager({
      circuitBreakerThreshold: 5,
      circuitBreakerCooldownMs: 300_000,
    });
    goalGuard = createGoalSatisfiedGuard();

    // Register legitimate agents
    validator.registerAgent('lead-engineer-1');
    validator.registerAgent('lead-engineer-2');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /**
   * Simulate the full dispatch pipeline:
   * 0. Check goal satisfaction (pre-dispatch short-circuit)
   * 1. Check cooldown
   * 2. Check incident dedup
   * 3. Validate dispatch target
   * 4. Check circuit breaker
   * Returns reason if blocked, null if allowed.
   */
  function tryDispatch(opts: {
    action: string;
    agentId: string;
    skillId: string;
    incidentId: string;
    worldState?: WorldStateSnapshot;
  }): { allowed: boolean; blockedBy?: string; reason?: string } {
    // Step 0: Goal satisfied guard — skip dispatch if goal already met
    if (opts.worldState !== undefined) {
      const goalResult = goalGuard.evaluate(opts.skillId, opts.worldState);
      if (goalResult.satisfied) {
        return { allowed: false, blockedBy: 'goal_satisfied', reason: goalResult.reason };
      }
    }

    // Step 1: Cooldown check
    const cooldownKey = DispatchCooldown.buildKey(opts.action, opts.agentId, opts.skillId);
    const cooldownResult = cooldown.checkAndRecord(cooldownKey);
    if (cooldownResult.suppressed) {
      return { allowed: false, blockedBy: 'cooldown', reason: cooldownResult.reason };
    }

    // Step 2: Incident dedup check
    const dedupResult = dedup.checkForExisting(opts.agentId, opts.skillId);
    if (dedupResult.isDuplicate) {
      return {
        allowed: false,
        blockedBy: 'dedup',
        reason: `Duplicate of ${dedupResult.existingIncident!.id}`,
      };
    }

    // Step 3: Registry validation
    const registryResult = validator.validate(opts.agentId);
    if (!registryResult.valid) {
      return { allowed: false, blockedBy: 'registry', reason: registryResult.reason };
    }

    // Step 4: Circuit breaker
    if (circuitBreaker.isAgentCircuitOpen(opts.agentId)) {
      return { allowed: false, blockedBy: 'circuit_breaker', reason: 'Agent circuit is open' };
    }

    return { allowed: true };
  }

  describe('replays original incident cascade', () => {
    it('should contain blast radius from 14+ waves of incident storms', () => {
      const dispatched: string[] = [];
      const blocked: { wave: number; reason: string }[] = [];

      // Wave 1: First incident — should pass all checks
      const wave1 = tryDispatch({
        action: 'fleet_incident_response',
        agentId: 'lead-engineer-1',
        skillId: 'bug_triage',
        incidentId: 'INC-003',
      });
      expect(wave1.allowed).toBe(true);
      dispatched.push('INC-003');

      // Register the incident
      dedup.registerIncident({
        id: 'INC-003',
        agentId: 'lead-engineer-1',
        skillId: 'bug_triage',
        status: 'open',
        createdAt: Date.now(),
      });

      // Waves 2-14+: Repeated incident storms (same action, same agent+skill)
      for (let wave = 2; wave <= 15; wave++) {
        vi.advanceTimersByTime(10_000); // 10s between waves

        const result = tryDispatch({
          action: 'fleet_incident_response',
          agentId: 'lead-engineer-1',
          skillId: 'bug_triage',
          incidentId: `INC-${String(wave + 2).padStart(3, '0')}`,
        });

        expect(result.allowed).toBe(false);
        blocked.push({ wave, reason: result.blockedBy! });
      }

      // Verify: Only 1 dispatch got through, 13 were blocked
      expect(dispatched).toHaveLength(1);
      expect(blocked).toHaveLength(14);

      // First few waves blocked by cooldown, rest by cooldown too
      // (dedup would also catch them, but cooldown fires first)
      expect(blocked.every((b) => b.reason === 'cooldown')).toBe(true);
    });
  });

  describe('phantom agent routing prevention', () => {
    it('should block all dispatches to auto-triage-sweep', () => {
      const result = tryDispatch({
        action: 'fleet_incident_response',
        agentId: 'auto-triage-sweep',
        skillId: 'bug_triage',
        incidentId: 'INC-100',
      });

      // cooldown passes (first time), dedup passes, but registry catches it
      // Actually cooldown records the firing first, so need to check registry
      // With the pipeline: cooldown check passes (first time and records it),
      // dedup passes (no existing), registry rejects
      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toBe('registry');
    });

    it('should block system and user phantom agents', () => {
      for (const phantom of ['system', 'user']) {
        cooldown.clear(); // Reset for each test
        const result = tryDispatch({
          action: 'fleet_incident_response',
          agentId: phantom,
          skillId: 'any_skill',
          incidentId: 'INC-101',
        });
        expect(result.allowed).toBe(false);
        expect(result.blockedBy).toBe('registry');
      }
    });
  });

  describe('circuit breaker integration', () => {
    it('should auto-pause after N failures to same agent', () => {
      const agentId = 'lead-engineer-1';

      // Simulate 5 consecutive failures
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordAgentFailure(agentId);
      }

      // Next dispatch should be blocked by circuit breaker
      // Need to advance past cooldown or use different action keys
      vi.advanceTimersByTime(300_001); // past cooldown window

      const result = tryDispatch({
        action: 'fleet_incident_response',
        agentId,
        skillId: 'deploy',
        incidentId: 'INC-200',
      });

      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toBe('circuit_breaker');
    });
  });

  describe('dedup prevents duplicate INC filing', () => {
    it('should return existing incident instead of filing new one', () => {
      // Register open incident
      dedup.registerIncident({
        id: 'INC-003',
        agentId: 'lead-engineer-1',
        skillId: 'bug_triage',
        status: 'open',
        createdAt: Date.now(),
      });

      // Advance past cooldown so we can test dedup in isolation
      vi.advanceTimersByTime(300_001);

      const result = tryDispatch({
        action: 'fleet_incident_response',
        agentId: 'lead-engineer-1',
        skillId: 'bug_triage',
        incidentId: 'INC-004',
      });

      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toBe('dedup');
    });

    it('should allow filing after incident is resolved', () => {
      dedup.registerIncident({
        id: 'INC-003',
        agentId: 'lead-engineer-1',
        skillId: 'bug_triage',
        status: 'open',
        createdAt: Date.now(),
      });

      dedup.resolveIncident('INC-003');
      vi.advanceTimersByTime(300_001); // past cooldown

      const result = tryDispatch({
        action: 'fleet_incident_response',
        agentId: 'lead-engineer-1',
        skillId: 'bug_triage',
        incidentId: 'INC-019',
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('goal satisfied guard — layer 0 (GitHub #147, #148)', () => {
    it('should block investigate_orphaned_skills when orphaned_skill_count is 0 (#147)', () => {
      const result = tryDispatch({
        action: 'investigate_orphaned_skills',
        agentId: 'lead-engineer-1',
        skillId: 'investigate_orphaned_skills',
        incidentId: 'INC-147',
        worldState: { orphaned_skill_count: 0 },
      });
      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toBe('goal_satisfied');
      expect(result.reason).toContain('fleet.no_skill_orphaned');
    });

    it('should allow investigate_orphaned_skills when orphaned_skill_count > 0', () => {
      const result = tryDispatch({
        action: 'investigate_orphaned_skills',
        agentId: 'lead-engineer-1',
        skillId: 'investigate_orphaned_skills',
        incidentId: 'INC-147b',
        worldState: { orphaned_skill_count: 2 },
      });
      expect(result.allowed).toBe(true);
    });

    it('should block fleet_incident_response when stuck_agent_count is 0 (#148)', () => {
      const result = tryDispatch({
        action: 'fleet_incident_response',
        agentId: 'lead-engineer-2',
        skillId: 'fleet_incident_response',
        incidentId: 'INC-148',
        worldState: { stuck_agent_count: 0 },
      });
      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toBe('goal_satisfied');
      expect(result.reason).toContain('fleet.no_agent_stuck');
    });

    it('should allow fleet_incident_response when agents are still stuck', () => {
      const result = tryDispatch({
        action: 'fleet_incident_response',
        agentId: 'lead-engineer-2',
        skillId: 'fleet_incident_response',
        incidentId: 'INC-148b',
        worldState: { stuck_agent_count: 1 },
      });
      expect(result.allowed).toBe(true);
    });

    it('should allow dispatch when no worldState provided (backward compat — planner did not pass snapshot)', () => {
      // When no worldState is provided, the goal guard is skipped entirely.
      // This preserves backward compatibility for callers that do not yet
      // send a worldState snapshot with their dispatch.
      const result = tryDispatch({
        action: 'investigate_orphaned_skills',
        agentId: 'lead-engineer-1',
        skillId: 'investigate_orphaned_skills',
        incidentId: 'INC-149',
        // worldState intentionally omitted
      });
      // Goal guard skipped; should pass all other layers
      expect(result.allowed).toBe(true);
    });

    it('should catch goal_satisfied before cooldown (earliest possible layer)', () => {
      // First, dispatch once to prime the cooldown
      tryDispatch({
        action: 'fleet_incident_response',
        agentId: 'lead-engineer-1',
        skillId: 'fleet_incident_response',
        incidentId: 'INC-150a',
        worldState: { stuck_agent_count: 1 },
      });

      // Second dispatch: goal now satisfied AND cooldown active
      // Goal guard should fire before cooldown check
      const result = tryDispatch({
        action: 'fleet_incident_response',
        agentId: 'lead-engineer-1',
        skillId: 'fleet_incident_response',
        incidentId: 'INC-150b',
        worldState: { stuck_agent_count: 0 },
      });
      expect(result.allowed).toBe(false);
      expect(result.blockedBy).toBe('goal_satisfied');
    });
  });

  describe('combined defense layers', () => {
    it('should catch dispatches at the earliest possible layer', () => {
      // First dispatch passes all layers
      const first = tryDispatch({
        action: 'fleet_incident_response',
        agentId: 'lead-engineer-1',
        skillId: 'bug_triage',
        incidentId: 'INC-003',
      });
      expect(first.allowed).toBe(true);

      // Register the incident
      dedup.registerIncident({
        id: 'INC-003',
        agentId: 'lead-engineer-1',
        skillId: 'bug_triage',
        status: 'open',
        createdAt: Date.now(),
      });

      // Immediate retry — blocked by cooldown (layer 1)
      const retry = tryDispatch({
        action: 'fleet_incident_response',
        agentId: 'lead-engineer-1',
        skillId: 'bug_triage',
        incidentId: 'INC-004',
      });
      expect(retry.blockedBy).toBe('cooldown');

      // After cooldown but incident still open — blocked by dedup (layer 2)
      vi.advanceTimersByTime(300_001);
      const afterCooldown = tryDispatch({
        action: 'fleet_incident_response',
        agentId: 'lead-engineer-1',
        skillId: 'bug_triage',
        incidentId: 'INC-005',
      });
      expect(afterCooldown.blockedBy).toBe('dedup');

      // Phantom agent — blocked by registry (layer 3)
      vi.advanceTimersByTime(300_001);
      const phantom = tryDispatch({
        action: 'fleet_incident_response',
        agentId: 'auto-triage-sweep',
        skillId: 'bug_triage',
        incidentId: 'INC-006',
      });
      expect(phantom.blockedBy).toBe('registry');

      // Agent with open circuit — blocked by circuit breaker (layer 4)
      dedup.resolveIncident('INC-003');
      vi.advanceTimersByTime(300_001);
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordAgentFailure('lead-engineer-2');
      }
      // Re-register lead-engineer-2 so its lastSeenAt is fresh at the current
      // fake-timer position. Without this, the 900s total elapsed time exceeds
      // the 30s registryGracePeriodMs and the registry blocks the dispatch
      // before the circuit breaker gets a chance to run.
      validator.registerAgent('lead-engineer-2');
      const circuited = tryDispatch({
        action: 'fleet_incident_response',
        agentId: 'lead-engineer-2',
        skillId: 'deploy',
        incidentId: 'INC-007',
      });
      expect(circuited.blockedBy).toBe('circuit_breaker');
    });
  });
});
