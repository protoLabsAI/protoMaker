/**
 * AvaChannelService — manages the private multi-instance Ava communication channel.
 *
 * Messages are stored in daily-sharded CRDT documents (ava-channel/YYYY-MM-DD)
 * and synced across the mesh via CrdtSyncService. The channel is append-only:
 * messages are never edited or deleted.
 */

import { randomUUID } from 'node:crypto';
import { createLogger } from '@protolabsai/utils';
import type {
  AvaChatMessage,
  AvaChatRole,
  GetMessagesOptions,
  PostMessageOptions,
} from '@protolabsai/types';

const logger = createLogger('AvaChannelService');

/** In-memory message store keyed by date shard (YYYY-MM-DD) */
type MessageStore = Map<string, AvaChatMessage[]>;

function todayShard(): string {
  return new Date().toISOString().slice(0, 10);
}

export class AvaChannelService {
  private readonly store: MessageStore = new Map();

  /**
   * Post a message to the Ava Channel.
   *
   * @param content  - Message text (plain text or markdown)
   * @param role     - Sender role (system, user, assistant, agent)
   * @param sender   - Human-readable sender name
   * @param instanceId - Originating mesh instance
   * @param metadata - Optional structured metadata
   */
  postMessage(
    content: string,
    role: AvaChatRole | string,
    sender: string,
    instanceId: string,
    metadata?: Record<string, unknown>
  ): AvaChatMessage {
    const date = todayShard();
    const message: AvaChatMessage = {
      id: randomUUID(),
      content,
      role: role as AvaChatRole,
      sender,
      instanceId,
      timestamp: new Date().toISOString(),
      metadata,
    };

    const shard = this.store.get(date) ?? [];
    shard.push(message);
    this.store.set(date, shard);

    logger.info(`[AvaChannel] ${role}@${instanceId}: ${content.slice(0, 120)}`);
    return message;
  }

  /**
   * Post a message with full options object.
   */
  post(
    content: string,
    context: { instanceId: string; sender: string; role: AvaChatRole },
    options?: PostMessageOptions
  ): AvaChatMessage {
    return this.postMessage(
      content,
      context.role,
      context.sender,
      context.instanceId,
      options?.metadata
    );
  }

  /**
   * Retrieve messages from a single date shard.
   */
  getMessages(options?: GetMessagesOptions): AvaChatMessage[] {
    const date = options?.date ?? todayShard();
    const shard = this.store.get(date) ?? [];

    let messages = shard;

    if (options?.after) {
      const afterTime = new Date(options.after).getTime();
      messages = messages.filter((m) => new Date(m.timestamp).getTime() > afterTime);
    }

    if (options?.limit && options.limit > 0) {
      messages = messages.slice(-options.limit);
    }

    return messages;
  }

  /**
   * Ingest a message received from a remote peer (CRDT sync).
   * Skips duplicates by message ID.
   */
  ingestRemoteMessage(message: AvaChatMessage): boolean {
    const date = message.timestamp.slice(0, 10);
    const shard = this.store.get(date) ?? [];

    if (shard.some((m) => m.id === message.id)) {
      return false; // duplicate
    }

    shard.push(message);
    shard.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    this.store.set(date, shard);
    return true;
  }

  /**
   * Get all available date shards.
   */
  getAvailableDates(): string[] {
    return [...this.store.keys()].sort();
  }
}
