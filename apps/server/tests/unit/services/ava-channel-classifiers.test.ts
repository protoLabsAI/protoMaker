/**
 * Tests for the Ava Channel classifier chain — pure-function rules that
 * determine whether a message warrants a response.
 */

import { describe, it, expect } from 'vitest';
import {
  createClassifierChain,
  runClassifierChain,
  type ClassifierContext,
  type MessageClassifierRule,
} from '@/services/ava-channel-classifiers.js';
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

function makeContext(overrides: Partial<ClassifierContext> = {}): ClassifierContext {
  return {
    maxConversationDepth: 5,
    staleThresholdMs: 5 * 60 * 1000,
    localInstanceId: 'local-instance',
    runningAgents: 0,
    maxAgents: 5,
    ...overrides,
  };
}

function getChainAndContext(settings: Parameters<typeof createClassifierChain>[1] = {}) {
  return createClassifierChain('local-instance', settings);
}

// ---------------------------------------------------------------------------
// createClassifierChain
// ---------------------------------------------------------------------------

describe('createClassifierChain', () => {
  it('returns 9 rules sorted by descending priority', () => {
    const { rules } = getChainAndContext();
    expect(rules).toHaveLength(9);
    for (let i = 1; i < rules.length; i++) {
      expect(rules[i - 1].priority).toBeGreaterThanOrEqual(rules[i].priority);
    }
  });

  it('applies default settings when none provided', () => {
    const { context } = getChainAndContext();
    expect(context.maxConversationDepth).toBe(5);
    expect(context.staleThresholdMs).toBe(5 * 60 * 1000);
    expect(context.runningAgents).toBe(0);
    expect(context.maxAgents).toBe(5);
    expect(context.localInstanceId).toBe('local-instance');
  });

  it('applies custom settings overrides', () => {
    const { context } = getChainAndContext({
      maxConversationDepth: 3,
      staleThresholdMs: 10_000,
      runningAgents: 2,
      maxAgents: 8,
    });
    expect(context.maxConversationDepth).toBe(3);
    expect(context.staleThresholdMs).toBe(10_000);
    expect(context.runningAgents).toBe(2);
    expect(context.maxAgents).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// LoopBreakerRule (priority 100)
// ---------------------------------------------------------------------------

describe('LoopBreakerRule', () => {
  it('blocks messages at or above maxConversationDepth', () => {
    const { rules, context } = getChainAndContext({ maxConversationDepth: 3 });
    const msg = makeMessage({ conversationDepth: 3 });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(false);
    expect(result.type).toBe('informational');
  });

  it('blocks messages exceeding maxConversationDepth', () => {
    const { rules, context } = getChainAndContext({ maxConversationDepth: 2 });
    const msg = makeMessage({ conversationDepth: 5 });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(false);
  });

  it('allows messages below maxConversationDepth', () => {
    const { rules, context } = getChainAndContext({ maxConversationDepth: 5 });
    const msg = makeMessage({
      conversationDepth: 2,
      intent: 'request',
      expectsResponse: true,
    });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(true);
  });

  it('treats missing conversationDepth as 0', () => {
    const { rules, context } = getChainAndContext({ maxConversationDepth: 1 });
    const msg = makeMessage({ intent: 'request', expectsResponse: true });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TerminalMessageRule (priority 90)
// ---------------------------------------------------------------------------

describe('TerminalMessageRule', () => {
  it('blocks messages with expectsResponse:false', () => {
    const { rules, context } = getChainAndContext();
    const msg = makeMessage({ expectsResponse: false, intent: 'request' });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(false);
    expect(result.type).toBe('informational');
  });

  it('does not block when expectsResponse is undefined', () => {
    const { rules, context } = getChainAndContext();
    const msg = makeMessage({ intent: 'request', expectsResponse: true });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SelfMessageRule (priority 80)
// ---------------------------------------------------------------------------

describe('SelfMessageRule', () => {
  it('blocks messages from the local instance', () => {
    const { rules, context } = getChainAndContext();
    const msg = makeMessage({ instanceId: 'local-instance' });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(false);
  });

  it('allows messages from remote instances', () => {
    const { rules, context } = getChainAndContext();
    const msg = makeMessage({
      instanceId: 'other-instance',
      intent: 'request',
      expectsResponse: true,
    });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// StaleMessageRule (priority 75)
// ---------------------------------------------------------------------------

describe('StaleMessageRule', () => {
  it('blocks messages older than staleThresholdMs', () => {
    const { rules, context } = getChainAndContext({ staleThresholdMs: 60_000 });
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const msg = makeMessage({ timestamp: twoMinutesAgo });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(false);
  });

  it('allows fresh messages', () => {
    const { rules, context } = getChainAndContext({ staleThresholdMs: 300_000 });
    const msg = makeMessage({
      timestamp: new Date().toISOString(),
      intent: 'request',
      expectsResponse: true,
    });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SystemSourceRule (priority 70)
// ---------------------------------------------------------------------------

describe('SystemSourceRule', () => {
  it('blocks plain system messages', () => {
    const { rules, context } = getChainAndContext();
    const msg = makeMessage({ source: 'system', content: 'System initialized' });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(false);
    expect(result.type).toBe('informational');
  });

  it('responds to system messages starting with [BugReport]', () => {
    const { rules, context } = getChainAndContext();
    const msg = makeMessage({ source: 'system', content: '[BugReport] Something broke' });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(true);
    expect(result.type).toBe('escalation');
  });

  it('responds to system messages starting with [SystemAlert]', () => {
    const { rules, context } = getChainAndContext();
    const msg = makeMessage({ source: 'system', content: '[SystemAlert] High memory usage' });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(true);
    expect(result.type).toBe('escalation');
  });

  it('does not apply to non-system sources', () => {
    const { rules, context } = getChainAndContext();
    const msg = makeMessage({ source: 'ava', content: '[BugReport] fake' });
    // Should fall through to DefaultRule since no other rule matches
    const result = runClassifierChain(msg, context, rules);
    expect(result.type).toBe('informational');
    expect(result.shouldRespond).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RequestRule (priority 50)
// ---------------------------------------------------------------------------

describe('RequestRule', () => {
  it('responds to intent:request + expectsResponse:true', () => {
    const { rules, context } = getChainAndContext();
    const msg = makeMessage({ intent: 'request', expectsResponse: true });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(true);
    expect(result.type).toBe('request');
  });

  it('does not respond to intent:request without expectsResponse', () => {
    const { rules, context } = getChainAndContext();
    const msg = makeMessage({ intent: 'request' });
    const result = runClassifierChain(msg, context, rules);
    // Falls through to DefaultRule
    expect(result.shouldRespond).toBe(false);
  });

  it('does not respond to intent:request + expectsResponse:false', () => {
    const { rules, context } = getChainAndContext();
    const msg = makeMessage({ intent: 'request', expectsResponse: false });
    const result = runClassifierChain(msg, context, rules);
    // TerminalMessageRule catches this at priority 90
    expect(result.shouldRespond).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CoordinationRule (priority 40)
// ---------------------------------------------------------------------------

describe('CoordinationRule', () => {
  it('responds when instance has capacity', () => {
    const { rules, context } = getChainAndContext({ runningAgents: 1, maxAgents: 5 });
    const msg = makeMessage({ intent: 'coordination' });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(true);
    expect(result.type).toBe('coordination');
  });

  it('does not respond when instance is at capacity', () => {
    const { rules, context } = getChainAndContext({ runningAgents: 5, maxAgents: 5 });
    const msg = makeMessage({ intent: 'coordination' });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(false);
    expect(result.type).toBe('coordination');
  });
});

// ---------------------------------------------------------------------------
// EscalationRule (priority 30)
// ---------------------------------------------------------------------------

describe('EscalationRule', () => {
  it('responds to escalation within depth cap', () => {
    const { rules, context } = getChainAndContext();
    const msg = makeMessage({ intent: 'escalation', conversationDepth: 1 });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(true);
    expect(result.type).toBe('escalation');
  });

  it('blocks escalation at depth cap (3)', () => {
    const { rules, context } = getChainAndContext();
    const msg = makeMessage({ intent: 'escalation', conversationDepth: 3 });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(false);
    expect(result.type).toBe('escalation');
  });

  it('blocks escalation above depth cap', () => {
    const { rules, context } = getChainAndContext();
    const msg = makeMessage({ intent: 'escalation', conversationDepth: 10 });
    // LoopBreakerRule catches this at priority 100 (depth 10 >= maxDepth 5)
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DefaultRule (priority 0)
// ---------------------------------------------------------------------------

describe('DefaultRule', () => {
  it('returns informational for unclassified messages', () => {
    const { rules, context } = getChainAndContext();
    const msg = makeMessage({ intent: 'inform' });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(false);
    expect(result.type).toBe('informational');
  });

  it('returns informational for messages with no intent', () => {
    const { rules, context } = getChainAndContext();
    const msg = makeMessage({});
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(false);
    expect(result.type).toBe('informational');
  });
});

// ---------------------------------------------------------------------------
// Rule priority ordering
// ---------------------------------------------------------------------------

describe('rule priority ordering', () => {
  it('LoopBreaker overrides Request when depth exceeded', () => {
    const { rules, context } = getChainAndContext({ maxConversationDepth: 2 });
    const msg = makeMessage({
      intent: 'request',
      expectsResponse: true,
      conversationDepth: 5,
    });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(false);
    expect(result.reason).toContain('Conversation depth');
  });

  it('TerminalMessage overrides Request when expectsResponse:false', () => {
    const { rules, context } = getChainAndContext();
    const msg = makeMessage({
      intent: 'request',
      expectsResponse: false,
    });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(false);
    expect(result.reason).toContain('expectsResponse:false');
  });

  it('SelfMessage overrides Request when from local instance', () => {
    const { rules, context } = getChainAndContext();
    const msg = makeMessage({
      instanceId: 'local-instance',
      intent: 'request',
      expectsResponse: true,
    });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(false);
    expect(result.reason).toContain('this instance');
  });

  it('StaleMessage overrides Request when message is old', () => {
    const { rules, context } = getChainAndContext({ staleThresholdMs: 1000 });
    const msg = makeMessage({
      intent: 'request',
      expectsResponse: true,
      timestamp: new Date(Date.now() - 5000).toISOString(),
    });
    const result = runClassifierChain(msg, context, rules);
    expect(result.shouldRespond).toBe(false);
    expect(result.reason).toContain('staleThresholdMs');
  });
});

// ---------------------------------------------------------------------------
// runClassifierChain edge cases
// ---------------------------------------------------------------------------

describe('runClassifierChain', () => {
  it('returns a result even with an empty rule array (unreachable fallback)', () => {
    const context = makeContext();
    const msg = makeMessage();
    const result = runClassifierChain(msg, context, []);
    expect(result.shouldRespond).toBe(false);
    expect(result.type).toBe('informational');
  });
});
