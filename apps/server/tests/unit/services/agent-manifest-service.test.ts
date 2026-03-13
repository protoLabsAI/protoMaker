/**
 * AgentManifestService Unit Tests
 *
 * Tests for project-defined agent manifest loading, caching, and matching:
 * - Load single .automaker/agents.yml file
 * - Load directory of .automaker/agents/*.yml files
 * - Match rules (categories, keywords, filePatterns)
 * - Cache invalidation on file change
 * - getResolvedCapabilities merges base role with overrides
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  AgentManifestService,
  getAgentManifestService,
  WATCH_POLL_INTERVAL_MS,
} from '../../../src/services/agent-manifest-service.js';

// ─── Mock logger ──────────────────────────────────────────────────────────────

vi.mock('@protolabsai/utils', async () => {
  const actual = await vi.importActual('@protolabsai/utils');
  return {
    ...actual,
    createLogger: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-manifest-test-'));
}

function writeYaml(dir: string, rel: string, content: string): string {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

const FRONTEND_AGENT_YAML = `
version: "1"
agents:
  - name: react-specialist
    extends: frontend-engineer
    description: Specialist for React components
    model: claude-opus-4-5
    match:
      categories:
        - frontend
        - ui
      keywords:
        - react
        - component
        - tsx
      filePatterns:
        - "**/*.tsx"
        - "**/*.css"
`;

const BACKEND_AGENT_YAML = `
name: api-specialist
extends: backend-engineer
description: Specialist for API routes
match:
  categories:
    - backend
    - api
  keywords:
    - endpoint
    - route
  filePatterns:
    - "apps/server/**/*.ts"
`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AgentManifestService', () => {
  let service: AgentManifestService;
  let tmpDir: string;

  beforeEach(() => {
    service = new AgentManifestService();
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    service.dispose();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── loadManifest: single file ─────────────────────────────────────────────

  describe('loadManifest — single file', () => {
    it('loads agents from .automaker/agents.yml', async () => {
      writeYaml(tmpDir, '.automaker/agents.yml', FRONTEND_AGENT_YAML);

      const manifest = await service.loadManifest(tmpDir);

      expect(manifest).not.toBeNull();
      expect(manifest!.version).toBe('1');
      expect(manifest!.agents).toHaveLength(1);
      expect(manifest!.agents[0].name).toBe('react-specialist');
      expect(manifest!.agents[0].extends).toBe('frontend-engineer');
      expect(manifest!.agents[0].model).toBe('claude-opus-4-5');
    });

    it('parses match rules from single file', async () => {
      writeYaml(tmpDir, '.automaker/agents.yml', FRONTEND_AGENT_YAML);

      const manifest = await service.loadManifest(tmpDir);
      const agent = manifest!.agents[0];

      expect(agent.match?.categories).toEqual(['frontend', 'ui']);
      expect(agent.match?.keywords).toEqual(['react', 'component', 'tsx']);
      expect(agent.match?.filePatterns).toEqual(['**/*.tsx', '**/*.css']);
    });

    it('returns null when no manifest exists', async () => {
      const manifest = await service.loadManifest(tmpDir);
      expect(manifest).toBeNull();
    });

    it('accepts a single agent at the file root (no wrapper)', async () => {
      writeYaml(tmpDir, '.automaker/agents.yml', BACKEND_AGENT_YAML);

      const manifest = await service.loadManifest(tmpDir);

      expect(manifest).not.toBeNull();
      expect(manifest!.agents).toHaveLength(1);
      expect(manifest!.agents[0].name).toBe('api-specialist');
    });

    it('skips agents missing required "name" field', async () => {
      writeYaml(
        tmpDir,
        '.automaker/agents.yml',
        `
version: "1"
agents:
  - extends: frontend-engineer
    description: Missing name
  - name: valid-agent
    extends: backend-engineer
    description: Has name
