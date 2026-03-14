/**
 * Project Service - Manages project orchestration data
 *
 * Handles CRUD operations for projects, milestones, and phases.
 * Projects are stored in .automaker/projects/{slug}/
 */

import path from 'path';
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

export class ProjectService {
  private calendarService?: CalendarService;
  /** In-memory cache: projectPath → { [slug]: Project } */
  private readonly _docs = new Map<string, Record<string, Project>>();
  private readonly _initPromises = new Map<string, Promise<void>>();
  private readonly _crdtEvents: EventEmitter | null;

  constructor(
    private featureLoader: FeatureLoader,
    events?: EventEmitter
  ) {
    this._crdtEvents = events ?? null;

    // Listen for feature status changes and mirror them onto the linked phase
    if (events) {
      events.on('feature:status-changed', (payload) => {
        const { featureId, newStatus, projectPath } = payload;
        if (!projectPath || !newStatus) return;
        this._syncPhaseFromFeatureStatus(projectPath, featureId, newStatus).catch((err) =>
          logger.warn(`Failed to sync phase execution status for feature ${featureId}:`, err)
        );
      });
    }
  }

  setCalendarService(calendarService: CalendarService): void {
    this.calendarService = calendarService;
  }

  // ─── Feature status → phase execution status sync ──────────────────────────

  /**
   * Map a feature status to a phase executionStatus value.
   * Returns null when the feature status has no ceremony-automation mapping.
   */
  private _mapFeatureStatusToPhaseExecution(
    featureStatus: string
  ): import('@protolabsai/types').Phase['executionStatus'] | null {
    switch (featureStatus) {
      case 'backlog':
        return 'pending';
      case 'in_progress':
        return 'in-progress';
      case 'review':
        return 'in-review';
      case 'done':
        return 'completed';
      case 'blocked':
        return 'blocked';
      default:
        return null;
    }
  }

  /**
   * Find the project phase linked to the given featureId and update its
   * executionStatus to mirror the feature's new status. Writes project.json
   * to disk and updates in-memory cache.
   *
   * No-op when no phase has a matching featureId.
   */
  private async _syncPhaseFromFeatureStatus(
    projectPath: string,
    featureId: string,
    featureStatus: string
  ): Promise<void> {
    const executionStatus = this._mapFeatureStatusToPhaseExecution(featureStatus);
    if (!executionStatus) return;

    const slugs = await this._listSlugsFromDisk(projectPath);

    for (const slug of slugs) {
      const project = await this.getProject(projectPath, slug);
      if (!project) continue;

      let found = false;
      for (const milestone of project.milestones) {
        for (const phase of milestone.phases) {
          if (phase.featureId === featureId) {
            phase.executionStatus = executionStatus;
            found = true;
            break;
          }
        }
        if (found) break;
      }

      if (!found) continue;

      project.updatedAt = new Date().toISOString();

      // Write project.json to disk
      const jsonPath = getProjectJsonPath(projectPath, slug);
      await secureFs.writeFile(jsonPath, JSON.stringify(project, null, 2));

      // Update in-memory cache and emit event so peer instances see the update
      const doc = await this._ensureDoc(projectPath);
      doc[slug] = project;
      this._crdtEvents?.broadcast('project:updated', {
        projectSlug: slug,
        projectPath,
        project,
      });

      logger.debug(
        `Synced phase executionStatus for feature ${featureId}: ${featureStatus} → ${executionStatus} (project: ${slug})`
      );
      return; // phase found and updated — stop searching
    }

    // No phase linked to this featureId — no-op
    logger.debug(`No phase linked to feature ${featureId} in ${projectPath}, skipping sync`);
  }

  // ─── Cache helpers ──────────────────────────────────────────────────────────

  private async _ensureDoc(projectPath: string): Promise<Record<string, Project>> {
    if (this._docs.has(projectPath)) return this._docs.get(projectPath)!;
    if (!this._initPromises.has(projectPath)) {
      this._initPromises.set(projectPath, this._initDoc(projectPath));
    }
    await this._initPromises.get(projectPath);
    return this._docs.get(projectPath)!;
  }

