/**
 * ChainOfThought — Step-by-step reasoning display for AI extended thinking.
 *
 * Parses reasoning text into logical steps (detected by newlines or numbered
 * lists). Each step shows a spinner while streaming and a check icon when the
 * next step starts. Defaults to collapsed — user opens to inspect. Shows a
 * "Thought for Xs" (or ms when under 1s) summary when reasoning completes.
 * Duration tracks from first render (reasoning start) to when state transitions
 * to "done" (first text token).
 */

import { useState, useEffect, useRef } from 'react';
import { Brain, ChevronDown, Loader2, Check } from 'lucide-react';
import { cn } from '../lib/utils.js';

export interface ChainOfThoughtProps {
  text: string;
  state?: 'streaming' | 'done';
  className?: string;
}

/**
 * Format a duration in milliseconds to a human-readable string.
 * e.g. 500 → "500ms", 1500 → "1.5s", 65000 → "1m 5s"
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = Math.round(ms / 100) / 10;
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * Parse reasoning text into an array of logical steps.
 *
 * Priority:
 * 1. Numbered list items ("1. Step one\n2. Step two")
 * 2. Double-newline-separated paragraphs
 * 3. Single-newline-separated lines (fallback)
 */
function parseSteps(text: string): string[] {
  if (!text.trim()) return [];

  // Check for numbered list format (e.g. "1. First\n2. Second")
  if (/^\d+\.\s+/m.test(text)) {
    const steps = text
      .split(/\n(?=\d+\.\s+)/)
      .map((s) => s.replace(/^\d+\.\s+/, '').trim())
      .filter(Boolean);
    if (steps.length > 0) return steps;
  }

  // Paragraph-separated steps
  const paragraphs = text
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (paragraphs.length > 1) return paragraphs;

  // Line-by-line fallback
  return text
    .split(/\n/)
    .map((s) => s.replace(/^\d+\.\s+/, '').trim())
    .filter(Boolean);
}

export function ChainOfThought({ text, state, className }: ChainOfThoughtProps) {
  // Record when this component first mounts — that is the reasoning start time.
  const startTimeRef = useRef<number>(Date.now());
  const [durationMs, setDurationMs] = useState<number | undefined>();
  const [isOpen, setIsOpen] = useState(false);

  const isStreaming = state === 'streaming';

  // Record duration when streaming finishes. Stay collapsed throughout.
  useEffect(() => {
    if (state === 'done' && durationMs === undefined) {
      setDurationMs(Date.now() - startTimeRef.current);
    }
  }, [state, durationMs]);

  const steps = parseSteps(text);

  const summaryText =
    state === 'done' && durationMs !== undefined
      ? `Thought for ${formatDuration(durationMs)}`
      : isStreaming
        ? 'Thinking...'
        : 'Reasoning';

  return (
    <div
      data-slot="chain-of-thought"
      className={cn('my-1 rounded-md border border-border/50 bg-muted/30 text-xs', className)}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <Brain
          className={cn(
            'size-3.5 shrink-0 text-muted-foreground',
            isStreaming && 'animate-pulse text-primary'
          )}
        />
        <span className="flex-1 truncate text-muted-foreground">{summaryText}</span>
        <ChevronDown
          className={cn(
            'size-3 shrink-0 text-muted-foreground transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <div className="space-y-1.5 border-t border-border/50 px-2.5 py-2">
          {steps.length === 0 && isStreaming ? (
            /* Nothing parsed yet — show a generic "processing" row */
            <div className="flex items-center gap-2 py-0.5">
              <Loader2 className="size-3 shrink-0 animate-spin text-primary" />
              <span className="italic text-muted-foreground">Processing…</span>
            </div>
          ) : (
            steps.map((step, i) => {
              const isCurrentStep = isStreaming && i === steps.length - 1;
              return (
                <div key={i} className="flex items-start gap-2 py-0.5">
                  {isCurrentStep ? (
                    <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin text-primary" />
                  ) : (
                    <Check className="mt-0.5 size-3 shrink-0 text-green-500" />
                  )}
                  <span
                    className={cn(
                      'leading-relaxed',
                      isCurrentStep ? 'text-foreground/90' : 'text-foreground/70'
                    )}
                  >
                    {step}
                  </span>
                </div>
              );
            })
          )}
          {isStreaming && steps.length > 0 && (
            <span className="inline-block animate-pulse text-muted-foreground">|</span>
          )}
        </div>
      )}
    </div>
  );
}
