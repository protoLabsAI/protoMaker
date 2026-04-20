/**
 * Unit tests for PipelineCheckpointService — validatePRForResume and load-time
 * invalidation of checkpoints that reference closed/deleted PRs.
 *
 * Addresses feature-1776652657285: missing test coverage for the validatePRForResume
 * path added in PR #3498 (checkpoint ghost-PR loop fix).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { promisify } from 'node:util';

// The service does `const execAsync = promisify(exec)` and reads `{stdout, stderr}`
// from the resolved value. Node's real exec has util.promisify.custom attached to
// produce that shape; our bare vi.fn() does not, so promisify would collapse the
// result to a single positional value. Attach a custom promisify handler so the
// mock matches production semantics.
const execMock = vi.fn();
(execMock as unknown as Record<symbol, unknown>)[promisify.custom] = (
  cmd: string,
  opts?: unknown
) =>
  new Promise((resolve, reject) => {
    execMock(cmd, opts, (err: Error | null, stdout: string, stderr: string) =>
      err ? reject(err) : resolve({ stdout, stderr })
    );
  });

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, exec: execMock };
});

const { PipelineCheckpointService } = await import('@/services/pipeline-checkpoint-service.js');

type ExecCallback = (err: Error | null, stdout: string, stderr: string) => void;

function respondExec(stdout: string, err: Error | null = null) {
  execMock.mockImplementationOnce((_cmd: string, _opts: unknown, cb: ExecCallback) => {
    cb(err, stdout, '');
  });
}

describe('PipelineCheckpointService.validatePRForResume', () => {
  let service: InstanceType<typeof PipelineCheckpointService>;

  beforeEach(() => {
    execMock.mockReset();
    service = new PipelineCheckpointService();
  });

  it('returns "open" for a PR still OPEN on GitHub', async () => {
    respondExec(JSON.stringify({ state: 'OPEN', mergedAt: null }) + '\n');
    const result = await service.validatePRForResume('/tmp/proj', 42);
    expect(result).toBe('open');
  });

  it('returns "merged" when state is MERGED', async () => {
    respondExec(JSON.stringify({ state: 'MERGED', mergedAt: '2026-04-19T00:00:00Z' }) + '\n');
    const result = await service.validatePRForResume('/tmp/proj', 42);
    expect(result).toBe('merged');
  });

  it('returns "merged" when mergedAt is set even if state says OPEN', async () => {
    // Defensive: GitHub API has been observed returning state=OPEN with a
    // populated mergedAt during the brief window after a merge. Either signal
    // should be treated as merged to avoid re-running the REVIEW processor
    // on a PR that already landed.
    respondExec(JSON.stringify({ state: 'OPEN', mergedAt: '2026-04-19T00:00:00Z' }) + '\n');
    const result = await service.validatePRForResume('/tmp/proj', 42);
    expect(result).toBe('merged');
  });

  it('returns "closed" when the PR was closed without merging', async () => {
    respondExec(JSON.stringify({ state: 'CLOSED', mergedAt: null }) + '\n');
    const result = await service.validatePRForResume('/tmp/proj', 42);
    expect(result).toBe('closed');
  });

  it('returns "unknown" when gh CLI errors (transient: network, rate limit, auth)', async () => {
    // Previously returned 'not_found', which caused load() to delete valid
    // checkpoints during GitHub outages. Now 'unknown' so load() leaves the
    // checkpoint intact until a definitive response is available.
    execMock.mockImplementationOnce((_cmd: string, _opts: unknown, cb: ExecCallback) => {
      const err: NodeJS.ErrnoException = new Error('gh: not found');
      err.code = 'ENOENT';
      cb(err, '', 'could not find pull request');
    });
    const result = await service.validatePRForResume('/tmp/proj', 99999);
    expect(result).toBe('unknown');
  });

  it('returns "not_found" when state is an unexpected value (future GitHub API change)', async () => {
    respondExec(JSON.stringify({ state: 'DRAFT', mergedAt: null }) + '\n');
    const result = await service.validatePRForResume('/tmp/proj', 42);
    // The current contract is strict about recognized states; an unrecognized
    // one is treated as not_found so the checkpoint invalidation path runs.
    expect(result).toBe('not_found');
  });
});

describe('PipelineCheckpointService.load — PR validation at load time', () => {
  let tmpProject: string;
  let service: InstanceType<typeof PipelineCheckpointService>;

  beforeEach(async () => {
    execMock.mockReset();
    tmpProject = await fs.mkdtemp(path.join(os.tmpdir(), 'checkpoint-test-'));
    await fs.mkdir(path.join(tmpProject, '.automaker', 'checkpoints'), { recursive: true });
    service = new PipelineCheckpointService();
  });

  afterEach(async () => {
    await fs.rm(tmpProject, { recursive: true, force: true });
  });

  async function writeCheckpoint(
    featureId: string,
    currentState: string,
    prNumber?: number
  ): Promise<string> {
    const filePath = path.join(tmpProject, '.automaker', 'checkpoints', `${featureId}.json`);
    await fs.writeFile(
      filePath,
      JSON.stringify({
        featureId,
        projectPath: tmpProject,
        currentState,
        stateContext: { retryCount: 0, planRequired: false, prNumber },
        completedStates: [],
        goalGateResults: [],
        timestamp: '2026-04-19T00:00:00Z',
        version: 1,
      })
    );
    return filePath;
  }

  it('returns the checkpoint unchanged when PR is still OPEN', async () => {
    const filePath = await writeCheckpoint('feat-open', 'REVIEW', 100);
    respondExec(JSON.stringify({ state: 'OPEN', mergedAt: null }));

    const result = await service.load(tmpProject, 'feat-open');

    expect(result).not.toBeNull();
    expect(result?.currentState).toBe('REVIEW');
    await expect(fs.access(filePath)).resolves.toBeUndefined();
  });

  it('returns the checkpoint when PR is MERGED (REVIEW processor handles advancement)', async () => {
    // Merged PRs are not auto-invalidated because the REVIEW processor needs to
    // see the checkpoint to drive the feature to DONE.
    const filePath = await writeCheckpoint('feat-merged', 'REVIEW', 200);
    respondExec(JSON.stringify({ state: 'MERGED', mergedAt: '2026-04-19T00:00:00Z' }));

    const result = await service.load(tmpProject, 'feat-merged');

    expect(result).not.toBeNull();
    expect(result?.currentState).toBe('REVIEW');
    await expect(fs.access(filePath)).resolves.toBeUndefined();
  });

  it('deletes checkpoint and returns null when PR is CLOSED (ghost-PR loop fix)', async () => {
    const filePath = await writeCheckpoint('feat-closed', 'REVIEW', 300);
    respondExec(JSON.stringify({ state: 'CLOSED', mergedAt: null }));

    const result = await service.load(tmpProject, 'feat-closed');

    expect(result).toBeNull();
    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it('KEEPS checkpoint when gh CLI errors (transient "unknown" state)', async () => {
    // Regression for feature-1776652853666: a brief GitHub outage must NOT
    // cause load() to delete a valid checkpoint. The 'unknown' response from
    // validatePRForResume leaves the checkpoint intact so the next load
    // attempt can re-validate once the outage clears.
    const filePath = await writeCheckpoint('feat-transient', 'MERGE', 404);
    execMock.mockImplementationOnce((_cmd: string, _opts: unknown, cb: ExecCallback) => {
      cb(new Error('gh: network error'), '', 'rate limit exceeded');
    });

    const result = await service.load(tmpProject, 'feat-transient');

    expect(result).not.toBeNull();
    expect(result?.currentState).toBe('MERGE');
    await expect(fs.access(filePath)).resolves.toBeUndefined();
  });

  it('deletes checkpoint and returns null when gh reports explicit CLOSED state', async () => {
    const filePath = await writeCheckpoint('feat-gone', 'MERGE', 404);
    respondExec(JSON.stringify({ state: 'CLOSED', mergedAt: null }));

    const result = await service.load(tmpProject, 'feat-gone');

    expect(result).toBeNull();
    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it('does NOT validate PR for non-REVIEW/MERGE states (PLAN has no PR yet)', async () => {
    await writeCheckpoint('feat-plan', 'PLAN', undefined);
    // No respondExec — exec should never be called for PLAN state.

    const result = await service.load(tmpProject, 'feat-plan');

    expect(result).not.toBeNull();
    expect(result?.currentState).toBe('PLAN');
    expect(execMock).not.toHaveBeenCalled();
  });

  it('does NOT validate when state is REVIEW but no prNumber is set', async () => {
    // Defensive: a REVIEW-state checkpoint without a prNumber can't be PR-validated.
    // The load path should skip validation rather than treat absence as 'not_found',
    // since the REVIEW processor may still advance the feature via other signals.
    await writeCheckpoint('feat-no-pr', 'REVIEW', undefined);

    const result = await service.load(tmpProject, 'feat-no-pr');

    expect(result).not.toBeNull();
    expect(result?.currentState).toBe('REVIEW');
    expect(execMock).not.toHaveBeenCalled();
  });
});
