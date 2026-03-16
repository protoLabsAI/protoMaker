/**
 * Prompt builders for context compaction and condensation.
 *
 * Leaf-level compaction (LeafCompactor) uses two LLM-based modes:
 *   - normal      Full context-preserving summary (800-1200 tokens)
 *   - aggressive  Artefact-only extraction (200-400 tokens)
 *
 * A third leaf mode (deterministic) requires no prompt — it is handled
 * entirely by regex in LeafCompactor and is used as the final fallback
 * when LLM calls fail.
 *
 * Multi-depth condensation (CondensationEngine) uses depth-aware prompts:
 *   - D1 (targetDepth=1)  Preserve session decisions, file paths, errors,
 *                          commands, and what was accomplished.
 *   - D2+ (targetDepth≥2) Preserve only trajectory and durable decisions;
 *                          omit step-level artefacts.
 */

export interface LeafPromptInput {
  role: string;
  content: string;
}

export interface LeafPromptResult {
  system: string;
  user: string;
}

/**
 * Build the system + user prompts for a leaf-compaction LLM call.
 *
 * @param messages  The messages to summarise, ordered oldest → newest.
 * @param mode      'normal' for a full summary; 'aggressive' for minimal
 *                  artefact extraction.
 */
export function buildLeafPrompt(
  messages: LeafPromptInput[],
  mode: 'normal' | 'aggressive'
): LeafPromptResult {
  const conversation = messages
    .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join('\n\n---\n\n');

  if (mode === 'normal') {
    return {
      system: [
        'You are a context compaction engine.',
        'Summarise the following conversation segment into a compact, faithful representation.',
        '',
        'You MUST preserve:',
        '  \u2022 All file paths mentioned (e.g. src/foo.ts, apps/server/routes.ts)',
        '  \u2022 All shell commands that were run',
        '  \u2022 All error messages and stack traces (abbreviated to first line)',
        '  \u2022 Key decisions made and the reasoning behind them',
        '  \u2022 What was accomplished',
        '',
        'Format as a concise bulleted list of 6\u201312 items.',
        'Each bullet is one complete thought.',
        'Target output length: 800\u20131\u202c200 tokens.',
        'Do NOT add introductory or closing prose.',
      ].join('\n'),
      user: `Summarise this conversation segment:\n\n${conversation}`,
    };
  }

  // aggressive mode — minimal artefact extraction
  return {
    system: [
      'You are a context compaction engine operating in aggressive mode.',
      'Extract ONLY the essential artefacts. Be extremely brief.',
      '',
      'Use these prefixes for each item:',
      '  "File: <path>"    \u2014 every file path mentioned',
      '  "Cmd: <command>"  \u2014 every command that was run (first line only)',
      '  "Error: <msg>"    \u2014 every error message (first line only)',
      '  "Done: <outcome>" \u2014 the final outcome, one sentence maximum',
      '',
      'No prose. No explanations. Only the above artefact lines.',
      'Target output length: 200\u2013400 tokens.',
    ].join('\n'),
    user: `Extract artefacts from:\n\n${conversation}`,
  };
}

// ---------------------------------------------------------------------------
// Condensation prompts (multi-depth, used by CondensationEngine)
// ---------------------------------------------------------------------------

export interface CondensationPromptInput {
  /** Depth of the source node (0 = leaf, 1+ = already condensed). */
  depth: number;
  /** Summary text of the source node. */
  summary: string;
  /** Token estimate of the source summary. */
  tokens: number;
}

export interface CondensationPromptResult {
  system: string;
  user: string;
}

/**
 * Build depth-aware system + user prompts for a condensation LLM call.
 *
 * - targetDepth === 1  (D1): Summarising raw leaf nodes.
 *   Preserves session decisions, key file paths, commands, errors,
 *   what was accomplished, and open blockers.
 *
 * - targetDepth >= 2   (D2+): Summarising already-condensed nodes.
 *   Preserves ONLY trajectory and durable decisions; omits step-level
 *   artefacts (individual file paths, commands, error details).
 *
 * @param nodes        The source summary nodes to condense.
 * @param targetDepth  The depth of the node being created (always >= 1).
 */
export function buildCondensationPrompt(
  nodes: CondensationPromptInput[],
  targetDepth: number
): CondensationPromptResult {
  const content = nodes
    .map((n, i) => `[Summary ${i + 1} — depth-${n.depth}, ~${n.tokens} tokens]:\n${n.summary}`)
    .join('\n\n---\n\n');

  if (targetDepth === 1) {
    // D1: condensing leaf (depth-0) summaries → preserve session decisions
    return {
      system: [
        'You are a context condensation engine (depth-1 pass).',
        'Condense the following session summaries into a single higher-level summary.',
        '',
        'You MUST preserve:',
        '  \u2022 Key decisions made and the reasoning behind them',
        '  \u2022 Important file paths and commands referenced',
        '  \u2022 Errors encountered and how they were resolved',
        '  \u2022 What was accomplished in this session segment',
        '  \u2022 Any open questions or blockers that remain',
        '',
        'Format as a concise bulleted list of 6\u201310 items.',
        'Each bullet is one complete thought.',
        'Target output length: 600\u20131\u202c000 tokens.',
        'Do NOT add introductory or closing prose.',
      ].join('\n'),
      user: `Condense these session summaries into a single depth-1 summary:\n\n${content}`,
    };
  }

  // D2+: condensing already-condensed summaries → trajectory and durable decisions only
  return {
    system: [
      `You are a context condensation engine (depth-${targetDepth} pass).`,
      'Condense the following high-level summaries into a compact trajectory record.',
      '',
      'At this depth, preserve ONLY:',
      '  \u2022 Durable decisions that affect the overall project direction',
      '  \u2022 High-level trajectory: what was built and what approach was taken',
      '  \u2022 Major architectural or design choices',
      '  \u2022 Significant blockers that were resolved',
      '',
      'OMIT:',
      '  \u2022 Individual file paths and commands',
      '  \u2022 Detailed error messages',
      '  \u2022 Step-by-step implementation details',
      '',
      'Format as 4\u20136 concise bullet points.',
      'Target output length: 300\u2013600 tokens.',
      'Do NOT add introductory or closing prose.',
    ].join('\n'),
    user:
      `Condense these depth-${targetDepth - 1} summaries into a ` +
      `depth-${targetDepth} trajectory record:\n\n${content}`,
  };
}
