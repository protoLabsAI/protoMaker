/**
 * AgentMessageCard — Delivery confirmation card for send_message_to_agent tool results.
 *
 * Renders:
 * - Message sent (truncated preview)
 * - Target feature / agent
 * - Delivery confirmation status
 */

import { Loader2, MessageSquare, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface AgentMessageData {
  message?: string;
  content?: string;
  text?: string;
  featureId?: string;
  featureTitle?: string;
  agentId?: string;
  target?: string;
  delivered?: boolean;
  success?: boolean;
  status?: string;
  [key: string]: unknown;
}

function extractData(output: unknown): AgentMessageData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as AgentMessageData;
  }
  return o as AgentMessageData;
}

function getMessage(data: AgentMessageData): string | null {
  if (typeof data.message === 'string') return data.message;
  if (typeof data.content === 'string') return data.content;
  if (typeof data.text === 'string') return data.text;
  return null;
}

function getTarget(data: AgentMessageData): string | null {
  if (typeof data.featureTitle === 'string') return data.featureTitle;
  if (typeof data.target === 'string') return data.target;
  if (typeof data.featureId === 'string') return data.featureId;
  if (typeof data.agentId === 'string') return data.agentId;
  return null;
}

function isDelivered(data: AgentMessageData, output: unknown): boolean {
  // Check data-level delivered flag
  if (typeof data.delivered === 'boolean') return data.delivered;
  // Check top-level success flag
  const o = output as Record<string, unknown>;
  if (typeof o?.success === 'boolean') return o.success;
  if (typeof data.success === 'boolean') return data.success;
  if (typeof data.status === 'string') {
    return ['delivered', 'sent', 'success', 'ok'].includes(data.status.toLowerCase());
  }
  // Default to delivered if we have data (the tool returned without error)
  return true;
}

export function AgentMessageCard({ output, state }: ToolResultRendererProps) {
  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="agent-message-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Sending message to agent…</span>
      </div>
    );
  }

  const data = extractData(output);

  if (!data) {
    return (
      <div
        data-slot="agent-message-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        Message delivery status unavailable
      </div>
    );
  }

  const message = getMessage(data);
  const target = getTarget(data);
  const delivered = isDelivered(data, output);

  return (
    <div
      data-slot="agent-message-card"
      className="rounded-md border border-border/50 bg-muted/30 text-xs"
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        <MessageSquare className="size-3.5 text-muted-foreground" />
        <span className="font-medium text-foreground/80">Agent Message</span>
        <span className="ml-auto flex items-center gap-1">
          {delivered ? (
            <>
              <CheckCircle2 className="size-3 text-green-500" />
              <span className="text-green-600 dark:text-green-400">Delivered</span>
            </>
          ) : (
            <>
              <AlertCircle className="size-3 text-destructive" />
              <span className="text-destructive">Failed</span>
            </>
          )}
        </span>
      </div>

      {/* Target */}
      {target && (
        <div className="border-b border-border/50 px-3 py-1.5">
          <span className="text-muted-foreground">To: </span>
          <span className={cn('font-medium', 'text-foreground/80')}>{target}</span>
        </div>
      )}

      {/* Message preview */}
      {message && (
        <div className="px-3 py-2">
          <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Message
          </span>
          <p className="mt-0.5 line-clamp-3 text-foreground/80">{message}</p>
        </div>
      )}
    </div>
  );
}
