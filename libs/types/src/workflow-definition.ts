/**
 * Workflow Definition — YAML-defined custom workflows for the Lead Engineer pipeline.
 *
 * A workflow controls which phases run, which processors handle each phase,
 * agent role/model/tools, and execution settings (worktrees, git, terminal status).
 *
 * Workflows are loaded from `.automaker/workflows/{name}.yml` per-project,
 * with built-in defaults (standard, read-only, content, audit) always available.
 */

import type { GitWorkflowSettings } from './git-settings.js';

/**
 * Configuration for a configurable processor — defines agent behavior via config instead of code.
 *
 * A single generic ConfigurableProcessor reads this config and runs an agent with
 * the specified prompt, tools, output format, and validation. No TypeScript needed
 * to create a new processor — just add a processorConfig to a workflow phase.
 */
export interface ProcessorConfig {
  /** System prompt injected into the agent for this phase */
  prompt: string;
  /** Tool allowlist. Empty array or omitted = all tools allowed. */
  tools?: string[];
  /** Model override for this specific phase */
  model?: string;
  /** Expected output format — affects how the result is captured and validated */
  outputFormat?: 'markdown' | 'json' | 'diff' | 'text';
  /** Bash commands to run before the agent starts (e.g. install deps, prep data) */
  preScripts?: string[];
  /** Bash commands to run after the agent completes (e.g. validate output, format results) */
  postScripts?: string[];
  /** Max agent turns for this phase (default: from workflow settings) */
  maxTurns?: number;
  /** Timeout in milliseconds for this phase */
  timeoutMs?: number;
}

/**
 * A single phase in a workflow definition.
 * Maps to a Lead Engineer state machine state.
 */
export interface WorkflowPhase {
  /** State machine state this phase maps to */
  state: 'INTAKE' | 'PLAN' | 'EXECUTE' | 'REVIEW' | 'MERGE' | 'DEPLOY';
  /** Whether this phase is enabled. Disabled phases are skipped. */
  enabled: boolean;
  /** Custom processor name from the ProcessorRegistry. If omitted, uses the built-in default. */
  processor?: string;
  /**
   * Inline processor configuration. When set, the phase uses the generic
   * ConfigurableProcessor driven by this config instead of a named processor.
   * Takes precedence over the `processor` field.
   */
  processorConfig?: ProcessorConfig;
}

/**
 * Agent configuration for a workflow.
 * Controls which agent role, model, prompt, and tools are used.
 */
export interface WorkflowAgentConfig {
  /** Built-in role or agent manifest name */
  role?: string;
  /** Model override (e.g. 'sonnet', 'opus', 'haiku') */
  model?: string;
  /** Custom prompt file path relative to project root */
  promptFile?: string;
  /** Tool allowlist. Empty array = all tools allowed. */
  tools?: string[];
}

/**
 * Execution settings for a workflow.
 * Controls worktree isolation, git behavior, and terminal status.
 */
export interface WorkflowExecutionConfig {
  /** Create an isolated git worktree for this workflow? */
  useWorktrees: boolean;
  /** Git workflow overrides (autoCommit, autoPush, autoCreatePR, etc.) */
  gitWorkflow?: Partial<GitWorkflowSettings>;
  /** Where to write output (default: feature directory) */
  outputDir?: string;
  /** Terminal status after workflow completes: 'done' or 'review' */
  terminalStatus: 'done' | 'review';
}

/**
 * Match rules for auto-assigning a workflow to a feature.
 * Same pattern as agent manifests — match on categories and keywords.
 */
export interface WorkflowMatchRules {
  /** Feature categories that trigger this workflow */
  categories?: string[];
  /** Keywords in title/description that trigger this workflow */
  keywords?: string[];
  /** Match on the legacy executionMode field */
  executionMode?: string;
}

/**
 * A complete workflow definition.
 *
 * Loaded from `.automaker/workflows/{name}.yml` or provided as a built-in default.
 * Controls the Lead Engineer pipeline behavior for features assigned to this workflow.
 */
export interface WorkflowDefinition {
  /** Unique workflow name (e.g. 'audit', 'content', 'standard') */
  name: string;
  /** Human-readable description */
  description: string;
  /** Phase configuration — which phases run and with which processors */
  phases: WorkflowPhase[];
  /** Agent configuration (role, model, prompt, tools) */
  agent?: WorkflowAgentConfig;
  /** Execution settings (worktrees, git, terminal status) */
  execution: WorkflowExecutionConfig;
  /** Match rules for auto-assignment */
  match?: WorkflowMatchRules;
}
