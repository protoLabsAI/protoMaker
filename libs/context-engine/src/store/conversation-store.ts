/**
 * ConversationStore — SQLite-backed persistence for conversations and messages.
 *
 * Tables:
 *   conversations  — top-level conversation threads
 *   messages       — individual turns (user/assistant/system/tool)
 *   message_parts  — structured content blocks within a message
 *
 * Token counting uses a simple ~4 chars/token heuristic which is accurate
 * enough for context-window budgeting without requiring an LLM round-trip.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as BetterSqlite3 from 'better-sqlite3';
import { createLogger } from '@protolabsai/utils';
import { runMigrations, getCurrentSchemaVersion } from './migrations.js';

const logger = createLogger('ConversationStore');

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type PartType = 'text' | 'tool_use' | 'tool_result' | 'image' | 'document';

export interface ConversationRow {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface MessagePartRow {
  id: string;
  messageId: string;
  type: PartType;
  content: string;
  tokens: number;
  position: number;
  metadata: Record<string, unknown>;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  role: MessageRole;
  totalTokens: number;
  createdAt: string;
  metadata: Record<string, unknown>;
  parts: MessagePartRow[];
}

// Input types for creation

export interface CreateConversationInput {
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePartInput {
  type: PartType;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface CreateMessageInput {
  role: MessageRole;
  parts: CreatePartInput[];
  metadata?: Record<string, unknown>;
}

// Retrieval options

export interface ListMessagesOptions {
  /** Maximum number of messages to return (default: 50) */
  limit?: number;
  /** Number of messages to skip (default: 0) */
  offset?: number;
  /** If true, return newest messages first (default: false — oldest first) */
  reverse?: boolean;
}

// Raw DB row shapes (snake_case from SQLite)

interface DbConversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  metadata: string;
}

interface DbMessage {
  id: string;
  conversation_id: string;
  role: string;
  total_tokens: number;
  created_at: string;
  metadata: string;
}

interface DbMessagePart {
  id: string;
  message_id: string;
  type: string;
  content: string;
  tokens: number;
  position: number;
  metadata: string;
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Estimates the number of tokens in a string using a 4-chars/token heuristic.
 * Suitable for context-window budgeting; not a substitute for a real tokenizer.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// ConversationStore
// ---------------------------------------------------------------------------

export class ConversationStore {
  private db: BetterSqlite3.Database | null = null;
  private dbPath: string | null = null;

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Opens (or creates) the SQLite database at the given path and runs any
   * pending migrations.  Safe to call multiple times — subsequent calls are
   * no-ops if the same path is already open.
   */
  open(dbPath: string): void {
    if (this.db && this.dbPath === dbPath) {
      return; // already open at the same path
    }

    if (this.db) {
      this.close();
    }

    // Ensure parent directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    logger.info(`Opening conversation store at ${dbPath}`);
    this.db = new BetterSqlite3.default(dbPath);
    this.dbPath = dbPath;

    // Performance pragmas
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('synchronous = NORMAL');

    // Apply pending schema migrations
    runMigrations(this.db);

    const version = getCurrentSchemaVersion(this.db);
    logger.info(`Schema at version ${version}`);
  }

