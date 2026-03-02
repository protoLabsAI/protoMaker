/**
 * ArtifactCard — Expandable panel for generated code or file content.
 *
 * Renders:
 * - Filename header with language badge and line count
 * - Collapsible body containing a syntax-highlighted CodeBlock
 *
 * Extracts { filename, language, content } from tool output.
 */

import { useState } from 'react';
import { ChevronDown, FileCode2, Loader2 } from 'lucide-react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { cn } from '../../lib/utils.js';
import { CodeBlock } from '../code-block.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface ArtifactData {
  filename?: string;
  language?: string;
  content?: string;
  [key: string]: unknown;
}

function extractData(output: unknown): ArtifactData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  // Handle wrapped response: { success: true, data: { ... } }
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as ArtifactData;
  }
  return o as ArtifactData;
}

function countLines(content: string): number {
  return content.split('\n').length;
}

export function ArtifactCard({ output, state }: ToolResultRendererProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="artifact-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Generating artifact…</span>
      </div>
    );
  }

  const data = extractData(output);

  if (!data || !data.content) {
    return (
      <div
        data-slot="artifact-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        No artifact content
      </div>
    );
  }

  const filename = data.filename ?? 'untitled';
  const language = data.language ?? '';
  const content = data.content;
  const lineCount = countLines(content);

  return (
    <Collapsible.Root
      data-slot="artifact-card"
      open={isOpen}
      onOpenChange={setIsOpen}
      className="rounded-md border border-border/50 bg-muted/30 text-xs"
    >
      <Collapsible.Trigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
          aria-expanded={isOpen}
        >
          <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />

          {/* Filename */}
          <span className="flex-1 truncate font-mono font-medium text-foreground/80">
            {filename}
          </span>

          {/* Language badge */}
          {language && (
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary/70">
              {language}
            </span>
          )}

          {/* Line count */}
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          </span>

          <ChevronDown
            className={cn(
              'size-3 shrink-0 text-muted-foreground transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </button>
      </Collapsible.Trigger>

      <Collapsible.Content>
        <div className="border-t border-border/50 px-2 pb-2">
          <CodeBlock code={content} language={language || undefined} />
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
