/**
 * @protolabsai/context-engine
 *
 * Conversation storage and context management for AutoMaker agents.
 *
 * ## Quick start
 *
 * ```typescript
 * import { ConversationStore } from '@protolabsai/context-engine';
 *
 * const store = new ConversationStore();
 * store.open('/path/to/conversations.db');
 *
 * const conv = store.createConversation({ title: 'My session' });
 *
 * store.createMessage(conv.id, {
 *   role: 'user',
 *   parts: [{ type: 'text', content: 'Hello!' }],
 * });
 *
 * const messages = store.listMessages(conv.id);
 * store.close();
 * ```
 */

export * from './store/index.js';
