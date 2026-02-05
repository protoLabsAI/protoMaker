/**
 * Feature types for AutoMaker feature management
 */

import type { PlanningMode, ThinkingLevel } from './settings.js';
import type { ReasoningEffort } from './provider.js';

/**
 * A single entry in the description history
 */
export interface DescriptionHistoryEntry {
  description: string;
  timestamp: string; // ISO date string
  source: 'initial' | 'enhance' | 'edit'; // What triggered this version
  enhancementMode?: 'improve' | 'technical' | 'simplify' | 'acceptance' | 'ux-reviewer'; // Only for 'enhance' source
}

export interface FeatureImagePath {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  [key: string]: unknown;
}

export interface FeatureTextFilePath {
  id: string;
  path: string;
  filename: string;
  mimeType: string;
  content: string; // Text content of the file
  [key: string]: unknown;
}

export interface Feature {
  id: string;
  title?: string;
  titleGenerating?: boolean;
  category: string;
  description: string;
  passes?: boolean;
  priority?: number;
  status?: string;
  dependencies?: string[];
  spec?: string;
  model?: string;
  imagePaths?: Array<string | FeatureImagePath | { path: string; [key: string]: unknown }>;
  textFilePaths?: FeatureTextFilePath[];
  // Branch info - worktree path is derived at runtime from branchName
  branchName?: string; // Name of the feature branch (undefined = use current worktree)
  // Epic support - hierarchical grouping
  isEpic?: boolean; // True if this feature is an epic (container for child features)
  epicId?: string; // ID of parent epic (if this feature belongs to an epic)
  epicColor?: string; // Color for epic badge display (hex color)
  skipTests?: boolean;
  thinkingLevel?: ThinkingLevel;
  reasoningEffort?: ReasoningEffort;
  planningMode?: PlanningMode;
  requirePlanApproval?: boolean;
  planSpec?: {
    status: 'pending' | 'generating' | 'generated' | 'approved' | 'rejected';
    content?: string;
    version: number;
    generatedAt?: string;
    approvedAt?: string;
    reviewedByUser: boolean;
    tasksCompleted?: number;
    tasksTotal?: number;
  };
  /** Ralph Mode configuration for iterative agent execution */
  ralphMode?: RalphModeConfig;
  error?: string;
  summary?: string;
  startedAt?: string;
  descriptionHistory?: DescriptionHistoryEntry[]; // History of description changes
  [key: string]: unknown; // Keep catch-all for extensibility
}

export type FeatureStatus = 'pending' | 'running' | 'completed' | 'failed' | 'verified';

/**
 * Ralph Mode - Iterative agent execution with completion criteria
 */

/**
 * Completion criterion types for Ralph Mode
 * Determines when iterative execution should stop
 */
export type CompletionCriterion =
  | { type: 'maxIterations' } // Stop after maxIterations reached
  | { type: 'testsPass'; testCommand?: string } // Stop when tests pass
  | { type: 'buildSucceeds'; buildCommand?: string } // Stop when build succeeds
  | { type: 'fileExists'; filePath: string } // Stop when file exists
  | { type: 'fileContains'; filePath: string; pattern: string } // Stop when file contains pattern
  | { type: 'noErrors' } // Stop when no errors in agent output
  | { type: 'custom'; script: string }; // Stop when custom script returns 0

/**
 * Configuration for Ralph Mode - iterative agent execution
 */
export interface RalphModeConfig {
  /** Whether Ralph Mode is enabled for this feature */
  enabled: boolean;
  /** Maximum number of iterations before stopping (default: 5) */
  maxIterations: number;
  /** Criteria that determine when iteration should stop */
  completionCriteria: CompletionCriterion[];
  /** Delay in milliseconds between iterations (default: 1000) */
  iterationDelay?: number;
  /** Whether to preserve conversation context between iterations (default: true) */
  preserveContext?: boolean;
  /** Path to file for tracking iteration progress */
  progressFile?: string;
}
