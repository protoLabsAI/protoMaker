/**
 * Agent role system for autonomous AI development team
 *
 * Defines agent roles, instances, and their configurations for the headsdown pattern.
 */

/**
 * Agent role types
 *
 * Each role has specific responsibilities in the development lifecycle:
 * - product-manager: PRD creation, project orchestration, user communication
 * - engineering-manager: Feature breakdown, assignment, PR management, releases
 * - frontend-engineer: React, UI/UX implementation
 * - backend-engineer: API, database, services implementation
 * - devops-engineer: CI/CD, infrastructure, deployment
 * - qa-engineer: Testing, PR review, quality assurance
 * - docs-engineer: Documentation, changelog generation
 */
export type AgentRole =
  | 'product-manager'
  | 'engineering-manager'
  | 'frontend-engineer'
  | 'backend-engineer'
  | 'devops-engineer'
  | 'qa-engineer'
  | 'docs-engineer'
  | 'gtm-specialist';

/**
 * Agent task types
 */
export type AgentTaskType =
  | 'feature' // Implementing a feature
  | 'pr_review' // Reviewing a pull request
  | 'idle_task' // Cleanup, docs, tests while waiting
  | 'conversation' // Engaging with user in Discord
  | 'research' // Codebase research
  | 'planning'; // Project planning, PRD creation

/**
 * Current task being executed by an agent
 */
export interface AgentTask {
  type: AgentTaskType;
  id: string;
  startedAt: string;
  description?: string;
}

/**
 * Discord monitoring configuration
 */
export interface DiscordMonitorConfig {
  /** Discord channel IDs to monitor */
  channelIds: string[];

  /** Keywords that trigger agent engagement (e.g., "@pm", "help", "bug") */
  keywords: string[];

  /** How often to poll Discord (ms, default: 30000) */
  pollInterval?: number;
}

/**
 * GitHub monitoring configuration
 */
export interface GitHubMonitorConfig {
  /** How often to check for new PRs (ms, default: 30000) */
  pollInterval?: number;

  /** PR labels to watch */
  labelFilter?: string[];
}

/**
 * Monitoring configuration for headsdown agents
 */
export interface AgentMonitoring {
  discord?: DiscordMonitorConfig;
  github?: GitHubMonitorConfig;
}

/**
 * Agent statistics
 */
export interface AgentStats {
  /** Total features completed */
  featuresCompleted: number;

  /** Total PRs reviewed */
  prsReviewed: number;

  /** Total idle tasks completed */
  idleTasksCompleted: number;

  /** Total turns consumed */
  totalTurns: number;

  /** Last activity timestamp */
  lastActivityAt?: string;
}

/**
 * Agent instance (running headsdown loop)
 *
 * Represents a single autonomous agent monitoring for work and executing tasks.
 */
export interface AgentInstance {
  /** Unique agent instance ID */
  id: string;

  /** Agent role (determines capabilities and responsibilities) */
  role: AgentRole;

  /** Current status */
  status: 'idle' | 'working' | 'paused' | 'stopped';

  /** What the agent is currently working on */
  currentTask?: AgentTask;

  /** Headsdown monitoring config */
  monitoring: AgentMonitoring;

  /** Model to use (affects cost and capabilities) */
  model: 'haiku' | 'sonnet' | 'opus';

  /** Max turns before agent stops (prevents infinite loops) */
  maxTurns: number;

  /** Project path (for project-scoped agents) */
  projectPath?: string;

  /** Statistics */
  stats: AgentStats;

  /** When the agent was started */
  startedAt: string;

  /** When the agent last checked for work */
  lastCheckAt?: string;
}

/**
 * Idle task types
 *
 * Tasks agents can do when no primary work is available.
 */
export type IdleTaskType =
  | 'review_prs' // Review open PRs
  | 'update_docs' // Update stale documentation
  | 'run_cleanup' // Run code cleanup tasks
  | 'check_tests' // Run test suite
  | 'update_changelog'; // Update changelog

