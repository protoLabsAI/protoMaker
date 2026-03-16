/**
 * ContextExpander — bounded DAG walk for full content retrieval.
 *
 * Given a node ID (from an `[lcm_expand: <id>]` footer in the context window),
 * retrieves the original content up to a configurable `tokenCap`:
 *
 *   - **large_file nodes**: returns the stored `original_content` directly.
 *   - **depth=0 context_nodes** (CompactedNode): retrieves all source messages from
 *     `message_parts`, concatenated in order.
 *   - **depth≥1 context_nodes** (CondensedNode): recursively expands source nodes down
 *     to the leaf messages, collecting text as it goes.
 *
 * Expansion terminates early (setting `truncated=true`) when:
 *   - `tokenCap` is reached, or
 *   - the `ttlMs` wall-clock deadline is exceeded.
 *
 * ## ContextNodeStore
 *
 * `ContextNodeStore` is a companion class for persisting `CompactedNode` and
 * `CondensedNode` objects produced by `LeafCompactor` / `CondensationEngine` to the
 * `context_nodes` SQLite table, making them available for later retrieval via
 * `lcm_describe` and `lcm_expand`.
 *
 * Wire it into your workflow:
 * ```typescript
 * const result = await leafCompactor.compact(messages, config);
 * if (result) {
 *   nodeStore.saveNodes(result.nodes);
 * }
 * ```
 *
 * Tool: `lcm_expand`
 */

import * as BetterSqlite3 from 'better-sqlite3';
import { createLogger } from '@protolabsai/utils';
import { estimateTokens } from '../store/conversation-store.js';

const logger = createLogger('ContextExpander');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default token cap for expand results (~50 K tokens). */
export const DEFAULT_EXPAND_TOKEN_CAP = 50_000;

/** Default wall-clock deadline for a single expand call (10 seconds). */
export const DEFAULT_EXPAND_TTL_MS = 10_000;

// ---------------------------------------------------------------------------
// ContextNodeStore — persistence for CompactedNode / CondensedNode
// ---------------------------------------------------------------------------

/**
 * A node that can be persisted to the `context_nodes` table.
 * Matches the shape of both `CompactedNode` (depth=0) and `CondensedNode` (depth≥1).
 */
export interface StorableNode {
  /** UUID from the compactor/condensation engine. */
  id: string;
  /** Conversation this node belongs to. */
  conversationId?: string;
  /** 0 for leaf (CompactedNode), 1+ for condensed (CondensedNode). */
  depth: number;
  /** Compact summary text. */
  summary: string;
  /** Expand footer injected into the context window. */
  expandFooter: string;
  /**
   * IDs of the items compressed into this node:
   *   - depth=0: message IDs
   *   - depth≥1: context_node IDs
   */
  sourceIds: string[];
  /** Token count of the original content before compaction. */
  originalTokens: number;
  /** Token count of this summary + footer. */
  summaryTokens: number;
  /** Compaction mode (depth=0 only): 'normal' | 'aggressive' | 'deterministic'. */
  mode?: string;
}

interface DbContextNode {
  id: string;
  conversation_id: string | null;
  depth: number;
  summary: string;
  expand_footer: string;
  source_ids: string;
  original_tokens: number;
  summary_tokens: number;
  mode: string | null;
  stored_at: string;
}

/**
 * Persists and retrieves `CompactedNode` / `CondensedNode` objects to/from the
 * `context_nodes` SQLite table.
 *
 * Use `saveNodes()` after each compaction/condensation pass to keep the DB in sync
 * with the in-memory node collection.
 */
export class ContextNodeStore {
  constructor(private readonly db: BetterSqlite3.Database) {}