`
      );

      const manifest = await service.loadManifest(tmpDir);
      expect(manifest!.agents).toHaveLength(1);
      expect(manifest!.agents[0].name).toBe('valid-agent');
    });

    it('skips agents missing required "extends" field', async () => {
      writeYaml(
        tmpDir,
        '.automaker/agents.yml',
        `
version: "1"
agents:
  - name: no-base-role
    description: Missing extends
  - name: valid-agent
    extends: backend-engineer
    description: Has extends
`
      );

      const manifest = await service.loadManifest(tmpDir);
      expect(manifest!.agents).toHaveLength(1);
      expect(manifest!.agents[0].name).toBe('valid-agent');
    });
  });

  // ── loadManifest: directory ───────────────────────────────────────────────

  describe('loadManifest — directory', () => {
    it('loads agents from .automaker/agents/*.yml directory', async () => {
      writeYaml(tmpDir, '.automaker/agents/frontend.yml', FRONTEND_AGENT_YAML);
      writeYaml(tmpDir, '.automaker/agents/backend.yml', BACKEND_AGENT_YAML);

      const manifest = await service.loadManifest(tmpDir);

      expect(manifest).not.toBeNull();
      expect(manifest!.agents).toHaveLength(2);
      const names = manifest!.agents.map((a) => a.name);
      expect(names).toContain('react-specialist');
      expect(names).toContain('api-specialist');
    });

    it('prefers single file over directory when both exist', async () => {
      // Single file has one agent
      writeYaml(
        tmpDir,
        '.automaker/agents.yml',
        `
version: "1"
agents:
  - name: single-file-agent
    extends: frontend-engineer
    description: From single file
`
      );
      // Directory also exists with a different agent
      writeYaml(tmpDir, '.automaker/agents/dir-agent.yml', BACKEND_AGENT_YAML);

      const manifest = await service.loadManifest(tmpDir);

      // Should only see the single-file agent
      expect(manifest!.agents).toHaveLength(1);
      expect(manifest!.agents[0].name).toBe('single-file-agent');
    });

    it('skips invalid files in directory but loads valid ones', async () => {
      writeYaml(tmpDir, '.automaker/agents/valid.yml', BACKEND_AGENT_YAML);
      writeYaml(tmpDir, '.automaker/agents/invalid.yml', '{ bad yaml: [');

      const manifest = await service.loadManifest(tmpDir);

      // One valid agent should load
      expect(manifest).not.toBeNull();
      expect(manifest!.agents).toHaveLength(1);
      expect(manifest!.agents[0].name).toBe('api-specialist');
    });

    it('returns empty agents array for empty directory', async () => {
      fs.mkdirSync(path.join(tmpDir, '.automaker', 'agents'), { recursive: true });

      const manifest = await service.loadManifest(tmpDir);

      expect(manifest).not.toBeNull();
      expect(manifest!.agents).toHaveLength(0);
    });
  });

  // ── getAgentsForProject: caching ──────────────────────────────────────────

  describe('getAgentsForProject — caching', () => {
    it('returns same manifest on repeated calls (cache hit)', async () => {
      writeYaml(tmpDir, '.automaker/agents.yml', FRONTEND_AGENT_YAML);

      const first = await service.getAgentsForProject(tmpDir);
      const second = await service.getAgentsForProject(tmpDir);

      expect(first).toBe(second); // Same object reference = cache hit
    });

    it('reloads manifest after cache invalidation', async () => {
      writeYaml(tmpDir, '.automaker/agents.yml', FRONTEND_AGENT_YAML);

      const first = await service.getAgentsForProject(tmpDir);
      expect(first!.agents).toHaveLength(1);

      // Manually invalidate cache
      service.invalidateCache(tmpDir);

      // Update the file
      writeYaml(
        tmpDir,
        '.automaker/agents.yml',
        `
version: "1"
agents:
  - name: react-specialist
    extends: frontend-engineer
    description: First
  - name: vue-specialist
    extends: frontend-engineer
    description: Second
