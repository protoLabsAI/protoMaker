/**
 * Project Orchestration Paths - Utilities for managing project planning data
 *
 * Provides functions to construct paths for:
 * - Project-level data stored in {projectPath}/.automaker/projects/
 * - Milestone directories within projects
 * - Phase files that become features
 *
 * Directory structure:
 * .automaker/
 * └── projects/
 *     └── {project-slug}/
 *         ├── project.md           # Project overview, goals
 *         ├── research.md          # Deep research results
 *         ├── prd.md               # SPARC PRD document
 *         └── milestones/
 *             ├── 01-foundation/
 *             │   ├── milestone.md # Milestone overview
 *             │   ├── phase-01-types.md
 *             │   └── phase-02-server.md
 *             └── 02-polish/
 *                 ├── milestone.md
 *                 └── phase-01-testing.md
 */

import path from 'path';
import * as secureFs from './secure-fs.js';
import { getAutomakerDir } from './paths.js';

/**
 * Regex for valid slug characters: letters, numbers, hyphens, underscores
 * Slugs must start with alphanumeric character
 */
const VALID_SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

/**
 * Error thrown when a slug contains invalid characters or path traversal sequences
 */
export class InvalidSlugError extends Error {
  constructor(
    public slug: string,
    public context: string
  ) {
    super(
      `Invalid slug "${slug}" in ${context}: contains invalid characters or path traversal sequences`
    );
    this.name = 'InvalidSlugError';
  }
}

/**
 * Validates a slug to prevent path traversal attacks
 * @param slug - The slug to validate
 * @param context - Context for error messages (e.g., "projectSlug", "milestoneSlug")
 * @throws InvalidSlugError if slug contains invalid characters
 */
export function validateSlugInput(slug: string, context: string): void {
  if (!slug || typeof slug !== 'string') {
    throw new InvalidSlugError(slug ?? '', context);
  }

  // Check for path traversal sequences
  if (slug.includes('..') || slug.includes('/') || slug.includes('\\')) {
    throw new InvalidSlugError(slug, context);
  }

  // Check against allowed pattern
  if (!VALID_SLUG_PATTERN.test(slug)) {
    throw new InvalidSlugError(slug, context);
  }
}

/**
 * Get the projects directory for a project
 *
 * Contains subdirectories for each project plan.
 *
 * @param projectPath - Absolute path to project directory
 * @returns Absolute path to {projectPath}/.automaker/projects
 */
export function getProjectsDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), 'projects');
}

/**
 * Get the directory for a specific project plan
 *
 * @param projectPath - Absolute path to project directory
 * @param projectSlug - Project slug (e.g., "epic-support")
 * @returns Absolute path to {projectPath}/.automaker/projects/{projectSlug}
 * @throws InvalidSlugError if projectSlug contains invalid characters
 */
export function getProjectDir(projectPath: string, projectSlug: string): string {
  validateSlugInput(projectSlug, 'projectSlug');
  return path.join(getProjectsDir(projectPath), projectSlug);
}

/**
 * Get the project overview file path
 *
 * @param projectPath - Absolute path to project directory
 * @param projectSlug - Project slug
 * @returns Absolute path to {projectPath}/.automaker/projects/{projectSlug}/project.md
 */
export function getProjectFilePath(projectPath: string, projectSlug: string): string {
  return path.join(getProjectDir(projectPath, projectSlug), 'project.md');
}

/**
 * Get the project JSON metadata file path
 *
 * @param projectPath - Absolute path to project directory
 * @param projectSlug - Project slug
 * @returns Absolute path to {projectPath}/.automaker/projects/{projectSlug}/project.json
 */
export function getProjectJsonPath(projectPath: string, projectSlug: string): string {
  return path.join(getProjectDir(projectPath, projectSlug), 'project.json');
}

/**
 * Get the project documents file path
 *
 * @param projectPath - Absolute path to project directory
 * @param projectSlug - Project slug
 * @returns Absolute path to {projectPath}/.automaker/projects/{projectSlug}/docs.json
 */
export function getProjectDocsPath(projectPath: string, projectSlug: string): string {
  return path.join(getProjectDir(projectPath, projectSlug), 'docs.json');
}

/**
 * Get the deep research results file path
 *
 * @param projectPath - Absolute path to project directory
 * @param projectSlug - Project slug
 * @returns Absolute path to {projectPath}/.automaker/projects/{projectSlug}/research.md
 */
