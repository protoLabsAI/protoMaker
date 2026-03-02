/**
 * WebPreviewCard — Expandable iframe panel for generated HTML content.
 *
 * Renders:
 * - Collapsible header with title and a globe/link icon
 * - Sandboxed iframe using the srcdoc attribute (no allow-same-origin)
 * - "Open in new tab" button that creates a Blob URL for safe viewing
 *
 * Extracts { html, title } from tool output.
 * Registered for tool name: generate_html
 */

import { useState } from 'react';
import { ChevronDown, Globe, ExternalLink, Loader2 } from 'lucide-react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface WebPreviewData {
  html?: string;
  title?: string;
  [key: string]: unknown;
}

function extractData(output: unknown): WebPreviewData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  // Handle wrapped response: { success: true, data: { ... } }
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as WebPreviewData;
  }
  return o as WebPreviewData;
}

function openInNewTab(html: string): void {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  // Revoke after a short delay to allow the browser to load it
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function WebPreviewCard({ output, state }: ToolResultRendererProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="web-preview-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Generating HTML…</span>
      </div>
    );
  }

  const data = extractData(output);

  if (!data || !data.html) {
    return (
      <div
        data-slot="web-preview-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        No HTML content
      </div>
    );
  }

  const html = data.html;
  const title = data.title ?? 'Web Preview';

  return (
    <Collapsible.Root
      data-slot="web-preview-card"
      open={isOpen}
      onOpenChange={setIsOpen}
      className="rounded-md border border-border/50 bg-muted/30 text-xs"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Collapsible.Trigger asChild>
          <button
            type="button"
            className="flex flex-1 items-center gap-2 text-left"
            aria-expanded={isOpen}
          >
            <Globe className="size-3.5 shrink-0 text-muted-foreground" />

            {/* Title */}
            <span className="flex-1 truncate font-medium text-foreground/80">{title}</span>

            <ChevronDown
              className={cn(
                'size-3 shrink-0 text-muted-foreground transition-transform',
                isOpen && 'rotate-180'
              )}
            />
          </button>
        </Collapsible.Trigger>

        {/* Open in new tab button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openInNewTab(html);
          }}
          aria-label="Open in new tab"
          title="Open in new tab"
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ExternalLink className="size-3.5" />
        </button>
      </div>

      <Collapsible.Content>
        <div className="border-t border-border/50">
          <iframe
            srcDoc={html}
            sandbox="allow-scripts"
            title={title}
            className="h-64 w-full rounded-b-md bg-white"
            data-slot="web-preview-iframe"
          />
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
