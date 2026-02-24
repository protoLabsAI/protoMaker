import { useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  CodeSquare,
  Eye,
  EyeOff,
  Undo2,
  Redo2,
  Underline as UnderlineIcon,
  Highlighter,
  Link as LinkIcon,
  ListTodo,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@protolabs-ai/ui/atoms';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@protolabs-ai/ui/atoms';
import type { NoteTabPermissions } from '@protolabs-ai/types';

interface NotesToolbarProps {
  editor: Editor | null;
  permissions: NoteTabPermissions;
  onToggleAgentRead: () => void;
}

function ToolbarButton({
  active,
  onClick,
  title,
  shortcut,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  shortcut?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('size-7', active && 'bg-accent text-accent-foreground')}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span>{title}</span>
        {shortcut && <kbd className="ml-1.5 text-[10px] text-muted-foreground">{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

export function NotesToolbar({ editor, permissions, onToggleAgentRead }: NotesToolbarProps) {
  if (!editor) return null;

  const handleLinkToggle = useCallback(() => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt('URL');
    if (url) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  }, [editor]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5 border-b border-border px-2 py-1">
        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          title="Undo"
          shortcut="⌘Z"
        >
          <Undo2 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          title="Redo"
          shortcut="⇧⌘Z"
        >
          <Redo2 className="size-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border" />

        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
          shortcut="⌘B"
        >
          <Bold className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
          shortcut="⌘I"
        >
          <Italic className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
          shortcut="⌘⇧S"
        >
          <Strikethrough className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline"
          shortcut="⌘U"
        >
          <UnderlineIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Inline code"
          shortcut="⌘E"
        >
          <Code className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('highlight')}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          title="Highlight"
          shortcut="⌘⇧H"
        >
          <Highlighter className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('link')}
          onClick={handleLinkToggle}
          title="Link"
          shortcut="⌘K"
        >
          <LinkIcon className="size-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border" />

        <ToolbarButton
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
        >
          <Heading1 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          <Heading2 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
        >
          <Heading3 className="size-3.5" />
        </ToolbarButton>

        <div className="mx-1 h-4 w-px bg-border" />

        <ToolbarButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          <List className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Ordered list"
        >
          <ListOrdered className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('taskList')}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          title="Task list"
        >
          <ListTodo className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Blockquote"
        >
          <Quote className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          title="Code block"
        >
          <CodeSquare className="size-3.5" />
        </ToolbarButton>

        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'size-7',
                permissions.agentRead ? 'text-primary' : 'text-muted-foreground'
              )}
              onClick={onToggleAgentRead}
            >
              {permissions.agentRead ? (
                <Eye className="size-3.5" />
              ) : (
                <EyeOff className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {permissions.agentRead ? 'AI can read this tab' : 'AI cannot read this tab'}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
