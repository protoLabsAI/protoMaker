import { useEffect, useState, useRef, useCallback } from 'react';
import { Loader2, FileText, Pencil, Eye } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Editor } from '@tiptap/react';
import { Button } from '@protolabsai/ui/atoms';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { DocsEditor } from './docs-editor';
import { DocsToolbar } from './docs-toolbar';
import { getApiKey, getSessionToken } from '@/lib/http-api-client';

function getAuthHeaders(): Record<string, string> {
  const apiKey = getApiKey();
  if (apiKey) return { 'X-API-Key': apiKey };
  const sessionToken = getSessionToken();
  return sessionToken ? { 'X-Session-Token': sessionToken } : {};
}

interface DocsContentPanelProps {
  projectPath: string;
  selectedPath: string | null;
}

export function DocsContentPanel({ projectPath, selectedPath }: DocsContentPanelProps) {
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);

  // Track pending changes for auto-save
  const pendingContentRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const currentPathRef = useRef<string | null>(null);

  // Flush pending save
  const flushSave = useCallback(async () => {
    if (!pendingContentRef.current || !currentPathRef.current) return;
    const toSave = pendingContentRef.current;
    const pathToSave = currentPathRef.current;
    pendingContentRef.current = null;

    setIsSaving(true);
    try {
      const response = await fetch('/api/docs/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ projectPath, path: pathToSave, content: toSave }),
      });
      if (!response.ok) throw new Error('Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [projectPath]);

  // Schedule debounced save
  const scheduleSave = useCallback(
    (markdown: string) => {
      pendingContentRef.current = markdown;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => flushSave(), 1000);
    },
    [flushSave]
  );

  // Flush on unmount or path change
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      flushSave();
    };
  }, [flushSave]);

  // Load file content
  useEffect(() => {
    if (!selectedPath) {
      setContent(null);
      setError(null);
      setIsEditing(false);
      return;
    }

    // Flush any pending save from previous file before loading new one
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (pendingContentRef.current && currentPathRef.current) {
      flushSave();
    }

    currentPathRef.current = selectedPath;
    let cancelled = false;

    async function fetchDoc() {
      setIsLoading(true);
      setError(null);
      setIsEditing(false);
      try {
        const params = new URLSearchParams({ projectPath, path: selectedPath! });
        const response = await fetch(`/api/docs/file?${params}`, {
          headers: getAuthHeaders(),
          credentials: 'include',
        });
        if (!response.ok) throw new Error(`Failed to fetch doc: ${response.status}`);
        const data = await response.json();
        if (!cancelled) {
          setContent(data.content);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load document');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchDoc();
    return () => {
      cancelled = true;
    };
  }, [projectPath, selectedPath, flushSave]);

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

  if (content === null) return null;

  return (
    <div className="flex h-full flex-col">
      {/* Mode toggle bar */}
      <div className="flex items-center justify-between border-b border-border px-3 py-1">
        <span className="truncate text-xs text-muted-foreground">{selectedPath}</span>
        <div className="flex items-center gap-1">
          {isSaving && <span className="text-[10px] text-muted-foreground">Saving...</span>}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('size-7', !isEditing && 'text-primary')}
                  onClick={() => {
                    if (isEditing) flushSave();
                    setIsEditing(false);
                  }}
                >
                  <Eye className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Read</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn('size-7', isEditing && 'text-primary')}
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Edit</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {isEditing ? (
        <>
          <DocsToolbar editor={editor} />
          <DocsEditor
            content={content}
            onUpdate={(md) => {
              setContent(md);
              scheduleSave(md);
            }}
            onEditorReady={setEditor}
          />
        </>
      ) : (
        <div className="h-full overflow-y-auto p-6">
          <div className="markdown-body max-w-none">
            <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
          </div>
        </div>
      )}
    </div>
  );
}
