/**
 * InlineEditor — Click-to-edit rich text field using TipTap.
 *
 * Renders as readable text. Click to activate editing. Blur to save.
 * Minimal toolbar-free experience for inline property editing.
 */

import { useCallback, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Markdown } from 'tiptap-markdown';
import { cn } from '@/lib/utils';

interface InlineEditorProps {
  /** Content string (plain text, HTML, or markdown depending on mode) */
  content: string;
  /** Called with updated content on blur */
  onSave: (content: string) => void;
  /** Called on every edit (for debounced auto-save) */
  onChange?: (content: string) => void;
  /** Placeholder when empty */
  placeholder?: string;
  /** Additional className for the wrapper */
  className?: string;
  /** Whether the field is currently saving */
  isSaving?: boolean;
  /** Render as single-line (no Enter key) */
  singleLine?: boolean;
  /** Enable markdown mode — adds Link, TaskList, Markdown extensions */
  markdown?: boolean;
}

export function InlineEditor({
  content,
  onSave,
  onChange,
  placeholder = 'Click to edit...',
  className,
  isSaving,
  singleLine,
  markdown,
}: InlineEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const savedContentRef = useRef(content);

  const getContent = useCallback(
    (ed: ReturnType<typeof useEditor>) => {
      if (!ed) return '';
      return markdown ? ed.storage.markdown.getMarkdown() : ed.getText();
    },
    [markdown]
  );

  const extensions = [
    StarterKit.configure({
      codeBlock: false,
      horizontalRule: false,
      ...(singleLine
        ? { heading: false, bulletList: false, orderedList: false, blockquote: false }
        : {}),
    }),
    Placeholder.configure({ placeholder }),
    ...(markdown
      ? [
          Link.configure({
            openOnClick: true,
            HTMLAttributes: { class: 'text-[var(--status-info)] hover:underline' },
          }),
          TaskList,
          TaskItem.configure({ nested: true }),
          Markdown,
        ]
      : []),
  ];

  const editor = useEditor({
    extensions,
    content: content || '',
    editable: false,
    onBlur: ({ editor: ed }) => {
      const text = getContent(ed);
      if (text !== savedContentRef.current) {
        savedContentRef.current = text;
        onSave(text);
      }
      ed.setEditable(false);
      setIsEditing(false);
    },
    onUpdate: ({ editor: ed }) => {
      if (onChange) {
        onChange(getContent(ed));
      }
    },
  });

  const handleClick = useCallback(() => {
    if (!editor || isEditing || isSaving) return;
    editor.setEditable(true);
    setIsEditing(true);
    requestAnimationFrame(() => {
      editor.commands.focus('end');
    });
  }, [editor, isEditing, isSaving]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (singleLine && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        editor?.commands.blur();
      }
      if (e.key === 'Escape') {
        editor?.commands.setContent(savedContentRef.current);
        editor?.commands.blur();
      }
    },
    [editor, singleLine]
  );

  // Sync external content changes
  if (editor && !isEditing && content !== savedContentRef.current) {
    savedContentRef.current = content;
    editor.commands.setContent(content);
  }

  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'rounded-md transition-colors cursor-text px-2 py-1.5 border border-transparent',
        isEditing ? 'border-ring bg-background' : 'hover:bg-muted/50',
        isSaving && 'opacity-50 pointer-events-none',
        '[&_.tiptap]:outline-none',
        '[&_.tiptap_p]:my-0',
        '[&_.tiptap_.is-editor-empty:first-child::before]:text-muted-foreground/50',
        '[&_.tiptap_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
        '[&_.tiptap_.is-editor-empty:first-child::before]:float-left',
        '[&_.tiptap_.is-editor-empty:first-child::before]:h-0',
        '[&_.tiptap_.is-editor-empty:first-child::before]:pointer-events-none',
        className
      )}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
