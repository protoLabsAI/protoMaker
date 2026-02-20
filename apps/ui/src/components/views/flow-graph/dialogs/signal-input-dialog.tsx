/**
 * Signal Input Dialog — Submit ideas, bugs, or feature requests
 * from the flow graph signal-sources node.
 *
 * Textarea + image upload + file attach + submit.
 */

import { useState, useCallback } from 'react';
import {
  Send,
  Loader2,
  Paperclip,
  X,
  Zap,
  Globe,
  ImagePlus,
  PenTool,
  SlidersHorizontal,
} from 'lucide-react';
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

type PipelineMode = 'auto' | 'step-by-step' | 'research-only' | 'execute-only';

const PIPELINE_MODE_LABELS: Record<PipelineMode, string> = {
  auto: 'Auto',
  'step-by-step': 'Step-by-step',
  'research-only': 'Research only',
  'execute-only': 'Execute only',
};

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
  const [webResearch, setWebResearch] = useState(false);
  const [contentMode, setContentMode] = useState(false);
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>('auto');
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
      webResearch?: boolean;
      pipelineMode?: PipelineMode;
    }) => {
      const api = getHttpApiClient();
      return api.engine.signalSubmit({
        content: signal.content,
        projectPath: signal.projectPath,
        source: contentMode ? 'ui:content' : 'ui:flow-graph',
        images: signal.images,
        files: signal.files,
        autoApprove: signal.autoApprove,
        webResearch: signal.webResearch,
        pipelineMode: signal.pipelineMode,
      });
    },
    onSuccess: (_data, variables) => {
      toast.success(contentMode ? 'Content idea submitted' : 'Signal submitted for processing');
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
      webResearch: webResearch || undefined,
      pipelineMode: pipelineMode !== 'auto' ? pipelineMode : undefined,
    });
  }, [content, projectPath, images, files, autoApprove, webResearch, pipelineMode, submitMutation]);

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
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className={`h-7 w-7 ${showImageUpload ? 'text-violet-400' : ''}`}
                onClick={() => setShowImageUpload((v) => !v)}
                title={showImageUpload ? 'Hide images' : 'Add images'}
              >
                <ImagePlus className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleFileAttach}
                title="Attach file"
              >
                <Paperclip className="w-3.5 h-3.5" />
              </Button>
              <button
                type="button"
                onClick={() => setWebResearch((v) => !v)}
                className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
                  webResearch
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                title="Web research during PM phase"
              >
                <Globe className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setAutoApprove((v) => !v)}
                className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
                  autoApprove
                    ? 'bg-violet-500/20 text-violet-400'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                title="Auto-approve PRD"
              >
                <Zap className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setContentMode((v) => !v)}
                className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
                  contentMode
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
                title="Content creation mode"
              >
                <PenTool className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-center gap-1 ml-1 pl-1 border-l border-border/40">
                <SlidersHorizontal className="w-3 h-3 text-muted-foreground" />
                <select
                  value={pipelineMode}
                  onChange={(e) => setPipelineMode(e.target.value as PipelineMode)}
                  className="h-6 text-[10px] rounded border border-border/50 bg-background px-1 text-foreground"
                  title="Pipeline mode"
                >
                  {(Object.keys(PIPELINE_MODE_LABELS) as PipelineMode[]).map((mode) => (
                    <option key={mode} value={mode}>
                      {PIPELINE_MODE_LABELS[mode]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="text-[10px] text-muted-foreground">
                {navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+Enter
              </kbd>
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
