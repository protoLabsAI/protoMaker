/**
 * Tests for Ava Channel response handlers — verifies each handler posts
 * the correct response with one-shot policy (expectsResponse: false).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createDefaultHandlers,
  findHandler,
  type HandlerContext,
  type ReactorHandler,
} from '@/services/ava-channel-handlers.js';
import type { MessageClassification } from '@/services/ava-channel-classifiers.js';
import type { AvaChatMessage } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<AvaChatMessage> = {}): AvaChatMessage {
  return {
    id: 'msg-1',
    instanceId: 'remote-instance',
    instanceName: 'remote',
    content: 'Hello',
    source: 'ava',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeClassification(overrides: Partial<MessageClassification> = {}): MessageClassification {
  return {
    type: 'request',
    shouldRespond: true,
    ...overrides,
  };
}

function makeMockContext(): HandlerContext & {
  postMessageCalls: Array<{ content: string; source: string; options: Record<string, unknown> }>;
} {
  const postMessageCalls: Array<{
    content: string;
    source: string;
    options: Record<string, unknown>;
  }> = [];
  return {
    postMessageCalls,
    avaChannelService: {
      postMessage: vi.fn(async (content: string, source: string, options: unknown) => {
        postMessageCalls.push({
          content,
          source,
          options: options as Record<string, unknown>,
        });
        return makeMessage({ content, source: source as 'ava' | 'operator' | 'system' });
      }),
    } as unknown as HandlerContext['avaChannelService'],
    instanceId: 'local-instance',
    instanceName: 'local',
    getCapacity: () => ({ runningAgents: 1, maxAgents: 5, backlogCount: 3 }),
  };
}

// ---------------------------------------------------------------------------
// createDefaultHandlers
// ---------------------------------------------------------------------------

describe('createDefaultHandlers', () => {
  it('returns 4 handlers', () => {
    const handlers = createDefaultHandlers();
    expect(handlers).toHaveLength(4);
  });

  it('includes all expected handler IDs', () => {
    const handlers = createDefaultHandlers();
    const ids = handlers.map((h) => h.id);
    expect(ids).toContain('help-request');
    expect(ids).toContain('coordination');
    expect(ids).toContain('system-alert');
    expect(ids).toContain('escalation');
  });

  it('places SystemAlertHandler before EscalationHandler', () => {
    const handlers = createDefaultHandlers();
    const systemIdx = handlers.findIndex((h) => h.id === 'system-alert');
    const escalationIdx = handlers.findIndex((h) => h.id === 'escalation');
    expect(systemIdx).toBeLessThan(escalationIdx);
  });
});

// ---------------------------------------------------------------------------
// findHandler
// ---------------------------------------------------------------------------

describe('findHandler', () => {
  let handlers: ReactorHandler[];

  beforeEach(() => {
    handlers = createDefaultHandlers();
  });

  it('finds HelpRequestHandler for request classification', () => {
    const classification = makeClassification({ type: 'request' });
    const handler = findHandler(handlers, classification, makeMessage());
    expect(handler?.id).toBe('help-request');
  });

  it('finds CoordinationHandler for coordination classification', () => {
    const classification = makeClassification({ type: 'coordination' });
    const handler = findHandler(handlers, classification, makeMessage());
    expect(handler?.id).toBe('coordination');
  });

  it('finds SystemAlertHandler (first) for escalation classification', () => {
    const classification = makeClassification({ type: 'escalation' });
    const handler = findHandler(handlers, classification, makeMessage());
    // SystemAlertHandler comes first since it also handles 'escalation'
    expect(handler?.id).toBe('system-alert');
  });

  it('returns undefined for informational classification', () => {
    const classification = makeClassification({ type: 'informational' });
    const handler = findHandler(handlers, classification, makeMessage());
    expect(handler).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// HelpRequestHandler
// ---------------------------------------------------------------------------

describe('HelpRequestHandler', () => {
  it('posts response with capacity info when available', async () => {
    const ctx = makeMockContext();
    const handlers = createDefaultHandlers();
    const handler = handlers.find((h) => h.id === 'help-request')!;

    const result = await handler.handle(makeMessage(), makeClassification(), ctx);

    expect(result).toBe(true);
    expect(ctx.postMessageCalls).toHaveLength(1);
    expect(ctx.postMessageCalls[0].content).toContain('capacity');
    expect(ctx.postMessageCalls[0].content).toContain('1/5');
    expect(ctx.postMessageCalls[0].options.intent).toBe('response');
    expect(ctx.postMessageCalls[0].options.expectsResponse).toBe(false);
  });

  it('posts at-capacity message when full', async () => {
    const ctx = makeMockContext();
    ctx.getCapacity = () => ({ runningAgents: 5, maxAgents: 5, backlogCount: 10 });
    const handlers = createDefaultHandlers();
    const handler = handlers.find((h) => h.id === 'help-request')!;

    await handler.handle(makeMessage(), makeClassification(), ctx);

    expect(ctx.postMessageCalls[0].content).toContain('at capacity');
  });
});

// ---------------------------------------------------------------------------
// CoordinationHandler
// ---------------------------------------------------------------------------

describe('CoordinationHandler', () => {
  it('posts capacity metrics', async () => {
    const ctx = makeMockContext();
    const handlers = createDefaultHandlers();
    const handler = handlers.find((h) => h.id === 'coordination')!;

    const result = await handler.handle(
      makeMessage(),
      makeClassification({ type: 'coordination' }),
      ctx
    );

    expect(result).toBe(true);
    expect(ctx.postMessageCalls).toHaveLength(1);
    expect(ctx.postMessageCalls[0].content).toContain('1/5');
    expect(ctx.postMessageCalls[0].content).toContain('3 in backlog');
    expect(ctx.postMessageCalls[0].options.expectsResponse).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SystemAlertHandler
// ---------------------------------------------------------------------------

describe('SystemAlertHandler', () => {
  it('handles system-source escalation messages', async () => {
    const ctx = makeMockContext();
    const handlers = createDefaultHandlers();
    const handler = handlers.find((h) => h.id === 'system-alert')!;

    const result = await handler.handle(
      makeMessage({ source: 'system', content: '[SystemAlert] High CPU' }),
      makeClassification({ type: 'escalation' }),
      ctx
    );

    expect(result).toBe(true);
    expect(ctx.postMessageCalls).toHaveLength(1);
    expect(ctx.postMessageCalls[0].content).toContain('Acknowledged');
    expect(ctx.postMessageCalls[0].options.expectsResponse).toBe(false);
  });

  it('rejects non-system escalation messages', async () => {
    const ctx = makeMockContext();
    const handlers = createDefaultHandlers();
    const handler = handlers.find((h) => h.id === 'system-alert')!;

    const result = await handler.handle(
      makeMessage({ source: 'ava' }),
      makeClassification({ type: 'escalation' }),
      ctx
    );

    expect(result).toBe(false);
    expect(ctx.postMessageCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// EscalationHandler
// ---------------------------------------------------------------------------

describe('EscalationHandler', () => {
  it('handles non-system escalation messages', async () => {
    const ctx = makeMockContext();
    const handlers = createDefaultHandlers();
    const handler = handlers.find((h) => h.id === 'escalation')!;

    const result = await handler.handle(
      makeMessage({ source: 'ava', content: 'Need help with deployment' }),
      makeClassification({ type: 'escalation' }),
      ctx
    );

    expect(result).toBe(true);
    expect(ctx.postMessageCalls).toHaveLength(1);
    expect(ctx.postMessageCalls[0].content).toContain('Escalation');
    expect(ctx.postMessageCalls[0].options.expectsResponse).toBe(false);
  });

  it('rejects system-source messages (defers to SystemAlertHandler)', async () => {
    const ctx = makeMockContext();
    const handlers = createDefaultHandlers();
    const handler = handlers.find((h) => h.id === 'escalation')!;

    const result = await handler.handle(
      makeMessage({ source: 'system' }),
      makeClassification({ type: 'escalation' }),
      ctx
    );

    expect(result).toBe(false);
    expect(ctx.postMessageCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// One-shot response policy (cross-cutting)
// ---------------------------------------------------------------------------

describe('one-shot response policy', () => {
  it('all handlers post with expectsResponse:false', async () => {
    const handlers = createDefaultHandlers();

    const testCases: Array<{ handler: ReactorHandler; message: AvaChatMessage }> = [
      {
        handler: handlers.find((h) => h.id === 'help-request')!,
        message: makeMessage(),
      },
      {
        handler: handlers.find((h) => h.id === 'coordination')!,
        message: makeMessage(),
      },
      {
        handler: handlers.find((h) => h.id === 'system-alert')!,
        message: makeMessage({ source: 'system' }),
      },
      {
        handler: handlers.find((h) => h.id === 'escalation')!,
        message: makeMessage({ source: 'ava' }),
      },
    ];

    for (const { handler, message } of testCases) {
      const ctx = makeMockContext();
      const result = await handler.handle(message, makeClassification(), ctx);
      if (result) {
        expect(ctx.postMessageCalls[0].options.expectsResponse).toBe(false);
        expect(ctx.postMessageCalls[0].options.intent).toBe('response');
      }
    }
  });
});