export function getResearchFilePath(projectPath: string, projectSlug: string): string {
  return path.join(getProjectDir(projectPath, projectSlug), 'research.md');
}

/**
 * Get the SPARC PRD file path
 *
 * @param projectPath - Absolute path to project directory
 * @param projectSlug - Project slug
 * @returns Absolute path to {projectPath}/.automaker/projects/{projectSlug}/prd.md
 */
export function getPrdFilePath(projectPath: string, projectSlug: string): string {
  return path.join(getProjectDir(projectPath, projectSlug), 'prd.md');
}

/**
 * Get the milestones directory for a project
 *
 * @param projectPath - Absolute path to project directory
 * @param projectSlug - Project slug
 * @returns Absolute path to {projectPath}/.automaker/projects/{projectSlug}/milestones
 */
export function getMilestonesDir(projectPath: string, projectSlug: string): string {
  return path.join(getProjectDir(projectPath, projectSlug), 'milestones');
}

/**
 * Get the directory for a specific milestone
 *
 * @param projectPath - Absolute path to project directory
 * @param projectSlug - Project slug
 * @param milestoneSlug - Milestone slug (e.g., "01-foundation")
 * @returns Absolute path to {projectPath}/.automaker/projects/{projectSlug}/milestones/{milestoneSlug}
 * @throws InvalidSlugError if milestoneSlug contains invalid characters
 */
export function getMilestoneDir(
  projectPath: string,
  projectSlug: string,
  milestoneSlug: string
): string {
  validateSlugInput(milestoneSlug, 'milestoneSlug');
  return path.join(getMilestonesDir(projectPath, projectSlug), milestoneSlug);
}

/**
 * Get the milestone overview file path
 *
 * @param projectPath - Absolute path to project directory
 * @param projectSlug - Project slug
 * @param milestoneSlug - Milestone slug
 * @returns Absolute path to milestone.md
 */
export function getMilestoneFilePath(
  projectPath: string,
  projectSlug: string,
  milestoneSlug: string
): string {
  return path.join(getMilestoneDir(projectPath, projectSlug, milestoneSlug), 'milestone.md');
}

/**
 * Get the phase file path
 *
 * @param projectPath - Absolute path to project directory
 * @param projectSlug - Project slug
 * @param milestoneSlug - Milestone slug
 * @param phaseNumber - Phase number (1, 2, 3, etc.) - must be positive integer
 * @param phaseName - Phase name slug (e.g., "types", "server")
 * @returns Absolute path to phase-XX-name.md
 * @throws InvalidSlugError if phaseName contains invalid characters
 * @throws Error if phaseNumber is not a positive integer
 */
export function getPhaseFilePath(
  projectPath: string,
  projectSlug: string,
  milestoneSlug: string,
  phaseNumber: number,
  phaseName: string
): string {
  // Validate phase number
  if (!Number.isInteger(phaseNumber) || phaseNumber < 1 || phaseNumber > 99) {
    throw new Error(`Invalid phase number: ${phaseNumber} (must be integer 1-99)`);
  }
  // Validate phase name slug
  validateSlugInput(phaseName, 'phaseName');

  const paddedNumber = String(phaseNumber).padStart(2, '0');
  return path.join(
    getMilestoneDir(projectPath, projectSlug, milestoneSlug),
    `phase-${paddedNumber}-${phaseName}.md`
  );
}

/**
 * Generate a milestone slug from number and title
 *
 * @param number - Milestone number
 * @param title - Milestone title
 * @returns Slug like "01-foundation"
 */
