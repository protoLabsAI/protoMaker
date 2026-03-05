/**
 * Integration Registry Types
 *
 * Defines the schema for external integrations managed through a unified registry.
 * Each integration is described by an IntegrationDescriptor — a serializable manifest
 * that declares its config fields, category, scope, icon, and health check capability.
 *
 * Phase 1: Discord, GitHub, Twitch
 * Phase 2: AI providers, MCP servers, Langfuse
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Category & scope enums
// ---------------------------------------------------------------------------

export const IntegrationCategory = z.enum([
  'communication',
  'project-mgmt',
  'source-control',
  'streaming',
  'ai-provider',
  'tooling',
  'observability',
]);
export type IntegrationCategory = z.infer<typeof IntegrationCategory>;

export const IntegrationScope = z.enum(['global', 'project', 'both']);
export type IntegrationScope = z.infer<typeof IntegrationScope>;

// ---------------------------------------------------------------------------
// Health status
// ---------------------------------------------------------------------------

export const IntegrationHealthStatus = z.enum([
  'connected',
  'disconnected',
  'degraded',
  'unconfigured',
  'disabled',
]);
export type IntegrationHealthStatus = z.infer<typeof IntegrationHealthStatus>;

export interface IntegrationHealth {
  integrationId: string;
  status: IntegrationHealthStatus;
  message?: string;
  checkedAt: string;
}

// ---------------------------------------------------------------------------
// Config field types (auto-rendered in UI)
// ---------------------------------------------------------------------------

export const ConfigFieldType = z.enum(['string', 'secret', 'boolean', 'select', 'number', 'url']);
export type ConfigFieldType = z.infer<typeof ConfigFieldType>;

export const ConfigFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: ConfigFieldType,
  description: z.string().optional(),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  /** Options for 'select' type fields */
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  /** Group label for visual grouping in the config dialog */
  group: z.string().optional(),
});
export type ConfigField = z.infer<typeof ConfigFieldSchema>;

// ---------------------------------------------------------------------------
// Integration descriptor (the core registry entity)
// ---------------------------------------------------------------------------

export const IntegrationDescriptorSchema = z.object({
  /** Unique identifier (e.g. 'discord', 'github') */
  id: z.string().min(1),
  /** Display name */
  name: z.string().min(1),
  /** Short description */
  description: z.string(),
  /** Category for grouping in the UI */
  category: IntegrationCategory,
  /** Whether config is global, project-scoped, or both */
  scope: IntegrationScope,
  /** Protection tier: 0 = built-in (cannot be unregistered), 1 = user-defined */
  tier: z.number().int().min(0).max(1).default(1),
  /** Lucide icon name (resolved in the UI) */
  iconName: z.string(),
  /** Brand hex color for the card accent */
  brandColor: z.string().optional(),
  /** Whether this integration is currently enabled */
  enabled: z.boolean().default(false),
  /** Config fields rendered in the configuration dialog */
  configFields: z.array(ConfigFieldSchema).default([]),
  /** Whether the integration supports health checks */
  hasHealthCheck: z.boolean().default(false),
  /** Link to docs */
  docsUrl: z.string().optional(),
  /** Searchable tags */
  tags: z.array(z.string()).optional(),
});
export type IntegrationDescriptor = z.infer<typeof IntegrationDescriptorSchema>;

// ---------------------------------------------------------------------------
// Summary (subset of descriptor + health, used in list responses)
// ---------------------------------------------------------------------------

export interface IntegrationSummary {
  id: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  scope: IntegrationScope;
  iconName: string;
  brandColor?: string;
  enabled: boolean;
  hasHealthCheck: boolean;
  health?: IntegrationHealth;
}
