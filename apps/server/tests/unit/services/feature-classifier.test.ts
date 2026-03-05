/**
 * Unit tests for FeatureClassifier
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the simple-query-service before importing
vi.mock('@/providers/simple-query-service.js', () => ({
  simpleQuery: vi.fn(),
}));

import { classifyFeature } from '@/services/feature-classifier.js';
import { simpleQuery } from '@/providers/simple-query-service.js';

const mockSimpleQuery = vi.mocked(simpleQuery);

describe('FeatureClassifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('classifyFeature', () => {
    it('classifies frontend features correctly', async () => {
      mockSimpleQuery.mockResolvedValueOnce({
        text: '{"role": "frontend-engineer", "confidence": 0.95, "reasoning": "React component work with Tailwind CSS"}',
      });

      const result = await classifyFeature(
        'Add user profile card component',
        'Create a React component for displaying user profiles with avatar, name, and stats',
        '/test'
      );

      expect(result.role).toBe('frontend-engineer');
      expect(result.confidence).toBe(0.95);
      expect(result.reasoning).toContain('React');
    });

    it('classifies backend features correctly', async () => {
      mockSimpleQuery.mockResolvedValueOnce({
        text: '{"role": "backend-engineer", "confidence": 0.9, "reasoning": "API endpoint and service logic"}',
      });

      const result = await classifyFeature(
        'Add webhook handler for GitHub events',
        'Create Express route to receive and process GitHub webhook payloads',
        '/test'
      );

      expect(result.role).toBe('backend-engineer');
      expect(result.confidence).toBe(0.9);
    });

    it('classifies devops features correctly', async () => {
      mockSimpleQuery.mockResolvedValueOnce({
        text: '{"role": "devops-engineer", "confidence": 0.85, "reasoning": "CI/CD pipeline configuration"}',
      });

      const result = await classifyFeature(
        'Set up GitHub Actions for staging deployment',
        'Configure automated deployment pipeline for staging environment',
        '/test'
      );

      expect(result.role).toBe('devops-engineer');
      expect(result.confidence).toBe(0.85);
    });

    it('classifies GTM features correctly', async () => {
      mockSimpleQuery.mockResolvedValueOnce({
        text: '{"role": "gtm-specialist", "confidence": 0.88, "reasoning": "Marketing and content creation"}',
      });

      const result = await classifyFeature(
        'Create launch blog post',
        'Write a blog post announcing the new feature with screenshots and examples',
        '/test'
      );

      expect(result.role).toBe('gtm-specialist');
      expect(result.confidence).toBe(0.88);
    });

    it('falls back to backend-engineer on low confidence', async () => {
      mockSimpleQuery.mockResolvedValueOnce({
        text: '{"role": "frontend-engineer", "confidence": 0.4, "reasoning": "Could be either frontend or backend"}',
      });

      const result = await classifyFeature(
        'Add data display feature',
        'Show some data to the user in a table format',
        '/test'
      );

      expect(result.role).toBe('backend-engineer');
      expect(result.confidence).toBe(0.4);
    });

    it('falls back to backend-engineer on invalid role', async () => {
      mockSimpleQuery.mockResolvedValueOnce({
        text: '{"role": "unknown-role", "confidence": 0.9, "reasoning": "Some reasoning"}',
      });

      const result = await classifyFeature('Test', 'Test description', '/test');

      expect(result.role).toBe('backend-engineer');
      expect(result.confidence).toBe(0);
    });

    it('handles JSON wrapped in code fences', async () => {
      mockSimpleQuery.mockResolvedValueOnce({
        text: '```json\n{"role": "frontend-engineer", "confidence": 0.85, "reasoning": "UI work"}\n```',
      });

      const result = await classifyFeature('UI component', 'Build a button', '/test');

      expect(result.role).toBe('frontend-engineer');
      expect(result.confidence).toBe(0.85);
    });

    it('falls back on invalid JSON response', async () => {
      mockSimpleQuery.mockResolvedValueOnce({
        text: 'This is not JSON at all',
      });

      const result = await classifyFeature('Test', 'Test', '/test');

      expect(result.role).toBe('backend-engineer');
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('Parse error');
    });

    it('falls back on simpleQuery error', async () => {
      mockSimpleQuery.mockRejectedValueOnce(new Error('API rate limit exceeded'));

      const result = await classifyFeature('Test', 'Test', '/test');

      expect(result.role).toBe('backend-engineer');
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('API rate limit exceeded');
    });

    it('falls back on timeout (AbortError)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockSimpleQuery.mockRejectedValueOnce(abortError);

      const result = await classifyFeature('Test', 'Test', '/test');

      expect(result.role).toBe('backend-engineer');
      expect(result.confidence).toBe(0);
      expect(result.reasoning).toContain('The operation was aborted');
    });

    it('passes correct options to simpleQuery', async () => {
      mockSimpleQuery.mockResolvedValueOnce({
        text: '{"role": "backend-engineer", "confidence": 0.9, "reasoning": "test"}',
      });

      await classifyFeature('My Feature', 'Feature description', '/my/project');

      expect(mockSimpleQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-haiku',
          cwd: '/my/project',
          maxTurns: 1,
          allowedTools: [],
        })
      );

      // Check that prompt includes the feature info
      const callArgs = mockSimpleQuery.mock.calls[0][0];
      expect(callArgs.prompt).toContain('My Feature');
      expect(callArgs.prompt).toContain('Feature description');
      expect(callArgs.systemPrompt).toContain('feature classifier');
    });

    it('handles missing confidence field', async () => {
      mockSimpleQuery.mockResolvedValueOnce({
        text: '{"role": "backend-engineer", "reasoning": "test"}',
      });

      const result = await classifyFeature('Test', 'Test', '/test');

      // confidence defaults to 0, which is below threshold
      expect(result.role).toBe('backend-engineer');
      expect(result.confidence).toBe(0);
    });

    it('handles missing reasoning field', async () => {
      mockSimpleQuery.mockResolvedValueOnce({
        text: '{"role": "frontend-engineer", "confidence": 0.9}',
      });

      const result = await classifyFeature('Test', 'Test', '/test');

      expect(result.role).toBe('frontend-engineer');
      expect(result.confidence).toBe(0.9);
      expect(result.reasoning).toBe('');
    });

    it('handles confidence at exact threshold (0.6)', async () => {
      mockSimpleQuery.mockResolvedValueOnce({
        text: '{"role": "devops-engineer", "confidence": 0.6, "reasoning": "borderline case"}',
      });

      const result = await classifyFeature('Test', 'Test', '/test');

      expect(result.role).toBe('devops-engineer');
      expect(result.confidence).toBe(0.6);
    });

    it('falls back when confidence is just below threshold (0.59)', async () => {
      mockSimpleQuery.mockResolvedValueOnce({
        text: '{"role": "devops-engineer", "confidence": 0.59, "reasoning": "borderline case"}',
      });

      const result = await classifyFeature('Test', 'Test', '/test');

      expect(result.role).toBe('backend-engineer');
      expect(result.confidence).toBe(0.59);
    });
  });
});
