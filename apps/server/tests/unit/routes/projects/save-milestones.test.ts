/**
 * Unit tests for the save-milestones handler (#4060).
 *
 * Focus: a non-existent project must return 404 (not 500), so callers can tell
 * "create the project first" apart from a genuine server error. Also covers the
 * 400 input guards and the success path.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createSaveMilestonesHandler } from '@/routes/projects/lifecycle/save-milestones.js';

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

type LifecycleArg = Parameters<typeof createSaveMilestonesHandler>[0];
type ProjectServiceArg = Parameters<typeof createSaveMilestonesHandler>[1];

describe('save-milestones handler (#4060)', () => {
  it('returns 404 (not 500) when the project does not exist', async () => {
    const saveMilestones = vi.fn();
    const lifecycleService = { saveMilestones } as unknown as LifecycleArg;
    const projectService = {
      getProject: vi.fn().mockResolvedValue(null),
    } as unknown as ProjectServiceArg;

    const handler = createSaveMilestonesHandler(lifecycleService, projectService);
    const res = makeRes();
    await handler(
      {
        body: { projectPath: '/p', projectSlug: 'ghost', milestones: [{ title: 'M1' }] },
      } as Request,
      res as Response
    );

    expect(res.statusCode).toBe(404);
    expect((res.body as { success: boolean }).success).toBe(false);
    expect((res.body as { error: string }).error).toContain('ghost');
    // Must short-circuit before touching the lifecycle service.
    expect(saveMilestones).not.toHaveBeenCalled();
  });

  it('returns 400 when required params are missing', async () => {
    const lifecycleService = { saveMilestones: vi.fn() } as unknown as LifecycleArg;
    const projectService = { getProject: vi.fn() } as unknown as ProjectServiceArg;

    const handler = createSaveMilestonesHandler(lifecycleService, projectService);
    const res = makeRes();
    await handler(
      { body: { projectSlug: 's', milestones: [{ title: 'M1' }] } } as Request,
      res as Response
    );

    expect(res.statusCode).toBe(400);
    expect(projectService.getProject as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('returns 400 when milestones is empty', async () => {
    const lifecycleService = { saveMilestones: vi.fn() } as unknown as LifecycleArg;
    const projectService = { getProject: vi.fn() } as unknown as ProjectServiceArg;

    const handler = createSaveMilestonesHandler(lifecycleService, projectService);
    const res = makeRes();
    await handler(
      { body: { projectPath: '/p', projectSlug: 's', milestones: [] } } as Request,
      res as Response
    );

    expect(res.statusCode).toBe(400);
  });

  it('saves milestones and returns success when the project exists', async () => {
    const saved = {
      slug: 's',
      milestones: [{ title: 'M1' }, { title: 'M2' }],
      status: 'scaffolded',
    };
    const saveMilestones = vi.fn().mockResolvedValue(saved);
    const lifecycleService = { saveMilestones } as unknown as LifecycleArg;
    const projectService = {
      getProject: vi.fn().mockResolvedValue({ slug: 's' }),
    } as unknown as ProjectServiceArg;

    const handler = createSaveMilestonesHandler(lifecycleService, projectService);
    const res = makeRes();
    await handler(
      {
        body: {
          projectPath: '/p',
          projectSlug: 's',
          milestones: [{ title: 'M1' }, { title: 'M2' }],
        },
      } as Request,
      res as Response
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      projectSlug: 's',
      milestonesCount: 2,
      status: 'scaffolded',
    });
    expect(saveMilestones).toHaveBeenCalledOnce();
  });
});
