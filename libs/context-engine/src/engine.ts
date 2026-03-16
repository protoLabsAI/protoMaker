/**
 * ContextEngine interface — the public contract for the context-engine package.
 *
 * Implementations manage a conversation's full message history, compact it
 * into a DAG of summaries when needed, and assemble a token-budget-aware
 * context window for the next LLM call.
 */

import type {
  AssemblyResult,
  CompactionConfig,
  ContextItem,
  Message,
  MessageId,
  SessionId,
  SummaryNode,
  SummaryNodeId,
} from './types.js';

// ---------------------------------------------------------------------------
// Retrieve options
// ---------------------------------------------------------------------------

/** Options controlling a retrieve() call. */
export interface RetrieveOptions {
  /** Maximum number of items to return. */
  maxItems?: number;
  /** Semantic query used to rank relevance (optional). */
  query?: string;
  /** If true, include summary nodes as well as raw messages. */
  includeSummaries?: boolean;
}

// ---------------------------------------------------------------------------
// Compact options
// ---------------------------------------------------------------------------

/** Options controlling a compact() call. */
export interface CompactOptions {
  /**
   * Force compaction even if the context threshold has not been reached.
   * @default false
   */
  force?: boolean;
  /**
   * Override the DAG depth limit for this pass.
   * Falls back to CompactionConfig.incrementalMaxDepth when omitted.
   */
  maxDepth?: number;
}

// ---------------------------------------------------------------------------
// Assemble options
// ---------------------------------------------------------------------------

/** Options controlling an assemble() call. */
export interface AssembleOptions {
  /**
   * Maximum token budget for the assembled context window.
   * The engine will not exceed this limit.
   */
  tokenBudget: number;
  /**
   * If true, prefer verbatim messages over summary nodes when there is room.
   * @default true
   */
  preferVerbatim?: boolean;
  /**
   * Additional system-level context items to prepend before the conversation.
   */
  systemItems?: ContextItem[];
}

// ---------------------------------------------------------------------------
// ContextEngine interface
// ---------------------------------------------------------------------------

/**
 * The primary interface for interacting with the context engine.
 *
 * @example
 * ```ts
 * const engine: ContextEngine = createContextEngine({ config, sessionId });
 *
 * await engine.ingest([userMessage, assistantMessage]);
 * await engine.compact();
 * const result = await engine.assemble({ tokenBudget: 8000 });
 * ```
 */
export interface ContextEngine {
  /** The session this engine instance is scoped to. */
  readonly sessionId: SessionId;

  /** The active compaction configuration. */
  readonly config: CompactionConfig;

  // -------------------------------------------------------------------------
  // Mutation
  // -------------------------------------------------------------------------

  /**
   * Ingest one or more new messages into the engine's history store.
   * Messages must belong to this engine's sessionId.
   *
   * @param messages - One or more messages to add (order is preserved).
   * @returns Resolves when all messages have been persisted.
   */
  ingest(messages: Message[]): Promise<void>;

  // -------------------------------------------------------------------------
  // Compaction
  // -------------------------------------------------------------------------

  /**
   * Run a compaction pass over the stored message history.
   *
   * The engine examines messages outside the fresh-tail window and merges them
   * into summary DAG nodes according to the configured fanout parameters.
   * Compaction is a no-op when the context threshold has not been reached,
   * unless `options.force` is set.
   *
   * @param options - Optional overrides for this compaction pass.
   * @returns The number of new SummaryNodes created during this pass.
   */
  compact(options?: CompactOptions): Promise<number>;

  // -------------------------------------------------------------------------
  // Assembly
  // -------------------------------------------------------------------------

  /**
   * Assemble an ordered list of context items that fit within the given token
   * budget.
   *
   * The engine always includes:
   * 1. Provided system items (prepended).
   * 2. Summary nodes covering older history (most-condensed first).
   * 3. Verbatim messages from the fresh tail.
   *
   * @param options - Token budget and assembly preferences.
   * @returns The assembled context window.
   */
  assemble(options: AssembleOptions): Promise<AssemblyResult>;

  // -------------------------------------------------------------------------
  // Retrieval
  // -------------------------------------------------------------------------

  /**
   * Retrieve the most relevant context items for an optional query.
   *
   * Unlike assemble(), retrieve() returns items ranked by relevance rather
   * than strict chronological order, and does not enforce a token budget.
   * Useful for RAG-style augmentation where only the most pertinent history
   * is needed.
   *
   * @param options - Retrieval options including optional semantic query.
   * @returns Ordered array of context items ranked by relevance.
   */
  retrieve(options?: RetrieveOptions): Promise<ContextItem[]>;

  // -------------------------------------------------------------------------
  // Inspection
  // -------------------------------------------------------------------------

  /**
   * Return all raw messages currently stored for this session.
   * Messages are returned in ascending chronological order.
   */
  getMessages(): Promise<Message[]>;

  /**
   * Return a specific message by id.
   * Returns undefined when the id is not found.
   */
  getMessage(id: MessageId): Promise<Message | undefined>;

  /**
   * Return all SummaryNodes in the DAG, ordered depth-first.
   */
  getSummaryNodes(): Promise<SummaryNode[]>;

  /**
   * Return a specific SummaryNode by id.
   * Returns undefined when the id is not found.
   */
  getSummaryNode(id: SummaryNodeId): Promise<SummaryNode | undefined>;

  /**
   * Return the approximate total token count of all stored messages and
   * summary nodes that are not yet condensed.
   */
  getTokenCount(): Promise<number>;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Clear all messages and summary nodes for this session.
   * Does not reset configuration.
   */
  clear(): Promise<void>;
}
