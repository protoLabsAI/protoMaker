/**
 * Unit tests for LinearAgentRouter intelligent routing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock feature-classifier before importing
vi.mock('@/services/feature-classifier.js', () => ({
  classifyFeature: vi.fn(),
}));

import { LinearAgentRouter } from '@/services/linear-agent-router.js';
import type { RoutingDecision } from '@/services/linear-agent-router.js';
import { classifyFeature } from '@/services/feature-classifier.js';

const mockClassify = vi.mocked(classifyFeature);

// Minimal mock types
interface MockTemplate {
  name: string;
  role: string;
  systemPrompt?: string;
}

function createMockRoleRegistry(templates: MockTemplate[] = []) {
  const map = new Map<string, MockTemplate>();
  for (const t of templates) {
    map.set(t.name, t);
  }
  return {
    resolve: vi.fn((nameOrRole: string) => {
      // Try by name first, then by role
      if (map.has(nameOrRole)) return map.get(nameOrRole);
      for (const t of map.values()) {
        if (t.role === nameOrRole) return t;
      }
      return undefined;
    }),
    getByRole: vi.fn(),
    has: vi.fn(),
    list: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
    update: vi.fn(),
  };
}

function createMockEvents() {
  return {
    subscribe: vi.fn(() => vi.fn()),
    emit: vi.fn(),
  };
}

function createMockLinearAgentService() {
  return {
    processAgentResponse: vi.fn(),
  };
}

function createMockSettingsService() {
  return {
    getProjectSettings: vi.fn().mockResolvedValue({
      integrations: { linear: { agentToken: 'test-token' } },
    }),
  };
}

function createIssueContext(overrides: Record<string, unknown> = {}) {
  return {
    id: 'issue-1',
    identifier: 'TEST-1',
    title: 'Test Issue',
    description: 'Test description',
    state: 'In Progress',
    team: 'Engineering',
    labels: [] as string[],
    priority: 3,
    priorityLabel: 'Medium',
    comments: [],
    children: [],
    relations: [],
    ...overrides,
  };
}

describe('LinearAgentRouter', () => {
  let router: LinearAgentRouter;
  let mockRegistry: ReturnType<typeof createMockRoleRegistry>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRegistry = createMockRoleRegistry([
      { name: 'ava', role: 'chief-of-staff', systemPrompt: 'You are Ava.' },
      { name: 'matt', role: 'frontend-engineer', systemPrompt: 'You are Matt.' },
      { name: 'frank', role: 'devops-engineer', systemPrompt: 'You are Frank.' },
      { name: 'jon', role: 'backend-engineer', systemPrompt: 'You are Jon.' },
    ]);

    router = new LinearAgentRouter(
      createMockEvents() as never,
      mockRegistry as never,
      createMockLinearAgentService() as never,
      createMockSettingsService() as never,
      '/test/project'
    );
  });

  describe('intelligentRoute', () => {
    it('tier 0: uses explicit agent when registered with system prompt', async () => {
      const ctx = createIssueContext();
      const result: RoutingDecision = await router.intelligentRoute('ava', ctx);

      expect(result.tier).toBe('explicit');
      expect(result.resolvedAgent).toBe('ava');
      expect(result.reasoning).toContain('Explicit agent');
    });

    it('tier 0: does NOT use explicit agent when not registered', async () => {
      const ctx = createIssueContext({ labels: ['frontend'] });
      mockClassify.mockResolvedValueOnce({
        role: 'frontend-engineer',
        confidence: 0.9,
        reasoning: 'UI work',
      });

      const result = await router.intelligentRoute('unknown-agent', ctx);

      // Should fall through to label matching
      expect(result.tier).toBe('label');
      expect(result.resolvedAgent).toBe('matt');
    });

    it('tier 1: routes by "frontend" label to matt', async () => {
      const ctx = createIssueContext({ labels: ['frontend', 'high-priority'] });

      const result = await router.intelligentRoute('unknown-agent', ctx);

      expect(result.tier).toBe('label');
      expect(result.role).toBe('frontend-engineer');
      expect(result.resolvedAgent).toBe('matt');
      expect(result.confidence).toBe(1.0);
    });

    it('tier 1: routes by "devops" label to frank', async () => {
      const ctx = createIssueContext({ labels: ['devops'] });

      const result = await router.intelligentRoute('unknown-agent', ctx);

      expect(result.tier).toBe('label');
      expect(result.role).toBe('devops-engineer');
      expect(result.resolvedAgent).toBe('frank');
    });

    it('tier 1: routes by "api" label to backend-engineer (jon)', async () => {
      const ctx = createIssueContext({ labels: ['api'] });

      const result = await router.intelligentRoute('unknown-agent', ctx);

      expect(result.tier).toBe('label');
      expect(result.role).toBe('backend-engineer');
      expect(result.resolvedAgent).toBe('jon');
    });

    it('tier 1: routes by "CI/CD" label (case-insensitive) to devops', async () => {
      const ctx = createIssueContext({ labels: ['CI/CD'] });

      const result = await router.intelligentRoute('unknown-agent', ctx);

      expect(result.tier).toBe('label');
      expect(result.role).toBe('devops-engineer');
      expect(result.resolvedAgent).toBe('frank');
    });

    it('tier 1: routes by "marketing" label to gtm-specialist', async () => {
      // gtm-specialist is not in our mock registry, so resolveAgentForRole returns role string
      const ctx = createIssueContext({ labels: ['marketing'] });

      const result = await router.intelligentRoute('unknown-agent', ctx);

      expect(result.tier).toBe('label');
      expect(result.role).toBe('gtm-specialist');
      expect(result.resolvedAgent).toBe('gtm-specialist'); // No template registered
    });

    it('tier 2: routes via AI classifier when no labels match', async () => {
      const ctx = createIssueContext({ labels: ['bug', 'p1'] }); // Non-routing labels
      mockClassify.mockResolvedValueOnce({
        role: 'frontend-engineer',
        confidence: 0.92,
        reasoning: 'React component with Tailwind CSS styling',
      });

      const result = await router.intelligentRoute('unknown-agent', ctx);

      expect(result.tier).toBe('classifier');
      expect(result.role).toBe('frontend-engineer');
      expect(result.resolvedAgent).toBe('matt');
      expect(result.confidence).toBe(0.92);
      expect(result.reasoning).toBe('React component with Tailwind CSS styling');
    });

    it('tier 2: skips classifier when confidence is below 0.6', async () => {
      const ctx = createIssueContext({ labels: [], team: 'Engineering' });
      mockClassify.mockResolvedValueOnce({
        role: 'frontend-engineer',
        confidence: 0.4,
        reasoning: 'Ambiguous',
      });

      const result = await router.intelligentRoute('unknown-agent', ctx);

      // Should fall through to team mapping
      expect(result.tier).toBe('team-mapping');
      expect(result.role).toBe('backend-engineer');
      expect(result.resolvedAgent).toBe('jon');
    });

    it('tier 2: falls through when classifier throws', async () => {
      const ctx = createIssueContext({ labels: [], team: 'Engineering' });
      mockClassify.mockRejectedValueOnce(new Error('API rate limit'));

      const result = await router.intelligentRoute('unknown-agent', ctx);

      expect(result.tier).toBe('team-mapping');
      expect(result.role).toBe('backend-engineer');
    });

    it('tier 3: routes by team name when labels and classifier miss', async () => {
      const ctx = createIssueContext({ labels: [], team: 'Frontend' });
      mockClassify.mockResolvedValueOnce({
        role: 'backend-engineer',
        confidence: 0.3,
        reasoning: 'Low confidence',
      });

      const result = await router.intelligentRoute('unknown-agent', ctx);

      expect(result.tier).toBe('team-mapping');
      expect(result.role).toBe('frontend-engineer');
      expect(result.resolvedAgent).toBe('matt');
      expect(result.reasoning).toContain('Team "Frontend"');
    });

    it('tier 3: maps "Infrastructure" team to devops-engineer', async () => {
      const ctx = createIssueContext({ labels: [], team: 'Infrastructure' });
      mockClassify.mockResolvedValueOnce({
        role: 'backend-engineer',
        confidence: 0.2,
        reasoning: 'Very low confidence',
      });

      const result = await router.intelligentRoute('unknown-agent', ctx);

      expect(result.tier).toBe('team-mapping');
      expect(result.role).toBe('devops-engineer');
      expect(result.resolvedAgent).toBe('frank');
    });

    it('tier 3: maps "Marketing" team to gtm-specialist', async () => {
      const ctx = createIssueContext({ labels: [], team: 'Marketing' });
      mockClassify.mockResolvedValueOnce({
        role: 'backend-engineer',
        confidence: 0.1,
        reasoning: 'Very low',
      });

      const result = await router.intelligentRoute('unknown-agent', ctx);

      expect(result.tier).toBe('team-mapping');
      expect(result.role).toBe('gtm-specialist');
    });

    it('default fallback when nothing matches', async () => {
      const ctx = createIssueContext({ labels: [], team: 'Unknown Team' });
      mockClassify.mockResolvedValueOnce({
        role: 'backend-engineer',
        confidence: 0.3,
        reasoning: 'Low confidence',
      });

      const result = await router.intelligentRoute('some-agent', ctx);

      expect(result.tier).toBe('default');
      expect(result.resolvedAgent).toBe('some-agent');
      expect(result.reasoning).toContain('No routing signals');
    });

    it('prefers labels over classifier even when classifier has high confidence', async () => {
      const ctx = createIssueContext({ labels: ['devops'] });
      // Classifier would say frontend but labels say devops
      mockClassify.mockResolvedValueOnce({
        role: 'frontend-engineer',
        confidence: 0.99,
        reasoning: 'Very confident frontend',
      });

      const result = await router.intelligentRoute('unknown-agent', ctx);

      // Labels win — classifier shouldn't even be called
      expect(result.tier).toBe('label');
      expect(result.role).toBe('devops-engineer');
      expect(mockClassify).not.toHaveBeenCalled();
    });

    it('prefers explicit agent over labels', async () => {
      const ctx = createIssueContext({ labels: ['frontend'] });

      const result = await router.intelligentRoute('ava', ctx);

      expect(result.tier).toBe('explicit');
      expect(result.resolvedAgent).toBe('ava');
      // Labels should not be checked
    });

    it('uses classifier confidence at exact threshold (0.6)', async () => {
      const ctx = createIssueContext({ labels: [] });
      mockClassify.mockResolvedValueOnce({
        role: 'devops-engineer',
        confidence: 0.6,
        reasoning: 'Borderline devops',
      });

      const result = await router.intelligentRoute('unknown-agent', ctx);

      expect(result.tier).toBe('classifier');
      expect(result.role).toBe('devops-engineer');
      expect(result.confidence).toBe(0.6);
    });

    it('skips classifier at 0.59 confidence', async () => {
      const ctx = createIssueContext({ labels: [], team: 'Engineering' });
      mockClassify.mockResolvedValueOnce({
        role: 'devops-engineer',
        confidence: 0.59,
        reasoning: 'Just below threshold',
      });

      const result = await router.intelligentRoute('unknown-agent', ctx);

      expect(result.tier).toBe('team-mapping');
    });

    it('passes correct args to classifyFeature', async () => {
      const ctx = createIssueContext({
        labels: [],
        team: 'Custom',
        title: 'My Feature',
        description: 'Feature details here',
      });
      mockClassify.mockResolvedValueOnce({
        role: 'backend-engineer',
        confidence: 0.85,
        reasoning: 'Server work',
      });

      await router.intelligentRoute('unknown-agent', ctx);

      expect(mockClassify).toHaveBeenCalledWith(
        'My Feature',
        'Feature details here',
        '/test/project'
      );
    });
  });
});
