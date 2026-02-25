import { useEffect, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocFile {
  path: string;
  title: string;
  slug: string;
}

interface DocsFileTreeProps {
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

/**
 * Infer a section label from the file's slug.
 * Looks for common prefixes like "brand-", "process-", etc.
 * Falls back to "General" for ungrouped files.
 */
function inferSection(slug: string): string {
  const prefixes: Record<string, string> = {
    brand: 'Brand',
    process: 'Process',
    workflow: 'Workflow',
    guide: 'Guides',
    guidelines: 'Guidelines',
    architecture: 'Architecture',
    setup: 'Setup',
    api: 'API',
    spec: 'Specs',
    dev: 'Development',
    development: 'Development',
    test: 'Testing',
    deploy: 'Deployment',
  };

  for (const [prefix, section] of Object.entries(prefixes)) {
    if (slug.startsWith(prefix + '-') || slug === prefix) {
      return section;
    }
  }

  return 'General';
}

export function DocsFileTree({ selectedPath, onSelect }: DocsFileTreeProps) {
  const [docs, setDocs] = useState<DocFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchDocs() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/docs/list');
        if (!response.ok) {
          throw new Error(`Failed to fetch docs list: ${response.status}`);
        }
        const data = await response.json();
        if (!cancelled) {
          setDocs(data.docs ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load docs');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchDocs();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 text-xs text-destructive">
        <p>Failed to load docs</p>
        <p className="mt-1 text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xs text-muted-foreground">No docs found</p>
      </div>
    );
  }

  // Group docs by inferred section
  const sections: Record<string, DocFile[]> = {};
  for (const doc of docs) {
    const section = inferSection(doc.slug);
    if (!sections[section]) {
      sections[section] = [];
    }
    sections[section].push(doc);
  }

  const sectionNames = Object.keys(sections).sort();

  return (
    <div className="flex flex-col gap-4 p-3">
      {sectionNames.map((section) => (
        <div key={section}>
          <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {section}
          </div>
          <div className="flex flex-col gap-0.5">
            {sections[section].map((doc) => (
              <button
                key={doc.path}
                onClick={() => onSelect(doc.path)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                  selectedPath === doc.path
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <FileText
                  className={cn(
                    'size-3 shrink-0',
                    selectedPath === doc.path ? 'text-primary' : 'text-muted-foreground'
                  )}
                />
                <span className="truncate">{doc.title}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
