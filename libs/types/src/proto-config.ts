/**
 * ProtoConfig — schema and TypeScript types for proto.config.yaml
 *
 * Defines the full configuration surface for a ProtoLabs project.
 * Validated at runtime with Zod. Forward-compatible with CRDT sync.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Tech stack
// ---------------------------------------------------------------------------

export const ProtoTechStackSchema = z.object({
  /** Primary programming language (e.g. "typescript", "python", "rust") */
  language: z.string().optional(),
  /** Framework in use (e.g. "next", "express", "fastapi") */
  framework: z.string().optional(),
  /** Package manager (e.g. "npm", "pnpm", "yarn", "bun") */
  packageManager: z.string().optional(),
  /** Test runner (e.g. "vitest", "jest", "pytest") */
  testRunner: z.string().optional(),
  /** Bundler (e.g. "vite", "esbuild", "tsup", "webpack") */
  bundler: z.string().optional(),
});

export type ProtoTechStack = z.infer<typeof ProtoTechStackSchema>;

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export const ProtoCommandsSchema = z.object({
  /** Build command (e.g. "npm run build") */
  build: z.string().optional(),
  /** Test command (e.g. "npm test") */
  test: z.string().optional(),
  /** Lint command (e.g. "npm run lint") */
  lint: z.string().optional(),
  /** Dev server command (e.g. "npm run dev") */
  dev: z.string().optional(),
  /** Format command (e.g. "npm run format") */
  format: z.string().optional(),
});

export type ProtoCommands = z.infer<typeof ProtoCommandsSchema>;

// ---------------------------------------------------------------------------
// Git settings
// ---------------------------------------------------------------------------

export const ProtoGitSchema = z.object({
  /** Base branch for feature branches (default: "main") */
  baseBranch: z.string().default('main'),
  /** Merge strategy for PRs (e.g. "squash", "merge", "rebase") */
  strategy: z.enum(['squash', 'merge', 'rebase']).default('squash'),
  /** Target branch for pull requests (defaults to baseBranch if omitted) */
  prBaseBranch: z.string().optional(),
});

export type ProtoGit = z.infer<typeof ProtoGitSchema>;

// ---------------------------------------------------------------------------
// ProtoLab instance settings
// ---------------------------------------------------------------------------

export const ProtoLabSchema = z.object({
  /** Whether ProtoLab sync is enabled for this project */
  enabled: z.boolean().default(false),
  /** Port used for CRDT sync WebSocket connection */
  syncPort: z.number().int().min(1024).max(65535).optional(),
  /** Unique instance identifier for mesh coordination */
  instanceId: z.string().optional(),
});

export type ProtoLab = z.infer<typeof ProtoLabSchema>;

// ---------------------------------------------------------------------------
// Defaults — overridable per-feature defaults
// ---------------------------------------------------------------------------

export const ProtoDefaultsSchema = z.object({
  /** Default branch prefix for features (e.g. "feature/") */
  branchPrefix: z.string().default('feature/'),
  /** Default complexity when not specified */
  complexity: z.enum(['small', 'medium', 'large']).default('medium'),
  /** Whether to auto-create PRs after feature merge */
  autoPR: z.boolean().default(false),
});

export type ProtoDefaults = z.infer<typeof ProtoDefaultsSchema>;

// ---------------------------------------------------------------------------
// Instance role — primary work focus for work routing
// ---------------------------------------------------------------------------

/**
 * Role influences work routing but doesn't hard-block.
 * A frontend instance picks up backend work if nothing else is available.
 */
export type InstanceRole = 'fullstack' | 'frontend' | 'backend' | 'infra' | 'docs' | 'qa';

export const InstanceRoleSchema = z.enum([
  'fullstack',
  'frontend',
  'backend',
  'infra',
  'docs',
  'qa',
]);

// ---------------------------------------------------------------------------
// Instance profile — identity and role for mesh coordination
// ---------------------------------------------------------------------------

export const ProtoInstanceProfileSchema = z.object({
  /** Human-readable display name for this instance */
  name: z.string().optional(),
  /** Primary work focus (default: fullstack) */
  role: InstanceRoleSchema.default('fullstack'),
  /** Additional capabilities beyond the primary role */
  tags: z.array(z.string()).optional(),
});

export type ProtoInstanceProfile = z.infer<typeof ProtoInstanceProfileSchema>;

// ---------------------------------------------------------------------------
// Work intake — pull-based phase claiming from shared projects
// ---------------------------------------------------------------------------

export const ProtoWorkIntakeSchema = z.object({
  /** Whether work intake is enabled (default: true when mesh is active) */
  enabled: z.boolean().default(true),
  /** Tick interval in ms for checking claimable phases (default: 30000) */
  tickIntervalMs: z.number().int().min(5000).default(30_000),
  /** Timeout in ms before a stale claim becomes reclaimable (default: 1800000 = 30min) */
  claimTimeoutMs: z.number().int().min(60_000).default(1_800_000),
});

