import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  compactMessageHistory,
  COMPACTION_BUDGET_TOKENS,
} from '../../../src/routes/chat/message-compaction.js';
import type { ModelMessage } from 'ai';

describe('estimateTokens', () => {
  it('returns 0 for empty array', () => {
    expect(estimateTokens([])).toBe(0);
  });

  it('estimates tokens from string content', () => {
    const messages: ModelMessage[] = [{ role: 'user', content: 'abcd' }]; // 4 chars = 1 token
    expect(estimateTokens(messages)).toBe(1);
  });

  it('estimates tokens from array text parts', () => {
    const messages: ModelMessage[] = [
      {
        role: 'assistant',
        content: [{ type: 'text', text: '12345678' }], // 8 chars = 2 tokens
      } as unknown as ModelMessage,
    ];
    expect(estimateTokens(messages)).toBe(2);
  });

  it('accumulates tokens across multiple messages', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'aaaa' }, // 1 token
      { role: 'assistant', content: 'bbbbbbbb' }, // 2 tokens
    ];
    expect(estimateTokens(messages)).toBe(3);
  });
});

describe('compactMessageHistory', () => {
  it('returns messages unchanged when under budget', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];
    const result = compactMessageHistory(messages, COMPACTION_BUDGET_TOKENS);
    expect(result).toBe(messages); // same reference — no compaction needed
  });

  it('compacts tool results in older messages', () => {
    // Build a history that exceeds the budget
    const longContent = 'x'.repeat(400_001 * 4); // ~400K tokens worth of chars
    const toolMsg: ModelMessage = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'call1',
          toolName: 'test',
          content: longContent,
        },
      ],
    } as unknown as ModelMessage;

    const recentMessages: ModelMessage[] = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `message ${i}`,
    }));

    const messages = [toolMsg, ...recentMessages];
    const result = compactMessageHistory(messages, COMPACTION_BUDGET_TOKENS);

    // Recent 10 messages should be verbatim
    expect(result.slice(-10)).toEqual(recentMessages);

    // Tool result should be compacted
    const compactedTool = result[0];
    const parts = compactedTool.content as Array<Record<string, unknown>>;
    const resultContent = parts[0]['content'] as string;
    expect(resultContent).toContain('[compacted]');
    expect(resultContent.length).toBeLessThan(longContent.length);
  });

  it('preserves the most recent 10 messages verbatim', () => {
    const longAssistant = 'w'.repeat(400_001 * 4);
    const oldMsg: ModelMessage = { role: 'assistant', content: longAssistant };

    const recent10: ModelMessage[] = Array.from({ length: 10 }, (_, i) => ({
      role: 'user',
      content: `recent ${i}`,
    }));

    const messages = [oldMsg, ...recent10];
    const result = compactMessageHistory(messages, COMPACTION_BUDGET_TOKENS);

    // The last 10 entries must match recent10 exactly
    expect(result.slice(-10)).toEqual(recent10);
  });

  it('truncates long assistant text in older messages', () => {
    const longText = 'a'.repeat(100_000 * 4); // way over budget
    const messages: ModelMessage[] = [
      { role: 'assistant', content: longText },
      ...Array.from({ length: 10 }, (_, i) => ({
        role: 'user' as const,
        content: `r${i}`,
      })),
    ];

    const result = compactMessageHistory(messages, COMPACTION_BUDGET_TOKENS);
    const firstMsg = result[0];
    expect(typeof firstMsg.content).toBe('string');
    expect((firstMsg.content as string).length).toBeLessThan(longText.length);
    expect(firstMsg.content as string).toContain('[compacted]');
  });
});
