/**
 * AI Bubble Menu — appears on text selection with AI rewrite actions
 *
 * Uses TipTap's open-source BubbleMenu to show AI actions when text is selected.
 * Actions stream responses from /api/ai/rewrite and replace the selected text.
 */

import { useState, useCallback } from 'react';
import { BubbleMenu, type Editor } from '@tiptap/react';
import { Wand2, Shrink, SpellCheck, Briefcase, Expand, Loader2, SendHorizonal } from 'lucide-react';
import { getHttpApiClient } from '@/lib/http-api-client';

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
        // Silently handle errors
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
      </div>
    </BubbleMenu>
  );
}
