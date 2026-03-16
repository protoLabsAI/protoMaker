/**
 * ContextDescriber — surface summary metadata with provenance chain.
 *
 * Given a node ID (from an `[lcm_expand: <id>]` reference in the context window),
 * returns the stored summary, depth, compaction mode, source IDs, token counts,
 * and optionally the full provenance chain (parent nodes that condensed this node
 * into a higher-depth summary).
 *
 * Looks up both `context_nodes` (CompactedNode / CondensedNode) and `large_files`.
 *
 * Tool: `lcm_describe`
 */

import * as BetterSqlite3 from 'better-sqlite3';
import { createLogger } from '@protolabsai/utils';

const logger = createLogger('ContextDescriber');

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type NodeType = 'compacted' | 'condensed' | 'large_file';

export interface NodeDescription {
  /** UUID of the node. */
  id: string;
  /** Semantic type: compacted (depth=0), condensed (depth>=1), or large_file. */
  type: NodeType;
  /**
   * Compaction depth.
   *   0 = leaf summary from LeafCompactor
   *   1+ = cascaded condensation from CondensationEngine
   *   0 for large_file nodes
   */
  depth: number;
  /** Stored summary text. */
  summary: string;
  /**
   * Expand footer appended to the summary in the context window.
   * Format: "[lcm_expand: <id>] Topics: ... (compressed N → ? tokens, mode: ...)"
   */
  expandFooter: string;
  /**
   * IDs of the source items this node was produced from:
   *   - depth=0 (compacted): message IDs from the messages table
   *   - depth>=1 (condensed): context_node IDs
   *   - large_file: empty array
   */
  sourceIds: string[];
  /** Token count of the original source content before compaction. */
  originalTokens: number;
  /** Token count of this summary (including the expand footer). */
  summaryTokens: number;
  /**
   * Compaction mode used to produce this node.
   * One of 'normal' | 'aggressive' | 'deterministic' for depth=0 nodes.
   * Undefined for condensed or large_file nodes.
   */
  mode?: string;
  /** ISO 8601 timestamp when this node was stored. */
  storedAt: string;
  /** Conversation this node belongs to, if known. */
  conversationId?: string;
  /**
   * Parent nodes in the provenance chain — nodes that condensed this node
   * into a higher-depth summary.  Only populated when `includeParents=true`
   * is passed to `describe()`.
   */
  parents?: NodeDescription[];
}

export interface DescribeOptions {
  /**
   * Walk UP the DAG and include parent nodes that condensed this node.
   * Default: false.
   */
  includeParents?: boolean;
  /**
   * Maximum levels of parent provenance to include (default: 3).
   * Prevents unbounded DAG traversal.
   */
  maxParentDepth?: number;
}

// ---------------------------------------------------------------------------
// Internal DB row types
// ---------------------------------------------------------------------------

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

interface DbLargeFile {
  id: string;
  conversation_id: string | null;
  summary: string;
  token_count: number;
  stored_at: string;
}

// ---------------------------------------------------------------------------
// ContextDescriber
// ---------------------------------------------------------------------------

export class ContextDescriber {
  constructor(private readonly db: BetterSqlite3.Database) {}

  /**
   * Describe a node by ID.
   *
   * Checks `context_nodes` first, then `large_files`.
   *
   * @param nodeId         UUID visible in an `[lcm_expand: <id>]` reference.
   * @param options        Optional provenance chain settings.
   * @returns              NodeDescription, or null if not found.
   */
  describe(nodeId: string, options: DescribeOptions = {}): NodeDescription | null {
    const includeParents = options.includeParents ?? false;
    const maxParentDepth = options.maxParentDepth ?? 3;

    // Try context_nodes
    const nodeRow = this.db
      .prepare('SELECT * FROM context_nodes WHERE id = ?')
      .get(nodeId) as DbContextNode | undefined;

    if (nodeRow) {
      const desc = this.mapContextNode(nodeRow);
      if (includeParents) {
        desc.parents = this.findParents(nodeId, maxParentDepth);
      }
      logger.debug(`lcm_describe: found context_node id=${nodeId} depth=${nodeRow.depth}`);
      return desc;
    }

    // Try large_files
    const fileRow = this.db
      .prepare('SELECT * FROM large_files WHERE id = ?')
      .get(nodeId) as DbLargeFile | undefined;

    if (fileRow) {
      logger.debug(`lcm_describe: found large_file id=${nodeId}`);
      return this.mapLargeFile(fileRow);
    }

    logger.warn(`lcm_describe: no node found for id=${nodeId}`);
    return null;
  }

