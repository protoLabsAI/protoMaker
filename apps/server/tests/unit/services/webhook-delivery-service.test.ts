import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebhookDeliveryService, type RetryHandler } from '@/services/webhook-delivery-service.js';
import { createEventEmitter } from '@/lib/events.js';
import type { EventEmitter } from '@/lib/events.js';

describe('WebhookDeliveryService', () => {
  let service: WebhookDeliveryService;
  let events: EventEmitter;

  beforeEach(() => {
    service = new WebhookDeliveryService();
    events = createEventEmitter();
    service.setEventEmitter(events);
  });

  afterEach(() => {
    service.shutdown();
  });

  // ---------------------------------------------------------------------------
  // Delivery tracking (create, complete, fail)
  // ---------------------------------------------------------------------------

  describe('trackDelivery', () => {
    it('creates a delivery record with pending status', () => {
      const id = service.trackDelivery('github', 'push');

      const delivery = service.getDelivery(id);
      expect(delivery).toBeDefined();
      expect(delivery!.source).toBe('github');
      expect(delivery!.eventType).toBe('push');
      expect(delivery!.status).toBe('pending');
      expect(delivery!.attempts).toBe(1);
      expect(delivery!.maxAttempts).toBe(3);
      expect(delivery!.receivedAt).toBeTruthy();
    });

    it('stores payload and metadata when provided', () => {
      const payload = { action: 'opened', pr: 42 };
      const metadata = { projectPath: '/test/project' };

      const id = service.trackDelivery('github', 'pull_request', payload, metadata);

      const delivery = service.getDelivery(id);
      expect(delivery!.payload).toEqual(payload);
      expect(delivery!.metadata).toEqual(metadata);
    });

    it('emits webhook:delivery:received event', () => {
      const received: unknown[] = [];
      events.on('webhook:delivery:received', (payload) => {
        received.push(payload);
      });

      const id = service.trackDelivery('discord', 'message');

      expect(received).toHaveLength(1);
      expect((received[0] as Record<string, unknown>).deliveryId).toBe(id);
      expect((received[0] as Record<string, unknown>).source).toBe('discord');
      expect((received[0] as Record<string, unknown>).eventType).toBe('message');
    });
  });

  describe('markCompleted', () => {
    it('sets status to completed with timestamp', () => {
      const id = service.trackDelivery('github', 'issues');
      service.markCompleted(id);

      const delivery = service.getDelivery(id);
      expect(delivery!.status).toBe('completed');
      expect(delivery!.completedAt).toBeTruthy();
    });

    it('emits webhook:delivery:completed event with duration', () => {
      const completed: unknown[] = [];
      events.on('webhook:delivery:completed', (payload) => {
        completed.push(payload);
      });

      const id = service.trackDelivery('github', 'push');
      service.markCompleted(id);

      expect(completed).toHaveLength(1);
      const event = completed[0] as Record<string, unknown>;
      expect(event.deliveryId).toBe(id);
      expect(typeof event.durationMs).toBe('number');
      expect(event.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('handles unknown delivery ID gracefully', () => {
      // Should not throw
      service.markCompleted('nonexistent-id');
    });
  });

  describe('markFailed', () => {
    it('records the error message', () => {
      const id = service.trackDelivery('github', 'push');
      service.markFailed(id, 'Connection refused');

      const delivery = service.getDelivery(id);
      expect(delivery!.lastError).toBe('Connection refused');
    });

    it('schedules retry when attempts remain', () => {
      const id = service.trackDelivery('github', 'push');
      service.markFailed(id, 'Timeout');

      const delivery = service.getDelivery(id);
      expect(delivery!.status).toBe('retrying');
      expect(delivery!.nextRetryAt).toBeTruthy();
    });

    it('marks permanently failed after max attempts', () => {
      const id = service.trackDelivery('github', 'push');

      // Simulate 3 failures (first attempt + 2 more through manual increments)
      const delivery = service.getDelivery(id)!;
      delivery.attempts = 3; // Already at max
      service.markFailed(id, 'Final failure');

      expect(delivery.status).toBe('failed');
      expect(delivery.lastError).toBe('Final failure');
    });

    it('emits webhook:delivery:failed event with willRetry flag', () => {
      const failed: unknown[] = [];
      events.on('webhook:delivery:failed', (payload) => {
        failed.push(payload);
      });

      const id = service.trackDelivery('github', 'push');
      service.markFailed(id, 'Error');

      expect(failed).toHaveLength(1);
      const event = failed[0] as Record<string, unknown>;
      expect(event.deliveryId).toBe(id);
      expect(event.error).toBe('Error');
      expect(event.willRetry).toBe(true);
    });

    it('emits with willRetry=false when exhausted', () => {
      const failed: unknown[] = [];
      events.on('webhook:delivery:failed', (payload) => {
        failed.push(payload);
      });

      const id = service.trackDelivery('github', 'push');
      const delivery = service.getDelivery(id)!;
      delivery.attempts = 3;
      service.markFailed(id, 'Done');

      const event = failed[0] as Record<string, unknown>;
      expect(event.willRetry).toBe(false);
    });

    it('handles unknown delivery ID gracefully', () => {
      service.markFailed('nonexistent-id', 'error');
    });
  });

  // ---------------------------------------------------------------------------
  // Retry with exponential backoff
  // ---------------------------------------------------------------------------

  describe('retry with exponential backoff', () => {
    it('emits retrying event with next attempt number', () => {
      const retrying: unknown[] = [];
      events.on('webhook:delivery:retrying', (payload) => {
        retrying.push(payload);
      });

      const id = service.trackDelivery('github', 'push');
      service.markFailed(id, 'timeout');

      expect(retrying).toHaveLength(1);
      const event = retrying[0] as Record<string, unknown>;
      expect(event.deliveryId).toBe(id);
      expect(event.attempt).toBe(2); // Next attempt = current (1) + 1
      expect(event.nextRetryAt).toBeTruthy();
    });

    it('executes retry handler on timer expiry', async () => {
      vi.useFakeTimers();

      const retryHandler = vi.fn<RetryHandler>().mockResolvedValue(undefined);
      service.setRetryHandler(retryHandler);

      const id = service.trackDelivery('github', 'push');
      service.markFailed(id, 'timeout');

      // Advance past the first retry delay (1000ms)
      await vi.advanceTimersByTimeAsync(1100);

      expect(retryHandler).toHaveBeenCalledTimes(1);
      expect(retryHandler).toHaveBeenCalledWith(expect.objectContaining({ id }));

      // Delivery should be completed after successful retry
      const delivery = service.getDelivery(id);
      expect(delivery!.status).toBe('completed');

      vi.useRealTimers();
    });

    it('marks failed again if retry handler throws', async () => {
      vi.useFakeTimers();

      const retryHandler = vi.fn<RetryHandler>().mockRejectedValue(new Error('Still broken'));
      service.setRetryHandler(retryHandler);

      const id = service.trackDelivery('github', 'push');
      service.markFailed(id, 'first failure');

      // Advance past the first retry delay
      await vi.advanceTimersByTimeAsync(1100);

      const delivery = service.getDelivery(id);
      // Attempt 2 failed, should schedule retry 3
      expect(delivery!.attempts).toBe(2);
      expect(delivery!.lastError).toBe('Still broken');

      vi.useRealTimers();
    });
  });

  // ---------------------------------------------------------------------------
  // Duplicate detection
  // ---------------------------------------------------------------------------

  describe('isDuplicate', () => {
    it('detects duplicate within the dedup window', () => {
      service.trackDelivery('github', 'push', undefined, {
        deduplicationKey: 'pr:42:opened:abc123',
      });

      expect(service.isDuplicate('github', 'push', 'pr:42:opened:abc123')).toBe(true);
    });

    it('returns false for different dedup keys', () => {
      service.trackDelivery('github', 'push', undefined, {
        deduplicationKey: 'pr:42:opened:abc123',
      });

      expect(service.isDuplicate('github', 'push', 'pr:43:opened:def456')).toBe(false);
    });

    it('returns false for different source', () => {
      service.trackDelivery('github', 'push', undefined, {
        deduplicationKey: 'key1',
      });

      expect(service.isDuplicate('discord', 'push', 'key1')).toBe(false);
    });

    it('returns false for different event type', () => {
      service.trackDelivery('github', 'push', undefined, {
        deduplicationKey: 'key1',
      });

      expect(service.isDuplicate('github', 'issues', 'key1')).toBe(false);
    });

    it('returns false when no metadata dedup key exists', () => {
      service.trackDelivery('github', 'push');

      expect(service.isDuplicate('github', 'push', 'any-key')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Regression: issues.opened delivery-id idempotency (GH #3300)
  //
  // Verifies that two arrivals of the same X-GitHub-Delivery ID for an
  // issues.opened event are deduplicated, and that the dedup window is 24h
  // (not 5 minutes) so GitHub retries arriving hours later are still caught.
  // ---------------------------------------------------------------------------

  describe('issues.opened delivery-id idempotency', () => {
    it('downstream handler fires only once when same delivery-id arrives twice', () => {
      const deliveryId = 'gh-delivery-uuid-999';
      const deduplicationKey = `issues:opened:${deliveryId}`;
      const handler = vi.fn();

      function simulateWebhookArrival(): boolean {
        if (service.isDuplicate('github', 'issues', deduplicationKey)) {
          return false; // duplicate — skip, return 200 without re-processing
        }
        service.trackDelivery('github', 'issues', undefined, { deduplicationKey });
        handler(); // downstream: Quinn bug_triage
        return true;
      }

      const first = simulateWebhookArrival();
      const second = simulateWebhookArrival(); // GitHub retry — same X-GitHub-Delivery

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('dedup window is 24h — retry arriving 23h later is still caught', () => {
      const deduplicationKey = 'issues:opened:late-retry-uuid';
      service.trackDelivery('github', 'issues', undefined, { deduplicationKey });

      // Advance fake clock by 23h — still within 24h window
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now + 23 * 60 * 60 * 1000);

      expect(service.isDuplicate('github', 'issues', deduplicationKey)).toBe(true);

      vi.restoreAllMocks();
    });

    it('dedup window expires after 24h — a delivery older than 24h is not a duplicate', () => {
      const deduplicationKey = 'issues:opened:expired-uuid';
      service.trackDelivery('github', 'issues', undefined, { deduplicationKey });

      // Advance fake clock beyond 24h window
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now + 25 * 60 * 60 * 1000);

      expect(service.isDuplicate('github', 'issues', deduplicationKey)).toBe(false);

      vi.restoreAllMocks();
    });

    it('two different issues (different delivery-ids) are both processed', () => {
      const handler = vi.fn();

      function simulateWebhookArrival(deliveryId: string): boolean {
        const deduplicationKey = `issues:opened:${deliveryId}`;
        if (service.isDuplicate('github', 'issues', deduplicationKey)) {
          return false;
        }
        service.trackDelivery('github', 'issues', undefined, { deduplicationKey });
        handler();
        return true;
      }

      const first = simulateWebhookArrival('delivery-issue-3299');
      const second = simulateWebhookArrival('delivery-issue-3300');

      expect(first).toBe(true);
      expect(second).toBe(true);
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Rolling window eviction at 500 entries
  // ---------------------------------------------------------------------------

  describe('rolling window eviction', () => {
    it('evicts oldest delivery when capacity is reached', () => {
      // Track 500 deliveries
      const ids: string[] = [];
      for (let i = 0; i < 500; i++) {
        ids.push(service.trackDelivery('github', `event-${i}`));
      }

      // Verify all 500 exist
      expect(service.getRecentDeliveries(600)).toHaveLength(500);

      // Track one more — the oldest should be evicted
      const newId = service.trackDelivery('github', 'event-500');

      const all = service.getRecentDeliveries(600);
      expect(all).toHaveLength(500);

      // The newest delivery should exist
      expect(service.getDelivery(newId)).toBeDefined();

      // The oldest delivery should be evicted
      expect(service.getDelivery(ids[0])).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Recent deliveries query
  // ---------------------------------------------------------------------------

  describe('getRecentDeliveries', () => {
    it('returns deliveries sorted newest first', () => {
      // Manually set distinct receivedAt timestamps to guarantee ordering,
      // since sub-millisecond creation can produce identical ISO strings.
      const id1 = service.trackDelivery('github', 'push');
      const id2 = service.trackDelivery('github', 'issues');
      const id3 = service.trackDelivery('github', 'pull_request');

      // Force distinct timestamps for deterministic sort
      const d1 = service.getDelivery(id1)!;
      const d2 = service.getDelivery(id2)!;
      const d3 = service.getDelivery(id3)!;
      d1.receivedAt = '2026-01-01T00:00:00.000Z';
      d2.receivedAt = '2026-01-01T00:00:01.000Z';
      d3.receivedAt = '2026-01-01T00:00:02.000Z';

      const recent = service.getRecentDeliveries();

      // Newest first — id3 has the latest receivedAt
      expect(recent[0].id).toBe(id3);
      expect(recent[1].id).toBe(id2);
      expect(recent[2].id).toBe(id1);
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        service.trackDelivery('github', `event-${i}`);
      }

      expect(service.getRecentDeliveries(5)).toHaveLength(5);
    });

    it('defaults to 100 limit', () => {
      for (let i = 0; i < 150; i++) {
        service.trackDelivery('github', `event-${i}`);
      }

      expect(service.getRecentDeliveries()).toHaveLength(100);
    });

    it('returns empty array when no deliveries exist', () => {
      expect(service.getRecentDeliveries()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Shutdown
  // ---------------------------------------------------------------------------

  describe('shutdown', () => {
    it('clears all retry timers', () => {
      const id = service.trackDelivery('github', 'push');
      service.markFailed(id, 'error');

      // Delivery should be in retrying state with a pending timer
      const delivery = service.getDelivery(id);
      expect(delivery!.status).toBe('retrying');

      // Shutdown should clear timers without errors
      service.shutdown();
    });
  });
});
