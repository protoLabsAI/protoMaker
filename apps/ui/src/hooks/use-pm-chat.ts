/**
 * usePmChat — Wraps useChat pointed at /api/project-pm/chat.
 *
 * Injects projectPath and projectSlug into the transport body so the
 * PM agent can load the correct project context.
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

  const isStreaming = status === 'streaming' || status === 'submitted';

  return { messages, sendMessage, stop, isStreaming, error };
}
