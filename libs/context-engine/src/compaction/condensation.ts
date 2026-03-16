/**
 * CondensationEngine — multi-depth cascaded condensation.
 *
 * When depth-N summary nodes accumulate beyond `condensedMinFanout`, they are
 * grouped and condensed into a single depth-(N+1) node.  This cascades up to
 * `incrementalMaxDepth`, building a summary DAG:
 *
 *   depth-0  (leaf nodes from LeafCompactor)
 *       │ fan-in at condensedMinFanout
 *   depth-1  (session-level decisions + key artefacts)
 *       │ fan-in at condensedMinFanout
 *   depth-2  (trajectory + durable decisions only)
 *       …
 *
 * DAG validity is guaranteed because each CondensedNode's sourceIds always
 * point to nodes of the immediately preceding depth — no node can reference
 * its own descendants.
 */

import { randomUUID } from 'node:crypto';
import { createLogger } from '@protolabsai/utils';
import { estimateTokens } from '../store/conversation-store.js';
import { buildCondensationPrompt, type CondensationPromptInput } from './prompts.js';
import type { CompactedNode, LLMCaller } from './leaf-compactor.js';

const logger = createLogger('CondensationEngine');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface CondensationConfig {
  /**
   * Minimum number of same-depth nodes required before the engine creates a
   * higher-depth condensation.  Fewer nodes than this threshold are left
   * in place.
   * Default: 4
   */
  condensedMinFanout: number;

  /**
   * Maximum depth the engine is allowed to create.  Depth-0 nodes are
   * produced by LeafCompactor; this engine produces depths 1 … incrementalMaxDepth.
   * Default: 3
   */
  incrementalMaxDepth: number;
}

