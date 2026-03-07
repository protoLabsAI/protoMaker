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
  /** Default agent to assign new features to */
  assignee: z.string().optional(),
  /** Whether to auto-create PRs after feature merge */
  autoPR: z.boolean().default(false),
});

export type ProtoDefaults = z.infer<typeof ProtoDefaultsSchema>;

// ---------------------------------------------------------------------------
// Hive identity — multi-instance mesh coordination
// ---------------------------------------------------------------------------

export const ProtoHiveSchema = z.object({
  /** Shared identifier for the hive cluster (all instances share this) */
  hiveId: z.string().optional(),
  /** WebSocket port used for CRDT sync between instances */
  syncPort: z.number().int().min(1024).max(65535).default(9800),
  /** Whether multi-instance mesh sync is enabled */
  meshEnabled: z.boolean().default(false),
});

export type ProtoHive = z.infer<typeof ProtoHiveSchema>;

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
  /** Hive mesh identity and sync configuration */
  hive: ProtoHiveSchema.optional(),
  /** Registry of known instances in this hive */
  instances: z.array(ProtoInstanceSchema).optional(),
  /** Work assignment strategy across instances */
  assignment: ProtoAssignmentSchema.optional(),
});

export type ProtoConfig = z.infer<typeof ProtoConfigSchema>;
