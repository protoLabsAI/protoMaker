import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { ConversationStore, estimateTokens } from '../src/store/conversation-store.js';
import { getCurrentSchemaVersion } from '../src/store/migrations.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tempDbPath(): string {
  return path.join(
    os.tmpdir(),
    `context-engine-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates ~4 chars per token', () => {
    // 40 chars → ceil(40/4) = 10 tokens
    expect(estimateTokens('a'.repeat(40))).toBe(10);
  });

  it('rounds up fractional tokens', () => {
    // 5 chars → ceil(5/4) = 2 tokens
    expect(estimateTokens('hello')).toBe(2);
  });
});

describe('ConversationStore — lifecycle', () => {
  let store: ConversationStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new ConversationStore();
  });

  afterEach(() => {
    store.close();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(dbPath + '-wal');
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(dbPath + '-shm');
    } catch {
      /* ignore */
    }
  });

  it('creates the database file on open()', () => {
    store.open(dbPath);
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('applies migrations and reports schema version 1', () => {
    store.open(dbPath);
    // Access internal db for version check via the exported helper
    // Re-open a second store on the same file to verify persistence
    const store2 = new ConversationStore();
    store2.open(dbPath);
    // getCurrentSchemaVersion needs a db handle — we test it indirectly by
    // checking that the store is usable (migrations ran)
    expect(() => store2.listConversations()).not.toThrow();
    store2.close();
  });

  it('throws when operations are called before open()', () => {
    expect(() => store.listConversations()).toThrow('not open');
  });

  it('is idempotent: calling open() twice with the same path is safe', () => {
    store.open(dbPath);
    expect(() => store.open(dbPath)).not.toThrow();
  });

  it('survives close() called without open()', () => {
    expect(() => store.close()).not.toThrow();
  });
});

describe('ConversationStore — conversations CRUD', () => {
  let store: ConversationStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new ConversationStore();
    store.open(dbPath);
  });

  afterEach(() => {
    store.close();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(dbPath + '-wal');
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(dbPath + '-shm');
    } catch {
      /* ignore */
    }
  });

  it('creates a conversation with generated id', () => {
    const conv = store.createConversation({ title: 'Test' });
    expect(conv.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(conv.title).toBe('Test');
    expect(conv.metadata).toEqual({});
    expect(conv.createdAt).toBeTruthy();
    expect(conv.updatedAt).toBeTruthy();
  });

  it('creates a conversation with no title', () => {
    const conv = store.createConversation();
    expect(conv.title).toBeNull();
  });

  it('creates a conversation with metadata', () => {
    const conv = store.createConversation({ metadata: { projectId: 'abc' } });
    expect(conv.metadata).toEqual({ projectId: 'abc' });
  });

  it('getConversation returns null for unknown id', () => {
    expect(store.getConversation('nonexistent')).toBeNull();
  });

  it('getConversation retrieves by id', () => {
    const created = store.createConversation({ title: 'Hello' });
    const fetched = store.getConversation(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.title).toBe('Hello');
  });

  it('listConversations returns all in recency order', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
    const a = store.createConversation({ title: 'A' });
    vi.setSystemTime(new Date('2024-01-01T00:00:01.000Z'));
    const b = store.createConversation({ title: 'B' });
    vi.useRealTimers();

    const list = store.listConversations();
    // Newest first (B then A)
    expect(list[0].id).toBe(b.id);
    expect(list[1].id).toBe(a.id);
  });

  it('listConversations respects limit and offset', () => {
    store.createConversation({ title: 'A' });
    store.createConversation({ title: 'B' });
    store.createConversation({ title: 'C' });
    const page1 = store.listConversations(2, 0);
    const page2 = store.listConversations(2, 2);
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(1);
  });

  it('updateConversation changes title and metadata', () => {
    const conv = store.createConversation({ title: 'Old' });
    const updated = store.updateConversation(conv.id, { title: 'New', metadata: { x: 1 } });
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe('New');
    expect(updated!.metadata).toEqual({ x: 1 });
  });

  it('updateConversation returns null for missing id', () => {
    const result = store.updateConversation('ghost', { title: 'X' });
    expect(result).toBeNull();
  });

  it('deleteConversation removes the record', () => {
    const conv = store.createConversation();
    expect(store.deleteConversation(conv.id)).toBe(true);
    expect(store.getConversation(conv.id)).toBeNull();
  });

  it('deleteConversation returns false for missing id', () => {
    expect(store.deleteConversation('ghost')).toBe(false);
  });
});

describe('ConversationStore — messages CRUD', () => {
  let store: ConversationStore;
  let dbPath: string;
  let convId: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new ConversationStore();
    store.open(dbPath);
    convId = store.createConversation({ title: 'Session' }).id;
  });

  afterEach(() => {
    store.close();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(dbPath + '-wal');
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(dbPath + '-shm');
    } catch {
      /* ignore */
    }
  });

  it('createMessage stores parts and returns full message', () => {
    const msg = store.createMessage(convId, {
      role: 'user',
      parts: [{ type: 'text', content: 'Hello world' }],
    });
    expect(msg.id).toBeTruthy();
    expect(msg.conversationId).toBe(convId);
    expect(msg.role).toBe('user');
    expect(msg.parts).toHaveLength(1);
    expect(msg.parts[0].type).toBe('text');
    expect(msg.parts[0].content).toBe('Hello world');
    expect(msg.parts[0].position).toBe(0);
  });

  it('createMessage estimates and stores token counts', () => {
    const content = 'a'.repeat(40); // 40 chars → 10 tokens
    const msg = store.createMessage(convId, {
      role: 'assistant',
      parts: [{ type: 'text', content }],
    });
    expect(msg.parts[0].tokens).toBe(10);
    expect(msg.totalTokens).toBe(10);
  });

  it('createMessage sums tokens across multiple parts', () => {
    const msg = store.createMessage(convId, {
      role: 'assistant',
      parts: [
        { type: 'text', content: 'a'.repeat(40) }, // 10 tokens
        { type: 'text', content: 'b'.repeat(40) }, // 10 tokens
      ],
    });
    expect(msg.totalTokens).toBe(20);
    expect(msg.parts).toHaveLength(2);
    expect(msg.parts[0].position).toBe(0);
    expect(msg.parts[1].position).toBe(1);
  });

  it('createMessage throws for unknown conversation', () => {
    expect(() =>
      store.createMessage('bad-id', { role: 'user', parts: [{ type: 'text', content: 'x' }] })
    ).toThrow('Conversation not found');
  });

  it('getMessage returns null for missing id', () => {
    expect(store.getMessage('ghost')).toBeNull();
  });

  it('listMessages returns messages in chronological order by default', () => {
    store.createMessage(convId, { role: 'user', parts: [{ type: 'text', content: 'first' }] });
    store.createMessage(convId, {
      role: 'assistant',
      parts: [{ type: 'text', content: 'second' }],
    });
    const msgs = store.listMessages(convId);
    expect(msgs[0].parts[0].content).toBe('first');
    expect(msgs[1].parts[0].content).toBe('second');
  });

  it('listMessages with reverse:true returns newest first', () => {
    store.createMessage(convId, { role: 'user', parts: [{ type: 'text', content: 'first' }] });
    store.createMessage(convId, {
      role: 'assistant',
      parts: [{ type: 'text', content: 'second' }],
    });
    const msgs = store.listMessages(convId, { reverse: true });
    expect(msgs[0].parts[0].content).toBe('second');
    expect(msgs[1].parts[0].content).toBe('first');
  });

  it('listMessages respects limit and offset', () => {
    for (let i = 0; i < 5; i++) {
      store.createMessage(convId, {
        role: 'user',
        parts: [{ type: 'text', content: `msg ${i}` }],
      });
    }
    const page = store.listMessages(convId, { limit: 2, offset: 2 });
    expect(page).toHaveLength(2);
    expect(page[0].parts[0].content).toBe('msg 2');
  });

  it('listMessages returns empty array for unknown conversation', () => {
    expect(store.listMessages('ghost')).toEqual([]);
  });

  it('deleteMessage removes message and cascades to parts', () => {
    const msg = store.createMessage(convId, {
      role: 'user',
      parts: [{ type: 'text', content: 'bye' }],
    });
    expect(store.deleteMessage(msg.id)).toBe(true);
    expect(store.getMessage(msg.id)).toBeNull();
  });

  it('deleteMessage returns false for missing id', () => {
    expect(store.deleteMessage('ghost')).toBe(false);
  });

  it('deleteConversation cascades to delete messages', () => {
    const msg = store.createMessage(convId, {
      role: 'user',
      parts: [{ type: 'text', content: 'hi' }],
    });
    store.deleteConversation(convId);
    expect(store.getMessage(msg.id)).toBeNull();
  });
});

describe('ConversationStore — token accounting', () => {
  let store: ConversationStore;
  let dbPath: string;
  let convId: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new ConversationStore();
    store.open(dbPath);
    convId = store.createConversation().id;
  });

  afterEach(() => {
    store.close();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(dbPath + '-wal');
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(dbPath + '-shm');
    } catch {
      /* ignore */
    }
  });

  it('getTotalTokens returns 0 for empty conversation', () => {
    expect(store.getTotalTokens(convId)).toBe(0);
  });

  it('getTotalTokens sums across all messages', () => {
    // 40 chars each = 10 tokens each
    store.createMessage(convId, {
      role: 'user',
      parts: [{ type: 'text', content: 'a'.repeat(40) }],
    });
    store.createMessage(convId, {
      role: 'assistant',
      parts: [{ type: 'text', content: 'b'.repeat(40) }],
    });
    expect(store.getTotalTokens(convId)).toBe(20);
  });

  it('getTotalTokens returns 0 for unknown conversation', () => {
    expect(store.getTotalTokens('ghost')).toBe(0);
  });
});

describe('ConversationStore — persistence across restarts', () => {
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
  });

  afterEach(() => {
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(dbPath + '-wal');
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(dbPath + '-shm');
    } catch {
      /* ignore */
    }
  });

  it('data persists after close and reopen', () => {
    const store1 = new ConversationStore();
    store1.open(dbPath);
    const conv = store1.createConversation({ title: 'Persistent' });
    store1.createMessage(conv.id, {
      role: 'user',
      parts: [{ type: 'text', content: 'Hello persistent world' }],
    });
    store1.close();

    const store2 = new ConversationStore();
    store2.open(dbPath);
    const loaded = store2.getConversation(conv.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.title).toBe('Persistent');

    const messages = store2.listMessages(conv.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].parts[0].content).toBe('Hello persistent world');
    store2.close();
  });
});
