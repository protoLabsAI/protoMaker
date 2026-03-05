/**
 * Integration Settings - Per-project Discord, Google, and external service configuration
 *
 * Covers Discord bot settings, Discord communication integration,
 * Google Calendar OAuth, and the container for all per-project integration configurations.
 */

import type { EventHookTrigger } from './event-settings.js';
import type { SignalIntent } from './signal-intent.js';

// ============================================================================
// Discord Settings - Global Discord bot configuration
// ============================================================================

/**
 * DiscordUserDMConfig - Configuration for user-specific Discord DM functionality
 *
 * Maps a human user to their Discord username for agent DM capabilities.
 * Agents can send DMs to their assigned human using this configuration.
 */
export interface DiscordUserDMConfig {
  /** Human's identifier/email/name (used internally) */
  userId: string;
  /** Discord username to send DMs to */
  discordUsername: string;
  /** Whether this user has opted in to receive DMs from agents */
  dmEnabled: boolean;
}

/**
 * DiscordSettings - Configuration for Discord MCP integration
 *
 * Supports Discord bot integration via the discord-mcp server for:
 * - Sending progress notifications to channels
 * - Announcing feature completion
 * - Headsdown mode status updates
 * - Team communication automation
 * - Direct messages between agents and their assigned humans
 */
export interface DiscordSettings {
  /** Whether Discord integration is enabled */
  enabled: boolean;
  /** Discord bot token (stored in credentials.json for security) */
  tokenConfigured?: boolean; // Just a flag, actual token in credentials
  /** Discord server/guild ID */
  guildId?: string;
  /** Default channel ID for progress notifications */
  notificationChannelId?: string;
  /** Default channel name for display purposes */
  notificationChannelName?: string;
  /** Enable automatic progress updates during auto-mode */
  autoNotify?: boolean;
  /** Notify on feature start */
  notifyOnFeatureStart?: boolean;
  /** Notify on feature completion */
  notifyOnFeatureComplete?: boolean;
  /** Notify on milestone completion */
  notifyOnMilestoneComplete?: boolean;
  /** Notify on project completion */
  notifyOnProjectComplete?: boolean;
  /** Notify on agent errors/failures */
  notifyOnError?: boolean;
  /** User DM configurations (maps users to Discord usernames) */
  userDMConfig?: DiscordUserDMConfig[];
}

/**
 * Default Discord settings - disabled by default
 */
export const DEFAULT_DISCORD_SETTINGS: DiscordSettings = {
  enabled: false,
  tokenConfigured: false,
  guildId: undefined,
  notificationChannelId: undefined,
  notificationChannelName: undefined,
  autoNotify: false,
  notifyOnFeatureStart: false,
  notifyOnFeatureComplete: true,
  notifyOnMilestoneComplete: true,
  notifyOnProjectComplete: true,
  notifyOnError: true,
};

// ============================================================================
// Reaction Abilities - Discord emoji reaction to intent mapping
// ============================================================================

/**
 * ReactionAbility - Maps a Discord emoji reaction to a signal intent and routing rules
 *
 * When a user reacts to a Discord message with the configured emoji, Automaker
 * interprets the reaction as a signal with the specified intent and routes it
 * through the intake pipeline accordingly.
 */
export interface ReactionAbility {
  /** Unique identifier (UUID) */
  id: string;
  /** Unicode emoji or Discord custom emoji ID */
  emoji: string;
  /** Human-readable name (e.g. "Report Bug") */
  label: string;
  /** Signal intent classification for routing */
  intent: SignalIntent;
  /** Discord channel IDs where this reaction is active (empty = all channels) */
  channels: string[];
  /** Discord role IDs allowed to trigger this ability (empty = any role) */
  allowedRoles: string[];
  /** Discord user IDs individually trusted for this ability */
  allowedUsers: string[];
  /** Whether to auto-create a board feature when this reaction is used */
  autoFeature: boolean;
  /** Whether this reaction ability is active */
  enabled: boolean;
}

