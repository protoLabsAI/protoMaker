import { useEffect, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import type { Editor } from '@tiptap/react';
import { GhostText } from './extensions/ghost-text';
import { getHttpApiClient } from '@/lib/http-api-client';

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

export function TiptapEditor({ content, onUpdate, onEditorReady }: TiptapEditorProps) {
  const ghostTextExtension = useMemo(
    () =>
      GhostText.configure({
        fetchCompletion: async (context: string, currentLine: string) => {
          try {
            const response = await getHttpApiClient().ai.complete(context, currentLine);
            if (!response.ok) return null;
            const text = await readStream(response);
            return text || null;
          } catch {
            return null;
          }
        },
      }),
    []
  );

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
      ghostTextExtension,
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
    if (editor && onEditorReady) {
      onEditorReady(editor);
    }
  }, [editor, onEditorReady]);

  // Sync content when tab switches (content prop changes from outside)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, false);
    }
  }, [content, editor]);

  return (
    <div className="flex-1 overflow-y-auto">
      <EditorContent editor={editor} className="h-full" />
    </div>
  );
}
