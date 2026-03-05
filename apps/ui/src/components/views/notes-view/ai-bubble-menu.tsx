/**
 * AI Bubble Menu — appears on text selection with AI rewrite actions
 *
 * Uses TipTap's open-source BubbleMenu to show AI actions when text is selected.
 * Actions stream responses from /api/ai/rewrite and replace the selected text.
 */

import { useState, useCallback } from 'react';
import { BubbleMenu, type Editor } from '@tiptap/react';
import {
  Wand2,
  Shrink,
  SpellCheck,
  Briefcase,
  Expand,
  Loader2,
  SendHorizonal,
  FileText,
  Megaphone,
  BookOpen,
  Lightbulb,
} from 'lucide-react';
import { toast } from 'sonner';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useAppStore } from '@/store/app-store';

interface AIBubbleMenuProps {
  editor: Editor;
}

const PRESET_ACTIONS = [
  { id: 'rewrite', label: 'Rewrite', icon: Wand2, instruction: 'Rewrite this more clearly' },
  {
    id: 'shorten',
    label: 'Shorten',
    icon: Shrink,
    instruction: 'Make this shorter and more concise',
  },
  { id: 'fix-grammar', label: 'Fix', icon: SpellCheck, instruction: 'Fix grammar and spelling' },
  {
    id: 'professional',
    label: 'Pro tone',
    icon: Briefcase,
    instruction: 'Rewrite in a professional tone',
  },
  { id: 'expand', label: 'Expand', icon: Expand, instruction: 'Expand with more detail' },
] as const;

const PIPELINE_ACTIONS = [
  { id: 'blog', label: 'Blog Post', icon: FileText, format: 'guide', tone: 'conversational' },
  { id: 'social', label: 'Social', icon: Megaphone, format: 'guide', tone: 'conversational' },
  { id: 'docs', label: 'Docs', icon: BookOpen, format: 'reference', tone: 'technical' },
  { id: 'idea', label: 'Idea', icon: Lightbulb },
] as const;

export function AIBubbleMenu({ editor }: AIBubbleMenuProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  const handleRewrite = useCallback(
    async (instruction: string) => {
      const { from, to } = editor.state.selection;
      const selectedText = editor.state.doc.textBetween(from, to, ' ');
      if (!selectedText.trim()) return;

      // Get surrounding context for better rewrites
      const docText = editor.state.doc.textContent;
      const surroundingContext = docText.slice(
        Math.max(0, from - 500),
        Math.min(docText.length, to + 500)
      );

      setIsLoading(true);

      try {
        const response = await getHttpApiClient().ai.rewrite(
          selectedText,
          instruction,
          surroundingContext
        );

        if (!response.ok) {
          toast.error('AI rewrite failed');
          setIsLoading(false);
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          setIsLoading(false);
          return;
        }

        const decoder = new TextDecoder();
        let result = '';

        // Read the full stream first, then replace
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          result += decoder.decode(value, { stream: true });
        }
        reader.releaseLock();

        if (result.trim()) {
          // Replace the selected text with AI result
          editor.chain().focus().insertContentAt({ from, to }, result.trim()).run();
        }
      } catch {
        toast.error('AI rewrite failed');
      } finally {
        setIsLoading(false);
        setCustomPrompt('');
      }
    },
    [editor]
  );

  const handleCustomSubmit = useCallback(() => {
    if (customPrompt.trim()) {
      handleRewrite(customPrompt.trim());
    }
  }, [customPrompt, handleRewrite]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleCustomSubmit();
      }
    },
    [handleCustomSubmit]
  );

  const handleSendToPipeline = useCallback(
    async (action: (typeof PIPELINE_ACTIONS)[number]) => {
      const { from, to } = editor.state.selection;
      const selectedText = editor.state.doc.textBetween(from, to, ' ');
      if (!selectedText.trim()) return;

      const projectPath = useAppStore.getState().currentProject?.path;
      if (!projectPath) {
        toast.error('No project selected');
        return;
      }

      setIsLoading(true);
      try {
        const client = getHttpApiClient();
        if (action.id === 'idea') {
          await client.authorityPipeline.injectIdea(
            projectPath,
            selectedText.slice(0, 100),
            selectedText
          );
        } else {
          await client.contentPipeline.create(projectPath, selectedText, {
            format: 'format' in action ? action.format : undefined,
            tone: 'tone' in action ? action.tone : undefined,
            audience: 'intermediate',
          });
        }
        const label = action.id === 'idea' ? 'Idea pipeline' : `${action.label} pipeline`;
        toast.success(`Sent to ${label}`);
        editor.commands.setTextSelection(to);
      } catch {
        toast.error('Failed to send to pipeline');
      } finally {
        setIsLoading(false);
      }
    },
    [editor]
  );

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{
        placement: 'bottom-start',
        maxWidth: 400,
        duration: [150, 100],
      }}
      shouldShow={({ state }) => {
        if (isLoading) return true;
        const { selection } = state;
        return !selection.empty && selection.content().size > 0;
      }}
    >
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-popover p-1 shadow-lg">
        {/* Preset actions */}
        <div className="flex items-center gap-0.5">
          {PRESET_ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => handleRewrite(action.instruction)}
              disabled={isLoading}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              title={action.instruction}
            >
              {isLoading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <action.icon className="size-3" />
              )}
              <span>{action.label}</span>
            </button>
          ))}
        </div>

        {/* Custom prompt input */}
        <div className="flex items-center gap-1 border-t border-border pt-1">
          <input
            type="text"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Custom instruction..."
            disabled={isLoading}
            className="min-w-0 flex-1 bg-transparent px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            onClick={handleCustomSubmit}
            disabled={isLoading || !customPrompt.trim()}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30"
          >
            {isLoading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <SendHorizonal className="size-3" />
            )}
          </button>
        </div>

        {/* TODO: Re-enable Send to pipeline with content creation updates */}
        {/* <div className="flex items-center gap-0.5 border-t border-border pt-1">
          <span className="px-2 text-[10px] text-muted-foreground/60">Send to</span>
          {PIPELINE_ACTIONS.map((action) => (
            <button
              key={action.id}
              onClick={() => handleSendToPipeline(action)}
              disabled={isLoading}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              title={`Send to ${action.label} pipeline`}
            >
              <action.icon className="size-3" />
              <span>{action.label}</span>
            </button>
          ))}
        </div> */}
      </div>
    </BubbleMenu>
  );
}