// ============================================================================
// Discord Channel Signal Config - Per-channel polling config for signal intake
// ============================================================================

/**
 * DiscordChannelSignalConfig - Per-channel configuration for signal monitoring
 *
 * Defines which Discord channels the monitor polls for messages, and how those
 * messages are routed through the signal intake pipeline.
 */
export interface DiscordChannelSignalConfig {
  /** Discord channel ID to monitor */
  channelId: string;
  /** Human-readable channel name for logging and display */
  channelName: string;
  /** Override the auto-classified signal intent for messages from this channel */
  intentOverride?: SignalIntent;
  /** Automatically create a board feature when a signal is detected */
  autoFeature: boolean;
  /** Whether this channel config is active */
  enabled: boolean;
}

// ============================================================================
// Channel Workflows - Context-based message routing by Discord channel
// ============================================================================

/**
 * ChannelWorkflowType - The type of workflow to run for messages in a channel.
 *
 * - 'bug_triage': Creates a board feature, spawns an investigation thread,
 *   and runs AI follow-up questions to classify severity and category.
 * - 'idea_intake': Replaces `!idea` prefix — submits ideas from channel context.
 * - 'agent_conversation': Routes messages to a configured agent role via
 *   AgentDiscordRouter for conversational AI.
 */
export type ChannelWorkflowType = 'bug_triage' | 'idea_intake' | 'agent_conversation';

/**
 * ChannelWorkflow - Maps a Discord channel to a workflow that runs for every message.
 *
 * When a message arrives in the configured channel, the workflow fires automatically
 * instead of requiring prefix commands. The channel determines the behavior.
 */
export interface ChannelWorkflow {
  /** Discord channel ID */
  channelId: string;
  /** Human-readable channel name */
  channelName: string;
  /** Which workflow to run for messages in this channel */
  workflow: ChannelWorkflowType;
  /** For 'agent_conversation': which agent role to use (e.g., 'ava', 'product-manager') */
  agentRole?: string;
  /** Create a thread for each incoming message */
  createThread: boolean;
  /** For 'bug_triage': use AI investigation (vs quick categorize) */
  aiInvestigation: boolean;
  /** Whether this workflow is active */
  enabled: boolean;
}

// ============================================================================
// Discord Channel Map - Consolidated channel ID configuration
// ============================================================================

/**
 * DiscordChannelMap - Consolidated Discord channel ID configuration.
 *
 * Single source of truth for all channel IDs used by the Discord integration.
 * Replaces scattered env vars (DISCORD_CHANNEL_*) and UserProfile.discord.channels.
 * Falls back to env vars when fields are not set.
 */
export interface DiscordChannelMap {
  /** Primary coordination channel */
  primary?: string;
  /** Dev updates / code review channel */
  dev?: string;
  /** Infrastructure alerts channel */
  infra?: string;
  /** Bug reports channel */
  bugs?: string;
  /** Suggestions / ideas channel */
  suggestions?: string;
  /** Project planning channel */
  projectPlanning?: string;
  /** Agent logs channel */
  agentLogs?: string;
  /** Ceremony announcements channel */
  ceremonies?: string;
  /** Content briefs channel */
  contentBriefs?: string;
}

// ============================================================================
// Discord Integration - Per-project Discord communication integration
// ============================================================================

/**
 * DiscordIntegrationConfig - Configuration for Discord communication integration
 *
 * When enabled, ProtoMaker events trigger Discord MCP tools to post updates,
 * create threads for agent work, and facilitate team communication.
 */
