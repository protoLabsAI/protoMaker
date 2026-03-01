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
}

// ── Citation preprocessing ────────────────────────────────────────────────────

/** Matches [[feature:id]] and [[doc:path]] citation markers */
const CITATION_PATTERN = /\[\[(feature|doc):([^\]]+)\]\]/g;

/**
 * Replace [[type:id]] markers in content with sanitizer-safe <span> elements
 * that carry the citation metadata as data attributes.  Returns the transformed
 * content string and a stable index map so repeated occurrences of the same
 * citation get the same badge number.
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
    // Encode as HTML span — rehype-raw passes this through; rehype-sanitize
    // allows it because of the extended schema below.
    return `<span class="citation" data-citation-type="${type}" data-citation-id="${id}" data-citation-index="${idx}"></span>`;
  });
}

// ── Rehype-sanitize schema extension ─────────────────────────────────────────

/**
 * Extends the default sanitize schema to allow:
 * - class="citation" on <span> (the only class we inject)
 * - data-citation-* attributes on <span> (type, id, index)
 *
 * All other tags retain their default sanitization rules.
 */
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [
      // Keep any existing span attribute rules from the default schema
      ...((defaultSchema.attributes as Record<string, unknown[]> | undefined)?.['span'] ?? []),
      // Allow class="citation" only
      ['className', 'citation'],
      // Allow all data-citation-* attributes
      'data*',
    ],
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ChatMessageMarkdown({ content, className, citations }: ChatMessageMarkdownProps) {
  // Stable plugin arrays — defined outside the render to prevent rehype/remark
  // from re-instantiating plugins on every keystroke during streaming.
  const remarkPlugins = useMemo(() => [remarkGfm], []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rehypePlugins = useMemo(() => [rehypeRaw, [rehypeSanitize, sanitizeSchema]] as any[], []);

  // Pre-process citation markers into span elements before feeding to ReactMarkdown.
  const processedContent = useMemo(() => preprocessCitations(content), [content]);

  return (
    <div
      data-slot="chat-message-markdown"
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none',
        // Tighten default prose spacing to match chat density
        'prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5',
        'prose-headings:mb-2 prose-headings:mt-3',
        // Table prose overrides removed — handled by component overrides below
        // Task lists — remove default bullet so the checkbox aligns cleanly
        '[&_li:has(>input[type=checkbox])]:list-none [&_li:has(>input[type=checkbox])]:pl-0',
        '[&_input[type=checkbox]]:mr-1.5 [&_input[type=checkbox]]:accent-primary',
        className
      )}
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
          // react-markdown wraps fenced code in <pre><code className="language-X">
          // We intercept the <pre> to render our CodeBlock instead.
          pre: ({ children }) => {
            // Extract the <code> element inside the <pre>
            const codeEl = children as React.ReactElement<{
              className?: string;
              children?: React.ReactNode;
            }> | null;

            if (codeEl && typeof codeEl === 'object' && 'props' in codeEl) {
              const codeProps = codeEl.props;
              const langMatch = codeProps.className?.match(/language-(\w+)/);
              const language = langMatch?.[1];
              const code = extractText(codeProps.children);
              return <CodeBlock code={code} language={language} />;
            }

            // Fallback for raw <pre> blocks
            return (
              <pre className="my-2 overflow-x-auto rounded-md bg-background/50 p-3 text-xs">
                {children}
              </pre>
            );
          },

          // Inline code — styled differently from block code
          code: ({ className: codeClassName, children: codeChildren, ...props }) => {
            // Fenced code blocks are handled above via <pre>; this handles
            // inline `` `code` `` only (no className / not inside a <pre>).
            const isBlock = Boolean(codeClassName?.startsWith('language-'));
            if (isBlock) {
              // Should not reach here as <pre> handles blocks, but be safe
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

          // ── Tables — explicit styling since prose-table variants may not apply ─
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

          // ── Strikethrough (del) — remark-gfm adds this ───────────────────
          del: ({ children }) => <del className="opacity-60 line-through">{children}</del>,

          // ── Citation spans ─────────────────────────────────────────────────
          // Intercept <span class="citation"> injected by preprocessCitations
          // and render the InlineCitation badge component.
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

/**
 * Recursively extract plain-text from a React node tree.
 * Used to pull the raw code string out of react-markdown's <code> children.
 */
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
