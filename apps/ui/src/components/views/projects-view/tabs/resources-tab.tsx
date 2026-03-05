import { useState, useCallback, useRef } from 'react';
import {
  Plus,
  Trash2,
  FileText,
  ExternalLink,
  Link as LinkIcon,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Textarea,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@protolabsai/ui/atoms';
import { Spinner } from '@protolabsai/ui/atoms';
import { cn } from '@/lib/utils';
import { useProjectDocs } from '../hooks/use-project-docs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import { getHttpApiClient } from '@/lib/http-api-client';
import { toast } from 'sonner';
import type { Project, ProjectLink } from '@protolabsai/types';

interface DocEntry {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  wordCount?: number;
}

export function ResourcesTab({ projectSlug, project }: { projectSlug: string; project: Project }) {
  const [docsOpen, setDocsOpen] = useState(true);
  const [linksOpen, setLinksOpen] = useState(true);
  const [showAddLink, setShowAddLink] = useState(false);

  const handleAction = (action: 'doc' | 'link') => {
    if (action === 'doc') {
      setDocsOpen(true);
    } else {
      setLinksOpen(true);
      setShowAddLink(true);
    }
  };

  return (
    <div className="space-y-3 py-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Resources</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 gap-1">
              <Plus className="w-3.5 h-3.5" />
              Add
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleAction('doc')}>
              <FileText className="w-3.5 h-3.5 mr-2" />
              Add Document
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAction('link')}>
              <LinkIcon className="w-3.5 h-3.5 mr-2" />
              Add Link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DocumentsSection
        projectSlug={projectSlug}
        open={docsOpen}
        onToggle={() => setDocsOpen((v) => !v)}
      />

      <LinksSection
        project={project}
        open={linksOpen}
        onToggle={() => setLinksOpen((v) => !v)}
        showAddForm={showAddLink}
        onAddFormClose={() => setShowAddLink(false)}
      />
    </div>
  );
}

function DocumentsSection({
  projectSlug,
  open,
  onToggle,
}: {
  projectSlug: string;
  open: boolean;
  onToggle: () => void;
}) {
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

  return (
    <div>
      <button
        type="button"
        className="w-full flex items-center gap-1.5 mb-2 group"
        onClick={onToggle}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Documents ({orderedDocs.length})
        </span>
      </button>

      {open &&
        (docsQuery.isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Spinner className="w-4 h-4" />
          </div>
        ) : (
          <div className="flex min-h-[300px] gap-3">
            <Card className="w-44 shrink-0 overflow-hidden py-0">
              <div className="px-2 py-2 border-b border-border/20 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                  Docs
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
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                        aria-label={`Delete ${doc.title}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="flex-1 overflow-hidden py-0">
              {selectedDoc ? (
                <>
                  <div className="px-3 py-2 border-b border-border/20">
                    <Input
                      value={editTitle}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      className="border-none shadow-none bg-transparent font-medium focus-visible:ring-0"
                      placeholder="Document title..."
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto p-3">
                    <Textarea
                      value={editContent}
                      onChange={(e) => handleContentChange(e.target.value)}
                      className="w-full h-full border-none shadow-none bg-transparent focus-visible:ring-0"
                      placeholder="Start writing..."
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-muted-foreground">
                    Select a document or create a new one.
                  </p>
                </div>
              )}
            </Card>
          </div>
        ))}
    </div>
  );
}

function LinksSection({
  project,
  open,
  onToggle,
  showAddForm,
  onAddFormClose,
}: {
  project: Project;
  open: boolean;
  onToggle: () => void;
  showAddForm: boolean;
  onAddFormClose: () => void;
}) {
  const projectPath = useAppStore((s) => s.currentProject?.path) ?? '';
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');

  const addLink = useMutation({
    mutationFn: async () => {
      const api = getHttpApiClient();
      return api.lifecycle.addLink(projectPath, project.slug, label, url);
    },
    onSuccess: () => {
      setLabel('');
      setUrl('');
      onAddFormClose();
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectPath, project.slug] });
      toast.success('Link added');
    },
    onError: () => toast.error('Failed to add link'),
  });

  const removeLink = useMutation({
    mutationFn: async (linkId: string) => {
      const api = getHttpApiClient();
      return api.lifecycle.removeLink(projectPath, project.slug, linkId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-detail', projectPath, project.slug] });
      toast.success('Link removed');
    },
  });

  const links = project.links ?? [];

  return (
    <div>
      <button
        type="button"
        className="w-full flex items-center gap-1.5 mb-2 group"
        onClick={onToggle}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Links ({links.length})
        </span>
      </button>

      {open && (
        <div className="space-y-2">
          {showAddForm && (
            <Card className="p-3 space-y-2">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label..."
                autoFocus
              />
              <Input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
              />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onAddFormClose();
                    setLabel('');
                    setUrl('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => addLink.mutate()}
                  disabled={!label.trim() || !url.trim() || addLink.isPending}
                >
                  Add
                </Button>
              </div>
            </Card>
          )}

          {links.length === 0 && !showAddForm ? (
            <div className="text-center py-6">
              <LinkIcon className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No links yet.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {links.map((link: ProjectLink) => (
                <Card key={link.id} className="flex-row items-center gap-2 px-3 py-2 group">
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-foreground block truncate">{link.label}</span>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-[var(--status-info)] hover:text-[var(--status-info)]/80 truncate block"
                    >
                      {link.url}
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLink.mutate(link.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                    aria-label={`Remove ${link.label}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
