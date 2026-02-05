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

describe('Webhook Types Verification', () => {
  describe('GitHubWebhookEvent', () => {
    it('should include check_suite and check_run events', () => {
      const checkSuiteEvent: GitHubWebhookEvent = 'check_suite';
      const checkRunEvent: GitHubWebhookEvent = 'check_run';

      expect(checkSuiteEvent).toBe('check_suite');
      expect(checkRunEvent).toBe('check_run');
    });
  });

  describe('GitHubCheckSuiteAction', () => {
    it('should support all check suite actions', () => {
      const completed: GitHubCheckSuiteAction = 'completed';
      const requested: GitHubCheckSuiteAction = 'requested';
      const rerequested: GitHubCheckSuiteAction = 'rerequested';

      expect(completed).toBe('completed');
      expect(requested).toBe('requested');
      expect(rerequested).toBe('rerequested');
    });
  });

  describe('GitHubCheckRunAction', () => {
    it('should support all check run actions', () => {
      const created: GitHubCheckRunAction = 'created';
      const completed: GitHubCheckRunAction = 'completed';
      const rerequested: GitHubCheckRunAction = 'rerequested';
      const requestedAction: GitHubCheckRunAction = 'requested_action';

      expect(created).toBe('created');
      expect(completed).toBe('completed');
      expect(rerequested).toBe('rerequested');
      expect(requestedAction).toBe('requested_action');
    });
  });

  describe('GitHubCheckSuite', () => {
    it('should accept valid check suite object', () => {
      const checkSuite: GitHubCheckSuite = {
        id: 123456,
        node_id: 'CS_kwDOABcD1M8AAAAAB1234',
        head_branch: 'main',
        head_sha: 'abc123def456',
        status: 'completed',
        conclusion: 'success',
        url: 'https://api.github.com/repos/owner/repo/check-suites/123456',
        before: 'before123',
        after: 'after456',
        pull_requests: [
          {
            id: 1,
            number: 123,
            url: 'https://api.github.com/repos/owner/repo/pulls/123',
            head: { ref: 'feature', sha: 'head123' },
            base: { ref: 'main', sha: 'base123' },
          },
        ],
        app: {
          id: 1,
          name: 'GitHub Actions',
          slug: 'github-actions',
        },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T01:00:00Z',
      };

      expect(checkSuite.id).toBe(123456);
      expect(checkSuite.status).toBe('completed');
      expect(checkSuite.conclusion).toBe('success');
    });

    it('should allow null values for optional fields', () => {
      const checkSuite: GitHubCheckSuite = {
        id: 123456,
        node_id: 'CS_kwDOABcD1M8AAAAAB1234',
        head_branch: null,
        head_sha: 'abc123def456',
        status: null,
        conclusion: null,
        url: null,
        before: null,
        after: null,
        pull_requests: null,
        app: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T01:00:00Z',
      };

      expect(checkSuite.head_branch).toBeNull();
      expect(checkSuite.conclusion).toBeNull();
    });
  });

  describe('GitHubCheckRun', () => {
    it('should accept valid check run object', () => {
      const checkRun: GitHubCheckRun = {
        id: 789012,
        head_sha: 'abc123def456',
        node_id: 'CR_kwDOABcD1M8AAAAAB7890',
        external_id: 'external-123',
        url: 'https://api.github.com/repos/owner/repo/check-runs/789012',
        html_url: 'https://github.com/owner/repo/runs/789012',
        details_url: 'https://example.com/details',
        status: 'completed',
        conclusion: 'success',
        started_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T01:00:00Z',
        name: 'Test Suite',
        check_suite: { id: 123456 },
        app: {
          id: 1,
          name: 'GitHub Actions',
          slug: 'github-actions',
        },
        pull_requests: [
          {
            id: 1,
            number: 123,
            url: 'https://api.github.com/repos/owner/repo/pulls/123',
            head: { ref: 'feature', sha: 'head123' },
            base: { ref: 'main', sha: 'base123' },
          },
        ],
        output: {
          title: 'All tests passed',
          summary: '10 tests passed',
          text: 'Detailed results...',
        },
      };

      expect(checkRun.id).toBe(789012);
      expect(checkRun.status).toBe('completed');
      expect(checkRun.conclusion).toBe('success');
      expect(checkRun.name).toBe('Test Suite');
    });
  });

  describe('GitHubCheckSuiteWebhookPayload', () => {
    it('should accept valid check suite webhook payload', () => {
      const payload: GitHubCheckSuiteWebhookPayload = {
        action: 'completed',
        check_suite: {
          id: 123456,
          node_id: 'CS_kwDOABcD1M8AAAAAB1234',
          head_branch: 'main',
          head_sha: 'abc123def456',
          status: 'completed',
          conclusion: 'success',
          url: 'https://api.github.com/repos/owner/repo/check-suites/123456',
          before: null,
          after: null,
          pull_requests: null,
          app: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T01:00:00Z',
        },
        repository: {
          id: 1,
          name: 'repo',
          full_name: 'owner/repo',
          owner: { login: 'owner', id: 1, type: 'User' },
          private: false,
          html_url: 'https://github.com/owner/repo',
          default_branch: 'main',
        },
        sender: { login: 'user', id: 1, type: 'User' },
      };

      expect(payload.action).toBe('completed');
      expect(payload.check_suite.id).toBe(123456);
    });
  });

  describe('GitHubCheckRunWebhookPayload', () => {
    it('should accept valid check run webhook payload', () => {
      const payload: GitHubCheckRunWebhookPayload = {
        action: 'completed',
        check_run: {
          id: 789012,
          head_sha: 'abc123def456',
          node_id: 'CR_kwDOABcD1M8AAAAAB7890',
          external_id: null,
          url: 'https://api.github.com/repos/owner/repo/check-runs/789012',
          html_url: null,
          details_url: null,
          status: 'completed',
          conclusion: 'success',
          started_at: '2024-01-01T00:00:00Z',
          completed_at: '2024-01-01T01:00:00Z',
          name: 'Test Suite',
          check_suite: { id: 123456 },
          app: null,
          pull_requests: [],
          output: {
            title: null,
            summary: null,
          },
        },
        repository: {
          id: 1,
          name: 'repo',
          full_name: 'owner/repo',
          owner: { login: 'owner', id: 1, type: 'User' },
          private: false,
          html_url: 'https://github.com/owner/repo',
          default_branch: 'main',
        },
        sender: { login: 'user', id: 1, type: 'User' },
      };

      expect(payload.action).toBe('completed');
      expect(payload.check_run.id).toBe(789012);
    });
  });

  describe('GitHubWebhookPayload Union Type', () => {
    it('should accept check suite payload', () => {
      const payload: GitHubWebhookPayload = {
        action: 'completed',
        check_suite: {
          id: 123456,
          node_id: 'CS_kwDOABcD1M8AAAAAB1234',
          head_branch: 'main',
          head_sha: 'abc123def456',
          status: 'completed',
          conclusion: 'success',
          url: null,
          before: null,
          after: null,
          pull_requests: null,
          app: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T01:00:00Z',
        },
        repository: {
          id: 1,
          name: 'repo',
          full_name: 'owner/repo',
          owner: { login: 'owner', id: 1, type: 'User' },
          private: false,
          html_url: 'https://github.com/owner/repo',
          default_branch: 'main',
        },
        sender: { login: 'user', id: 1, type: 'User' },
      } as GitHubCheckSuiteWebhookPayload;

      expect(payload).toBeDefined();
      expect('check_suite' in payload).toBe(true);
    });

    it('should accept check run payload', () => {
      const payload: GitHubWebhookPayload = {
        action: 'created',
        check_run: {
          id: 789012,
          head_sha: 'abc123def456',
          node_id: 'CR_kwDOABcD1M8AAAAAB7890',
          external_id: null,
          url: 'https://api.github.com/repos/owner/repo/check-runs/789012',
          html_url: null,
          details_url: null,
          status: 'queued',
          conclusion: null,
          started_at: null,
          completed_at: null,
          name: 'Test Suite',
          check_suite: { id: 123456 },
          app: null,
          pull_requests: [],
          output: {
            title: null,
            summary: null,
          },
        },
        repository: {
          id: 1,
          name: 'repo',
          full_name: 'owner/repo',
          owner: { login: 'owner', id: 1, type: 'User' },
          private: false,
          html_url: 'https://github.com/owner/repo',
          default_branch: 'main',
        },
        sender: { login: 'user', id: 1, type: 'User' },
      } as GitHubCheckRunWebhookPayload;

      expect(payload).toBeDefined();
      expect('check_run' in payload).toBe(true);
    });
  });
});
