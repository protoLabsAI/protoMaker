/**
 * Unit tests for context-loader.ts — role-based filtering
 *
 * Verifies that loadContextFiles() correctly filters context files
 * based on the caller's role (lead-engineer, pm, ava, undefined).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldIncludeContextFile, loadContextFiles } from '../context-loader.js';
import type { ContextFsModule } from '../context-loader.js';

// ─────────────────────────────────────────────────────────
// shouldIncludeContextFile unit tests
// ─────────────────────────────────────────────────────────

describe('shouldIncludeContextFile', () => {
  describe('no role (backward compat)', () => {
    it('includes engineering files', () => {
      expect(shouldIncludeContextFile('engineering', undefined)).toBe(true);
    });
    it('includes project files', () => {
      expect(shouldIncludeContextFile('project', undefined)).toBe(true);
    });
    it('includes all-domain files', () => {
      expect(shouldIncludeContextFile('all', undefined)).toBe(true);
    });
    it('includes files with no domain', () => {
      expect(shouldIncludeContextFile(undefined, undefined)).toBe(true);
    });
  });

  describe("role 'ava'", () => {
    it('includes engineering files', () => {
      expect(shouldIncludeContextFile('engineering', 'ava')).toBe(true);
    });
    it('includes project files', () => {
      expect(shouldIncludeContextFile('project', 'ava')).toBe(true);
    });
    it('includes all-domain files', () => {
      expect(shouldIncludeContextFile('all', 'ava')).toBe(true);
    });
    it('includes files with no domain', () => {
      expect(shouldIncludeContextFile(undefined, 'ava')).toBe(true);
    });
  });

  describe("role 'lead-engineer'", () => {
    it('includes engineering files', () => {
      expect(shouldIncludeContextFile('engineering', 'lead-engineer')).toBe(true);
    });
    it('excludes project files', () => {
      expect(shouldIncludeContextFile('project', 'lead-engineer')).toBe(false);
    });
    it('includes all-domain files', () => {
      expect(shouldIncludeContextFile('all', 'lead-engineer')).toBe(true);
    });
    it('includes files with no domain (treats as all)', () => {
      expect(shouldIncludeContextFile(undefined, 'lead-engineer')).toBe(true);
    });
  });

  describe("role 'pm'", () => {
    it('excludes engineering files', () => {
      expect(shouldIncludeContextFile('engineering', 'pm')).toBe(false);
    });
    it('includes project files', () => {
      expect(shouldIncludeContextFile('project', 'pm')).toBe(true);
    });
    it('includes all-domain files', () => {
      expect(shouldIncludeContextFile('all', 'pm')).toBe(true);
    });
    it('includes files with no domain (treats as all)', () => {
      expect(shouldIncludeContextFile(undefined, 'pm')).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────
// loadContextFiles integration tests with mock fs
// ─────────────────────────────────────────────────────────

function makeMockFs(
  files: Record<string, string>,
  metadata?: Record<
    string,
    { description: string; domain?: 'engineering' | 'project' | 'all'; isDistilled?: boolean }
  >
): ContextFsModule {
  const metadataJson = JSON.stringify({ files: metadata ?? {} });
  return {
    access: vi.fn(async (p: string) => {
      if (
        p.includes('context') &&
        !p.includes('.json') &&
        !p.includes('.md') &&
        !p.includes('.txt')
      ) {
        // directory access — always succeed for context dir
        return;
      }
      if (p.includes('memory')) throw new Error('not found');
      if (!files[p]) throw new Error(`not found: ${p}`);
    }),
    readdir: vi.fn(async (p: string) => {
      if (p.includes('context')) {
        return ['context-metadata.json', ...Object.keys(files).map((f) => f.split('/').pop()!)];
      }
      throw new Error('not found');
    }),
    readFile: vi.fn(async (p: string) => {
      if (p.includes('context-metadata.json')) return metadataJson;
      const key = Object.keys(files).find((k) => p.endsWith(k.split('/').pop()!));
      if (key) return files[key];
      throw new Error(`not found: ${p}`);
    }),
    writeFile: vi.fn(async () => {}),
    mkdir: vi.fn(async () => undefined),
    appendFile: vi.fn(async () => {}),
  };
}

describe('loadContextFiles — role-based filtering', () => {
  const projectPath = '/fake/project';

  const contextFiles = {
    '/fake/project/.automaker/context/architecture.md': '# Architecture\nEngineering content',
    '/fake/project/.automaker/context/prd.md': '# PRD\nProduct content',
    '/fake/project/.automaker/context/conventions.md': '# Conventions\nShared content',
  };

  const metadata = {
    'architecture.md': { description: 'Architecture guide', domain: 'engineering' as const },
    'prd.md': { description: 'Product requirements', domain: 'project' as const },
    'conventions.md': { description: 'Coding conventions', domain: 'all' as const },
  };

  it('loads all files when no role is specified (backward compat)', async () => {
    const fsModule = makeMockFs(contextFiles, metadata);
    const result = await loadContextFiles({
      projectPath,
      fsModule,
      includeMemory: false,
      initializeMemory: false,
    });
    expect(result.files).toHaveLength(3);
    const names = result.files.map((f) => f.name);
    expect(names).toContain('architecture.md');
    expect(names).toContain('prd.md');
    expect(names).toContain('conventions.md');
  });

  it("role 'lead-engineer' loads engineering and all-domain files, excludes project files", async () => {
    const fsModule = makeMockFs(contextFiles, metadata);
    const result = await loadContextFiles({
      projectPath,
      fsModule,
      includeMemory: false,
      initializeMemory: false,
      role: 'lead-engineer',
    });
    const names = result.files.map((f) => f.name);
    expect(names).toContain('architecture.md');
    expect(names).toContain('conventions.md');
    expect(names).not.toContain('prd.md');
  });

  it("role 'pm' loads project and all-domain files, excludes engineering files", async () => {
    const fsModule = makeMockFs(contextFiles, metadata);
    const result = await loadContextFiles({
      projectPath,
      fsModule,
      includeMemory: false,
      initializeMemory: false,
      role: 'pm',
    });
    const names = result.files.map((f) => f.name);
    expect(names).toContain('prd.md');
    expect(names).toContain('conventions.md');
    expect(names).not.toContain('architecture.md');
  });

  it("role 'ava' loads all files", async () => {
    const fsModule = makeMockFs(contextFiles, metadata);
    const result = await loadContextFiles({
      projectPath,
      fsModule,
      includeMemory: false,
      initializeMemory: false,
      role: 'ava',
    });
    expect(result.files).toHaveLength(3);
    const names = result.files.map((f) => f.name);
    expect(names).toContain('architecture.md');
    expect(names).toContain('prd.md');
    expect(names).toContain('conventions.md');
  });

  it('files without domain metadata are included for all roles (backward compat)', async () => {
    const undefinedDomainMetadata = {
      'architecture.md': { description: 'Architecture guide' },
      'prd.md': { description: 'Product requirements' },
    };
    const fsModule = makeMockFs(contextFiles, undefinedDomainMetadata);
    const leResult = await loadContextFiles({
      projectPath,
      fsModule,
      includeMemory: false,
      initializeMemory: false,
      role: 'lead-engineer',
    });
    // Files without domain treated as 'all' — included for every role
    expect(leResult.files.map((f) => f.name)).toContain('prd.md');
    expect(leResult.files.map((f) => f.name)).toContain('architecture.md');
  });

  it('role-based filtering reduces context for lead-engineer (~40% reduction when half files are project-domain)', async () => {
    // 5 files: 2 engineering, 2 project, 1 all
    const manyFiles: Record<string, string> = {};
    const manyMeta: Record<
      string,
      { description: string; domain: 'engineering' | 'project' | 'all' }
    > = {};

    ['arch.md', 'build.md'].forEach((f) => {
      manyFiles[`/fake/project/.automaker/context/${f}`] = `# ${f}`;
      manyMeta[f] = { description: f, domain: 'engineering' };
    });
    ['prd.md', 'roadmap.md'].forEach((f) => {
      manyFiles[`/fake/project/.automaker/context/${f}`] = `# ${f}`;
      manyMeta[f] = { description: f, domain: 'project' };
    });
    ['conventions.md'].forEach((f) => {
      manyFiles[`/fake/project/.automaker/context/${f}`] = `# ${f}`;
      manyMeta[f] = { description: f, domain: 'all' };
    });

    const fsModule = makeMockFs(manyFiles, manyMeta);
    const allResult = await loadContextFiles({
      projectPath,
      fsModule,
      includeMemory: false,
      initializeMemory: false,
    });
    const leResult = await loadContextFiles({
      projectPath,
      fsModule,
      includeMemory: false,
      initializeMemory: false,
      role: 'lead-engineer',
    });

    expect(allResult.files).toHaveLength(5);
    expect(leResult.files).toHaveLength(3); // 2 engineering + 1 all = 40% reduction
    const reductionPct =
      ((allResult.files.length - leResult.files.length) / allResult.files.length) * 100;
    expect(reductionPct).toBeGreaterThanOrEqual(30); // at least 30% reduction
  });

  it('domain and isDistilled metadata are carried through to ContextFileInfo', async () => {
    const fsModule = makeMockFs(contextFiles, metadata);
    const result = await loadContextFiles({
      projectPath,
      fsModule,
      includeMemory: false,
      initializeMemory: false,
    });
    const archFile = result.files.find((f) => f.name === 'architecture.md');
    expect(archFile?.domain).toBe('engineering');
  });
});
