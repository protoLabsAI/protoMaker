import { useState, useCallback, useRef } from 'react';
import { Plus, Trash2, FileText } from 'lucide-react';
import { Button } from '@protolabs-ai/ui/atoms';
import { Spinner } from '@protolabs-ai/ui/atoms';
import { cn } from '@/lib/utils';
import { useProjectDocs } from '../hooks/use-project-docs';
import { toast } from 'sonner';

interface DocEntry {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  wordCount?: number;
}

export function DocumentsTab({ projectSlug }: { projectSlug: string }) {
  const { docsQuery, createDoc, updateDoc, deleteDoc } = useProjectDocs(projectSlug);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const docsData = docsQuery.data as
    | {
        success: boolean;
        data?: { version: number; docOrder: string[]; docs: Record<string, DocEntry> };
      }
    | undefined;
  const docs = docsData?.data?.docs ?? {};
  const docOrder = docsData?.data?.docOrder ?? [];
  const orderedDocs = docOrder.map((id) => docs[id]).filter(Boolean);

  const selectedDoc = selectedDocId ? docs[selectedDocId] : null;

  const handleCreate = useCallback(() => {
    createDoc.mutate(
      { title: 'Untitled Document' },
      {
        onSuccess: (res: unknown) => {
          const result = res as { success: boolean; data?: { doc: DocEntry } };
          if (result.data?.doc) {
            setSelectedDocId(result.data.doc.id);
            setEditTitle(result.data.doc.title);
            setEditContent('');
          }
        },
      }
    );
  }, [createDoc]);

  const handleSelect = useCallback((doc: DocEntry) => {
    setSelectedDocId(doc.id);
    setEditTitle(doc.title);
    setEditContent(doc.content);
  }, []);

  const handleDelete = useCallback(
    (docId: string) => {
      deleteDoc.mutate(docId, {
        onSuccess: () => {
          if (selectedDocId === docId) {
            setSelectedDocId(null);
          }
          toast.success('Document deleted');
        },
      });
    },
    [deleteDoc, selectedDocId]
  );

  const handleContentChange = useCallback(
    (content: string) => {
      setEditContent(content);
      if (!selectedDocId) return;

      // Debounced auto-save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        updateDoc.mutate({ docId: selectedDocId, content });
      }, 1000);
    },
    [selectedDocId, updateDoc]
  );

  const handleTitleChange = useCallback(
    (title: string) => {
      setEditTitle(title);
      if (!selectedDocId) return;
      updateDoc.mutate({ docId: selectedDocId, title });
    },
    [selectedDocId, updateDoc]
  );

  if (docsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="w-5 h-5" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[400px] py-4 gap-3">
      {/* Document sidebar */}
      <div className="w-48 shrink-0 border border-border/30 rounded-lg overflow-hidden flex flex-col">
        <div className="px-2 py-2 border-b border-border/20 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
            Documents
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={handleCreate}
            disabled={createDoc.isPending}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {orderedDocs.length === 0 ? (
            <div className="px-2 py-4 text-center">
              <FileText className="w-6 h-6 text-muted-foreground/30 mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground">No documents</p>
            </div>
          ) : (
            orderedDocs.map((doc) => (
              <div
                key={doc.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelect(doc)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect(doc);
                  }
                }}
                className={cn(
                  'w-full text-left px-2 py-1.5 text-xs hover:bg-muted/30 transition-colors flex items-center gap-1.5 group cursor-pointer',
                  selectedDocId === doc.id && 'bg-muted/40'
                )}
              >
                <FileText className="w-3 h-3 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{doc.title}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(doc.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-opacity"
                  aria-label={`Delete ${doc.title}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 border border-border/30 rounded-lg overflow-hidden flex flex-col">
        {selectedDoc ? (
          <>
            <div className="px-3 py-2 border-b border-border/20">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="w-full text-sm font-medium bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/50"
                placeholder="Document title..."
              />
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <textarea
                value={editContent}
                onChange={(e) => handleContentChange(e.target.value)}
                className="w-full h-full text-sm bg-transparent border-none outline-none resize-none text-foreground/90 placeholder:text-muted-foreground/40"
                placeholder="Start writing..."
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Select a document or create a new one.</p>
          </div>
        )}
      </div>
    </div>
  );
}
