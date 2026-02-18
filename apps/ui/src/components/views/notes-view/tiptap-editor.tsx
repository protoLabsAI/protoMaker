import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import type { Editor } from '@tiptap/react';

interface TiptapEditorProps {
  content: string;
  onUpdate: (content: string) => void;
  onEditorReady?: (editor: Editor) => void;
}

export function TiptapEditor({ content, onUpdate, onEditorReady }: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
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
