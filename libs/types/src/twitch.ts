/**
 * Twitch Types - Types for Twitch chat integration
 *
 * Defines the structure for Twitch chat suggestions, settings, and service configuration.
 */

/**
 * TwitchSuggestion - A single suggestion received from Twitch chat
 *
 * Persisted to JSONL file (.automaker/twitch/suggestions.jsonl) as append-only log.
 */
export interface TwitchSuggestion {
  /** Unique identifier for this suggestion */
  id: string;
  /** Twitch username of the person who made the suggestion */
  username: string;
  /** The suggestion text (parsed from !idea command) */
  suggestion: string;
  /** ISO timestamp when suggestion was received */
  timestamp: string;
  /** Twitch channel where suggestion was made */
  channel: string;
  /** Whether this suggestion has been processed/acknowledged */
  processed?: boolean;
}

/**
 * TwitchSettings - Configuration for Twitch chat integration
 *
 * Stored in project settings or global settings for enabling Twitch features.
 */
export interface TwitchSettings {
  /** Whether Twitch integration is enabled (default: false) */
  enabled: boolean;
  /** Twitch channel name to connect to (without #) */
  channelName?: string;
  /** Minimum account age in days to prevent spam (default: 7) */
  minAccountAgeDays?: number;
  /** Rate limit cooldown per user in seconds (default: 60) */
  rateLimitSeconds?: number;
  /** Path to suggestions JSONL file (relative to .automaker/) */
  suggestionsFilePath?: string;
  /** Bot username (for authentication) */
  botUsername?: string;
}

/**
 * Default Twitch settings - disabled by default
 */
export const DEFAULT_TWITCH_SETTINGS: TwitchSettings = {
  enabled: false,
  minAccountAgeDays: 7,
  rateLimitSeconds: 60,
  suggestionsFilePath: 'twitch/suggestions.jsonl',
};
