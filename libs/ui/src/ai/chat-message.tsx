/**
 * ChatMessage — Role-based message bubble with avatar and rich part rendering.
 *
 * Composable: ChatMessage wraps ChatMessageAvatar + ChatMessageBubble.
 * Uses CVA variants for user/assistant/system styling.
 *
 * Renders all UIMessagePart types: text (markdown), reasoning (collapsible),
 * tool calls (collapsible card or grouped TaskBlock), sources, and step boundaries.
 *
 * Multi-tool grouping:
 *  - Consecutive tool parts within the same step are grouped into a TaskBlock.
 *  - Single-tool steps render as individual ToolInvocationPart cards (no wrapping).
 *
 * Citation support:
 *  - Extracts data-citations parts from the message (written by the server's
 *    citation extraction step) and passes them to ChatMessageMarkdown.
 *  - Renders a MessageSources section below the bubble when citations are present.
 */

import { cva, type VariantProps } from 'class-variance-authority';
import { Bot, Loader2, User } from 'lucide-react';
import type { UIMessage } from 'ai';
import { cn } from '../lib/utils.js';
import { ChainOfThought } from './chain-of-thought.js';
import { ToolInvocationPart, type ToolInvocationPartProps } from './tool-invocation-part.js';
import { TaskBlock, type ToolInvocationItem, type TaskToolState } from './task-block.js';
import { ChatMessageMarkdown } from './chat-message-markdown.js';
import { MessageSources } from './message-sources.js';
import type { Citation } from './inline-citation.js';

const messageVariants = cva('flex gap-3 px-4 py-2', {
  variants: {
    role: {
      user: 'flex-row-reverse',
      assistant: 'flex-row',
      system: 'justify-center',
    },
  },
  defaultVariants: { role: 'assistant' },
});

const bubbleVariants = cva('rounded-lg px-3 py-2 text-sm max-w-[85%]', {
  variants: {
    role: {
      user: 'bg-primary text-primary-foreground ml-auto',
      assistant: 'bg-muted text-foreground mr-auto',
      system: 'bg-accent text-accent-foreground text-xs italic',
    },
  },
  defaultVariants: { role: 'assistant' },
});

const avatarVariants = cva('flex size-7 shrink-0 items-center justify-center rounded-full', {
  variants: {
    role: {
      user: 'bg-primary/20 text-primary',
      assistant: 'bg-primary text-primary-foreground',
      system: 'hidden',
    },
  },
  defaultVariants: { role: 'assistant' },
});

export type MessageRole = 'user' | 'assistant' | 'system';

export function ChatMessageAvatar({ role, className }: { role: MessageRole; className?: string }) {
  if (role === 'system') return null;
  return (
    <div data-slot="chat-message-avatar" className={cn(avatarVariants({ role }), className)}>
      {role === 'assistant' ? <Bot className="size-4" /> : <User className="size-4" />}
    </div>
  );
}

export function ChatMessageBubble({
  role,
  children,
  className,
}: {
  role: MessageRole;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-slot="chat-message-bubble" className={cn(bubbleVariants({ role }), className)}>
      {children}
    </div>
  );
}

/**
 * StepStartPart — Subtle visual separator between agentic steps.
 *
 * Rendered whenever the message stream includes a `step-start` part, which
 * signals a new reasoning/tool iteration. A thin rule with an optional label
 * keeps the UI readable without being intrusive.
 */
export function StepStartPart({ stepIndex }: { stepIndex?: number }) {
  return (
    <div
      data-slot="step-start"
      className="my-2 flex items-center gap-2"
      aria-label={stepIndex !== undefined ? `Step ${stepIndex + 1}` : 'New step'}
    >
      <hr className="flex-1 border-border/30" />
      {stepIndex !== undefined && (
        <span className="select-none text-[10px] font-medium uppercase tracking-wider text-muted-foreground/50">
          step {stepIndex + 1}
        </span>
      )}
      <hr className="flex-1 border-border/30" />
    </div>
  );
}

