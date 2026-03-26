/**
 * Unit tests for ConcurrencyManager fair-share allocation.
 *
 * Covers:
 * - Single project consuming all slots while another has pending work
 * - Multiple projects competing for limited global capacity
 * - Projects below their minimum reservation
 * - Zero active projects edge case
 * - minConcurrency settings respected
 * - More active projects than available slots (oversubscription)
 * - Interaction between fair-share and per-project hard caps
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { ConcurrencyManager } from '../../../src/services/auto-mode/concurrency-manager.js';

describe('ConcurrencyManager — fair-share allocation', () => {
  let manager: ConcurrencyManager;

  beforeEach(() => {
    manager = new ConcurrencyManager();
  });

  // ── getAllProjectCounts ──────────────────────────────────────────────────

  describe('getAllProjectCounts', () => {
    it('returns empty map when no leases exist', () => {
      const counts = manager.getAllProjectCounts();
      expect(counts.size).toBe(0);
    });

    it('returns correct counts per project', () => {
      manager.acquire('f1', '/project-a', null, null);
      manager.acquire('f2', '/project-a', null, null);
      manager.acquire('f3', '/project-b', null, null);

      const counts = manager.getAllProjectCounts();
      expect(counts.get('/project-a')).toBe(2);
      expect(counts.get('/project-b')).toBe(1);
    });

    it('provides atomic snapshot (no TOCTOU)', () => {
      manager.acquire('f1', '/project-a', null, null);
      manager.acquire('f2', '/project-b', null, null);

      const counts = manager.getAllProjectCounts();
      // Mutating after snapshot should not affect the returned map
      manager.acquire('f3', '/project-a', null, null);
      expect(counts.get('/project-a')).toBe(1);
    });
  });

  // ── getActiveProjectPaths ───────────────────────────────────────────────

  describe('getActiveProjectPaths', () => {
    it('returns empty set when no leases exist', () => {
      expect(manager.getActiveProjectPaths().size).toBe(0);
    });

    it('returns distinct project paths', () => {
      manager.acquire('f1', '/project-a', null, null);
      manager.acquire('f2', '/project-a', null, null);
      manager.acquire('f3', '/project-b', null, null);

      const paths = manager.getActiveProjectPaths();
      expect(paths.size).toBe(2);
      expect(paths.has('/project-a')).toBe(true);
      expect(paths.has('/project-b')).toBe(true);
    });
  });

  // ── calculateFairShareForProject ────────────────────────────────────────

  describe('calculateFairShareForProject', () => {
    it('grants full global cap when only one project is active', () => {
      manager.acquire('f1', '/project-a', null, null);
      const globalCap = 4;
      const reservations = new Map<string, { min: number; max: number }>();
      reservations.set('/project-a', { min: 1, max: 4 });
      const pendingWork = new Set(['/project-a']);

      const share = manager.calculateFairShareForProject(
        '/project-a',
        globalCap,
        reservations,
        pendingWork
      );

      expect(share).toBe(4);
    });

    it('splits capacity fairly between two projects with default min=1', () => {
      manager.acquire('f1', '/project-a', null, null);
      manager.acquire('f2', '/project-b', null, null);
      const globalCap = 4;
      const reservations = new Map<string, { min: number; max: number }>();
      reservations.set('/project-a', { min: 1, max: 4 });
      reservations.set('/project-b', { min: 1, max: 4 });
      const pendingWork = new Set(['/project-a', '/project-b']);

      const shareA = manager.calculateFairShareForProject(
        '/project-a',
        globalCap,
        reservations,
        pendingWork
      );
      const shareB = manager.calculateFairShareForProject(
        '/project-b',
        globalCap,
        reservations,
        pendingWork
      );

      // Each project gets min(1) + floor(surplus(2) / 2) = 1 + 1 = 2
      expect(shareA).toBe(2);
      expect(shareB).toBe(2);
    });

    it('respects minConcurrency reservations', () => {
      manager.acquire('f1', '/project-a', null, null);
      manager.acquire('f2', '/project-a', null, null);
      manager.acquire('f3', '/project-b', null, null);
      const globalCap = 4;
      const reservations = new Map<string, { min: number; max: number }>();
      // Project A: min 1, max 4
      reservations.set('/project-a', { min: 1, max: 4 });
      // Project B: min 2, max 3 (guaranteed at least 2 slots)
      reservations.set('/project-b', { min: 2, max: 3 });
      const pendingWork = new Set(['/project-a', '/project-b']);

      const shareB = manager.calculateFairShareForProject(
        '/project-b',
        globalCap,
        reservations,
        pendingWork
      );

      // Reserved: 1 + 2 = 3. Surplus: 4 - 3 = 1. Both want surplus.
      // B gets min(2) + floor(1/2) = 2 + 0 = 2
      expect(shareB).toBeGreaterThanOrEqual(2);
      // But capped by max: 3
      expect(shareB).toBeLessThanOrEqual(3);
    });

    it('prevents a single project from starving others', () => {
      // Project A is consuming 3 of 4 slots. Project B has pending work.
      manager.acquire('f1', '/project-a', null, null);
      manager.acquire('f2', '/project-a', null, null);
      manager.acquire('f3', '/project-a', null, null);
      const globalCap = 4;
      const reservations = new Map<string, { min: number; max: number }>();
      reservations.set('/project-a', { min: 1, max: 4 });
      reservations.set('/project-b', { min: 1, max: 4 });
      const pendingWork = new Set(['/project-a', '/project-b']);

      const shareA = manager.calculateFairShareForProject(
        '/project-a',
        globalCap,
        reservations,
        pendingWork
      );
      const shareB = manager.calculateFairShareForProject(
        '/project-b',
        globalCap,
        reservations,
        pendingWork
      );

      // Both get fair share: min(1) + floor(2/2) = 2 each
      expect(shareA).toBe(2);
      expect(shareB).toBe(2);
    });

    it('uses default min=1, max=globalCap for unknown projects', () => {
      const globalCap = 4;
      const reservations = new Map<string, { min: number; max: number }>();
      // Only project-a is in reservations
      reservations.set('/project-a', { min: 1, max: 4 });
      const pendingWork = new Set(['/project-a', '/project-b']);

      // Project B is not in reservations — should get default {min:1, max:4}
      const shareB = manager.calculateFairShareForProject(
        '/project-b',
        globalCap,
        reservations,
        pendingWork
      );

      expect(shareB).toBeGreaterThanOrEqual(1);
      expect(shareB).toBeLessThanOrEqual(globalCap);
    });

    it('handles zero active projects gracefully', () => {
      const globalCap = 4;
      const reservations = new Map<string, { min: number; max: number }>();
      const pendingWork = new Set(['/project-a']);

      const share = manager.calculateFairShareForProject(
        '/project-a',
        globalCap,
        reservations,
        pendingWork
      );

      // Only one competing project, default min=1, max=globalCap
      // Reserved: 1, surplus: 3, 1 project wanting surplus
      // Share: 1 + 3 = 4
      expect(share).toBe(4);
    });

    it('handles oversubscription: more projects than global slots', () => {
      // 5 projects competing for 3 slots
      manager.acquire('f1', '/project-a', null, null);
      manager.acquire('f2', '/project-b', null, null);
      manager.acquire('f3', '/project-c', null, null);
      const globalCap = 3;
      const reservations = new Map<string, { min: number; max: number }>();
      reservations.set('/project-a', { min: 1, max: 3 });
      reservations.set('/project-b', { min: 1, max: 3 });
      reservations.set('/project-c', { min: 1, max: 3 });
      reservations.set('/project-d', { min: 1, max: 3 });
      reservations.set('/project-e', { min: 1, max: 3 });
      const pendingWork = new Set([
        '/project-a',
        '/project-b',
        '/project-c',
        '/project-d',
        '/project-e',
      ]);

      // Total reserved: 5 (min 1 each) > globalCap 3
      // Proportional scaling: floor(3/5) = 0, but min is guaranteed >= 1
      const shareA = manager.calculateFairShareForProject(
        '/project-a',
        globalCap,
        reservations,
        pendingWork
      );

      // Each project should get at least 1 (clamped) when oversubscribed
      expect(shareA).toBeGreaterThanOrEqual(1);
    });

    it('respects per-project hard cap (maxConcurrency)', () => {
      manager.acquire('f1', '/project-a', null, null);
      const globalCap = 10;
      const reservations = new Map<string, { min: number; max: number }>();
      // Project A has a hard cap of 2
      reservations.set('/project-a', { min: 1, max: 2 });
      const pendingWork = new Set(['/project-a']);

      const share = manager.calculateFairShareForProject(
        '/project-a',
        globalCap,
        reservations,
        pendingWork
      );

      // Even though global cap is 10, project is capped at 2
      expect(share).toBe(2);
    });

    it('never exceeds global cap', () => {
      const globalCap = 2;
      const reservations = new Map<string, { min: number; max: number }>();
      reservations.set('/project-a', { min: 1, max: 100 });
      const pendingWork = new Set(['/project-a']);

      const share = manager.calculateFairShareForProject(
        '/project-a',
        globalCap,
        reservations,
        pendingWork
      );

      expect(share).toBeLessThanOrEqual(globalCap);
    });

    it('distributes surplus only to projects with room above their min', () => {
      manager.acquire('f1', '/project-a', null, null);
      manager.acquire('f2', '/project-b', null, null);
      const globalCap = 6;
      const reservations = new Map<string, { min: number; max: number }>();
      // Project A: min=2, max=2 (already at cap, cannot use surplus)
      reservations.set('/project-a', { min: 2, max: 2 });
      // Project B: min=1, max=5 (can absorb surplus)
      reservations.set('/project-b', { min: 1, max: 5 });
      const pendingWork = new Set(['/project-a', '/project-b']);

      const shareA = manager.calculateFairShareForProject(
        '/project-a',
        globalCap,
        reservations,
        pendingWork
      );
      const shareB = manager.calculateFairShareForProject(
        '/project-b',
        globalCap,
        reservations,
        pendingWork
      );

      // A is capped at max=2
      expect(shareA).toBe(2);
      // B gets min(1) + all surplus floor(3/1) = 1 + 3 = 4, capped by max=5
      expect(shareB).toBe(4);
    });
  });

  // ── canProjectAcquireSlot ───────────────────────────────────────────────

  describe('canProjectAcquireSlot', () => {
    it('allows acquisition when project is below its fair share', () => {
      manager.acquire('f1', '/project-a', null, null);
      const globalCap = 4;
      const reservations = new Map<string, { min: number; max: number }>();
      reservations.set('/project-a', { min: 1, max: 4 });
      const pendingWork = new Set(['/project-a']);

      // Project A has 1 running + 0 starting, fair share = 4
      const canAcquire = manager.canProjectAcquireSlot(
        '/project-a',
        globalCap,
        reservations,
        pendingWork,
        0
      );

      expect(canAcquire).toBe(true);
    });

    it('blocks acquisition when project is at its fair share', () => {
      manager.acquire('f1', '/project-a', null, null);
      manager.acquire('f2', '/project-a', null, null);
      manager.acquire('f3', '/project-b', null, null);
      const globalCap = 4;
      const reservations = new Map<string, { min: number; max: number }>();
      reservations.set('/project-a', { min: 1, max: 4 });
      reservations.set('/project-b', { min: 1, max: 4 });
      const pendingWork = new Set(['/project-a', '/project-b']);

      // Project A has 2 running, fair share = 2
      const canAcquire = manager.canProjectAcquireSlot(
        '/project-a',
        globalCap,
        reservations,
        pendingWork,
        0
      );

      expect(canAcquire).toBe(false);
    });

    it('counts starting features toward occupied slots', () => {
      manager.acquire('f1', '/project-a', null, null);
      const globalCap = 4;
      const reservations = new Map<string, { min: number; max: number }>();
      reservations.set('/project-a', { min: 1, max: 2 });
      const pendingWork = new Set(['/project-a']);

      // 1 running + 1 starting = 2, which matches max
      const canAcquire = manager.canProjectAcquireSlot(
        '/project-a',
        globalCap,
        reservations,
        pendingWork,
        1
      );

      expect(canAcquire).toBe(false);
    });

    it('guarantees reservation even when other project is consuming slots', () => {
      // Project A has consumed 3 of 4 global slots
      manager.acquire('f1', '/project-a', null, null);
      manager.acquire('f2', '/project-a', null, null);
      manager.acquire('f3', '/project-a', null, null);
      const globalCap = 4;
      const reservations = new Map<string, { min: number; max: number }>();
      reservations.set('/project-a', { min: 1, max: 4 });
      reservations.set('/project-b', { min: 1, max: 4 });
      const pendingWork = new Set(['/project-a', '/project-b']);

      // Project B has 0 running, fair share = 2, so it can start
      const canAcquireB = manager.canProjectAcquireSlot(
        '/project-b',
        globalCap,
        reservations,
        pendingWork,
        0
      );

      expect(canAcquireB).toBe(true);

      // Project A has 3 running but fair share is only 2, so it should be blocked
      const canAcquireA = manager.canProjectAcquireSlot(
        '/project-a',
        globalCap,
        reservations,
        pendingWork,
        0
      );

      expect(canAcquireA).toBe(false);
    });

    it('allows both projects to start when global cap allows', () => {
      const globalCap = 4;
      const reservations = new Map<string, { min: number; max: number }>();
      reservations.set('/project-a', { min: 1, max: 4 });
      reservations.set('/project-b', { min: 1, max: 4 });
      const pendingWork = new Set(['/project-a', '/project-b']);

      // Both have 0 running, both should be able to start
      expect(
        manager.canProjectAcquireSlot('/project-a', globalCap, reservations, pendingWork, 0)
      ).toBe(true);
      expect(
        manager.canProjectAcquireSlot('/project-b', globalCap, reservations, pendingWork, 0)
      ).toBe(true);
    });
  });

  // ── Integration: starvation prevention ──────────────────────────────────

  describe('starvation prevention', () => {
    it('project B can always get at least 1 slot even when A is greedy', () => {
      // Simulate: Project A has maxed out at global cap minus 1
      for (let i = 0; i < 3; i++) {
        manager.acquire(`fa-${i}`, '/project-a', null, null);
      }
      const globalCap = 4;
      const reservations = new Map<string, { min: number; max: number }>();
      reservations.set('/project-a', { min: 1, max: 4 });
      reservations.set('/project-b', { min: 1, max: 4 });
      const pendingWork = new Set(['/project-a', '/project-b']);

      // B has 0 running, should always be able to acquire at least 1
      expect(
        manager.canProjectAcquireSlot('/project-b', globalCap, reservations, pendingWork, 0)
      ).toBe(true);
    });

    it('three projects with min=2 on globalCap=4 still each get at least 1', () => {
      manager.acquire('f1', '/project-a', null, null);
      manager.acquire('f2', '/project-b', null, null);
      manager.acquire('f3', '/project-c', null, null);
      const globalCap = 4;
      const reservations = new Map<string, { min: number; max: number }>();
      reservations.set('/project-a', { min: 2, max: 4 });
      reservations.set('/project-b', { min: 2, max: 4 });
      reservations.set('/project-c', { min: 2, max: 4 });
      const pendingWork = new Set(['/project-a', '/project-b', '/project-c']);

      // Total reserved: 6 > globalCap 4. Oversubscribed.
      // Even share: floor(4/3) = 1. Each project should get at least 1.
      const shareA = manager.calculateFairShareForProject(
        '/project-a',
        globalCap,
        reservations,
        pendingWork
      );
      const shareB = manager.calculateFairShareForProject(
        '/project-b',
        globalCap,
        reservations,
        pendingWork
      );
      const shareC = manager.calculateFairShareForProject(
        '/project-c',
        globalCap,
        reservations,
        pendingWork
      );

      expect(shareA).toBeGreaterThanOrEqual(1);
      expect(shareB).toBeGreaterThanOrEqual(1);
      expect(shareC).toBeGreaterThanOrEqual(1);
    });
  });
});
