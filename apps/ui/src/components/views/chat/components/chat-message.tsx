/**
 * ChatMessage — Message bubble for user and assistant messages.
 *
 * Renders message parts (text, reasoning) with role-based styling.
 * Uses composition: ChatMessage wraps ChatMessageBubble children.
 */

import { cva } from 'class-variance-authority';
import { Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import type { UIMessage } from 'ai';
import { cn } from '@/lib/utils';

const messageVariants = cva('flex gap-3 px-4 py-2', {
  variants: {
    role: {
      user: 'flex-row-reverse',
      assistant: 'flex-row',
      system: 'justify-center',
    },
  },
  defaultVariants: { role: 'assistant' },
});

const bubbleVariants = cva('rounded-lg px-3 py-2 text-sm max-w-[85%]', {
  variants: {
    role: {
      user: 'bg-primary text-primary-foreground ml-auto',
      assistant: 'bg-muted text-foreground mr-auto',
      system: 'bg-accent text-accent-foreground text-xs italic',
    },
  },
  defaultVariants: { role: 'assistant' },
});

const avatarVariants = cva('flex size-7 shrink-0 items-center justify-center rounded-full', {
  variants: {
    role: {
      user: 'bg-primary/20 text-primary',
      assistant: 'bg-primary text-primary-foreground',
      system: 'hidden',
    },
  },
  defaultVariants: { role: 'assistant' },
});

function ChatMessageAvatar({ role }: { role: 'user' | 'assistant' | 'system' }) {
  if (role === 'system') return null;
  return (
    <div data-slot="chat-message-avatar" className={avatarVariants({ role })}>
      {role === 'assistant' ? <Bot className="size-4" /> : <User className="size-4" />}
    </div>
  );
}

function ChatMessageBubble({
  role,
  children,
  className,
}: {
  role: 'user' | 'assistant' | 'system';
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div data-slot="chat-message-bubble" className={cn(bubbleVariants({ role }), className)}>
      {children}
    </div>
  );
}

function MessageMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      rehypePlugins={[rehypeRaw]}
      components={{
        a: ({ ...props }) => (
          <a
            {...props}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          />
        ),
        pre: ({ ...props }) => (
          <pre
            {...props}
            className="my-2 overflow-x-auto rounded-md bg-background/50 p-3 text-xs"
          />
        ),
        code: ({ ...props }) => (
          <code {...props} className="rounded bg-background/50 px-1 py-0.5 text-xs" />
        ),
      }}
      className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:mb-2 prose-headings:mt-3"
    >
      {content}
    </ReactMarkdown>
  );
}

export function ChatMessage({ message, className }: { message: UIMessage; className?: string }) {
  const role = message.role as 'user' | 'assistant' | 'system';

  // Extract text content from message parts
  const textContent = message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');

  if (!textContent) return null;

  return (
    <div data-slot="chat-message" className={cn(messageVariants({ role }), className)}>
      <ChatMessageAvatar role={role} />
      <ChatMessageBubble role={role}>
        {role === 'assistant' ? (
          <MessageMarkdown content={textContent} />
        ) : (
          <p className="whitespace-pre-wrap">{textContent}</p>
        )}
      </ChatMessageBubble>
    </div>
  );
}