  private async _initDoc(projectPath: string): Promise<void> {
    const slugs = await this._listSlugsFromDisk(projectPath);
    const projects: Record<string, Project> = {};
    for (const slug of slugs) {
      const p = await this._readFromDisk(projectPath, slug);
      if (p) projects[p.slug] = p;
    }
    this._docs.set(projectPath, projects);
    logger.info(
      `Initialized projects cache for ${projectPath} with ${Object.keys(projects).length} projects`
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

  // ─── Remote sync (called by peer-mesh module) ───────────────────────────

  /**
   * Persist a project received from a remote instance.
   * Writes to disk + updates local in-memory cache WITHOUT emitting events
   * (the caller re-emits via the local EventBus to prevent loops).
   */
  async persistRemoteProject(projectPath: string, project: Project): Promise<void> {
    const slug = project.slug;
    if (!slug) {
      logger.warn('[Sync] Received remote project without slug, skipping');
      return;
    }

    // Ensure directory exists
    await ensureProjectDir(projectPath, slug);

    // Write project.json
    const jsonPath = getProjectJsonPath(projectPath, slug);
    await secureFs.writeFile(jsonPath, JSON.stringify(project, null, 2));

    // Update local in-memory cache (no event emission)
    const doc = await this._ensureDoc(projectPath);
    doc[slug] = project;

    logger.info(`[Sync] Persisted remote project: ${slug}`);
  }

  /**
   * Delete a project received from a remote instance.
   * Removes from disk + local in-memory cache WITHOUT emitting events.
   */
  async persistRemoteDelete(projectPath: string, projectSlug: string): Promise<void> {
    const projectDir = getProjectDir(projectPath, projectSlug);
    try {
      await secureFs.rm(projectDir, { recursive: true, force: true });
    } catch {
      // Directory may not exist locally — that's fine
    }

    // Update local in-memory cache (no event emission)
    const doc = await this._ensureDoc(projectPath);
    delete doc[projectSlug];

    logger.info(`[Sync] Persisted remote project delete: ${projectSlug}`);
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Sync a pre-built Project into the in-memory cache and emit an event.
   *
   * Use this when code outside of ProjectService (e.g. the create/update route
   * handlers) has already written project.json to disk and just needs the
   * in-memory cache to reflect that change. Calling this ensures
   * getProject() returns the project immediately, without a server restart.
   */
  async syncProjectToCrdt(
    projectPath: string,
    project: Project,
    eventType: 'project:created' | 'project:updated' = 'project:updated'
  ): Promise<void> {
    const doc = await this._ensureDoc(projectPath);
    doc[project.slug] = project;
    this._crdtEvents?.broadcast(eventType, {
      projectSlug: project.slug,
      projectPath,
      project,
    });
    logger.debug(`Synced project ${project.slug} into cache (${eventType})`);
  }

  /**
   * List all projects in a project path
   */
  async listProjects(projectPath: string): Promise<string[]> {
    const doc = await this._ensureDoc(projectPath);
    return Object.keys(doc).sort();
  }

  /**
   * Get a project by slug
   */
  async getProject(projectPath: string, projectSlug: string): Promise<Project | null> {
    const doc = await this._ensureDoc(projectPath);
    return doc[projectSlug] ?? null;
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

    // Update in-memory cache and emit event
    const doc = await this._ensureDoc(projectPath);
    doc[project.slug] = project;
    this._crdtEvents?.broadcast('project:created', {
      projectSlug: project.slug,
      projectPath,
      project,
    });

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

    // Update in-memory cache and emit event so peers receive the milestone update
    const doc = await this._ensureDoc(projectPath);
    doc[projectSlug] = updated;
    this._crdtEvents?.broadcast('project:updated', {
      projectSlug,
      projectPath,
      project: updated,
    });

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

    // Update in-memory cache and emit event so peers receive the claim update
    const doc = await this._ensureDoc(projectPath);
    doc[projectSlug] = project;
    this._crdtEvents?.broadcast('project:updated', {
      projectSlug,
      projectPath,
      project,
    });
  }

  /**
   * Read the latest state of a single phase.
   * Used by WorkIntakeService to verify claims survived merge.
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

    // Update in-memory cache and emit event
    const doc = await this._ensureDoc(projectPath);
    doc[projectSlug] = updated;
    this._crdtEvents?.broadcast('project:updated', {
      projectSlug,
      projectPath,
      project: updated,
    });

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

      // Update in-memory cache and emit event
      const doc = await this._ensureDoc(projectPath);
      delete doc[projectSlug];
      this._crdtEvents?.broadcast('project:deleted', { projectSlug, projectPath });

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
