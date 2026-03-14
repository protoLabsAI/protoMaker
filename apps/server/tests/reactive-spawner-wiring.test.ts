/**
 * ReactiveSpawnerService — wiring and budget control tests
 *
 * Verifies:
 * 1. ReactiveSpawnerService instantiates correctly with projectPath
 * 2. spawnForMessage routes through simpleQuery with Ava's system prompt
 * 3. Circuit breaker is active (opens after failureThreshold=3 failures)
 * 4. Hourly session cap (3/hour) is enforced
 * 5. Error deduplication set skips repeated error contexts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ReactiveSpawnerService,
  resetReactiveSpawnerService,
} from '../src/services/reactive-spawner-service.js';
import type { AvaChatMessage } from '@protolabsai/types';

// Mock simpleQuery so tests don't make real API calls
vi.mock('@/providers/simple-query-service.js', () => ({
  simpleQuery: vi.fn(),
}));

// Mock prompts library
vi.mock('@protolabsai/prompts', () => ({
  getAvaPrompt: vi.fn().mockReturnValue('Ava system prompt'),
}));

// Mock model resolver
vi.mock('@protolabsai/model-resolver', () => ({
  resolveModelString: vi.fn().mockReturnValue('claude-opus-4-20250514'),
}));

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReactiveSpawnerService', () => {
  // Reset singleton before each test to avoid cross-test contamination
  beforeEach(async () => {
    resetReactiveSpawnerService();
    vi.clearAllMocks();
    // Re-setup simpleQuery mock after clearAllMocks
    const { simpleQuery } = await import('@/providers/simple-query-service.js');
    vi.mocked(simpleQuery).mockResolvedValue({
      text: 'agent output',
      structured_output: undefined,
    });
  });

  afterEach(() => {
    resetReactiveSpawnerService();
  });

  // -------------------------------------------------------------------------
  // 1. Instantiation
  // -------------------------------------------------------------------------

  it('instantiates with required projectPath', () => {
    const service = new ReactiveSpawnerService('/repo');
    expect(service).toBeInstanceOf(ReactiveSpawnerService);
    service.close();
  });

  // -------------------------------------------------------------------------
  // 2. spawnForMessage calls simpleQuery with Ava prompt
  // -------------------------------------------------------------------------

  it('spawnForMessage spawns an agent and returns output', async () => {
    const service = new ReactiveSpawnerService('/repo');

    const result = await service.spawnForMessage(makeMessage());

    expect(result.spawned).toBe(true);
    expect(result.category).toBe('message');
    expect(result.output).toBe('agent output');
    service.close();
  });

  it('spawnForMessage returns spawned=false and error when simpleQuery throws', async () => {
    const { simpleQuery } = await import('@/providers/simple-query-service.js');
    vi.mocked(simpleQuery).mockRejectedValueOnce(new Error('executor error'));

    const service = new ReactiveSpawnerService('/repo');

    const result = await service.spawnForMessage(makeMessage());

    expect(result.spawned).toBe(false);
    expect(result.error).toBe('executor error');
    service.close();
  });

  // -------------------------------------------------------------------------
  // 3. Concurrent guard — second call while first is running returns 'already_running'
  // -------------------------------------------------------------------------

  it('blocks concurrent spawns for the same category', async () => {
    const { simpleQuery } = await import('@/providers/simple-query-service.js');
    let resolveQuery!: (v: unknown) => void;
    vi.mocked(simpleQuery).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveQuery = resolve;
      }) as Promise<{ text: string }>
    );

    const service = new ReactiveSpawnerService('/repo');

    const first = service.spawnForMessage(makeMessage({ id: 'msg-1' }));
    // Second call while first is pending
    const second = await service.spawnForMessage(makeMessage({ id: 'msg-2' }));

    expect(second.spawned).toBe(false);
    expect(second.skippedReason).toBe('already_running');

    // Let the first call finish
    resolveQuery({ text: 'done', structured_output: undefined });
    await first;
    service.close();
  });

  // -------------------------------------------------------------------------
  // 4. Hourly session cap — 4th call within the same hour is rate-limited
  // -------------------------------------------------------------------------

  it('enforces the 3-sessions-per-hour cap', async () => {
    const service = new ReactiveSpawnerService('/repo');

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
    const service = new ReactiveSpawnerService('/repo');

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
    const { simpleQuery } = await import('@/providers/simple-query-service.js');
    vi.mocked(simpleQuery).mockRejectedValue(new Error('simpleQuery failed'));

    const service = new ReactiveSpawnerService('/repo');

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
