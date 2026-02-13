/**
 * Unit tests for Linear webhook handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { createHmac } from 'node:crypto';
import { createWebhookHandler } from '@/routes/linear/webhook.js';
import type { SettingsService } from '@/services/settings-service.js';
import type { EventEmitter } from '@/lib/events.js';
import type { FeatureLoader } from '@/services/feature-loader.js';
import { createMockExpressContext } from '../../utils/mocks.js';

// Mock external services before they're imported by the webhook module
vi.mock('@/services/linear-sync-service.js', () => ({
  linearSyncService: {
    onLinearIssueUpdated: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/services/linear-approval-handler.js', () => ({
  linearApprovalHandler: {
    onIssueStateChange: vi.fn().mockResolvedValue(undefined),
  },
}));

// eslint-disable-next-line import/first
import { linearSyncService } from '@/services/linear-sync-service.js';

function createMockSettingsService(): Partial<SettingsService> {
  return {
    get: vi.fn(),
    set: vi.fn(),
  };
}

function createMockEventEmitter(): EventEmitter {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    once: vi.fn(),
  } as any;
}

function createMockFeatureLoader(): Partial<FeatureLoader> {
  return {
    findByLinearIssueId: vi.fn(),
    getAll: vi.fn(),
    load: vi.fn(),
  };
}

/**
 * Helper to compute webhook signature
 */
function computeSignature(body: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(body);
  return hmac.digest('hex');
}

