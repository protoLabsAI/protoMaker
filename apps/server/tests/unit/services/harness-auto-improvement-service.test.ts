import { describe, it, expect, vi } from 'vitest';
import { HarnessAutoImprovementService } from '@/services/harness-auto-improvement-service.js';
import type { Feature } from '@protolabsai/types';

function feat(id: string, status: string, reason?: string, description?: string): Feature {
  return {
    id,
    category: 'feature',
    description: description ?? '',
    status,
    statusChangeReason: reason,
  } as unknown as Feature;
}

// Deterministic classifier: every reason → 'merge_conflict'.
const stub = { classify: () => ({ category: 'merge_conflict', confidence: 1 }) } as any;

function svc(features: Feature[], createImpl?: any) {
  const create =
    createImpl ??
    vi.fn(async (_p: string, f: Partial<Feature>) => ({ id: 'new-1', ...f }) as Feature);
  const featureLoader = { getAll: vi.fn().mockResolvedValue(features), create } as any;
  return { service: new HarnessAutoImprovementService(featureLoader, stub), create };
}

describe('HarnessAutoImprovementService.runOnce', () => {
  it('files an improvement feature when there is an actionable top category', async () => {
    const { service, create } = svc([
      feat('a', 'blocked', 'conflict 1'),
      feat('b', 'escalated', 'conflict 2'),
    ]);
    const r = await service.runOnce('/p');
    expect(r.filed).toBe(true);
    expect(r.category).toBe('merge_conflict');
    expect(r.featureId).toBe('new-1');
    expect(create).toHaveBeenCalledTimes(1);
    const created = create.mock.calls[0][1];
    expect(created.title).toMatch(/merge_conflict/);
    expect(created.description).toContain('<!-- harness-improve:merge_conflict -->');
  });

  it('does not file when below the noise threshold (single failure)', async () => {
    const { service, create } = svc([feat('a', 'blocked', 'conflict 1')]);
    const r = await service.runOnce('/p');
    expect(r.filed).toBe(false);
    expect(r.reason).toMatch(/no actionable/);
    expect(create).not.toHaveBeenCalled();
  });

  it('dedups: skips when an open improvement for the category already exists', async () => {
    const existing = feat(
      'imp-1',
      'backlog',
      undefined,
      'prior <!-- harness-improve:merge_conflict -->'
    );
    const { service, create } = svc([
      feat('a', 'blocked', 'conflict 1'),
      feat('b', 'blocked', 'conflict 2'),
      existing,
    ]);
    const r = await service.runOnce('/p');
    expect(r.filed).toBe(false);
    expect(r.reason).toBe('already filed');
    expect(r.featureId).toBe('imp-1');
    expect(create).not.toHaveBeenCalled();
  });

  it('re-files if the prior improvement is already closed (done)', async () => {
    const closed = feat('imp-old', 'done', undefined, '<!-- harness-improve:merge_conflict -->');
    const { service, create } = svc([
      feat('a', 'blocked', 'c1'),
      feat('b', 'blocked', 'c2'),
      closed,
    ]);
    const r = await service.runOnce('/p');
    expect(r.filed).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('never throws — returns an error result if create fails', async () => {
    const { service } = svc(
      [feat('a', 'blocked', 'c1'), feat('b', 'blocked', 'c2')],
      vi.fn().mockRejectedValue(new Error('disk full'))
    );
    const r = await service.runOnce('/p');
    expect(r.filed).toBe(false);
    expect(r.reason).toMatch(/error: disk full/);
  });
});
