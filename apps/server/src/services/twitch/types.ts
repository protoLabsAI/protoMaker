/**
 * Internal types for TwitchService
 */

/**
 * Rate limit tracking for users
 */
export interface RateLimitEntry {
  lastCommandTime: number;
}

/**
 * Parsed !idea command
 */
export interface ParsedIdeaCommand {
  suggestion: string;
  username: string;
}
