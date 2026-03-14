/**
 * usePmChat — Thin wrapper around useChat pointed at the PM agent endpoint.
 *
 * Injects projectPath and projectSlug into the transport body so the server
 * can scope the conversation to the correct project.
 */

import { useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

interface UsePmChatOptions {
  projectPath: string;
  projectSlug: string;
}

export function usePmChat({ projectPath, projectSlug }: UsePmChatOptions) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/project-pm/chat',
        body: { projectPath, projectSlug },
        credentials: 'include',
      }),
    [projectPath, projectSlug]
  );

  const { messages, sendMessage, stop, status, error } = useChat({ transport });

  return {
    messages,
    sendMessage,
    stop,
    isStreaming: status === 'streaming' || status === 'submitted',
    error,
  };
}
