/**
 * Unit tests for the AvaChannelReactorService classifier chain and core behavior.
 *
 * Covers:
 * - Self-message rejection
 * - Ack-to-ack loop breaking via LoopBreakerRule and TerminalMessageRule
 * - work_request (request intent) routing
 * - All 9 classifier rules in the chain
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger before any imports that create module-level loggers
vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { createClassifierChain, runClassifierChain } from '@/services/ava-channel-classifiers.js';
import type { AvaChatMessage } from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<AvaChatMessage> = {}): AvaChatMessage {
  return {
    id: 'msg-1',
    content: 'hello',
    timestamp: new Date().toISOString(),
    source: 'ava',
    instanceId: 'remote-instance',
    intent: 'inform',
    expectsResponse: true,
    conversationDepth: 0,
    ...overrides,
  } as AvaChatMessage;
}

function makeChain(
  overrides: {
    maxConversationDepth?: number;
    staleThresholdMs?: number;
    runningAgents?: number;
    maxAgents?: number;
  } = {}
) {
  return createClassifierChain('local-instance', {
    maxConversationDepth: 5,
    staleThresholdMs: 5 * 60 * 1000,
    runningAgents: 0,
    maxAgents: 5,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Self-message rejection
// ---------------------------------------------------------------------------

describe('SelfMessageRule', () => {
  it('should reject messages from this instance', () => {
    const { rules, context } = makeChain();
    const message = makeMessage({ instanceId: 'local-instance' });

    const result = runClassifierChain(message, context, rules);

    expect(result.shouldRespond).toBe(false);
    expect(result.reason).toMatch(/originated from this instance/i);
  });

  it('should not reject messages from a different instance', () => {
    const { rules, context } = makeChain();
    const message = makeMessage({
      instanceId: 'remote-instance',
      intent: 'request',
      expectsResponse: true,
    });

    const result = runClassifierChain(message, context, rules);

    // Should reach RequestRule and respond
    expect(result.shouldRespond).toBe(true);
    expect(result.type).toBe('request');
  });
});

// ---------------------------------------------------------------------------
// Ack-to-ack cycle breaking
// ---------------------------------------------------------------------------

describe('LoopBreakerRule', () => {
  it('breaks the ack-to-ack cycle when conversation depth equals maxConversationDepth', () => {
    const { rules, context } = makeChain({ maxConversationDepth: 5 });
    const message = makeMessage({ conversationDepth: 5 });

    const result = runClassifierChain(message, context, rules);

    expect(result.shouldRespond).toBe(false);
    expect(result.reason).toMatch(/maxConversationDepth/i);
  });

  it('breaks the cycle when conversation depth exceeds maxConversationDepth', () => {
    const { rules, context } = makeChain({ maxConversationDepth: 5 });
    const message = makeMessage({ conversationDepth: 10 });

    const result = runClassifierChain(message, context, rules);

    expect(result.shouldRespond).toBe(false);
  });

  it('does not break when depth is below the cap', () => {
    const { rules, context } = makeChain({ maxConversationDepth: 5 });
    const message = makeMessage({ conversationDepth: 4, intent: 'request', expectsResponse: true });

    const result = runClassifierChain(message, context, rules);

    expect(result.shouldRespond).toBe(true);
  });
});

describe('TerminalMessageRule', () => {
  it('breaks the ack-to-ack cycle when expectsResponse is false (reactor acknowledgements)', () => {
    const { rules, context } = makeChain();
    const message = makeMessage({ expectsResponse: false });

    const result = runClassifierChain(message, context, rules);

    expect(result.shouldRespond).toBe(false);
    expect(result.reason).toMatch(/expectsResponse:false/i);
  });
});

// ---------------------------------------------------------------------------
// work_request routing (RequestRule)
// ---------------------------------------------------------------------------

describe('RequestRule', () => {
  it('routes work_request messages (intent:request + expectsResponse:true) to the request handler', () => {
    const { rules, context } = makeChain();
    const message = makeMessage({
      intent: 'request',
      expectsResponse: true,
      instanceId: 'remote-instance',
    });

    const result = runClassifierChain(message, context, rules);

    expect(result.shouldRespond).toBe(true);
    expect(result.type).toBe('request');
    expect(result.intent).toBe('request');
  });

  it('does not route request without expectsResponse:true', () => {
    const { rules, context } = makeChain();
    const message = makeMessage({
      intent: 'request',
      expectsResponse: false,
    });

    // TerminalMessageRule fires first (priority 90) before RequestRule (50)
    const result = runClassifierChain(message, context, rules);

    expect(result.shouldRespond).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// All 9 classifier rules
// ---------------------------------------------------------------------------

describe('Classifier chain — all 9 rules', () => {
  describe('LoopBreakerRule (priority 100)', () => {
    it('fires when conversationDepth >= maxConversationDepth', () => {
      const { rules, context } = makeChain({ maxConversationDepth: 3 });
      const result = runClassifierChain(makeMessage({ conversationDepth: 3 }), context, rules);
      expect(result.shouldRespond).toBe(false);
      expect(result.reason).toContain('maxConversationDepth');
    });
  });

  describe('TerminalMessageRule (priority 90)', () => {
    it('fires when expectsResponse is false', () => {
      const { rules, context } = makeChain();
      const result = runClassifierChain(
        makeMessage({ expectsResponse: false, conversationDepth: 0 }),
        context,
        rules
      );
      expect(result.shouldRespond).toBe(false);
      expect(result.reason).toContain('expectsResponse:false');
    });
  });

  describe('SelfMessageRule (priority 80)', () => {
    it('fires when instanceId matches localInstanceId', () => {
      const { rules, context } = makeChain();
      const result = runClassifierChain(
        makeMessage({ instanceId: 'local-instance', conversationDepth: 0 }),
        context,
        rules
      );
      expect(result.shouldRespond).toBe(false);
      expect(result.reason).toContain('originated from this instance');
    });
  });

  describe('StaleMessageRule (priority 75)', () => {
    it('fires when message is older than staleThresholdMs', () => {
      const { rules, context } = makeChain({ staleThresholdMs: 1000 });
      const staleTimestamp = new Date(Date.now() - 5000).toISOString();
      const result = runClassifierChain(
        makeMessage({
          timestamp: staleTimestamp,
          instanceId: 'remote',
          conversationDepth: 0,
          expectsResponse: true,
        }),
        context,
        rules
      );
      expect(result.shouldRespond).toBe(false);
      expect(result.reason).toContain('staleThresholdMs');
    });

    it('does not fire for fresh messages', () => {
      const { rules, context } = makeChain({ staleThresholdMs: 60_000 });
      const freshTimestamp = new Date().toISOString();
      const result = runClassifierChain(
        makeMessage({
          timestamp: freshTimestamp,
          instanceId: 'remote',
          conversationDepth: 0,
          intent: 'request',
          expectsResponse: true,
        }),
        context,
        rules
      );
      expect(result.shouldRespond).toBe(true);
    });
  });

  describe('SystemSourceRule (priority 70)', () => {
    it('fires for system source without action prefix — not shouldRespond', () => {
      const { rules, context } = makeChain();
      const result = runClassifierChain(
        makeMessage({
          source: 'system',
          content: 'just some info',
          instanceId: 'remote',
          conversationDepth: 0,
        }),
        context,
        rules
      );
      expect(result.shouldRespond).toBe(false);
      expect(result.type).toBe('informational');
    });

    it('fires as escalation for [BugReport] system messages', () => {
      const { rules, context } = makeChain();
      const result = runClassifierChain(
        makeMessage({
          source: 'system',
          content: '[BugReport] something broke',
          instanceId: 'remote',
          conversationDepth: 0,
        }),
        context,
        rules
      );
      expect(result.shouldRespond).toBe(true);
      expect(result.type).toBe('escalation');
    });

    it('fires as escalation for [SystemAlert] system messages', () => {
      const { rules, context } = makeChain();
      const result = runClassifierChain(
        makeMessage({
          source: 'system',
          content: '[SystemAlert] disk full',
          instanceId: 'remote',
          conversationDepth: 0,
        }),
        context,
        rules
      );
      expect(result.shouldRespond).toBe(true);
      expect(result.type).toBe('escalation');
    });
  });

  describe('RequestRule (priority 50)', () => {
    it('fires when intent:request and expectsResponse:true', () => {
      const { rules, context } = makeChain();
      const result = runClassifierChain(
        makeMessage({
          intent: 'request',
          expectsResponse: true,
          instanceId: 'remote',
          conversationDepth: 0,
        }),
        context,
        rules
      );
      expect(result.shouldRespond).toBe(true);
      expect(result.type).toBe('request');
    });
  });

  describe('CoordinationRule (priority 40)', () => {
    it('fires and responds when instance has capacity', () => {
      const { rules, context } = makeChain({ runningAgents: 2, maxAgents: 5 });
      const result = runClassifierChain(
        makeMessage({
          intent: 'coordination',
          expectsResponse: true,
          instanceId: 'remote',
          conversationDepth: 0,
        }),
        context,
        rules
      );
      expect(result.type).toBe('coordination');
      expect(result.shouldRespond).toBe(true);
    });

    it('fires and does not respond when instance is at capacity', () => {
      const { rules, context } = makeChain({ runningAgents: 5, maxAgents: 5 });
      const result = runClassifierChain(
        makeMessage({
          intent: 'coordination',
          expectsResponse: true,
          instanceId: 'remote',
          conversationDepth: 0,
        }),
        context,
        rules
      );
      expect(result.type).toBe('coordination');
      expect(result.shouldRespond).toBe(false);
    });
  });

  describe('EscalationRule (priority 30)', () => {
    it('fires and responds for escalation within depth cap', () => {
      const { rules, context } = makeChain();
      const result = runClassifierChain(
        makeMessage({
          intent: 'escalation',
          expectsResponse: true,
          instanceId: 'remote',
          conversationDepth: 2,
        }),
        context,
        rules
      );
      expect(result.type).toBe('escalation');
      expect(result.shouldRespond).toBe(true);
    });

    it('fires and does not respond when escalation depth cap (3) is hit', () => {
      const { rules, context } = makeChain();
      const result = runClassifierChain(
        makeMessage({
          intent: 'escalation',
          expectsResponse: true,
          instanceId: 'remote',
          conversationDepth: 3,
        }),
        context,
        rules
      );
      expect(result.type).toBe('escalation');
      expect(result.shouldRespond).toBe(false);
    });
  });

  describe('DefaultRule (priority 0)', () => {
    it('catches messages that do not match any specific rule', () => {
      const { rules, context } = makeChain();
      // A non-ava source message bypasses PeerAvaMessageRule and falls through to DefaultRule
      const result = runClassifierChain(
        makeMessage({
          source: 'discord',
          intent: 'inform',
          expectsResponse: true,
          instanceId: 'remote',
          conversationDepth: 0,
        }),
        context,
        rules
      );
      expect(result.shouldRespond).toBe(false);
      expect(result.reason).toContain('No specific rule matched');
    });
  });
});
