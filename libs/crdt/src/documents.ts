/**
 * CRDT Document Schemas for protoLabs Studio
 *
 * Defines Automerge document types for each sync domain.
 * Documents use JSON-serialized payloads for complex nested types
 * to ensure safe merging semantics across concurrent edits.
 */

import type { Project } from '@protolabsai/types';

/**
 * The Automerge document schema for the projects domain.
 * Keyed by project slug, each value is a JSON-serialized Project.
 * Using string payloads preserves complex nested types while still
 * benefiting from CRDT last-write-wins semantics on project-level updates.
 */
export interface ProjectsDoc {
  /** Schema version for forward compatibility */
  version: number;
  /** Projects map: slug -> JSON-serialized Project */
  projects: Record<string, string>;
}

/**
 * Create a fresh empty ProjectsDoc for initializing a new Automerge document.
 */
export function createProjectsDoc(): ProjectsDoc {
  return {
    version: 1,
    projects: {},
  };
}

/**
 * Serialize a Project to its document representation.
 */
export function serializeProject(project: Project): string {
  return JSON.stringify(project);
}

/**
 * Deserialize a Project from its document representation.
 * Returns null if the data is missing or malformed.
 */
export function deserializeProject(data: string | undefined): Project | null {
  if (!data) return null;
  try {
    return JSON.parse(data) as Project;
  } catch {
    return null;
  }
}

/**
 * Extract all projects from a ProjectsDoc.
 */
export function extractProjects(doc: ProjectsDoc): Record<string, Project> {
  const result: Record<string, Project> = {};
  for (const [slug, data] of Object.entries(doc.projects)) {
    const project = deserializeProject(data);
    if (project) {
      result[slug] = project;
    }
  }
  return result;
}
