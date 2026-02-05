/**
 * Feature types for AutoMaker feature management
 */

import type { PlanningMode, ThinkingLevel, GitWorkflowSettings } from './settings.js';
import type { ReasoningEffort } from './provider.js';
import type { FeatureRalphConfig } from './ralph.js';

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
  status?: FeatureStatus | string; // Allow string for extensibility
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
  error?: string;
  summary?: string;
  startedAt?: string;
  descriptionHistory?: DescriptionHistoryEntry[]; // History of description changes
  // Ralph mode - persistent retry loops with external verification
  ralphConfig?: FeatureRalphConfig;
  /** Override global git workflow settings for this specific feature */
  /** Per-feature git workflow settings (overrides global settings) */
  gitWorkflow?: Partial<GitWorkflowSettings>;
  /**
   * Feature complexity level - affects model selection
   * - small: Quick fixes, trivial changes (haiku)
   * - medium: Standard features (sonnet) - default
   * - large: Complex multi-file features (sonnet)
   * - architectural: Core infrastructure, key architecture decisions (opus)
   */
  complexity?: 'small' | 'medium' | 'large' | 'architectural';
  /**
   * Number of times this feature has failed and been retried.
   * Used for model escalation - after multiple failures, escalate to opus.
   */
  failureCount?: number;
  /**
   * Discord channel ID for feature-specific communication
   * When present, a Discord icon will be shown on the feature card
   */
  discordChannelId?: string;
  /**
   * Discord channel name for display purposes
   * Used in tooltips when hovering over the Discord icon
   */
  discordChannelName?: string;
  [key: string]: unknown; // Keep catch-all for extensibility
}

export type FeatureStatus =
  | 'pending' // Initial state, not yet started
  | 'backlog' // Queued for auto-mode
  | 'ready' // Ready to be picked up
  | 'running' // Currently being executed by agent
  | 'completed' // Agent finished successfully
  | 'failed' // Agent execution failed
  | 'verified' // Manually verified by user
  | 'waiting_approval' // Agent completed, waiting for user review
  | 'review' // PR created, under review
  | 'done'; // PR merged, final state
