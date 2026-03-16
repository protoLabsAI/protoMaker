/**
 * Formatter — converts CompactedNode summaries into structured XML blocks
 * suitable for injection into an LLM context window.
 *
 * Each summary is wrapped in a <context_summary> element that carries
 * enough metadata (id, depth, mode, token counts, source count, topics)
 * for the model to understand what was compacted and how to request expansion.
 *
 * Example output:
 *
 *   <context_summary id="abc-123" depth="0" mode="normal"
 *                    original_tokens="1200" summary_tokens="340"
 *                    source_count="8">
 *     <topics>
 *       <topic>Add auth middleware</topic>
 *       <topic>Fix token refresh bug</topic>
 *     </topics>
 *     <summary>
 *       - Added JWT middleware to Express routes
 *       - Fixed token refresh race condition in auth.ts
 *       [lcm_expand: abc-123] Topics: Add auth middleware, Fix token refresh bug
 *           (compressed 1200 → 340 tokens, mode: normal)
 *     </summary>
 *   </context_summary>
 */

import { type CompactedNode } from '../compaction/leaf-compactor.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A single formatted summary block ready for inclusion in an assembled context.
 */
export interface FormattedSummary {
  /** The node that was formatted */
  node: CompactedNode;

  /** Structured XML string for injection into the context window */
  xml: string;

  /** Token estimate of the XML string */
  tokens: number;
}

// ---------------------------------------------------------------------------
// Escaping helper
// ---------------------------------------------------------------------------

/**
 * Escapes the five XML special characters so that arbitrary text can be safely
 * embedded as XML text content or attribute values.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// Topic extraction
// ---------------------------------------------------------------------------

/**
 * Extracts up to `maxTopics` topic strings from a CompactedNode.
 *
 * Strategy (in priority order):
 *   1. Bullet points from the summary text
 *   2. "File:", "Cmd:", "Error:", "Done:" prefix lines
 *   3. First sentence fragments
 */
export function extractTopics(node: CompactedNode, maxTopics = 5): string[] {
  const summary = node.summary;

  // 1. Bullet points
  const bullets = summary.match(/^(?:[-*\u2022]|\d+\.)\s+(.+)$/gm) ?? [];
  if (bullets.length >= 2) {
    return bullets.slice(0, maxTopics).map((b) =>
      b
        .replace(/^(?:[-*\u2022]|\d+\.)\s+/, '')
        .split(':')[0]
        .trim()
        .slice(0, 60)
    );
  }

  // 2. Artefact prefix lines
  const artefacts = summary.match(/^(?:File|Cmd|Error|Done):\s*(.+)$/gm) ?? [];
  if (artefacts.length > 0) {
    const unique = [...new Set(artefacts.map((a) => a.split(':')[0].trim()))];
    return unique.slice(0, maxTopics);
  }

  // 3. Sentence fragments
  return summary
    .split(/[.!?]\s+/)
    .slice(0, maxTopics)
    .map((s) => s.trim().slice(0, 60))
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// formatSummary
// ---------------------------------------------------------------------------

/**
 * Renders a single CompactedNode as a structured XML block.
 *
 * @param node  The compacted node to format.
 * @param estimateTokensFn  Token estimation function (uses 4-chars heuristic by default).
 */
export function formatSummary(
  node: CompactedNode,
  estimateTokensFn: (text: string) => number = (t) => Math.ceil(t.length / 4)
): FormattedSummary {
  const topics = extractTopics(node);

  const topicsXml = topics.map((t) => `    <topic>${escapeXml(t)}</topic>`).join('\n');

  const summaryContent = `${node.summary}\n\n${node.expandFooter}`;

  const xml = [
    `<context_summary`,
    `  id="${escapeXml(node.id)}"`,
    `  depth="${node.depth}"`,
    `  mode="${escapeXml(node.mode)}"`,
    `  original_tokens="${node.originalTokens}"`,
    `  summary_tokens="${node.summaryTokens}"`,
    `  source_count="${node.sourceIds.length}">`,
    `  <topics>`,
    topicsXml,
    `  </topics>`,
    `  <summary>`,
    summaryContent
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n'),
    `  </summary>`,
    `</context_summary>`,
  ].join('\n');

  return {
    node,
    xml,
    tokens: estimateTokensFn(xml),
  };
}

// ---------------------------------------------------------------------------
// formatSummaries (batch)
// ---------------------------------------------------------------------------

/**
 * Formats an array of CompactedNodes into FormattedSummary objects.
 * Nodes are formatted in the order provided (typically oldest → newest).
 */
export function formatSummaries(
  nodes: CompactedNode[],
  estimateTokensFn?: (text: string) => number
): FormattedSummary[] {
  return nodes.map((node) => formatSummary(node, estimateTokensFn));
}

// ---------------------------------------------------------------------------
// Recall guidance
// ---------------------------------------------------------------------------

/**
 * Builds a recall guidance block to be injected into the system prompt (or as
 * a leading user message) when one or more summaries are present in the context.
 *
 * This tells the model:
 *   - That earlier conversation history was summarised
 *   - How to request expansion of a specific summary
 *   - That summaries are faithful but compressed
 */
export function buildRecallGuidance(summaryIds: string[]): string {
  const idList = summaryIds.map((id) => `  - ${id}`).join('\n');

  return [
    '<recall_guidance>',
    'The context window contains compressed summaries of earlier conversation history.',
    'Each summary was produced by the AutoMaker context compaction engine (LCM).',
    '',
    'Summary IDs present:',
    idList,
    '',
    'To expand a summary and retrieve the original messages, emit:',
    '  [lcm_expand: <summary-id>]',
    '',
    'Summaries faithfully preserve file paths, commands, errors, and decisions.',
    'Treat summarised content as authoritative unless contradicted by the fresh tail.',
    '</recall_guidance>',
  ].join('\n');
}
