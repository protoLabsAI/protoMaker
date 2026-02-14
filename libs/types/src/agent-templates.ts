/**
 * Agent template schema and types for the dynamic role registry.
 *
 * Templates define agent configurations: identity, capabilities, behavior,
 * security, assignments (routing), and headsdown loop settings.
 * Validated at runtime with Zod.
 */

import { z } from 'zod';

// Known agent roles from the existing system (agent-roles.ts)
const KNOWN_ROLES = [
  'product-manager',
  'engineering-manager',
  'frontend-engineer',
  'backend-engineer',
  'devops-engineer',
  'qa-engineer',
  'docs-engineer',
  'gtm-specialist',
  'content-writer',
  'chief-of-staff',
  'pr-maintainer',
  'board-janitor',
  'linear-specialist',
] as const;

/**
 * Discord assignment config — routes DMs and channel messages to this agent.
 */
const DiscordAssignmentSchema = z.object({
  /** Discord usernames whose DMs route to this agent */
  dmUsers: z.array(z.string()),
  /** Channel IDs this agent monitors for messages */
  watchChannels: z.array(z.string()),
  /** Channel IDs where this agent posts updates */
  postChannels: z.array(z.string()),
  /** Optional trigger words that activate this agent in watched channels */
  keywords: z.array(z.string()).optional(),
});

/**
 * Linear assignment config — routes issues and mentions to this agent.
 */
const LinearAssignmentSchema = z.object({
  /** Linear team identifier (e.g., "PROTO") */
  teamKey: z.string(),
  /** Linear project IDs to watch */
  projectIds: z.array(z.string()),
  /** Only route issues with these labels */
  labelFilter: z.array(z.string()).optional(),
  /** Only route issues assigned to these Linear users */
  assigneeFilter: z.array(z.string()).optional(),
});

/**
 * GitHub assignment config — routes events to this agent.
 */
const GitHubAssignmentSchema = z.object({
  /** Only route issues/PRs with these labels */
  labelFilter: z.array(z.string()).optional(),
  /** Only route events from these repos */
  repos: z.array(z.string()).optional(),
});

/**
 * Comparison operators for desired state conditions.
 */
const StateOperatorSchema = z.enum(['==', '!=', '<', '<=', '>', '>=']);

/**
 * A single desired state condition — defines an invariant the agent maintains.
 *
 * When the actual world state diverges from a condition, the agent activates
 * to restore equilibrium. The agent itself decides HOW to fix the divergence;
 * the condition just defines WHAT equilibrium looks like.
 */
const DesiredStateConditionSchema = z.object({
  /** World state key to monitor (e.g., "open_prs", "unread_dms") */
  key: z.string(),
  /** Comparison operator */
  operator: StateOperatorSchema,
  /** The desired/threshold value */
  value: z.union([z.string(), z.number(), z.boolean()]),
  /** Human-readable description shown to the agent when diverged */
  description: z.string().optional(),
  /** Urgency when diverged: 0 = background, 10 = critical (default: 5) */
  priority: z.number().int().min(0).max(10).default(5),
  /** Optional: only evaluate this condition when these monitors are active */
  requiresMonitor: z.enum(['discord', 'linear', 'github']).optional(),
});

/**
 * Known world state keys and their descriptions.
 * Monitors populate these values into the world state map.
 */
export const WORLD_STATE_KEYS = {
  // Board state
  backlog_count: 'Features in backlog',
  in_progress_count: 'Features currently in progress',
  blocked_count: 'Features that are blocked',
  review_count: 'Features in review (PR open)',

  // GitHub
  open_prs: 'Open pull requests',
  failing_ci_count: 'PRs with failing CI checks',
  unresolved_review_threads: 'Unresolved CodeRabbit/review threads',
  stale_prs: 'PRs with no activity in 24h',

  // Discord
  unread_dms: 'Unread Discord direct messages',
  unanswered_mentions: 'Unanswered @mentions in watched channels',
  pending_messages: 'Messages awaiting response',

  // Linear
  unread_notifications: 'Unread Linear notifications',
  assigned_issues: 'Issues assigned to this agent',
  overdue_issues: 'Issues past their due date',

  // Agent health
  consecutive_errors: 'Consecutive errors in current loop',
  total_turns: 'Total turns consumed',
  idle_duration_ms: 'Milliseconds agent has been idle',

  // Infrastructure
  heap_usage_percent: 'Server heap memory usage percentage',
  running_agents: 'Currently running agent count',
} as const;

/**
 * Headsdown loop configuration for persistent agents.
 */
const HeadsdownConfigSchema = z.object({
  /** Model to use in headsdown mode */
  model: z.enum(['haiku', 'sonnet', 'opus']).optional(),
  /** Maximum turns per headsdown cycle */
  maxTurns: z.number().int().positive().optional(),
  /** Loop settings */
  loop: z
    .object({
      enabled: z.boolean(),
      /** Milliseconds between loop iterations */
      checkInterval: z.number().int().positive().optional(),
      /** Max consecutive errors before stopping */
      maxConsecutiveErrors: z.number().int().positive().optional(),
      /** Max milliseconds before force-stopping the loop */
      workTimeout: z.number().int().positive().optional(),
    })
    .optional(),
  /** Idle task settings (what to do when no primary work) */
  idleTasks: z
    .object({
      enabled: z.boolean(),
      tasks: z.array(z.string()),
    })
    .optional(),
});

