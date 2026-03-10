/**
 * Project Service - Manages project orchestration data
 *
 * Handles CRUD operations for projects, milestones, and phases.
 * Projects are stored in .automaker/projects/{slug}/
 */

import path from 'path';
import { existsSync } from 'node:fs';
import * as Automerge from '@automerge/automerge';
import type {
  Project,
  Feature,
  Milestone,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectLink,
  ProjectStatusUpdate,
  ProjectDocument,
  ProjectDocumentsFile,
  ProjectStats,
} from '@protolabsai/types';
import {
  createLogger,
  createProject,
  generateProjectMarkdown,
  generateMilestoneMarkdown,
  generatePhaseMarkdown,
  slugify,
} from '@protolabsai/utils';
import { secureFs } from '@protolabsai/platform';
import {
  getProjectsDir,
  getProjectStatsPath,
  getProjectDir,
  getProjectJsonPath,
  getProjectDocsPath,
  getProjectFilePath,
  getMilestonesDir,
  getMilestoneDir,
  getMilestoneFilePath,
  ensureProjectDir,
  ensureMilestoneDir,
} from '@protolabsai/platform';
import type { FeatureLoader } from './feature-loader.js';
import type { CalendarService } from './calendar-service.js';
import type { EventEmitter } from '../lib/events.js';

const logger = createLogger('ProjectService');

/** Automerge document shape — one per projectPath, keyed by project slug */
type ProjectsDoc = { projects: Record<string, Project> };

export class ProjectService {
  private calendarService?: CalendarService;
  private readonly _docs = new Map<string, Automerge.Doc<ProjectsDoc>>();
  private readonly _initPromises = new Map<string, Promise<void>>();
  private readonly _crdtEnabled = new Map<string, boolean>();
  private readonly _crdtEvents: EventEmitter | null;

  constructor(
    private featureLoader: FeatureLoader,
    events?: EventEmitter
  ) {
    this._crdtEvents = events ?? null;
  }

  setCalendarService(calendarService: CalendarService): void {
    this.calendarService = calendarService;
  }

  // ─── CRDT helpers ──────────────────────────────────────────────────────────

  private _isCrdtEnabled(projectPath: string): boolean {
    const cached = this._crdtEnabled.get(projectPath);
    if (cached !== undefined) return cached;
    const enabled = existsSync(path.join(projectPath, 'proto.config.yaml'));
    this._crdtEnabled.set(projectPath, enabled);
    return enabled;
  }

  private _toAutomergeValue(project: Project): Record<string, unknown> {
    return JSON.parse(JSON.stringify(project)) as Record<string, unknown>;
  }

  private async _ensureDoc(projectPath: string): Promise<Automerge.Doc<ProjectsDoc>> {
    if (this._docs.has(projectPath)) return this._docs.get(projectPath)!;
    if (!this._initPromises.has(projectPath)) {
      this._initPromises.set(projectPath, this._initDoc(projectPath));
    }
    await this._initPromises.get(projectPath);
    return this._docs.get(projectPath)!;
  }

  private async _initDoc(projectPath: string): Promise<void> {
    const slugs = await this._listSlugsFromDisk(projectPath);
    let doc = Automerge.from<ProjectsDoc>({ projects: {} });
    const projects: Project[] = [];
    for (const slug of slugs) {
      const p = await this._readFromDisk(projectPath, slug);
      if (p) projects.push(p);
    }
    doc = Automerge.change(doc, (d) => {
      for (const p of projects) {
        (d.projects as Record<string, unknown>)[p.slug] = this._toAutomergeValue(p);
      }
    });
    this._docs.set(projectPath, doc);
    logger.info(
      `[CRDT] Initialized projects doc for ${projectPath} with ${projects.length} projects`
    );
  }

