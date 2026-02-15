/**
 * DiscordSurface — ConversationSurface implementation for Discord
 *
 * Maps the ConversationSurface interface to Discord's channel/thread model.
 * Discord doesn't have native agent activities, documents, or plans —
 * instead we use:
 *
 * - Channel messages for responses
 * - Threads for multi-turn conversations
 * - Formatted text for structured choices (no native button support yet)
 * - Thread messages for progress/thought updates
 *
 * Session IDs map to Discord thread IDs. If no thread exists,
 * the session ID is the channel ID for single-message interactions.
 */

import type {
  ConversationSurface,
  SurfaceCapabilities,
  SurfaceChoiceOption,
  SurfaceDocument,
  SurfaceMessage,
  SurfacePlanStep,
} from '@automaker/types';
import type { DiscordBotService } from '../discord-bot-service.js';
import { createLogger } from '@automaker/utils';

const logger = createLogger('DiscordSurface');

/** Maps session IDs to Discord context */
interface DiscordSessionContext {
  channelId: string;
  threadId?: string;
  username?: string;
}

export class DiscordSurface implements ConversationSurface {
  readonly platform = 'discord' as const;

  readonly capabilities: SurfaceCapabilities = {
    structuredChoices: false, // No native button support from bot service
    documents: false, // Discord has no document API
    ephemeralProgress: true, // Can post progress messages in threads
    plans: false, // No native plan display
    multiTurn: true, // Thread-based conversations
    maxMessageLength: 2000, // Discord message limit
  };

  private sessions = new Map<string, DiscordSessionContext>();

  constructor(private bot: DiscordBotService) {}

  /**
   * Register a session with its Discord context.
   * Must be called before using other methods.
   */
  registerSession(sessionId: string, context: DiscordSessionContext): void {
    this.sessions.set(sessionId, context);
  }

  private getContext(sessionId: string): DiscordSessionContext {
    const ctx = this.sessions.get(sessionId);
    if (!ctx) {
      throw new Error(`No Discord context for session ${sessionId}`);
    }
    return ctx;
  }

  private getTargetChannel(ctx: DiscordSessionContext): string {
    return ctx.threadId || ctx.channelId;
  }

  // ─── Lifecycle Methods ───────────────────────────────────────

  async acknowledge(sessionId: string, message: string): Promise<void> {
    const ctx = this.getContext(sessionId);
    const targetId = this.getTargetChannel(ctx);
    await this.bot.sendToChannel(targetId, `💭 ${message}`);
  }

  async showProgress(sessionId: string, action: string, detail?: string): Promise<void> {
    const ctx = this.getContext(sessionId);
    const targetId = this.getTargetChannel(ctx);
    const msg = detail ? `⚙️ **${action}**: ${detail}` : `⚙️ **${action}**...`;
    await this.bot.sendToChannel(targetId, msg);
  }

  async askQuestion(
    sessionId: string,
    question: string,
    options?: SurfaceChoiceOption[]
  ): Promise<string> {
    const ctx = this.getContext(sessionId);
    const targetId = this.getTargetChannel(ctx);

    let message = `❓ ${question}`;

    // Format options as numbered list (Discord has no native select)
    if (options && options.length > 0) {
      message += '\n';
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        message += `\n**${i + 1}.** ${opt.label}`;
        if (opt.description) message += ` — ${opt.description}`;
      }
      message += '\n\n_Reply with the number of your choice._';
    }

    await this.bot.sendToChannel(targetId, this.truncate(message));
    // Discord doesn't return message IDs from sendToChannel
    return `discord-${sessionId}-${Date.now()}`;
  }

  async sendResponse(sessionId: string, body: string): Promise<string> {
    const ctx = this.getContext(sessionId);
    const targetId = this.getTargetChannel(ctx);

    // Split long responses into chunks
    const chunks = this.splitMessage(body);
    for (const chunk of chunks) {
      await this.bot.sendToChannel(targetId, chunk);
    }

    this.sessions.delete(sessionId);
    return `discord-${sessionId}-${Date.now()}`;
  }

  async reportError(sessionId: string, error: string): Promise<string> {
    const ctx = this.getContext(sessionId);
    const targetId = this.getTargetChannel(ctx);
    await this.bot.sendToChannel(targetId, `❌ **Error**: ${this.truncate(error)}`);
    this.sessions.delete(sessionId);
    return `discord-${sessionId}-${Date.now()}`;
  }

  // ─── Context Methods ─────────────────────────────────────────

  async getHistory(sessionId: string): Promise<SurfaceMessage[]> {
    const ctx = this.getContext(sessionId);
    const targetId = this.getTargetChannel(ctx);

    const messages = await this.bot.readMessages(targetId, 50);

    return messages.map((msg) => ({
      id: msg.id,
      role: msg.author.bot ? ('agent' as const) : ('user' as const),
      type: 'message' as const,
      content: msg.content,
      timestamp: msg.timestamp,
    }));
  }

  // ─── Documents (not supported) ──────────────────────────────

  // Discord doesn't have a document API.
  // These are intentionally not implemented (capabilities.documents = false).

  // ─── Plans (not supported) ──────────────────────────────────

  // Discord doesn't have native plan display.
  // Could be simulated with edited messages in the future.

  // ─── Helpers ─────────────────────────────────────────────────

  private truncate(text: string): string {
    if (text.length <= this.capabilities.maxMessageLength) return text;
    return text.substring(0, this.capabilities.maxMessageLength - 3) + '...';
  }

  private splitMessage(text: string): string[] {
    const limit = this.capabilities.maxMessageLength;
    if (text.length <= limit) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= limit) {
        chunks.push(remaining);
        break;
      }

      // Try to split at a newline near the limit
      let splitAt = remaining.lastIndexOf('\n', limit);
      if (splitAt < limit * 0.5) {
        // No good newline break — split at word boundary
        splitAt = remaining.lastIndexOf(' ', limit);
      }
      if (splitAt < limit * 0.3) {
        // No good break at all — hard split
        splitAt = limit;
      }

      chunks.push(remaining.substring(0, splitAt));
      remaining = remaining.substring(splitAt).trimStart();
    }

    return chunks;
  }
}