/**
 * Idle task configuration
 */
export interface IdleTaskConfig {
  /** Whether idle tasks are enabled */
  enabled: boolean;

  /** Tasks to perform when idle (in priority order) */
  tasks: IdleTaskType[];
}

/**
 * Work item detected by monitoring
 */
export interface WorkItem {
  /** Work type */
  type: 'discord_message' | 'github_pr' | 'idle_task' | 'state_divergence';

  /** Unique work item ID */
  id: string;

  /** Priority (lower = higher priority) */
  priority: number;

  /** Work description */
  description: string;

  /** Source URL or reference */
  url?: string;

  /** Where this work item came from (e.g., "desired_state", "goal", "monitor") */
  source?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Agent role capabilities
 *
 * Defines what tools and actions each role can perform.
 */
export interface RoleCapabilities {
  role: AgentRole;

  /** Allowed tools */
  tools: string[];

  /** Max turns per session */
  maxTurns: number;

  /** Can execute bash commands */
  canUseBash: boolean;

  /** Can modify files */
  canModifyFiles: boolean;

  /** Can create git commits */
  canCommit: boolean;

  /** Can create PRs */
  canCreatePRs: boolean;

  /** Description of role responsibilities */
  description: string;
}

/**
 * Default role capabilities
 */
export const ROLE_CAPABILITIES: Record<AgentRole, RoleCapabilities> = {
  'product-manager': {
    role: 'product-manager',
    tools: ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch', 'Task'],
    maxTurns: 250,
    canUseBash: false,
    canModifyFiles: false,
    canCommit: false,
    canCreatePRs: false,
    description: 'Research codebase, engage with users, create SPARC PRDs, create projects',
  },
  'engineering-manager': {
    role: 'engineering-manager',
    tools: ['Read', 'Grep', 'Glob', 'Task'],
    maxTurns: 100,
    canUseBash: false,
    canModifyFiles: false,
    canCommit: false,
    canCreatePRs: false,
    description: 'Break down projects into features, assign to roles, manage PRs, trigger releases',
  },
  'frontend-engineer': {
    role: 'frontend-engineer',
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
    maxTurns: 150,
    canUseBash: false,
    canModifyFiles: true,
    canCommit: true,
    canCreatePRs: true,
    description: 'Implement React components, UI/UX features, frontend logic',
  },
  'backend-engineer': {
    role: 'backend-engineer',
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
    maxTurns: 150,
    canUseBash: true,
    canModifyFiles: true,
    canCommit: true,
    canCreatePRs: true,
    description: 'Implement APIs, services, database logic, backend features',
  },
  'devops-engineer': {
    role: 'devops-engineer',
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
    maxTurns: 150,
    canUseBash: true,
    canModifyFiles: true,
    canCommit: true,
    canCreatePRs: true,
    description: 'Setup CI/CD, infrastructure, deployment, build configuration',
  },
  'qa-engineer': {
    role: 'qa-engineer',
    tools: ['Read', 'Bash', 'Grep', 'Glob'],
    maxTurns: 50,
    canUseBash: true,
    canModifyFiles: false,
    canCommit: false,
    canCreatePRs: false,
    description: 'Review PRs, run tests, check quality, provide feedback',
  },
  'docs-engineer': {
    role: 'docs-engineer',
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
    maxTurns: 50,
    canUseBash: false,
    canModifyFiles: true,
    canCommit: true,
    canCreatePRs: true,
    description: 'Update documentation, generate changelogs, maintain project docs',
  },
  'gtm-specialist': {
    role: 'gtm-specialist',
    tools: ['Read', 'Grep', 'Glob', 'WebSearch', 'WebFetch', 'Write', 'Edit'],
    maxTurns: 250,
    canUseBash: false,
    canModifyFiles: true,
    canCommit: false,
    canCreatePRs: false,
    description:
      'Content strategy, marketing, competitive research, brand positioning, social media coordination',
  },
};
