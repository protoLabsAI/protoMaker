/**
 * Unit tests for the generate-prd handler's request-changes feedback loop (#85).
 *
 * Verifies that a PRD regeneration after "request changes" folds the stored
 * reviewFeedback (and the prior PRD) into the prompt and clears the feedback
 * once consumed — and that a fresh generation does neither.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createGeneratePrdHandler } from '@/routes/projects/lifecycle/generate-prd.js';

vi.mock('@protolabsai/model-resolver', () => ({
  resolveModelString: vi.fn(() => 'claude-sonnet-4-5'),
}));

vi.mock('@/providers/simple-query-service.js', () => ({
  streamingQuery: vi.fn(),
}));

import { streamingQuery } from '@/providers/simple-query-service.js';

const VALID_PRD_JSON = JSON.stringify({
  situation: 's',
  problem: 'p',
  approach: 'a',
  results: 'r',
  constraints: 'c',
});

function makeRes() {
  const res: Partial<Response> & { statusCode: number; body: unknown } = {
    statusCode: 200,
    body: undefined,
  };
  res.status = vi.fn((c: number) => {
    res.statusCode = c;
    return res as Response;
  }) as unknown as Response['status'];
  res.json = vi.fn((b: unknown) => {
    res.body = b;
    return res as Response;
  }) as unknown as Response['json'];
  return res;
}

function lastPrompt(): string {
  return (vi.mocked(streamingQuery).mock.calls[0][0] as { prompt: string }).prompt;
}

describe('generate-prd handler — request-changes feedback loop (#85)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(streamingQuery).mockResolvedValue({ text: VALID_PRD_JSON } as Awaited<
      ReturnType<typeof streamingQuery>
    >);
  });

  it('folds stored reviewFeedback + prior PRD into the prompt and clears feedback after', async () => {
    const project = {
      title: 'T',
      goal: 'G',
      reviewFeedback: 'Make the approach simpler and cheaper',
      prd: {
        situation: 'old-sit',
        problem: 'old-prob',
        approach: 'old-approach-text',
        results: 'old-res',
        constraints: 'old-con',
      },
    };
    const updateProject = vi.fn().mockResolvedValue(project);
    const projectService = {
      getProject: vi.fn().mockResolvedValue(project),
      updateProject,
    } as unknown as Parameters<typeof createGeneratePrdHandler>[1];

    const handler = createGeneratePrdHandler(
      {} as Parameters<typeof createGeneratePrdHandler>[0],
      projectService
    );
    const res = makeRes();
    await handler({ body: { projectPath: '/p', projectSlug: 's' } } as Request, res as Response);

    const prompt = lastPrompt();
    expect(prompt).toContain('Make the approach simpler and cheaper');
    expect(prompt).toContain('Revise the SPARC PRD');
    expect(prompt).toContain('old-approach-text'); // prior PRD carried in for revision

    const saveCall = updateProject.mock.calls.find((c) => (c[2] as { prd?: unknown })?.prd);
    expect(saveCall).toBeDefined();
    expect((saveCall![2] as { reviewFeedback?: string }).reviewFeedback).toBe('');
    expect((res.body as { success: boolean }).success).toBe(true);
  });

  it('does not add a revise instruction or clear feedback on a fresh generation', async () => {
    const project = { title: 'T', goal: 'G' };
    const updateProject = vi.fn().mockResolvedValue(project);
    const projectService = {
      getProject: vi.fn().mockResolvedValue(project),
      updateProject,
    } as unknown as Parameters<typeof createGeneratePrdHandler>[1];

    const handler = createGeneratePrdHandler(
      {} as Parameters<typeof createGeneratePrdHandler>[0],
      projectService
    );
    const res = makeRes();
    await handler({ body: { projectPath: '/p', projectSlug: 's' } } as Request, res as Response);

    const prompt = lastPrompt();
    expect(prompt).toContain('Generate a SPARC PRD');
    expect(prompt).not.toContain('Revise the SPARC PRD');

    const saveCall = updateProject.mock.calls.find((c) => (c[2] as { prd?: unknown })?.prd);
    expect(saveCall).toBeDefined();
    expect(saveCall![2]).not.toHaveProperty('reviewFeedback');
  });
});
