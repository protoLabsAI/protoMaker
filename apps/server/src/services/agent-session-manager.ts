/**
 * AgentSessionManager — context-engine-backed session persistence.
 *
 * Wraps ConversationStore + ContextAssembler + LeafCompactor to provide
 * SQLite-backed conversation history with budget-constrained context assembly
 * and automatic compaction for long-running agent sessions.
 *
 * ## Session key strategy
 *   - Feature sessions:  keyed by featureId → deterministic across restarts
 *   - Regular sessions:  keyed by sessionId
 *
 * ## Compaction
 *   Compacted nodes are kept in memory for the process lifetime. On restart
 *   the full message history is re-assembled from the store; nodes will be
 *   regenerated on the next compaction trigger. This is a safe simplification
 *   for v1 — node persistence can be added later if restart-latency becomes
 *   a concern.
 *
 * ## Usage
 *   const manager = new AgentSessionManager(dataDir, anthropicApiKey);
 *   const convId = manager.getOrCreateConversation(featureId);
 *   const history = manager.assembleHistory(convId);   // before sending
 *   manager.ingestMessage(convId, 'user', userText);
 *   // ... execute provider ...
 *   manager.ingestMessage(convId, 'assistant', responseText);
 *   await manager.maybeCompact(convId);
 */

import path from 'path';
import * as fs from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { ConversationStore, type MessageRole, type MessageRow } from '@protolabsai/context-engine';
import {
  ContextAssembler,
  type AssembledMessage,
  type ContextItem,
} from '@protolabsai/context-engine';
import {
  LeafCompactor,
  type CompactedNode,
  type LLMCaller,
  type MessageToCompact,
} from '@protolabsai/context-engine';
import { createLogger } from '@protolabsai/utils';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Token budget for assembled context passed to the provider.
 * Leaves 20 000 tokens of headroom below the default 100 000 cap for system
 * prompts and the current user message.
 */
const CONTEXT_BUDGET_TOKENS = 80_000;

/**
 * Compaction is triggered when the stored conversation exceeds this many
 * tokens (4 chars/token heuristic, matching ConversationStore.estimateTokens).
 */
const COMPACTION_THRESHOLD_TOKENS = 25_000;

/**
 * The most-recent N raw (non-compacted) messages that are always kept verbatim
 * in the assembled context and are never fed into the compactor.
 */
const FRESH_TAIL_SIZE = 6;

/**
 * Minimum number of messages that must be compactable (outside the fresh tail)
 * before the compactor is invoked.
 */
const COMPACTION_MIN_FANOUT = 8;

/**
 * Model used for LLM-assisted compaction summaries.
 * Falls through to deterministic extraction if the call fails.
 */
const COMPACTION_MODEL = 'claude-haiku-4-5';

// ---------------------------------------------------------------------------
// AgentSessionManager
// ---------------------------------------------------------------------------

export class AgentSessionManager {
  private store: ConversationStore;
  private assembler: ContextAssembler;
  private compactor: LeafCompactor;
  private logger = createLogger('AgentSessionManager');

  /**
   * In-memory index: session/feature key → SQLite conversation ID.
   * Populated lazily; looked up in the store when a key is first seen.
   */
  private keyToConversationId = new Map<string, string>();

  /**
   * In-memory compacted nodes per conversation.
   * Key: conversationId  →  Value: nodes in ascending chronological order.
   */
  private compactedNodes = new Map<string, CompactedNode[]>();

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  /**
   * @param dataDir      Top-level data directory for the server.
   *                     The SQLite DB is opened at `<dataDir>/context-engine/conversations.db`.
   * @param anthropicApiKey  Optional Anthropic API key for LLM-assisted compaction.
   *                         When absent the compactor falls back to deterministic extraction.
   */
  constructor(dataDir: string, anthropicApiKey?: string) {
    // Ensure the context-engine directory exists
    const dbDir = path.join(dataDir, 'context-engine');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Open the conversation store
    this.store = new ConversationStore();
    this.store.open(path.join(dbDir, 'conversations.db'));

    // Build a budget-aware assembler
    this.assembler = new ContextAssembler({
      budgetTokens: CONTEXT_BUDGET_TOKENS,
      recallGuidanceRole: 'user', // ensure recall guidance fits in conversation history (user|assistant only)
    });

    // Build the LLM caller for compaction (or fall back to deterministic)
    const llmCaller: LLMCaller = anthropicApiKey
      ? this.buildAnthropicLlmCaller(anthropicApiKey)
      : async () => {
          throw new Error('No Anthropic API key configured; using deterministic compaction');
        };

    this.compactor = new LeafCompactor(llmCaller);

    this.logger.info('AgentSessionManager initialised');
  }

  // ---------------------------------------------------------------------------
  // Conversation management
  // ---------------------------------------------------------------------------

  /**
   * Returns the SQLite conversationId for the given key, creating a new
   * conversation if none exists yet.
   *
   * @param key    Unique identifier — typically `featureId` or `sessionId`.
   * @param title  Human-readable title stored on the conversation (optional).
   */
  getOrCreateConversation(key: string, title?: string): string {
    // Fast-path: in-memory cache hit
    const cached = this.keyToConversationId.get(key);
    if (cached) return cached;

    // Slow-path: look for an existing conversation tagged with this key
    const conversations = this.store.listConversations(500);
    const existing = conversations.find((c) => (c.metadata as Record<string, unknown>).key === key);

    if (existing) {
      this.keyToConversationId.set(key, existing.id);
      this.logger.info(`Resumed conversation ${existing.id} for key "${key}"`);
      return existing.id;
    }

    // Create a new conversation
    const conv = this.store.createConversation({
      title: title ?? key,
      metadata: { key },
    });

    this.keyToConversationId.set(key, conv.id);
    this.logger.info(`Created conversation ${conv.id} for key "${key}"`);
    return conv.id;
  }

