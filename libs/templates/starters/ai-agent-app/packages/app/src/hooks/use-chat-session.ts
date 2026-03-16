/**
 * useChatSession — Coordinates AI SDK useChat with model/role selection.
 *
 * Follows the same pattern as the production Ava chat overlay:
 *   - DefaultChatTransport with model alias in headers
 *   - useChat for message state management
 *   - sendMessage({ text }) for user input
 *
 * Usage:
 *   const { messages, sendMessage, stop, isStreaming } = useChatSession();
 */

import { useCallback, useMemo, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const CHAT_API_URL = '/api/chat';

interface UseChatSessionOptions {
  /** Model alias: 'haiku', 'sonnet', 'opus', or a full model ID. */
  defaultModel?: string;
  /** Base URL of the chat API. */
  apiUrl?: string;
  /** System prompt override (e.g. from role selection). */
  system?: string;
}

export function useChatSession({
  defaultModel = DEFAULT_MODEL,
  apiUrl = CHAT_API_URL,
  system,
}: UseChatSessionOptions = {}) {
  const [modelAlias, setModelAlias] = useState(defaultModel);

  // Build transport matching the production Ava pattern:
  // - Model alias in headers (not body) so the server reads it consistently
  // - System prompt in body when a role is selected
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: apiUrl,
        headers: {
          'x-model-alias': modelAlias,
        },
        body: {
          ...(system ? { system } : {}),
        },
      }),
    [apiUrl, modelAlias, system]
  );

  const { messages, sendMessage, stop, status, setMessages, error } = useChat({
    transport,
    onError: (err) => {
      console.error('[useChatSession] Chat error:', err);
    },
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  const handleNewChat = useCallback(() => {
    setMessages([]);
  }, [setMessages]);

  const handleModelChange = useCallback((model: string) => {
    setModelAlias(model);
  }, []);

  return {
    messages,
    sendMessage,
    stop,
    isStreaming,
    error,
    setMessages,
    modelAlias,
    handleNewChat,
    handleModelChange,
  };
}
