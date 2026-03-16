/**
 * ContextAssembler — budget-constrained context assembly.
 *
 * Given a set of context items (summaries + raw messages), the assembler:
 *   1. Formats each CompactedNode summary as structured XML.
 *   2. Resolves raw MessageRow content into assistant-message objects.
 *   3. Applies a token budget while unconditionally protecting the fresh tail.
 *   4. Drops the oldest summaries first when the budget is exceeded.
 *   5. Injects recall guidance (as a system message) when any summary is present.
 *   6. Returns the assembled messages together with a token budget report.
 *
 * ## Budget application order
 *
 *   FRESH TAIL  — always included (never dropped)
 *   SUMMARIES   — included newest-first; oldest dropped when budget tight
 *   RECALL NOTE — injected iff at least one summary survives
 *
 * The token budget report exposes:
 *   - budgetTokens   total allowed
 *   - usedTokens     tokens consumed by the final message list
 *   - headroom       budgetTokens − usedTokens
 *   - droppedCount   number of summaries dropped due to budget pressure
 */

import { type MessageRow } from '../store/conversation-store.js';
import { type CompactedNode } from '../compaction/leaf-compactor.js';
import { estimateTokens } from '../store/conversation-store.js';
import { formatSummaries, buildRecallGuidance, type FormattedSummary } from './formatter.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A single item in the context to be assembled.
 *
 * Items are classified as either:
 *   - 'summary'  — a CompactedNode produced by the compaction engine
 *   - 'message'  — a raw MessageRow from the conversation store
 */
export type ContextItemKind = 'summary' | 'message';

export interface SummaryContextItem {
  kind: 'summary';
  node: CompactedNode;
  /**
   * Position index (ascending = oldest first).
   * Used to determine drop priority: lowest position dropped first.
   */
  position: number;
}

export interface MessageContextItem {
  kind: 'message';
  message: MessageRow;
  /**
   * Position index (ascending = oldest first).
   */
  position: number;
  /**
   * Whether this message belongs to the fresh tail.
   * Fresh tail messages are never dropped.
   */
  isFreshTail: boolean;
}

export type ContextItem = SummaryContextItem | MessageContextItem;

// ---------------------------------------------------------------------------
// Assembled message format (Anthropic SDK compatible)
// ---------------------------------------------------------------------------

/**
 * A single message in the assembled output.
 *
 * Matches the shape expected by the Anthropic Messages API, with an extra
 * `_meta` field for budget tracking.
 */
export interface AssembledMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** Internal metadata — strip before sending to the API */
  _meta?: {
    kind: ContextItemKind | 'recall_guidance';
    tokens: number;
    nodeId?: string;
  };
}

// ---------------------------------------------------------------------------
// Budget report
// ---------------------------------------------------------------------------

export interface BudgetReport {
  /** Total token budget provided by the caller */
  budgetTokens: number;
  /** Tokens consumed by the assembled message list */
  usedTokens: number;
  /** budgetTokens − usedTokens (may be negative if fresh tail alone exceeds budget) */
  headroom: number;
  /** Number of summary nodes that were dropped due to budget pressure */
  droppedSummaries: number;
  /** Number of summary nodes that survived into the final context */
  includedSummaries: number;
  /** Number of raw messages included */
  includedMessages: number;
}

// ---------------------------------------------------------------------------
// Assembler configuration
// ---------------------------------------------------------------------------

export interface AssemblerConfig {
  /**
   * Maximum total tokens for the assembled context.
   * Default: 100_000
   */
  budgetTokens: number;

  /**
   * Role to use for the recall guidance injection.
   * Default: 'system'
   */
  recallGuidanceRole: 'system' | 'user';
}

export const DEFAULT_ASSEMBLER_CONFIG: AssemblerConfig = {
  budgetTokens: 100_000,
  recallGuidanceRole: 'system',
};

// ---------------------------------------------------------------------------
// AssemblyResult
// ---------------------------------------------------------------------------

export interface AssemblyResult {
  /** Assembled messages in chronological order (oldest first) */
  messages: AssembledMessage[];
  /** Token budget accounting */
  budget: BudgetReport;
}

// ---------------------------------------------------------------------------
// ContextAssembler
// ---------------------------------------------------------------------------

export class ContextAssembler {
  private readonly config: AssemblerConfig;

