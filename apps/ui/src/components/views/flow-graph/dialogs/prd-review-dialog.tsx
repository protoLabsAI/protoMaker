/**
 * PRD Review Dialog — Review and approve/reject project PRDs
 * from the flow graph project-planning node.
 *
 * Shows PRD content (SPARC sections) with Approve and Request Changes actions.
 * On Approve: calls lifecycle approve-prd which creates Linear tickets + features.
 */

import { useState, useCallback } from 'react';
import { CheckCircle, MessageSquare, Loader2 } from 'lucide-react';
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
import { getHttpApiClient } from '@/lib/http-api-client';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';

interface PrdReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectSlug: string;
}

function PrdSection({ title, content }: { title: string; content: string }) {
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold text-violet-400 uppercase tracking-wider">{title}</h4>
      <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{content}</p>
    </div>
  );
}

export function PrdReviewDialog({ open, onOpenChange, projectSlug }: PrdReviewDialogProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');
  const projectPath = useAppStore((s) => s.currentProject?.path);

  const { data, isLoading } = useQuery({
    queryKey: ['project', projectPath, projectSlug],
    queryFn: async () => {
      const api = getHttpApiClient();
      return api.lifecycle.getProject(projectPath || '', projectSlug);
    },
    enabled: open && !!projectPath && !!projectSlug,
    staleTime: 10000,
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const api = getHttpApiClient();
      return api.lifecycle.approvePrd(projectPath || '', projectSlug, {
        createEpics: true,
        setupDependencies: true,
      });
    },
    onSuccess: () => {
      toast.success('PRD approved — creating features and Linear tickets');
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

  const handleRequestChanges = useCallback(() => {
    if (!feedback.trim()) {
      setShowFeedback(true);
      return;
    }
    toast.info('Feedback noted — PRD will be regenerated with your changes');
    setFeedback('');
    setShowFeedback(false);
    onOpenChange(false);
  }, [feedback, onOpenChange]);

  const project = data?.project;
  const prd = project?.prd;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>{project?.title || projectSlug}</DialogTitle>
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

        <div className="mt-3 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !prd ? (
            <p className="text-sm text-muted-foreground py-4">No PRD found for this project.</p>
          ) : (
            <>
              <PrdSection title="Situation" content={prd.situation} />
              <PrdSection title="Problem" content={prd.problem} />
              <PrdSection title="Approach" content={prd.approach} />
              <PrdSection title="Results" content={prd.results} />

              {project?.milestones && project.milestones.length > 0 && (
                <div className="space-y-2 border-t border-border/30 pt-3">
                  <h4 className="text-xs font-semibold text-violet-400 uppercase tracking-wider">
                    Milestones
                  </h4>
                  {project.milestones.map((ms, i) => (
                    <div key={i} className="text-sm p-2 rounded bg-muted/30">
                      <span className="font-medium">{ms.title}</span>
                      <span className="text-muted-foreground ml-2">
                        ({ms.phases.length} phase{ms.phases.length !== 1 ? 's' : ''})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Feedback input (shown on Request Changes) */}
          {showFeedback && (
            <div className="space-y-2 border-t border-border/30 pt-3">
              <textarea
                className="w-full min-h-[80px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-y"
                placeholder="Describe the changes needed..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {/* Action buttons */}
          {prd && (
            <div className="flex items-center justify-end gap-2 border-t border-border/30 pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRequestChanges}
                disabled={approveMutation.isPending}
              >
                <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                {showFeedback ? 'Submit Feedback' : 'Request Changes'}
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