export const DEFAULT_CONDENSATION_CONFIG: CondensationConfig = {
  condensedMinFanout: 4,
  incrementalMaxDepth: 3,
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A summary node produced by condensation (depth >= 1).
 *
 * Depth-0 summary nodes are {@link CompactedNode} produced by LeafCompactor.
 */
export interface CondensedNode {
  /** Always >= 1 for condensed summaries (depth-0 is reserved for leaf nodes). */
  depth: number;

  /** Unique node ID — used in lcm_expand references. */
  id: string;

  /** Condensed summary text. */
  summary: string;

  /**
   * Expand footer appended after the summary.
   * Format: "[lcm_expand: <id>] Topics: <t1>, <t2> (depth-<N> condensation, <orig> → ? tokens)"
   */
  expandFooter: string;

  /** IDs of the depth-(N-1) nodes condensed into this node. */
  sourceIds: string[];

  /** Total token count of the source nodes' summaries. */
  originalTokens: number;

  /** Token count of this condensed summary (including expand footer). */
  summaryTokens: number;
}

/**
 * A node at any compaction depth — either a leaf CompactedNode (depth=0) or a
 * CondensedNode (depth >= 1).
 */
export type AnyContextNode = (CompactedNode & { depth: 0 }) | CondensedNode;

export interface CondensationResult {
  /** New higher-depth nodes created during this pass. */
  newNodes: CondensedNode[];

  /**
   * IDs of the nodes that were consumed (replaced by their parent condensed node).
   * Callers should remove these from the active context window.
   */
  consumedIds: string[];
}

// ---------------------------------------------------------------------------
// CondensationEngine
// ---------------------------------------------------------------------------

export class CondensationEngine {
  constructor(private readonly llm: LLMCaller) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Run cascaded condensation over a collection of context nodes.
   *
   * The engine iterates from depth 1 up to `incrementalMaxDepth`.  At each
   * target depth it collects all nodes at depth-(targetDepth-1), and whenever
   * the count meets or exceeds `condensedMinFanout` it groups them into chunks
   * and produces depth-(targetDepth) condensed nodes.
   *
   * Newly created condensed nodes are added to the working set so they can
   * trigger further condensation at the next depth.
   *
   * @param nodes   All current context nodes (leaf + any pre-existing condensed).
   * @param config  Condensation settings (defaults apply if omitted).
   * @returns       CondensationResult with new nodes and consumed IDs, or an
   *                empty result if no condensation threshold was reached.
   */
  async condense(
    nodes: AnyContextNode[],
    config: CondensationConfig = DEFAULT_CONDENSATION_CONFIG
  ): Promise<CondensationResult> {
    const allNewNodes: CondensedNode[] = [];
    const allConsumedIds: string[] = [];

    // Mutable working set — grows as we add newly condensed nodes so that
    // they can be picked up by the next depth's pass.
    let workingNodes: AnyContextNode[] = [...nodes];

    for (let targetDepth = 1; targetDepth <= config.incrementalMaxDepth; targetDepth++) {
      const sourceDepth = targetDepth - 1;
      const sourceNodes = workingNodes.filter((n) => n.depth === sourceDepth);

      if (sourceNodes.length < config.condensedMinFanout) {
        logger.debug(
          `Depth ${sourceDepth}: ${sourceNodes.length} node(s) < ` +
            `${config.condensedMinFanout} fanout — skipping depth-${targetDepth} condensation`
        );
        continue;
      }

      logger.info(
        `Condensing ${sourceNodes.length} depth-${sourceDepth} node(s) ` +
          `into depth-${targetDepth} summaries (chunks of ${config.condensedMinFanout})`
      );

      // Split source nodes into fixed-size chunks
      const chunks: AnyContextNode[][] = [];
      for (let i = 0; i < sourceNodes.length; i += config.condensedMinFanout) {
        chunks.push(sourceNodes.slice(i, i + config.condensedMinFanout));
      }

      const newNodesThisDepth: CondensedNode[] = [];
      const consumedThisDepth: string[] = [];

      for (const chunk of chunks) {
        const condensed = await this.condenseChunk(chunk, targetDepth);
        newNodesThisDepth.push(condensed);
        consumedThisDepth.push(...chunk.map((n) => n.id));
      }

      allNewNodes.push(...newNodesThisDepth);
      allConsumedIds.push(...consumedThisDepth);

      // Add new nodes to working set and remove consumed nodes so the next
      // depth sees an accurate picture of the node collection.
      const consumedSet = new Set(consumedThisDepth);
      workingNodes = workingNodes.filter((n) => !consumedSet.has(n.id));
      workingNodes.push(...newNodesThisDepth);
    }

    if (allNewNodes.length > 0) {
      const totalSummaryTokens = allNewNodes.reduce((s, n) => s + n.summaryTokens, 0);
      logger.info(
        `Condensation complete: ${allNewNodes.length} new node(s), ` +
          `${allConsumedIds.length} node(s) consumed → ${totalSummaryTokens} summary tokens`
      );
    } else {
      logger.debug('Condensation pass produced no new nodes (all depths below threshold)');
    }

    return { newNodes: allNewNodes, consumedIds: allConsumedIds };
  }

  // -------------------------------------------------------------------------
  // Chunk-level condensation
  // -------------------------------------------------------------------------

  private async condenseChunk(
    nodes: AnyContextNode[],
    targetDepth: number
  ): Promise<CondensedNode> {
    const inputs: CondensationPromptInput[] = nodes.map((n) => ({
      depth: n.depth,
      summary: n.summary,
      tokens: n.summaryTokens,
    }));

    const prompts = buildCondensationPrompt(inputs, targetDepth);

    let summary: string;
    try {
      summary = await this.llm(prompts.system, prompts.user);
    } catch (err) {
      logger.warn(
        `LLM call failed for depth-${targetDepth} condensation ` +
          `(${(err as Error).message}); using fallback concatenation`
      );
      summary = this.fallbackCondense(nodes, targetDepth);
    }

    return this.buildCondensedNode(nodes, summary, targetDepth);
  }

  /**
   * Fallback when the LLM is unavailable: concatenate truncated source summaries.
   * Never throws.
   */
  private fallbackCondense(nodes: AnyContextNode[], depth: number): string {
    const header = `[Depth-${depth} condensation — fallback mode, ${nodes.length} source nodes]`;
    const bodies = nodes.map((n, i) => `[${i + 1}] (d${n.depth}) ${n.summary.slice(0, 300)}`);
    return [header, ...bodies].join('\n');
  }

  // -------------------------------------------------------------------------
  // Node construction helpers
  // -------------------------------------------------------------------------

  private buildCondensedNode(
    sources: AnyContextNode[],
    summary: string,
    depth: number
  ): CondensedNode {
    const id = randomUUID();
    const originalTokens = sources.reduce((sum, n) => sum + n.summaryTokens, 0);

    const topics = this.extractTopics(summary);
    const expandFooter =
      `[lcm_expand: ${id}] Topics: ${topics.join(', ')} ` +
      `(depth-${depth} condensation, ${originalTokens} \u2192 ? tokens)`;

    const fullText = `${summary}\n\n${expandFooter}`;
    const summaryTokens = estimateTokens(fullText);

    return {
      depth,
      id,
      summary,
      expandFooter,
      sourceIds: sources.map((n) => n.id),
      originalTokens,
      summaryTokens,
    };
  }

  /**
   * Extract up to 5 topic labels from a condensed summary.
   * Priority: bullet points → sentence fragments.
   */
  private extractTopics(summary: string): string[] {
    const bullets = summary.match(/^(?:[-*\u2022]|\d+\.)\s+(.+)$/gm) ?? [];
    if (bullets.length >= 2) {
      return bullets.slice(0, 5).map((b) =>
        b
          .replace(/^(?:[-*\u2022]|\d+\.)\s+/, '')
          .split(':')[0]
          .trim()
          .slice(0, 40)
      );
    }

    return summary
      .split(/[.!?]\s+/)
      .slice(0, 3)
      .map((s) => s.trim().slice(0, 40))
      .filter((s) => s.length > 0);
  }
}
