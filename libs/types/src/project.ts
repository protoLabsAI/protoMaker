/**
 * Project Orchestration Types
 *
 * Types for the project planning and execution pipeline:
 * Deep Research → SPARC PRD → Review → Approval → Project Structure → Feature Creation
 */

/**
 * Complexity level for phases
 */
export type PhaseComplexity = 'small' | 'medium' | 'large';

/**
 * Status of a project in the orchestration pipeline
 */
export type ProjectStatus =
  | 'researching' // Deep research in progress
  | 'drafting' // PRD being created
  | 'reviewing' // PRD under review
  | 'approved' // PRD approved, ready to scaffold
  | 'scaffolded' // Project structure created
  | 'active' // Features created, work in progress
  | 'completed'; // All features done

/**
 * Status of a milestone
 */
export type MilestoneStatus =
  | 'stub'
  | 'planning'
  | 'planned'
  | 'pending'
  | 'in-progress'
  | 'completed';

/**
 * A phase within a milestone - becomes a Feature when scaffolded
 */
export interface Phase {
  /** Phase number within milestone (e.g., 1, 2, 3) */
  number: number;

  /** Phase name/slug (e.g., "types", "server", "ui") */
  name: string;

  /** Human-readable title (e.g., "Core Type Definitions") */
  title: string;

  /** Detailed description of what needs to be done */
  description: string;

  /** Files that should be modified */
  filesToModify?: string[];

  /** Acceptance criteria as checklist items */
  acceptanceCriteria?: string[];

  /** Estimated complexity */
  complexity?: PhaseComplexity;

  /** Phase dependencies (phase names within same milestone) */
  dependencies?: string[];

  /** Feature ID after scaffolding (links phase to created feature) */
  featureId?: string;
}

/**
 * A milestone groups related phases together
 */
export interface Milestone {
  /** Milestone number (e.g., 1, 2, 3) */
  number: number;

  /** Milestone slug (e.g., "foundation", "ui-components") */
  slug: string;

  /** Human-readable title */
  title: string;

  /** Description of this milestone's goals */
  description: string;

  /** Phases within this milestone */
  phases: Phase[];

  /** Milestone dependencies (other milestone slugs) */
  dependencies?: string[];

  /** Current status */
  status: MilestoneStatus;

  /** Epic feature ID after scaffolding (milestone becomes an epic) */
  epicId?: string;
}

/**
 * A project represents the top-level planning unit
 */
export interface Project {
  /** Project slug (e.g., "epic-support", "user-auth") */
  slug: string;

  /** Human-readable title */
  title: string;

  /** High-level goal/description */
  goal: string;

  /** Current status in the orchestration pipeline */
  status: ProjectStatus;

  /** Milestones within this project */
  milestones: Milestone[];

  /** Research summary (from deep research agent) */
  researchSummary?: string;

  /** SPARC PRD content */
  prd?: SPARCPrd;

  /** Review comments */
  reviewComments?: PRDReviewComment[];

  /** Linear project ID (set when synced to Linear) */
  linearProjectId?: string;

  /** Linear project URL */
  linearProjectUrl?: string;

  /** Creation timestamp */
  createdAt: string;

  /** Last update timestamp */
  updatedAt: string;
}

/**
 * SPARC PRD structure
 * S - Situation
 * P - Problem
 * A - Approach
 * R - Results
 * C - Constraints
 */
export interface SPARCPrd {
  /** Current state, context, background */
  situation: string;

  /** Specific issues to solve */
  problem: string;

  /** Proposed solution and implementation approach */
  approach: string;

  /** Expected outcomes and success metrics */
  results: string;

  /** Limitations, requirements, constraints */
  constraints: string;

  /** Generated timestamp */
  generatedAt: string;

  /** Approved timestamp (if approved) */
  approvedAt?: string;
}

/**
 * PRD review comment
 */
export interface PRDReviewComment {
  /** Comment type */
  type: 'approval' | 'change-requested' | 'question' | 'suggestion';

  /** Section being commented on */
  section?: 'situation' | 'problem' | 'approach' | 'results' | 'constraints' | 'general';

  /** Comment content */
  content: string;

  /** Author (agent name or 'user') */
  author: string;

  /** Timestamp */
  timestamp: string;

  /** Whether this has been addressed */
  resolved?: boolean;
}

