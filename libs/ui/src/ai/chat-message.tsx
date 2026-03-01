/**
 * ChatMessage — Role-based message bubble with avatar and rich part rendering.
 *
 * Composable: ChatMessage wraps ChatMessageAvatar + ChatMessageBubble.
 * Uses CVA variants for user/assistant/system styling.
 *
 * Renders all UIMessagePart types: text (markdown), reasoning (collapsible),
 * tool calls (collapsible card), sources, and step boundaries.
 *
 * Citation support:
 *  - Extracts data-citations parts from the message (written by the server's
 *    citation extraction step) and passes them to ChatMessageMarkdown.
 *  - Renders a MessageSources section below the bubble when citations are present.
 */

import { cva, type VariantProps } from 'class-variance-authority';
import { Bot, User } from 'lucide-react';
import type { UIMessage } from 'ai';
import { cn } from '../lib/utils.js';
import { ChainOfThought } from './chain-of-thought.js';
import { ToolInvocationPart, type ToolInvocationPartProps } from './tool-invocation-part.js';
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
 * Render a single message part based on its type.
 */
function MessagePartRenderer({
  part,
  index,
  stepIndex,
  citations,
}: {
  part: Record<string, unknown>;
  index: number;
  stepIndex?: number;
  citations: Citation[];
}) {
  const type = part.type as string;

  if (type === 'step-start') {
    return <StepStartPart stepIndex={stepIndex} />;
  }

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

  if (isToolPart(part)) {
    return (
      <ToolInvocationPart
        toolName={getToolName(part)}
        toolCallId={(part.toolCallId as string) ?? `tool-${index}`}
        state={((part.state as string) ?? 'input-available') as ToolInvocationPartProps['state']}
        input={part.input}
        output={part.output}
        errorText={part.errorText as string | undefined}
        title={part.title as string | undefined}
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

  // data-citations parts are consumed by the parent ChatMessage and not rendered here
  if (type === 'data-citations') {
    return null;
  }

  // source-document, file, data-* — render nothing
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

  // Track step-start parts to provide ordinal labels
  let stepCounter = -1;

  return (
    <div data-slot="chat-message" className={cn(messageVariants({ role }), className)}>
      <ChatMessageAvatar role={role} />
      <ChatMessageBubble role={role}>
        {rawParts.map((part, i) => {
          if (part.type === 'step-start') stepCounter += 1;
          return (
            <MessagePartRenderer
              key={i}
              part={part}
              index={i}
              stepIndex={part.type === 'step-start' ? stepCounter : undefined}
              citations={citations}
            />
          );
        })}

        {/* Sources section — shown when the message has resolved citations */}
        <MessageSources citations={citations} />
      </ChatMessageBubble>
    </div>
  );
}

export { messageVariants, bubbleVariants, avatarVariants };