`
      );

      const second = await service.getAgentsForProject(tmpDir);
      expect(second!.agents).toHaveLength(2);
    });

    it('invalidates cache when manifest file changes on disk (polling watcher)', async () => {
      // This test verifies that the polling watcher correctly triggers cache
      // invalidation when the file changes — the behavior that was broken by
      // fs.watch({ recursive: true }) being a no-op on Linux.
      //
      // Strategy: use vi.useFakeTimers to advance the poll interval without
      // waiting for real wall-clock time, making the test fast and deterministic.
      vi.useFakeTimers();
      try {
        writeYaml(tmpDir, '.automaker/agents.yml', FRONTEND_AGENT_YAML);

        // Warm the cache and start the polling watcher
        const first = await service.getAgentsForProject(tmpDir);
        expect(first!.agents).toHaveLength(1);

        // Overwrite the manifest with a second agent
        writeYaml(
          tmpDir,
          '.automaker/agents.yml',
          `
version: "1"
agents:
  - name: react-specialist
    extends: frontend-engineer
    description: First
  - name: vue-specialist
    extends: frontend-engineer
    description: Second
`
        );

        // Advance time past the poll interval so the setInterval fires
        vi.advanceTimersByTime(WATCH_POLL_INTERVAL_MS + 100);

        // Cache should now be invalidated; next load reads updated file
        vi.useRealTimers();
        const second = await service.getAgentsForProject(tmpDir);
        expect(second!.agents).toHaveLength(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ── matchFeature: scoring rules ───────────────────────────────────────────

  describe('matchFeature — scoring', () => {
    beforeEach(() => {
      writeYaml(
        tmpDir,
        '.automaker/agents.yml',
        `
version: "1"
agents:
  - name: react-specialist
    extends: frontend-engineer
    description: React specialist
    match:
      categories:
        - frontend
      keywords:
        - react
        - component
      filePatterns:
        - "**/*.tsx"
  - name: api-specialist
    extends: backend-engineer
    description: API specialist
    match:
      categories:
        - backend
      keywords:
        - endpoint
        - route
      filePatterns:
        - "apps/server/**/*.ts"
`
      );
    });

    it('matches agent by category', async () => {
      const result = await service.matchFeature(tmpDir, {
        title: 'Update the UI',
        category: 'frontend',
      });
      expect(result?.agent.name).toBe('react-specialist');
      expect(result?.confidence).toBeGreaterThan(0);
    });

    it('matches agent by keyword in title', async () => {
      const result = await service.matchFeature(tmpDir, {
        title: 'Build react component for settings',
      });
      expect(result?.agent.name).toBe('react-specialist');
    });

    it('matches agent by keyword in description', async () => {
      const result = await service.matchFeature(tmpDir, {
        title: 'New feature',
        description: 'Add a new endpoint for user data',
      });
      expect(result?.agent.name).toBe('api-specialist');
    });

    it('matches agent by filePatterns', async () => {
      const result = await service.matchFeature(tmpDir, {
        title: 'Add settings panel',
        filesToModify: ['apps/ui/src/components/SettingsPanel.tsx'],
      });
      expect(result?.agent.name).toBe('react-specialist');
    });

    it('returns highest-scoring agent when multiple match', async () => {
      // frontend agent: category=frontend (+10), keyword=react (+5), keyword=component (+5),
      //                 file=*.tsx (+3) = 23 total
      // backend agent: no match
      const result = await service.matchFeature(tmpDir, {
        title: 'Build react component',
        category: 'frontend',
        filesToModify: ['apps/ui/src/components/MyComp.tsx'],
      });
      expect(result?.agent.name).toBe('react-specialist');
      // confidence = 23 / (23 + 10) = 23/33 ≈ 0.697
      expect(result?.confidence).toBeCloseTo(0.697, 2);
    });

    it('returns null when no agents match', async () => {
      const result = await service.matchFeature(tmpDir, {
        title: 'Update documentation',
        description: 'Write docs for new features',
        category: 'docs',
      });
      expect(result).toBeNull();
    });

    it('returns null when manifest is empty', async () => {
      fs.rmSync(path.join(tmpDir, '.automaker', 'agents.yml'));
      service.invalidateCache(tmpDir);

      const result = await service.matchFeature(tmpDir, {
        title: 'Some feature',
        category: 'frontend',
      });
      expect(result).toBeNull();
    });

    it('is case-insensitive for categories and keywords', async () => {
      const categoryResult = await service.matchFeature(tmpDir, {
        title: 'Some task',
        category: 'FRONTEND',
      });
      expect(categoryResult?.agent.name).toBe('react-specialist');

      const keywordResult = await service.matchFeature(tmpDir, {
        title: 'Build REACT Component',
      });
      expect(keywordResult?.agent.name).toBe('react-specialist');
    });
  });

  // ── getResolvedCapabilities ───────────────────────────────────────────────

  describe('getResolvedCapabilities', () => {
    it('returns base role capabilities when no overrides defined', async () => {
      writeYaml(
        tmpDir,
        '.automaker/agents.yml',
        `
