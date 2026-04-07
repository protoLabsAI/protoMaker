/**
 * Agent Discord Router Service — disabled stub
 *
 * Agent-to-Discord message routing required reading Discord channel history and
 * creating threads, which are not available in webhook-only mode.
 * Interactive Discord flows are now routed through Workstacean.
 *
 * This stub preserves the class interface so services.ts compiles without changes.
 */

import { createLogger } from '@protolabsai/utils';
import type { EventEmitter } from '../lib/events.js';
import type { DiscordBotService } from './discord-bot-service.js';

const logger = createLogger('AgentDiscordRouter');

export class AgentDiscordRouter {
  constructor(_events: EventEmitter, _discordBot: DiscordBotService) {}

  /** No-op: agent-to-Discord routing is disabled in webhook mode. */
  start(): void {
    logger.info(
      'AgentDiscordRouter is disabled — interactive Discord routing handled by Workstacean'
    );
  }

  /** No-op. */
  stop(): void {}
}
