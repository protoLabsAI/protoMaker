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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@protolabs/ui/atoms';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@protolabs/ui/atoms';
import type { NoteTabPermissions } from '@automaker/types';

interface NotesToolbarProps {
  editor: Editor | null;
  permissions: NoteTabPermissions;
  onToggleAgentRead: () => void;
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
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
      <TooltipContent side="bottom">{title}</TooltipContent>
    </Tooltip>
  );
}

export function NotesToolbar({ editor, permissions, onToggleAgentRead }: NotesToolbarProps) {
  if (!editor) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-0.5 border-b border-border px-2 py-1">
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <Bold className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <Italic className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <Strikethrough className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Inline code"
        >
          <Code className="size-3.5" />
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