/**
 * Agent Template Schema — the complete configuration for an agent type.
 *
 * This is the single source of truth for agent identity, capabilities,
 * routing assignments, security boundaries, and runtime behavior.
 */
export const AgentTemplateSchema = z.object({
  // --- Identity ---
  /** Unique kebab-case identifier (e.g., "ava", "pm-agent") */
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message: 'Name must be kebab-case (lowercase alphanumeric with hyphens)',
  }),
  /** Human-readable display name */
  displayName: z.string(),
  /** When to use this agent / what it does */
  description: z.string(),
  /** Agent role — known role or custom */
  role: z.enum([...KNOWN_ROLES, 'custom']),
  /** Protection tier: 0=protected (system), 1=managed (user-created) */
  tier: z.union([z.literal(0), z.literal(1)]).optional(),

  // --- Capabilities ---
  /** Claude model to use */
  model: z.enum(['haiku', 'sonnet', 'opus']).optional(),
  /** Allowed tools (allowlist). Empty = no tools. ["*"] = all tools. */
  tools: z.array(z.string()).optional(),
  /** Denied tools (denylist, overrides tools allowlist) */
  disallowedTools: z.array(z.string()).optional(),
  /** Can this agent execute bash commands */
  canUseBash: z.boolean().optional(),
  /** Can this agent modify files */
  canModifyFiles: z.boolean().optional(),
  /** Can this agent create git commits */
  canCommit: z.boolean().optional(),
  /** Can this agent create pull requests */
  canCreatePRs: z.boolean().optional(),
  /** Maximum turns before stopping */
  maxTurns: z.number().int().positive().optional(),

  // --- Behavior ---
  /** Path to system prompt template (relative to templates dir) */
  systemPromptTemplate: z.string().optional(),
  /** Inline system prompt (alternative to template file) */
  systemPrompt: z.string().optional(),
  /** Can this agent spawn sub-agents */
  canSpawnAgents: z.boolean().optional(),
  /** Which roles this agent is allowed to spawn */
  allowedSubagentRoles: z.array(z.string()).optional(),

  // --- Security ---
  /** Trust level: 0=untrusted, 1=basic, 2=elevated, 3=full */
  trustLevel: z.number().int().min(0).max(3).optional(),
  /** Maximum risk level this agent can take */
  maxRiskAllowed: z.enum(['low', 'medium', 'high']).optional(),

  // --- Assignments (routing config) ---
  /** How external events route to this agent */
  assignments: z
    .object({
      discord: DiscordAssignmentSchema.optional(),
      linear: LinearAssignmentSchema.optional(),
      github: GitHubAssignmentSchema.optional(),
    })
    .optional(),

  // --- Headsdown Config ---
  /** Configuration for persistent agent loops */
  headsdownConfig: HeadsdownConfigSchema.optional(),

  // --- Desired State (Reactive Invariants) ---
  /** Conditions the agent is responsible for maintaining.
   *  When world state diverges from these conditions, the agent activates. */
  desiredState: z.array(DesiredStateConditionSchema).optional(),

  // --- Exposure (CLI + Discord visibility) ---
  /** Controls how this agent is exposed as a CLI skill and/or Discord slash command.
   *  Registry-driven: adding exposure config auto-registers the agent. */
  exposure: z
    .object({
      /** Generate a CLI skill file for this agent (invocable via /name) */
      cli: z.boolean().optional(),
      /** Register a Discord slash command for this agent */
      discord: z.boolean().optional(),
      /** Discord usernames allowed to invoke this agent (empty = everyone) */
      allowedUsers: z.array(z.string()).optional(),
    })
    .optional(),

  // --- Metadata ---
  /** Who created this template */
  author: z.string().optional(),
  /** Semantic version */
  version: z.string().optional(),
  /** Searchable tags */
  tags: z.array(z.string()).optional(),
});

/** Inferred TypeScript type from the Zod schema */
export type AgentTemplate = z.infer<typeof AgentTemplateSchema>;

/** Sub-schemas exported for reuse */
export {
  DiscordAssignmentSchema,
  LinearAssignmentSchema,
  GitHubAssignmentSchema,
  HeadsdownConfigSchema,
  DesiredStateConditionSchema,
  StateOperatorSchema,
};
export type DiscordAssignment = z.infer<typeof DiscordAssignmentSchema>;
export type LinearAssignment = z.infer<typeof LinearAssignmentSchema>;
export type GitHubAssignment = z.infer<typeof GitHubAssignmentSchema>;
export type AgentHeadsdownConfig = z.infer<typeof HeadsdownConfigSchema>;
export type DesiredStateCondition = z.infer<typeof DesiredStateConditionSchema>;
export type StateOperator = z.infer<typeof StateOperatorSchema>;

/** The known built-in roles */
export const KNOWN_AGENT_ROLES = KNOWN_ROLES;