  /**
   * Closes the database connection.  Subsequent operations will throw until
   * `open()` is called again.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.dbPath = null;
      logger.info('Conversation store closed');
    }
  }

  private requireDb(): BetterSqlite3.Database {
    if (!this.db) {
      throw new Error('ConversationStore is not open. Call open(dbPath) first.');
    }
    return this.db;
  }

  // ---------------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------------

  /**
   * Creates a new conversation and returns it.
   */
  createConversation(input: CreateConversationInput = {}): ConversationRow {
    const db = this.requireDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    const metadata = JSON.stringify(input.metadata ?? {});

    db.prepare(
      `INSERT INTO conversations (id, title, created_at, updated_at, metadata)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, input.title ?? null, now, now, metadata);

    return this.getConversation(id)!;
  }

  /**
   * Returns a conversation by id, or null if not found.
   */
  getConversation(id: string): ConversationRow | null {
    const db = this.requireDb();
    const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
      | DbConversation
      | undefined;

    return row ? this.mapConversation(row) : null;
  }

  /**
   * Lists all conversations ordered by updated_at descending.
   */
  listConversations(limit = 50, offset = 0): ConversationRow[] {
    const db = this.requireDb();
    const rows = db
      .prepare('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ? OFFSET ?')
      .all(limit, offset) as DbConversation[];

    return rows.map((r) => this.mapConversation(r));
  }

  /**
   * Updates a conversation's title and/or metadata.
   */
  updateConversation(
    id: string,
    patch: Partial<Pick<ConversationRow, 'title' | 'metadata'>>
  ): ConversationRow | null {
    const db = this.requireDb();
    const existing = this.getConversation(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const title = 'title' in patch ? (patch.title ?? null) : existing.title;
    const metadata = JSON.stringify(patch.metadata ?? existing.metadata);

    db.prepare(
      `UPDATE conversations
       SET title = ?, metadata = ?, updated_at = ?
       WHERE id = ?`
    ).run(title, metadata, now, id);

    return this.getConversation(id);
  }

  /**
   * Deletes a conversation and all its messages/parts (CASCADE).
   */
  deleteConversation(id: string): boolean {
    const db = this.requireDb();
    const result = db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  /**
   * Appends a message (with structured parts) to a conversation.
   * Token counts are estimated from part content and stored per part and summed
   * on the message row.
   *
   * Also bumps `conversations.updated_at` so the conversation bubbles to the
   * top of recency-ordered lists.
   */
  createMessage(conversationId: string, input: CreateMessageInput): MessageRow {
    const db = this.requireDb();

    // Verify conversation exists
    if (!this.getConversation(conversationId)) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const messageId = randomUUID();
    const now = new Date().toISOString();
    const messageMetadata = JSON.stringify(input.metadata ?? {});

    // Estimate tokens per part and sum for message total
    const partsWithTokens = input.parts.map((p, i) => ({
      id: randomUUID(),
      type: p.type,
      content: p.content,
      tokens: estimateTokens(p.content),
      position: i,
      metadata: JSON.stringify(p.metadata ?? {}),
    }));

    const totalTokens = partsWithTokens.reduce((sum, p) => sum + p.tokens, 0);

    const insertMessage = db.prepare(
      `INSERT INTO messages (id, conversation_id, role, total_tokens, created_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    const insertPart = db.prepare(
      `INSERT INTO message_parts (id, message_id, type, content, tokens, position, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    const touchConversation = db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?');

    const insert = db.transaction(() => {
      insertMessage.run(messageId, conversationId, input.role, totalTokens, now, messageMetadata);

      for (const part of partsWithTokens) {
        insertPart.run(
          part.id,
          messageId,
          part.type,
          part.content,
          part.tokens,
          part.position,
          part.metadata
        );
      }

      touchConversation.run(now, conversationId);
    });

    insert();

    return this.getMessage(messageId)!;
  }

  /**
   * Returns a single message (with parts), or null if not found.
   */
  getMessage(messageId: string): MessageRow | null {
    const db = this.requireDb();
    const msgRow = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as
      | DbMessage
      | undefined;

    if (!msgRow) return null;

    const partRows = db
      .prepare('SELECT * FROM message_parts WHERE message_id = ? ORDER BY position ASC')
      .all(messageId) as DbMessagePart[];

    return this.mapMessage(msgRow, partRows);
  }

  /**
   * Returns messages for a conversation in chronological order (oldest first
   * by default), with optional pagination.
   */
  listMessages(conversationId: string, options: ListMessagesOptions = {}): MessageRow[] {
    const db = this.requireDb();
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const order = options.reverse ? 'DESC' : 'ASC';

    const msgRows = db
      .prepare(
        `SELECT * FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at ${order}
         LIMIT ? OFFSET ?`
      )
      .all(conversationId, limit, offset) as DbMessage[];

    if (msgRows.length === 0) return [];

    // Batch-load all parts for these messages in a single query
    const ids = msgRows.map((m) => m.id);
    const placeholders = ids.map(() => '?').join(',');
    const partRows = db
      .prepare(
        `SELECT * FROM message_parts
         WHERE message_id IN (${placeholders})
         ORDER BY message_id, position ASC`
      )
      .all(...ids) as DbMessagePart[];

    // Group parts by message_id
    const partsByMessage = new Map<string, DbMessagePart[]>();
    for (const part of partRows) {
      const bucket = partsByMessage.get(part.message_id) ?? [];
      bucket.push(part);
      partsByMessage.set(part.message_id, bucket);
    }

    return msgRows.map((m) => this.mapMessage(m, partsByMessage.get(m.id) ?? []));
  }

  /**
   * Deletes a message and all its parts.
   */
  deleteMessage(messageId: string): boolean {
    const db = this.requireDb();
    const result = db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
    return result.changes > 0;
  }

  // ---------------------------------------------------------------------------
  // Token utilities
  // ---------------------------------------------------------------------------

  /**
   * Returns the total token count for all messages in a conversation.
   * Useful for context-window budgeting before truncation/compaction.
   */
  getTotalTokens(conversationId: string): number {
    const db = this.requireDb();
    const row = db
      .prepare(
        'SELECT COALESCE(SUM(total_tokens), 0) AS total FROM messages WHERE conversation_id = ?'
      )
      .get(conversationId) as { total: number } | undefined;
    return row?.total ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Mapping helpers
  // ---------------------------------------------------------------------------

  private mapConversation(row: DbConversation): ConversationRow {
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: this.parseJson(row.metadata),
    };
  }

  private mapMessage(row: DbMessage, partRows: DbMessagePart[]): MessageRow {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role as MessageRole,
      totalTokens: row.total_tokens,
      createdAt: row.created_at,
      metadata: this.parseJson(row.metadata),
      parts: partRows.map((p) => this.mapPart(p)),
    };
  }

  private mapPart(row: DbMessagePart): MessagePartRow {
    return {
      id: row.id,
      messageId: row.message_id,
      type: row.type as PartType,
      content: row.content,
      tokens: row.tokens,
      position: row.position,
      metadata: this.parseJson(row.metadata),
    };
  }

  private parseJson(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
