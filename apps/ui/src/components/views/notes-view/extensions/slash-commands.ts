/**
 * Slash Commands Extension — type / to open a command palette
 *
 * Uses @tiptap/suggestion to detect "/" trigger and render a popup
 * with AI commands and formatting shortcuts.
 */

import { Extension } from '@tiptap/core';
import { type Editor } from '@tiptap/core';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';

export interface SlashCommandItem {
  id: string;
  label: string;
  description: string;
  icon: string;
  category: 'ai' | 'format';
  command: (editor: Editor) => void;
}

/** AI commands that call /api/ai/generate */
function createAICommand(commandId: string): (editor: Editor) => void {
  return (editor: Editor) => {
    // Dispatch a custom event that the React component will listen for
    const event = new CustomEvent('slash-command-ai', {
      detail: { command: commandId, editor },
    });
    window.dispatchEvent(event);
  };
}

export const SLASH_COMMAND_ITEMS: SlashCommandItem[] = [
  // AI commands
  {
    id: 'continue',
    label: 'Continue writing',
    description: 'AI continues from where you left off',
    icon: '✏️',
    category: 'ai',
    command: createAICommand('continue'),
  },
  {
    id: 'summarize',
    label: 'Summarize',
    description: 'Summarize the document so far',
    icon: '📋',
    category: 'ai',
    command: createAICommand('summarize'),
  },
  {
    id: 'expand',
    label: 'Expand',
    description: 'Expand with more detail',
    icon: '📝',
    category: 'ai',
    command: createAICommand('expand'),
  },
  {
    id: 'fix-grammar',
    label: 'Fix grammar',
    description: 'Fix grammar and spelling',
    icon: '🔤',
    category: 'ai',
    command: createAICommand('fix-grammar'),
  },
  {
    id: 'translate',
    label: 'Translate',
    description: 'Translate to/from English',
    icon: '🌐',
    category: 'ai',
    command: createAICommand('translate'),
  },
  // Formatting commands
  {
    id: 'h1',
    label: 'Heading 1',
    description: 'Large heading',
    icon: 'H1',
    category: 'format',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: 'h2',
    label: 'Heading 2',
    description: 'Medium heading',
    icon: 'H2',
    category: 'format',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: 'h3',
    label: 'Heading 3',
    description: 'Small heading',
    icon: 'H3',
    category: 'format',
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: 'bullet',
    label: 'Bullet list',
    description: 'Unordered list',
    icon: '•',
    category: 'format',
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'ordered',
    label: 'Numbered list',
    description: 'Ordered list',
    icon: '1.',
    category: 'format',
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: 'code',
    label: 'Code block',
    description: 'Fenced code block',
    icon: '<>',
    category: 'format',
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: 'quote',
    label: 'Blockquote',
    description: 'Indented quote',
    icon: '❝',
    category: 'format',
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'hr',
    label: 'Divider',
    description: 'Horizontal rule',
    icon: '—',
    category: 'format',
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
];

export type SlashCommandSuggestionOptions = Omit<SuggestionOptions<SlashCommandItem>, 'editor'>;

export const SlashCommands = Extension.create<{
  suggestion: Partial<SlashCommandSuggestionOptions>;
}>({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        items: ({ query }: { query: string }) => {
          const lower = query.toLowerCase();
          return SLASH_COMMAND_ITEMS.filter(
            (item) =>
              item.label.toLowerCase().includes(lower) ||
              item.description.toLowerCase().includes(lower) ||
              item.id.includes(lower)
          ).slice(0, 10);
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      } as SuggestionOptions<SlashCommandItem>),
    ];
  },
});
