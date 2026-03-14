/**
 * Template System Types
 *
 * Pure data types for starter kit templates and project scaffolding.
 */

/**
 * Starter kit type determines which features and coding rules to include.
 */
export type StarterKitType = 'docs' | 'extension' | 'general';

/**
 * Coding rules type determines which language/framework rules to include.
 */
export type CodingRulesType = 'docs' | 'extension' | 'typescript' | 'react';

/**
 * A pre-written feature description for a starter kit.
 * Does not include IDs — the board generates those at creation time.
 */
export interface StarterFeature {
  title: string;
  description: string;
  complexity: 'small' | 'medium' | 'large';
}

/**
 * A persistent project template (e.g., Bugs, System Improvements).
 */
export interface ProjectTemplate {
  slug: string;
  title: string;
  goal: string;
  type: 'ongoing';
  status: 'drafting';
  priority?: string;
  color?: string;
  milestones: [];
}

/**
 * Default settings shape for .automaker/settings.json.
 */
export interface DefaultSettings {
  version: 1;
  worktreePanelVisible: boolean;
}

/**
 * CLAUDE.md builder options.
 */
export interface ClaudeMdOptions {
  projectName: string;
}

/**
 * Welcome note builder options.
 */
export interface WelcomeNoteOptions {
  projectName: string;
}