export function generateMilestoneSlug(number: number, title: string): string {
  const paddedNumber = String(number).padStart(2, '0');
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${paddedNumber}-${slug}`;
}

/**
 * Generate a project slug from title
 *
 * @param title - Project title
 * @returns Slug like "epic-support"
 */
export function generateProjectSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate a phase name slug from title
 *
 * @param title - Phase title
 * @returns Slug like "types" or "server"
 */
export function generatePhaseSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Create the projects directory structure for a project if it doesn't exist
 *
 * @param projectPath - Absolute path to project directory
 * @returns Promise resolving to the created projects directory path
 */
export async function ensureProjectsDir(projectPath: string): Promise<string> {
  const projectsDir = getProjectsDir(projectPath);
  await secureFs.mkdir(projectsDir, { recursive: true });
  return projectsDir;
}

/**
 * Create the full directory structure for a project plan
 *
 * Creates:
 * - {projectPath}/.automaker/projects/{projectSlug}/
 * - {projectPath}/.automaker/projects/{projectSlug}/milestones/
 *
 * @param projectPath - Absolute path to project directory
 * @param projectSlug - Project slug
 * @returns Promise resolving to the created project directory path
 */
export async function ensureProjectStructure(
  projectPath: string,
  projectSlug: string
): Promise<string> {
  const projectDir = getProjectDir(projectPath, projectSlug);
  const milestonesDir = getMilestonesDir(projectPath, projectSlug);

  await secureFs.mkdir(projectDir, { recursive: true });
  await secureFs.mkdir(milestonesDir, { recursive: true });

  return projectDir;
}

/**
 * Create the directory structure for a milestone
 *
 * @param projectPath - Absolute path to project directory
 * @param projectSlug - Project slug
 * @param milestoneSlug - Milestone slug
 * @returns Promise resolving to the created milestone directory path
 */
export async function ensureMilestoneDir(
  projectPath: string,
  projectSlug: string,
  milestoneSlug: string
): Promise<string> {
  const milestoneDir = getMilestoneDir(projectPath, projectSlug, milestoneSlug);
  await secureFs.mkdir(milestoneDir, { recursive: true });
  return milestoneDir;
}

/**
 * List all project plans in a project
 *
 * @param projectPath - Absolute path to project directory
 * @returns Promise resolving to array of project slugs (sorted alphabetically for deterministic order)
 */
export async function listProjectPlans(projectPath: string): Promise<string[]> {
  const projectsDir = getProjectsDir(projectPath);

  try {
    await secureFs.access(projectsDir);
  } catch {
    return [];
  }

  const entries = (await secureFs.readdir(projectsDir, { withFileTypes: true })) as any[];
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b)); // Sort for deterministic output
}

/**
 * List all milestones in a project plan
 *
 * @param projectPath - Absolute path to project directory
 * @param projectSlug - Project slug
 * @returns Promise resolving to array of milestone slugs (sorted by number)
 */
export async function listMilestones(projectPath: string, projectSlug: string): Promise<string[]> {
  const milestonesDir = getMilestonesDir(projectPath, projectSlug);

  try {
    await secureFs.access(milestonesDir);
  } catch {
    return [];
  }

  const entries = (await secureFs.readdir(milestonesDir, { withFileTypes: true })) as any[];
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(); // Sorting alphabetically works because of XX- prefix
}

/**
 * List all phase files in a milestone
 *
 * @param projectPath - Absolute path to project directory
 * @param projectSlug - Project slug
 * @param milestoneSlug - Milestone slug
 * @returns Promise resolving to array of phase file names (sorted by number)
 */
export async function listPhases(
  projectPath: string,
  projectSlug: string,
  milestoneSlug: string
): Promise<string[]> {
  const milestoneDir = getMilestoneDir(projectPath, projectSlug, milestoneSlug);

  try {
    await secureFs.access(milestoneDir);
  } catch {
    return [];
  }

  const entries = (await secureFs.readdir(milestoneDir, { withFileTypes: true })) as any[];
  return entries
    .filter(
      (entry) => entry.isFile() && entry.name.startsWith('phase-') && entry.name.endsWith('.md')
    )
    .map((entry) => entry.name)
    .sort();
}

/**
 * Check if a project plan exists
 *
 * @param projectPath - Absolute path to project directory
 * @param projectSlug - Project slug
 * @returns Promise resolving to true if project exists
 */
export async function projectPlanExists(
  projectPath: string,
  projectSlug: string
): Promise<boolean> {
  const projectDir = getProjectDir(projectPath, projectSlug);
  try {
    await secureFs.access(projectDir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a project plan and all its contents
 *
 * @param projectPath - Absolute path to project directory
 * @param projectSlug - Project slug
 * @returns Promise resolving to true if deleted successfully
 */
export async function deleteProjectPlan(
  projectPath: string,
  projectSlug: string
): Promise<boolean> {
  const projectDir = getProjectDir(projectPath, projectSlug);
  try {
    await secureFs.rm(projectDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
