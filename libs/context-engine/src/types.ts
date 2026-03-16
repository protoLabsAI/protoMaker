/**
 * Core type definitions for the context-engine DAG model.
 *
 * The context engine manages conversation history through a directed acyclic
 * graph (DAG) of summaries, enabling efficient compaction of long conversations
 * while preserving semantically relevant content.
 */

// ---------------------------------------------------------------------------
// Primitive identifiers
// ---------------------------------------------------------------------------

export type MessageId = string;
export type SummaryNodeId = string;
export type SessionId = string;

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

/** A single turn in a conversation. */
export interface Message {
  /** Unique identifier for this message. */
  id: MessageId;
  /** Conversation session this message belongs to. */
  sessionId: SessionId;
  /** The role of the author. */
  role: 'user' | 'assistant' | 'system' | 'tool';
  /** Text content of the message. */
  content: string;
  /** Wall-clock timestamp (ms since epoch) when the message was created. */
  createdAt: number;
  /** Approximate token count for this message. */
  tokenCount?: number;
  /** Tool call identifier when role is 'tool'. */
  toolCallId?: string;
  /** Arbitrary metadata attached by the caller. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Summary DAG
// ---------------------------------------------------------------------------

/**
 * The condensed representation of one or more messages or child summaries.
 * Summaries are the leaves and internal nodes of the compaction DAG.
 */
export interface Summary {
  /** Unique identifier for this summary. */
  id: SummaryNodeId;
  /** Natural-language condensation of the covered messages. */
  content: string;
  /** Total approximate token count for the condensed content. */
  tokenCount: number;
  /** Creation timestamp (ms since epoch). */
  createdAt: number;
  /** IDs of the messages that were directly summarised into this node. */
  coveredMessageIds: MessageId[];
  /** IDs of child SummaryNodes whose content is further condensed here. */
  childSummaryIds: SummaryNodeId[];
  /** Depth in the DAG: 0 = leaf (covers raw messages). */
  depth: number;
}

/**
 * A node in the compaction DAG.
 * Wraps a Summary with structural pointers used during assembly.
 */
export interface SummaryNode {
  summary: Summary;
  /** Parent node id, or null for root nodes. */
  parentId: SummaryNodeId | null;
  /** Whether this node has been superseded by a higher-level condensation. */
  condensed: boolean;
}

// ---------------------------------------------------------------------------
// Context assembly
// ---------------------------------------------------------------------------

/**
 * A single item contributed to an assembled context window.
 * May originate from a raw Message or a SummaryNode.
 */
export interface ContextItem {
  /** Discriminant: raw message or a summary node. */
  kind: 'message' | 'summary';
  /** Source message (when kind === 'message'). */
  message?: Message;
  /** Source summary node (when kind === 'summary'). */
  summaryNode?: SummaryNode;
  /** Resolved text that will be included in the prompt. */
  content: string;
  /** Approximate token count for this item. */
  tokenCount: number;
  /** Chronological order within the assembled result. */
  order: number;
}

// ---------------------------------------------------------------------------
// Compaction configuration
// ---------------------------------------------------------------------------

/**
 * All knobs controlling the compaction and assembly behaviour of a
 * ContextEngine instance.
 */
export interface CompactionConfig {
  /**
   * Number of most-recent raw messages to always keep verbatim (the "fresh
   * tail"). These are never compacted regardless of budget pressure.
   * @default 20
   */
  freshTailCount: number;

  /**
   * Fraction of the total token budget at which compaction is triggered.
   * E.g. 0.8 means compact when the context window is 80 % full.
   * @default 0.8
   */
  contextThreshold: number;

  /**
   * Minimum number of raw messages that must exist before a leaf-level
   * summary is created. Prevents over-eager compaction of short exchanges.
   * @default 5
   */
  leafMinFanout: number;

  /**
   * Minimum number of child summaries required before they can be condensed
   * into a single parent summary.
   * @default 3
   */
  condensedMinFanout: number;

  /**
   * Maximum DAG depth explored during an incremental compaction pass. Limits
   * the amount of work done per compaction cycle.
   * @default 4
   */
  incrementalMaxDepth: number;
}

/** Sensible defaults for CompactionConfig. */
export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  freshTailCount: 20,
  contextThreshold: 0.8,
  leafMinFanout: 5,
  condensedMinFanout: 3,
  incrementalMaxDepth: 4,
};

// ---------------------------------------------------------------------------
// Assembly result
// ---------------------------------------------------------------------------

/** The output of a call to ContextEngine.assemble(). */
export interface AssemblyResult {
  /** Ordered list of items that make up the assembled context window. */
  items: ContextItem[];
  /** Total token count across all items. */
  totalTokenCount: number;
  /** Maximum token budget that was used for assembly. */
  tokenBudget: number;
  /** Whether the assembled context fits within the budget. */
  withinBudget: boolean;
  /** Number of raw messages that are represented verbatim. */
  verbatimMessageCount: number;
  /** Number of summary nodes included in the assembly. */
  summaryNodeCount: number;
}
