/**
 * Unit tests for the review-prd handler (#86 — agent-driven PRD review gate).
 *
 * Verifies the verdict wiring:
 *   - PASS -> status 'approved', reviewFeedback cleared
 *   - FAIL -> status 'reviewing', issues stored as reviewFeedback (feeds the
 *             generate-prd regeneration loop)
 *   - a sub-threshold score never counts as a pass even if the model says so
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createReviewPrdHandler } from '@/routes/projects/lifecycle/review-prd.js';

vi.mock('@protolabsai/model-resolver', () => ({
  resolveModelString: vi.fn(() => 'claude-sonnet-4-5'),
}));

vi.mock('@/providers/simple-query-service.js', () => ({
  streamingQuery: vi.fn(),
}));

import { streamingQuery } from '@/providers/simple-query-service.js';

const PRD = {
  situation: 's',
  problem: 'p',
  approach: 'a',
  results: 'r',
  constraints: 'c',
};

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

function setup(verdict: unknown, project: Record<string, unknown> = { title: 'T', prd: PRD }) {
  vi.mocked(streamingQuery).mockResolvedValue({ text: JSON.stringify(verdict) } as Awaited<
    ReturnType<typeof streamingQuery>
  >);
  const updateProject = vi.fn().mockResolvedValue(project);
  const events = { emit: vi.fn() };
  const projectService = {
    getProject: vi.fn().mockResolvedValue(project),
    updateProject,
  } as unknown as Parameters<typeof createReviewPrdHandler>[0];
  const handler = createReviewPrdHandler(
    projectService,
    events as unknown as Parameters<typeof createReviewPrdHandler>[1]
  );
  return { handler, updateProject, events };
}

describe('review-prd handler (#86)', () => {
  beforeEach(() => vi.clearAllMocks());

  it("PASS -> status 'approved' and clears reviewFeedback", async () => {
    const { handler, updateProject, events } = setup({
      passed: true,
      score: 90,
      issues: [],
      summary: 'Solid plan.',
    });
    const res = makeRes();
    await handler({ body: { projectPath: '/p', projectSlug: 's' } } as Request, res as Response);

    expect(updateProject).toHaveBeenCalledWith('/p', 's', {
      status: 'approved',
      reviewFeedback: '',
    });
    expect((res.body as { review: { passed: boolean } }).review.passed).toBe(true);
    expect(events.emit).toHaveBeenCalledWith(
      'project:prd:reviewed',
      expect.objectContaining({ passed: true, score: 90 })
    );
  });

  it("FAIL -> status 'reviewing' and stores issues as reviewFeedback", async () => {
    const { handler, updateProject } = setup({
      passed: false,
      score: 40,
      issues: ['No measurable results', 'Approach is hand-wavy'],
      summary: 'Needs work.',
    });
    const res = makeRes();
    await handler({ body: { projectPath: '/p', projectSlug: 's' } } as Request, res as Response);

    const call = updateProject.mock.calls[0];
    expect(call[2]).toMatchObject({ status: 'reviewing' });
    expect((call[2] as { reviewFeedback: string }).reviewFeedback).toContain(
      'No measurable results'
    );
    expect((call[2] as { reviewFeedback: string }).reviewFeedback).toContain(
      'Approach is hand-wavy'
    );
  });

  it('treats a sub-threshold score as NOT passed even if the model claims passed', async () => {
    const { handler, updateProject } = setup({
      passed: true,
      score: 60, // below PASS_THRESHOLD
      issues: ['Thin on constraints'],
      summary: 'Borderline.',
    });
    const res = makeRes();
    await handler({ body: { projectPath: '/p', projectSlug: 's' } } as Request, res as Response);

    expect(updateProject.mock.calls[0][2]).toMatchObject({ status: 'reviewing' });
    expect((res.body as { review: { passed: boolean } }).review.passed).toBe(false);
  });

  it('returns 400 when the project has no PRD', async () => {
    const { handler } = setup({ passed: true, score: 90, issues: [], summary: '' }, { title: 'T' });
    const res = makeRes();
    await handler({ body: { projectPath: '/p', projectSlug: 's' } } as Request, res as Response);
    expect(res.statusCode).toBe(400);
  });
});