  private async _readFromDisk(projectPath: string, projectSlug: string): Promise<Project | null> {
    const jsonPath = getProjectJsonPath(projectPath, projectSlug);
    try {
      const rawContent = await secureFs.readFile(jsonPath, 'utf-8');
      const content = typeof rawContent === 'string' ? rawContent : rawContent.toString('utf-8');
      return JSON.parse(content) as Project;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  private async _listSlugsFromDisk(projectPath: string): Promise<string[]> {
    const projectsDir = getProjectsDir(projectPath);
    try {
      const entries = await secureFs.readdir(projectsDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  /**
   * Apply Automerge binary changes received from a remote peer.
   * Merges the changes into the local doc and emits project events for any
   * projects that changed. Called by the wiring layer on 'crdt:remote-changes'.
   */
  applyRemoteChanges(projectPath: string, changes: Uint8Array[]): void {
    let doc = this._docs.get(projectPath);
    const isNew = !doc;
    if (!doc) {
      doc = Automerge.init<ProjectsDoc>();
      this._initPromises.set(projectPath, Promise.resolve());
    }
    const oldProjects = doc.projects || {};
    const [newDoc] = Automerge.applyChanges<ProjectsDoc>(doc, changes);
    this._docs.set(projectPath, newDoc);
    const newProjects = newDoc.projects || {};
    const allSlugs = new Set([...Object.keys(oldProjects), ...Object.keys(newProjects)]);
    for (const slug of allSlugs) {
      const oldProject = isNew ? undefined : oldProjects[slug];
      const newProject = newProjects[slug];
      const unchanged =
        !isNew &&
        oldProject !== undefined &&
        newProject !== undefined &&
        JSON.stringify(oldProject) === JSON.stringify(newProject);
      if (!unchanged) {
        if (newProject) {
          const eventType = oldProject ? 'project:updated' : 'project:created';
          this._crdtEvents?.emit(eventType, {
            projectSlug: slug,
            projectPath,
            project: newProject,
          });
        } else {
          this._crdtEvents?.emit('project:deleted', { projectSlug: slug, projectPath });
        }
      }
    }
    logger.debug(`[CRDT] Applied ${changes.length} remote change(s) for ${projectPath}`);
  }

  // ─── Remote sync (called by crdt-sync.module.ts) ─────────────────────────

  /**
   * Persist a project received from a remote instance.
   * Writes to disk + updates local Automerge doc WITHOUT emitting events
   * (the caller re-emits via the local EventBus to prevent loops).
   */
  async persistRemoteProject(projectPath: string, project: Project): Promise<void> {
    const slug = project.slug;
    if (!slug) {
      logger.warn('[CRDT] Received remote project without slug, skipping');
      return;
    }

    // Ensure directory exists
    await ensureProjectDir(projectPath, slug);

    // Write project.json
    const jsonPath = getProjectJsonPath(projectPath, slug);
    await secureFs.writeFile(jsonPath, JSON.stringify(project, null, 2));

    // Update local Automerge doc (no event emission)
    if (this._isCrdtEnabled(projectPath)) {
      const doc = await this._ensureDoc(projectPath);
      const newDoc = Automerge.change(doc, (d) => {
        (d.projects as Record<string, unknown>)[slug] = this._toAutomergeValue(project);
      });
      this._docs.set(projectPath, newDoc);
    }

    logger.info(`[CRDT] Persisted remote project: ${slug}`);
  }

  /**
   * Delete a project received from a remote instance.
   * Removes from disk + local Automerge doc WITHOUT emitting events.
   */
  async persistRemoteDelete(projectPath: string, projectSlug: string): Promise<void> {
    const projectDir = getProjectDir(projectPath, projectSlug);
    try {
      await secureFs.rm(projectDir, { recursive: true, force: true });
    } catch {
      // Directory may not exist locally — that's fine
    }

    // Update local Automerge doc (no event emission)
    if (this._isCrdtEnabled(projectPath)) {
      const doc = await this._ensureDoc(projectPath);
      const newDoc = Automerge.change(doc, (d) => {
        delete (d.projects as Record<string, Project | undefined>)[projectSlug];
      });
      this._docs.set(projectPath, newDoc);
    }

    logger.info(`[CRDT] Persisted remote project delete: ${projectSlug}`);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * List all projects in a project path
   */
  async listProjects(projectPath: string): Promise<string[]> {
    if (this._isCrdtEnabled(projectPath)) {
      const doc = await this._ensureDoc(projectPath);
      return Object.keys(doc.projects || {}).sort();
    }
    return this._listSlugsFromDisk(projectPath);
  }

  /**
   * Get a project by slug
   */
  async getProject(projectPath: string, projectSlug: string): Promise<Project | null> {
    if (this._isCrdtEnabled(projectPath)) {
      const doc = await this._ensureDoc(projectPath);
      const raw = (doc.projects || {})[projectSlug];
      return raw ? (raw as Project) : null;
    }
    return this._readFromDisk(projectPath, projectSlug);
  }

  /**
   * Create a new project
   */
  async createProject(projectPath: string, input: CreateProjectInput): Promise<Project> {
    const project = createProject(input);

    // Ensure directories exist
    await ensureProjectDir(projectPath, project.slug);

    // Write project.json
    const jsonPath = getProjectJsonPath(projectPath, project.slug);
    await secureFs.writeFile(jsonPath, JSON.stringify(project, null, 2));

    // Write project.md for human readability
    const mdPath = getProjectFilePath(projectPath, project.slug);
    await secureFs.writeFile(mdPath, generateProjectMarkdown(project));

    // Write milestone directories and files
    for (const milestone of project.milestones) {
      await ensureMilestoneDir(projectPath, project.slug, milestone.slug);

      // Write milestone.md
      const milestoneMdPath = getMilestoneFilePath(projectPath, project.slug, milestone.slug);
      await secureFs.writeFile(milestoneMdPath, generateMilestoneMarkdown(milestone, project));

      // Write phase files
      for (let i = 0; i < milestone.phases.length; i++) {
        const phase = milestone.phases[i];
        const phaseFilename = `phase-${String(i + 1).padStart(2, '0')}-${slugify(phase.title, 30)}.md`;
        const phasePath = path.join(
          getMilestoneDir(projectPath, project.slug, milestone.slug),
          phaseFilename
        );
        await secureFs.writeFile(phasePath, generatePhaseMarkdown(phase, milestone, project));
      }
    }

    // Sync milestone target dates to calendar events
    if (this.calendarService && project.milestones) {
      for (const milestone of project.milestones) {
        if (milestone.targetDate) {
          const sourceId = `project:${project.slug}/milestone:${slugify(milestone.title)}`;
          await this.calendarService.upsertBySourceId(projectPath, sourceId, {
            title: `${milestone.title} (${project.title})`,
            date: milestone.targetDate,
            type: 'milestone',
            description: milestone.description,
          });
        }
      }
    }

    // Update CRDT doc and emit event
    if (this._isCrdtEnabled(projectPath)) {
      const doc = await this._ensureDoc(projectPath);
      const newDoc = Automerge.change(doc, (d) => {
        (d.projects as Record<string, unknown>)[project.slug] = this._toAutomergeValue(project);
      });
      this._docs.set(projectPath, newDoc);
      this._crdtEvents?.emit('project:created', {
        projectSlug: project.slug,
        projectPath,
        project,
      });
    }

    logger.info(`Created project: ${project.slug}`);
    return project;
  }

  /**
   * Ensure the persistent "bugs" project exists, creating it if not.
   */
  async ensureBugsProject(projectPath: string): Promise<Project> {
    const existing = await this.getProject(projectPath, 'bugs');
    if (existing) return existing;

    return this.createProject(projectPath, {
      slug: 'bugs',
      title: 'Bugs',
      goal: 'Persistent project for tracking all bug reports, investigations, and fixes.',
      ongoing: true,
      priority: 'high',
      color: '#ef4444',
    });
  }

  async ensureSystemImprovementsProject(projectPath: string): Promise<Project> {
    const existing = await this.getProject(projectPath, 'system-improvements');
    if (existing) return existing;

    return this.createProject(projectPath, {
      slug: 'system-improvements',
      title: 'System Improvements',
      goal: 'Continuous system improvement tickets filed by Ava instances from observed friction patterns.',
      ongoing: true,
      priority: 'medium',
      color: '#8b5cf6',
    });
  }

  /**
   * Save structured milestone data to a project.
   *
   * This is the missing seam between the PM agent's PRD output and approve_project.
   * After the PM agent drafts a PRD, call this to persist the structured milestones
   * so that approve_project can find them.
   */
  async saveProjectMilestones(
    projectPath: string,
    projectSlug: string,
    milestones: Milestone[]
  ): Promise<Project> {
    const project = await this.getProject(projectPath, projectSlug);
    if (!project) {
      throw new Error(`Project "${projectSlug}" not found`);
    }

    // Update project with new milestones and advance status to 'reviewing'
    const updated: Project = {
      ...project,
      milestones,
      status:
        project.status === 'active' || project.status === 'scaffolded'
          ? project.status
          : 'reviewing',
      updatedAt: new Date().toISOString(),
    };

    // Write updated project.json
    const jsonPath = getProjectJsonPath(projectPath, projectSlug);
    await secureFs.writeFile(jsonPath, JSON.stringify(updated, null, 2));

    // Write project.md
    const mdPath = getProjectFilePath(projectPath, projectSlug);
    await secureFs.writeFile(mdPath, generateProjectMarkdown(updated));

    // Write milestone directories and files
    for (const milestone of milestones) {
      await ensureMilestoneDir(projectPath, projectSlug, milestone.slug);

      // Write milestone.md
      const milestoneMdPath = getMilestoneFilePath(projectPath, projectSlug, milestone.slug);
      await secureFs.writeFile(milestoneMdPath, generateMilestoneMarkdown(milestone, updated));

      // Write phase files
      for (let i = 0; i < milestone.phases.length; i++) {
        const phase = milestone.phases[i];
        const phaseFilename = `phase-${String(i + 1).padStart(2, '0')}-${slugify(phase.title, 30)}.md`;
        const phasePath = path.join(
          getMilestoneDir(projectPath, projectSlug, milestone.slug),
          phaseFilename
        );
        await secureFs.writeFile(phasePath, generatePhaseMarkdown(phase, milestone, updated));
      }
    }

    // Sync milestone target dates to calendar events
    if (this.calendarService && milestones) {
      for (const milestone of milestones) {
        if (milestone.targetDate) {
          const sourceId = `project:${projectSlug}/milestone:${slugify(milestone.title)}`;
          await this.calendarService.upsertBySourceId(projectPath, sourceId, {
            title: `${milestone.title} (${updated.title})`,
            date: milestone.targetDate,
            type: 'milestone',
            description: milestone.description,
          });
        }
      }
    }

    logger.info(`Saved ${milestones.length} milestones for project: ${projectSlug}`);
    return updated;
  }

  /**
   * Update a single phase's claim fields on the shared project doc.
   * Used by WorkIntakeService for phase claiming and completion reporting.
   */
  async updatePhaseClaim(
    projectPath: string,
    projectSlug: string,
    milestoneSlug: string,
    phaseName: string,
    update: Partial<import('@protolabsai/types').Phase>
  ): Promise<void> {
    const project = await this.getProject(projectPath, projectSlug);
    if (!project) throw new Error(`Project "${projectSlug}" not found`);

    const milestone = project.milestones.find((m) => m.slug === milestoneSlug);
    if (!milestone)
      throw new Error(`Milestone "${milestoneSlug}" not found in project "${projectSlug}"`);

    const phase = milestone.phases.find((p) => p.name === phaseName);
    if (!phase) throw new Error(`Phase "${phaseName}" not found in milestone "${milestoneSlug}"`);

    Object.assign(phase, update);
    project.updatedAt = new Date().toISOString();

    const jsonPath = getProjectJsonPath(projectPath, projectSlug);
    await secureFs.writeFile(jsonPath, JSON.stringify(project, null, 2));
  }

  /**
   * Read the latest state of a single phase.
   * Used by WorkIntakeService to verify claims survived Automerge merge.
   */
  async getPhase(
    projectPath: string,
    projectSlug: string,
    milestoneSlug: string,
    phaseName: string
  ): Promise<import('@protolabsai/types').Phase | null> {
    const project = await this.getProject(projectPath, projectSlug);
    if (!project) return null;

    const milestone = project.milestones.find((m) => m.slug === milestoneSlug);
    if (!milestone) return null;

    return milestone.phases.find((p) => p.name === phaseName) ?? null;
  }

  /**
   * Update an existing project
   */
  async updateProject(
    projectPath: string,
    projectSlug: string,
    updates: UpdateProjectInput
  ): Promise<Project | null> {
    const existing = await this.getProject(projectPath, projectSlug);
    if (!existing) {
      return null;
    }

    if (updates.status === 'completed' && existing.ongoing) {
      throw new Error('Cannot complete an ongoing project');
    }

    const updated: Project = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Write updated project.json
    const jsonPath = getProjectJsonPath(projectPath, projectSlug);
    await secureFs.writeFile(jsonPath, JSON.stringify(updated, null, 2));

    // Update project.md
    const mdPath = getProjectFilePath(projectPath, projectSlug);
    await secureFs.writeFile(mdPath, generateProjectMarkdown(updated));

    // Sync milestone target dates to calendar events
    if (this.calendarService && updated.milestones) {
      for (const milestone of updated.milestones) {
        if (milestone.targetDate) {
          const sourceId = `project:${projectSlug}/milestone:${slugify(milestone.title)}`;
          await this.calendarService.upsertBySourceId(projectPath, sourceId, {
            title: `${milestone.title} (${updated.title})`,
            date: milestone.targetDate,
            type: 'milestone',
            description: milestone.description,
          });
        }
      }
    }

    // Update CRDT doc and emit event
    if (this._isCrdtEnabled(projectPath)) {
      const doc = await this._ensureDoc(projectPath);
      const newDoc = Automerge.change(doc, (d) => {
        (d.projects as Record<string, unknown>)[projectSlug] = this._toAutomergeValue(updated);
      });
      this._docs.set(projectPath, newDoc);
      this._crdtEvents?.emit('project:updated', {
        projectSlug,
        projectPath,
        project: updated,
      });
    }

    logger.info(`Updated project: ${projectSlug}`);
    return updated;
  }

  /**
   * Delete a project and all its files.
   * Captures a slim stats record to stats.json before removing the directory.
   */
  async deleteProject(projectPath: string, projectSlug: string): Promise<boolean> {
    const projectDir = getProjectDir(projectPath, projectSlug);

    // Load project data before deletion
    const project = await this.getProject(projectPath, projectSlug);
    if (!project) {
      return false;
    }

    // Count linked features
    let featureCount = 0;
    try {
      const { features, epics } = await this.getProjectFeatures(projectPath, projectSlug);
      featureCount = features.length + epics.length;
    } catch {
      // Feature loader may fail if no features dir — count stays 0
    }

    // Count documents
    let documentCount = 0;
    try {
      const docsFile = await this.readDocsFile(projectPath, projectSlug);
      documentCount = Object.keys(docsFile.docs).length;
    } catch {
      // docs.json may not exist
    }

    // Count linked phases (phases with a featureId set)
    const linkedPhaseCount = project.milestones.reduce(
      (acc, m) => acc + m.phases.filter((p) => p.featureId).length,
      0
    );

    // Build stats record
    const stats: ProjectStats = {
      slug: project.slug,
      title: project.title,
      goal: project.goal,
      status: project.status,
      health: project.health,
      priority: project.priority,
      lead: project.lead,
      milestoneCount: project.milestones.length,
      phaseCount: project.milestones.reduce((acc, m) => acc + m.phases.length, 0),
      linkedPhaseCount,
      featureCount,
      updateCount: (project.updates ?? []).length,
      linkCount: (project.links ?? []).length,
      documentCount,
      createdAt: project.createdAt,
      deletedAt: new Date().toISOString(),
    };

    // Persist stats
    await this.appendProjectStats(projectPath, stats);

    // Delete project directory
    try {
      await secureFs.rm(projectDir, { recursive: true, force: true });
      logger.info(`Deleted project: ${projectSlug} (stats preserved)`);

      // Update CRDT doc and emit event
      if (this._isCrdtEnabled(projectPath)) {
        const doc = await this._ensureDoc(projectPath);
        const newDoc = Automerge.change(doc, (d) => {
          delete (d.projects as Record<string, Project | undefined>)[projectSlug];
        });
        this._docs.set(projectPath, newDoc);
        this._crdtEvents?.emit('project:deleted', { projectSlug, projectPath });
      }

      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get stats for all deleted projects
   */
  async getDeletedProjectStats(projectPath: string): Promise<ProjectStats[]> {
    const statsPath = getProjectStatsPath(projectPath);
    try {
      const raw = await secureFs.readFile(statsPath, 'utf-8');
      const content = typeof raw === 'string' ? raw : raw.toString('utf-8');
      return JSON.parse(content) as ProjectStats[];
    } catch {
      return [];
    }
  }

  private async appendProjectStats(projectPath: string, stats: ProjectStats): Promise<void> {
    const statsPath = getProjectStatsPath(projectPath);
    const existing = await this.getDeletedProjectStats(projectPath);
    existing.push(stats);
    await secureFs.writeFile(statsPath, JSON.stringify(existing, null, 2));
  }

  // ---------------------------------------------------------------------------
  // Links
  // ---------------------------------------------------------------------------

  async addLink(
    projectPath: string,
    projectSlug: string,
    label: string,
    url: string
  ): Promise<ProjectLink> {
    const project = await this.getProject(projectPath, projectSlug);
    if (!project) throw new Error(`Project "${projectSlug}" not found`);

    const link: ProjectLink = {
      id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label,
      url,
      createdAt: new Date().toISOString(),
    };

    const links = [...(project.links ?? []), link];
    await this.updateProject(projectPath, projectSlug, { links });
    return link;
  }

  async removeLink(projectPath: string, projectSlug: string, linkId: string): Promise<Project> {
    const project = await this.getProject(projectPath, projectSlug);
    if (!project) throw new Error(`Project "${projectSlug}" not found`);

    const links = (project.links ?? []).filter((l) => l.id !== linkId);
    const updated = await this.updateProject(projectPath, projectSlug, { links });
    return updated!;
  }

  // ---------------------------------------------------------------------------
  // Status Updates
  // ---------------------------------------------------------------------------

  async addStatusUpdate(
    projectPath: string,
    projectSlug: string,
    health: ProjectStatusUpdate['health'],
    body: string,
    author: string
  ): Promise<ProjectStatusUpdate> {
    const project = await this.getProject(projectPath, projectSlug);
    if (!project) throw new Error(`Project "${projectSlug}" not found`);

    const update: ProjectStatusUpdate = {
      id: `update-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      health,
      body,
      author,
      createdAt: new Date().toISOString(),
    };

    const updates = [...(project.updates ?? []), update];
    await this.updateProject(projectPath, projectSlug, { updates });
    return update;
  }

  async removeStatusUpdate(
    projectPath: string,
    projectSlug: string,
    updateId: string
  ): Promise<Project> {
    const project = await this.getProject(projectPath, projectSlug);
    if (!project) throw new Error(`Project "${projectSlug}" not found`);

    const updates = (project.updates ?? []).filter((u) => u.id !== updateId);
    const updated = await this.updateProject(projectPath, projectSlug, { updates });
    return updated!;
  }

  // ---------------------------------------------------------------------------
  // Documents (stored in separate docs.json)
  // ---------------------------------------------------------------------------

  private async readDocsFile(
    projectPath: string,
    projectSlug: string
  ): Promise<ProjectDocumentsFile> {
    const docsPath = getProjectDocsPath(projectPath, projectSlug);
    try {
      const raw = await secureFs.readFile(docsPath, 'utf-8');
      const content = typeof raw === 'string' ? raw : raw.toString('utf-8');
      return JSON.parse(content) as ProjectDocumentsFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: 1, docOrder: [], docs: {} };
      }
      throw error;
    }
  }

  private async writeDocsFile(
    projectPath: string,
    projectSlug: string,
    file: ProjectDocumentsFile
  ): Promise<void> {
    const docsPath = getProjectDocsPath(projectPath, projectSlug);
    await secureFs.writeFile(docsPath, JSON.stringify(file, null, 2));
  }

  async listDocs(projectPath: string, projectSlug: string): Promise<ProjectDocumentsFile> {
    return this.readDocsFile(projectPath, projectSlug);
  }

  async getDoc(
    projectPath: string,
    projectSlug: string,
    docId: string
  ): Promise<ProjectDocument | null> {
    const file = await this.readDocsFile(projectPath, projectSlug);
    return file.docs[docId] ?? null;
  }

  async createDoc(
    projectPath: string,
    projectSlug: string,
    title: string,
    content?: string,
    author?: string
  ): Promise<ProjectDocument> {
    const file = await this.readDocsFile(projectPath, projectSlug);
    const now = new Date().toISOString();
    const doc: ProjectDocument = {
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      content: content ?? '',
      author,
      createdAt: now,
      updatedAt: now,
    };

    file.docs[doc.id] = doc;
    file.docOrder.push(doc.id);
    await this.writeDocsFile(projectPath, projectSlug, file);
    logger.info(`Created doc "${title}" in project ${projectSlug}`);
    return doc;
  }

  async updateDoc(
    projectPath: string,
    projectSlug: string,
    docId: string,
    updates: { title?: string; content?: string }
  ): Promise<ProjectDocument> {
    const file = await this.readDocsFile(projectPath, projectSlug);
    const existing = file.docs[docId];
    if (!existing) throw new Error(`Document "${docId}" not found in project "${projectSlug}"`);

    const updated: ProjectDocument = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    if (updates.content !== undefined) {
      updated.wordCount = updates.content
        .replace(/<[^>]*>/g, '')
        .split(/\s+/)
        .filter(Boolean).length;
    }
    file.docs[docId] = updated;
    await this.writeDocsFile(projectPath, projectSlug, file);
    return updated;
  }

  async deleteDoc(projectPath: string, projectSlug: string, docId: string): Promise<void> {
    const file = await this.readDocsFile(projectPath, projectSlug);
    if (!file.docs[docId])
      throw new Error(`Document "${docId}" not found in project "${projectSlug}"`);

    delete file.docs[docId];
    file.docOrder = file.docOrder.filter((id) => id !== docId);
    await this.writeDocsFile(projectPath, projectSlug, file);
    logger.info(`Deleted doc "${docId}" from project ${projectSlug}`);
  }

  async reorderDocs(projectPath: string, projectSlug: string, docOrder: string[]): Promise<void> {
    const file = await this.readDocsFile(projectPath, projectSlug);
    file.docOrder = docOrder;
    await this.writeDocsFile(projectPath, projectSlug, file);
  }

  // ---------------------------------------------------------------------------
  // Project Features
  // ---------------------------------------------------------------------------

  async getProjectFeatures(
    projectPath: string,
    projectSlug: string
  ): Promise<{ features: Feature[]; epics: Feature[] }> {
    const allFeatures = await this.featureLoader.getAll(projectPath);
    const projectFeatures = allFeatures.filter((f) => f.projectSlug === projectSlug);
    const epics = projectFeatures.filter((f) => f.isEpic);
    const features = projectFeatures.filter((f) => !f.isEpic);
    return { features, epics };
  }

  /**
   * Archive a project.
   * Keeps a slim project.json with mapping data, deletes .md files and milestones/ directory.
   */
  async archiveProject(
    projectPath: string,
    projectSlug: string
  ): Promise<{
    originalSize: number;
    archivedSize: number;
    filesRemoved: number;
  }> {
    const project = await this.getProject(projectPath, projectSlug);
    if (!project) {
      throw new Error(`Project "${projectSlug}" not found`);
    }

    const jsonPath = getProjectJsonPath(projectPath, projectSlug);
    const originalJson = JSON.stringify(project, null, 2);
    const originalSize = Buffer.byteLength(originalJson, 'utf-8');

    // Build slim version keeping only mapping data
    const slim: Record<string, unknown> = {
      slug: project.slug,
      title: project.title,
      goal: project.goal,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      archivedAt: new Date().toISOString(),
      milestones: project.milestones.map((m) => ({
        number: m.number,
        slug: m.slug,
        title: m.title,
        epicId: m.epicId,
        status: m.status,
        phases: m.phases.map((p) => ({
          number: p.number,
          name: p.name,
          title: p.title,
          featureId: p.featureId,
          complexity: p.complexity,
        })),
      })),
    };

    // Write slim project.json
    const slimJson = JSON.stringify(slim, null, 2);
    const archivedSize = Buffer.byteLength(slimJson, 'utf-8');
    await secureFs.writeFile(jsonPath, slimJson);

    // Delete optional .md files
    let filesRemoved = 0;
    const projectDir = getProjectDir(projectPath, projectSlug);
    const filesToDelete = ['project.md', 'prd.md', 'research.md'];
    for (const filename of filesToDelete) {
      try {
        await secureFs.rm(path.join(projectDir, filename));
        filesRemoved++;
      } catch {
        // File doesn't exist, skip
      }
    }

    // Delete milestones/ directory recursively
    const milestonesDir = getMilestonesDir(projectPath, projectSlug);
    try {
      await secureFs.rm(milestonesDir, { recursive: true, force: true });
      filesRemoved++; // Count the directory as one removal
    } catch {
      // Directory doesn't exist, skip
    }

    logger.info(
      `Archived project ${projectSlug}: ${originalSize}B → ${archivedSize}B, ${filesRemoved} files removed`
    );

    return { originalSize, archivedSize, filesRemoved };
  }
}
