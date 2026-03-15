/**
 * ChatMessageMarkdown — Streaming-safe markdown renderer with GFM support.
 *
 * Renders markdown via react-markdown + remark-gfm (tables, task lists,
 * strikethrough, auto-links) and rehype-raw for inline HTML.
 *
 * Streaming safety:
 *  - react-markdown tolerates partial/incomplete input without throwing.
 *  - We stabilise the component tree with `useMemo` to avoid unnecessary
 *    re-mounts that would cause content flash during streaming.
 *
 * Citation support:
 *  - [[feature:id]] and [[doc:path]] markers in content are replaced with
 *    inline <span class="citation"> elements before passing to react-markdown.
 *  - A custom rehype-sanitize schema allows data-citation-* attributes on spans.
 *  - The custom `span` component handler detects these spans and renders
 *    InlineCitation badges using the resolved citations array.
 */

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { cn } from '../lib/utils.js';
import { CodeBlock } from './code-block.js';
import { InlineCitation, type Citation } from './inline-citation.js';

export interface ChatMessageMarkdownProps {
  content: string;
  className?: string;
  /** Server-resolved citations keyed by type:id, used to populate badge popovers */
  citations?: Citation[];
  /** When true, shows the blinking streaming cursor. */
  isStreaming?: boolean;
}

// ── Citation preprocessing ────────────────────────────────────────────────────

/** Matches [[feature:id]] and [[doc:path]] citation markers */
const CITATION_PATTERN = /\[\[(feature|doc):([^\]]+)\]\]/g;

/**
 * Replace [[type:id]] markers in content with sanitizer-safe <span> elements
 * that carry the citation metadata as data attributes.
 */
function preprocessCitations(content: string): string {
  const seen = new Map<string, number>();
  let counter = 0;

  return content.replace(CITATION_PATTERN, (_match, type: string, id: string) => {
    const key = `${type}:${id}`;
    if (!seen.has(key)) {
      seen.set(key, counter++);
    }
    const idx = seen.get(key)!;
    return `<span class="citation" data-citation-type="${type}" data-citation-id="${id}" data-citation-index="${idx}"></span>`;
  });
}

// ── Rehype-sanitize schema extension ─────────────────────────────────────────

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [
      ...((defaultSchema.attributes as Record<string, unknown[]> | undefined)?.['span'] ?? []),
      ['className', 'citation'],
      'data*',
    ],
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

const PROSE_CLASSES = [
  'prose prose-sm dark:prose-invert max-w-none',
  'prose-p:mt-0 prose-p:mb-4 prose-p:leading-relaxed',
  'prose-h1:text-base prose-h1:font-semibold prose-h1:mt-6 prose-h1:mb-3',
  'prose-h2:text-sm prose-h2:font-semibold prose-h2:mt-5 prose-h2:mb-2',
  'prose-h3:text-sm prose-h3:font-medium prose-h3:mt-5 prose-h3:mb-2',
  'prose-h4:text-xs prose-h4:font-medium prose-h4:uppercase prose-h4:tracking-wide prose-h4:text-muted-foreground prose-h4:mt-4 prose-h4:mb-2',
  'prose-ul:my-3 prose-ol:my-3 prose-ul:pl-5 prose-ol:pl-5',
  'prose-li:my-1.5 prose-li:leading-relaxed',
  '[&_li_ul]:my-0.5 [&_li_ol]:my-0.5 [&_li_li]:my-0.5',
  'prose-blockquote:border-l-2 prose-blockquote:border-primary/30',
  'prose-blockquote:pl-3 prose-blockquote:py-0.5 prose-blockquote:my-2',
  'prose-blockquote:not-italic prose-blockquote:text-muted-foreground',
  'prose-hr:my-4 prose-hr:border-border/40',
  '[&_li:has(>input[type=checkbox])]:list-none [&_li:has(>input[type=checkbox])]:pl-0',
  '[&_input[type=checkbox]]:mr-1.5 [&_input[type=checkbox]]:accent-primary',
] as const;

export function ChatMessageMarkdown({
  content,
  className,
  citations,
  isStreaming,
}: ChatMessageMarkdownProps) {
  const remarkPlugins = useMemo(() => [remarkGfm], []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rehypePlugins = useMemo(() => [rehypeRaw, [rehypeSanitize, sanitizeSchema]] as any[], []);

  const processedContent = useMemo(() => preprocessCitations(content), [content]);

  return (
    <div
      data-slot="chat-message-markdown"
      className={cn(...PROSE_CLASSES, isStreaming && 'streaming-cursor', className)}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          // ── Links ──────────────────────────────────────────────────────────
          a: ({ ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            />
          ),

          // ── Code blocks ────────────────────────────────────────────────────
          pre: ({ children }) => {
            const codeEl = children as React.ReactElement<{
              className?: string;
              children?: React.ReactNode;
            }> | null;

            if (codeEl && typeof codeEl === 'object' && 'props' in codeEl) {
              const codeProps = codeEl.props;
              const langMatch = codeProps.className?.match(/language-(\w+)/);
              const language = langMatch?.[1];
              const code = extractText(codeProps.children);
              return <CodeBlock code={code} language={language} isStreaming={isStreaming} />;
            }

            return (
              <pre className="my-2 overflow-x-auto rounded-md bg-background/50 p-3 text-xs">
                {children}
              </pre>
            );
          },

          // Inline code
          code: ({ className: codeClassName, children: codeChildren, ...props }) => {
            const isBlock = Boolean(codeClassName?.startsWith('language-'));
            if (isBlock) {
              return (
                <code {...props} className={codeClassName}>
                  {codeChildren}
                </code>
              );
            }
            return (
              <code {...props} className="rounded bg-background/50 px-1 py-0.5 font-mono text-xs">
                {codeChildren}
              </code>
            );
          },

          // ── Tables ─────────────────────────────────────────────────────────
          table: ({ children }) => (
            <table className="my-2 w-full border-collapse text-xs">{children}</table>
          ),
          thead: ({ children }) => <thead className="border-b border-border/60">{children}</thead>,
          th: ({ children }) => (
            <th className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-t border-border/30 px-2 py-1 text-xs">{children}</td>
          ),

          // ── Horizontal rules ──────────────────────────────────────────────
          hr: () => <hr className="my-4 border-border/40" />,

          // ── Strikethrough ─────────────────────────────────────────────────
          del: ({ children }) => <del className="opacity-60 line-through">{children}</del>,

          // ── Citation spans ─────────────────────────────────────────────────
          span: ({ className: spanClass, ...props }) => {
            if (spanClass === 'citation') {
              const attrs = props as Record<string, string | undefined>;
              const citationType = attrs['data-citation-type'] ?? '';
              const citationId = attrs['data-citation-id'] ?? '';
              const citationIndex = parseInt(attrs['data-citation-index'] ?? '0', 10);

              const resolved = citations?.find(
                (c) => c.id === citationId && c.type === citationType
              );

              return (
                <InlineCitation
                  index={citationIndex + 1}
                  type={citationType}
                  id={citationId}
                  citation={resolved}
                />
              );
            }
            return <span className={spanClass} {...props} />;
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && typeof node === 'object' && 'props' in (node as object)) {
    const el = node as React.ReactElement<{ children?: React.ReactNode }>;
    return extractText(el.props.children);
  }
  return '';
}
