/**
 * LeafCompactor — depth=0 (leaf) context compaction.
 *
 * When the uncompacted portion of a context window exceeds `leafChunkTokens`,
 * older messages are grouped into chunks of `leafMinFanout` and summarised.
 * The fresh tail (`freshTailSize` messages) is always kept verbatim.
 *
 * Three-level escalation on each chunk:
 *   1. normal       — full LLM summary preserving paths, commands, errors
 *   2. aggressive   — LLM artefact-only extraction (smaller output)
 *   3. deterministic — pure regex extraction; no LLM call
 */

import { randomUUID } from 'node:crypto';
import { createLogger } from '@protolabsai/utils';
import { estimateTokens } from '../store/conversation-store.js';
import { buildLeafPrompt, type LeafPromptInput } from './prompts.js';

const logger = createLogger('LeafCompactor');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface LeafCompactionConfig {
  /**
   * Total token count of uncompacted messages that triggers compaction.
   * Default: 25 000
   */
  leafChunkTokens: number;

  /**
   * Minimum number of messages per compaction chunk (target fanout).
   * Default: 8
   */
  leafMinFanout: number;

  /**
   * Number of most-recent messages that are NEVER compacted (fresh tail).
   * Default: 4
   */
  freshTailSize: number;
}

export const DEFAULT_LEAF_COMPACTION_CONFIG: LeafCompactionConfig = {
  leafChunkTokens: 25_000,
  leafMinFanout: 8,
  freshTailSize: 4,
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CompactionMode = 'normal' | 'aggressive' | 'deterministic';

export interface MessageToCompact {
  id: string;
  role: string;
  content: string;
  tokens: number;
}

/**
 * A single depth=0 summary node produced by leaf compaction.
 */
export interface CompactedNode {
  /** Always 0 for leaf summaries */
  depth: 0;

  /**
   * Unique node ID — used in `lcm_expand` references so agents can request
   * the full original content back.
   */
  id: string;

  /** Compact summary text */
  summary: string;

  /**
   * Expand footer appended after the summary.
   * Format: "[lcm_expand: <id>] Topics: <t1>, <t2> (compressed <N> → <M> tokens, mode: <mode>)"
   */
  expandFooter: string;

  /** IDs of the source messages that were compacted into this node */
  sourceIds: string[];

  /** Token estimate of the original source messages */
  originalTokens: number;

  /** Token estimate of this summary (including the expand footer) */
  summaryTokens: number;

  /** Compaction mode that produced this node */
  mode: CompactionMode;
}

export interface CompactionResult {
  /** Summary nodes, one per compacted chunk */
  nodes: CompactedNode[];

  /**
   * IDs of all messages that were compacted.
   * These messages may be removed from the active context window and replaced
   * by the corresponding CompactedNode summaries.
   */
  compactedIds: string[];

  /** IDs of messages in the fresh tail (not compacted) */
  tailMessageIds: string[];
}

/**
 * Async function that calls an LLM (typically Claude Haiku) and returns the
 * text response.  The caller is responsible for instantiating the SDK client.
 */
export type LLMCaller = (system: string, user: string) => Promise<string>;

// ---------------------------------------------------------------------------
// LeafCompactor
// ---------------------------------------------------------------------------

export class LeafCompactor {
  constructor(private readonly llm: LLMCaller) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Run leaf compaction over a sequence of messages.
   *
   * @param messages  Messages ordered oldest → newest.
   * @param config    Compaction settings (defaults apply if omitted).
   * @param force     If true, compact even when below the token threshold.
   * @returns         CompactionResult, or null if compaction was skipped.
   */
  async compact(
    messages: MessageToCompact[],
    config: LeafCompactionConfig = DEFAULT_LEAF_COMPACTION_CONFIG,
    force = false
  ): Promise<CompactionResult | null> {
    const totalTokens = messages.reduce((sum, m) => sum + m.tokens, 0);

    if (!force && totalTokens < config.leafChunkTokens) {
      logger.debug(`Skipping: ${totalTokens} tokens < ${config.leafChunkTokens} threshold`);
      return null;
    }

    // Protect the fresh tail — newest `freshTailSize` messages are never compacted
    const tailStart = Math.max(0, messages.length - config.freshTailSize);
    const toCompact = messages.slice(0, tailStart);
    const tail = messages.slice(tailStart);

    if (toCompact.length < config.leafMinFanout) {
      logger.debug(
        `Skipping: only ${toCompact.length} messages to compact (need >= ${config.leafMinFanout})`
      );
      return null;
    }

    logger.info(
      `Compacting ${toCompact.length} messages into chunks of ${config.leafMinFanout} ` +
        `(tail protected: ${tail.length} messages)`
    );

    // Split into fixed-size chunks
    const chunks: MessageToCompact[][] = [];
    for (let i = 0; i < toCompact.length; i += config.leafMinFanout) {
      chunks.push(toCompact.slice(i, i + config.leafMinFanout));
    }

    // Compact each chunk independently (with per-chunk escalation)
    const nodes: CompactedNode[] = [];
    const compactedIds: string[] = [];

    for (const chunk of chunks) {
      const node = await this.compactChunk(chunk);
      nodes.push(node);
      compactedIds.push(...chunk.map((m) => m.id));
    }

    const summaryTokensTotal = nodes.reduce((s, n) => s + n.summaryTokens, 0);
    logger.info(
      `Compaction complete: ${nodes.length} node(s), ` +
        `${compactedIds.length} messages → ${summaryTokensTotal} tokens`
    );

    return {
      nodes,
      compactedIds,
      tailMessageIds: tail.map((m) => m.id),
    };
  }

  // -------------------------------------------------------------------------
  // Chunk-level processing with three-level escalation
  // -------------------------------------------------------------------------

  private async compactChunk(messages: MessageToCompact[]): Promise<CompactedNode> {
    const escalationLevels: CompactionMode[] = ['normal', 'aggressive', 'deterministic'];

    for (const mode of escalationLevels) {
      try {
        return await this.compactWithMode(messages, mode);
      } catch (err) {
        if (mode === 'deterministic') {
          // Deterministic should never throw; re-throw if it somehow does
          throw err;
        }
        logger.warn(`Mode '${mode}' failed (${(err as Error).message}), escalating to next level`);
      }
    }

    // Unreachable, but TypeScript requires a return path
    return this.deterministicCompact(messages);
  }

  private async compactWithMode(
    messages: MessageToCompact[],
    mode: CompactionMode
  ): Promise<CompactedNode> {
    if (mode === 'deterministic') {
      return this.deterministicCompact(messages);
    }

    const prompts = buildLeafPrompt(
      messages.map((m): LeafPromptInput => ({ role: m.role, content: m.content })),
      mode
    );

    const summary = await this.llm(prompts.system, prompts.user);
    return this.buildNode(messages, summary, mode);
  }

  // -------------------------------------------------------------------------
  // Deterministic fallback (no LLM)
  // -------------------------------------------------------------------------

  /**
   * Extract file paths, commands, and errors using regex.  Never throws.
   */
  private deterministicCompact(messages: MessageToCompact[]): CompactedNode {
    const filePaths = new Set<string>();
    const commands: string[] = [];
    const errors: string[] = [];

    for (const msg of messages) {
      const text = msg.content;

      // ---- File paths ----
      // Match patterns like src/foo.ts, ./apps/server/routes.ts, ../lib/utils.js
      const fileMatches = text.match(/\b(?:\.\.?\/)?[\w.-]+(?:\/[\w.-]+)*\.\w{1,10}\b/g) ?? [];
      fileMatches
        .filter(
          (p) =>
            (p.includes('/') || /\.(ts|js|tsx|jsx|json|yaml|yml|md|sh|py)$/.test(p)) && p.length > 3
        )
        .forEach((p) => filePaths.add(p));

      // ---- Shell commands in fenced code blocks ----
      const codeBlocks =
        text.match(/```(?:bash|sh|shell|zsh|fish|cmd|powershell)?\n([\s\S]*?)```/g) ?? [];
      for (const block of codeBlocks) {
        const inner = block
          .replace(/```(?:bash|sh|shell|zsh|fish|cmd|powershell)?\n/, '')
          .replace(/```$/, '')
          .trim();
        const firstLine = inner.split('\n')[0].trim();
        if (firstLine) commands.push(firstLine);
      }

      // ---- Inline commands (common CLI prefixes) ----
      const inlineCmds = text.match(/`([^`]{4,100})`/g) ?? [];
      inlineCmds.forEach((c) => {
        const cmd = c.slice(1, -1).trim();
        if (/^(?:npm|pnpm|yarn|git|cd|ls|cat|grep|find|curl|node|ts-node|npx|tsc)\b/.test(cmd)) {
          commands.push(cmd);
        }
      });

      // ---- Error messages ----
      const errMatches =
        text.match(
          /(?:Error|error|ERROR|Failed|failed|FAILED|Exception|exception)[:\s][^\n]{3,}/g
        ) ?? [];
      errMatches.forEach((e) => errors.push(e.trim().slice(0, 120)));
    }

    const lines: string[] = ['[Deterministic compaction]'];

    if (filePaths.size > 0) {
      Array.from(filePaths)
        .slice(0, 12)
        .forEach((p) => lines.push(`File: ${p}`));
    }

    if (commands.length > 0) {
      [...new Set(commands)].slice(0, 6).forEach((c) => lines.push(`Cmd: ${c}`));
    }

    if (errors.length > 0) {
      [...new Set(errors)].slice(0, 6).forEach((e) => lines.push(`Error: ${e}`));
    }

    if (lines.length === 1) {
      // Nothing was extracted — note the message count at least
      lines.push(`Done: ${messages.length} messages (no artefacts detected)`);
    }

    return this.buildNode(messages, lines.join('\n'), 'deterministic');
  }

  // -------------------------------------------------------------------------
  // Node construction helpers
  // -------------------------------------------------------------------------

  private buildNode(
    messages: MessageToCompact[],
    summary: string,
    mode: CompactionMode
  ): CompactedNode {
    const id = randomUUID();
    const originalTokens = messages.reduce((sum, m) => sum + m.tokens, 0);

    // Extract topics for the expand footer
    const topics = this.extractTopics(summary);
    const expandFooter =
      `[lcm_expand: ${id}] Topics: ${topics.join(', ')} ` +
      `(compressed ${originalTokens} \u2192 ? tokens, mode: ${mode})`;

    const fullText = `${summary}\n\n${expandFooter}`;
    const summaryTokens = estimateTokens(fullText);

    return {
      depth: 0,
      id,
      summary,
      expandFooter,
      sourceIds: messages.map((m) => m.id),
      originalTokens,
      summaryTokens,
      mode,
    };
  }

  /**
   * Extract up to 5 topic labels from a summary for the expand footer.
   *
   * Priority order:
   *   1. Bullet-point lines (- foo, * foo, • foo, 1. foo)
   *   2. Artefact-prefix lines (File:, Cmd:, Error:, Done:)
   *   3. First few sentence fragments
   */
  private extractTopics(summary: string): string[] {
    // Bullet points
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

    // Artefact prefixes
    const artefacts = summary.match(/^(?:File|Cmd|Error|Done):\s*(.+)$/gm) ?? [];
    if (artefacts.length > 0) {
      const unique = [...new Set(artefacts.map((a) => a.split(':')[0]))];
      return unique.slice(0, 4);
    }

    // Sentence fragments
    return summary
      .split(/[.!?]\s+/)
      .slice(0, 3)
      .map((s) => s.trim().slice(0, 40))
      .filter((s) => s.length > 0);
  }
}