version: "1"
agents:
  - name: my-frontend
    extends: frontend-engineer
    description: Frontend agent with no overrides
`
      );

      const caps = await service.getResolvedCapabilities(tmpDir, 'my-frontend');

      expect(caps).not.toBeNull();
      expect(caps!.canModifyFiles).toBe(true);
      expect(caps!.canUseBash).toBe(false);
      expect(caps!.canCommit).toBe(true);
    });

    it('merges capability overrides on top of base role', async () => {
      writeYaml(
        tmpDir,
        '.automaker/agents.yml',
        `
version: "1"
agents:
  - name: bash-frontend
    extends: frontend-engineer
    description: Frontend agent that can use bash
    capabilities:
      canUseBash: true
      maxTurns: 200
`
      );

      const caps = await service.getResolvedCapabilities(tmpDir, 'bash-frontend');

      expect(caps).not.toBeNull();
      // Overridden fields
      expect(caps!.canUseBash).toBe(true);
      expect(caps!.maxTurns).toBe(200);
      // Inherited from base frontend-engineer
      expect(caps!.canModifyFiles).toBe(true);
      expect(caps!.canCommit).toBe(true);
      // Role becomes agent name
      expect(caps!.role).toBe('bash-frontend');
    });

    it('returns null for unknown agent name', async () => {
      writeYaml(tmpDir, '.automaker/agents.yml', FRONTEND_AGENT_YAML);

      const caps = await service.getResolvedCapabilities(tmpDir, 'nonexistent');
      expect(caps).toBeNull();
    });

    it('returns null when agent extends unknown role', async () => {
      writeYaml(
        tmpDir,
        '.automaker/agents.yml',
        `
version: "1"
agents:
  - name: phantom-agent
    extends: nonexistent-role
    description: Extends unknown role
`
      );

      const caps = await service.getResolvedCapabilities(tmpDir, 'phantom-agent');
      expect(caps).toBeNull();
    });
  });

  // ── getAgent ──────────────────────────────────────────────────────────────

  describe('getAgent', () => {
    it('finds an agent by name', async () => {
      writeYaml(tmpDir, '.automaker/agents.yml', FRONTEND_AGENT_YAML);

      const agent = await service.getAgent(tmpDir, 'react-specialist');
      expect(agent).not.toBeUndefined();
      expect(agent!.name).toBe('react-specialist');
    });

    it('returns undefined for unknown agent name', async () => {
      writeYaml(tmpDir, '.automaker/agents.yml', FRONTEND_AGENT_YAML);

      const agent = await service.getAgent(tmpDir, 'does-not-exist');
      expect(agent).toBeUndefined();
    });
  });

  // ── Singleton ─────────────────────────────────────────────────────────────

  describe('getAgentManifestService', () => {
    it('returns same instance on multiple calls', () => {
      const a = getAgentManifestService();
      const b = getAgentManifestService();
      expect(a).toBe(b);
    });

    it('returns an AgentManifestService instance', () => {
      expect(getAgentManifestService()).toBeInstanceOf(AgentManifestService);
    });
  });
});
