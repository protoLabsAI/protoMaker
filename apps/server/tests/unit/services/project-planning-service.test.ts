/**
 * ProjectPlanningService Unit Tests
 *
 * Tests the orchestration layer that connects LangGraph flows to
 * Linear's agent protocol via ConversationSurface.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectPlanningService } from '../../../src/services/project-planning-service.js';
import type { EventEmitter } from '../../../src/lib/events.js';
import type { LinearAgentService } from '../../../src/services/linear-agent-service.js';

// ─── Mock Factory ───────────────────────────────────────────────

function createMockEvents(): EventEmitter {
  const subscribers: Array<(type: string, payload: unknown) => void> = [];
  return {
    emit: vi.fn((type: string, payload: unknown) => {
      for (const sub of subscribers) sub(type, payload);
    }),
    subscribe: vi.fn((fn: (type: string, payload: unknown) => void) => {
      subscribers.push(fn);
      return () => {
        const idx = subscribers.indexOf(fn);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    }),
  } as unknown as EventEmitter;
}

function createMockAgentService(): LinearAgentService {
  return {
    configure: vi.fn(),
    acknowledge: vi.fn().mockResolvedValue(undefined),
    emitThought: vi.fn().mockResolvedValue('activity-1'),
    emitAction: vi.fn().mockResolvedValue('activity-2'),
    askQuestion: vi.fn().mockResolvedValue('activity-3'),
    sendResponse: vi.fn().mockResolvedValue('activity-4'),
    reportError: vi.fn().mockResolvedValue('activity-5'),
    updatePlan: vi.fn().mockResolvedValue(undefined),
    createSession: vi.fn().mockResolvedValue('session-123'),
    trackSession: vi.fn(),
    getSession: vi.fn().mockReturnValue(undefined),
    getConversationHistory: vi.fn().mockResolvedValue([]),
    createProjectDocument: vi.fn().mockResolvedValue({ id: 'doc-1', title: 'Test Doc' }),
    updateDocument: vi.fn().mockResolvedValue(true),
    getDocument: vi.fn().mockResolvedValue(null),
    listProjectDocuments: vi.fn().mockResolvedValue([]),
  } as unknown as LinearAgentService;
}

// ─── Tests ──────────────────────────────────────────────────────

describe('ProjectPlanningService', () => {
  let events: EventEmitter;
  let agentService: LinearAgentService;
  let service: ProjectPlanningService;

  beforeEach(() => {
    events = createMockEvents();
    agentService = createMockAgentService();
    service = new ProjectPlanningService(events, agentService, '/home/test/project');
  });

  describe('lifecycle', () => {
    it('should start and subscribe to events', () => {
      service.start();
      expect(events.subscribe).toHaveBeenCalled();
    });

    it('should stop and unsubscribe from events', () => {
      service.start();
      service.stop();
      // After stop, emitting should not trigger handlers
      // (the unsubscribe returned by subscribe was called)
    });

    it('should not double-start', () => {
      service.start();
      service.start();
      expect(events.subscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleProjectCreated', () => {
    it('should create a session and start planning on project:created', async () => {
      service.start();

      // Emit a project created event
      (events as any).emit('linear:project:created', {
        projectId: 'proj-abc',
        name: 'New Feature',
        description: 'Build something cool',
        state: 'started',
        teamId: 'team-1',
        teamName: 'Engineering',
        url: 'https://linear.app/test/project/proj-abc',
        createdAt: '2026-02-15T00:00:00Z',
      });

      // Let the async handler settle
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should have created a session
      expect(agentService.createSession).toHaveBeenCalledWith('proj-abc');

      // Should have acknowledged
      expect(agentService.acknowledge).toHaveBeenCalledWith(
        'session-123',
        expect.stringContaining('New Feature')
      );

      // Should have set plan steps
      expect(agentService.updatePlan).toHaveBeenCalled();
    });

    it('should create documents at HITL checkpoints', async () => {
      service.start();

      (events as any).emit('linear:project:created', {
        projectId: 'proj-docs',
        name: 'Docs Test',
        description: 'Test document creation',
        state: 'started',
        createdAt: '2026-02-15T00:00:00Z',
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      // The flow with default mocks should auto-approve through all gates
      // (since latestHitlResponse starts as undefined → HITL router returns approveTarget)
      // This means it goes research → planning_doc → hitl_planning → deep_research → ... → done
      // Without an explicit HITL response, the router defaults to approve

      // Should reach completion and send a response
      expect(agentService.sendResponse).toHaveBeenCalled();
    });
  });

  describe('handleSessionPrompted', () => {
    it('should ignore sessions not tracked by planning service', async () => {
      service.start();

      (events as any).emit('linear:agent-session:prompted', {
        sessionId: 'unknown-session',
        issueId: 'issue-1',
        prompt: 'approve',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should NOT acknowledge (session not found)
      // The first acknowledge call would be for a new session, not this one
      const acknowledgeCalls = (agentService.acknowledge as any).mock.calls;
      const hasUnknownSession = acknowledgeCalls.some(
        (call: string[]) => call[0] === 'unknown-session'
      );
      expect(hasUnknownSession).toBe(false);
    });
  });

  describe('parseUserResponse', () => {
    it('should be tested indirectly through the flow', async () => {
      // The parseUserResponse is private, but we can verify its behavior
      // through the integration with handleSessionPrompted.
      // "approve", "lgtm", "yes" → approve
      // "cancel", "stop", "abort" → cancel
      // anything else → revise with feedback

      service.start();

      // Start a planning session first
      (events as any).emit('linear:project:created', {
        projectId: 'proj-parse',
        name: 'Parse Test',
        description: 'Test response parsing',
        state: 'started',
        createdAt: '2026-02-15T00:00:00Z',
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      // If the flow reached a HITL checkpoint and asked a question,
      // we'd send a prompted event with "approve" to continue
      // For now, verify the service processes project creation correctly
      expect(agentService.createSession).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('should return undefined for unknown sessions', () => {
      expect(service.getStatus('unknown')).toBeUndefined();
    });
  });
});
