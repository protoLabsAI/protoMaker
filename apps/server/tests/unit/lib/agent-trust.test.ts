/**
 * Unit tests for agent-trust.ts
 * Verifies buildCanUseToolCallback behavior for both 'full' and 'gated' trust levels.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildCanUseToolCallback } from '../../../src/lib/agent-trust.js';
import type { EventEmitter } from '../../../src/lib/events.js';
import type { EventType } from '@protolabs-ai/types';

// ─── Minimal EventEmitter mock ────────────────────────────────────────────────

function createMockEmitter(): EventEmitter & {
  _subscribers: Set<(type: string, payload: unknown) => void>;
  _emitToSubscribers: (type: string, payload: unknown) => void;
} {
  const subscribers = new Set<(type: string, payload: unknown) => void>();

  return {
    _subscribers: subscribers,
    _emitToSubscribers(type: string, payload: unknown) {
      for (const sub of subscribers) {
        sub(type, payload);
      }
    },
    emit(type: EventType, payload: unknown) {
      // record emitted events for assertions
    },
    subscribe(callback: (type: string, payload: unknown) => void) {
      subscribers.add(callback);
      const unsub = () => subscribers.delete(callback);
      const unsubWithMethod = unsub as ReturnType<EventEmitter['subscribe']>;
      unsubWithMethod.unsubscribe = unsub;
      return unsubWithMethod;
    },
    broadcast(type: EventType, payload?: unknown) {
      // no-op in tests
    },
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('buildCanUseToolCallback', () => {
  const signal = new AbortController().signal;

  describe('full trust', () => {
    it('returns undefined for full trust', () => {
      const cb = buildCanUseToolCallback('full');
      expect(cb).toBeUndefined();
    });

    it('returns undefined for full trust even with emitter provided', () => {
      const emitter = createMockEmitter();
      const cb = buildCanUseToolCallback('full', emitter as unknown as EventEmitter);
      expect(cb).toBeUndefined();
    });
  });

  describe('gated trust', () => {
    it('returns a function for gated trust', () => {
      const emitter = createMockEmitter();
      const cb = buildCanUseToolCallback('gated', emitter as unknown as EventEmitter);
      expect(typeof cb).toBe('function');
    });

    it('denies immediately when no emitter is provided', async () => {
      const cb = buildCanUseToolCallback('gated');
      expect(cb).toBeDefined();
      const result = await cb!('Bash', { command: 'ls' }, { signal });
      expect(result.behavior).toBe('deny');
      expect(result.message).toContain('No approval emitter');
    });

    it('emits a tool-approval-request event with correct fields', async () => {
      const emitter = createMockEmitter();
      const emitSpy = vi.spyOn(emitter, 'emit');

      const cb = buildCanUseToolCallback('gated', emitter as unknown as EventEmitter);

      // Start the call but don't await — we'll resolve it manually
      const callPromise = cb!('Read', { file: '/etc/hosts' }, { signal });

      // Give the microtask queue a tick for the emit to fire
      await new Promise((r) => setTimeout(r, 0));

      expect(emitSpy).toHaveBeenCalledTimes(1);
      const [eventType, payload] = emitSpy.mock.calls[0];
      expect(eventType).toBe('subagent:tool-approval-request');
      const req = payload as { toolName: string; approvalId: string; toolInput: unknown };
      expect(req.toolName).toBe('Read');
      expect(req.toolInput).toEqual({ file: '/etc/hosts' });
      expect(typeof req.approvalId).toBe('string');

      // Resolve by sending the response event
      emitter._emitToSubscribers('subagent:tool-approval-response', {
        approvalId: req.approvalId,
        approved: true,
      });

      const result = await callPromise;
      expect(result.behavior).toBe('allow');
    });

    it('allows the tool when approver responds with approved: true', async () => {
      const emitter = createMockEmitter();
      let capturedApprovalId: string | undefined;

      vi.spyOn(emitter, 'emit').mockImplementation((_type, payload) => {
        capturedApprovalId = (payload as { approvalId: string }).approvalId;
      });

      const cb = buildCanUseToolCallback('gated', emitter as unknown as EventEmitter);
      const callPromise = cb!('Bash', { command: 'echo hi' }, { signal });

      await new Promise((r) => setTimeout(r, 0));

      emitter._emitToSubscribers('subagent:tool-approval-response', {
        approvalId: capturedApprovalId,
        approved: true,
      });

      const result = await callPromise;
      expect(result.behavior).toBe('allow');
    });

    it('denies the tool when approver responds with approved: false', async () => {
      const emitter = createMockEmitter();
      let capturedApprovalId: string | undefined;

      vi.spyOn(emitter, 'emit').mockImplementation((_type, payload) => {
        capturedApprovalId = (payload as { approvalId: string }).approvalId;
      });

      const cb = buildCanUseToolCallback('gated', emitter as unknown as EventEmitter);
      const callPromise = cb!('Write', { path: '/etc/hosts', content: 'x' }, { signal });

      await new Promise((r) => setTimeout(r, 0));

      emitter._emitToSubscribers('subagent:tool-approval-response', {
        approvalId: capturedApprovalId,
        approved: false,
        message: 'Too dangerous',
      });

      const result = await callPromise;
      expect(result.behavior).toBe('deny');
      expect(result.message).toBe('Too dangerous');
    });

    it('ignores responses with a non-matching approvalId', async () => {
      const emitter = createMockEmitter();
      let capturedApprovalId: string | undefined;

      vi.spyOn(emitter, 'emit').mockImplementation((_type, payload) => {
        capturedApprovalId = (payload as { approvalId: string }).approvalId;
      });

      const cb = buildCanUseToolCallback('gated', emitter as unknown as EventEmitter);
      const callPromise = cb!('Glob', { pattern: '*.ts' }, { signal });

      await new Promise((r) => setTimeout(r, 0));

      // Send a response for a different approvalId — should be ignored
      emitter._emitToSubscribers('subagent:tool-approval-response', {
        approvalId: 'wrong-id',
        approved: true,
      });

      // Now send the correct response
      emitter._emitToSubscribers('subagent:tool-approval-response', {
        approvalId: capturedApprovalId,
        approved: false,
        message: 'Denied',
      });

      const result = await callPromise;
      expect(result.behavior).toBe('deny');
    });

    it('denies immediately when the abort signal is already aborted', async () => {
      const emitter = createMockEmitter();
      const abortController = new AbortController();
      abortController.abort();

      const cb = buildCanUseToolCallback('gated', emitter as unknown as EventEmitter);
      const result = await cb!('Bash', { command: 'rm -rf /' }, { signal: abortController.signal });

      expect(result.behavior).toBe('deny');
      expect(result.message).toContain('aborted');
    });

    it('denies when the abort signal fires while waiting', async () => {
      const emitter = createMockEmitter();
      const abortController = new AbortController();

      vi.spyOn(emitter, 'emit');

      const cb = buildCanUseToolCallback('gated', emitter as unknown as EventEmitter);
      const callPromise = cb!('Bash', { command: 'sleep 10' }, { signal: abortController.signal });

      await new Promise((r) => setTimeout(r, 0));

      abortController.abort();

      const result = await callPromise;
      expect(result.behavior).toBe('deny');
      expect(result.message).toContain('aborted');
    });
  });
});
