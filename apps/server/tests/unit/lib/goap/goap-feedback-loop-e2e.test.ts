/**
 * End-to-end test for GOAP feedback loop prevention.
 *
 * Replays the original incident cascade (14+ waves) and verifies:
 * - Cooldown suppresses repeated incidents
 * - Dedup prevents duplicate filing
 * - Registry validation blocks phantom agents
 * - Circuit breaker pauses after threshold
 * - Blast radius is contained
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DispatchCooldown } from '@/lib/goap/dispatch-cooldown.js';
import { IncidentDedup } from '@/lib/goap/incident-dedup.js';
import { DispatchValidator, InvalidAgentError } from '@/lib/goap/dispatch-validator.js';
import { AgentCircuitBreakerManager } from '@/lib/goap/agent-circuit-breaker.js';

describe('GOAP Feedback Loop Prevention (E2E)', () => {
  let cooldown: DispatchCooldown;
  let dedup: IncidentDedup;
  let validator: DispatchValidator;
  let circuitBreaker: AgentCircuitBreakerManager;

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

    // Register legitimate agents
    validator.registerAgent('lead-engineer-1');
    validator.registerAgent('lead-engineer-2');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const RESOLVED_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

  /**
   * Simulate the full dispatch pipeline:
   * 1. Check cooldown
   * 2. Check resolved-incident cooldown (1h post-resolution suppression)
   * 3. Check incident dedup (in-flight)
   * 4. Validate dispatch target
   * 5. Check circuit breaker
   * Returns reason if blocked, null if allowed.
   */
  function tryDispatch(opts: {
    action: string;
    agentId: string;
    skillId: string;
    incidentId: string;
    goalId?: string;
  }): { allowed: boolean; blockedBy?: string; reason?: string } {
    const cooldownKey = DispatchCooldown.buildKey(opts.action, opts.agentId, opts.skillId);

    // Step 1: Cooldown check — read-only; only record firing if dispatch is fully allowed
    // (recording here would re-arm the cooldown even when a later layer blocks the dispatch)
    const cooldownResult = cooldown.check(cooldownKey);
    if (cooldownResult.suppressed) {
      return { allowed: false, blockedBy: 'cooldown', reason: cooldownResult.reason };
    }

    // Step 2: Resolved-incident cooldown (1h post-resolution suppression per goal+agent)
    if (opts.goalId) {
      const resolvedResult = dedup.checkResolvedCooldown(
        opts.goalId,
        opts.agentId,
        RESOLVED_COOLDOWN_MS
      );
      if (resolvedResult.suppressed) {
        return {
          allowed: false,
          blockedBy: 'resolved_cooldown',
          reason: resolvedResult.reason,
        };
      }
    }

    // Step 3: Incident dedup check (in-flight)
    const dedupResult = dedup.checkForExisting(opts.agentId, opts.skillId);
    if (dedupResult.isDuplicate) {
      return {
        allowed: false,
        blockedBy: 'dedup',
        reason: `Duplicate of ${dedupResult.existingIncident!.id}`,
      };
    }

    // Step 4: Registry validation
    const registryResult = validator.validate(opts.agentId);
    if (!registryResult.valid) {
      return { allowed: false, blockedBy: 'registry', reason: registryResult.reason };
    }

    // Step 5: Circuit breaker
    if (circuitBreaker.isAgentCircuitOpen(opts.agentId)) {
      return { allowed: false, blockedBy: 'circuit_breaker', reason: 'Agent circuit is open' };
    }

    // All layers passed — record the cooldown firing now
    cooldown.recordFiring(cooldownKey);
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
      // Refresh agent so lastSeenAt is within registry grace period
      validator.registerAgent(agentId);

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

  describe('resolved-incident cooldown prevents re-dispatch after resolution', () => {
    it('should block re-dispatch within 1h after all incidents resolved (INC-003–INC-018 scenario)', () => {
      const goalId = 'fleet.no_agent_stuck';
      const agentId = 'lead-engineer-1';
      const skillId = 'bug_triage';

      // Wave 1: Dispatch allowed, incident registered
      const wave1 = tryDispatch({
        action: 'fleet_incident_response',
        agentId,
        skillId,
        incidentId: 'INC-003',
        goalId,
      });
      expect(wave1.allowed).toBe(true);

      dedup.registerIncident({
        id: 'INC-003',
        agentId,
        skillId,
        goalId,
        status: 'open',
        createdAt: Date.now(),
      });

      // Incident resolved — fleet health = 0 failures, 0 WIP
      dedup.resolveIncident('INC-003');

      // Advance past the 5-min dispatch cooldown but still within 1h resolved cooldown
      vi.advanceTimersByTime(10 * 60 * 1000); // 10 minutes

      // Re-dispatch attempt after resolution — should be blocked by resolved_cooldown
      const reDispatch = tryDispatch({
        action: 'fleet_incident_response',
        agentId,
        skillId,
        incidentId: 'INC-019',
        goalId,
      });
      expect(reDispatch.allowed).toBe(false);
      expect(reDispatch.blockedBy).toBe('resolved_cooldown');
    });

    it('should allow re-dispatch after 1h resolved cooldown expires', () => {
      const goalId = 'fleet.no_agent_stuck';
      const agentId = 'lead-engineer-1';

      dedup.registerIncident({
        id: 'INC-003',
        agentId,
        skillId: 'bug_triage',
        goalId,
        status: 'open',
        createdAt: Date.now(),
      });
      dedup.resolveIncident('INC-003');

      // Advance past both the 5-min dispatch cooldown AND the 1h resolved cooldown
      vi.advanceTimersByTime(RESOLVED_COOLDOWN_MS + 60_000); // 1h + 1 min
      // Refresh agent so lastSeenAt is within registry grace period
      validator.registerAgent(agentId);

      const reDispatch = tryDispatch({
        action: 'fleet_incident_response',
        agentId,
        skillId: 'bug_triage',
        incidentId: 'INC-020',
        goalId,
      });
      expect(reDispatch.allowed).toBe(true);
    });

    it('should contain INC-003–INC-018 storm: 1 allowed, 17 blocked (cooldown then resolved_cooldown)', () => {
      const goalId = 'fleet.no_agent_stuck';
      const agentId = 'lead-engineer-1';
      const skillId = 'bug_triage';
      const dispatched: string[] = [];
      const blocked: { id: string; blockedBy: string }[] = [];

      // Wave 1: INC-003 dispatched
      const wave1 = tryDispatch({
        action: 'fleet_incident_response',
        agentId,
        skillId,
        incidentId: 'INC-003',
        goalId,
      });
      expect(wave1.allowed).toBe(true);
      dispatched.push('INC-003');

      dedup.registerIncident({
        id: 'INC-003',
        agentId,
        skillId,
        goalId,
        status: 'open',
        createdAt: Date.now(),
      });

      // Waves 2-8: Within 5-min cooldown window — blocked by cooldown
      for (let i = 4; i <= 9; i++) {
        vi.advanceTimersByTime(30_000); // 30s between waves
        const result = tryDispatch({
          action: 'fleet_incident_response',
          agentId,
          skillId,
          incidentId: `INC-${String(i).padStart(3, '0')}`,
          goalId,
        });
        expect(result.allowed).toBe(false);
        blocked.push({ id: `INC-${String(i).padStart(3, '0')}`, blockedBy: result.blockedBy! });
      }

      // Incident resolves — fleet health clear
      dedup.resolveIncident('INC-003');

      // Waves 9-18: After 5-min cooldown but within 1h resolved cooldown — blocked by resolved_cooldown
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000); // past 5-min dispatch cooldown
      for (let i = 10; i <= 18; i++) {
        vi.advanceTimersByTime(60_000); // 1 min between waves
        const result = tryDispatch({
          action: 'fleet_incident_response',
          agentId,
          skillId,
          incidentId: `INC-${String(i).padStart(3, '0')}`,
          goalId,
        });
        expect(result.allowed).toBe(false);
        blocked.push({ id: `INC-${String(i).padStart(3, '0')}`, blockedBy: result.blockedBy! });
      }

      expect(dispatched).toHaveLength(1);
      expect(blocked.filter((b) => b.blockedBy === 'resolved_cooldown')).toHaveLength(9);
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
      vi.advanceTimersByTime(300_001); // past 5-min dispatch cooldown
      // Refresh agent so lastSeenAt is within registry grace period
      validator.registerAgent('lead-engineer-1');

      const result = tryDispatch({
        action: 'fleet_incident_response',
        agentId: 'lead-engineer-1',
        skillId: 'bug_triage',
        incidentId: 'INC-019',
      });

      expect(result.allowed).toBe(true);
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
