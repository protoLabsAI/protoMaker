/**
 * CRDTSyncService - Manages Automerge-backed project document sync
 *
 * Wraps the @protolabsai/crdt CRDTStore for the projects domain.
 * Provides get/set/delete operations that keep both the CRDT document
 * and the filesystem (project.json) in sync.
 *
 * Backward compatible: if CRDT is unavailable (e.g., load error), all
 * operations fall back to returning null and callers use the filesystem.
 */

import path from 'path';
import fs from 'fs/promises';
import { createLogger } from '@protolabsai/utils';
import type { Project } from '@protolabsai/types';
import {
  CRDTStore,
  type ProjectsDoc,
  createProjectsDoc,
  serializeProject,
  deserializeProject,
  extractProjects,
} from '@protolabsai/crdt';

const logger = createLogger('CRDTSyncService');

/** Subdirectory within .automaker/ where CRDT binary state is persisted */
const CRDT_DIR = '.automaker/crdt';
/** Filename for the projects Automerge document */
const PROJECTS_DOC_FILE = 'projects.bin';

type ChangeCallback = (slug: string, project: Project | null) => void;

export class CRDTSyncService {
  private store = new CRDTStore();
  /** Per-projectPath unsubscribe functions registered on the store */
  private unsubs = new Map<string, () => void>();
  /** External change listeners */
  private listeners = new Map<string, Set<ChangeCallback>>();

  /**
   * Ensure the CRDT document for a projectPath is loaded.
   * Loads from disk if available, initializes fresh otherwise.
   * Idempotent — safe to call multiple times.
   */
  async initialize(projectPath: string): Promise<void> {
    const key = this.docKey(projectPath);
    if (this.store.has(key)) return;

    const binPath = this.binPath(projectPath);
    try {
      const data = await fs.readFile(binPath);
      this.store.load<ProjectsDoc>(key, data);
      logger.info(`Loaded CRDT projects doc for ${projectPath}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // No persisted state yet — initialize empty document
        this.store.getOrCreate<ProjectsDoc>(key, createProjectsDoc);
        logger.info(`Initialized fresh CRDT projects doc for ${projectPath}`);
      } else {
        logger.warn(`Failed to load CRDT doc for ${projectPath}: ${String(err)}`);
        // Fall through: store remains empty, callers will fall back to filesystem
        return;
      }
    }

    // Subscribe to internal store changes so we can notify external listeners
    const unsub = this.store.subscribe<ProjectsDoc>(key, (doc: ProjectsDoc) => {
      this.persist(projectPath, key).catch((e) =>
        logger.warn(`Failed to persist CRDT doc: ${String(e)}`)
      );
      const externals = this.listeners.get(projectPath);
      if (externals) {
        const projects = extractProjects(doc);
        for (const cb of externals) {
          // Emit a synthetic event for each project in the updated doc
          for (const [slug, project] of Object.entries(projects)) {
            cb(slug, project);
          }
        }
      }
    });
    this.unsubs.set(projectPath, unsub);
  }

  /**
   * Get a project from the CRDT document.
   * Returns null if not in CRDT (caller should fall back to filesystem).
   */
  getProject(projectPath: string, slug: string): Project | null {
    const key = this.docKey(projectPath);
    const doc = this.store.get<ProjectsDoc>(key);
    if (!doc) return null;
    return deserializeProject(doc.projects?.[slug]);
  }

  /**
   * Get all projects from the CRDT document.
   * Returns null if the CRDT doc is not loaded.
   */
  getAllProjects(projectPath: string): Record<string, Project> | null {
    const key = this.docKey(projectPath);
    const doc = this.store.get<ProjectsDoc>(key);
    if (!doc) return null;
    return extractProjects(doc);
  }

  /**
   * Write a project to the CRDT document.
   * The change is applied to the Automerge doc and persisted to disk.
   */
  async setProject(projectPath: string, slug: string, project: Project): Promise<void> {
    await this.initialize(projectPath);
    const key = this.docKey(projectPath);
    this.store.change<ProjectsDoc>(key, createProjectsDoc, (doc: ProjectsDoc) => {
      doc.projects[slug] = serializeProject(project);
    });
    // Persist happens via the subscribe callback set up in initialize()
    // but call directly here too for immediate consistency
    await this.persist(projectPath, key);
  }

  /**
   * Remove a project from the CRDT document.
   */
  async deleteProject(projectPath: string, slug: string): Promise<void> {
    await this.initialize(projectPath);
    const key = this.docKey(projectPath);
    const doc = this.store.get<ProjectsDoc>(key);
    if (!doc || !doc.projects?.[slug]) return;
    this.store.change<ProjectsDoc>(key, createProjectsDoc, (doc: ProjectsDoc) => {
      delete doc.projects[slug];
    });
    await this.persist(projectPath, key);
  }

  /**
   * Subscribe to project changes for a given projectPath.
   * The callback is called with (slug, project) when a project changes.
   * project is null when a project is deleted.
   * Returns an unsubscribe function.
   */
  subscribe(projectPath: string, callback: ChangeCallback): () => void {
    let listeners = this.listeners.get(projectPath);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(projectPath, listeners);
    }
    listeners.add(callback);
    return () => {
      listeners!.delete(callback);
    };
  }

  /**
   * Apply raw Automerge changes received from a remote peer.
   * Used when a WebSocket sync transport delivers changes.
   */
  async applyRemoteChanges(projectPath: string, changes: Uint8Array[]): Promise<void> {
    await this.initialize(projectPath);
    const key = this.docKey(projectPath);
    this.store.applyChanges<ProjectsDoc>(key, changes);
    await this.persist(projectPath, key);
  }

  /**
   * Export the current Automerge binary state for a projectPath.
   * Returns null if no document is loaded.
   */
  exportBinary(projectPath: string): Uint8Array | null {
    const key = this.docKey(projectPath);
    return this.store.save(key);
  }

  /** Cleanup subscriptions for a given projectPath */
  dispose(projectPath: string): void {
    const unsub = this.unsubs.get(projectPath);
    if (unsub) {
      unsub();
      this.unsubs.delete(projectPath);
    }
    this.listeners.delete(projectPath);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private docKey(projectPath: string): string {
    return `projects:${projectPath}`;
  }

  private binPath(projectPath: string): string {
    return path.join(projectPath, CRDT_DIR, PROJECTS_DOC_FILE);
  }

  private async persist(projectPath: string, key: string): Promise<void> {
    const data = this.store.save(key);
    if (!data) return;
    const binPath = this.binPath(projectPath);
    await fs.mkdir(path.dirname(binPath), { recursive: true });
    await fs.writeFile(binPath, data);
  }
}
