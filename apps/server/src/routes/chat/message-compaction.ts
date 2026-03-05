/**
 * Message-level compaction for chat history.
 *
 * Runs a token-budget check before sending messages to Claude.
 * When the estimated total exceeds the budget, older messages are compacted:
 * - Tool results are replaced with one-line summaries
 * - Long assistant text responses are truncated
 * - The most recent N messages are preserved verbatim
 */

import type { ModelMessage } from 'ai';

const CHARS_PER_TOKEN = 4;

/** Default token budget before compaction triggers (~100K tokens) */
export const COMPACTION_BUDGET_TOKENS = 100_000;

/** Number of recent messages to preserve verbatim during compaction */
const PRESERVE_RECENT_COUNT = 10;

/** Max characters for assistant text in compacted messages (~125 tokens) */
const MAX_ASSISTANT_CHARS = 500;

/** Max characters for tool result content in compacted messages */
const TOOL_RESULT_MAX_CHARS = 200;

/**
 * Counts raw characters in a single message across all content shapes.
 * Handles: string content, text parts, tool-result parts, and arbitrary objects.
 */
function messageChars(msg: ModelMessage): number {
  const { content } = msg;

  if (typeof content === 'string') {
    return content.length;
  }

  if (!Array.isArray(content)) {
    return JSON.stringify(content).length;
  }

  let total = 0;
  for (const part of content as Array<Record<string, unknown>>) {
    if (typeof part['text'] === 'string') {
      total += part['text'].length;
    } else if (typeof part['content'] === 'string') {
      total += part['content'].length;
    } else if (Array.isArray(part['content'])) {
      // Nested content array (e.g. tool-result with sub-parts)
      for (const sub of part['content'] as Array<Record<string, unknown>>) {
        if (typeof sub['text'] === 'string') {
          total += sub['text'].length;
        } else {
          total += JSON.stringify(sub).length;
        }
      }
    } else {
      total += JSON.stringify(part).length;
    }
  }
  return total;
}

/**
 * Estimates the total token count for an array of model messages.
 * Uses a 4 chars ≈ 1 token heuristic.
 */
export function estimateTokens(messages: ModelMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += messageChars(msg);
  }
  return Math.ceil(total / CHARS_PER_TOKEN);
}

/**
 * Truncates a string to maxChars, appending a compaction marker when truncated.
 */
function truncate(str: string, maxChars: number): string {
  if (str.length <= maxChars) return str;
  return str.slice(0, maxChars) + '... [compacted]';
}

/**
 * Summarizes a tool result value to a single line within TOOL_RESULT_MAX_CHARS.
 */
function summarizeToolContent(content: unknown): string {
  const str = typeof content === 'string' ? content : JSON.stringify(content);
  return truncate(str, TOOL_RESULT_MAX_CHARS);
}

/**
 * Compacts a single message, reducing tool results and long assistant text.
 * User messages are returned unchanged to preserve conversational context.
 */
function compactMessage(msg: ModelMessage): ModelMessage {
  if (msg.role === 'tool') {
    if (!Array.isArray(msg.content)) return msg;

    const compactedContent = (msg.content as Array<Record<string, unknown>>).map((part) => {
      if (part['type'] === 'tool-result') {
        return { ...part, content: summarizeToolContent(part['content']) };
      }
      return part;
    });

    return { ...msg, content: compactedContent } as ModelMessage;
  }

  if (msg.role === 'assistant') {
    if (typeof msg.content === 'string') {
      return { ...msg, content: truncate(msg.content, MAX_ASSISTANT_CHARS) };
    }

    if (Array.isArray(msg.content)) {
      const compactedContent = (msg.content as Array<Record<string, unknown>>).map((part) => {
        if (part['type'] === 'text' && typeof part['text'] === 'string') {
          return { ...part, text: truncate(part['text'], MAX_ASSISTANT_CHARS) };
        }
        return part;
      });
      return { ...msg, content: compactedContent } as ModelMessage;
    }
  }

  return msg;
}

/**
 * Runs a compaction pass over the message history when the estimated token
 * count exceeds budgetTokens.
 *
 * Strategy:
 * - The most recent PRESERVE_RECENT_COUNT messages are kept verbatim.
 * - Older messages have tool results summarized to one-line and long
 *   assistant responses truncated.
 *
 * @param messages - Full model message history
 * @param budgetTokens - Token budget threshold (default: COMPACTION_BUDGET_TOKENS)
 * @returns The (possibly compacted) message array
 */
export function compactMessageHistory(
  messages: ModelMessage[],
  budgetTokens: number = COMPACTION_BUDGET_TOKENS
): ModelMessage[] {
  if (estimateTokens(messages) <= budgetTokens) {
    return messages;
  }

  const preserveCount = Math.min(PRESERVE_RECENT_COUNT, messages.length);
  const splitIndex = messages.length - preserveCount;

  const olderMessages = messages.slice(0, splitIndex).map(compactMessage);
  const recentMessages = messages.slice(splitIndex);

  return [...olderMessages, ...recentMessages];
}
