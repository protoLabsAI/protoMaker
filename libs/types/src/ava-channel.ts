/**
 * Ava Channel types — private multi-instance communication channel.
 *
 * Messages are stored as append-only Automerge list CRDTs, sharded by day
 * (doc:ava-channel/YYYY-MM-DD). No messageType enum — the content IS the protocol.
 */

/**
 * Intent of a message in the Ava Channel.
 * Used by the reactor classifier chain to route and prioritize messages.
 *
 * - 'request'      — Asking another instance to do something
 * - 'inform'       — Status broadcast; no response expected (auto-posts use this)
 * - 'response'     — Reply to a prior request
 * - 'coordination' — Multi-instance coordination (locking, voting, handoffs)
 * - 'escalation'   — Requesting human or supervisor intervention
 * - 'system_alert' — Automated alert from infrastructure (errors, thresholds)
 */
export type MessageIntent =
  | 'request'
  | 'inform'
  | 'response'
  | 'coordination'
  | 'escalation'
  | 'system_alert';

/**
 * A single rule in the message classifier chain.
 * Rules are evaluated in order; the first match determines the intent.
 */
export interface MessageClassifierRule {
  /** Regex pattern matched against the message content (case-insensitive) */
  pattern?: string;
  /** Intent assigned when this rule matches */
  intent: MessageIntent;
  /** Optional human-readable description of the rule's purpose */
  description?: string;
  /** Source filter — only applies if the message source matches */
  source?: 'ava' | 'operator' | 'system';
}

/**
 * Context provided to the message classifier chain when classifying a message.
 */
export type ClassificationContext = {
  /** The message being classified */
  message: AvaChatMessage;
  /** Recent messages in the same conversation thread (for context-aware classification) */
  recentMessages?: AvaChatMessage[];
  /** ID of the instance running the classification */
  instanceId?: string;
};

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
  /** Intent classification — what kind of message this is */
  intent?: MessageIntent;
  /** ID of the message this is replying to (for threaded conversations) */
  inReplyTo?: string;
  /** Whether the sender expects a response to this message */
  expectsResponse?: boolean;
  /** Depth in a conversation thread (0 = root message) */
  conversationDepth?: number;
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
  /** Intent of this message — for classifier chain routing */
  intent?: MessageIntent;
  /** Whether this message expects a response from other instances */
  expectsResponse?: boolean;
}

// ---------------------------------------------------------------------------
// Work-stealing protocol message types
// ---------------------------------------------------------------------------

/**
 * Capacity heartbeat broadcast by each reactor instance every 60 seconds.
 * Carries enough information for peers to decide whether to request work.
 */
export interface CapacityHeartbeat {
  /** Originating instance ID */
  instanceId: string;
  /** Human-readable role / instance name */
  role: string;
  /** Number of features currently in backlog on this instance */
  backlogCount: number;
  /** Number of features currently active (running agents) on this instance */
  activeCount: number;
  /** Maximum concurrent agents this instance supports */
  maxConcurrency: number;
  /** CPU load percentage (0-100) */
  cpuLoad: number;
  /** Memory used as a percentage of total (0-100) */
  memoryUsed: number;
}

/**
 * Sent by an idle instance to a peer that has backlog features.
 * Requests up to `maxFeatures` features to steal.
 */
export interface WorkRequest {
  /** Instance requesting work */
  requestingInstanceId: string;
  /** Instance being requested (must match the peer's instanceId) */
  targetInstanceId: string;
  /** Maximum features to steal in this cycle (capped at 2) */
  maxFeatures: number;
}

/**
 * Response from the peer after a work_request.
 * Contains feature IDs and full feature descriptors that were transferred.
 */
export interface WorkOffer {
  /** Instance that is offering work */
  offeringInstanceId: string;
  /** Instance that requested the work */
  requestingInstanceId: string;
  /** IDs of the features being offered */
  featureIds: string[];
  /** Full feature JSON for each offered feature */
  features: Record<string, unknown>[];
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