  // ---------------------------------------------------------------------------
  // Message ingestion
  // ---------------------------------------------------------------------------

  /**
   * Persists a single message turn into the conversation store.
   * Non-throwing — errors are logged and swallowed so agent execution continues.
   */
  ingestMessage(conversationId: string, role: MessageRole, content: string): void {
    if (!content?.trim()) return;

    try {
      this.store.createMessage(conversationId, {
        role,
        parts: [{ type: 'text', content }],
      });
    } catch (error) {
      this.logger.error(
        `Failed to ingest ${role} message for conversation ${conversationId}:`,
        error
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Compaction
  // ---------------------------------------------------------------------------

  /**
   * Checks whether the conversation has exceeded the compaction threshold.
   * If so, runs leaf compaction and caches the resulting nodes in memory.
   *
   * Non-throwing — compaction failures are logged and the method returns
   * without modifying state, ensuring the agent can continue operating.
   */
  async maybeCompact(conversationId: string): Promise<void> {
    const totalTokens = this.store.getTotalTokens(conversationId);

    if (totalTokens < COMPACTION_THRESHOLD_TOKENS) {
      return;
    }

    const messages = this.store.listMessages(conversationId, { limit: 2000 });
    if (messages.length < COMPACTION_MIN_FANOUT + FRESH_TAIL_SIZE) {
      return; // not enough messages to compact
    }

    // Build the input list, skipping already-compacted messages
    const existingNodes = this.compactedNodes.get(conversationId) ?? [];
    const compactedIdSet = new Set(existingNodes.flatMap((n) => n.sourceIds));
    const rawMessages = messages.filter((m) => !compactedIdSet.has(m.id));

    if (rawMessages.length < COMPACTION_MIN_FANOUT + FRESH_TAIL_SIZE) {
      return; // nothing new to compact
    }

    const toCompact: MessageToCompact[] = rawMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: this.extractText(m),
      tokens: m.totalTokens,
    }));

    try {
      const result = await this.compactor.compact(toCompact, {
        leafChunkTokens: COMPACTION_THRESHOLD_TOKENS,
        leafMinFanout: COMPACTION_MIN_FANOUT,
        freshTailSize: FRESH_TAIL_SIZE,
      });

      if (!result || result.nodes.length === 0) return;

      // Append new nodes to the in-memory cache
      const updated = [...existingNodes, ...result.nodes];
      this.compactedNodes.set(conversationId, updated);

      this.logger.info(
        `Compacted ${result.compactedIds.length} messages into ${result.nodes.length} node(s) ` +
          `for conversation ${conversationId} (total nodes: ${updated.length})`
      );
    } catch (error) {
      this.logger.error(`Compaction failed for conversation ${conversationId}:`, error);
    }
  }

  // ---------------------------------------------------------------------------
  // Context assembly
  // ---------------------------------------------------------------------------

  /**
   * Assembles the prior conversation turns into a budget-constrained list
   * suitable for use as `conversationHistory` in a provider `ExecuteOptions`.
   *
   * The returned array contains only `user` and `assistant` role messages
   * (the Anthropic API's supported roles for conversation history).
   *
   * Oldest summaries are dropped first when the token budget is exceeded;
   * the fresh tail is always preserved.
   */
  assembleHistory(conversationId: string): Array<{ role: 'user' | 'assistant'; content: string }> {
    const messages = this.store.listMessages(conversationId, { limit: 2000 });
    if (messages.length === 0) return [];

    const nodes = this.compactedNodes.get(conversationId) ?? [];
    const compactedIdSet = new Set(nodes.flatMap((n) => n.sourceIds));

    // Split into compacted (represented by nodes) and raw (verbatim) messages
    const rawMessages: MessageRow[] = messages.filter((m) => !compactedIdSet.has(m.id));

    // Mark the fresh tail
    const tailStart = Math.max(0, rawMessages.length - FRESH_TAIL_SIZE);

    // Build ContextItem[] in ascending position order
    const items: ContextItem[] = [];
    let pos = 0;

    // Summary items first (represent earlier compacted spans)
    for (const node of nodes) {
      items.push({ kind: 'summary', node, position: pos++ });
    }

    // Raw message items (non-tail first, then tail)
    for (let i = 0; i < rawMessages.length; i++) {
      items.push({
        kind: 'message',
        message: rawMessages[i],
        position: pos++,
        isFreshTail: i >= tailStart,
      });
    }

    const result = this.assembler.assemble(items);

    // Map to conversationHistory format.
    // 'system' role (recall guidance) is treated as 'user' since conversation
    // history in the Anthropic SDK only accepts user/assistant turns.
    return result.messages.map((m: AssembledMessage) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content,
    }));
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Closes the underlying SQLite database connection.
   * Call this when the server is shutting down.
   */
  close(): void {
    this.store.close();
    this.logger.info('AgentSessionManager closed');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds an LLM caller backed by the Anthropic SDK (claude-haiku).
   * Falls through to deterministic compaction if the call throws.
   */
  private buildAnthropicLlmCaller(apiKey: string): LLMCaller {
    const client = new Anthropic({ apiKey });

    return async (system: string, user: string): Promise<string> => {
      const response = await client.messages.create({
        model: COMPACTION_MODEL,
        max_tokens: 2048,
        system,
        messages: [{ role: 'user', content: user }],
      });

      const block = response.content[0];
      if (!block || block.type !== 'text') {
        throw new Error('Unexpected compaction response: no text block');
      }
      return block.text;
    };
  }

  /**
   * Extracts the plain text content from a MessageRow by joining all text parts.
   */
  private extractText(message: MessageRow): string {
    return message.parts
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('\n');
  }
}