export type ProtoWorkIntake = z.infer<typeof ProtoWorkIntakeSchema>;

// ---------------------------------------------------------------------------
// Instance registry — per-instance identity entries
// ---------------------------------------------------------------------------

export const ProtoInstanceSchema = z.object({
  /** Stable unique ID for this instance (e.g. "dev-mac", "ci-runner-1") */
  instanceId: z.string(),
  /** Hostname this entry applies to (used for auto-detection) */
  hostname: z.string().optional(),
  /** Maximum number of concurrent features this instance can handle */
  capacity: z.number().int().min(1).default(1),
});

export type ProtoInstance = z.infer<typeof ProtoInstanceSchema>;

// ---------------------------------------------------------------------------
// Assignment strategy — how work is distributed across instances
// ---------------------------------------------------------------------------

export const ProtoAssignmentSchema = z.object({
  /** Work distribution algorithm */
  strategy: z.enum(['round-robin', 'capacity-weighted', 'random']).default('round-robin'),
  /** Whether features stay pinned to the instance that started them */
  stickyFeatures: z.boolean().default(false),
});

export type ProtoAssignment = z.infer<typeof ProtoAssignmentSchema>;

// ---------------------------------------------------------------------------
// Shared Settings — settings that propagate across instances via CRDT sync
// ---------------------------------------------------------------------------

/**
 * SharedSettings defines which settings are eligible for cross-instance
 * propagation. Credentials and API keys are NEVER included here.
 *
 * Resolution order: proto.config defaults < shared CRDT settings < local overrides
 */
export const SharedSettingsSchema = z.object({
  /**
   * Maximum concurrent agents across all projects on this hive.
   * Maps to ProjectSettings.maxConcurrentAgents.
   */
  maxConcurrentAgents: z.number().int().min(1).optional(),
  /** Shared workflow tuning parameters */
  workflow: z
    .object({
      /** Maximum retries before escalation (default varies by implementation) */
      maxRetries: z.number().int().min(0).optional(),
      /** Whether to automatically commit after each agent step */
      enableAutoCommit: z.boolean().optional(),
      /** Whether to automatically open PRs after feature completion */
      enableAutoPR: z.boolean().optional(),
      /** Whether to skip validation phase in the pipeline */
      skipValidation: z.boolean().optional(),
    })
    .optional(),
});

export type SharedSettings = z.infer<typeof SharedSettingsSchema>;

// ---------------------------------------------------------------------------
// Project preferences — preferred projects and overflow routing
// ---------------------------------------------------------------------------

export const ProjectPreferencesSchema = z.object({
  /**
   * List of project slugs this instance prefers to work on.
   * When set, auto-mode will prioritize features from these projects.
   */
  preferredProjects: z.array(z.string()).optional(),
  /**
   * Whether this instance can accept work overflow from non-preferred projects.
   * When false, the instance only picks up features from preferredProjects.
   * Defaults to true.
   */
  overflowEnabled: z.boolean().default(true),
});

export type ProjectPreferences = z.infer<typeof ProjectPreferencesSchema>;

// ---------------------------------------------------------------------------
// Root ProtoConfig
// ---------------------------------------------------------------------------

export const ProtoConfigSchema = z.object({
  /** Human-readable project name */
  name: z.string(),
  /** Semantic version of the config schema (e.g. "1.0.0") */
  version: z.string().default('1.0.0'),
  /** Technology stack metadata */
  techStack: ProtoTechStackSchema.optional(),
  /** Runnable project commands */
  commands: ProtoCommandsSchema.optional(),
  /** Git workflow settings */
  git: ProtoGitSchema.optional(),
  /** ProtoLab instance / CRDT sync settings */
  protolab: ProtoLabSchema.optional(),
  /** Project-level defaults for features and automation */
  defaults: ProtoDefaultsSchema.optional(),
  /** Registry of known instances in this hive */
  instances: z.array(ProtoInstanceSchema).optional(),
  /** Work assignment strategy across instances */
  assignment: ProtoAssignmentSchema.optional(),
  /** Instance identity and role for mesh coordination */
  instance: ProtoInstanceProfileSchema.optional(),
  /** Pull-based work intake configuration */
  workIntake: ProtoWorkIntakeSchema.optional(),
  /**
   * Shared settings defaults — lowest-priority layer in config resolution.
   * These values are overridden by shared CRDT settings and local overrides.
   * Credentials and API keys MUST NOT be placed here.
   */
  sharedSettings: SharedSettingsSchema.optional(),
  /** Project routing preferences — which projects this instance prefers and overflow policy */
  projectPreferences: ProjectPreferencesSchema.optional(),
});

export type ProtoConfig = z.infer<typeof ProtoConfigSchema>;
