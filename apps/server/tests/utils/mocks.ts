/**
 * Mock utilities for testing
 * Provides reusable mocks for common dependencies
 */

import { vi } from 'vitest';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import type { Readable } from 'stream';

/**
 * Mock child_process.spawn for subprocess tests
 */
export function createMockChildProcess(options: {
  stdout?: string[];
  stderr?: string[];
  exitCode?: number | null;
  shouldError?: boolean;
}): ChildProcess {
  const { stdout = [], stderr = [], exitCode = 0, shouldError = false } = options;

  const mockProcess = new EventEmitter() as any;

  // Create mock stdout stream
  mockProcess.stdout = new EventEmitter() as Readable;
  mockProcess.stderr = new EventEmitter() as Readable;

  mockProcess.kill = vi.fn();

  // Simulate async output
  process.nextTick(() => {
    // Emit stdout lines
    for (const line of stdout) {
      mockProcess.stdout.emit('data', Buffer.from(line + '\n'));
    }

    // Emit stderr lines
    for (const line of stderr) {
      mockProcess.stderr.emit('data', Buffer.from(line + '\n'));
    }

    // Emit exit or error
    if (shouldError) {
      mockProcess.emit('error', new Error('Process error'));
    } else {
      mockProcess.emit('exit', exitCode);
    }
  });

  return mockProcess as ChildProcess;
}

/**
 * Mock fs/promises for file system tests
 */
export function createMockFs() {
  return {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    access: vi.fn(),
    stat: vi.fn(),
  };
}

/**
 * Mock Express request/response/next for middleware tests
 */
export function createMockExpressContext() {
  const req = {
    headers: {},
    body: {},
    params: {},
    query: {},
  } as any;

  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  } as any;

  const next = vi.fn();

  return { req, res, next };
}

/**
 * Mock AbortController for async operation tests
 */
export function createMockAbortController() {
  const controller = new AbortController();
  const originalAbort = controller.abort.bind(controller);
  controller.abort = vi.fn(originalAbort);
  return controller;
}

/**
 * Mock Claude SDK query function
 */
export function createMockClaudeQuery(messages: any[] = []) {
  return vi.fn(async function* ({ prompt, options }: any) {
    for (const msg of messages) {
      yield msg;
    }
  });
}
