import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowLoader } from '@/services/workflow-loader.js';
import type { Feature } from '@protolabsai/types';
import * as fs from 'node:fs';
import path from 'path';

vi.mock('node:fs');
vi.mock('yaml', () => ({
  parse: vi.fn((content: string) => {
    // Minimal YAML parser for test fixtures
    const result: Record<string, unknown> = {};
    const lines = content.split('\n');
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        result[match[1]] = match[2].trim();
      }
    }
    return result;
  }),
}));

vi.mock('@protolabsai/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('WorkflowLoader', () => {
  let loader: WorkflowLoader;
  const testProjectPath = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    loader = new WorkflowLoader();
    // Ensure workflow directory doesn't exist (no project overrides)
    vi.mocked(fs.existsSync).mockReturnValue(false);
  });

  const createFeature = (overrides: Partial<Feature> = {}): Feature => ({
    id: 'feature-test-123',
    category: 'code',
    description: 'Implement a new feature',
    ...overrides,
  });

  describe('resolveForFeature', () => {
    it('should resolve category "audit" to the audit workflow', async () => {
      const feature = createFeature({
        category: 'audit',
        title: 'Audit codebase for security issues',
        description: 'Review and analyze the codebase',
      });

      const result = await loader.resolveForFeature(testProjectPath, feature);

      expect(result.name).toBe('audit');
      expect(result.execution.useWorktrees).toBe(false);
    });

    it('should resolve title containing "research" to the research workflow', async () => {
      const feature = createFeature({
        category: 'code',
        title: 'Research authentication options',
        description: 'Explore different auth libraries',
      });

      const result = await loader.resolveForFeature(testProjectPath, feature);

      expect(result.name).toBe('research');
      expect(result.execution.useWorktrees).toBe(false);
    });

    it('explicit feature.workflow "standard" should override keyword match', async () => {
      const feature = createFeature({
        category: 'audit',
        title: 'Audit codebase',
        description: 'Review and analyze',
        workflow: 'standard',
      });

      const result = await loader.resolveForFeature(testProjectPath, feature);

      expect(result.name).toBe('standard');
      expect(result.execution.useWorktrees).toBe(true);
    });

    it('explicit feature.workflow for unknown name should fall back to standard', async () => {
      const feature = createFeature({
        category: 'audit',
        title: 'Audit codebase',
        description: 'Review and analyze',
        workflow: 'nonexistent-workflow',
      });

      const result = await loader.resolveForFeature(testProjectPath, feature);

      expect(result.name).toBe('standard');
    });

    it('no category and no keyword should fall back to standard', async () => {
      const feature = createFeature({
        category: 'code',
        title: 'Fix button alignment',
        description: 'Adjust padding for the login button',
      });

      const result = await loader.resolveForFeature(testProjectPath, feature);

      expect(result.name).toBe('standard');
      expect(result.execution.useWorktrees).toBe(true);
    });

    it('should resolve category "research" to the research workflow', async () => {
      const feature = createFeature({
        category: 'research',
        title: 'Explore state management options',
        description: 'Compare Redux, Zustand, and Jotai',
      });

      const result = await loader.resolveForFeature(testProjectPath, feature);

      expect(result.name).toBe('research');
    });

    it('should resolve category "dependencies" to dependency-health workflow', async () => {
      const feature = createFeature({
        category: 'dependencies',
        title: 'Check dependency vulnerabilities',
        description: 'Scan for CVEs and outdated packages',
      });

      const result = await loader.resolveForFeature(testProjectPath, feature);

      expect(result.name).toBe('dependency-health');
    });

    it('should prefer category match over keyword match when both apply', async () => {
      // "audit" category matches audit workflow (score: 10)
      // keyword "audit" also appears in dependency-health keywords (score: 1)
      // Category match should win
      const feature = createFeature({
        category: 'audit',
        title: 'Dependency audit',
        description: 'Run audit on dependencies',
      });

      const result = await loader.resolveForFeature(testProjectPath, feature);

      expect(result.name).toBe('audit');
    });

    it('should resolve featureType "content" to content workflow', async () => {
      const feature = createFeature({
        category: 'code',
        featureType: 'content',
        title: 'Write blog post',
        description: 'Create content for the blog',
      });

      const result = await loader.resolveForFeature(testProjectPath, feature);

      expect(result.name).toBe('content');
    });

    it('should resolve featureType "signal" to signal workflow', async () => {
      const feature = createFeature({
        category: 'code',
        featureType: 'signal',
        title: 'CI failing on main',
        description: 'Investigate CI failures',
      });

      const result = await loader.resolveForFeature(testProjectPath, feature);

      expect(result.name).toBe('signal');
    });

    it('should resolve executionMode "read-only" to read-only workflow', async () => {
      const feature = createFeature({
        category: 'code',
        executionMode: 'read-only',
        title: 'Analyze codebase',
        description: 'Read-only analysis',
      });

      const result = await loader.resolveForFeature(testProjectPath, feature);

      expect(result.name).toBe('read-only');
    });

    it('should resolve category "cost" to cost-analysis workflow', async () => {
      const feature = createFeature({
        category: 'cost',
        title: 'Analyze API costs',
        description: 'Review spending on API usage',
      });

      const result = await loader.resolveForFeature(testProjectPath, feature);

      expect(result.name).toBe('cost-analysis');
    });

    it('should resolve category "postmortem" to postmortem workflow', async () => {
      const feature = createFeature({
        category: 'postmortem',
        title: 'Incident postmortem',
        description: 'Analyze the outage on May 1st',
      });

      const result = await loader.resolveForFeature(testProjectPath, feature);

      expect(result.name).toBe('postmortem');
    });

    it('should resolve category "changelog" to changelog-digest workflow', async () => {
      const feature = createFeature({
        category: 'changelog',
        title: 'Generate changelog',
        description: 'Create release notes for v2.0',
      });

      const result = await loader.resolveForFeature(testProjectPath, feature);

      expect(result.name).toBe('changelog-digest');
    });

    it('should resolve category "benchmark" to swebench workflow', async () => {
      const feature = createFeature({
        category: 'benchmark',
        title: 'Run SWE-bench evaluation',
        description: 'Evaluate agent performance',
      });

      const result = await loader.resolveForFeature(testProjectPath, feature);

      expect(result.name).toBe('swebench');
    });

    it('should resolve category "strategy" to strategic-review workflow', async () => {
      const feature = createFeature({
        category: 'strategy',
        title: 'Q3 strategic review',
        description: 'Review goals and roadmap',
      });

      const result = await loader.resolveForFeature(testProjectPath, feature);

      expect(result.name).toBe('strategic-review');
    });

    it('should resolve category "tech-debt" to tech-debt-scan workflow', async () => {
      const feature = createFeature({
        category: 'tech-debt',
        title: 'Scan for tech debt',
        description: 'Find TODOs and deprecated patterns',
      });

      const result = await loader.resolveForFeature(testProjectPath, feature);

      expect(result.name).toBe('tech-debt-scan');
    });
  });

  describe('getBuiltIn', () => {
    it('should return built-in workflow by name', () => {
      const result = loader.getBuiltIn('standard');
      expect(result).toBeDefined();
      expect(result!.name).toBe('standard');
    });

    it('should return undefined for unknown name', () => {
      const result = loader.getBuiltIn('nonexistent');
      expect(result).toBeUndefined();
    });
  });
});