export interface DiscordIntegrationConfig {
  /** Enable Discord integration for this project */
  enabled: boolean;
  /** Discord server (guild) ID */
  serverId?: string;
  /** Discord channel ID for project updates */
  channelId?: string;
  /** Create Discord thread when agent starts working on feature (default: true) */
  createThreadsForAgents?: boolean;
  /** Post notification when feature completes successfully (default: true) */
  notifyOnCompletion?: boolean;
  /** Post notification when feature fails (default: true) */
  notifyOnError?: boolean;
  /** Post notification when auto-mode completes all features (default: true) */
  notifyOnAutoModeComplete?: boolean;
  /** Tag users/roles on critical events (e.g., "@team" or "<@123456>") */
  mentionOnError?: string;
  /** Use webhook for posting (faster, no bot required) */
  useWebhook?: boolean;
  /** Webhook ID (if useWebhook is true) */
  webhookId?: string;
  /** Webhook token (if useWebhook is true) */
  webhookToken?: string;
  /** User routing configuration - maps Discord usernames to agent types */
  userRouting?: Record<string, { agentType: string; enabled: boolean }>;
  /** Reaction abilities - emoji reactions mapped to signal intents */
  reactionAbilities?: ReactionAbility[];
  /** Discord channel signal sources - channels monitored for incoming signals */
  signalChannels?: DiscordChannelSignalConfig[];
  /** Channel workflows - context-based routing by channel */
  channelWorkflows?: ChannelWorkflow[];
  /** Consolidated channel ID map (replaces env vars) */
  channels?: DiscordChannelMap;
}

/** Default Discord integration settings - disabled by default */
export const DEFAULT_DISCORD_INTEGRATION: DiscordIntegrationConfig = {
  enabled: false,
  createThreadsForAgents: true,
  notifyOnCompletion: true,
  notifyOnError: true,
  notifyOnAutoModeComplete: true,
  useWebhook: false,
  userRouting: {},
};

// ============================================================================
// Google Integration - Google Calendar OAuth configuration
// ============================================================================

/**
 * GoogleIntegrationConfig - Configuration for Google Calendar OAuth integration
 */
export interface GoogleIntegrationConfig {
  /** OAuth2 access token */
  accessToken?: string;
  /** OAuth2 refresh token (for obtaining new access tokens) */
  refreshToken?: string;
  /** Token expiry timestamp (epoch ms) */
  tokenExpiry?: number;
  /** Google account email address */
  email?: string;
  /** Selected Google Calendar ID (defaults to 'primary') */
  calendarId?: string;
}

// ============================================================================
// Project Integrations - Container for all per-project integration configurations
// ============================================================================

/**
 * ProjectIntegrations - Container for all per-project integration configurations
 *
 * Extensible structure for adding new integrations (Slack, Jira, etc.) in the future.
 * Each integration can be independently enabled/disabled per project.
 */
export interface ProjectIntegrations {
  /** Discord team communication integration */
  discord?: DiscordIntegrationConfig;
  /** Google Calendar integration (OAuth2 tokens) */
  google?: GoogleIntegrationConfig;
}

// ============================================================================
// Error Tracking Settings - Sentry Integration
// ============================================================================

/**
 * ErrorTrackingSettings - Configuration for Sentry error tracking and monitoring
 *
 * Controls error reporting, performance monitoring, and privacy settings.
 * Users must explicitly opt-in (enabled: true) before any data is sent to Sentry.
 */
export interface ErrorTrackingSettings {
  /** Whether error tracking is enabled (user opt-in required, default: false) */
  enabled: boolean;
  /** Sentry DSN (Data Source Name) - optional override for environment variable */
  dsn?: string;
  /** Environment name for grouping errors (development, staging, production) */
  environment?: 'development' | 'staging' | 'production';
  /** Sample rate for performance tracing (0.0 - 1.0, default: 0.1) */
  tracesSampleRate?: number;
  /** Sample rate for profiling (0.0 - 1.0, default: 0.1) */
  profilesSampleRate?: number;
}

/**
 * IntegrationEventMapping - Maps ProtoMaker events to integration actions
 *
 * Used by the integration service to determine which MCP tools to invoke
 * when specific events occur. This is the glue between EventHooks and MCP tools.
 */
export interface IntegrationEventMapping {
  /** Event that triggers this integration action */
  event: EventHookTrigger;
  /** Which integration to use */
  integration: 'discord';
  /** Action to perform (maps to MCP tool) */
  action: 'send_message' | 'create_thread' | 'add_reaction';
  /** Optional condition function to determine if action should execute */
  condition?: string;
}