/** Extract the tool name from a part that could be typed or dynamic */
function getToolName(part: Record<string, unknown>): string {
  // DynamicToolUIPart has { type: 'dynamic-tool', toolName: '...' }
  if ('toolName' in part && typeof part.toolName === 'string') return part.toolName;
  // ToolUIPart has { type: 'tool-<name>' }
  const typeStr = part.type as string;
  if (typeStr.startsWith('tool-')) return typeStr.slice(5);
  return 'unknown';
}

/** Check if a part is a tool invocation (typed or dynamic) */
function isToolPart(part: Record<string, unknown>): boolean {
  const t = part.type as string;
  return t === 'dynamic-tool' || (t.startsWith('tool-') && t !== 'tool');
}

// ---------------------------------------------------------------------------
// Segment-based part grouping
// ---------------------------------------------------------------------------

/**
 * A segment is either:
 *  - 'step-start': a step boundary marker
 *  - 'tool-group': one or more consecutive tool invocation parts
 *  - 'other': any non-tool, non-step part (text, reasoning, source-url, …)
 */
type PartSegment =
  | { kind: 'step-start'; stepIndex: number }
  | { kind: 'tool-group'; tools: ToolInvocationItem[]; segKey: string }
  | { kind: 'other'; part: Record<string, unknown>; partIndex: number };

/**
 * Walk rawParts and collapse consecutive tool parts that appear between the
 * same pair of step-start markers into a single tool-group segment.
 */
function buildSegments(rawParts: Array<Record<string, unknown>>): PartSegment[] {
  const segments: PartSegment[] = [];
  let stepCounter = -1;
  let i = 0;

  while (i < rawParts.length) {
    const part = rawParts[i];

    if (part.type === 'step-start') {
      stepCounter += 1;
      segments.push({ kind: 'step-start', stepIndex: stepCounter });
      i++;
      continue;
    }

    if (isToolPart(part)) {
      const tools: ToolInvocationItem[] = [];
      const groupStart = i;

      while (i < rawParts.length && isToolPart(rawParts[i])) {
        const p = rawParts[i];
        tools.push({
          toolName: getToolName(p),
          toolCallId: (p.toolCallId as string) ?? `tool-${i}`,
          state: ((p.state as string) ?? 'input-available') as TaskToolState,
          input: p.input,
          output: p.output,
          errorText: p.errorText as string | undefined,
          title: p.title as string | undefined,
        });
        i++;
      }

      segments.push({ kind: 'tool-group', tools, segKey: `tg-${groupStart}` });
      continue;
    }

    segments.push({ kind: 'other', part, partIndex: i });
    i++;
  }

  return segments;
}

/** Terminal tool states — the tool has finished (success, error, or denied). */
const TERMINAL_TOOL_STATES = new Set(['output-available', 'output-error', 'output-denied']);

/**
 * Returns true when the message still has at least one tool in a running state,
 * meaning the agentic loop has not yet finished.
 */
function isMessageStreaming(rawParts: Array<Record<string, unknown>>): boolean {
  return rawParts.some((p) => isToolPart(p) && !TERMINAL_TOOL_STATES.has(p.state as string));
}

// ---------------------------------------------------------------------------
// Step progress indicator
// ---------------------------------------------------------------------------

/**
 * Shown at the top of the assistant bubble during long-running streaming
 * operations (multiple agentic steps or many tool calls).  Disappears once
 * the message finishes streaming.
 */
function MessageProgressIndicator({
  stepCount,
  toolCount,
  streaming,
}: {
  stepCount: number;
  toolCount: number;
  streaming: boolean;
}) {
  if (!streaming || stepCount < 1 || toolCount < 1) return null;
  return (
    <div
      data-slot="message-progress-indicator"
      className="mb-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground"
    >
      <Loader2 className="size-2.5 animate-spin" />
      <span>
        Step {stepCount} · {toolCount} tool{toolCount !== 1 ? 's' : ''} called
      </span>
    </div>
  );
}

/**
 * Extract resolved citations from message parts.
 * The server writes these as `data-citations` UIMessageChunks; the AI SDK
 * surfaces them in the message's parts array as `{ type: 'data-citations', data: Citation[] }`.
 */
function extractCitations(parts: Array<Record<string, unknown>>): Citation[] {
  for (const part of parts) {
    if (part.type === 'data-citations' && Array.isArray(part.data)) {
      return part.data as Citation[];
    }
  }
  return [];
}

