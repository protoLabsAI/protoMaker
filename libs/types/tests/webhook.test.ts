/**
 * Webhook Types Verification Test
 *
 * This test verifies that the webhook types are properly defined and exported.
 * This is a temporary test for verification purposes only.
 */

import { describe, it, expect } from 'vitest';
import type {
  GitHubWebhookEvent,
  GitHubCheckSuiteAction,
  GitHubCheckRunAction,
  GitHubCheckSuite,
  GitHubCheckRun,
  GitHubCheckSuiteWebhookPayload,
  GitHubCheckRunWebhookPayload,
  GitHubWebhookPayload,
} from '../src/webhook';

describe('Webhook Types', () => {
  it('should accept check_suite as a valid GitHubWebhookEvent', () => {
    const event: GitHubWebhookEvent = 'check_suite';
    expect(event).toBe('check_suite');
  });

  it('should accept check_run as a valid GitHubWebhookEvent', () => {
    const event: GitHubWebhookEvent = 'check_run';
    expect(event).toBe('check_run');
  });

  it('should accept valid check suite actions', () => {
    const actions: GitHubCheckSuiteAction[] = ['completed', 'requested', 'rerequested'];
    expect(actions).toHaveLength(3);
  });

  it('should accept valid check run actions', () => {
    const actions: GitHubCheckRunAction[] = ['created', 'completed', 'rerequested', 'requested_action'];
    expect(actions).toHaveLength(4);
  });

  it('should create a valid GitHubCheckSuiteWebhookPayload object', () => {
    const payload: GitHubCheckSuiteWebhookPayload = {
      action: 'completed',
      check_suite: {
        id: 123,
        node_id: 'CS_kwDOB',
        head_branch: 'main',
        head_sha: 'abc123',
        status: 'completed',
        conclusion: 'success',
        url: 'https://api.github.com/repos/test/repo/check-suites/123',
        before: null,
        after: 'abc123',
        pull_requests: null,
        app: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:01:00Z',
      },
      repository: {
        id: 1,
        name: 'test-repo',
        full_name: 'test/test-repo',
        owner: {
          login: 'test',
          id: 1,
          type: 'User',
        },
        private: false,
        html_url: 'https://github.com/test/test-repo',
        default_branch: 'main',
      },
      sender: {
        login: 'test-user',
        id: 1,
        type: 'User',
      },
    };

    expect(payload.action).toBe('completed');
    expect(payload.check_suite.id).toBe(123);
  });

  it('should create a valid GitHubCheckRunWebhookPayload object', () => {
    const payload: GitHubCheckRunWebhookPayload = {
      action: 'completed',
      check_run: {
        id: 456,
        head_sha: 'def456',
        node_id: 'CR_kwDOB',
        external_id: null,
        url: 'https://api.github.com/repos/test/repo/check-runs/456',
        html_url: 'https://github.com/test/repo/runs/456',
        details_url: null,
        status: 'completed',
        conclusion: 'success',
        started_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:01:00Z',
        name: 'Test Check',
        check_suite: {
          id: 123,
        },
        app: null,
        pull_requests: [],
        output: {
          title: 'Test Passed',
          summary: 'All tests passed',
        },
      },
      repository: {
        id: 1,
        name: 'test-repo',
        full_name: 'test/test-repo',
        owner: {
          login: 'test',
          id: 1,
          type: 'User',
        },
        private: false,
        html_url: 'https://github.com/test/test-repo',
        default_branch: 'main',
      },
      sender: {
        login: 'test-user',
        id: 1,
        type: 'User',
      },
    };

    expect(payload.action).toBe('completed');
    expect(payload.check_run.id).toBe(456);
  });

  it('should accept GitHubCheckSuiteWebhookPayload as GitHubWebhookPayload', () => {
    const payload: GitHubWebhookPayload = {
      action: 'completed',
      check_suite: {
        id: 123,
        node_id: 'CS_kwDOB',
        head_branch: 'main',
        head_sha: 'abc123',
        status: 'completed',
        conclusion: 'success',
        url: 'https://api.github.com/repos/test/repo/check-suites/123',
        before: null,
        after: 'abc123',
        pull_requests: null,
        app: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:01:00Z',
      },
      repository: {
        id: 1,
        name: 'test-repo',
        full_name: 'test/test-repo',
        owner: {
          login: 'test',
          id: 1,
          type: 'User',
        },
        private: false,
        html_url: 'https://github.com/test/test-repo',
        default_branch: 'main',
      },
      sender: {
        login: 'test-user',
        id: 1,
        type: 'User',
      },
    } as GitHubCheckSuiteWebhookPayload;

    expect(payload).toBeDefined();
  });

  it('should accept GitHubCheckRunWebhookPayload as GitHubWebhookPayload', () => {
    const payload: GitHubWebhookPayload = {
      action: 'completed',
      check_run: {
        id: 456,
        head_sha: 'def456',
        node_id: 'CR_kwDOB',
        external_id: null,
        url: 'https://api.github.com/repos/test/repo/check-runs/456',
        html_url: 'https://github.com/test/repo/runs/456',
        details_url: null,
        status: 'completed',
        conclusion: 'success',
        started_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:01:00Z',
        name: 'Test Check',
        check_suite: {
          id: 123,
        },
        app: null,
        pull_requests: [],
        output: {
          title: 'Test Passed',
          summary: 'All tests passed',
        },
      },
      repository: {
        id: 1,
        name: 'test-repo',
        full_name: 'test/test-repo',
        owner: {
          login: 'test',
          id: 1,
          type: 'User',
        },
        private: false,
        html_url: 'https://github.com/test/test-repo',
        default_branch: 'main',
      },
      sender: {
        login: 'test-user',
        id: 1,
        type: 'User',
      },
    } as GitHubCheckRunWebhookPayload;

    expect(payload).toBeDefined();
  });
});
