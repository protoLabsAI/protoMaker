/**
 * Ava Channel types — private multi-instance communication channel.
 *
 * Messages are stored as append-only Automerge list CRDTs, sharded by day
 * (doc:ava-channel/YYYY-MM-DD). No messageType enum — the content IS the protocol.
 */

/**
 * Optional structured context attached to an Ava Channel message.
 * Used for machine-readable context alongside free-form content.
 */
export interface AvaChannelContext {
  /** Feature ID this message relates to */
  featureId?: string;
  /** Human-readable board summary at time of message */
  boardSummary?: string;
  /** Instance capacity snapshot at time of message */
  capacity?: {
    runningAgents: number;
    maxAgents: number;
    backlogCount: number;
  };
}

/**
 * A single message in the Ava Channel.
 *
 * Messages are append-only — never edited or deleted.
 * The content field is free-form natural language; no messageType enum.
 */
export interface AvaChatMessage {
  /** Unique message ID (UUID or timestamp-based) */
  id: string;
  /** Instance ID of the originating node */
  instanceId: string;
  /** Human-readable instance name */
  instanceName: string;
  /** Free-form natural language content — this IS the protocol */
  content: string;
  /** Optional structured context for machine-readable metadata */
  context?: AvaChannelContext;
  /** Message source: 'ava' = AI, 'operator' = human, 'system' = automated */
  source: 'ava' | 'operator' | 'system';
  /** ISO 8601 timestamp */
  timestamp: string;
}

/**
 * CRDT document shape for a single daily Ava Channel shard.
 * Document key: doc:ava-channel/YYYY-MM-DD
 */
export interface AvaChannelDocument {
  schemaVersion: 1;
  _meta: {
    instanceId: string;
    createdAt: string;
    updatedAt: string;
  };
  /** Append-only list of messages for this day */
  messages: AvaChatMessage[];
  /** Date shard key (YYYY-MM-DD) */
  date: string;
}

/**
 * Options for AvaChannelService.postMessage()
 */
export interface PostMessageOptions {
  /** Override the instance name (defaults to hostname) */
  instanceName?: string;
  /** Optional structured context */
  context?: AvaChannelContext;
}

/**
 * Options for AvaChannelService.getMessages()
 */
export interface GetMessagesOptions {
  /** Start of time range (inclusive) */
  from?: Date;
  /** End of time range (inclusive) */
  to?: Date;
  /** Filter to messages from a specific instance */
  instanceId?: string;
  /** Filter to messages from a specific source */
  source?: 'ava' | 'operator' | 'system';
}
