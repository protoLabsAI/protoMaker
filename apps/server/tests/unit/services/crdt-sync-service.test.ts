/**
 * Temporary verification test for CRDTSyncService and CRDTStore.
 * Verifies the CRDT infrastructure works correctly before Playwright can test it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { CRDTSyncService } from '../../../src/services/crdt-sync-service.js';
import {
  CRDTStore,
  createProjectsDoc,
  serializeProject,
  deserializeProject,
} from '@protolabsai/crdt';
import type { Project } from '@protolabsai/types';

function makeProject(slug: string): Project {
  return {
    slug,
    title: `Test Project ${slug}`,
    goal: 'Test goal',
    status: 'active',
    priority: 'medium',
    milestones: [],
    links: [],
    updates: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('CRDTStore', () => {
  it('creates and retrieves a document', () => {
    const store = new CRDTStore();
    const doc = store.getOrCreate('test', createProjectsDoc);
    expect(doc.version).toBe(1);
    expect(doc.projects).toEqual({});
  });

  it('applies changes to a document', () => {
    const store = new CRDTStore();
    store.change('test', createProjectsDoc, (d) => {
      d.projects['alpha'] = '{"slug":"alpha"}';
    });
    const doc = store.get('test');
    expect(doc?.projects['alpha']).toBe('{"slug":"alpha"}');
  });

  it('notifies subscribers on change', () => {
    const store = new CRDTStore();
    const calls: string[] = [];
    store.subscribe('test', () => calls.push('called'));
    store.change('test', createProjectsDoc, (d) => {
      d.projects['x'] = 'y';
    });
    expect(calls).toHaveLength(1);
  });

  it('serializes and loads documents', () => {
    const store = new CRDTStore();
    store.change('doc', createProjectsDoc, (d) => {
      d.projects['beta'] = '{"slug":"beta"}';
    });
    const binary = store.save('doc');
    expect(binary).not.toBeNull();

    const store2 = new CRDTStore();
    const loaded = store2.load('doc', binary!);
    expect(loaded.projects['beta']).toBe('{"slug":"beta"}');
  });
});

describe('CRDTSyncService', () => {
  let tmpDir: string;
  let service: CRDTSyncService;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'crdt-test-'));
    service = new CRDTSyncService();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('initializes fresh document when no binary exists', async () => {
    await service.initialize(tmpDir);
    const project = service.getProject(tmpDir, 'alpha');
    expect(project).toBeNull(); // nothing stored yet
  });

  it('sets and retrieves a project', async () => {
    const project = makeProject('my-proj');
    await service.setProject(tmpDir, 'my-proj', project);
    const retrieved = service.getProject(tmpDir, 'my-proj');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.slug).toBe('my-proj');
    expect(retrieved!.title).toBe('Test Project my-proj');
  });

  it('persists document and loads it on re-initialize', async () => {
    const project = makeProject('persisted');
    await service.setProject(tmpDir, 'persisted', project);

    const service2 = new CRDTSyncService();
    await service2.initialize(tmpDir);
    const retrieved = service2.getProject(tmpDir, 'persisted');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.slug).toBe('persisted');
  });

  it('deletes a project from the CRDT document', async () => {
    const project = makeProject('to-delete');
    await service.setProject(tmpDir, 'to-delete', project);
    await service.deleteProject(tmpDir, 'to-delete');
    const retrieved = service.getProject(tmpDir, 'to-delete');
    expect(retrieved).toBeNull();
  });

  it('notifies subscribers on project change', async () => {
    const changes: string[] = [];
    service.subscribe(tmpDir, (slug) => changes.push(slug));
    const project = makeProject('watched');
    await service.setProject(tmpDir, 'watched', project);
    expect(changes).toContain('watched');
  });

  it('getAllProjects returns all stored projects', async () => {
    await service.setProject(tmpDir, 'a', makeProject('a'));
    await service.setProject(tmpDir, 'b', makeProject('b'));
    const all = service.getAllProjects(tmpDir);
    expect(all).not.toBeNull();
    expect(Object.keys(all!).sort()).toEqual(['a', 'b']);
  });
});

describe('documents helpers', () => {
  it('round-trips project serialization', () => {
    const project = makeProject('round-trip');
    const serialized = serializeProject(project);
    const deserialized = deserializeProject(serialized);
    expect(deserialized).toMatchObject({ slug: 'round-trip', title: 'Test Project round-trip' });
  });

  it('deserializeProject returns null for invalid data', () => {
    expect(deserializeProject(undefined)).toBeNull();
    expect(deserializeProject('not-json{')).toBeNull();
  });
});