/**
 * Render a single non-tool, non-step message part.
 * Tool and step-start parts are handled upstream by the segment loop.
 */
function MessagePartRenderer({
  part,
  citations,
}: {
  part: Record<string, unknown>;
  citations: Citation[];
}) {
  const type = part.type as string;

  if (type === 'text') {
    const text = part.text as string;
    if (!text) return null;
    return <ChatMessageMarkdown content={text} citations={citations} />;
  }

  if (type === 'reasoning') {
    return (
      <ChainOfThought
        text={part.text as string}
        state={part.state as 'streaming' | 'done' | undefined}
      />
    );
  }

  if (type === 'source-url') {
    const url = part.url as string;
    const title = (part.title as string) || url;
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="my-0.5 inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/50 px-2 py-0.5 text-[10px] text-primary hover:bg-muted"
      >
        {title}
      </a>
    );
  }

  // data-citations are consumed by extractCitations() — not rendered inline.
  // source-document, file, data-* — render nothing.
  return null;
}

export function ChatMessage({
  message,
  className,
}: {
  message: UIMessage;
  className?: string;
} & Partial<VariantProps<typeof messageVariants>>) {
  const role = message.role as MessageRole;
  const parts = message.parts ?? [];

  // For user messages, extract text only (users don't produce tool calls)
  if (role === 'user') {
    const textContent = parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');
    if (!textContent) return null;
    return (
      <div data-slot="chat-message" className={cn(messageVariants({ role }), className)}>
        <ChatMessageAvatar role={role} />
        <ChatMessageBubble role={role}>
          <p className="whitespace-pre-wrap">{textContent}</p>
        </ChatMessageBubble>
      </div>
    );
  }

  // For assistant/system messages, render all parts
  const rawParts = parts as Array<Record<string, unknown>>;

  const hasContent = rawParts.some(
    (p) =>
      (p.type === 'text' && (p as { text: string }).text) ||
      p.type === 'reasoning' ||
      p.type === 'step-start' ||
      isToolPart(p) ||
      p.type === 'source-url'
  );
  if (!hasContent) return null;

  // Extract server-resolved citations from data-citations parts
  const citations = extractCitations(rawParts);

  // Build grouped segments: step-start markers, tool groups, and other parts
  const segments = buildSegments(rawParts);

  // Stats for the progress indicator
  const stepCount = rawParts.filter((p) => p.type === 'step-start').length;
  const toolCount = rawParts.filter((p) => isToolPart(p)).length;
  const streaming = isMessageStreaming(rawParts);

  return (
    <div data-slot="chat-message" className={cn(messageVariants({ role }), className)}>
      <ChatMessageAvatar role={role} />
      <ChatMessageBubble role={role}>
        {/* Step progress indicator — visible while the message is still streaming */}
        <MessageProgressIndicator
          stepCount={stepCount}
          toolCount={toolCount}
          streaming={streaming}
        />

        {segments.map((seg, i) => {
          if (seg.kind === 'step-start') {
            return <StepStartPart key={`step-${i}`} stepIndex={seg.stepIndex} />;
          }

          if (seg.kind === 'tool-group') {
            // Single tool → individual card; multiple tools → grouped TaskBlock
            if (seg.tools.length === 1) {
              const t = seg.tools[0];
              return (
                <ToolInvocationPart
                  key={t.toolCallId}
                  toolName={t.toolName}
                  toolCallId={t.toolCallId}
                  state={t.state as ToolInvocationPartProps['state']}
                  input={t.input}
                  output={t.output}
                  errorText={t.errorText}
                  title={t.title}
                />
              );
            }
            return <TaskBlock key={seg.segKey} tools={seg.tools} />;
          }

          // 'other': text, reasoning, source-url, data-citations, etc.
          return <MessagePartRenderer key={i} part={seg.part} citations={citations} />;
        })}

        {/* Sources section — shown when the message has resolved citations */}
        <MessageSources citations={citations} />
      </ChatMessageBubble>
    </div>
  );
}

export { messageVariants, bubbleVariants, avatarVariants };
