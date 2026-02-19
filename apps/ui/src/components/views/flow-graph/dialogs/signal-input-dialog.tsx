/**
 * Signal Input Dialog — Submit ideas, bugs, or feature requests
 * from the flow graph signal-sources node.
 *
 * Textarea + submit. Shows toast on signal:routed WebSocket event.
 */

import { useState, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@protolabs/ui/atoms';
import { Button } from '@protolabs/ui/atoms';
import { useMutation } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useAppStore } from '@/store/app-store';
import { toast } from 'sonner';

interface SignalInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SignalInputDialog({ open, onOpenChange }: SignalInputDialogProps) {
  const [content, setContent] = useState('');
  const projectPath = useAppStore((s) => s.currentProject?.path);

  const submitMutation = useMutation({
    mutationFn: async (signal: { content: string; projectPath?: string }) => {
      const api = getHttpApiClient();
      return api.engine.signalSubmit({
        content: signal.content,
        projectPath: signal.projectPath,
        source: 'ui:flow-graph',
      });
    },
    onSuccess: () => {
      toast.success('Signal submitted for processing');
      setContent('');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(
        `Failed to submit signal: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    },
  });

  const handleSubmit = useCallback(() => {
    if (!content.trim()) return;
    submitMutation.mutate({ content: content.trim(), projectPath: projectPath || undefined });
  }, [content, projectPath, submitMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit Signal</DialogTitle>
          <DialogDescription>
            Submit an idea, bug report, or feature request for automated processing.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          <textarea
            className="w-full min-h-[120px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-y"
            placeholder="Describe the idea, bug, or feature request..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />

          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              {projectPath ? `Project: ${projectPath.split('/').pop()}` : 'No project selected'}
            </p>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-muted-foreground">Cmd+Enter to submit</p>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!content.trim() || submitMutation.isPending}
              >
                {submitMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                )}
                Submit
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
