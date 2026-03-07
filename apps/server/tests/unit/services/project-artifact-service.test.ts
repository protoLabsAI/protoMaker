/**
 * ProjectArtifactService Unit Tests
 *
 * Tests:
 * 1. saveArtifact writes to .automaker/projects/{slug}/artifacts/{type}/{id}.json
 * 2. saveArtifact updates the index file
 * 3. listArtifacts returns all index entries
 * 4. listArtifacts filtered by type returns correct entries
 * 5. getArtifact returns full content
 * 6. getArtifact throws for unknown artifact ID
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

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

vi.mock('@protolabsai/platform', () => ({
  getProjectDir: vi.fn((projectPath: string, slug: string) =>
    path.join(projectPath, '.automaker', 'projects', slug)
  ),
}));

import { ProjectArtifactService } from '../../../src/services/project-artifact-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe('ProjectArtifactService', () => {
  let service: ProjectArtifactService;
  let tmpDir: string;
  const slug = 'test-project';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-svc-'));
    service = new ProjectArtifactService();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // saveArtifact
  // -------------------------------------------------------------------------

  describe('saveArtifact()', () => {
    it('writes artifact file to artifacts/{type}/{id}.json', async () => {
      const content = { summary: 'All done', score: 100 };
      const id = await service.saveArtifact(tmpDir, slug, 'ceremony-report', content);

      const artifactsBase = path.join(tmpDir, '.automaker', 'projects', slug, 'artifacts');
      const typeDir = path.join(artifactsBase, 'ceremony-report');
      const files = fs.readdirSync(typeDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toBe(`${id}.json`);

      const written = JSON.parse(fs.readFileSync(path.join(typeDir, `${id}.json`), 'utf-8')) as {
        id: string;
        type: string;
        timestamp: string;
        content: typeof content;
      };
      expect(written.content).toEqual(content);
    });

    it('creates the index file on first save', async () => {
      await service.saveArtifact(tmpDir, slug, 'standup', { message: 'hello' });

      const indexPath = path.join(
        tmpDir,
        '.automaker',
        'projects',
        slug,
        'artifacts',
        'index.json'
      );
      expect(fs.existsSync(indexPath)).toBe(true);

      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as {
        version: number;
        entries: unknown[];
      };
      expect(index.version).toBe(1);
      expect(index.entries).toHaveLength(1);
    });

    it('appends to the index on subsequent saves', async () => {
      await service.saveArtifact(tmpDir, slug, 'ceremony-report', { a: 1 });
      await service.saveArtifact(tmpDir, slug, 'standup', { b: 2 });
      await service.saveArtifact(tmpDir, slug, 'escalation', { c: 3 });

      const indexPath = path.join(
        tmpDir,
        '.automaker',
        'projects',
        slug,
        'artifacts',
        'index.json'
      );
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as {
        version: number;
        entries: Array<{ type: string }>;
      };
      expect(index.entries).toHaveLength(3);
      expect(index.entries.map((e) => e.type)).toEqual([
        'ceremony-report',
        'standup',
        'escalation',
      ]);
    });

    it('returns the artifact ID', async () => {
      const id = await service.saveArtifact(tmpDir, slug, 'changelog', { log: [] });
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // listArtifacts
  // -------------------------------------------------------------------------

  describe('listArtifacts()', () => {
    it('returns empty array when no artifacts exist', async () => {
      const entries = await service.listArtifacts(tmpDir, slug);
      expect(entries).toEqual([]);
    });

    it('returns all entries when no type filter', async () => {
      await service.saveArtifact(tmpDir, slug, 'ceremony-report', { a: 1 });
      await service.saveArtifact(tmpDir, slug, 'standup', { b: 2 });

      const entries = await service.listArtifacts(tmpDir, slug);
      expect(entries).toHaveLength(2);
    });

    it('filters by type when type is provided', async () => {
      await service.saveArtifact(tmpDir, slug, 'ceremony-report', { a: 1 });
      await service.saveArtifact(tmpDir, slug, 'standup', { b: 2 });
      await service.saveArtifact(tmpDir, slug, 'ceremony-report', { c: 3 });

      const entries = await service.listArtifacts(tmpDir, slug, 'ceremony-report');
      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.type === 'ceremony-report')).toBe(true);
    });

    it('index entries have correct shape', async () => {
      await service.saveArtifact(tmpDir, slug, 'escalation', { urgent: true });

      const entries = await service.listArtifacts(tmpDir, slug, 'escalation');
      expect(entries).toHaveLength(1);
      const [entry] = entries;
      expect(entry).toMatchObject({
        type: 'escalation',
        filename: expect.stringContaining('.json'),
        timestamp: expect.any(String),
        id: expect.any(String),
      });
    });
  });

  // -------------------------------------------------------------------------
  // getArtifact
  // -------------------------------------------------------------------------

  describe('getArtifact()', () => {
    it('returns the full content of a saved artifact', async () => {
      const content = { summary: 'Retro done', lessons: ['Ship faster'] };
      const id = await service.saveArtifact(tmpDir, slug, 'ceremony-report', content);

      const retrieved = await service.getArtifact(tmpDir, slug, id);
      expect(retrieved).toEqual(content);
    });

    it('throws when artifact ID is not in the index', async () => {
      await expect(service.getArtifact(tmpDir, slug, 'nonexistent-id')).rejects.toThrow(
        'Artifact not found'
      );
    });

    it('can retrieve multiple artifacts independently', async () => {
      const c1 = { step: 1 };
      const c2 = { step: 2 };
      const id1 = await service.saveArtifact(tmpDir, slug, 'standup', c1);
      const id2 = await service.saveArtifact(tmpDir, slug, 'standup', c2);

      expect(await service.getArtifact(tmpDir, slug, id1)).toEqual(c1);
      expect(await service.getArtifact(tmpDir, slug, id2)).toEqual(c2);
    });
  });
});