  constructor(config: Partial<AssemblerConfig> = {}) {
    this.config = { ...DEFAULT_ASSEMBLER_CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Assembles context items into a budget-constrained list of messages.
   *
   * @param items  Context items ordered by position (ascending = oldest first).
   *               The caller is responsible for setting `isFreshTail` correctly
   *               on message items.
   */
  assemble(items: ContextItem[]): AssemblyResult {
    // Sort by position to ensure chronological order
    const sorted = [...items].sort((a, b) => a.position - b.position);

    // Separate fresh tail messages (always included), compactable summaries,
    // and non-tail raw messages
    const freshTailMessages = sorted.filter(
      (i): i is MessageContextItem => i.kind === 'message' && i.isFreshTail
    );
    const summaryItems = sorted.filter((i): i is SummaryContextItem => i.kind === 'summary');
    const regularMessages = sorted.filter(
      (i): i is MessageContextItem => i.kind === 'message' && !i.isFreshTail
    );

    // Format all summaries upfront
    const formattedSummaries = formatSummaries(
      summaryItems.map((i) => i.node),
      estimateTokens
    );

    // Build a lookup from node.id → FormattedSummary
    const summaryByNodeId = new Map<string, FormattedSummary>();
    for (const fs of formattedSummaries) {
      summaryByNodeId.set(fs.node.id, fs);
    }

    // -----------------------------------------------------------------------
    // Budget accounting
    // -----------------------------------------------------------------------

    const budget = this.config.budgetTokens;

    // 1. Reserve budget for fresh tail (mandatory)
    const freshTailTokens = freshTailMessages.reduce(
      (sum, item) => sum + item.message.totalTokens,
      0
    );

    // 2. Reserve budget for regular (non-tail) raw messages
    const regularMessageTokens = regularMessages.reduce(
      (sum, item) => sum + item.message.totalTokens,
      0
    );

    // 3. Estimate recall guidance tokens (only needed if any summary survives)
    const recallGuidanceTokens = estimateTokens(
      buildRecallGuidance(summaryItems.map((i) => i.node.id))
    );

    // Remaining budget after mandatory items
    let remaining = budget - freshTailTokens - regularMessageTokens;

    // If there are summaries, reserve space for the recall guidance note
    const hasSummaries = formattedSummaries.length > 0;
    if (hasSummaries) {
      remaining -= recallGuidanceTokens;
    }

    // -----------------------------------------------------------------------
    // Apply budget to summaries — drop oldest first
    // -----------------------------------------------------------------------

    // summaryItems are already sorted oldest→newest (ascending position)
    const survivingSummaries: Array<{ item: SummaryContextItem; formatted: FormattedSummary }> = [];
    let droppedSummaries = 0;

    // Work newest → oldest to prefer keeping recent summaries.
    // We collect survivors and then reverse for final ordering.
    for (let idx = formattedSummaries.length - 1; idx >= 0; idx--) {
      const formatted = formattedSummaries[idx];
      const item = summaryItems[idx];

      if (remaining >= formatted.tokens) {
        remaining -= formatted.tokens;
        survivingSummaries.unshift({ item, formatted });
      } else {
        droppedSummaries++;
      }
    }

    // -----------------------------------------------------------------------
    // Build the final message list in chronological order:
    //   [recall_guidance?] → [surviving summaries] → [regular messages] → [fresh tail]
    // -----------------------------------------------------------------------

    const messages: AssembledMessage[] = [];
    let usedTokens = 0;

    // Recall guidance — inject if any summary survived
    if (survivingSummaries.length > 0) {
      const guidanceText = buildRecallGuidance(survivingSummaries.map((s) => s.item.node.id));
      const guidanceTokens = estimateTokens(guidanceText);

      messages.push({
        role: this.config.recallGuidanceRole,
        content: guidanceText,
        _meta: { kind: 'recall_guidance', tokens: guidanceTokens },
      });

      usedTokens += guidanceTokens;
    }

    // Surviving summaries (oldest → newest)
    for (const { item, formatted } of survivingSummaries) {
      messages.push({
        role: 'user',
        content: formatted.xml,
        _meta: { kind: 'summary', tokens: formatted.tokens, nodeId: item.node.id },
      });
      usedTokens += formatted.tokens;
    }

    // Regular (non-tail) raw messages
    for (const item of regularMessages) {
      const content = this.extractMessageContent(item.message);
      const tokens = item.message.totalTokens;

      messages.push({
        role: this.normalizeRole(item.message.role),
        content,
        _meta: { kind: 'message', tokens },
      });

      usedTokens += tokens;
    }

    // Fresh tail messages
    for (const item of freshTailMessages) {
      const content = this.extractMessageContent(item.message);
      const tokens = item.message.totalTokens;

      messages.push({
        role: this.normalizeRole(item.message.role),
        content,
        _meta: { kind: 'message', tokens },
      });

      usedTokens += tokens;
    }

    const report: BudgetReport = {
      budgetTokens: budget,
      usedTokens,
      headroom: budget - usedTokens,
      droppedSummaries,
      includedSummaries: survivingSummaries.length,
      includedMessages: regularMessages.length + freshTailMessages.length,
    };

    return { messages, budget: report };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Extracts the text content from a MessageRow by concatenating all text parts.
   * Non-text parts (tool_use, tool_result, image, document) are noted inline.
   */
  private extractMessageContent(message: MessageRow): string {
    if (message.parts.length === 0) {
      return '';
    }

    return message.parts
      .map((part) => {
        switch (part.type) {
          case 'text':
            return part.content;
          case 'tool_use':
            return `[tool_use: ${part.content}]`;
          case 'tool_result':
            return `[tool_result: ${part.content}]`;
          case 'image':
            return '[image]';
          case 'document':
            return `[document: ${part.content.slice(0, 80)}]`;
          default:
            return part.content;
        }
      })
      .join('\n');
  }

  /**
   * Normalises a MessageRole to the AssembledMessage role union.
   * 'tool' messages are surfaced as 'user' (tool results come from the human turn).
   */
  private normalizeRole(role: string): AssembledMessage['role'] {
    switch (role) {
      case 'assistant':
        return 'assistant';
      case 'system':
        return 'system';
      case 'user':
      case 'tool':
      default:
        return 'user';
    }
  }
}
