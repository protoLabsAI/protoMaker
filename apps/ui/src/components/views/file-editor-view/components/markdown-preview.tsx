import { cn } from '@/lib/utils';
import { Button } from '@protolabs-ai/ui/atoms';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@protolabs-ai/ui/atoms';
import { Code, Eye, Columns2 } from 'lucide-react';
import { Markdown } from '@protolabs-ai/ui/molecules';
import type { MarkdownViewMode } from '../use-file-editor-store';

export function isMarkdownFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'md' || ext === 'mdx' || ext === 'markdown';
}

interface MarkdownViewToolbarProps {
  mode: MarkdownViewMode;
  onChange: (mode: MarkdownViewMode) => void;
}

const modes: { value: MarkdownViewMode; icon: typeof Code; label: string }[] = [
  { value: 'editor', icon: Code, label: 'Source' },
  { value: 'preview', icon: Eye, label: 'Preview' },
  { value: 'split', icon: Columns2, label: 'Split' },
];

export function MarkdownViewToolbar({ mode, onChange }: MarkdownViewToolbarProps) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-0.5 rounded-md bg-muted/50 p-0.5">
        {modes.map(({ value, icon: Icon, label }) => (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <Button
                variant={mode === value ? 'secondary' : 'ghost'}
                size="sm"
                className={cn('h-6 w-6 p-0', mode !== value && 'opacity-60')}
                onClick={() => onChange(value)}
              >
                <Icon className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

interface MarkdownPreviewPanelProps {
  content: string;
  className?: string;
}

export function MarkdownPreviewPanel({ content, className }: MarkdownPreviewPanelProps) {
  return (
    <div className={cn('h-full overflow-y-auto p-4', className)}>
      <Markdown>{content}</Markdown>
    </div>
  );
}
