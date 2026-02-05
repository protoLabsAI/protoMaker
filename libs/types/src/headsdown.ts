/**
 * Headsdown agent configuration
 *
 * Defines the configuration for autonomous agents that continuously monitor
 * for work and execute tasks in a loop.
 */

import type { AgentRole, AgentMonitoring, IdleTaskConfig } from './agent-roles.js';

/**
 * Headsdown loop configuration
 */
export interface HeadsdownLoopConfig {
  /** Whether the loop is enabled */
  enabled: boolean;

  /** How often to check for work (ms, default: 30000) */
  checkInterval: number;

  /** Max consecutive errors before stopping (default: 5) */
  maxConsecutiveErrors?: number;

  /** Timeout for each work item (ms, default: 7200000 = 2 hours) */
  workTimeout?: number;
}

/**
 * Complete headsdown agent configuration
 */
export interface HeadsdownConfig {
  /** Agent instance ID */
  agentId: string;

  /** Agent role */
  role: AgentRole;

  /** Monitoring configuration */
  monitors: AgentMonitoring;

  /** Idle behavior - what to do when no primary work */
  idleTasks: IdleTaskConfig;

  /** Loop configuration */
  loop: HeadsdownLoopConfig;

  /** Model to use */
  model: 'haiku' | 'sonnet' | 'opus';

  /** Max turns before stopping (prevents infinite loops) */
  maxTurns: number;

  /** Project path (for project-scoped agents) */
  projectPath?: string;

  /** Optional: Custom system prompt override */
  customPrompt?: string;
}

/**
 * Default headsdown configurations by role
 */
export const DEFAULT_HEADSDOWN_CONFIGS: Record<AgentRole, Partial<HeadsdownConfig>> = {
  'product-manager': {
    model: 'opus',
    maxTurns: 250,
    loop: {
      enabled: true,
      checkInterval: 30000,
      maxConsecutiveErrors: 5,
      workTimeout: 7200000,
    },
    idleTasks: {
      enabled: false,
      tasks: [],
    },
  },
  'engineering-manager': {
    model: 'sonnet',
    maxTurns: 100,
    loop: {
      enabled: true,
      checkInterval: 30000,
      maxConsecutiveErrors: 5,
      workTimeout: 3600000,
    },
    idleTasks: {
      enabled: false,
      tasks: [],
    },
  },
  'frontend-engineer': {
    model: 'sonnet',
    maxTurns: 150,
    loop: {
      enabled: true,
      checkInterval: 30000,
      maxConsecutiveErrors: 5,
      workTimeout: 7200000,
    },
    idleTasks: {
      enabled: true,
      tasks: ['review_prs', 'update_docs', 'run_cleanup', 'check_tests'],
    },
  },
  'backend-engineer': {
    model: 'sonnet',
    maxTurns: 150,
    loop: {
      enabled: true,
      checkInterval: 30000,
      maxConsecutiveErrors: 5,
      workTimeout: 7200000,
    },
    idleTasks: {
      enabled: true,
      tasks: ['review_prs', 'run_cleanup', 'check_tests', 'update_docs'],
    },
  },
  'devops-engineer': {
    model: 'sonnet',
    maxTurns: 150,
    loop: {
      enabled: true,
      checkInterval: 30000,
      maxConsecutiveErrors: 5,
      workTimeout: 7200000,
    },
    idleTasks: {
      enabled: true,
      tasks: ['check_tests', 'run_cleanup'],
    },
  },
  'qa-engineer': {
    model: 'haiku',
    maxTurns: 50,
    loop: {
      enabled: true,
      checkInterval: 30000,
      maxConsecutiveErrors: 5,
      workTimeout: 1800000,
    },
    idleTasks: {
      enabled: true,
      tasks: ['review_prs', 'check_tests'],
    },
  },
  'docs-engineer': {
    model: 'haiku',
    maxTurns: 50,
    loop: {
      enabled: true,
      checkInterval: 30000,
      maxConsecutiveErrors: 5,
      workTimeout: 1800000,
    },
    idleTasks: {
      enabled: true,
      tasks: ['update_docs', 'update_changelog'],
    },
  },
};

/**
 * Headsdown state (persisted to disk)
 */
export interface HeadsdownState {
  /** Agent instance ID */
  agentId: string;

  /** Current status */
  status: 'idle' | 'working' | 'paused' | 'stopped';

  /** Current turn count */
  currentTurns: number;

  /** Consecutive errors */
  consecutiveErrors: number;

  /** Last error message */
  lastError?: string;

  /** When state was last updated */
  updatedAt: string;
}
