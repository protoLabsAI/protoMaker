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
  CreateProjectInput,
  UpdateProjectInput,
  CreateFeaturesFromProjectOptions,
  CreateFeaturesResult,
  ProjectLink,
  ProjectStatusUpdate,
  ProjectDocument,
  ProjectDocumentsFile,
} from '@protolabs-ai/types';
import {
  createLogger,
  createProject,
  generateProjectMarkdown,
  generateMilestoneMarkdown,
  generatePhaseMarkdown,
  phaseToFeatureDescription,
  phaseToBranchName,
  slugify,
} from '@protolabs-ai/utils';
import { secureFs } from '@protolabs-ai/platform';
import {
  getProjectsDir,
  getProjectDir,
  getProjectJsonPath,
  getProjectDocsPath,
  getProjectFilePath,
  getMilestonesDir,
  getMilestoneDir,
  getMilestoneFilePath,
  ensureProjectDir,
  ensureMilestoneDir,
} from '@protolabs-ai/platform';
import type { FeatureLoader } from './feature-loader.js';
import type { CalendarService } from './calendar-service.js';

const logger = createLogger('ProjectService');

export class ProjectService {
  private calendarService?: CalendarService;

  constructor(private featureLoader: FeatureLoader) {}

  setCalendarService(calendarService: CalendarService): void {
    this.calendarService = calendarService;
  }

  /**
   * List all projects in a project path
   */
  async listProjects(projectPath: string): Promise<string[]> {
    const projectsDir = getProjectsDir(projectPath);

    try {
      const entries = await secureFs.readdir(projectsDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      // Directory doesn't exist yet
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get a project by slug
   */
  async getProject(projectPath: string, projectSlug: string): Promise<Project | null> {
    const jsonPath = getProjectJsonPath(projectPath, projectSlug);

    try {
      const rawContent = await secureFs.readFile(jsonPath, 'utf-8');
      // Ensure we have a string for JSON.parse (handle Buffer case)
      const content = typeof rawContent === 'string' ? rawContent : rawContent.toString('utf-8');
      return JSON.parse(content) as Project;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
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

    logger.info(`Created project: ${project.slug}`);
    return project;
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

    logger.info(`Updated project: ${projectSlug}`);
    return updated;
  }

  /**
   * Delete a project and all its files
   */
  async deleteProject(projectPath: string, projectSlug: string): Promise<boolean> {
    const projectDir = getProjectDir(projectPath, projectSlug);

    try {
      await secureFs.rm(projectDir, { recursive: true, force: true });
      logger.info(`Deleted project: ${projectSlug}`);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Create features from a project's phases
   */
  async createFeaturesFromProject(
    projectPath: string,
    projectSlug: string,
    options?: CreateFeaturesFromProjectOptions
  ): Promise<CreateFeaturesResult> {
    const project = await this.getProject(projectPath, projectSlug);
    if (!project) {
      throw new Error(`Project "${projectSlug}" not found`);
    }

    const createEpics = options?.createEpics ?? true;
    const initialStatus = options?.initialStatus ?? 'backlog';
    const setupDependencies = options?.setupDependencies ?? true;

    const featureIds: string[] = [];
    const epicIds: string[] = [];

    // Map to track phase IDs to feature IDs for dependencies
    const phaseToFeatureMap = new Map<string, string>();

    for (const milestone of project.milestones) {
      let epicId: string | undefined;

      // Create epic for milestone if enabled
      if (createEpics) {
        const epicFeature = await this.featureLoader.create(projectPath, {
          title: milestone.title,
          category: 'Epic',
          description: milestone.description,
          status: initialStatus,
          isEpic: true,
          branchName: `epic/${slugify(milestone.title, 30)}`,
          projectSlug,
        });
        epicId = epicFeature.id;
        epicIds.push(epicId);
        milestone.epicId = epicId;
      }

      // Create features for each phase
      for (const phase of milestone.phases) {
        const branchName = phaseToBranchName(projectSlug, milestone.slug, phase.title);
        const description = phaseToFeatureDescription(phase, milestone);

        // Get dependencies from phase (convert phase IDs to feature IDs)
        const dependencies = setupDependencies
          ? (phase.dependencies ?? [])
              .map((depId) => phaseToFeatureMap.get(depId))
              .filter((id): id is string => id !== undefined)
          : undefined;

        const feature = await this.featureLoader.create(projectPath, {
          title: phase.title,
          category: milestone.title,
          description,
          status: initialStatus,
          branchName,
          epicId,
          dependencies,
          projectSlug,
        });

        featureIds.push(feature.id);
        phaseToFeatureMap.set(phase.name, feature.id);
        phase.featureId = feature.id;
      }
    }

    // Update project with feature/epic IDs
    await this.updateProject(projectPath, projectSlug, {
      status: 'active',
    });

    // Re-save project.json with updated featureIds
    const jsonPath = getProjectJsonPath(projectPath, projectSlug);
    await secureFs.writeFile(jsonPath, JSON.stringify(project, null, 2));

    logger.info(
      `Created ${featureIds.length} features and ${epicIds.length} epics from project ${projectSlug}`
    );

    return {
      featuresCreated: featureIds.length,
      epicsCreated: epicIds.length,
      featureIds,
      epicIds,
    };
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

  // ---------------------------------------------------------------------------
  // Linear Integration
  // ---------------------------------------------------------------------------

  /**
   * Find a local project by its Linear project ID
   * Scans all project.json files for a matching linearProjectId field
   */
  async findByLinearProjectId(
    projectPath: string,
    linearProjectId: string
  ): Promise<{ project: Project; slug: string } | null> {
    const slugs = await this.listProjects(projectPath);

    for (const slug of slugs) {
      const project = await this.getProject(projectPath, slug);
      if (project?.linearProjectId === linearProjectId) {
        return { project, slug };
      }
    }

    return null;
  }

  /**
   * Archive a project after Linear handoff.
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
      linearProjectId: project.linearProjectId,
      linearProjectUrl: project.linearProjectUrl,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      archivedAt: new Date().toISOString(),
      milestones: project.milestones.map((m) => ({
        number: m.number,
        slug: m.slug,
        title: m.title,
        epicId: m.epicId,
        linearMilestoneId: m.linearMilestoneId,
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
