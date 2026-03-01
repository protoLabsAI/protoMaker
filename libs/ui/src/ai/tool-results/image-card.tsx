/**
 * ImageCard — Displays AI-generated images from tool output.
 *
 * Renders:
 * - Loading skeleton while the image loads
 * - Error fallback if the image fails to load
 * - Image with alt text and optional metadata
 * - Click-to-expand dialog for full-size view
 *
 * Extracts { url, alt, metadata } from tool output.
 */

import { useState } from 'react';
import { ImageIcon, Loader2, AlertTriangle, ZoomIn, X } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ToolResultRendererProps } from '../tool-result-registry.js';

interface ImageMetadata {
  width?: number;
  height?: number;
  format?: string;
  size?: number;
  [key: string]: unknown;
}

interface ImageData {
  url?: string;
  alt?: string;
  metadata?: ImageMetadata;
  [key: string]: unknown;
}

function extractData(output: unknown): ImageData | null {
  if (!output || typeof output !== 'object') return null;
  const o = output as Record<string, unknown>;
  // Handle wrapped response: { success: true, data: { ... } }
  if ('success' in o && 'data' in o && typeof o.data === 'object' && o.data !== null) {
    return o.data as ImageData;
  }
  return o as ImageData;
}

function ImageSkeleton() {
  return (
    <div
      data-slot="image-skeleton"
      className="flex h-40 w-full animate-pulse items-center justify-center rounded-md bg-muted/50"
    >
      <ImageIcon className="size-8 text-muted-foreground/30" />
    </div>
  );
}

function ImageError({ message }: { message?: string }) {
  return (
    <div
      data-slot="image-error"
      className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 text-xs text-destructive"
    >
      <AlertTriangle className="size-5" />
      <span>{message ?? 'Failed to load image'}</span>
    </div>
  );
}

function ExpandedImageDialog({
  url,
  alt,
  onClose,
}: {
  url: string;
  alt: string;
  onClose: () => void;
}) {
  return (
    <div
      data-slot="image-expand-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close expanded image"
          className="absolute -right-3 -top-3 rounded-full bg-background p-1 shadow-md hover:bg-muted"
        >
          <X className="size-4" />
        </button>
        <img src={url} alt={alt} className="max-h-[85vh] max-w-[85vw] rounded-md object-contain" />
      </div>
    </div>
  );
}

export function ImageCard({ output, state }: ToolResultRendererProps) {
  const [imageStatus, setImageStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [isExpanded, setIsExpanded] = useState(false);

  const isLoading =
    state === 'input-streaming' || state === 'input-available' || state === 'approval-responded';

  if (isLoading) {
    return (
      <div
        data-slot="image-card"
        className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        <Loader2 className="size-3.5 animate-spin" />
        <span>Generating image…</span>
      </div>
    );
  }

  const data = extractData(output);

  if (!data || !data.url) {
    return (
      <div
        data-slot="image-card"
        className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      >
        No image available
      </div>
    );
  }

  const url = data.url;
  const alt = data.alt ?? 'AI-generated image';
  const metadata = data.metadata;

  return (
    <>
      <div
        data-slot="image-card"
        className="rounded-md border border-border/50 bg-muted/30 text-xs overflow-hidden"
      >
        {/* Image area */}
        <div className="relative">
          {/* Loading skeleton shown while image loads */}
          {imageStatus === 'loading' && <ImageSkeleton />}

          {/* Error fallback */}
          {imageStatus === 'error' && <ImageError />}

          {/* Actual image */}
          <img
            src={url}
            alt={alt}
            className={cn(
              'w-full rounded-t-md object-contain',
              imageStatus !== 'loaded' && 'hidden'
            )}
            onLoad={() => setImageStatus('loaded')}
            onError={() => setImageStatus('error')}
          />

          {/* Click-to-expand overlay (only when loaded) */}
          {imageStatus === 'loaded' && (
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              aria-label="Expand image"
              className="absolute inset-0 flex items-center justify-center bg-transparent opacity-0 transition-opacity hover:bg-black/20 hover:opacity-100"
            >
              <ZoomIn className="size-6 text-white drop-shadow" />
            </button>
          )}
        </div>

        {/* Footer: alt text and metadata */}
        <div className="px-3 py-2">
          {alt && alt !== 'AI-generated image' && (
            <p className="text-[11px] text-foreground/70 leading-snug">{alt}</p>
          )}
          {metadata && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
              {metadata.width && metadata.height && (
                <span>
                  {metadata.width}×{metadata.height}
                </span>
              )}
              {metadata.format && <span>{metadata.format.toString().toUpperCase()}</span>}
              {metadata.size && <span>{Math.round((metadata.size as number) / 1024)} KB</span>}
            </div>
          )}
        </div>
      </div>

      {/* Expanded view dialog */}
      {isExpanded && (
        <ExpandedImageDialog url={url} alt={alt} onClose={() => setIsExpanded(false)} />
      )}
    </>
  );
}
