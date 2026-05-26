/**
 * Unit tests for DocsUpdateDetector.
 *
 * Regression guard for #3806: the per-epic docs-followup feature must be
 * created with workflow 'standard' so it runs the full pipeline and opens a
 * docs PR — NOT a read-only default that writes nothing and blocks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({ execSync: vi.fn() }));
vi.mock('@protolabsai/utils', () => ({
  createLogger: () => ({ info() {}, debug() {}, warn() {}, error() {} }),
}));

import { execSync } from 'child_process';
import { DocsUpdateDetector } from '../../../src/services/docs-update-detector.js';

type SubscribeCb = (type: string, payload: unknown) => void;

function makeHarness(changedFiles: string[]) {
  (execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(changedFiles.join('\n'));
  const create = vi.fn(async (_p: string, f: Record<string, unknown>) => ({ id: 'feat-x', ...f }));
  const getAll = vi.fn(async () => [] as unknown[]);
  const featureLoader = { create, getAll } as unknown as ConstructorParameters<
    typeof DocsUpdateDetector
  >[1];
  let cb: SubscribeCb = () => {};
  const events = {
    subscribe: (fn: SubscribeCb) => {
      cb = fn;
      return () => {};
    },
    emit: vi.fn(),
  } as unknown as ConstructorParameters<typeof DocsUpdateDetector>[0];
  return { create, events, featureLoader, trigger: () => cb };
}

describe('DocsUpdateDetector', () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates the docs feature with workflow 'standard' (regression #3806)", async () => {
    // 4 doc-relevant files — above DOC_THRESHOLD (3)
    const { create, events, featureLoader, trigger } = makeHarness([
      'apps/server/src/routes/a.ts',
      'apps/server/src/services/b.ts',
      'libs/types/src/c.ts',
      'docs/d.md',
    ]);
    new DocsUpdateDetector(events, featureLoader, '/proj').start();
    trigger()('milestone:completed', { projectPath: '/proj', milestoneTitle: 'Epic X' });

    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const arg = create.mock.calls[0][1] as Record<string, unknown>;
    expect(arg.workflow).toBe('standard');
    expect(arg.executionMode).not.toBe('read-only');
    expect(arg.category).toBe('Documentation');
  });

  it('does not create a docs feature below the doc-relevant threshold', async () => {
    const { create, events, featureLoader, trigger } = makeHarness(['docs/only.md']); // 1 < 3
    new DocsUpdateDetector(events, featureLoader, '/proj').start();
    trigger()('milestone:completed', { projectPath: '/proj', milestoneTitle: 'Epic X' });

    // Give the async handler a tick; it must not create anything.
    await new Promise((r) => setTimeout(r, 20));
    expect(create).not.toHaveBeenCalled();
  });
});
