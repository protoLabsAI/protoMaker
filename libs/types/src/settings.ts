/**
 * Settings Types - Barrel re-export for all domain-specific settings modules
 *
 * This file re-exports all settings types from focused domain files.
 * Import from here for convenience, or import directly from the domain file
 * for better tree-shaking.
 *
 * Domain files:
 * - ui-settings.ts      - ThemeMode, PlanningMode, WindowBounds, KeyboardShortcuts, BoardBackgroundSettings
 * - agent-settings.ts   - ThinkingLevel, PhaseModelEntry, PhaseModelConfig, CeremonySettings, DeploymentEnvironment
 * - git-settings.ts     - GitWorkflowSettings, GitWorkflowResult
 * - provider-settings.ts - ClaudeCompatibleProvider, ApiKeySource, ProviderModel, ClaudeApiProfile templates
 * - event-settings.ts   - EventHookTrigger, EventHook, EventHookAction types
 * - integration-settings.ts - DiscordSettings, LinearIntegrationConfig, ProjectIntegrations
 * - workflow-settings.ts - WorkflowSettings, TrustBoundaryConfig, PRDCategory
 * - project-settings.ts  - ProjectSettings, WorktreeInfo, ProjectRef
 * - global-settings.ts  - GlobalSettings, Credentials, MCPServerConfig
 */

export * from './ui-settings.js';
export * from './agent-settings.js';
export * from './git-settings.js';
export * from './provider-settings.js';
export * from './event-settings.js';
export * from './integration-settings.js';
export * from './workflow-settings.js';
export * from './project-settings.js';
export * from './global-settings.js';

// Webhook settings (re-exported for convenience from webhook.ts)
export type { WebhookSettings } from './webhook.js';
export { DEFAULT_WEBHOOK_SETTINGS } from './webhook.js';
