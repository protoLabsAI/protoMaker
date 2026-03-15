/**
 * CodeBlock — Syntax-highlighted code block with language badge and copy button.
 *
 * Uses Prism.js for syntax highlighting. Falls back to plain pre/code if the
 * language is unrecognised or Prism is unavailable.
 */

import { useState, useEffect, useCallback } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../lib/utils.js';

let prismInstance: typeof import('prismjs') | null = null;

async function getPrism(): Promise<typeof import('prismjs') | null> {
  if (prismInstance) return prismInstance;
  try {
    const Prism = (await import('prismjs')).default;
    Prism.manual = true;

    await Promise.allSettled([
      import('prismjs/components/prism-typescript' as string),
      import('prismjs/components/prism-javascript' as string),
      import('prismjs/components/prism-jsx' as string),
      import('prismjs/components/prism-tsx' as string),
      import('prismjs/components/prism-css' as string),
      import('prismjs/components/prism-json' as string),
      import('prismjs/components/prism-bash' as string),
      import('prismjs/components/prism-python' as string),
      import('prismjs/components/prism-rust' as string),
      import('prismjs/components/prism-go' as string),
      import('prismjs/components/prism-sql' as string),
      import('prismjs/components/prism-yaml' as string),
      import('prismjs/components/prism-markdown' as string),
      import('prismjs/components/prism-diff' as string),
    ]);
    prismInstance = Prism;
    return Prism;
  } catch {
    return null;
  }
}

export interface CodeBlockProps {
  /** The raw code string to display */
  code: string;
  /** Language identifier (e.g. "typescript", "python"). Optional. */
  language?: string;
  /** When true, skip syntax highlighting to avoid thrashing during streaming */
  isStreaming?: boolean;
  className?: string;
}

/**
 * Normalise language aliases so Prism finds the right grammar.
 */
function normaliseLang(lang: string): string {
  const aliases: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    py: 'python',
    rb: 'ruby',
    yml: 'yaml',
  };
  return aliases[lang.toLowerCase()] ?? lang.toLowerCase();
}

export function CodeBlock({ code, language, isStreaming, className }: CodeBlockProps) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const lang = language ? normaliseLang(language) : '';

  useEffect(() => {
    if (!lang || isStreaming) {
      setHighlighted(null);
      return;
    }
    let cancelled = false;
    getPrism().then((Prism) => {
      if (cancelled || !Prism) return;
      const grammar = Prism.languages[lang];
      if (!grammar) {
        setHighlighted(null);
        return;
      }
      try {
        setHighlighted(Prism.highlight(code, grammar, lang));
      } catch {
        setHighlighted(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [code, lang, isStreaming]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {
        // Clipboard write failed (permission denied or insecure context)
      }
    );
  }, [code]);

  return (
    <div
      data-slot="code-block"
      className={cn(
        'group/code relative my-2 overflow-hidden rounded-md bg-background/50',
        className
      )}
    >
      {/* Header bar: language + copy button */}
      <div className="flex items-center justify-between border-b border-border/30 bg-muted/40 px-3 py-1">
        <span className="select-none text-[10px] font-medium uppercase tracking-wider text-muted-foreground opacity-70">
          {language ?? 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? 'Copied' : 'Copy code'}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:bg-muted/60 hover:text-foreground group-hover/code:opacity-100"
        >
          {copied ? (
            <>
              <Check className="size-3" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="size-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code area */}
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        {highlighted !== null ? (
          <code
            className={`language-${lang}`}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  );
}
