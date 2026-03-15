/**
 * Chat page — main route (`/`).
 *
 * Composes the full chat UI from the `@@PROJECT_NAME-ui` package:
 *
 * - **ChatMessageList** — scrollable message thread with stick-to-bottom
 * - **ChatMessage** — role-based bubbles rendering all UIMessagePart types
 *   including text (markdown), reasoning (ChainOfThought), tool calls
 *   (ToolInvocationPart), and HITL confirmation cards (ConfirmationCard)
 * - **ChatInput** — auto-resizing textarea with send/stop actions
 * - **PromptInputProvider** — context provider for the input value
 * - **WeatherCard** — registers custom renderer for the `get_weather` tool
 *
 * ## State management
 *
 * `useChat` from `@ai-sdk/react` drives the conversation: it streams messages
 * from `POST /api/chat`, appends user turns, and exposes `status` so the UI
 * can show loading indicators while the model is responding.
 *
 * ## Tool progress
 *
 * `useToolProgress` subscribes to the WebSocket sideband (`WS_PORT`, default
 * 3002) and feeds live progress labels to tool invocation cards so users see
 * e.g. "Fetching forecast…" while `get_weather` is running.
 *
 * ## HITL confirmation
 *
 * When the model requests approval for a destructive tool call, the streaming
 * response includes an `approval-requested` state. `ToolInvocationPart`
 * renders a `ConfirmationCard` with Approve/Reject buttons.  The handlers
 * below send the decision back via `append()`.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';

// Import UI components via relative path.
// In a scaffolded project these would be:  import { ... } from '@@PROJECT_NAME-ui';
import { ChatMessageList, ChatInput, PromptInputProvider } from '../../ui/src/index.js';

// Register the WeatherCard custom tool renderer (side-effect import)
import '../../ui/src/tool-results/weather-card.js';

import { useToolProgress } from '../hooks/use-tool-progress.js';

// ─── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute('/')({
  component: ChatPage,
});

// ─── Chat page ────────────────────────────────────────────────────────────────

function ChatPage() {
  // ── Streaming chat state ──────────────────────────────────────────────────
  const { messages, append, stop, status } = useChat({
    api: '/api/chat',
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  // ── Tool progress from WebSocket sideband ─────────────────────────────────
  const { getProgressByToolName } = useToolProgress();

  /**
   * Build a toolCallId → toolName lookup from the current message stream so
   * we can map the toolCallId (used by ChatMessage) to the toolName key used
   * by the progress map.
   */
  const toolCallIdToName = useMemo(() => {
    const map = new Map<string, string>();
    for (const msg of messages) {
      for (const part of msg.parts ?? []) {
        const p = part as Record<string, unknown>;
        if (typeof p.toolCallId === 'string' && typeof p.toolName === 'string') {
          map.set(p.toolCallId, p.toolName);
        }
      }
    }
    return map;
  }, [messages]);

  const getToolProgressLabel = useCallback(
    (toolCallId: string): string | undefined => {
      const toolName = toolCallIdToName.get(toolCallId);
      return toolName ? getProgressByToolName(toolName) : undefined;
    },
    [toolCallIdToName, getProgressByToolName]
  );

  // ── Input submission ──────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    (text: string) => {
      void append({ role: 'user', content: text });
    },
    [append]
  );

  // ── HITL tool approval ────────────────────────────────────────────────────
  // When the model requests human-in-the-loop confirmation for a destructive
  // tool call, the user's decision is sent back as a data message.
  const handleToolApprove = useCallback(
    (approvalId: string) => {
      void append({
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Approved tool call ${approvalId}`,
          },
        ],
        // Include the approval metadata for server-side processing
        data: { type: 'tool-approval', approvalId, approved: true },
      });
    },
    [append]
  );

  const handleToolReject = useCallback(
    (approvalId: string) => {
      void append({
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Rejected tool call ${approvalId}`,
          },
        ],
        data: { type: 'tool-approval', approvalId, approved: false },
      });
    },
    [append]
  );

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <PromptInputProvider>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* ── Message list ───────────────────────────────────────────────── */}
        <ChatMessageList
          messages={messages as UIMessage[]}
          isStreaming={isStreaming}
          getToolProgressLabel={getToolProgressLabel}
          onToolApprove={handleToolApprove}
          onToolReject={handleToolReject}
          emptyMessage="Start a conversation with your AI agent…"
        />

        {/* ── Input area ─────────────────────────────────────────────────── */}
        <ChatInput
          onSubmit={handleSubmit}
          onStop={stop}
          isStreaming={isStreaming}
          autoFocus
          placeholder="Ask anything…"
        />
      </div>
    </PromptInputProvider>
  );
}
