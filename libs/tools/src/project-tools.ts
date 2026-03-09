/**
 * Project tools — SharedTool wrappers for project management operations.
 *
 * Factory: createProjectTools(deps) returns SharedTool instances for links,
 * status updates, documents, and feature listing within projects.
 *
 * Follows the createBoardTools() pattern from board-tools.ts.
 */

import { z } from 'zod';
import { defineSharedTool } from './define-tool.js';
import type { SharedTool } from './types.js';
import type {
  Project,
  Feature,
  ProjectLink,
  ProjectStatusUpdate,
  ProjectDocument,
  ProjectDocumentsFile,
  ProjectHealth,
  UpdateProjectInput,
} from '@protolabsai/types';

// ---------------------------------------------------------------------------
// Minimal structural interface — avoids importing the concrete ProjectService
// ---------------------------------------------------------------------------

export interface ProjectDeps {
  projectService: {
    listProjects: (projectPath: string) => Promise<string[]>;
    getProject: (projectPath: string, slug: string) => Promise<Project | null>;
    updateProject: (
      projectPath: string,
      slug: string,
      updates: UpdateProjectInput
    ) => Promise<Project | null>;
    addLink: (
      projectPath: string,
      slug: string,
      label: string,
      url: string
    ) => Promise<ProjectLink>;
    removeLink: (projectPath: string, slug: string, linkId: string) => Promise<Project>;
    addStatusUpdate: (
      projectPath: string,
      slug: string,
      health: ProjectHealth,
      body: string,
      author: string
    ) => Promise<ProjectStatusUpdate>;
    removeStatusUpdate: (projectPath: string, slug: string, updateId: string) => Promise<Project>;
    listDocs: (projectPath: string, slug: string) => Promise<ProjectDocumentsFile>;
    getDoc: (projectPath: string, slug: string, docId: string) => Promise<ProjectDocument | null>;
    createDoc: (
      projectPath: string,
      slug: string,
      title: string,
      content?: string,
      author?: string
    ) => Promise<ProjectDocument>;
    updateDoc: (
      projectPath: string,
      slug: string,
      docId: string,
      updates: { title?: string; content?: string }
    ) => Promise<ProjectDocument>;
    deleteDoc: (projectPath: string, slug: string, docId: string) => Promise<void>;
    getProjectFeatures: (
      projectPath: string,
      slug: string
    ) => Promise<{ features: Feature[]; epics: Feature[] }>;
  };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ProjectPathSchema = z.object({
  projectPath: z.string().describe('Absolute path to the project directory'),
});

const ProjectSlugSchema = ProjectPathSchema.extend({
  projectSlug: z.string().describe('Project slug identifier'),
});

const ProjectOutputSchema = z.object({
  project: z.record(z.string(), z.unknown()),
});

const ProjectListOutputSchema = z.object({
  projects: z.array(z.string()),
  count: z.number(),
});

const ProjectDetailOutputSchema = z.object({
  project: z.record(z.string(), z.unknown()).nullable(),
});

const LinkOutputSchema = z.object({
  link: z.record(z.string(), z.unknown()),
});

const StatusUpdateOutputSchema = z.object({
  update: z.record(z.string(), z.unknown()),
});

const DocOutputSchema = z.object({
  doc: z.record(z.string(), z.unknown()),
});

const DocListOutputSchema = z.object({
  version: z.number(),
  docOrder: z.array(z.string()),
  docs: z.record(z.string(), z.record(z.string(), z.unknown())),
});

const FeaturesOutputSchema = z.object({
  features: z.array(z.any()),
  epics: z.array(z.any()),
  totalCount: z.number(),
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createProjectTools(deps: ProjectDeps): SharedTool[] {
  const { projectService } = deps;

  // ── project_list ──────────────────────────────────────────────────────

  const projectListTool = defineSharedTool({
    name: 'project_list',
    description: 'List all projects in the workspace.',
    inputSchema: ProjectPathSchema,
    outputSchema: ProjectListOutputSchema,
    metadata: { category: 'project', tags: ['project', 'list'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof ProjectPathSchema>;
      try {
        const projects = await projectService.listProjects(input.projectPath);
        return { success: true, data: { projects, count: projects.length } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list projects',
        };
      }
    },
  });

  // ── project_get ───────────────────────────────────────────────────────

  const projectGetTool = defineSharedTool({
    name: 'project_get',
    description: 'Get full details for a project by slug.',
    inputSchema: ProjectSlugSchema,
    outputSchema: ProjectDetailOutputSchema,
    metadata: { category: 'project', tags: ['project', 'get', 'details'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof ProjectSlugSchema>;
      try {
        const project = await projectService.getProject(input.projectPath, input.projectSlug);
        return { success: true, data: { project: project as never } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get project',
        };
      }
    },
  });

  // ── project_update ────────────────────────────────────────────────────

  const ProjectUpdateInputSchema = ProjectSlugSchema.extend({
    title: z.string().optional().describe('New title'),
    goal: z.string().optional().describe('New goal'),
    description: z.string().optional().describe('Rich-text description (HTML)'),
    lead: z.string().optional().describe('Project lead'),
    members: z.array(z.string()).optional().describe('Team members'),
    startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
    targetDate: z.string().optional().describe('Target date (YYYY-MM-DD)'),
    health: z.enum(['on-track', 'at-risk', 'off-track']).optional().describe('Health indicator'),
    priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']).optional().describe('Priority'),
    color: z.string().optional().describe('Display color (hex)'),
    status: z
      .enum([
        'researching',
        'drafting',
        'reviewing',
        'approved',
        'scaffolded',
        'active',
        'completed',
      ])
      .optional()
      .describe('Project status'),
  });

  const projectUpdateTool = defineSharedTool({
    name: 'project_update',
    description: 'Update project properties (title, goal, status, dates, health, priority, etc).',
    inputSchema: ProjectUpdateInputSchema,
    outputSchema: ProjectOutputSchema,
    metadata: { category: 'project', tags: ['project', 'update'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof ProjectUpdateInputSchema>;
      try {
        const { projectPath, projectSlug, ...updates } = input;
        const project = await projectService.updateProject(projectPath, projectSlug, updates);
        if (!project) return { success: false, error: `Project "${projectSlug}" not found` };
        return { success: true, data: { project: project as never } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update project',
        };
      }
    },
  });

  // ── project_add_link ──────────────────────────────────────────────────

  const AddLinkInputSchema = ProjectSlugSchema.extend({
    label: z.string().describe('Link label/title'),
    url: z.string().url().describe('URL'),
  });

  const projectAddLinkTool = defineSharedTool({
    name: 'project_add_link',
    description: 'Add an external link to a project.',
    inputSchema: AddLinkInputSchema,
    outputSchema: LinkOutputSchema,
    metadata: { category: 'project', tags: ['project', 'links', 'add'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof AddLinkInputSchema>;
      try {
        const link = await projectService.addLink(
          input.projectPath,
          input.projectSlug,
          input.label,
          input.url
        );
        return { success: true, data: { link: link as never } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add link',
        };
      }
    },
  });

  // ── project_remove_link ───────────────────────────────────────────────

  const RemoveLinkInputSchema = ProjectSlugSchema.extend({
    linkId: z.string().describe('Link ID to remove'),
  });

  const projectRemoveLinkTool = defineSharedTool({
    name: 'project_remove_link',
    description: 'Remove an external link from a project.',
    inputSchema: RemoveLinkInputSchema,
    outputSchema: ProjectOutputSchema,
    metadata: { category: 'project', tags: ['project', 'links', 'remove'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof RemoveLinkInputSchema>;
      try {
        const project = await projectService.removeLink(
          input.projectPath,
          input.projectSlug,
          input.linkId
        );
        return { success: true, data: { project: project as never } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to remove link',
        };
      }
    },
  });

  // ── project_add_update ────────────────────────────────────────────────

  const AddUpdateInputSchema = ProjectSlugSchema.extend({
    health: z
      .enum(['on-track', 'at-risk', 'off-track'])
      .describe('Project health at time of update'),
    body: z.string().describe('Status update body (HTML)'),
    author: z.string().describe('Author name'),
  });

  const projectAddUpdateTool = defineSharedTool({
    name: 'project_add_update',
    description: 'Post a status update to a project timeline.',
    inputSchema: AddUpdateInputSchema,
    outputSchema: StatusUpdateOutputSchema,
    metadata: { category: 'project', tags: ['project', 'updates', 'status'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof AddUpdateInputSchema>;
      try {
        const update = await projectService.addStatusUpdate(
          input.projectPath,
          input.projectSlug,
          input.health,
          input.body,
          input.author
        );
        return { success: true, data: { update: update as never } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add status update',
        };
      }
    },
  });

  // ── project_remove_update ─────────────────────────────────────────────

  const RemoveUpdateInputSchema = ProjectSlugSchema.extend({
    updateId: z.string().describe('Status update ID to remove'),
  });

  const projectRemoveUpdateTool = defineSharedTool({
    name: 'project_remove_update',
    description: 'Remove a status update from a project.',
    inputSchema: RemoveUpdateInputSchema,
    outputSchema: ProjectOutputSchema,
    metadata: { category: 'project', tags: ['project', 'updates', 'remove'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof RemoveUpdateInputSchema>;
      try {
        const project = await projectService.removeStatusUpdate(
          input.projectPath,
          input.projectSlug,
          input.updateId
        );
        return { success: true, data: { project: project as never } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to remove status update',
        };
      }
    },
  });

  // ── project_list_docs ─────────────────────────────────────────────────

  const projectListDocsTool = defineSharedTool({
    name: 'project_list_docs',
    description: 'List all documents in a project.',
    inputSchema: ProjectSlugSchema,
    outputSchema: DocListOutputSchema,
    metadata: { category: 'project-docs', tags: ['project', 'documents', 'list'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof ProjectSlugSchema>;
      try {
        const file = await projectService.listDocs(input.projectPath, input.projectSlug);
        return { success: true, data: file as never };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list docs',
        };
      }
    },
  });

  // ── project_get_doc ───────────────────────────────────────────────────

  const GetDocInputSchema = ProjectSlugSchema.extend({
    docId: z.string().describe('Document ID'),
  });

  const GetDocOutputSchema = z.object({
    doc: z.record(z.string(), z.unknown()).nullable(),
  });

  const projectGetDocTool = defineSharedTool({
    name: 'project_get_doc',
    description: 'Get a single document by ID from a project.',
    inputSchema: GetDocInputSchema,
    outputSchema: GetDocOutputSchema,
    metadata: { category: 'project-docs', tags: ['project', 'documents', 'get'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof GetDocInputSchema>;
      try {
        const doc = await projectService.getDoc(input.projectPath, input.projectSlug, input.docId);
        return { success: true, data: { doc: doc as never } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get doc',
        };
      }
    },
  });

  // ── project_create_doc ────────────────────────────────────────────────

  const CreateDocInputSchema = ProjectSlugSchema.extend({
    title: z.string().describe('Document title'),
    content: z.string().optional().describe('Initial content (HTML)'),
    author: z.string().optional().describe('Author name'),
  });

  const projectCreateDocTool = defineSharedTool({
    name: 'project_create_doc',
    description: 'Create a new document within a project.',
    inputSchema: CreateDocInputSchema,
    outputSchema: DocOutputSchema,
    metadata: { category: 'project-docs', tags: ['project', 'documents', 'create'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof CreateDocInputSchema>;
      try {
        const doc = await projectService.createDoc(
          input.projectPath,
          input.projectSlug,
          input.title,
          input.content,
          input.author
        );
        return { success: true, data: { doc: doc as never } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create doc',
        };
      }
    },
  });

  // ── project_update_doc ────────────────────────────────────────────────

  const UpdateDocInputSchema = ProjectSlugSchema.extend({
    docId: z.string().describe('Document ID'),
    title: z.string().optional().describe('New title'),
    content: z.string().optional().describe('New content (HTML)'),
  });

  const projectUpdateDocTool = defineSharedTool({
    name: 'project_update_doc',
    description: 'Update a document title or content.',
    inputSchema: UpdateDocInputSchema,
    outputSchema: DocOutputSchema,
    metadata: { category: 'project-docs', tags: ['project', 'documents', 'update'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof UpdateDocInputSchema>;
      try {
        const updates: { title?: string; content?: string } = {};
        if (input.title !== undefined) updates.title = input.title;
        if (input.content !== undefined) updates.content = input.content;
        const doc = await projectService.updateDoc(
          input.projectPath,
          input.projectSlug,
          input.docId,
          updates
        );
        return { success: true, data: { doc: doc as never } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update doc',
        };
      }
    },
  });

  // ── project_delete_doc ────────────────────────────────────────────────

  const DeleteDocInputSchema = ProjectSlugSchema.extend({
    docId: z.string().describe('Document ID to delete'),
  });

  const DeleteDocOutputSchema = z.object({
    deleted: z.boolean(),
  });

  const projectDeleteDocTool = defineSharedTool({
    name: 'project_delete_doc',
    description: 'Delete a document from a project.',
    inputSchema: DeleteDocInputSchema,
    outputSchema: DeleteDocOutputSchema,
    metadata: { category: 'project-docs', tags: ['project', 'documents', 'delete'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof DeleteDocInputSchema>;
      try {
        await projectService.deleteDoc(input.projectPath, input.projectSlug, input.docId);
        return { success: true, data: { deleted: true } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete doc',
        };
      }
    },
  });

  // ── project_list_features ─────────────────────────────────────────────

  const projectListFeaturesTool = defineSharedTool({
    name: 'project_list_features',
    description: 'List all features belonging to a project (grouped by epics).',
    inputSchema: ProjectSlugSchema,
    outputSchema: FeaturesOutputSchema,
    metadata: { category: 'project', tags: ['project', 'features', 'list'] },
    execute: async (rawInput) => {
      const input = rawInput as z.infer<typeof ProjectSlugSchema>;
      try {
        const { features, epics } = await projectService.getProjectFeatures(
          input.projectPath,
          input.projectSlug
        );
        // JSON-roundtrip to strip Symbol keys (e.g. Automerge proxies)
        // that cause z.record(z.string(), z.unknown()) output validation to fail
        const plainFeatures = JSON.parse(JSON.stringify(features));
        const plainEpics = JSON.parse(JSON.stringify(epics));
        return {
          success: true,
          data: {
            features: plainFeatures as never[],
            epics: plainEpics as never[],
            totalCount: features.length + epics.length,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list features',
        };
      }
    },
  });

  return [
    projectListTool,
    projectGetTool,
    projectUpdateTool,
    projectAddLinkTool,
    projectRemoveLinkTool,
    projectAddUpdateTool,
    projectRemoveUpdateTool,
    projectListDocsTool,
    projectGetDocTool,
    projectCreateDocTool,
    projectUpdateDocTool,
    projectDeleteDocTool,
    projectListFeaturesTool,
  ];
}
