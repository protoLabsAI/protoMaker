/**
 * Signal Input Dialog — Submit ideas, bugs, or feature requests
 * from the flow graph signal-sources node.
 *
 * Textarea + image upload + file attach + submit.
 */

import { useState, useCallback } from 'react';
import { Send, Loader2, Paperclip, X, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@protolabs/ui/atoms';
import { Button } from '@protolabs/ui/atoms';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getHttpApiClient } from '@/lib/http-api-client';
import { queryKeys } from '@/lib/query-keys';
import { useAppStore, type ImageAttachment } from '@/store/app-store';
import { toast } from 'sonner';
import { ImageDropZone } from '@/components/shared/image-drop-zone';
import {
  fileToText,
  validateTextFile,
  formatFileSize,
  ACCEPTED_TEXT_EXTENSIONS,
} from '@/lib/image-utils';

interface TextAttachment {
  name: string;
  content: string;
  size: number;
}

interface SignalInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SignalInputDialog({ open, onOpenChange }: SignalInputDialogProps) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [files, setFiles] = useState<TextAttachment[]>([]);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);
  const projectPath = useAppStore((s) => s.currentProject?.path);

  const reset = useCallback(() => {
    setContent('');
    setImages([]);
    setFiles([]);
    setShowImageUpload(false);
  }, []);

  const submitMutation = useMutation({
    mutationFn: async (signal: {
      content: string;
      projectPath?: string;
      images?: string[];
      files?: string[];
      autoApprove?: boolean;
    }) => {
      const api = getHttpApiClient();
      return api.engine.signalSubmit({
        content: signal.content,
        projectPath: signal.projectPath,
        source: 'ui:flow-graph',
        images: signal.images,
        files: signal.files,
        autoApprove: signal.autoApprove,
      });
    },
    onSuccess: (_data, variables) => {
      toast.success('Signal submitted for processing');
      if (variables.projectPath) {
        queryClient.invalidateQueries({ queryKey: queryKeys.features.all(variables.projectPath) });
      }
      reset();
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
    submitMutation.mutate({
      content: content.trim(),
      projectPath: projectPath || undefined,
      images: images.length > 0 ? images.map((img) => img.data) : undefined,
      files: files.length > 0 ? files.map((f) => `--- ${f.name} ---\n${f.content}`) : undefined,
      autoApprove: autoApprove || undefined,
    });
  }, [content, projectPath, images, files, autoApprove, submitMutation]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handleFileAttach = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = ACCEPTED_TEXT_EXTENSIONS.join(',');
    input.onchange = async () => {
      if (!input.files) return;
      const newFiles: TextAttachment[] = [];
      for (const file of Array.from(input.files)) {
        const validation = validateTextFile(file);
        if (!validation.isValid) {
          toast.error(validation.error);
          continue;
        }
        const text = await fileToText(file);
        newFiles.push({ name: file.name, content: text, size: file.size });
      }
      setFiles((prev) => [...prev, ...newFiles]);
    };
    input.click();
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

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

          {/* Image upload zone */}
          {showImageUpload && (
            <ImageDropZone
              onImagesSelected={setImages}
              images={images}
              maxFiles={5}
              className="text-sm"
            />
          )}

          {/* Attached files */}
          {files.length > 0 && (
            <div className="space-y-1">
              {files.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs bg-muted/40 rounded px-2 py-1.5"
                >
                  <Paperclip className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{file.name}</span>
                  <span className="text-muted-foreground shrink-0">
                    {formatFileSize(file.size)}
                  </span>
                  <button
                    onClick={() => removeFile(i)}
                    className="text-muted-foreground hover:text-foreground p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setShowImageUpload((v) => !v)}
              >
                {showImageUpload ? 'Hide images' : 'Add images'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleFileAttach}
              >
                <Paperclip className="w-3 h-3 mr-1" />
                Attach file
              </Button>
              <p className="text-[10px] text-muted-foreground ml-1">
                {projectPath ? projectPath.split('/').pop() : 'No project'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAutoApprove((v) => !v)}
                className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                  autoApprove
                    ? 'bg-violet-500/20 text-violet-400'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Auto-approve PRD and skip manual review"
              >
                <Zap className="w-3 h-3" />
                Auto
              </button>
              <p className="text-[10px] text-muted-foreground">Cmd+Enter</p>
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
