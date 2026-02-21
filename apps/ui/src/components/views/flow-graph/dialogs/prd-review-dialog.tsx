/**
 * PRD Review Dialog — Review and approve/reject project PRDs
 * from the flow graph project-planning node.
 *
 * Shows PRD content (SPARC sections) rendered as markdown with
 * Approve and Request Changes actions.
 * On Approve: calls lifecycle approve-prd which creates Linear tickets + features.
 */

import { useState, useCallback, useMemo } from 'react';
import { CheckCircle, MessageSquare, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@protolabs/ui/atoms';
import { Button } from '@protolabs/ui/atoms';
import { Badge } from '@protolabs/ui/atoms';
import { useMutation, useQuery } from '@tanstack/react-query';
import Markdown from 'react-markdown';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';

interface PrdReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectSlug: string;
  /** Inline PRD data from WebSocket (skips project fetch when provided) */
  prdData?: {
    featureId: string;
    title: string;
    prd: string;
    milestones?: Array<{ title: string; phases: unknown[] }>;
  } | null;
}

const SPARC_LABELS: Record<string, { label: string; color: string }> = {
  situation: { label: 'Situation', color: 'text-blue-400' },
  problem: { label: 'Problem', color: 'text-rose-400' },
  approach: { label: 'Approach', color: 'text-emerald-400' },
  results: { label: 'Results', color: 'text-amber-400' },
};

function PrdSection({
  sectionKey,
  content,
  defaultOpen = true,
}: {
  sectionKey: string;
  content: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const meta = SPARC_LABELS[sectionKey] || { label: sectionKey, color: 'text-violet-400' };

  return (
    <div className="border border-border/20 rounded-lg overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <h4 className={`text-xs font-semibold uppercase tracking-wider ${meta.color}`}>
          {meta.label}
        </h4>
      </button>
      {open && (
        <div className="px-3 pb-3 prose prose-sm prose-invert max-w-none prose-p:text-foreground/90 prose-headings:text-foreground prose-li:text-foreground/90 prose-strong:text-foreground prose-code:text-violet-300 prose-code:bg-muted/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-muted/30 prose-pre:border prose-pre:border-border/20">
          <Markdown>{content}</Markdown>
        </div>
      )}
    </div>
  );
}

function FeedbackEditor({
  onSubmit,
  isPending,
}: {
  onSubmit: (feedback: string) => void;
  isPending: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Describe the changes needed... (supports markdown formatting)',
      }),
    ],
    editorProps: {
      attributes: {
        class:
          'min-h-[80px] max-h-[200px] overflow-y-auto px-3 py-2 text-sm text-foreground focus:outline-none',
      },
    },
  });

  const handleSubmit = useCallback(() => {
    if (!editor) return;
    const text = editor.getText().trim();
    if (!text) {
      toast.error('Please provide feedback before submitting');
      return;
    }
    // Send as HTML for rich formatting
    onSubmit(editor.getHTML());
  }, [editor, onSubmit]);

  return (
    <div className="space-y-2 border-t border-border/30 pt-3">
      <div className="rounded-lg border border-border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-violet-500/50">
        <EditorContent editor={editor} />
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSubmit} disabled={isPending}>
          {isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
          ) : (
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
          )}
          Submit Feedback
        </Button>
      </div>
    </div>
  );
}

