/**
 * Core types for the prompts package.
 *
 * Designed to be framework-agnostic — no imports from @protolabsai or any
 * application-specific package.
 */

/**
 * Names for the sections a prompt can include.
 *
 * Lower priority numbers appear earlier in the assembled prompt.
 */
export enum SectionName {
  ENVIRONMENT = 'ENVIRONMENT',
  ROLE = 'ROLE',
  TASK = 'TASK',
  CONTEXT = 'CONTEXT',
  TOOLS = 'TOOLS',
  CODING_STANDARDS = 'CODING_STANDARDS',
  TESTING = 'TESTING',
  COMMIT_RULES = 'COMMIT_RULES',
  COMMUNICATION = 'COMMUNICATION',
  CUSTOM = 'CUSTOM',
}

/**
 * Options controlling how a section is rendered in the final prompt.
 */
export interface SectionOptions {
  /** Lower priority numbers appear first. Default: 100 */
  priority?: number;
  /**
   * Phase(s) this section applies to.
   * If omitted, the section is included in all phases.
   */
  phase?: string | string[];
  /**
   * Evaluated at build time. Section is excluded when this returns false.
   */
  conditional?: () => boolean;
}

/**
 * A single section in a prompt.
 */
export interface PromptSection {
  name: SectionName | string;
  content: string;
  options: Required<Pick<SectionOptions, 'priority'>> & Omit<SectionOptions, 'priority'>;
}

/**
 * YAML frontmatter parsed from a prompt markdown file.
 */
export interface PromptFrontmatter {
  /** Human-readable name for the prompt. */
  name: string;
  /** The role or persona this prompt is designed for. */
  role: string;
  /** Semver-style version string (e.g. "1.0.0"). */
  version: string;
  /** Optional description. */
  description?: string;
  /** Variable names that must be provided to the template at render time. */
  variables?: string[];
}

/**
 * A fully parsed prompt file.
 */
export interface ParsedPrompt {
  frontmatter: PromptFrontmatter;
  /** Raw markdown body (after frontmatter). */
  body: string;
  /** Absolute path to the source file. */
  filePath: string;
}

/**
 * A registered prompt entry in the PromptRegistry.
 */
export interface PromptEntry {
  /** The role key used for lookup (matches frontmatter.role). */
  role: string;
  /** Human-readable name. */
  name: string;
  /** Version string. */
  version: string;
  /** The raw template string, potentially containing {{variable}} placeholders. */
  template: string;
  /** Variable names expected by the template. */
  variables: string[];
  /** Optional metadata. */
  metadata?: Record<string, unknown>;
}
