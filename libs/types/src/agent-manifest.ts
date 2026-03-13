/**
 * Agent manifest types for project-defined custom agents
 *
 * Allows projects to declare their own agents that extend built-in roles,
 * override defaults, and define match rules for automatic assignment.
 */

import type { RoleCapabilities } from './agent-roles.js';

/**
 * Rules for automatically matching a ProjectAgent to incoming work.
 */
export interface AgentMatchRules {
  /** Feature/issue categories that trigger this agent (e.g., "frontend", "infra") */
  categories: string[];

  /** Keywords in titles/descriptions that trigger this agent */
  keywords: string[];

  /** Glob patterns for files this agent specializes in */
  filePatterns: string[];
}

/**
 * A project-defined agent that extends a built-in role with custom configuration.
 */
export interface ProjectAgent {
  /** Unique name for this agent within the project (e.g., "react-specialist") */
  name: string;

  /** Built-in role this agent extends (e.g., "frontend-engineer") */
  extends: string;

  /** Human-readable description of this agent's purpose */
  description: string;

  /** Model override for this agent (falls back to role default if omitted) */
  model?: string;

  /** Path to a custom prompt file for this agent (relative to project root) */
  promptFile?: string;

  /** Partial capabilities override — merged on top of the base role's capabilities */
  capabilities?: Partial<Omit<RoleCapabilities, 'role'>>;

  /** Rules for automatically matching this agent to work items */
  match?: AgentMatchRules;

  /**
   * True when this entry represents a built-in role (synthetic, not from the project manifest).
   * Set by the API layer; never present in user-authored agent manifests.
   */
  _builtIn?: boolean;
}

/**
 * Project-level agent manifest (typically stored as .automaker/agents.yaml or similar).
 */
export interface AgentManifest {
  /** Schema version for forward-compatibility */
  version: string;

  /** Project-defined agents */
  agents: ProjectAgent[];
}

/**
 * Sensible defaults for a new ProjectAgent entry.
 */
export const DEFAULT_PROJECT_AGENT: Omit<ProjectAgent, 'name' | 'extends'> = {
  description: '',
  match: {
    categories: [],
    keywords: [],
    filePatterns: [],
  },
};