  /**
   * Persist a single node.  Uses INSERT OR REPLACE so calling this with an
   * existing ID is safe (idempotent update).
   */
  saveNode(node: StorableNode): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT OR REPLACE INTO context_nodes
           (id, conversation_id, depth, summary, expand_footer, source_ids,
            original_tokens, summary_tokens, mode, stored_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        node.id,
        node.conversationId ?? null,
        node.depth,
        node.summary,
        node.expandFooter,
        JSON.stringify(node.sourceIds),
        node.originalTokens,
        node.summaryTokens,
        node.mode ?? null,
        now,
        '{}'
      );
    logger.debug(`ContextNodeStore: saved node id=${node.id} depth=${node.depth}`);
  }

  /**
   * Persist multiple nodes in a single transaction.
   */
  saveNodes(nodes: StorableNode[]): void {
    const tx = this.db.transaction(() => {
      for (const node of nodes) {
        this.saveNode(node);
      }
    });
    tx();
    logger.debug(`ContextNodeStore: saved ${nodes.length} nodes`);
  }

  /**
   * Retrieve a node by ID, or null if not found.
   */
  getNode(id: string): StorableNode | null {
    const row = this.db.prepare('SELECT * FROM context_nodes WHERE id = ?').get(id) as
      | DbContextNode
      | undefined;

    return row ? this.mapRow(row) : null;
  }

  /**
   * Delete a node by ID.
   * @returns true if a row was deleted, false if not found.
   */
  deleteNode(id: string): boolean {
    const result = this.db.prepare('DELETE FROM context_nodes WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * List all nodes for a conversation ordered by stored_at ascending.
   */
  listForConversation(conversationId: string): StorableNode[] {
    const rows = this.db
      .prepare('SELECT * FROM context_nodes WHERE conversation_id = ? ORDER BY stored_at ASC')
      .all(conversationId) as DbContextNode[];

    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: DbContextNode): StorableNode {
    let sourceIds: string[];
    try {
      sourceIds = JSON.parse(row.source_ids) as string[];
    } catch {
      sourceIds = [];
    }

    return {
      id: row.id,
      conversationId: row.conversation_id ?? undefined,
      depth: row.depth,
      summary: row.summary,
      expandFooter: row.expand_footer,
      sourceIds,
      originalTokens: row.original_tokens,
      summaryTokens: row.summary_tokens,
      mode: row.mode ?? undefined,
    };
  }
}

// ---------------------------------------------------------------------------
// ContextExpander — public types
// ---------------------------------------------------------------------------

export interface ExpandOptions {
  /** UUID from an `[lcm_expand: <id>]` reference in the context window. */
  nodeId: string;
  /**
   * Optional focused question.  When provided, a focus hint is prepended to the
   * returned content so downstream consumers know the retrieval intent.
   */
  question?: string;
  /** Maximum tokens to include in the returned content (default: 50 000). */
  tokenCap?: number;
  /** Maximum wall-clock time for the DAG walk in milliseconds (default: 10 000). */
  ttlMs?: number;
}

export interface ExpandResult {
  /** The node ID that was expanded. */
  nodeId: string;
  /** Whether the node came from large_files or context_nodes. */
  nodeType: 'large_file' | 'context_node';
  /**
   * Full expanded content, possibly truncated.
   * Includes a focus-question header when `question` was provided.
   */
  content: string;
  /** True when output was cut short by `tokenCap` or `ttlMs`. */
  truncated: boolean;
  /** Estimated token count of the returned content. */
  tokens: number;
  /**
   * Number of leaf source items (messages) that were expanded.
   * For large_file this is always 1.
   */
  sourceCount: number;
}

// ---------------------------------------------------------------------------
// ContextExpander
// ---------------------------------------------------------------------------

export class ContextExpander {
  constructor(private readonly db: BetterSqlite3.Database) {}

  /**
   * Expand a node to its full content.
   *
   * Automatically detects whether the ID belongs to a `large_files` row or a
   * `context_nodes` row and handles each case appropriately.
   *
   * @returns ExpandResult, or null if the ID is not found in either table.
   */
  expand(options: ExpandOptions): ExpandResult | null {
    const tokenCap = options.tokenCap ?? DEFAULT_EXPAND_TOKEN_CAP;
    const ttlMs = options.ttlMs ?? DEFAULT_EXPAND_TTL_MS;
    const deadline = Date.now() + ttlMs;

    // ── Try large_files first ─────────────────────────────────────────────
    const largeFileRow = this.db
      .prepare('SELECT original_content, token_count FROM large_files WHERE id = ?')
      .get(options.nodeId) as { original_content: string; token_count: number } | undefined;

    if (largeFileRow) {
      logger.debug(
        `lcm_expand: large_file id=${options.nodeId} original_tokens=${largeFileRow.token_count}`
      );

      const raw = largeFileRow.original_content;
      const charLimit = tokenCap * 4;
      const truncated = raw.length > charLimit;
      const content = truncated ? raw.slice(0, charLimit) : raw;

      return {
        nodeId: options.nodeId,
        nodeType: 'large_file',
        content: this.wrapContent(content, options.question, truncated),
        truncated,
        tokens: estimateTokens(content),
        sourceCount: 1,
      };
    }

    // ── Try context_nodes ─────────────────────────────────────────────────
    const nodeRow = this.db
      .prepare('SELECT * FROM context_nodes WHERE id = ?')
      .get(options.nodeId) as DbContextNode | undefined;

    if (nodeRow) {
      const { content, truncated, sourceCount } = this.walkNode(nodeRow, tokenCap, deadline);

      logger.debug(
        `lcm_expand: context_node id=${options.nodeId} depth=${nodeRow.depth} ` +
          `sourceCount=${sourceCount} truncated=${truncated}`
      );

      return {
        nodeId: options.nodeId,
        nodeType: 'context_node',
        content: this.wrapContent(content, options.question, truncated),
        truncated,
        tokens: estimateTokens(content),
        sourceCount,
      };
    }

    logger.warn(`lcm_expand: no node found for id=${options.nodeId}`);
    return null;
  }

  // ---------------------------------------------------------------------------
  // Private: DAG walk
  // ---------------------------------------------------------------------------

  /**
   * Recursively walks down a context_node to collect source content.
   *
   * @param node         The node row to expand.
   * @param tokenCap     Remaining token budget for this sub-tree.
   * @param deadline     Epoch ms after which we stop and set truncated=true.
   */
  private walkNode(
    node: DbContextNode,
    tokenCap: number,
    deadline: number
  ): { content: string; truncated: boolean; sourceCount: number } {
    let sourceIds: string[];
    try {
      sourceIds = JSON.parse(node.source_ids) as string[];
    } catch {
      sourceIds = [];
    }

    if (sourceIds.length === 0) {
      // Leaf with no recorded sources — return the summary as best effort
      return { content: node.summary, truncated: false, sourceCount: 0 };
    }

    const lines: string[] = [
      `[Context node: ${node.id} | depth=${node.depth}${node.mode ? ` | mode=${node.mode}` : ''}]`,
      `Summary: ${node.summary}`,
      '',
      '─── Expanded source content ───',
    ];

    let tokensSoFar = estimateTokens(lines.join('\n'));
    let sourceCount = 0;
    let truncated = false;

    for (let i = 0; i < sourceIds.length; i++) {
      const sourceId = sourceIds[i];

      // Wall-clock check
      if (Date.now() > deadline) {
        const remaining = sourceIds.length - i;
        lines.push(
          `\n[Truncated: TTL exceeded — ${remaining} source(s) not expanded. ` +
            `Call lcm_expand with a higher ttlMs to retrieve more.]`
        );
        truncated = true;
        break;
      }

      if (node.depth === 0) {
        // depth=0: sourceIds are message IDs → retrieve message parts
        const msgContent = this.expandMessage(sourceId);
        if (!msgContent) continue;

        const chunk = `\n[Message ${sourceId}]\n${msgContent}`;
        const chunkTokens = estimateTokens(chunk);

        if (tokensSoFar + chunkTokens > tokenCap) {
          const remaining = sourceIds.length - i;
          lines.push(
            `\n[Truncated: token cap reached — ${remaining} message(s) not expanded. ` +
              `Call lcm_expand with a higher tokenCap to retrieve more.]`
          );
          truncated = true;
          break;
        }

        lines.push(chunk);
        tokensSoFar += chunkTokens;
        sourceCount++;
      } else {
        // depth≥1: sourceIds are context_node IDs → recurse
        const childRow = this.db
          .prepare('SELECT * FROM context_nodes WHERE id = ?')
          .get(sourceId) as DbContextNode | undefined;

        if (!childRow) continue;

        const remainingBudget = tokenCap - tokensSoFar;
        const child = this.walkNode(childRow, remainingBudget, deadline);
        const chunkTokens = estimateTokens(child.content);

        if (tokensSoFar + chunkTokens > tokenCap) {
          const remaining = sourceIds.length - i;
          lines.push(`\n[Truncated: token cap reached — ${remaining} sub-node(s) not expanded.]`);
          truncated = true;
          break;
        }

        lines.push('', child.content);
        tokensSoFar += chunkTokens;
        sourceCount += child.sourceCount;

        if (child.truncated) {
          truncated = true;
          break;
        }
      }
    }

    return { content: lines.join('\n'), truncated, sourceCount };
  }

  /**
   * Retrieve all parts of a message and return them as concatenated text.
   * Returns null if the message has no parts.
   */
  private expandMessage(messageId: string): string | null {
    const rows = this.db
      .prepare('SELECT content FROM message_parts WHERE message_id = ? ORDER BY position ASC')
      .all(messageId) as Array<{ content: string }>;

    if (rows.length === 0) return null;
    return rows.map((r) => r.content).join('\n');
  }

  /**
   * Wrap the expanded content with optional focus-question header and
   * truncation footer.
   */
  private wrapContent(content: string, question: string | undefined, truncated: boolean): string {
    const parts: string[] = [];

    if (question) {
      parts.push(`[Focus question: ${question}]`, '');
    }

    parts.push(content);

    if (truncated) {
      parts.push(
        '',
        '[Content was truncated. Call lcm_expand with a higher tokenCap or ttlMs to retrieve more.]'
      );
    }

    return parts.join('\n');
  }
}
