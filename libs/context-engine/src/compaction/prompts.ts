/**
 * Prompt builders for leaf-level context compaction.
 *
 * Two LLM-based modes are supported:
 *   - normal      Full context-preserving summary (800-1200 tokens)
 *   - aggressive  Artefact-only extraction (200-400 tokens)
 *
 * A third mode (deterministic) requires no prompt — it is handled entirely by
 * regex in LeafCompactor and is used as the final fallback when LLM calls fail.
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
