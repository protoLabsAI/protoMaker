/**
 * Chat page — main route (`/`).
 *
 * Follows the production Ava chat overlay pattern:
 *   - useChatSession hook with DefaultChatTransport (model in headers)
 *   - ChatMessageList for message rendering with tool progress
 *   - ChatInput with PromptInputProvider for auto-resizing input
 *   - Role selector and model switcher in header bar
 */

import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UIMessage } from 'ai';

import { ChatMessageList, ChatInput, PromptInputProvider } from '@@PROJECT_NAME-ui';
import '@@PROJECT_NAME-ui/tool-results/weather-card.js';

import { useChatSession } from '../hooks/use-chat-session.js';
import { useToolProgress } from '../hooks/use-tool-progress.js';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AgentRole {
  id: string;
  name: string;
  systemPrompt: string;
}

// ── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute('/')({
  component: ChatPage,
});

// ── Model options ────────────────────────────────────────────────────────────

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
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  // ── Chat state (production Ava pattern) ─────────────────────────────────
  const {
    messages,
    sendMessage,
    stop,
    isStreaming,
    modelAlias,
    handleNewChat,
    handleModelChange,
  } = useChatSession({
    system: selectedRole?.systemPrompt,
  });

  // ── Tool progress from WebSocket sideband ─────────────────────────────────
  const { getProgressByToolName } = useToolProgress();

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

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    (text: string) => {
      if (isStreaming) return;
      void sendMessage({ text });
    },
    [isStreaming, sendMessage]
  );

  const handleToolApprove = useCallback(
    (approvalId: string) => {
      void sendMessage({ text: `Approved tool call ${approvalId}` });
    },
    [sendMessage]
  );

  const handleToolReject = useCallback(
    (approvalId: string) => {
      void sendMessage({ text: `Rejected tool call ${approvalId}` });
    },
    [sendMessage]
  );

  const currentModelLabel =
    MODEL_OPTIONS.find((m) => m.alias === modelAlias)?.label ?? modelAlias;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <PromptInputProvider>
      <div className="flex h-full flex-col overflow-hidden">
        {/* ── Header bar ─────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-3 py-2">
          {roles.length > 0 && (
            <select
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
              className="rounded-md border border-border bg-input px-2 py-1 text-xs text-foreground"
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={modelAlias}
            onChange={(e) => handleModelChange(e.target.value)}
            className="rounded-md border border-border bg-input px-2 py-1 text-xs text-foreground"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.alias} value={m.alias}>
                {m.label}
              </option>
            ))}
          </select>

          <span className="text-[11px] text-muted-foreground">{currentModelLabel}</span>

          <div className="flex-1" />

          <button
            onClick={handleNewChat}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
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
