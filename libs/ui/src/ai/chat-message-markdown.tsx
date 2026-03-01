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
 */

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '../lib/utils.js';
import { CodeBlock } from './code-block.js';

export interface ChatMessageMarkdownProps {
  content: string;
  className?: string;
}

export function ChatMessageMarkdown({ content, className }: ChatMessageMarkdownProps) {
  // Stable plugin arrays — defined outside the render to prevent rehype/remark
  // from re-instantiating plugins on every keystroke during streaming.
  const remarkPlugins = useMemo(() => [remarkGfm], []);
  const rehypePlugins = useMemo(() => [rehypeRaw, rehypeSanitize], []);

  return (
    <div
      data-slot="chat-message-markdown"
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none',
        // Tighten default prose spacing to match chat density
        'prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5',
        'prose-headings:mb-2 prose-headings:mt-3',
        // Tables
        'prose-table:w-full prose-table:border-collapse prose-td:border prose-td:border-border/40 prose-td:px-2 prose-td:py-1 prose-th:border prose-th:border-border/40 prose-th:px-2 prose-th:py-1 prose-th:bg-muted/40',
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

          // ── Strikethrough (del) — remark-gfm adds this ───────────────────
          del: ({ children }) => <del className="opacity-60 line-through">{children}</del>,
        }}
      >
        {content}
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
