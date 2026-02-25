import { useEffect, useState } from 'react';
import { Loader2, FileText } from 'lucide-react';
import Markdown from 'react-markdown';

interface DocContent {
  path: string;
  title: string;
  content: string;
}

interface DocsContentPanelProps {
  selectedPath: string | null;
}

export function DocsContentPanel({ selectedPath }: DocsContentPanelProps) {
  const [doc, setDoc] = useState<DocContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPath) {
      setDoc(null);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchDoc() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/docs/file?path=${encodeURIComponent(selectedPath!)}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch doc: ${response.status}`);
        }
        const data = await response.json();
        if (!cancelled) {
          setDoc({ path: data.path, title: data.title, content: data.content });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load document');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchDoc();
    return () => {
      cancelled = true;
    };
  }, [selectedPath]);

  if (!selectedPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <FileText className="size-8 opacity-30" />
        <p className="text-sm">Select a file to view its contents</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-sm text-destructive">Failed to load document</p>
        <p className="text-xs text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!doc) {
    return null;
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="prose prose-sm prose-invert max-w-none prose-p:text-foreground/90 prose-headings:text-foreground prose-li:text-foreground/90 prose-strong:text-foreground prose-code:text-violet-300 prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-muted/30 prose-pre:border prose-pre:border-border/20 prose-table:text-foreground/90 prose-th:text-foreground prose-td:border-border/20 prose-th:border-border/20">
        <Markdown>{doc.content}</Markdown>
      </div>
    </div>
  );
}
