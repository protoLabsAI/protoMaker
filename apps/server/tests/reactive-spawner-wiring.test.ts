/**
 * ReactiveSpawnerService — wiring and budget control tests
 *
 * Verifies:
 * 1. ReactiveSpawnerService instantiates correctly with DynamicAgentExecutor + AgentFactoryService
 * 2. spawnForMessage routes through agentFactoryService.createFromTemplate('ava', …)
 * 3. Circuit breaker is active (opens after failureThreshold=3 failures)
 * 4. Hourly session cap (3/hour) is enforced
 * 5. Error deduplication set skips repeated error contexts
 * 6. ava-channel-reactor.module passes reactiveSpawnerService from container to AvaChannelReactorService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ReactiveSpawnerService,
  resetReactiveSpawnerService,
} from '../src/services/reactive-spawner-service.js';
import type { AvaChatMessage } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<AvaChatMessage> = {}): AvaChatMessage {
  return {
    id: 'msg-001',
    content: 'Hello, can you look into the failing CI?',
    author: 'user-123',
    authorName: 'josh',
    intent: 'request',
    expectsResponse: true,
    timestamp: Date.now(),
    instanceId: 'inst-1',
    conversationDepth: 0,
    ...overrides,
  } as AvaChatMessage;
}

function makeDeps(overrides: { executeSuccess?: boolean; executeError?: boolean } = {}) {
  const agentConfig = { template: 'ava', projectPath: '/repo' };

  const agentFactoryService = {
    createFromTemplate: vi.fn().mockReturnValue(agentConfig),
  };

  const dynamicAgentExecutor = {
    execute: vi.fn().mockResolvedValue(
      overrides.executeError
        ? { success: false, error: 'executor error', output: undefined }
        : {
            success: overrides.executeSuccess !== false,
            output: 'agent output',
            error: undefined,
          }
    ),
  };

  return { agentFactoryService, dynamicAgentExecutor };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReactiveSpawnerService', () => {
  // Reset singleton before each test to avoid cross-test contamination
  beforeEach(() => {
    resetReactiveSpawnerService();
  });

  afterEach(() => {
    resetReactiveSpawnerService();
  });

  // -------------------------------------------------------------------------
  // 1. Instantiation
  // -------------------------------------------------------------------------

  it('instantiates with required dependencies', () => {
    const { agentFactoryService, dynamicAgentExecutor } = makeDeps();
    const service = new ReactiveSpawnerService(
      agentFactoryService as never,
      dynamicAgentExecutor as never,
      '/repo'
    );
    expect(service).toBeInstanceOf(ReactiveSpawnerService);
    service.close();
  });

  // -------------------------------------------------------------------------
  // 2. spawnForMessage routes through agentFactoryService.createFromTemplate('ava', …)
  // -------------------------------------------------------------------------

  it('spawnForMessage calls createFromTemplate with "ava" template', async () => {
    const { agentFactoryService, dynamicAgentExecutor } = makeDeps();
    const service = new ReactiveSpawnerService(
      agentFactoryService as never,
      dynamicAgentExecutor as never,
      '/repo'
    );

    const result = await service.spawnForMessage(makeMessage());

    expect(result.spawned).toBe(true);
    expect(result.category).toBe('message');
    expect(agentFactoryService.createFromTemplate).toHaveBeenCalledWith('ava', '/repo');
    service.close();
  });

  it('spawnForMessage returns spawned=false and error when executor fails', async () => {
    const { agentFactoryService, dynamicAgentExecutor } = makeDeps({ executeError: true });
    const service = new ReactiveSpawnerService(
      agentFactoryService as never,
      dynamicAgentExecutor as never,
      '/repo'
    );

    const result = await service.spawnForMessage(makeMessage());

    expect(result.spawned).toBe(false);
    expect(result.error).toBe('executor error');
    service.close();
  });

  // -------------------------------------------------------------------------
  // 3. Concurrent guard — second call while first is running returns 'already_running'
  // -------------------------------------------------------------------------

  it('blocks concurrent spawns for the same category', async () => {
    const { agentFactoryService } = makeDeps();
    // Make execute block so the first call is still running when the second arrives
    let resolveExecute!: (v: unknown) => void;
    const slowExecutor = {
      execute: vi.fn().mockReturnValue(
        new Promise((resolve) => {
          resolveExecute = resolve;
        })
      ),
    };

    const service = new ReactiveSpawnerService(
      agentFactoryService as never,
      slowExecutor as never,
      '/repo'
    );

    const first = service.spawnForMessage(makeMessage({ id: 'msg-1' }));
    // Second call while first is pending
    const second = await service.spawnForMessage(makeMessage({ id: 'msg-2' }));

    expect(second.spawned).toBe(false);
    expect(second.skippedReason).toBe('already_running');

    // Let the first call finish
    resolveExecute({ success: true, output: 'done', error: undefined });
    await first;
    service.close();
  });

  // -------------------------------------------------------------------------
  // 4. Hourly session cap — 4th call within the same hour is rate-limited
  // -------------------------------------------------------------------------

  it('enforces the 3-sessions-per-hour cap', async () => {
    const { agentFactoryService, dynamicAgentExecutor } = makeDeps();
    const service = new ReactiveSpawnerService(
      agentFactoryService as never,
      dynamicAgentExecutor as never,
      '/repo'
    );

    // Consume all 3 hourly slots
    await service.spawnForMessage(makeMessage({ id: 'msg-1' }));
    await service.spawnForMessage(makeMessage({ id: 'msg-2' }));
    await service.spawnForMessage(makeMessage({ id: 'msg-3' }));

    // 4th call should be rate-limited
    const result = await service.spawnForMessage(makeMessage({ id: 'msg-4' }));
    expect(result.spawned).toBe(false);
    expect(result.skippedReason).toBe('rate_limited');
    service.close();
  });

  // -------------------------------------------------------------------------
  // 5. Error deduplication — repeated error contexts are skipped
  // -------------------------------------------------------------------------

  it('deduplicates repeated error contexts within the TTL window', async () => {
    const { agentFactoryService, dynamicAgentExecutor } = makeDeps();
    const service = new ReactiveSpawnerService(
      agentFactoryService as never,
      dynamicAgentExecutor as never,
      '/repo'
    );

    const errorCtx = { message: 'Out of memory', errorType: 'high_memory' };
    const first = await service.spawnForError(errorCtx);
    const second = await service.spawnForError(errorCtx);

    expect(first.spawned).toBe(true);
    expect(second.spawned).toBe(false);
    expect(second.skippedReason).toBe('duplicate_error');
    service.close();
  });

  // -------------------------------------------------------------------------
  // 6. Circuit breaker — opens after 3 consecutive failures
  // -------------------------------------------------------------------------

  it('opens the circuit breaker after 3 consecutive executor failures', async () => {
    const { agentFactoryService, dynamicAgentExecutor } = makeDeps({ executeError: true });
    const service = new ReactiveSpawnerService(
      agentFactoryService as never,
      dynamicAgentExecutor as never,
      '/repo'
    );

    // Three consecutive failures should trip the circuit breaker
    await service.spawnForCron('task-1', 'desc 1');
    await service.spawnForCron('task-2', 'desc 2');
    await service.spawnForCron('task-3', 'desc 3');

    // 4th attempt should be blocked by the open circuit
    const blocked = await service.spawnForCron('task-4', 'desc 4');
    expect(blocked.spawned).toBe(false);
    expect(blocked.skippedReason).toBe('circuit_open');
    service.close();
  });
});

// ---------------------------------------------------------------------------
// 7. AvaChannelReactorService wiring — verify that the reactor correctly
//    uses reactiveSpawnerService.spawnForMessage for request-type messages.
//
//    This tests the same code path that ava-channel-reactor.module wires:
//    container.reactiveSpawnerService → AvaChannelReactorService deps →
//    dispatchResponse calls spawnForMessage.
// ---------------------------------------------------------------------------

describe('AvaChannelReactorService wiring: reactiveSpawnerService', () => {
  it('calls reactiveSpawnerService.spawnForMessage for request-type messages', async () => {
    const { AvaChannelReactorService } =
      await import('../src/services/ava-channel-reactor-service.js');

    const spawnForMessage = vi.fn().mockResolvedValue({ spawned: true, category: 'message' });
    const mockReactiveSpawnerService = { spawnForMessage };

    const postMessage = vi.fn().mockResolvedValue({ id: 'posted-1' });
    const mockAvaChannelService = { postMessage };

    const service = new AvaChannelReactorService({
      avaChannelService: mockAvaChannelService as never,
      crdtStore: {} as never,
      instanceId: 'inst-test',
      instanceName: 'inst-test',
      settingsService: {
        getGlobalSettings: vi.fn().mockResolvedValue({ avaChannelReactor: { enabled: false } }),
      } as never,
      reactiveSpawnerService: mockReactiveSpawnerService,
    });

    const message: AvaChatMessage = {
      id: 'req-001',
      content: 'Please run the board health check.',
      author: 'user-1',
      authorName: 'josh',
      intent: 'request',
      expectsResponse: true,
      timestamp: Date.now(),
      instanceId: 'inst-1',
      conversationDepth: 0,
    } as AvaChatMessage;

    // Access private dispatchResponse via type cast (test-only)
    const svc = service as unknown as {
      dispatchResponse(
        msg: AvaChatMessage,
        classification: { type: string; shouldRespond: boolean }
      ): void;
    };

    svc.dispatchResponse(message, { type: 'request', shouldRespond: true });

    // Wait for the async chain inside dispatchResponse to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(postMessage).toHaveBeenCalledWith(
      'Working on it...',
      'ava',
      expect.objectContaining({ intent: 'response' })
    );
    expect(spawnForMessage).toHaveBeenCalledWith(message);
  });
});
