/**
 * Ava Channel types — private multi-instance communication channel.
 *
 * The Ava Channel is an append-only, daily-sharded message log shared across
 * all mesh instances via CRDT sync. Messages are never edited or deleted.
 */

/** Role of the message sender */
export type AvaChatRole = 'system' | 'user' | 'assistant' | 'agent';

/** A single message in the Ava Channel */
export interface AvaChatMessage {
  /** Unique message ID (UUID v4) */
  id: string;
  /** Message content (plain text or markdown) */
  content: string;
  /** Role of the sender */
  role: AvaChatRole;
  /** Instance that originated this message */
  instanceId: string;
  /** Human-readable sender name (instance ID, agent name, or user name) */
  sender: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Optional structured metadata */
  metadata?: Record<string, unknown>;
}

/** Non-CRDT view of an Ava Channel document (used outside libs/crdt) */
export interface AvaChannelDocument {
  schemaVersion: 1;
  messages: AvaChatMessage[];
  date: string;
}

/** Context passed to AvaChannelService for message attribution */
export interface AvaChannelContext {
  instanceId: string;
  sender: string;
  role: AvaChatRole;
}

/** Options for posting a message */
export interface PostMessageOptions {
  /** Override the date shard (defaults to today) */
  date?: string;
  /** Structured metadata to attach to the message */
  metadata?: Record<string, unknown>;
}

/** Options for retrieving messages */
export interface GetMessagesOptions {
  /** Date shard to query (YYYY-MM-DD, defaults to today) */
  date?: string;
  /** Maximum number of messages to return (most recent first) */
  limit?: number;
  /** Only return messages after this ISO timestamp */
  after?: string;
}

/** Query options for multi-day channel history */
export interface AvaChannelQueryOptions {
  /** Start date (inclusive, YYYY-MM-DD) */
  from?: string;
  /** End date (inclusive, YYYY-MM-DD, defaults to today) */
  to?: string;
  /** Filter by role */
  role?: AvaChatRole;
  /** Filter by instance ID */
  instanceId?: string;
  /** Maximum total messages to return */
  limit?: number;
}
