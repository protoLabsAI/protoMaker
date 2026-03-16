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
 * `useChatSession` coordinates AI SDK's `useChat` with the persistent
 * Zustand session store, giving us multi-session support, model switching,
 * and message persistence for free.
 *
 * ## Tool progress
 *
 * `useToolProgress` subscribes to the WebSocket sideband (`WS_PORT`, default
 * 3002) and feeds live progress labels to tool invocation cards so users see
 * e.g. "Fetching forecast..." while `get_weather` is running.
 *
 * ## HITL confirmation
 *
 * When the model requests approval for a destructive tool call, the streaming
 * response includes an `approval-requested` state. `ToolInvocationPart`
 * renders a `ConfirmationCard` with Approve/Reject buttons.  The handlers
 * below send the decision back via `sendMessage()`.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UIMessage } from 'ai';

import { ChatMessageList, ChatInput, PromptInputProvider } from '@@PROJECT_NAME-ui';

// Register the WeatherCard custom tool renderer (side-effect import)
import '@@PROJECT_NAME-ui/tool-results/weather-card.js';

import { useChatSession } from '../hooks/use-chat-session.js';
import { useToolProgress } from '../hooks/use-tool-progress.js';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AgentRole {
  id: string;
  name: string;
  systemPrompt: string;
  defaultModel?: string;
}

// ── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute('/')({
  component: ChatPage,
});

// ── Model aliases ────────────────────────────────────────────────────────────

const MODEL_OPTIONS = [
  { alias: 'claude-haiku-4-5-20251001', label: 'Haiku' },
  { alias: 'claude-sonnet-4-6', label: 'Sonnet' },
  { alias: 'claude-opus-4-6', label: 'Opus' },
] as const;

// ── Chat page ────────────────────────────────────────────────────────────────

function ChatPage() {
  // ── Role state ───────────────────────────────────────────────────────────
  const [roles, setRoles] = useState<AgentRole[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');

  useEffect(() => {
    fetch('/api/roles')
      .then((r) => r.json())
      .then((data: AgentRole[]) => {
        setRoles(data);
        if (data.length > 0 && !selectedRoleId) {
          setSelectedRoleId(data[0].id);
        }
      })
      .catch(() => {
        // Roles endpoint may not be available — continue without roles
      });
    // Only fetch once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  // ── Streaming chat state via session hook ────────────────────────────────
  const {
    messages,
    sendMessage,
    stop,
    isStreaming,
    currentSession,
    handleNewChat,
    handleModelChange,
  } = useChatSession({
    body: selectedRole ? { system: selectedRole.systemPrompt } : undefined,
  });

  // ── Tool progress from WebSocket sideband ─────────────────────────────────
  const { getProgressByToolName } = useToolProgress();

  /**
   * Build a toolCallId -> toolName lookup from the current message stream so
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
      void sendMessage({ text });
    },
    [sendMessage]
  );

  // ── HITL tool approval ────────────────────────────────────────────────────
  const handleToolApprove = useCallback(
    (approvalId: string) => {
      void sendMessage({
        text: `Approved tool call ${approvalId}`,
      });
    },
    [sendMessage]
  );

  const handleToolReject = useCallback(
    (approvalId: string) => {
      void sendMessage({
        text: `Rejected tool call ${approvalId}`,
      });
    },
    [sendMessage]
  );

  // ── Current model display label ─────────────────────────────────────────
  const currentModel = currentSession?.model ?? 'claude-haiku-4-5-20251001';
  const currentModelLabel =
    MODEL_OPTIONS.find((m) => m.alias === currentModel)?.label ?? currentModel;

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
        {/* ── Header bar ─────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 16px',
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--surface)',
            flexShrink: 0,
            fontSize: 13,
          }}
        >
          {/* Role selector */}
          {roles.length > 0 && (
            <select
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
              style={{
                background: 'var(--surface-2)',
                color: 'var(--foreground)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          )}

          {/* Model selector */}
          <select
            value={currentModel}
            onChange={(e) => handleModelChange(e.target.value)}
            style={{
              background: 'var(--surface-2)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.alias} value={m.alias}>
                {m.label}
              </option>
            ))}
          </select>

          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{currentModelLabel}</span>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* New Chat button */}
          <button
            onClick={handleNewChat}
            style={{
              background: 'var(--primary)',
              color: 'var(--primary-foreground)',
              border: 'none',
              borderRadius: 6,
              padding: '4px 12px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            New Chat
          </button>
        </div>

        {/* ── Message list ───────────────────────────────────────────── */}
        <ChatMessageList
          messages={messages as UIMessage[]}
          isStreaming={isStreaming}
          getToolProgressLabel={getToolProgressLabel}
          onToolApprove={handleToolApprove}
          onToolReject={handleToolReject}
          emptyMessage="Start a conversation with your AI agent..."
        />

        {/* ── Input area ─────────────────────────────────────────────── */}
        <ChatInput
          onSubmit={handleSubmit}
          onStop={stop}
          isStreaming={isStreaming}
          autoFocus
          placeholder="Ask anything..."
        />
      </div>
    </PromptInputProvider>
  );
}