  /**
   * List all context nodes for a conversation, ordered by stored_at ascending.
   * Useful for surfacing the full compaction history.
   */
  listNodesForConversation(conversationId: string): NodeDescription[] {
    const rows = this.db
      .prepare('SELECT * FROM context_nodes WHERE conversation_id = ? ORDER BY stored_at ASC')
      .all(conversationId) as DbContextNode[];

    return rows.map((r) => this.mapContextNode(r));
  }

  /**
   * List all context nodes at a given depth for a conversation.
   */
  listNodesByDepth(conversationId: string, depth: number): NodeDescription[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM context_nodes WHERE conversation_id = ? AND depth = ? ORDER BY stored_at ASC'
      )
      .all(conversationId, depth) as DbContextNode[];

    return rows.map((r) => this.mapContextNode(r));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Walk UP the DAG: find nodes whose source_ids contain `nodeId`.
   * Bounded by `remainingDepth` to prevent cycles / runaway traversal.
   */
  private findParents(nodeId: string, remainingDepth: number): NodeDescription[] {
    if (remainingDepth <= 0) return [];

    // We need to find all context_nodes whose source_ids JSON array contains nodeId.
    // SQLite doesn't natively query inside JSON arrays so we use LIKE on the raw text.
    // This is safe because UUIDs are unique enough to avoid false positives.
    const likePattern = `%"${nodeId}"%`;

    const rows = this.db
      .prepare('SELECT * FROM context_nodes WHERE source_ids LIKE ?')
      .all(likePattern) as DbContextNode[];

    const parents: NodeDescription[] = [];

    for (const row of rows) {
      // Double-check: parse JSON and confirm membership
      let sourceIds: string[];
      try {
        sourceIds = JSON.parse(row.source_ids) as string[];
      } catch {
        continue;
      }

      if (!sourceIds.includes(nodeId)) continue;

      const desc = this.mapContextNode(row);
      desc.parents = this.findParents(row.id, remainingDepth - 1);
      parents.push(desc);
    }

    return parents;
  }

  private mapContextNode(row: DbContextNode): NodeDescription {
    let sourceIds: string[];
    try {
      sourceIds = JSON.parse(row.source_ids) as string[];
    } catch {
      sourceIds = [];
    }

    const type: NodeType = row.depth === 0 ? 'compacted' : 'condensed';

    return {
      id: row.id,
      type,
      depth: row.depth,
      summary: row.summary,
      expandFooter: row.expand_footer,
      sourceIds,
      originalTokens: row.original_tokens,
      summaryTokens: row.summary_tokens,
      mode: row.mode ?? undefined,
      storedAt: row.stored_at,
      conversationId: row.conversation_id ?? undefined,
    };
  }

  private mapLargeFile(row: DbLargeFile): NodeDescription {
    return {
      id: row.id,
      type: 'large_file',
      depth: 0,
      summary: row.summary,
      expandFooter: `[lcm_expand: "${row.id}"] Large file (~${row.token_count.toLocaleString()} tokens — call lcm_expand to retrieve full content)`,
      sourceIds: [],
      originalTokens: row.token_count,
      summaryTokens: Math.ceil(row.summary.length / 4),
      storedAt: row.stored_at,
      conversationId: row.conversation_id ?? undefined,
    };
  }
}