/** Parse SPARC sections from raw PRD markdown text */
function parseSPARCSections(prdText: string): Array<{ key: string; content: string }> {
  const sections: Array<{ key: string; content: string }> = [];
  for (const key of Object.keys(SPARC_LABELS)) {
    const regex = new RegExp(`##\\s*${key}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
    const match = prdText.match(regex);
    if (match) sections.push({ key, content: match[1].trim() });
  }
  return sections;
}

export function PrdReviewDialog({
  open,
  onOpenChange,
  projectSlug,
  prdData,
}: PrdReviewDialogProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const projectPath = useAppStore((s) => s.currentProject?.path);

  // Inline mode: PRD data provided directly (from WebSocket event)
  const isInlineMode = !!prdData?.prd;

  const { data, isLoading } = useQuery({
    queryKey: ['project', projectPath, projectSlug],
    queryFn: async () => {
      const api = getHttpApiClient();
      return api.lifecycle.getProject(projectPath || '', projectSlug);
    },
    enabled: open && !!projectPath && !!projectSlug && !isInlineMode,
    staleTime: 10000,
  });

  // Project-slug mode: approve via lifecycle (creates features from milestones)
  const approveMutation = useMutation({
    mutationFn: async () => {
      const api = getHttpApiClient();
      if (isInlineMode) {
        return api.engine.approvePrd(projectPath || '', prdData!.featureId, 'approve');
      }
      return api.lifecycle.approvePrd(projectPath || '', projectSlug, {
        createEpics: true,
        setupDependencies: true,
      });
    },
    onSuccess: () => {
      toast.success(
        isInlineMode
          ? 'PRD approved — pipeline advancing'
          : 'PRD approved — creating features and Linear tickets'
      );
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(
        `Failed to approve PRD: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    },
  });

  const handleApprove = useCallback(() => {
    approveMutation.mutate();
  }, [approveMutation]);

  const requestChangesMutation = useMutation({
    mutationFn: async (fb: string) => {
      const api = getHttpApiClient();
      if (isInlineMode) {
        return api.engine.approvePrd(projectPath || '', prdData!.featureId, 'reject');
      }
      return api.lifecycle.requestChanges(projectPath || '', projectSlug, fb);
    },
    onSuccess: () => {
      toast.success(
        isInlineMode
          ? 'PRD rejected — feedback sent to pipeline'
          : 'Changes requested — feedback stored for PRD regeneration'
      );
      setShowFeedback(false);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(
        `Failed to request changes: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    },
  });

  const handleFeedbackSubmit = useCallback(
    (feedback: string) => {
      requestChangesMutation.mutate(feedback);
    },
    [requestChangesMutation]
  );

  const project = data?.project;
  const prd = project?.prd;

  // Build SPARC sections: from inline PRD text or from project query
  const sections = useMemo(() => {
    if (isInlineMode) {
      return parseSPARCSections(prdData!.prd);
    }
    if (!prd) return [];
    return [
      { key: 'situation', content: prd.situation },
      { key: 'problem', content: prd.problem },
      { key: 'approach', content: prd.approach },
      { key: 'results', content: prd.results },
    ].filter((s) => s.content);
  }, [prd, isInlineMode, prdData]);

  const hasPrd = isInlineMode || !!prd;
  const title = isInlineMode ? prdData!.title : project?.title || projectSlug;
  const milestones = isInlineMode ? prdData!.milestones : project?.milestones;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>Review the PRD before approving</DialogDescription>
            </div>
            {project?.status && (
              <Badge
                variant={project.status === 'reviewing' ? 'default' : 'secondary'}
                className="ml-2"
              >
                {project.status}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="mt-3 space-y-3">
          {!isInlineMode && isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !hasPrd ? (
            <p className="text-sm text-muted-foreground py-4">No PRD found for this project.</p>
          ) : (
            <>
              {/* SPARC sections with markdown rendering */}
              {sections.map((s) => (
                <PrdSection key={s.key} sectionKey={s.key} content={s.content} />
              ))}

              {/* Milestones */}
              {milestones && milestones.length > 0 && (
                <div className="space-y-2 border-t border-border/30 pt-3">
                  <h4 className="text-xs font-semibold text-violet-400 uppercase tracking-wider">
                    Milestones
                  </h4>
                  {milestones.map((ms: any, i: number) => (
                    <div key={i} className="text-sm p-2 rounded bg-muted/30">
                      <span className="font-medium">{ms.title}</span>
                      {ms.phases?.length > 0 && (
                        <span className="text-muted-foreground ml-2">
                          ({ms.phases.length} phase{ms.phases.length !== 1 ? 's' : ''})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Feedback editor (shown on Request Changes) */}
          {showFeedback && (
            <FeedbackEditor
              onSubmit={handleFeedbackSubmit}
              isPending={requestChangesMutation.isPending}
            />
          )}

          {/* Action buttons */}
          {hasPrd && !showFeedback && (
            <div className="flex items-center justify-end gap-2 border-t border-border/30 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFeedback(true)}
                disabled={approveMutation.isPending}
              >
                <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                Request Changes
              </Button>
              <Button size="sm" onClick={handleApprove} disabled={approveMutation.isPending}>
                {approveMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                )}
                Approve PRD
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
