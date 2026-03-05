/**
 * Signal channel types for provenance tracking
 *
 * Identifies the originating channel of a signal (feature request, message, etc.)
 * and carries routing context for replies.
 */

/**
 * Identifies the originating channel of a signal.
 * Used to track where a feature request came from and where replies should go.
 */
export type SignalChannel = 'discord' | 'github' | 'mcp' | 'ui';

/**
 * Metadata describing the origin of a signal and routing context for replies.
 * Fields are optional — populate only what is available for the given channel.
 */
export interface SignalMetadata {
  /** The originating channel */
  channel: SignalChannel;
  /** Channel-specific identifier (e.g. Discord channel ID) */
  channelId?: string;
  /** Human-readable channel name */
  channelName?: string;
  /** Discord/platform message ID */
  messageId?: string;
  /** Thread ID (e.g. Discord thread ID) */
  threadId?: string;
  /** ID of the user who originated the signal */
  userId?: string;
  /** Username/handle of the user who originated the signal */
  username?: string;
}
