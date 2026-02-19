/**
 * ChatMessage — Re-exports the shared ChatMessage from @protolabs/ui/ai.
 *
 * All chat message primitives (ChatMessage, ChatMessageAvatar, ChatMessageBubble,
 * ChatMessageMarkdown) are maintained in the shared library for reuse
 * across sidebar chat, Ava Anywhere overlay, and future chat surfaces.
 */

export {
  ChatMessage,
  ChatMessageAvatar,
  ChatMessageBubble,
  ChatMessageMarkdown,
} from '@protolabs/ui/ai';
