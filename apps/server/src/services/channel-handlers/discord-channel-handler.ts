/**
 * Channel Handler Interface and Implementations
 *
 * Channel handlers route pipeline gate holds and HITL form requests back
 * to the channel where the originating signal came from (Discord, UI, etc.).
 *
 * When a pipeline gate is hit for a Discord-sourced feature, the
 * DiscordChannelHandler posts a gate-hold message to the originating channel
 * with ✅/❌ reaction instructions. The UIChannelHandler is a no-op fallback
 * since the pipeline:gate-waiting event already notifies the UI directly.
 */

import { createLogger } from '@protolabs-ai/utils';
import type { DiscordBotService } from '../discord-bot-service.js';

const logger = createLogger('ChannelHandler');

/** Parameters for a gate hold approval request */
export interface GateHoldRequest {
  featureId: string;
  projectPath: string;
  featureTitle?: string;
  channelId: string;
  phase?: string;
}

/** Parameters for a HITL form sent via channel */
export interface HITLFormChannelParams {
  featureId: string;
  projectPath: string;
  questions: string[];
  channelId: string;
}

/**
 * ChannelHandler — routes gate holds and HITL forms to the correct channel.
 */
export interface ChannelHandler {
  /** Post a gate-hold message requesting ✅/❌ approval */
  requestApproval(params: GateHoldRequest): Promise<void>;
  /** Post form questions and capture the first reply as the response */
  sendHITLForm(params: HITLFormChannelParams): Promise<Record<string, unknown>>;
  /** Edit the gate message to show resolved status (no longer awaiting approval) */
  cancelPending(featureId: string): Promise<void>;
}

/**
 * UIChannelHandler — no-op fallback for features without a Discord channel.
 *
 * The pipeline:gate-waiting event is already emitted by PipelineOrchestrator and
 * the frontend renders the gate in the board UI, so no additional notification
 * is needed here.
 */
export class UIChannelHandler implements ChannelHandler {
  async requestApproval(params: GateHoldRequest): Promise<void> {
    logger.info(`Gate hold for feature ${params.featureId} — no channel, UI will render gate`);
  }

  async sendHITLForm(params: HITLFormChannelParams): Promise<Record<string, unknown>> {
    logger.info(`HITL form for feature ${params.featureId} — no channel, UI form pending`);
    return {};
  }

  async cancelPending(featureId: string): Promise<void> {
    logger.info(`Gate resolved for feature ${featureId} — no Discord message to edit`);
  }
}

/**
 * DiscordChannelHandler — routes gate holds back to the originating Discord channel.
 *
 * requestApproval(): Posts a gate-hold message to the originating channel with
 * ✅/❌ reaction instructions. Stores the messageId in DiscordBotService's pending
 * gate map keyed by featureId. The existing handleReaction() path in
 * DiscordBotService calls the registered gate resolver when a reaction is added.
 *
 * sendHITLForm(): Creates a Discord thread on the gate message and posts the
 * form questions. Waits up to 5 minutes for the first human reply, then
 * returns the reply content as the form response.
 *
 * cancelPending(): Edits the gate message to show "✅ Resolved" status.
 */
export class DiscordChannelHandler implements ChannelHandler {
  constructor(private readonly discordBotService: DiscordBotService) {}

  async requestApproval(params: GateHoldRequest): Promise<void> {
    const { featureId, projectPath, featureTitle, channelId, phase } = params;
    const messageId = await this.discordBotService.postGateHoldMessage(
      channelId,
      featureId,
      projectPath,
      featureTitle,
      phase
    );
    if (messageId) {
      logger.info(
        `Gate hold message posted for feature ${featureId} in channel ${channelId} (msg: ${messageId})`
      );
    } else {
      logger.warn(
        `Failed to post gate hold message for feature ${featureId} in channel ${channelId}`
      );
    }
  }

  async sendHITLForm(params: HITLFormChannelParams): Promise<Record<string, unknown>> {
    const { featureId, questions, channelId } = params;

    // Try to attach the form as a thread on the existing gate message
    const gateMessageId = this.discordBotService.getGateMessageId(featureId);
    const gateChannelId = this.discordBotService.getGateMessageChannelId(featureId) || channelId;

    let threadId: string | null = null;
    if (gateMessageId) {
      threadId = await this.discordBotService.createThread(
        gateChannelId,
        gateMessageId,
        `Form: ${featureId}`
      );
    }

    const targetChannelId = threadId || gateChannelId;

    // Post form questions
    const questionText = questions.map((q, i) => `**${i + 1}.** ${q}`).join('\n');
    const formMessage = [
      `📋 **Form Request** — Feature \`${featureId}\``,
      `Please reply with your answers:\n`,
      questionText,
    ].join('\n');

    const sent = await this.discordBotService.sendToChannel(targetChannelId, formMessage);
    if (!sent) {
      logger.warn(`Failed to send HITL form for feature ${featureId}`);
      return {};
    }

    // Wait for first human reply in the thread (5-minute timeout)
    const reply = await this.discordBotService.waitForReply(targetChannelId, 5 * 60 * 1000);
    if (reply === null) {
      logger.warn(`HITL form timed out for feature ${featureId}`);
      return {};
    }

    logger.info(`Received HITL form reply for feature ${featureId}: "${reply.slice(0, 80)}..."`);
    return { response: reply };
  }

  async cancelPending(featureId: string): Promise<void> {
    await this.discordBotService.editGateMessage(
      featureId,
      `~~🚦 Gate Hold~~ — ✅ **Resolved**\nThis gate has been resolved.`
    );
    logger.info(`Gate message resolved for feature ${featureId}`);
  }
}
