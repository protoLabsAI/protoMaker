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
import { Bot, User } from 'lucide-react';
import type { UIMessage } from 'ai';
import { cn } from '../lib/utils.js';
import { ChainOfThought } from './chain-of-thought.js';
import { ToolInvocationPart, type ToolInvocationPartProps } from './tool-invocation-part.js';
import { TaskBlock, type ToolInvocationItem, type TaskToolState } from './task-block.js';
import { ChatMessageMarkdown } from './chat-message-markdown.js';
import { MessageSources } from './message-sources.js';
import type { Citation } from './inline-citation.js';
import { MessageActions } from './message-actions.js';
import { MessageBranches } from './message-branches.js';
import { PlanPart, extractPlanData, type PlanData } from './plan-part.js';

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

const bubbleVariants = cva('rounded-lg px-4 py-3 text-sm max-w-[85%] overflow-hidden', {
  variants: {
    role: {
      user: 'bg-primary text-primary-foreground ml-auto',
      assistant: 'bg-muted text-foreground mr-auto w-full',
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
        const rawState = (p.state as string) ?? 'input-available';
        const approval = p.approval as
          | { id: string; approved?: boolean; reason?: string }
          | undefined;
        tools.push({
          toolName: getToolName(p),
          toolCallId: (p.toolCallId as string) ?? `tool-${i}`,
          state: rawState as TaskToolState,
          input: p.input,
          output: p.output,
          errorText: p.errorText as string | undefined,
          title: p.title as string | undefined,
          approvalId: approval?.id,
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
 * Extract a plan from message parts.
 * The server writes these as `data-plan` UIMessageChunks; the AI SDK
 * surfaces them in the message's parts array as `{ type: 'data-plan', data: PlanData }`.
 * Returns the first plan found, or null if none.
 */
function extractPlan(parts: Array<Record<string, unknown>>): PlanData | null {
  for (const part of parts) {
    if (part.type === 'data-plan') {
      const plan = extractPlanData(part.data);
      if (plan) return plan;
    }
  }
  return null;
}

/**
 * Extract plain text from a group's 'other' segments (text parts only).
 * Used for the copy-to-clipboard action in MessageActions.
 */
function extractGroupText(group: PartSegment[]): string {
  return group
    .filter(
      (seg): seg is { kind: 'other'; part: Record<string, unknown>; partIndex: number } =>
        seg.kind === 'other' && seg.part.type === 'text'
    )
    .map((seg) => seg.part.text as string)
    .join('');
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

  // data-plan — render the plan card inline where it appears in the message.
  if (type === 'data-plan') {
    const plan = extractPlanData(part.data);
    if (!plan) return null;
    return <PlanPart plan={plan} />;
  }

  // data-citations are consumed by extractCitations() — not rendered inline.
  // source-document, file, other data-* — render nothing.
  return null;
}

/**
 * Split segments into step groups — each group becomes its own visual bubble.
 * Segments before the first step-start go into group 0.
 * Each step-start marker opens a new group.
 */
function groupByStep(segments: PartSegment[]): PartSegment[][] {
  const groups: PartSegment[][] = [[]];
  for (const seg of segments) {
    if (seg.kind === 'step-start') {
      // Start a new group (drop the step-start marker — separation IS the bubble gap)
      groups.push([]);
    } else {
      groups[groups.length - 1].push(seg);
    }
  }
  // Remove empty groups (e.g. trailing step-start with no content after it)
  return groups.filter((g) => g.length > 0);
}

export function ChatMessage({
  message,
  className,
  onToolApprove,
  onToolReject,
  onRegenerate,
  onThumbsUp,
  onThumbsDown,
  branchIndex,
  branchCount,
  onPreviousBranch,
  onNextBranch,
  getToolProgressLabel,
}: {
  message: UIMessage;
  className?: string;
  /** Called when the user approves a destructive tool call (HITL). Receives the approval ID. */
  onToolApprove?: (approvalId: string) => void;
  /** Called when the user rejects a destructive tool call (HITL). Receives the approval ID. */
  onToolReject?: (approvalId: string) => void;
  /** Called when the user clicks the Regenerate button on an assistant message. */
  onRegenerate?: () => void;
  /** Called when the user clicks Thumbs Up on an assistant message. */
  onThumbsUp?: () => void;
  /** Called when the user clicks Thumbs Down on an assistant message. */
  onThumbsDown?: () => void;
  /** Zero-based index of the currently shown branch variant (for assistant messages). */
  branchIndex?: number;
  /** Total number of branch variants. When > 1, MessageBranches nav renders. */
  branchCount?: number;
  /** Called when the user clicks the Previous branch chevron. */
  onPreviousBranch?: () => void;
  /** Called when the user clicks the Next branch chevron. */
  onNextBranch?: () => void;
  /** Returns a live progress label for a running tool, keyed by toolCallId. */
  getToolProgressLabel?: (toolCallId: string) => string | undefined;
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
      p.type === 'source-url' ||
      p.type === 'data-plan'
  );
  if (!hasContent) return null;

  // Extract server-resolved citations from data-citations parts
  const citations = extractCitations(rawParts);

  // Build grouped segments and split at step boundaries into separate bubbles
  const segments = buildSegments(rawParts);
  const stepGroups = groupByStep(segments);

  // Build onFeedback handler from separate thumbs up/down callbacks
  const onFeedback =
    onThumbsUp || onThumbsDown
      ? (rating: 'up' | 'down') => {
          if (rating === 'up') onThumbsUp?.();
          else onThumbsDown?.();
        }
      : undefined;

  return (
    <div data-slot="chat-message" className={cn('flex flex-col gap-1', className)}>
      {stepGroups.map((group, groupIdx) => {
        const bubbleText = extractGroupText(group);
        return (
          <div key={groupIdx} className={cn(messageVariants({ role }))}>
            {/* Avatar only on first bubble; spacer div on subsequent for alignment */}
            {groupIdx === 0 ? (
              <ChatMessageAvatar role={role} />
            ) : (
              <div className="size-7 shrink-0" aria-hidden />
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <ChatMessageBubble role={role}>
                {group.map((seg, i) => {
                  // step-start segments are filtered out by groupByStep
                  if (seg.kind === 'step-start') return null;

                  if (seg.kind === 'tool-group') {
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
                          progressLabel={getToolProgressLabel?.(t.toolCallId)}
                          onApprove={
                            onToolApprove && t.approvalId
                              ? () => onToolApprove(t.approvalId!)
                              : undefined
                          }
                          onReject={
                            onToolReject && t.approvalId
                              ? () => onToolReject(t.approvalId!)
                              : undefined
                          }
                        />
                      );
                    }
                    return (
                      <TaskBlock
                        key={seg.segKey}
                        tools={seg.tools}
                        onToolApprove={onToolApprove}
                        onToolReject={onToolReject}
                      />
                    );
                  }

                  // 'other': text, reasoning, source-url, data-citations, etc.
                  return <MessagePartRenderer key={i} part={seg.part} citations={citations} />;
                })}

                {/* Sources section — only on the last bubble */}
                {groupIdx === stepGroups.length - 1 && <MessageSources citations={citations} />}
              </ChatMessageBubble>

              {/* MessageActions + branch navigation — assistant bubbles only */}
              {role === 'assistant' && (
                <div className="mt-0.5 ml-1 flex items-center gap-1">
                  <MessageActions
                    text={bubbleText}
                    onRegenerate={onRegenerate}
                    onFeedback={onFeedback}
                  />
                  {branchCount !== undefined &&
                    branchCount > 1 &&
                    onPreviousBranch &&
                    onNextBranch && (
                      <MessageBranches
                        branchIndex={branchIndex ?? 0}
                        branchCount={branchCount}
                        onPrevious={onPreviousBranch}
                        onNext={onNextBranch}
                      />
                    )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { messageVariants, bubbleVariants, avatarVariants };
