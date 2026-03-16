/**
 * EventRouterService Unit Tests
 *
 * Tests for:
 * - classifyAndRoute with ops signals
 * - classifyAndRoute with gtm signals
 * - Delivery event emission lifecycle
 * - Error handling and failed delivery recording
 * - Delivery query and filtering
 * - Retry of failed deliveries
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventRouterService } from '../../../src/services/event-router-service.js';
import type { SignalIntakeService } from '../../../src/services/signal-intake-service.js';
import type { EventEmitter } from '../../../src/lib/events.js';
import { createMockEventEmitter } from '../../helpers/mock-factories.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockSignalIntakeService(intentOverride?: string): SignalIntakeService {
  return {
    classifySignalIntent: vi.fn().mockReturnValue(intentOverride ?? 'work_order'),
    submitSignal: vi.fn(),
    getStatus: vi.fn().mockReturnValue({ active: true, signalCounts: {}, lastSignalAt: null }),
    getRecentSignals: vi.fn().mockReturnValue([]),
    getDeferredQueue: vi.fn().mockReturnValue([]),
    setHITLFormService: vi.fn(),
  } as unknown as SignalIntakeService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventRouterService', () => {
  let service: EventRouterService;
  let mockSignalIntake: SignalIntakeService;
  let mockEvents: ReturnType<typeof createMockEventEmitter>;

  beforeEach(() => {
    mockSignalIntake = createMockSignalIntakeService();
    mockEvents = createMockEventEmitter();
    service = new EventRouterService(mockSignalIntake, mockEvents as unknown as EventEmitter);
  });

  describe('classifyAndRoute', () => {
    it('should classify and route a GitHub ops signal', async () => {
      const result = await service.classifyAndRoute({
        source: 'github',
        eventType: 'issues.opened',
        payload: { content: 'Fix the login bug' },
      });

      expect(result.deliveryId).toBeTruthy();
      expect(result.classification.category).toBe('ops');
      expect(result.classification.intent).toBe('work_order');
      expect(result.routedTo).toBe('pm-pipeline');
    });

    it('should classify and route a Discord GTM signal', async () => {
      const result = await service.classifyAndRoute({
        source: 'discord',
        eventType: 'message.created',
        payload: {
          content: 'New campaign idea',
          channelContext: { channelName: 'marketing-plans' },
        },
      });

      expect(result.deliveryId).toBeTruthy();
      expect(result.classification.category).toBe('gtm');
      expect(result.routedTo).toBe('gtm-agent');
    });

    it('should route interrupt signals to HITL form', async () => {
      mockSignalIntake = createMockSignalIntakeService('interrupt');
      service = new EventRouterService(mockSignalIntake, mockEvents as unknown as EventEmitter);

      const result = await service.classifyAndRoute({
        source: 'discord',
        eventType: 'message.created',
        payload: { content: 'Production is down!' },
      });

      expect(result.routedTo).toBe('hitl-form');
      expect(result.classification.intent).toBe('interrupt');
    });

    it('should route conversational signals as dismissed', async () => {
      mockSignalIntake = createMockSignalIntakeService('conversational');
      service = new EventRouterService(mockSignalIntake, mockEvents as unknown as EventEmitter);

      const result = await service.classifyAndRoute({
        source: 'discord',
        eventType: 'message.created',
        payload: { content: 'GM team!' },
      });

      expect(result.routedTo).toBe('dismissed');
    });

    it('should submit the signal through the intake pipeline', async () => {
      await service.classifyAndRoute({
        source: 'github',
        eventType: 'issues.opened',
        payload: { content: 'Build the dashboard' },
      });

      expect(mockSignalIntake.submitSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'github',
          content: 'Build the dashboard',
        })
      );
    });

    it('should classify ui:content signals as gtm', async () => {
      const result = await service.classifyAndRoute({
        source: 'ui:content',
        eventType: 'content.created',
        payload: { content: 'Write a blog post about AI agents' },
      });

      expect(result.classification.category).toBe('gtm');
      expect(result.routedTo).toBe('gtm-agent');
    });
  });

  describe('delivery event emission', () => {
    it('should emit webhook:delivery:received on signal intake', async () => {
      await service.classifyAndRoute({
        source: 'github',
        eventType: 'issues.opened',
        payload: { content: 'Test' },
      });

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'webhook:delivery:received',
        expect.objectContaining({
          source: 'github',
          eventType: 'issues.opened',
          deliveryId: expect.any(String),
          timestamp: expect.any(String),
        })
      );
    });

    it('should emit webhook:delivery:completed on successful routing', async () => {
      await service.classifyAndRoute({
        source: 'github',
        eventType: 'issues.opened',
        payload: { content: 'Test' },
      });

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'webhook:delivery:completed',
        expect.objectContaining({
          source: 'github',
          eventType: 'issues.opened',
          routedTo: 'pm-pipeline',
          deliveryId: expect.any(String),
          durationMs: expect.any(Number),
          timestamp: expect.any(String),
        })
      );
    });

    it('should emit webhook:delivery:failed when classification throws', async () => {
      const brokenIntake = createMockSignalIntakeService();
      (brokenIntake.classifySignalIntent as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Classification engine offline');
      });
      const brokenService = new EventRouterService(
        brokenIntake,
        mockEvents as unknown as EventEmitter
      );

      await expect(
        brokenService.classifyAndRoute({
          source: 'github',
          eventType: 'issues.opened',
          payload: { content: 'Test' },
        })
      ).rejects.toThrow('Classification engine offline');

      expect(mockEvents.emit).toHaveBeenCalledWith(
        'webhook:delivery:failed',
        expect.objectContaining({
          source: 'github',
          eventType: 'issues.opened',
          error: 'Classification engine offline',
          deliveryId: expect.any(String),
          durationMs: expect.any(Number),
        })
      );
    });
  });

  describe('delivery record storage', () => {
    it('should store completed deliveries', async () => {
      await service.classifyAndRoute({
        source: 'github',
        eventType: 'issues.opened',
        payload: { content: 'Test signal' },
      });

      const deliveries = service.getDeliveries();
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].status).toBe('completed');
      expect(deliveries[0].source).toBe('github');
      expect(deliveries[0].classification?.category).toBe('ops');
    });

    it('should store failed deliveries', async () => {
      const brokenIntake = createMockSignalIntakeService();
      (brokenIntake.classifySignalIntent as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('fail');
      });
      const brokenService = new EventRouterService(
        brokenIntake,
        mockEvents as unknown as EventEmitter
      );

      try {
        await brokenService.classifyAndRoute({
          source: 'github',
          eventType: 'push',
          payload: {},
        });
      } catch {
        // expected
      }

      const deliveries = brokenService.getDeliveries({ status: 'failed' });
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].error).toBe('fail');
    });

    it('should filter deliveries by source', async () => {
      await service.classifyAndRoute({
        source: 'github',
        eventType: 'issues.opened',
        payload: { content: 'A' },
      });
      await service.classifyAndRoute({
        source: 'discord',
        eventType: 'message.created',
        payload: { content: 'B' },
      });

      const githubOnly = service.getDeliveries({ source: 'github' });
      expect(githubOnly).toHaveLength(1);
      expect(githubOnly[0].source).toBe('github');
    });

    it('should respect the limit filter', async () => {
      for (let i = 0; i < 5; i++) {
        await service.classifyAndRoute({
          source: 'github',
          eventType: 'push',
          payload: { content: `Signal ${i}` },
        });
      }

      const limited = service.getDeliveries({ limit: 2 });
      expect(limited).toHaveLength(2);
    });

    it('should return null for unknown delivery ID', () => {
      expect(service.getDelivery('nonexistent-id')).toBeNull();
    });

    it('should return a specific delivery by ID', async () => {
      const result = await service.classifyAndRoute({
        source: 'github',
        eventType: 'push',
        payload: { content: 'Test' },
      });

      const delivery = service.getDelivery(result.deliveryId);
      expect(delivery).not.toBeNull();
      expect(delivery!.deliveryId).toBe(result.deliveryId);
    });
  });

  describe('retryDelivery', () => {
    it('should throw for nonexistent delivery', async () => {
      await expect(service.retryDelivery('fake-id')).rejects.toThrow('not found');
    });

    it('should throw when delivery is not in failed state', async () => {
      const result = await service.classifyAndRoute({
        source: 'github',
        eventType: 'push',
        payload: { content: 'Test' },
      });

      await expect(service.retryDelivery(result.deliveryId)).rejects.toThrow('not in failed state');
    });

    it('should retry a failed delivery and create a new delivery record', async () => {
      // Create a failing delivery first
      const brokenIntake = createMockSignalIntakeService();
      let callCount = 0;
      (brokenIntake.classifySignalIntent as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++;
        if (callCount === 1) throw new Error('transient failure');
        return 'work_order';
      });
      const retryableService = new EventRouterService(
        brokenIntake,
        mockEvents as unknown as EventEmitter
      );

      let failedDeliveryId: string | undefined;
      try {
        await retryableService.classifyAndRoute({
          source: 'github',
          eventType: 'push',
          payload: { content: 'Test retry' },
        });
      } catch {
        const failed = retryableService.getDeliveries({ status: 'failed' });
        failedDeliveryId = failed[0]?.deliveryId;
      }

      expect(failedDeliveryId).toBeDefined();

      const retryResult = await retryableService.retryDelivery(failedDeliveryId!);
      expect(retryResult.deliveryId).not.toBe(failedDeliveryId);
      expect(retryResult.classification.category).toBe('ops');

      // Should now have 2 deliveries: the failed one and the retry
      const all = retryableService.getDeliveries();
      expect(all).toHaveLength(2);
    });
  });
});