describe('Linear Webhook Handler', () => {
  let settingsService: Partial<SettingsService>;
  let events: EventEmitter;
  let featureLoader: Partial<FeatureLoader>;
  let req: Request;
  let res: Response;
  let webhookSecret: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    settingsService = createMockSettingsService();
    events = createMockEventEmitter();
    featureLoader = createMockFeatureLoader();
    const context = createMockExpressContext();
    req = context.req;
    res = context.res;
    webhookSecret = undefined;

    // Setup environment
    delete process.env.LINEAR_WEBHOOK_SECRET;
  });

  describe('Webhook Signature Verification', () => {
    it('accepts valid signature', async () => {
      const secret = 'test-secret';
      process.env.LINEAR_WEBHOOK_SECRET = secret;

      const payload = {
        action: 'create',
        type: 'AgentSession',
        data: { id: 'session-123', trigger: 'mention' },
      };
      const body = JSON.stringify(payload);
      const signature = computeSignature(body, secret);

      req.body = payload;
      req.headers = { 'linear-signature': signature };

      const handler = createWebhookHandler(
        settingsService as SettingsService,
        events,
        featureLoader as FeatureLoader
      );

      await handler(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it('rejects invalid signature', async () => {
      const secret = 'test-secret';
      process.env.LINEAR_WEBHOOK_SECRET = secret;

      const payload = {
        action: 'create',
        type: 'AgentSession',
        data: { id: 'session-123', trigger: 'mention' },
      };

      req.body = payload;
      req.headers = { 'linear-signature': 'invalid-signature' };

      const handler = createWebhookHandler(
        settingsService as SettingsService,
        events,
        featureLoader as FeatureLoader
      );

      await handler(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid signature' });
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('accepts webhook without signature when secret not configured', async () => {
      const payload = {
        action: 'create',
        type: 'AgentSession',
        data: { id: 'session-123', trigger: 'mention' },
      };

      req.body = payload;
      req.headers = {};

      const handler = createWebhookHandler(
        settingsService as SettingsService,
        events,
        featureLoader as FeatureLoader
      );

      await handler(req, res, vi.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });
  });

  describe('AgentSession Events', () => {
    it('handles AgentSession create event', async () => {
      const payload = {
        action: 'create',
        type: 'AgentSession',
        data: {
          id: 'session-123',
          issueId: 'issue-456',
          trigger: 'mention',
          prompt: 'Help with this issue',
          organizationId: 'org-789',
        },
      };

      req.body = payload;

      const handler = createWebhookHandler(
        settingsService as SettingsService,
        events,
        featureLoader as FeatureLoader
      );

      await handler(req, res, vi.fn());

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(events.emit).toHaveBeenCalledWith('linear:agent-session:created', {
        sessionId: 'session-123',
        issueId: 'issue-456',
        commentId: undefined,
        trigger: 'mention',
        prompt: 'Help with this issue',
        agentType: 'ava',
        organizationId: 'org-789',
      });
    });

    it('routes to GTM agent for GTM-related prompts', async () => {
      const payload = {
        action: 'create',
        type: 'AgentSession',
        data: {
          id: 'session-123',
          issueId: 'issue-456',
          trigger: 'mention',
          prompt: 'Help with GTM strategy for this launch',
        },
      };

      req.body = payload;

      const handler = createWebhookHandler(
        settingsService as SettingsService,
        events,
        featureLoader as FeatureLoader
      );

      await handler(req, res, vi.fn());
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(events.emit).toHaveBeenCalledWith(
        'linear:agent-session:created',
        expect.objectContaining({
          agentType: 'jon',
        })
      );
    });

    it('handles AgentSession update event', async () => {
      const payload = {
        action: 'update',
        type: 'AgentSession',
        data: {
          id: 'session-123',
          issueId: 'issue-456',
          prompt: 'Additional context',
          status: 'active',
        },
      };

      req.body = payload;

      const handler = createWebhookHandler(
        settingsService as SettingsService,
        events,
        featureLoader as FeatureLoader
      );

      await handler(req, res, vi.fn());
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(events.emit).toHaveBeenCalledWith('linear:agent-session:updated', {
        sessionId: 'session-123',
        issueId: 'issue-456',
        prompt: 'Additional context',
        status: 'active',
      });
    });

    it('handles AgentSession remove event', async () => {
      const payload = {
        action: 'remove',
        type: 'AgentSession',
        data: {
          id: 'session-123',
        },
      };

      req.body = payload;

      const handler = createWebhookHandler(
        settingsService as SettingsService,
        events,
        featureLoader as FeatureLoader
      );

      await handler(req, res, vi.fn());
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(events.emit).toHaveBeenCalledWith('linear:agent-session:removed', {
        sessionId: 'session-123',
      });
    });
  });

  describe('Issue Events', () => {
    it('delegates Issue update to sync service and emits event', async () => {
      const payload = {
        action: 'update',
        type: 'Issue',
        data: {
          id: 'issue-456',
          title: 'New Title',
          description: 'Issue description',
          state: { id: 'state-1', name: 'In Progress', type: 'started' },
          priority: 2,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          url: 'https://linear.app/issue/issue-456',
        },
      };

      req.body = payload;

      const handler = createWebhookHandler(
        settingsService as SettingsService,
        events,
        featureLoader as FeatureLoader
      );

      await handler(req, res, vi.fn());
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify delegation to sync service
      expect(linearSyncService.onLinearIssueUpdated).toHaveBeenCalledWith(
        'issue-456',
        'In Progress',
        expect.any(String), // projectPath (process.cwd())
        { title: 'New Title', priority: 2 }
      );

      // Verify simplified event emission
      expect(events.emit).toHaveBeenCalledWith('linear:issue:updated', {
        issueId: 'issue-456',
        title: 'New Title',
        state: 'In Progress',
        priority: 2,
        updatedAt: '2024-01-02T00:00:00Z',
      });
    });

    it('passes state name to sync service for Backlog state', async () => {
      const payload = {
        action: 'update',
        type: 'Issue',
        data: {
          id: 'issue-456',
          title: 'Title',
          state: { id: 'state-1', name: 'Backlog', type: 'backlog' },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          url: 'https://linear.app/issue/issue-456',
        },
      };

      req.body = payload;

      const handler = createWebhookHandler(
        settingsService as SettingsService,
        events,
        featureLoader as FeatureLoader
      );

      await handler(req, res, vi.fn());
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(linearSyncService.onLinearIssueUpdated).toHaveBeenCalledWith(
        'issue-456',
        'Backlog',
        expect.any(String),
        { title: 'Title', priority: undefined }
      );

      expect(events.emit).toHaveBeenCalledWith('linear:issue:updated', {
        issueId: 'issue-456',
        title: 'Title',
        state: 'Backlog',
        priority: undefined,
        updatedAt: '2024-01-02T00:00:00Z',
      });
    });

    it('passes state name to sync service for Done state', async () => {
      const payload = {
        action: 'update',
        type: 'Issue',
        data: {
          id: 'issue-456',
          title: 'Title',
          state: { id: 'state-1', name: 'Done', type: 'completed' },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          url: 'https://linear.app/issue/issue-456',
        },
      };

      req.body = payload;

      const handler = createWebhookHandler(
        settingsService as SettingsService,
        events,
        featureLoader as FeatureLoader
      );

      await handler(req, res, vi.fn());
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(linearSyncService.onLinearIssueUpdated).toHaveBeenCalledWith(
        'issue-456',
        'Done',
        expect.any(String),
        { title: 'Title', priority: undefined }
      );
    });

    it('passes priority to sync service', async () => {
      const payload = {
        action: 'update',
        type: 'Issue',
        data: {
          id: 'issue-456',
          title: 'Title',
          priority: 1, // urgent
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          url: 'https://linear.app/issue/issue-456',
        },
      };

      req.body = payload;

      const handler = createWebhookHandler(
        settingsService as SettingsService,
        events,
        featureLoader as FeatureLoader
      );

      await handler(req, res, vi.fn());
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(linearSyncService.onLinearIssueUpdated).toHaveBeenCalledWith(
        'issue-456',
        'Unknown', // no state provided
        expect.any(String),
        { title: 'Title', priority: 1 }
      );

      expect(events.emit).toHaveBeenCalledWith('linear:issue:updated', {
        issueId: 'issue-456',
        title: 'Title',
        state: undefined,
        priority: 1,
        updatedAt: '2024-01-02T00:00:00Z',
      });
    });

    it('handles Issue update when no state is provided', async () => {
      const payload = {
        action: 'update',
        type: 'Issue',
        data: {
          id: 'issue-456',
          title: 'Title',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          url: 'https://linear.app/issue/issue-456',
        },
      };

      req.body = payload;

      const handler = createWebhookHandler(
        settingsService as SettingsService,
        events,
        featureLoader as FeatureLoader
      );

      await handler(req, res, vi.fn());
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(linearSyncService.onLinearIssueUpdated).toHaveBeenCalledWith(
        'issue-456',
        'Unknown',
        expect.any(String),
        { title: 'Title', priority: undefined }
      );
    });
  });

  describe('Project Events', () => {
    it('handles Project update event', async () => {
      const payload = {
        action: 'update',
        type: 'Project',
        data: {
          id: 'project-123',
          name: 'New Project',
          description: 'Project description',
          state: 'started',
          team: { id: 'team-1', name: 'Engineering' },
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          url: 'https://linear.app/project/project-123',
        },
      };

      req.body = payload;

      const handler = createWebhookHandler(
        settingsService as SettingsService,
        events,
        featureLoader as FeatureLoader
      );

      await handler(req, res, vi.fn());
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(events.emit).toHaveBeenCalledWith('linear:project:updated', {
        projectId: 'project-123',
        name: 'New Project',
        state: 'started',
        updatedAt: '2024-01-02T00:00:00Z',
      });
    });

    it('handles Project create event', async () => {
      const payload = {
        action: 'create',
        type: 'Project',
        data: {
          id: 'project-123',
          name: 'New Project',
          state: 'planned',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          url: 'https://linear.app/project/project-123',
        },
      };

      req.body = payload;

      const handler = createWebhookHandler(
        settingsService as SettingsService,
        events,
        featureLoader as FeatureLoader
      );

      await handler(req, res, vi.fn());
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Project create doesn't emit events currently
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('responds successfully even if event processing fails', async () => {
      vi.mocked(linearSyncService.onLinearIssueUpdated).mockRejectedValueOnce(
        new Error('Database error')
      );

      const payload = {
        action: 'update',
        type: 'Issue',
        data: {
          id: 'issue-456',
          title: 'Title',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
          url: 'https://linear.app/issue/issue-456',
        },
      };

      req.body = payload;

      const handler = createWebhookHandler(
        settingsService as SettingsService,
        events,
        featureLoader as FeatureLoader
      );

      await handler(req, res, vi.fn());

      // Should still respond with 200 (webhook acknowledged)
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });
  });
});
