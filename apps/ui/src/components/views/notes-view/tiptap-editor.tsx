import { useEffect, useMemo, useCallback, useRef } from 'react';
import { useEditor, EditorContent, ReactRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import type { Editor } from '@tiptap/react';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import { toast } from 'sonner';
import { GhostText } from './extensions/ghost-text';
import {
  SlashCommands,
  SLASH_COMMAND_ITEMS,
  type SlashCommandItem,
} from './extensions/slash-commands';
import { SlashCommandList, type SlashCommandListRef } from './slash-command-list';
import { AIBubbleMenu } from './ai-bubble-menu';
import { getHttpApiClient } from '@/lib/http-api-client';
import { useAppStore } from '@/store/app-store';

interface TiptapEditorProps {
  content: string;
  onUpdate: (content: string) => void;
  onEditorReady?: (editor: Editor) => void;
}

/**
 * Read a streaming text response into a single string.
 * Stops early if the response is too long (safety cap).
 */
async function readStream(response: Response, maxChars = 200): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const decoder = new TextDecoder();
  let result = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
      if (result.length > maxChars) break;
    }
  } finally {
    reader.releaseLock();
  }

  return result.slice(0, maxChars);
}

/** Read a full streaming response (no cap) for AI generation */
async function readFullStream(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const decoder = new TextDecoder();
  let result = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }

  return result;
}

export function TiptapEditor({ content, onUpdate, onEditorReady }: TiptapEditorProps) {
  const editorRef = useRef<Editor | null>(null);
  const appSpec = useAppStore((s) => s.appSpec);
  const currentProject = useAppStore((s) => s.currentProject);

  const getProjectContext = useCallback(() => {
    const parts: string[] = [];
    if (currentProject?.name) parts.push(`Project: ${currentProject.name}`);
    if (appSpec) parts.push(appSpec.slice(0, 500));
    return parts.length > 0 ? parts.join('\n') : null;
  }, [appSpec, currentProject]);

  // Handle AI slash commands via custom event
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { command: string };
      const currentEditor = editorRef.current;
      if (!currentEditor) return;

      const docText = currentEditor.state.doc.textContent;
      const pos = currentEditor.state.selection.head;
      const contextBefore = docText.slice(Math.max(0, pos - 3000), pos);

      try {
        const response = await getHttpApiClient().ai.generate(detail.command, contextBefore);
        if (!response.ok) {
          toast.error('AI generation failed');
          return;
        }

        const html = await readFullStream(response);
        if (html.trim()) {
          currentEditor.commands.insertContent(html.trim());
        }
      } catch {
        toast.error('AI generation failed');
      }
    };

    window.addEventListener('slash-command-ai', handler);
    return () => window.removeEventListener('slash-command-ai', handler);
  }, []);

  const ghostTextExtension = useMemo(
    () =>
      GhostText.configure({
        minDocLength: 100,
        getProjectContext,
        fetchCompletion: async (
          context: string,
          currentLine: string,
          projectContext?: string | null
        ) => {
          try {
            const response = await getHttpApiClient().ai.complete(
              context,
              currentLine,
              projectContext
            );
            if (!response.ok) return null;
            const text = await readStream(response);
            return text || null;
          } catch {
            return null;
          }
        },
      }),
    [getProjectContext]
  );

  const slashCommandsExtension = useMemo(
    () =>
      SlashCommands.configure({
        suggestion: {
          items: ({ query }: { query: string }) => {
            const lower = query.toLowerCase();
            return SLASH_COMMAND_ITEMS.filter(
              (item) =>
                item.label.toLowerCase().includes(lower) ||
                item.description.toLowerCase().includes(lower) ||
                item.id.includes(lower)
            ).slice(0, 10);
          },
          render: () => {
            let component: ReactRenderer<SlashCommandListRef> | null = null;
            let popup: TippyInstance[] | null = null;

            return {
              onStart: (props) => {
                component = new ReactRenderer(SlashCommandList, {
                  props,
                  editor: props.editor,
                });

                if (!props.clientRect) return;

                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect as () => DOMRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                  maxWidth: 320,
                });
              },

              onUpdate: (props) => {
                component?.updateProps(props);
                if (props.clientRect && popup?.[0]) {
                  popup[0].setProps({
                    getReferenceClientRect: props.clientRect as () => DOMRect,
                  });
                }
              },

              onKeyDown: (props) => {
                if (props.event.key === 'Escape') {
                  popup?.[0]?.hide();
                  return true;
                }
                return component?.ref?.onKeyDown(props) ?? false;
              },

              onExit: () => {
                popup?.[0]?.destroy();
                component?.destroy();
              },
            };
          },
          command: ({
            editor,
            range,
            props,
          }: {
            editor: Editor;
            range: { from: number; to: number };
            props: SlashCommandItem;
          }) => {
            // Delete the /command text first
            editor.chain().focus().deleteRange(range).run();
            // Then execute the command
            props.command(editor);
          },
        },
      }),
    []
  );

  const handleEditorReady = useCallback(
    (e: Editor) => {
      editorRef.current = e;
      onEditorReady?.(e);
    },
    [onEditorReady]
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Type / for commands...',
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'notes-link' },
      }),
      Underline,
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      ghostTextExtension,
      slashCommandsExtension,
    ],
    content,
    onUpdate: ({ editor: e }) => {
      onUpdate(e.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'min-h-full px-6 py-4 focus:outline-none',
      },
    },
  });

  // Notify parent when editor is ready
  useEffect(() => {
    if (editor) {
      handleEditorReady(editor);
    }
  }, [editor, handleEditorReady]);

  // Sync content when tab switches (content prop changes from outside)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  return (
    <div className="flex-1 overflow-y-auto">
      <EditorContent editor={editor} className="h-full" />
      {editor && <AIBubbleMenu editor={editor} />}
    </div>
  );
}