/**
 * Result from deep research agent
 */
export interface DeepResearchResult {
  /** Topic that was researched */
  topic: string;

  /** Relevant files identified in the codebase */
  relevantFiles: Array<{
    path: string;
    reason: string;
    patterns?: string[];
  }>;

  /** Existing patterns documented */
  existingPatterns: Array<{
    name: string;
    description: string;
    examples?: string[];
  }>;

  /** Constraints and gotchas noted */
  constraints: Array<{
    description: string;
    severity: 'info' | 'warning' | 'critical';
  }>;

  /** Recommended approach areas */
  recommendations: string[];

  /** Summary for PRD creation */
  summary: string;

  /** Timestamp */
  generatedAt: string;
}

/**
 * Options for creating a project from PRD
 */
export interface CreateProjectFromPRDOptions {
  /** Project slug */
  slug: string;

  /** PRD content */
  prd: SPARCPrd;

  /** Milestones to create */
  milestones: Array<{
    title: string;
    description: string;
    phases: Array<{
      title: string;
      description: string;
      filesToModify?: string[];
      acceptanceCriteria?: string[];
      complexity?: PhaseComplexity;
      dependencies?: string[];
    }>;
    dependencies?: string[];
  }>;

  /** Optional research summary */
  researchSummary?: string;
}

/**
 * Options for creating features from a project
 */
export interface CreateFeaturesFromProjectOptions {
  /** Project path */
  projectPath: string;

  /** Project slug */
  projectSlug: string;

  /** Whether to create epic features for milestones */
  createEpics?: boolean;

  /** Whether to set up dependencies between features */
  setupDependencies?: boolean;

  /** Initial status for created features */
  initialStatus?: 'backlog' | 'in-progress';
}

/**
 * Result from feature factory
 */
export interface FeatureFactoryResult {
  /** Number of features created */
  featuresCreated: number;

  /** Created feature IDs mapped to phases */
  phaseFeatureMap: Record<string, string>; // phase slug -> feature ID

  /** Created epic IDs mapped to milestones */
  milestoneEpicMap: Record<string, string>; // milestone slug -> epic feature ID

  /** Any errors encountered */
  errors?: string[];
}

/**
 * Input for creating a new project
 */
export interface CreateProjectInput {
  /** Project slug */
  slug: string;

  /** Human-readable title */
  title: string;

  /** High-level goal/description */
  goal: string;

  /** Optional initial milestones */
  milestones?: Array<{
    title: string;
    description: string;
    phases?: Array<{
      title: string;
      description: string;
      filesToModify?: string[];
      acceptanceCriteria?: string[];
      complexity?: PhaseComplexity;
      dependencies?: string[];
    }>;
    dependencies?: string[];
  }>;

  /** Optional SPARC PRD */
  prd?: SPARCPrd;

  /** Optional research summary */
  researchSummary?: string;
}

/**
 * Input for updating an existing project
 */
export interface UpdateProjectInput {
  /** Update title */
  title?: string;

  /** Update goal */
  goal?: string;

  /** Update status */
  status?: ProjectStatus;

  /** Update PRD */
  prd?: SPARCPrd;

  /** Update research summary */
  researchSummary?: string;

  /** Add review comments */
  reviewComments?: PRDReviewComment[];

  /** Linear project ID (set when synced to Linear) */
  linearProjectId?: string;

  /** Linear project URL */
  linearProjectUrl?: string;
}

/**
 * Result from creating features from a project
 */
export interface CreateFeaturesResult {
  /** Number of features created */
  featuresCreated: number;

  /** Number of epics created */
  epicsCreated: number;

  /** Created feature IDs */
  featureIds: string[];

  /** Created epic IDs */
  epicIds: string[];

  /** Any errors encountered */
  errors?: string[];
}

/**
 * Discord channel mapping for a project
 * Stores the association between a project and its Discord channels
 */
export interface DiscordChannelMapping {
  /** Project slug */
  projectSlug: string;

  /** Category ID where project channels are organized */
  categoryId?: string;

  /** Category name */
  categoryName?: string;

  /** Channels created for this project */
  channels: Array<{
    /** Channel ID */
    id: string;
    /** Channel name */
    name: string;
    /** Channel purpose/description */
    purpose?: string;
  }>;

  /** Timestamp when channels were created */
  createdAt: string;
}
