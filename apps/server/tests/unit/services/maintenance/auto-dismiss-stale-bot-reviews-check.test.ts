/**
 * Tests for AutoDismissStaleBotReviewsCheck — see #3732.
 *
 * The check looks for the exact "stale CHANGES_REQUESTED from a bot" shape
 * and dismisses the review when:
 *  1. PR is OPEN, BLOCKED, with reviewDecision: CHANGES_REQUESTED
 *  2. The blocking review's author is a `[bot]` user
 *  3. The blocking review's commit is NOT the current head
 *  4. The same bot has a later COMMENTED or APPROVED review
 *  5. CI on the head is all-green
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoDismissStaleBotReviewsCheck } from '@/services/maintenance/checks/auto-dismiss-stale-bot-reviews-check.js';

interface MockCall {
  args: string[];
  result: { stdout: string; stderr: string };
}

function buildExec(responses: Map<string, string>): {
  exec: (
    file: string,
    args: string[],
    options: { cwd?: string; encoding: string; timeout: number }
  ) => Promise<{ stdout: string; stderr: string }>;
  calls: MockCall[];
} {
  const calls: MockCall[] = [];
  const exec = vi
    .fn()
    .mockImplementation(
      async (
        _file: string,
        args: string[],
        _options: { cwd?: string; encoding: string; timeout: number }
      ) => {
        const key = args.join(' ');
        for (const [pattern, stdout] of responses) {
          if (key.includes(pattern)) {
            const result = { stdout, stderr: '' };
            calls.push({ args, result });
            return result;
          }
        }
        // Default: rejecting unmocked calls makes the test fail loud rather than
        // pass on a missing response. Dismissal calls (the action under test)
        // return empty stdout — match them via the 'dismissals' pattern below.
        throw new Error(`unmocked gh call: ${key}`);
      }
    );
  return { exec, calls };
}

const REPO_COORDS = { owner: 'protoLabsAI', repo: 'protoMaker' };
const PROJECT_PATH = '/test/project';

describe('AutoDismissStaleBotReviewsCheck (#3732)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dismisses a CHANGES_REQUESTED that was superseded by a COMMENTED on a later commit', async () => {
    const head = 'b59a3706c71af6c51bf667387d1209f4de28b952';
    const oldCommit = '89d367384e1ca5d496b3655007a69666192b6bb3';

    const responses = new Map<string, string>();
    responses.set(
      'pr list --state open',
      JSON.stringify([
        {
          number: 3691,
          headRefOid: head,
          mergeStateStatus: 'BLOCKED',
          reviewDecision: 'CHANGES_REQUESTED',
          url: 'https://github.com/protoLabsAI/protoMaker/pull/3691',
        },
      ])
    );
    responses.set(
      'repos/protoLabsAI/protoMaker/pulls/3691/reviews',
      JSON.stringify([
        {
          id: 4352033760,
          user: { login: 'protoquinn[bot]' },
          state: 'CHANGES_REQUESTED',
          commit_id: oldCommit,
          submitted_at: '2026-05-24T08:36:54Z',
        },
        {
          id: 4352052824,
          user: { login: 'protoquinn[bot]' },
          state: 'COMMENTED',
          commit_id: head,
          submitted_at: '2026-05-24T08:56:37Z',
        },
      ])
    );
    responses.set(
      'pr view 3691 --json statusCheckRollup',
      JSON.stringify({
        statusCheckRollup: [
          { name: 'checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
          { name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' },
          { name: 'test', status: 'COMPLETED', conclusion: 'SUCCESS' },
          { name: 'review', status: 'COMPLETED', conclusion: 'SUCCESS' },
          { name: 'ci-complete', status: 'COMPLETED', conclusion: 'SUCCESS' },
          {
            name: 'Close external code contributions',
            status: 'COMPLETED',
            conclusion: 'SKIPPED',
          },
        ],
      })
    );
    responses.set('dismissals', JSON.stringify({ ok: true }));

    const { exec, calls } = buildExec(responses);
    const check = new AutoDismissStaleBotReviewsCheck(REPO_COORDS, exec);

    const issues = await check.run(PROJECT_PATH);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      checkId: 'auto-dismiss-stale-bot-reviews',
      severity: 'info',
      context: { prNumber: 3691, reviewId: 4352033760, headSha: head },
    });
    // The dismissal call landed
    expect(calls.some((c) => c.args.join(' ').includes('dismissals'))).toBe(true);
  });

  it('does NOT dismiss when the CHANGES_REQUESTED is on the current head', async () => {
    const head = 'aaaaaaaa';
    const responses = new Map<string, string>();
    responses.set(
      'pr list --state open',
      JSON.stringify([
        {
          number: 100,
          headRefOid: head,
          mergeStateStatus: 'BLOCKED',
          reviewDecision: 'CHANGES_REQUESTED',
          url: 'u',
        },
      ])
    );
    responses.set(
      'pulls/100/reviews',
      JSON.stringify([
        {
          id: 1,
          user: { login: 'protoquinn[bot]' },
          state: 'CHANGES_REQUESTED',
          commit_id: head, // current head — not stale
          submitted_at: '2026-05-24T00:00:00Z',
        },
      ])
    );
    // No statusCheckRollup call expected; check should bail before that.

    const { exec, calls } = buildExec(responses);
    const check = new AutoDismissStaleBotReviewsCheck(REPO_COORDS, exec);

    const issues = await check.run(PROJECT_PATH);

    expect(issues).toEqual([]);
    expect(calls.every((c) => !c.args.join(' ').includes('dismissals'))).toBe(true);
  });

  it('does NOT dismiss when there is no later COMMENTED/APPROVED from the same bot', async () => {
    const responses = new Map<string, string>();
    responses.set(
      'pr list --state open',
      JSON.stringify([
        {
          number: 200,
          headRefOid: 'newhead',
          mergeStateStatus: 'BLOCKED',
          reviewDecision: 'CHANGES_REQUESTED',
          url: 'u',
        },
      ])
    );
    responses.set(
      'pulls/200/reviews',
      JSON.stringify([
        {
          id: 1,
          user: { login: 'protoquinn[bot]' },
          state: 'CHANGES_REQUESTED',
          commit_id: 'oldhead',
          submitted_at: '2026-05-24T00:00:00Z',
        },
        // The follow-up is from a DIFFERENT bot — should not satisfy the guard.
        {
          id: 2,
          user: { login: 'coderabbitai[bot]' },
          state: 'COMMENTED',
          commit_id: 'newhead',
          submitted_at: '2026-05-24T01:00:00Z',
        },
      ])
    );

    const { exec, calls } = buildExec(responses);
    const check = new AutoDismissStaleBotReviewsCheck(REPO_COORDS, exec);

    const issues = await check.run(PROJECT_PATH);

    expect(issues).toEqual([]);
    expect(calls.every((c) => !c.args.join(' ').includes('dismissals'))).toBe(true);
  });

  it('does NOT dismiss when the blocking review is from a human, not a bot', async () => {
    const responses = new Map<string, string>();
    responses.set(
      'pr list --state open',
      JSON.stringify([
        {
          number: 300,
          headRefOid: 'newhead',
          mergeStateStatus: 'BLOCKED',
          reviewDecision: 'CHANGES_REQUESTED',
          url: 'u',
        },
      ])
    );
    responses.set(
      'pulls/300/reviews',
      JSON.stringify([
        {
          id: 1,
          user: { login: 'mabry1985' }, // human, no [bot] suffix
          state: 'CHANGES_REQUESTED',
          commit_id: 'oldhead',
          submitted_at: '2026-05-24T00:00:00Z',
        },
        {
          id: 2,
          user: { login: 'mabry1985' },
          state: 'COMMENTED',
          commit_id: 'newhead',
          submitted_at: '2026-05-24T01:00:00Z',
        },
      ])
    );

    const { exec } = buildExec(responses);
    const check = new AutoDismissStaleBotReviewsCheck(REPO_COORDS, exec);

    const issues = await check.run(PROJECT_PATH);

    expect(issues).toEqual([]);
  });

  it('does NOT dismiss when CI has a failure on the current head', async () => {
    const head = 'newhead';
    const responses = new Map<string, string>();
    responses.set(
      'pr list --state open',
      JSON.stringify([
        {
          number: 400,
          headRefOid: head,
          mergeStateStatus: 'BLOCKED',
          reviewDecision: 'CHANGES_REQUESTED',
          url: 'u',
        },
      ])
    );
    responses.set(
      'pulls/400/reviews',
      JSON.stringify([
        {
          id: 1,
          user: { login: 'protoquinn[bot]' },
          state: 'CHANGES_REQUESTED',
          commit_id: 'oldhead',
          submitted_at: '2026-05-24T00:00:00Z',
        },
        {
          id: 2,
          user: { login: 'protoquinn[bot]' },
          state: 'COMMENTED',
          commit_id: head,
          submitted_at: '2026-05-24T01:00:00Z',
        },
      ])
    );
    responses.set(
      'pr view 400 --json statusCheckRollup',
      JSON.stringify({
        statusCheckRollup: [
          { name: 'checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
          { name: 'test', status: 'COMPLETED', conclusion: 'FAILURE' }, // ← fails
        ],
      })
    );

    const { exec, calls } = buildExec(responses);
    const check = new AutoDismissStaleBotReviewsCheck(REPO_COORDS, exec);

    const issues = await check.run(PROJECT_PATH);

    expect(issues).toEqual([]);
    expect(calls.every((c) => !c.args.join(' ').includes('dismissals'))).toBe(true);
  });

  it('does NOT dismiss when CI is still IN_PROGRESS (waits for stable state)', async () => {
    const responses = new Map<string, string>();
    responses.set(
      'pr list --state open',
      JSON.stringify([
        {
          number: 500,
          headRefOid: 'newhead',
          mergeStateStatus: 'BLOCKED',
          reviewDecision: 'CHANGES_REQUESTED',
          url: 'u',
        },
      ])
    );
    responses.set(
      'pulls/500/reviews',
      JSON.stringify([
        {
          id: 1,
          user: { login: 'protoquinn[bot]' },
          state: 'CHANGES_REQUESTED',
          commit_id: 'oldhead',
          submitted_at: '2026-05-24T00:00:00Z',
        },
        {
          id: 2,
          user: { login: 'protoquinn[bot]' },
          state: 'COMMENTED',
          commit_id: 'newhead',
          submitted_at: '2026-05-24T01:00:00Z',
        },
      ])
    );
    responses.set(
      'pr view 500 --json statusCheckRollup',
      JSON.stringify({
        statusCheckRollup: [
          { name: 'checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
          { name: 'test', status: 'IN_PROGRESS', conclusion: null },
        ],
      })
    );

    const { exec } = buildExec(responses);
    const check = new AutoDismissStaleBotReviewsCheck(REPO_COORDS, exec);

    const issues = await check.run(PROJECT_PATH);

    expect(issues).toEqual([]);
  });

  it('skips PRs that are not BLOCKED or do not have CHANGES_REQUESTED', async () => {
    const responses = new Map<string, string>();
    responses.set(
      'pr list --state open',
      JSON.stringify([
        // CLEAN — no action
        {
          number: 601,
          headRefOid: 'h',
          mergeStateStatus: 'CLEAN',
          reviewDecision: '',
          url: 'u',
        },
        // BLOCKED but for a different reason (no CHANGES_REQUESTED)
        {
          number: 602,
          headRefOid: 'h',
          mergeStateStatus: 'BLOCKED',
          reviewDecision: '',
          url: 'u',
        },
      ])
    );

    const { exec } = buildExec(responses);
    const check = new AutoDismissStaleBotReviewsCheck(REPO_COORDS, exec);

    const issues = await check.run(PROJECT_PATH);

    expect(issues).toEqual([]);
  });
});
