/**
 * Unit tests for ReactiveSpawner wiring in AvaChannelReactorService.
 *
 * Verifies that when a 'request' intent message arrives, the reactor calls
 * reactiveSpawnerService.spawnForMessage() instead of posting a plain text response.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted so the mock variable is available inside the vi.mock factory
const { mockLoggerInfo } = vi.hoisted(() => ({
  mockLoggerInfo: vi.fn(),
}));

// Mock logger before any imports that create module-level loggers
vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: mockLoggerInfo,
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { AvaChannelReactorService } from '@/services/ava-channel-reactor-service.js';
import type { ReactorDependencies } from '@/services/ava-channel-reactor-service.js';
import type { AvaChatMessage } from '@protolabsai/types';
import { DEFAULT_AVA_CHANNEL_REACTOR_SETTINGS } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<AvaChatMessage> = {}): AvaChatMessage {
  return {
    id: 'msg-request-1',
    content: 'Please help me with my task',
    timestamp: new Date().toISOString(),
    source: 'ava',
    instanceId: 'remote-instance',
    intent: 'request',
    expectsResponse: true,
    conversationDepth: 0,
    ...overrides,
  } as AvaChatMessage;
}

function makeDeps(
  overrides: Partial<ReactorDependencies> = {}
): ReactorDependencies & { _crdtDoc: { messages: AvaChatMessage[] } } {
  // Simulate a CRDT doc that the reactor will subscribe to
  const crdtDoc = { messages: [] as AvaChatMessage[] };

  let subscriberCallback: ((doc: { messages: AvaChatMessage[] }) => void) | null = null;

  return {
    avaChannelService: {
      postMessage: vi.fn().mockResolvedValue({ id: 'posted-ack' }),
    } as unknown as ReactorDependencies['avaChannelService'],
    crdtStore: {
      getOrCreate: vi.fn().mockResolvedValue({
        doc: () => ({ messages: [] }),
      }),
      subscribe: vi.fn((_, __, cb) => {
        subscriberCallback = cb;
        // Return unsubscribe fn
        return () => {
          subscriberCallback = null;
        };
      }),
      _trigger: (doc: { messages: AvaChatMessage[] }) => subscriberCallback?.(doc),
    } as unknown as ReactorDependencies['crdtStore'],
    instanceId: 'local-instance',
    instanceName: 'local-instance',
    settingsService: {
      getGlobalSettings: vi.fn().mockResolvedValue({
        avaChannelReactor: {
          ...DEFAULT_AVA_CHANNEL_REACTOR_SETTINGS,
          enabled: true,
        },
      }),
    },
    reactiveSpawnerService: {
      spawnForMessage: vi.fn().mockResolvedValue({ spawned: true, category: 'message' }),
    },
    _crdtDoc: crdtDoc,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AvaChannelReactorService — reactiveSpawnerService wiring', () => {
  let deps: ReturnType<typeof makeDeps>;
  let reactor: AvaChannelReactorService;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLoggerInfo.mockClear();
    deps = makeDeps();
    reactor = new AvaChannelReactorService(deps);
    await reactor.start();
  });

  it('calls spawnForMessage when a request intent message arrives', async () => {
    const message = makeMessage({ intent: 'request', expectsResponse: true });

    // Simulate a new message arriving in the CRDT doc
    (deps.crdtStore as unknown as { _trigger: (doc: unknown) => void })._trigger({
      messages: [message],
    });

    // Allow async operations to settle
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(deps.reactiveSpawnerService!.spawnForMessage).toHaveBeenCalledOnce();
    expect(deps.reactiveSpawnerService!.spawnForMessage).toHaveBeenCalledWith(message);
  });

  it('posts a "Working on it..." acknowledgment before spawning', async () => {
    const message = makeMessage({ intent: 'request', expectsResponse: true });

    (deps.crdtStore as unknown as { _trigger: (doc: unknown) => void })._trigger({
      messages: [message],
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const postMessageMock = deps.avaChannelService.postMessage as ReturnType<typeof vi.fn>;
    const firstCall = postMessageMock.mock.calls[0];
    expect(firstCall[0]).toBe('Working on it...');
  });

  it('does NOT call spawnForMessage for non-request classification types', async () => {
    // 'inform' messages do not expect a response, so the reactor should skip them
    // Use 'coordination' which goes through the handler path
    const message = makeMessage({
      intent: 'coordination',
      expectsResponse: true,
      source: 'ava',
      instanceId: 'remote-instance',
    });

    (deps.crdtStore as unknown as { _trigger: (doc: unknown) => void })._trigger({
      messages: [message],
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(deps.reactiveSpawnerService!.spawnForMessage).not.toHaveBeenCalled();
  });

  it('logs an info message after successfully spawning a session for a request-type message', async () => {
    const message = makeMessage({ intent: 'request', expectsResponse: true });

    (deps.crdtStore as unknown as { _trigger: (doc: unknown) => void })._trigger({
      messages: [message],
    });

    // Allow async operations to settle
    await new Promise((resolve) => setTimeout(resolve, 10));

    // At least one logger.info call should mention the message id and "spawned"
    const infoMessages: string[] = mockLoggerInfo.mock.calls
      .filter((args) => typeof args[0] === 'string')
      .map((args) => args[0] as string);
    const spawnLog = infoMessages.find(
      (msg) => msg.includes('dispatchResponse') && msg.includes(message.id)
    );
    expect(spawnLog).toBeDefined();
    expect(spawnLog).toContain('spawned session for request message');
  });

  it('falls back to text-only response when reactiveSpawnerService is not provided', async () => {
    // Create a reactor without reactiveSpawnerService
    const depsNoSpawner = makeDeps({ reactiveSpawnerService: undefined });
    const reactorNoSpawner = new AvaChannelReactorService(depsNoSpawner);
    await reactorNoSpawner.start();

    const message = makeMessage({ intent: 'request', expectsResponse: true });

    (depsNoSpawner.crdtStore as unknown as { _trigger: (doc: unknown) => void })._trigger({
      messages: [message],
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    const postMessageMock = depsNoSpawner.avaChannelService.postMessage as ReturnType<typeof vi.fn>;
    expect(postMessageMock).toHaveBeenCalled();
    // Should post a text-only fallback, not "Working on it..."
    const firstCall = postMessageMock.mock.calls[0];
    expect(firstCall[0]).toMatch(/\[Reactor\/request\]/);

    reactorNoSpawner.stop();
  });
});
