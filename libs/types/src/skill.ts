/**
 * Skill types for self-learning skills system
 *
 * Skills are reusable prompt/action templates that can be learned
 * and improved over time. They support YAML frontmatter format
 * for easy editing and version control.
 */

/**
 * Requirements that must be satisfied for a skill to run
 */
export interface SkillRequirements {
  /** Required binary executables (e.g., ['git', 'npm']) */
  bins?: string[];
  /** Required files that must exist (e.g., ['package.json', 'tsconfig.json']) */
  files?: string[];
  /** Required environment variables (e.g., ['ANTHROPIC_API_KEY']) */
  env?: string[];
}

/**
 * Metadata about a skill for tracking and analytics
 */
export interface SkillMetadata {
  /** Author of the skill */
  author?: string;
  /** ISO date string when the skill was created */
  created: string;
  /** ISO date string when the skill was last updated */
  updated?: string;
  /** Number of times this skill has been used */
  usageCount: number;
  /** Success rate as a decimal (0.0 - 1.0) */
  successRate: number;
  /** Version of the skill (semver or incrementing number) */
  version?: string;
  /** Tags for categorization and discovery */
  tags?: string[];
  /** Source of the skill (learned, imported, built-in) */
  source?: 'learned' | 'imported' | 'built-in';
}

/**
 * A skill definition that can be executed by agents
 *
 * Skills are stored as markdown files with YAML frontmatter:
 *
 * ```markdown
 * ---
 * name: commit
 * emoji: 📝
 * description: Create a git commit with a descriptive message
 * requires:
 *   bins: [git]
 *   files: [.git]
 * metadata:
 *   author: automaker
 *   created: 2026-01-15T00:00:00Z
 *   usageCount: 42
 *   successRate: 0.95
 * ---
 *
 * # Commit Skill
 *
 * Your task is to create a git commit...
 * ```
 */
export interface Skill {
  /** Unique identifier for the skill (typically kebab-case) */
  name: string;
  /** Optional emoji for visual identification */
  emoji?: string;
  /** Human-readable description of what the skill does */
  description: string;
  /** Requirements that must be satisfied to run this skill */
  requires?: SkillRequirements;
  /** The actual skill content/prompt (markdown body after frontmatter) */
  content: string;
  /** Tracking and analytics metadata */
  metadata: SkillMetadata;
}

/**
 * Parsed YAML frontmatter from a skill file
 * This represents what's extracted from the YAML block
 */
export interface SkillFrontmatter {
  name: string;
  emoji?: string;
  description: string;
  requires?: SkillRequirements;
  metadata?: Partial<SkillMetadata>;
}

/**
 * Options for creating a new skill
 */
export interface CreateSkillOptions {
  name: string;
  emoji?: string;
  description: string;
  content: string;
  requires?: SkillRequirements;
  author?: string;
  tags?: string[];
  source?: 'learned' | 'imported' | 'built-in';
}

/**
 * Options for updating an existing skill
 */
export interface UpdateSkillOptions {
  emoji?: string;
  description?: string;
  content?: string;
  requires?: SkillRequirements;
  tags?: string[];
}

/**
 * Result of executing a skill
 */
export interface SkillExecutionResult {
  /** Whether the skill execution succeeded */
  success: boolean;
  /** Output from the skill execution */
  output?: string;
  /** Error message if execution failed */
  error?: string;
  /** Duration of execution in milliseconds */
  durationMs?: number;
}
