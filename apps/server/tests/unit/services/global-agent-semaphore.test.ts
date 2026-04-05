/**
 * Unit tests for GlobalAgentSemaphore.
 *
 * Covers:
 * - Immediate acquisition when below cap
 * - Queueing when cap is reached (N+1 th launch waits for a slot)
 * - Release unblocks the next queued waiter
 * - Multiple queued waiters are drained in FIFO order
 * - Double-release is a no-op
 * - Cap is read from settings when available
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { GlobalAgentSemaphore } from '../../../src/services/auto-mode/global-agent-semaphore.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock SettingsService that returns the given systemMaxConcurrency. */
function makeSettings(systemMaxConcurrency: number) {
  return {
    getGlobalSettings: vi.fn(async () => ({ systemMaxConcurrency })),
  } as unknown as import('../../../src/services/settings-service.js').SettingsService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GlobalAgentSemaphore', () => {
  let sem: GlobalAgentSemaphore;

  beforeEach(() => {
    sem = new GlobalAgentSemaphore();
  });

  // ── Immediate acquisition ────────────────────────────────────────────────

  it('grants a slot immediately when below cap', async () => {
    const settings = makeSettings(3);
    const release = await sem.acquire(settings);
    expect(sem.getActiveCount()).toBe(1);
    expect(sem.getQueueLength()).toBe(0);
    release();
  });

  it('allows up to cap slots to be active simultaneously', async () => {
    // Use cap=1 which is guaranteed to be <= MAX_SYSTEM_CONCURRENCY regardless
    // of the AUTOMAKER_MAX_CONCURRENCY env var value in this environment.
    const cap = 1;
    const settings = makeSettings(cap);
    const releases: Array<() => void> = [];

    for (let i = 0; i < cap; i++) {
      // Each acquire is async (reads settings), so await each one
      releases.push(await sem.acquire(settings));
    }

    expect(sem.getActiveCount()).toBe(cap);
    expect(sem.getQueueLength()).toBe(0);

    // Clean up
    for (const r of releases) r();
  });

  // ── Queueing when cap is reached ─────────────────────────────────────────

  it('queues the (N+1)th launch when cap N is reached', async () => {
    const cap = 2;
    const settings = makeSettings(cap);

    // Fill all slots
    const r1 = await sem.acquire(settings);
    const r2 = await sem.acquire(settings);

    expect(sem.getActiveCount()).toBe(cap);

    // The (cap+1)th call will read settings (async) then queue.
    // We start it but don't await — it suspends after queuing.
    let queued = false;
    const queuedPromise = sem.acquire(settings).then((release) => {
      queued = true;
      return release;
    });

    // Let the settings read + queue-insertion microtasks settle.
    // Two awaits: one for the settings promise, one for the queue push.
    await Promise.resolve();
    await Promise.resolve();

    expect(queued).toBe(false);
    expect(sem.getQueueLength()).toBe(1);

    // Release one slot — queued launch should now proceed
    r1();
    // Allow drain's async readCap + resolver microtasks to run
    await Promise.resolve();
    await Promise.resolve();

    const r3 = await queuedPromise;
    expect(queued).toBe(true);
    expect(sem.getActiveCount()).toBe(cap);
    expect(sem.getQueueLength()).toBe(0);

    // Clean up
    r2();
    r3();
  });

  it('queues multiple waiters and drains them in FIFO order', async () => {
    const cap = 1;
    const settings = makeSettings(cap);

    const r1 = await sem.acquire(settings);

    const order: number[] = [];
    const promises = [1, 2, 3].map((n) =>
      sem.acquire(settings).then((release) => {
        order.push(n);
        return release;
      })
    );

    // Allow all three acquire() calls to run their settings reads and queue themselves
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(sem.getQueueLength()).toBe(3);

    // Release one slot at a time and verify FIFO drain order
    r1();
    const rA = await promises[0];
    expect(order).toEqual([1]);

    rA();
    const rB = await promises[1];
    expect(order).toEqual([1, 2]);

    rB();
    const rC = await promises[2];
    expect(order).toEqual([1, 2, 3]);

    rC();
    expect(sem.getActiveCount()).toBe(0);
  });

  // ── Release semantics ────────────────────────────────────────────────────

  it('decrements active count on release', async () => {
    const settings = makeSettings(5);
    const release = await sem.acquire(settings);
    expect(sem.getActiveCount()).toBe(1);

    release();
    expect(sem.getActiveCount()).toBe(0);
  });

  it('double-release is a no-op (idempotent)', async () => {
    const settings = makeSettings(5);
    const release = await sem.acquire(settings);

    release();
    release(); // second call must not throw or decrement below zero

    expect(sem.getActiveCount()).toBe(0);
  });

  // ── Cap from settings ────────────────────────────────────────────────────

  it('uses MAX_SYSTEM_CONCURRENCY when settings are unavailable', async () => {
    // null settings → falls back to env-var hard limit (MAX_SYSTEM_CONCURRENCY)
    const { MAX_SYSTEM_CONCURRENCY } = await import('@protolabsai/types');

    const releases: Array<() => void> = [];
    for (let i = 0; i < MAX_SYSTEM_CONCURRENCY; i++) {
      releases.push(await sem.acquire(null));
    }

    expect(sem.getActiveCount()).toBe(MAX_SYSTEM_CONCURRENCY);

    // (cap+1) should queue
    let resolved = false;
    const pending = sem.acquire(null).then((r) => {
      resolved = true;
      return r;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(sem.getQueueLength()).toBe(1);

    // Clean up — release one to unblock pending
    releases[0]();
    const last = await pending;
    last();
    for (const r of releases.slice(1)) r();
  });

  it('uses systemMaxConcurrency from settings when provided', async () => {
    const settings = makeSettings(2);

    const r1 = await sem.acquire(settings);
    const r2 = await sem.acquire(settings);

    expect(sem.getActiveCount()).toBe(2);

    let blocked = false;
    sem.acquire(settings).then((r) => {
      blocked = true;
      r();
    });

    await Promise.resolve();
    expect(blocked).toBe(false);

    r1();
    await Promise.resolve();
    await Promise.resolve();
    expect(blocked).toBe(true);

    r2();
  });
});
