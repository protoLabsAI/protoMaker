import type { Request, Response } from 'express';
import type { DiscordBotService } from '../../../services/discord-bot-service.js';

export function createAddReactionHandler(discordBotService: DiscordBotService) {
  return async (req: Request, res: Response) => {
    const { channelId, messageId, emoji } = req.body;

    if (!channelId || typeof channelId !== 'string') {
      res.status(400).json({ success: false, error: 'channelId is required' });
      return;
    }

    if (!messageId || typeof messageId !== 'string') {
      res.status(400).json({ success: false, error: 'messageId is required' });
      return;
    }

    if (!emoji || typeof emoji !== 'string') {
      res.status(400).json({ success: false, error: 'emoji is required' });
      return;
    }

    try {
      const success = await discordBotService.addReaction(channelId, messageId, emoji);
      res.json({ success });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: message });
    }
  };
}
